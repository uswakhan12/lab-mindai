import "dotenv/config";
import cors from "cors";
import express from "express";
import {
  initFeedbackStore,
  findSimilarReviews,
  getRecentReviews,
  getReviewsByDomain,
  saveReviewRecord,
} from "./feedback-store.js";
import { runScientificMechanisticValidation } from "./scientific-mechanistic.js";
import { computeExecutionReadiness } from "./execution-readiness.js";

const app = express();
const PORT = Number(process.env.PORT || 8080);
const TAVILY_URL = "https://api.tavily.com/search";
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
/** Tavily rejects queries longer than this (see API error: "Max query length is 400 characters"). */
const TAVILY_MAX_QUERY_LENGTH = 400;
const TAVILY_QUERY_SUFFIX = "\n\npapers protocols prior work";
const requestBuckets = new Map();

function clipQuery(text, max = TAVILY_MAX_QUERY_LENGTH) {
  const s = String(text).trim().replace(/\s+/g, " ");
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trimEnd()}…`;
}

function buildTavilySearchQuery(hypothesis) {
  const normalized = hypothesis.trim().replace(/\s+/g, " ");
  const suffix = TAVILY_QUERY_SUFFIX;
  const maxHypothesisChars = TAVILY_MAX_QUERY_LENGTH - suffix.length;
  if (normalized.length <= maxHypothesisChars) {
    return normalized + suffix;
  }
  const head = normalized.slice(0, Math.max(0, maxHypothesisChars - 1)).trimEnd();
  return `${head}…${suffix}`;
}

function inferDomainFromHypothesis(hypothesis) {
  const h = String(hypothesis || "").toLowerCase();
  if (/(hela|cell|cryoprotect|transfection|culture|q?pcr|western blot|assay)/.test(h)) return "cell_biology";
  if (/(mice|mouse|gut|microbiome|lactobacillus|intestinal)/.test(h)) return "gut_health";
  if (/(biosensor|electrochemical|diagnostic|crp|elisa|blood)/.test(h)) return "diagnostics";
  if (/(co2|bioelectrochemical|sporomusa|climate|acetate|cathode)/.test(h)) return "climate";
  return "general_biomedical";
}

function stripFeedbackForModel(item) {
  if (!item || typeof item !== "object") return item;
  const o = { ...item };
  for (const k of Object.keys(o)) if (k.startsWith("__")) delete o[k];
  return o;
}

function mergedFeedback(...lists) {
  const all = lists.flatMap((l) => (Array.isArray(l) ? l : []));
  all.sort((a, b) => {
    const weight = (x) => {
      const c = JSON.stringify(x?.corrections || {}).length + JSON.stringify(x?.issues || {}).length;
      const rating = Number(x?.overallRating);
      const low = Number.isFinite(rating) ? 5 - rating : 0;
      return c * 10 + low;
    };
    return weight(b) - weight(a);
  });
  const seen = new Set();
  const out = [];
  for (const raw of all) {
    const item = stripFeedbackForModel(raw);
    const sig = JSON.stringify({
      domain: item?.domain,
      corrections: item?.corrections,
      issues: item?.issues,
      overallRating: item?.overallRating,
      reviewerExpertise: item?.reviewerExpertise,
    });
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(item);
    if (out.length >= 14) break;
  }
  return out;
}

function readTenantId(req) {
  const t = String(req.headers["x-tenant-id"] || "").trim();
  return t.length > 0 ? t.slice(0, 64) : "default";
}

function requireLabmindApiKey(req, res, next) {
  if (process.env.NODE_ENV === "test") return next();
  const required = process.env.LABMIND_API_KEY?.trim();
  if (!required) return next();
  const auth = req.headers.authorization;
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const key = bearer || String(req.headers["x-api-key"] || "").trim();
  if (key !== required) {
    return res.status(401).json({
      error: "Unauthorized.",
      hint: "Send Authorization: Bearer <LABMIND_API_KEY> or x-api-key header.",
      requestId: res.locals.requestId,
    });
  }
  next();
}

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  res.locals.requestId = requestId;
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").split(",")[0].trim();
  const now = Date.now();
  const bucket = requestBuckets.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }
  bucket.count += 1;
  requestBuckets.set(ip, bucket);
  res.setHeader("x-request-id", requestId);
  if (bucket.count > RATE_LIMIT_MAX) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    res.setHeader("Retry-After", String(retryAfter));
    return res.status(429).json({ error: "Rate limit exceeded. Please retry shortly.", requestId });
  }
  const started = Date.now();
  res.on("finish", () => {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      latencyMs: Date.now() - started,
    }));
  });
  return next();
});

function inferNoveltySignal(resultsCount, topScore) {
  if (resultsCount === 0) return "not_found";
  if (topScore >= 0.9) return "exact_match";
  return "similar_exists";
}

function extractYear(publishedDate) {
  if (!publishedDate) return new Date().getFullYear();
  const year = Number.parseInt(String(publishedDate).slice(0, 4), 10);
  return Number.isFinite(year) ? year : new Date().getFullYear();
}

function buildNoveltyExplanation(signal, references) {
  if (signal === "not_found") {
    return "No closely matching protocol found in the quick scan. This may be novel and worth deeper review.";
  }
  if (signal === "exact_match") {
    return `An exact or near-exact protocol appears to exist (top result: ${references[0]?.title || "matched source"}).`;
  }
  return "Related studies exist, but no exact protocol match was found in this quick scan.";
}

function mapTavilyToQC(tavilyData) {
  const references = (tavilyData?.results || []).slice(0, 3).map((result) => {
    const snippet = (result?.content || "").trim();
    return {
      title: result?.title?.trim() || "Untitled source",
      authors: "Source metadata unavailable",
      journal: "Web source",
      year: extractYear(result?.published_date),
      doi: "N/A",
      relevance: snippet.length > 260 ? `${snippet.slice(0, 257)}...` : snippet || "No abstract snippet available.",
      url: result?.url?.trim() || "#",
      score: Number(result?.score || 0),
    };
  });

  const topScore = references.length > 0 ? Math.max(...references.map((r) => r.score)) : 0;
  const noveltySignal = inferNoveltySignal(references.length, topScore);

  return {
    noveltySignal,
    noveltyExplanation: buildNoveltyExplanation(noveltySignal, references),
    references,
  };
}

function hasMeaningfulReferences(references) {
  return Array.isArray(references) && references.some((r) => typeof r?.title === "string" && r.title.trim().length > 0);
}

function protocolRepositoryBonus(url) {
  const u = String(url || "").toLowerCase();
  if (u.includes("protocols.io")) return 0.11;
  if (u.includes("bio-protocol")) return 0.09;
  if (u.includes("nature.com") && u.includes("nprot")) return 0.09;
  if (u.includes("jove.com")) return 0.06;
  return 0;
}

function mergeTavilyResultRows(primary, secondary, limit = 6) {
  const merged = new Map();
  function ingest(rows, applyBonus) {
    for (const r of rows || []) {
      const url = String(r?.url || "").trim();
      if (!url) continue;
      const bonus = applyBonus ? protocolRepositoryBonus(url) : 0;
      const rawScore = typeof r?.score === "number" && Number.isFinite(r.score) ? r.score : 0;
      const adj = Math.min(0.99, rawScore + bonus);
      const prev = merged.get(url);
      if (!prev || adj > prev._adj) merged.set(url, { ...r, _adj: adj });
    }
  }
  ingest(secondary, true);
  ingest(primary, false);
  return Array.from(merged.values())
    .sort((a, b) => b._adj - a._adj)
    .slice(0, limit)
    .map(({ _adj, ...rest }) => ({
      ...rest,
      score: _adj,
    }));
}

async function tavilySearchRaw(apiKey, query, opts = {}) {
  const q = clipQuery(query);
  const max_results = opts.max_results ?? 4;
  const search_depth = opts.search_depth ?? "basic";
  const topic = opts.topic ?? "general";
  const body = {
    query: q,
    topic,
    search_depth,
    max_results,
    include_answer: false,
    include_raw_content: false,
  };
  if (Array.isArray(opts.include_domains) && opts.include_domains.length > 0) {
    body.include_domains = opts.include_domains.slice(0, 8);
  }
  const resp = await fetch(TAVILY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey.trim()}`,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) return [];
  const data = await resp.json();
  return Array.isArray(data?.results) ? data.results : [];
}

async function fetchMergedLiteratureRows(tavilyKey, hypothesis) {
  const normalized = hypothesis.trim().replace(/\s+/g, " ");
  const generalQ = buildTavilySearchQuery(hypothesis);
  const protoSeed = clipQuery(`${normalized.slice(0, 240)} methods protocol reproducibility`, TAVILY_MAX_QUERY_LENGTH - 40);
  const [generalRows, repoRows] = await Promise.all([
    tavilySearchRaw(tavilyKey, generalQ, { max_results: 5 }),
    tavilySearchRaw(tavilyKey, protoSeed, {
      max_results: 4,
      include_domains: ["protocols.io", "bio-protocol.org"],
    }).catch(() => []),
  ]);
  return mergeTavilyResultRows(generalRows, repoRows, 6);
}

function mapResultsToSources(results, limit = 2) {
  return results.slice(0, limit).map((r) => {
    const snippet = (r?.content || "").trim();
    return {
      title: r?.title?.trim() || "Source",
      url: r?.url?.trim() || "#",
      snippet: snippet.length > 220 ? `${snippet.slice(0, 217)}...` : snippet,
      score: typeof r?.score === "number" ? r.score : 0,
    };
  });
}

function normalizeConfidence(rawScore, fallback = 0.6) {
  if (typeof rawScore !== "number" || !Number.isFinite(rawScore) || rawScore <= 0) return fallback;
  // Tavily scores are often around 0.4-0.9; keep UI confidence inside a sane range.
  return Math.max(0.45, Math.min(0.95, rawScore));
}

function confidenceForStatus(status, rawScore, fallback = 0.6) {
  const base = normalizeConfidence(rawScore, fallback);
  if (status === "validated") {
    return Math.max(0.7, Math.min(0.98, base));
  }
  // weak_match must stay visibly lower-confidence by definition
  return Math.max(0.3, Math.min(0.69, base));
}

function buildVerificationQueries({ hypothesis, experimentTitle, domain, materials }) {
  const title = typeof experimentTitle === "string" && experimentTitle.trim().length > 0
    ? experimentTitle.trim()
    : "Laboratory experiment";
  const dom = typeof domain === "string" && domain.trim().length > 0 ? domain.trim() : "biomedical research";
  const matList = Array.isArray(materials)
    ? materials
        .slice(0, 8)
        .map((m) => (typeof m === "string" ? m : m?.item || m?.name || ""))
        .filter(Boolean)
        .join(", ")
    : "";
  const hypoShort = String(hypothesis || "").trim().replace(/\s+/g, " ").slice(0, 140);
  const materialQuerySeed = matList.length > 0 ? matList : title;
  return {
    protocol: `${title} ${dom} ${hypoShort} protocols.io bio-protocol laboratory methods peer-reviewed reproducibility`,
    materials: `${materialQuerySeed} research reagent supplier catalog technical datasheet product page`,
    budget: `${title} ${dom} research lab budget reagent pricing equipment core facility operating cost estimate`,
    timeline: `${title} wet lab experiment phases timeline schedule dependencies project planning`,
    validation: `${hypoShort} experimental validation QC assay statistical power sample size guidelines`,
    safety: `${materialQuerySeed} laboratory safety SDS GHS chemical hazardous waste biosafety procedures`,
  };
}

async function fetchVerificationSourcesFromTavily({ tavilyKey, hypothesis, experimentTitle, domain, materials }) {
  if (!tavilyKey) {
    return { protocol: [], materials: [], budget: [], timeline: [], validation: [], safety: [] };
  }
  const queries = buildVerificationQueries({ hypothesis, experimentTitle, domain, materials });
  const keys = ["protocol", "materials", "budget", "timeline", "validation", "safety"];
  const settled = await Promise.allSettled(
    keys.map((key) => tavilySearchRaw(tavilyKey, queries[key]).then((r) => [key, mapResultsToSources(r)])),
  );
  const sources = {};
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const out = settled[i];
    sources[key] = out.status === "fulfilled" ? out.value[1] : [];
  }
  return sources;
}

async function validateVerificationSourcesWithLlama8({ hypothesis, sources, llama8Model }) {
  const sections = ["protocol", "materials", "budget", "timeline", "validation", "safety"];
  const fallbackTagged = {};
  for (const section of sections) {
    const arr = Array.isArray(sources?.[section]) ? sources[section] : [];
    fallbackTagged[section] = arr.slice(0, 2).map((s) => ({
      title: s?.title || "Source",
      url: s?.url || "#",
      snippet: s?.snippet || "",
      validationStatus: "weak_match",
      confidence: normalizeConfidence(s?.score, 0.55),
    }));
  }
  if (!sources || typeof sources !== "object") return fallbackTagged;
  try {
    const prompt = `You are a strict scientific source relevance checker.
Given a hypothesis and source links grouped by section, return JSON:
{
  "protocol":[{"title":"string","url":"string","snippet":"string","validationStatus":"validated|weak_match","confidence":0.0}],
  "materials":[...],
  "budget":[...],
  "timeline":[...],
  "validation":[...],
  "safety":[...]
}
Rules:
- Keep only relevant links.
- Max 2 links per section.
- If unsure, keep as weak_match with lower confidence.

Hypothesis:
${hypothesis}

Candidate sources:
${JSON.stringify(sources).slice(0, 80000)}
`;
    const raw = await chatLlama({
      model: llama8Model,
      system: "You validate whether source links are relevant to experiment plan sections. Return strict JSON only.",
      user: prompt,
      temperature: 0.1,
    });
    const parsed = extractJsonObject(raw);
    if (!parsed || typeof parsed !== "object") return fallbackTagged;
    const out = {};
    for (const section of sections) {
      const parsedArr = Array.isArray(parsed[section]) ? parsed[section] : [];
      const candidate = parsedArr.length > 0 ? parsedArr : fallbackTagged[section];
      out[section] = candidate.slice(0, 2).map((s) => ({
        validationStatus: s?.validationStatus === "validated" ? "validated" : "weak_match",
        title: s?.title || "Source",
        url: s?.url || "#",
        snippet: s?.snippet || "",
        confidence: confidenceForStatus(
          s?.validationStatus === "validated" ? "validated" : "weak_match",
          typeof s?.confidence === "number" ? s.confidence : s?.score,
          0.6,
        ),
      }));
    }
    return out;
  } catch {
    return fallbackTagged;
  }
}

function extractJsonObject(text) {
  if (!text || typeof text !== "string") return null;
  const fence = text.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const jsonText = candidate.slice(start, end + 1);
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

async function chatLlama({ model, system, user, temperature = 0.2 }) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("Missing GROQ_API_KEY in backend environment.");
  const payload = {
    model,
    temperature,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
  };
  let resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  // Some Groq model variants reject response_format; retry once without it.
  if (!resp.ok && resp.status === 400) {
    resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
  }
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Groq ${model} failed (${resp.status}): ${t}`);
  }
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error(`Groq ${model} returned empty response.`);
  return content;
}

async function chatLlamaWithFallback({ preferredModel, system, user, temperature = 0.2, fallbackModels = [] }) {
  const candidates = Array.from(new Set([preferredModel, ...fallbackModels].filter(Boolean)));
  let lastError = null;
  for (const model of candidates) {
    try {
      const text = await chatLlama({ model, system, user, temperature });
      return { text, model };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error("All Llama model candidates failed.");
}

async function chatGemini({ model, prompt }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY in backend environment.");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Gemini ${model} failed (${resp.status}): ${t}`);
  }
  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`Gemini ${model} returned empty response.`);
  return text;
}

async function chatGeminiWithFallback({ preferredModel, prompt }) {
  const normalizedPreferred =
    preferredModel === "gemini-1.5-pro-latest" || preferredModel === "gemini-1.5-pro"
      ? "gemini-1.5-flash"
      : preferredModel;
  const candidates = Array.from(new Set([
    normalizedPreferred,
    "gemini-1.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-pro",
  ].filter(Boolean)));
  let lastError = null;
  for (const model of candidates) {
    try {
      const text = await chatGemini({ model, prompt });
      return { text, model };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error("All Gemini fallback models failed.");
}

function formatPriorFeedbackForPrompt(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return "(none — first generation in this domain for this tenant.)";
  }
  const lines = [];
  for (const f of items.slice(0, 12)) {
    const corrections = f?.corrections && typeof f.corrections === "object" ? f.corrections : {};
    const issues = f?.issues && typeof f.issues === "object" ? f.issues : {};
    for (const section of ["protocol", "materials", "budget", "timeline", "validation"]) {
      const cStr = typeof corrections[section] === "string" ? corrections[section].trim() : "";
      const iStr = typeof issues[section] === "string" ? issues[section].trim() : "";
      if (cStr || iStr) {
        lines.push(
          `- [${section}] issue: ${iStr.slice(0, 280) || "—"} | expert correction: ${cStr.slice(0, 520) || "—"}`,
        );
      }
    }
    if (lines.length === 0 && f?.overallRating != null) {
      lines.push(`- [general] overall ${f.overallRating}/5 (${f.reviewerExpertise || "reviewer"})`);
    }
  }
  if (lines.length === 0) {
    return "(Reviews linked but no section text — use VERIFY-CATALOG for any uncertain SKU and conservative timelines.)";
  }
  return lines.join("\n");
}

function buildPlanPrompt({ hypothesis, retrievalPacket }) {
  const priorBlock = formatPriorFeedbackForPrompt(retrievalPacket.priorFeedback || []);
  return `You are generating a complete, operational experiment plan for real wet-lab execution.
Return ONLY valid JSON object matching this shape (no markdown):
{
  "domain": "string",
  "hypothesisAnalysis": {
    "intervention": "string",
    "measurableOutcome": "string",
    "mechanisticReason": "string",
    "controlCondition": "string",
    "strengthScore": "Strong|Moderate|Weak",
    "strengthReason": "string"
  },
  "literatureQC": {
    "noveltySignal": "not_found|similar_exists|exact_match",
    "noveltyExplanation": "string",
    "references": [{"title":"string","authors":"string","journal":"string","year":2024,"doi":"string","relevance":"string"}]
  },
  "experimentPlan": {
    "title":"string",
    "totalCostUSD":0,
    "totalDurationDays":0,
    "difficultyLevel":"Beginner|Intermediate|Advanced",
    "expertiseTags":["string"],
    "protocol":{"phases":[{"phaseName":"string","steps":[{"stepNumber":1,"title":"string","description":"string","durationHours":1,"safetyWarnings":["string"],"criticalNotes":["string"]}]}]},
    "materials":[{"item":"string","specification":"string","quantity":"string","supplier":"string","catalogNumber":"string","unitPriceUSD":0,"totalCostUSD":0,"category":"Reagent|Equipment|Consumable","leadTimeWeeks":0}],
    "budget":{"byCategory":[{"category":"string","amountUSD":0}],"contingencyPercent":10,"totalWithContingencyUSD":0},
    "timeline":{"phases":[{"name":"string","startDay":0,"endDay":0,"type":"preparation|treatment|analysis|measurement","dependencies":["string"]}]},
    "validation":{"successMetrics":["string"],"statisticalPlan":"string","sampleSize":"string","controls":{"positive":"string","negative":"string"},"failureModes":[{"mode":"string","earlyDetection":"string"}],"qcCheckpoints":["string"]},
    "safety":{"hazardousMaterials":[{"material":"string","hazards":["string"],"ghsSymbols":["string"]}],"requiredPPE":["string"],"wasteDisposal":["string"],"emergencyProcedures":["string"]}
  },
  "verificationSources": {
    "protocol":[{"title":"string","url":"string","snippet":"string"}],
    "materials":[{"title":"string","url":"string","snippet":"string"}],
    "budget":[{"title":"string","url":"string","snippet":"string"}],
    "timeline":[{"title":"string","url":"string","snippet":"string"}],
    "validation":[{"title":"string","url":"string","snippet":"string"}],
    "safety":[{"title":"string","url":"string","snippet":"string"}]
  },
  "reasoning":{"repositoriesConsulted":["string"],"budgetMethodology":"string","literatureInfluence":"string","confidence":[{"section":"string","level":"High|Medium|Low","reason":"string"}]}
}

Constraints:
- Make it operationally realistic.
- Include specific materials and plausible catalog identifiers when known; otherwise mark as "VERIFY-CATALOG".
- Budget should add up coherently.
- Timeline must have consistent start/end dependencies.
- Keep references and verificationSources grounded in retrieval packet.
- Include explicit safety and compliance notes (IRB/IBC/ethics approvals) whenever work could involve biosafety or human/animal subjects.
- When describing methodology, bias toward established protocol literature (protocols.io, Bio-protocol, Nature Protocols, peer-reviewed methods, vendor protocols) already present in the retrieval packet — do not invent DOIs or URLs.

=== PRIOR SCIENTIST CORRECTIONS (MANDATORY) ===
The bullets below come from past expert reviews of similar experiments (same tenant / domain). You MUST fold them into the JSON plan: update protocol steps, materials lines, budget assumptions, timeline slack, or validation metrics where they override generic defaults. If a corrected catalog number is not verifiable from the packet, keep the expert intent in criticalNotes and set catalogNumber to "VERIFY-CATALOG".

${priorBlock}

Hypothesis:
${hypothesis}

Retrieval packet:
${JSON.stringify(retrievalPacket).slice(0, 120000)}
`;
}

async function validateLiteratureQcWithLlama({ hypothesis, qcResult, llama8Model }) {
  const verificationPrompt = `You are a strict scientific retrieval validator.
Given a hypothesis and Tavily results, return ONLY JSON with:
{
  "noveltySignal":"not_found|similar_exists|exact_match",
  "noveltyExplanation":"string",
  "references":[
    {
      "title":"string",
      "authors":"string",
      "journal":"string",
      "year":2024,
      "doi":"string",
      "relevance":"string",
      "url":"string",
      "validationStatus":"validated|weak_match",
      "confidence":0.0
    }
  ]
}
Rules:
- Keep 1-3 references.
- Choose only papers/sources that are actually relevant to the hypothesis.
- If uncertain, mark validationStatus as weak_match and lower confidence.

Hypothesis:
${hypothesis}

Tavily base extraction:
${JSON.stringify(qcResult).slice(0, 45000)}
`;

  let validated = null;
  let validatorError = "";
  try {
    const validator = await chatLlamaWithFallback({
      preferredModel: llama8Model,
      system: "You verify whether retrieved scientific papers match the hypothesis. Return strict JSON only.",
      user: verificationPrompt,
      temperature: 0.1,
      fallbackModels: ["llama-3.1-8b-instant", "llama3-8b-8192"],
    });
    const raw = validator.text;
    validated = extractJsonObject(raw);
    if (validated) {
      validated.__validatorModel = validator.model;
    }
  } catch (e) {
    validatorError = e instanceof Error ? e.message : String(e);
    validated = null;
  }

  if (validated && Array.isArray(validated.references)) {
    return {
      noveltySignal: validated.noveltySignal || qcResult.noveltySignal,
      noveltyExplanation: validated.noveltyExplanation || qcResult.noveltyExplanation,
      references: validated.references.map((r) => ({
        validationStatus: r.validationStatus === "validated" ? "validated" : "weak_match",
        title: r.title || "Untitled source",
        authors: r.authors || "Source metadata unavailable",
        journal: r.journal || "Web source",
        year: Number.isFinite(Number(r.year)) ? Number(r.year) : new Date().getFullYear(),
        doi: r.doi || "N/A",
        relevance: r.relevance || "Relevance validated by Llama 8B.",
        url: r.url || "#",
        confidence: confidenceForStatus(
          r.validationStatus === "validated" ? "validated" : "weak_match",
          typeof r.confidence === "number" ? r.confidence : r.score,
          0.6,
        ),
      })).slice(0, 3),
      modelFlow: {
        retrieval: "tavily",
        validator: validated.__validatorModel || llama8Model,
        validatorError: validatorError || undefined,
      },
    };
  }

  return {
    ...qcResult,
    references: qcResult.references.map((r) => ({
      ...r,
      validationStatus: "weak_match",
      confidence: confidenceForStatus("weak_match", r.score, 0.55),
    })),
    modelFlow: {
      retrieval: "tavily",
      validator: "llama8-unavailable",
      validatorError: validatorError || "Llama validator returned no parseable JSON.",
    },
  };
}

async function buildLiteratureRetrievalPacket({ hypothesis, tavilyKey, llama8Model, priorFeedback = [] }) {
  if (!tavilyKey) {
    return {
      retrievalSummary:
        "External retrieval unavailable because TAVILY_API_KEY is missing. Plan will use hypothesis and prior feedback.",
      literatureQC: {
        noveltySignal: "similar_exists",
        noveltyExplanation:
          "Literature retrieval unavailable at generation time. Run /api/literature-qc once retrieval keys are configured.",
        references: [],
      },
      modelFlow: {
        retrieval: "unavailable",
        validator: "unavailable",
      },
      priorFeedback,
    };
  }

  const rawResults = await fetchMergedLiteratureRows(tavilyKey, hypothesis);
  const qcResult = mapTavilyToQC({ results: rawResults });
  const validatedQc = await validateLiteratureQcWithLlama({ hypothesis, qcResult, llama8Model });
  return {
    retrievalSummary:
      "Plan generation is grounded in Tavily retrieval plus Llama 8B relevance validation before drafting.",
    literatureQC: {
      noveltySignal: validatedQc.noveltySignal,
      noveltyExplanation: validatedQc.noveltyExplanation,
      references: validatedQc.references,
    },
    modelFlow: validatedQc.modelFlow,
    priorFeedback,
  };
}

function runSafetyChecks({ hypothesis, plan }) {
  const raw = JSON.stringify(plan || {}).toLowerCase();
  const alerts = [];
  const highRiskTerms = ["human challenge", "gain-of-function", "aerosolized pathogen", "select agent"];
  for (const term of highRiskTerms) {
    if (raw.includes(term) || String(hypothesis || "").toLowerCase().includes(term)) {
      alerts.push(`Detected high-risk term "${term}".`);
    }
  }

  const hasReviewGate =
    raw.includes("institutional biosafety committee") ||
    raw.includes("irb approval") ||
    raw.includes("ethics approval");
  if (alerts.length > 0 && !hasReviewGate) {
    return {
      ok: false,
      reason:
        "Plan flagged as high-risk and missing required institutional review controls (IRB/IBC/Ethics).",
    };
  }
  return { ok: true };
}

function buildEvidenceCoverage(verificationSources) {
  const sections = ["protocol", "materials", "budget", "timeline", "validation", "safety"];
  const coverage = {};
  let coveredCount = 0;
  for (const section of sections) {
    const list = Array.isArray(verificationSources?.[section]) ? verificationSources[section] : [];
    const hasEvidence = list.length > 0;
    coverage[section] = {
      references: list.length,
      hasValidated: list.some((s) => s?.validationStatus === "validated"),
      hasEvidence,
    };
    if (hasEvidence) coveredCount += 1;
  }
  return { coverage, coveredCount, totalSections: sections.length };
}

function evaluatePlanQuality({ hypothesis, plan }) {
  const errors = [];
  const warnings = [];
  const ep = plan?.experimentPlan || {};
  const materials = Array.isArray(ep.materials) ? ep.materials : [];
  const budgetItems = Array.isArray(ep?.budget?.byCategory) ? ep.budget.byCategory : [];
  const timelinePhases = Array.isArray(ep?.timeline?.phases) ? ep.timeline.phases : [];
  const protocolPhases = Array.isArray(ep?.protocol?.phases) ? ep.protocol.phases : [];
  const totalProtocolSteps = protocolPhases.reduce(
    (n, p) => n + (Array.isArray(p?.steps) ? p.steps.length : 0),
    0,
  );
  const refs = plan?.literatureQC?.references || [];
  const hypothesisText = String(hypothesis || "").toLowerCase();

  if (totalProtocolSteps < 4) errors.push("Protocol must contain at least 4 executable steps.");
  if (materials.length < 5) errors.push("Materials list is too sparse (<5 items).");
  const missingCatalog = materials.filter((m) => !String(m?.catalogNumber || "").trim()).length;
  if (missingCatalog > 0) warnings.push(`${missingCatalog} material(s) missing catalog numbers.`);
  const unresolvedCatalog = materials.filter((m) => String(m?.catalogNumber || "").includes("VERIFY-CATALOG")).length;
  if (unresolvedCatalog > 0) warnings.push(`${unresolvedCatalog} material(s) still use VERIFY-CATALOG placeholders.`);

  const materialsSubtotal = materials.reduce((sum, m) => sum + Number(m?.totalCostUSD || 0), 0);
  const budgetSubtotal = budgetItems.reduce((sum, b) => sum + Number(b?.amountUSD || 0), 0);
  const contingencyPct = Number(ep?.budget?.contingencyPercent || 0);
  const expectedTotal = Math.round(budgetSubtotal * (1 + contingencyPct / 100));
  const reportedTotal = Math.round(Number(ep?.budget?.totalWithContingencyUSD || 0));
  if (budgetSubtotal <= 0 || reportedTotal <= 0) errors.push("Budget totals are missing or invalid.");
  if (Math.abs(expectedTotal - reportedTotal) > Math.max(5, expectedTotal * 0.08)) {
    warnings.push("Budget total with contingency is inconsistent with category subtotal.");
  }
  if (materialsSubtotal > 0 && budgetSubtotal > 0 && Math.abs(materialsSubtotal - budgetSubtotal) > budgetSubtotal * 0.5) {
    warnings.push("Materials total deviates heavily from budget category subtotal.");
  }

  const invalidTimeline = timelinePhases.some((p) => Number(p?.endDay) <= Number(p?.startDay));
  if (invalidTimeline) errors.push("Timeline has phases with non-positive duration.");
  const timelineTotal = timelinePhases.reduce((max, p) => Math.max(max, Number(p?.endDay || 0)), 0);
  if (Math.abs(timelineTotal - Number(ep?.totalDurationDays || 0)) > 7) {
    warnings.push("Timeline max day does not closely match reported total duration.");
  }

  if (!Array.isArray(refs) || refs.length === 0) errors.push("Literature QC references are missing.");
  if (!Array.isArray(ep?.validation?.successMetrics) || ep.validation.successMetrics.length === 0) {
    errors.push("Validation success metrics are missing.");
  }
  if (!Array.isArray(ep?.safety?.requiredPPE) || ep.safety.requiredPPE.length === 0) {
    warnings.push("Safety PPE list is empty.");
  }
  if (String(hypothesis || "").trim().length < 20) warnings.push("Hypothesis is very short and may reduce plan quality.");

  const hasConcentrationUnits =
    /\b(\d+(\.\d+)?)\s?(mg\/l|mg\/ml|ug\/ml|ng\/ml|mm|um|nm|mmol\/l|mol\/l|%|mM|uM)\b/i.test(hypothesisText) ||
    /\b(\d+(\.\d+)?)\s?(mg\/l|mg\/ml|ug\/ml|ng\/ml|mm|um|nm|mmol\/l|mol\/l|%)\b/i.test(JSON.stringify(ep.protocol || ""));
  if (!hasConcentrationUnits) {
    warnings.push("No explicit concentration/dose units detected in hypothesis/protocol.");
  }

  const hasStatisticalSignal =
    /\b(p\s?[<=>]\s?0\.\d+|confidence interval|anova|t-test|mann-?whitney|chi-?square)\b/i.test(
      String(ep?.validation?.statisticalPlan || ""),
    );
  if (!hasStatisticalSignal) {
    warnings.push("Statistical plan does not clearly mention a concrete test/threshold.");
  }

  const sampleSizeText = String(ep?.validation?.sampleSize || "");
  const sampleN = sampleSizeText.match(/\b(\d{1,4})\b/g)?.map((n) => Number(n)) || [];
  if (sampleN.length === 0) {
    warnings.push("Sample size lacks explicit numeric values.");
  } else if (Math.max(...sampleN) < 3) {
    errors.push("Sample size appears too low for meaningful inference.");
  }

  const hazardCount = Array.isArray(ep?.safety?.hazardousMaterials) ? ep.safety.hazardousMaterials.length : 0;
  const hasEmergency = Array.isArray(ep?.safety?.emergencyProcedures) && ep.safety.emergencyProcedures.length > 0;
  if (hazardCount > 0 && !hasEmergency) {
    errors.push("Safety section lists hazards but no emergency procedures.");
  }

  const evidence = buildEvidenceCoverage(plan?.verificationSources);
  const normalizedEvidence = evidence.coveredCount / evidence.totalSections;
  if (evidence.coveredCount < 4) warnings.push("Verification evidence is sparse across plan sections.");

  const completenessScore = Math.max(0, 10 - errors.length * 2 - warnings.length * 0.5);
  const evidenceScore = Math.round(normalizedEvidence * 10 * 10) / 10;
  const operationalScore = Math.max(
    0,
    10 -
      (totalProtocolSteps < 6 ? 2 : 0) -
      (materials.length < 8 ? 1.5 : 0) -
      (timelinePhases.length < 3 ? 1.5 : 0) -
      (errors.length > 0 ? 2 : 0),
  );
  const score = Math.round(((completenessScore * 0.35 + evidenceScore * 0.3 + operationalScore * 0.35) * 10)) / 10;
  return {
    scoreOutOf10: Math.max(0, Math.min(10, score)),
    gatesPassed: errors.length === 0,
    dimensions: {
      completeness: Math.round(completenessScore * 10) / 10,
      evidenceGrounding: evidenceScore,
      operationalRealism: Math.round(operationalScore * 10) / 10,
    },
    evidenceCoverage: evidence.coverage,
    warnings,
    errors,
  };
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, rateLimit: { windowMs: RATE_LIMIT_WINDOW_MS, max: RATE_LIMIT_MAX } });
});

app.get("/api/reviews", requireLabmindApiKey, async (req, res) => {
  try {
    const tenantId = readTenantId(req);
    const domain = typeof req.query.domain === "string" ? req.query.domain.trim() : "";
    const limit = Math.max(1, Math.min(200, Number(req.query.limit || 50)));
    const reviews = domain ? await getReviewsByDomain(tenantId, domain, limit) : await getRecentReviews(tenantId, limit);
    return res.json({ version: 1, requestId: res.locals.requestId, tenantId, reviews });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return res.status(500).json({ error: message, requestId: res.locals.requestId });
  }
});

app.post("/api/reviews", requireLabmindApiKey, async (req, res) => {
  try {
    const tenantId = readTenantId(req);
    const review = req.body || {};
    if (!review?.id || !review?.timestamp || !review?.hypothesis || !review?.domain) {
      return res.status(400).json({
        error: "Review payload requires id, timestamp, hypothesis, and domain.",
        requestId: res.locals.requestId,
      });
    }
    await saveReviewRecord(review, { tenantId });
    return res.status(201).json({ ok: true, requestId: res.locals.requestId, tenantId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return res.status(500).json({ error: message, requestId: res.locals.requestId });
  }
});

app.post("/api/literature-qc", requireLabmindApiKey, async (req, res) => {
  try {
    const { hypothesis } = req.body || {};
    if (!hypothesis || typeof hypothesis !== "string" || hypothesis.trim().length < 6) {
      return res.status(400).json({ error: "Hypothesis is required." });
    }

    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing TAVILY_API_KEY in backend environment." });
    }

    let mergedRows = await fetchMergedLiteratureRows(apiKey, hypothesis);
    if (mergedRows.length === 0) {
      const probe = await fetch(TAVILY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({
          query: buildTavilySearchQuery(hypothesis),
          topic: "general",
          search_depth: "basic",
          max_results: 5,
          include_answer: false,
          include_raw_content: false,
        }),
      });
      if (!probe.ok) {
        const errorText = await probe.text();
        let tavilyMessage = errorText;
        try {
          const parsed = JSON.parse(errorText);
          const detail = parsed?.detail;
          if (typeof detail === "string") tavilyMessage = detail;
          else if (detail?.error) tavilyMessage = detail.error;
          else if (parsed?.message) tavilyMessage = parsed.message;
        } catch {
          // keep raw text
        }
        return res.status(502).json({
          error: `Tavily request failed (${probe.status}).`,
          details: tavilyMessage,
        });
      }
      const fallback = await probe.json();
      mergedRows = Array.isArray(fallback?.results) ? fallback.results : [];
    }

    const qcResult = mapTavilyToQC({ results: mergedRows });

    const llama8Model = process.env.LLAMA8_MODEL || "llama-3.1-8b-instant";
    const validatedQc = await validateLiteratureQcWithLlama({ hypothesis, qcResult, llama8Model });
    return res.json(validatedQc);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return res.status(500).json({ error: message });
  }
});

/**
 * Live web references per plan section (materials, budget, safety, etc.) for scientist verification.
 * Runs several bounded Tavily searches in parallel.
 */
app.post("/api/plan-sources", requireLabmindApiKey, async (req, res) => {
  try {
    const { hypothesis, experimentTitle, domain, materials } = req.body || {};
    if (!hypothesis || typeof hypothesis !== "string" || hypothesis.trim().length < 6) {
      return res.status(400).json({ error: "Hypothesis is required." });
    }

    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing TAVILY_API_KEY in backend environment." });
    }

    const sources = await fetchVerificationSourcesFromTavily({
      tavilyKey: apiKey,
      hypothesis,
      experimentTitle,
      domain,
      materials,
    });

    return res.json({ version: 1, sources });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return res.status(500).json({ error: message });
  }
});

app.post("/api/experiment-plan", requireLabmindApiKey, async (req, res) => {
  const started = Date.now();
  try {
    const { hypothesis, priorFeedback = [], domain: clientDomain } = req.body || {};
    if (!hypothesis || typeof hypothesis !== "string" || hypothesis.trim().length < 6) {
      return res.status(400).json({ error: "Hypothesis is required." });
    }

    const tenantId = readTenantId(req);
    await initFeedbackStore();
    const baseHypo = hypothesis.trim();
    const inferredDomain = clientDomain && String(clientDomain).trim().length > 0
      ? String(clientDomain).trim()
      : inferDomainFromHypothesis(baseHypo);
    const similarPack = await findSimilarReviews({
      tenantId,
      hypothesis: baseHypo,
      domain: inferredDomain,
      limit: 10,
      candidatePool: 160,
    });
    const domainReviews = await getReviewsByDomain(tenantId, inferredDomain, 8);
    const allPriorFeedback = mergedFeedback(priorFeedback, similarPack.reviews, domainReviews);
    const tavilyKey = process.env.TAVILY_API_KEY;
    const llama8Model = process.env.LLAMA8_MODEL || "llama-3.1-8b-instant";
    const rawLlama70 = process.env.LLAMA70_MODEL || "llama-3.3-70b-versatile";
    const llama70Model =
      rawLlama70 === "meta-llama/llama-3.1-70b-instruct"
        ? "llama-3.3-70b-versatile"
        : rawLlama70;
    const rawGeminiModel = process.env.GEMINI_MODEL || "gemini-1.5-flash";
    const geminiModel =
      rawGeminiModel === "gemini-1.5-pro-latest" || rawGeminiModel === "gemini-1.5-pro"
        ? "gemini-1.5-flash"
        : rawGeminiModel;
    const retrievalPacket = await buildLiteratureRetrievalPacket({
      hypothesis: baseHypo,
      tavilyKey,
      llama8Model,
      priorFeedback: allPriorFeedback,
    });

    const planPrompt = buildPlanPrompt({ hypothesis: baseHypo, retrievalPacket });
    let planRaw;
    let planningModel = `llama70:${llama70Model}`;
    let llamaError = null;
    try {
      planRaw = await chatLlama({
        model: llama70Model,
        system: "You are a principal scientist creating executable experiment plans. Return strict JSON only.",
        user: planPrompt,
        temperature: 0.15,
      });
    } catch (e) {
      llamaError = e instanceof Error ? e.message : String(e);
      // Credits/model availability fallback
      planningModel = "gemini:fallback";
      const geminiPrompt = `${planPrompt}\nIf uncertain, use conservative defaults and include VERIFY-CATALOG placeholders rather than fabricating exact numbers.`;
      try {
        const gem = await chatGeminiWithFallback({ preferredModel: geminiModel, prompt: geminiPrompt });
        planningModel = `gemini:${gem.model}`;
        planRaw = gem.text;
      } catch (gemErr) {
        const gm = gemErr instanceof Error ? gemErr.message : String(gemErr);
        return res.status(502).json({
          error: "Both Llama 70B and Gemini fallback failed.",
          details: `llama70 error: ${llamaError || "unknown"} | gemini error: ${gm}`,
        });
      }
    }

    const plan = extractJsonObject(planRaw);
    if (!plan) {
      return res.status(502).json({ error: "Plan model output could not be parsed as JSON." });
    }

    const modelMaterials = Array.isArray(plan?.experimentPlan?.materials) ? plan.experimentPlan.materials : [];
    const rawSources = await fetchVerificationSourcesFromTavily({
      tavilyKey,
      hypothesis: baseHypo,
      experimentTitle: plan?.experimentPlan?.title,
      domain: plan?.domain,
      materials: modelMaterials,
    });
    plan.verificationSources = await validateVerificationSourcesWithLlama8({
      hypothesis: baseHypo,
      sources: rawSources,
      llama8Model,
    });
    if (!plan.literatureQC || !hasMeaningfulReferences(plan.literatureQC.references)) {
      plan.literatureQC = retrievalPacket.literatureQC;
    }

    const scientificMechanistic = runScientificMechanisticValidation({
      hypothesis: baseHypo,
      plan,
    });

    const safetyCheck = runSafetyChecks({ hypothesis: baseHypo, plan });
    if (!safetyCheck.ok) {
      return res.status(422).json({
        error: "Plan requires human safety review before release.",
        details: safetyCheck.reason,
        requestId: res.locals.requestId,
      });
    }
    let qualityChecks = evaluatePlanQuality({ hypothesis: baseHypo, plan });
    for (const ac of scientificMechanistic.assayCompatibility || []) {
      if (ac.passesHeuristic === false) {
        qualityChecks = {
          ...qualityChecks,
          warnings: [...qualityChecks.warnings, ac.detail],
        };
      }
    }
    if (scientificMechanistic.powerSketch?.reportedMeetsHeuristic === false && scientificMechanistic.powerSketch?.note) {
      qualityChecks = {
        ...qualityChecks,
        warnings: [...qualityChecks.warnings, scientificMechanistic.powerSketch.note],
      };
    }

    return res.json({
      version: 1,
      requestId: res.locals.requestId,
      tenantId,
      modelFlow: {
        retrievalModel: `${retrievalPacket.modelFlow?.retrieval || "tavily"} + source-check:${llama8Model}`,
        planningModel,
      },
      feedbackSummary: {
        priorFeedbackCount: Array.isArray(allPriorFeedback) ? allPriorFeedback.length : 0,
        feedbackMatch: {
          method: similarPack.matchMethod,
          ontologyTags: similarPack.ontologyTags,
          similarReviewCount: similarPack.reviews.length,
        },
        appliedHighlights: Array.isArray(allPriorFeedback)
          ? allPriorFeedback
              .flatMap((f) => [
                ...Object.values(f?.corrections || {}),
                ...Object.values(f?.issues || {}),
              ])
              .filter((c) => typeof c === "string" && c.trim().length > 0)
              .slice(0, 8)
          : [],
      },
      qualityChecks,
      executionReadiness: computeExecutionReadiness({
        hypothesis: baseHypo,
        plan,
        qualityChecks,
        scientificMechanistic,
      }),
      scientificMechanistic,
      metadata: {
        generatedAt: new Date().toISOString(),
        generationLatencyMs: Date.now() - started,
      },
      plan,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return res.status(500).json({ error: message, requestId: res.locals.requestId });
  }
});

const isDirectRun = process.argv[1] && process.argv[1].endsWith("server.js");
if (isDirectRun) {
  app.listen(PORT, async () => {
    try {
      const store = await initFeedbackStore();
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({ msg: "feedback_store_ready", mode: store.mode }));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("feedback_store_init_failed", e instanceof Error ? e.message : String(e));
    }
    // eslint-disable-next-line no-console
    console.log(`Backend running at http://localhost:${PORT}`);
  });
}

export { app };
