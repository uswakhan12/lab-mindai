import "dotenv/config";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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
import { buildNoveltyDiagnostics } from "./novelty-diagnostics.js";
import {
  validatePlanGrounding,
  isProcurementCriticalMaterial,
  repairProcurementGroundingForRelease,
} from "./grounding-validator.js";
import { runOperationalExtraChecks } from "./operational-extra-checks.js";
import {
  validateGovernanceRelease,
  applyAllReleaseCompliancePatches,
  forceUniversalComplianceFooter,
} from "./governance-gate.js";
import { computeFeedbackLearningReport } from "./feedback-learning-report.js";
import { generatePlanOutline } from "./plan-outline.js";
import { extractJsonObject } from "./json-extract.js";
import { computeHypothesisReferenceEmbeddingCosines } from "./embedding-rerank.js";
import { normalizePlanFinancials } from "./plan-financial-normalize.js";
import { ensureFullPlanReasoningRoot } from "./plan-reasoning-normalize.js";
import { buildMinimalFallbackPlan } from "./plan-fallback-stub.js";

const app = express();
const PORT = Number(process.env.PORT || 8080);
const TAVILY_URL = "https://api.tavily.com/search";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Suggested wait from 429 bodies (Groq / Gemini). Capped so we do not block the server for tens of minutes.
 * Returns 0 if no safe wait (e.g. multi-hour Groq TPD — caller should try another model instead).
 */
function parse429SuggestedWaitMs(status, errorText, headers) {
  const cap = Math.min(120_000, Math.max(1_000, Number(process.env.RATE_LIMIT_RETRY_MAX_MS || 90_000) || 90_000));
  const ra = headers?.get?.("retry-after");
  if (ra) {
    const sec = Number(ra);
    if (Number.isFinite(sec) && sec > 0) return Math.min(cap, sec * 1000 + 250);
  }
  const t = String(errorText);
  const minGroq = t.match(/try again in (\d+)m([\d.]+)s/i);
  if (minGroq) {
    const totalSec = Number(minGroq[1]) * 60 + Number(minGroq[2]);
    if (totalSec * 1000 > cap) return 0;
    return Math.min(cap, Math.ceil(totalSec * 1000) + 500);
  }
  for (const re of [/try again in ([\d.]+)\s*s/i, /Please retry in ([\d.]+)\s*s/i, /"retryDelay":\s*"([\d.]+)s"/i]) {
    const m = t.match(re);
    if (m) {
      const ms = Math.ceil(Number(m[1]) * 1000) + 500;
      if (Number.isFinite(ms) && ms > 0) return Math.min(cap, ms);
    }
  }
  if (status === 429 && /tokens per minute|\bTPM\b/i.test(t)) return Math.min(cap, 35_000);
  return 0;
}
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

function mergeReferenceScores(validatedRefs, qcResult) {
  const orig = Array.isArray(qcResult?.references) ? qcResult.references : [];
  return validatedRefs.map((r) => {
    const u = String(r.url || "").trim();
    const hit = orig.find((o) => String(o.url || "").trim() === u);
    const score = typeof hit?.score === "number" && Number.isFinite(hit.score) ? hit.score : 0.62;
    return { ...r, score };
  });
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

async function chatLlama({ model, system, user, temperature = 0.2 }) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("Missing GROQ_API_KEY in backend environment.");
  const baseBody = (useJsonObject) => ({
    model,
    temperature,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    ...(useJsonObject ? { response_format: { type: "json_object" } } : {}),
  });
  async function groqFetch(useJsonObject) {
    return fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(baseBody(useJsonObject)),
    });
  }
  let resp = await groqFetch(true);
  if (!resp.ok && resp.status === 400) resp = await groqFetch(false);
  let errBody = "";
  if (!resp.ok) errBody = await resp.text();
  if (!resp.ok && resp.status === 429) {
    const waitMs = parse429SuggestedWaitMs(429, errBody, resp.headers);
    if (waitMs > 0) {
      await sleep(waitMs);
      resp = await groqFetch(true);
      if (!resp.ok && resp.status === 400) resp = await groqFetch(false);
      errBody = resp.ok ? "" : await resp.text();
    }
  }
  if (!resp.ok) {
    throw new Error(`Groq ${model} failed (${resp.status}): ${errBody}`);
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

/** Map deprecated / paid-only Gemini IDs to Flash (free tier / v1beta). */
function normalizeGeminiModelId(model) {
  const raw = String(model || "").trim();
  const lower = raw.toLowerCase();
  if (!lower) return "gemini-1.5-flash";
  if (
    lower.includes("gemini-1.5-pro") ||
    lower.includes("gemini-1.5-pro-latest") ||
    lower === "gemini-pro"
  ) {
    return "gemini-1.5-flash";
  }
  return raw;
}

async function chatGemini({ model, prompt }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY in backend environment.");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  };
  async function gemFetch() {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  let resp = await gemFetch();
  let errText = "";
  if (!resp.ok) errText = await resp.text();
  if (!resp.ok && resp.status === 429) {
    const waitMs = parse429SuggestedWaitMs(429, errText, resp.headers);
    if (waitMs > 0) {
      await sleep(waitMs);
      resp = await gemFetch();
      errText = resp.ok ? "" : await resp.text();
    }
  }
  if (!resp.ok) {
    throw new Error(`Gemini ${model} failed (${resp.status}): ${errText}`);
  }
  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`Gemini ${model} returned empty response.`);
  return text;
}

async function chatGeminiWithFallback({ preferredModel, prompt }) {
  const normalizedPreferred = normalizeGeminiModelId(preferredModel);
  // Default: 1.5 Flash only — many free projects have quota limit 0 on gemini-2.0-flash.
  const extras = (process.env.GEMINI_SECONDARY_MODEL || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const candidates = Array.from(new Set([normalizedPreferred, "gemini-1.5-flash", ...extras].filter(Boolean)));
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

function buildIncorporationReport(allPriorFeedback) {
  const list = Array.isArray(allPriorFeedback) ? allPriorFeedback : [];
  return list.slice(0, 8).map((f, i) => ({
    index: i,
    sourceHypothesis: String(f?.hypothesis || "").slice(0, 200),
    domain: f?.domain,
    overallRating: f?.overallRating,
    reviewerExpertise: f?.reviewerExpertise,
    corrections: Object.entries(f?.corrections || {})
      .filter(([, v]) => typeof v === "string" && v.trim().length > 0)
      .map(([section, text]) => ({ section, excerpt: text.trim().slice(0, 280) })),
    issues: Object.entries(f?.issues || {})
      .filter(([, v]) => typeof v === "string" && v.trim().length > 0)
      .map(([section, text]) => ({ section, excerpt: text.trim().slice(0, 220) })),
    promptInclusion: "These rows were merged into the generation prompt for this request (sorted by correction weight).",
  }));
}

function buildPlanPrompt({ hypothesis, retrievalPacket, outline }) {
  const priorBlock = formatPriorFeedbackForPrompt(retrievalPacket.priorFeedback || []);
  const outlineBlock =
    outline && typeof outline === "object"
      ? `=== RETRIEVAL_OUTLINE (MANDATORY — expand, do not replace) ===
A prior Llama 8B pass structured this experiment specifically from the retrieval packet. Preserve phase names and ordering; turn each stepTitles entry into one or more fully written protocol steps with durations and safety notes. If the outline conflicts with a generic template, the outline wins.

${JSON.stringify(outline).slice(0, 14_000)}

`
      : "";
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
    "protocol":{"phases":[{"phaseName":"string","steps":[{"stepNumber":1,"title":"string","description":"string","durationHours":1,"safetyWarnings":["string"],"criticalNotes":["string"],"literatureRefIndex":0}]}]},
    "materials":[{"item":"string","specification":"string","quantity":"string","supplier":"string","catalogNumber":"string","unitPriceUSD":0,"totalCostUSD":0,"category":"Reagent|Equipment|Consumable","leadTimeWeeks":0,"lastVerifiedAt":"ISO-8601 when price/availability was checked","quoteSourceType":"literature_packet|vendor_page|verification_tavily|model_estimate|unknown","stalenessDays":0,"grounding":{"sourceUrl":"EXACT url from retrieval references OR verification materials URLs OR PENDING","sourceTitle":"string","evidenceNote":"<=140 chars","confidence":"High|Medium|Low"}}],
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
- **Regulatory / governance (release-critical):** (1) If the hypothesis uses **live vertebrate animals** as experimental subjects (e.g. C57BL/6 mice, rats — **not** species words only describing catalog antibodies such as “rabbit anti-X”), include explicit **IACUC** or equivalent animal care and use committee / approved animal use protocol language in experimentPlan.reasoning, safety, or a dedicated protocol phase. (2) If using **human whole blood, plasma, serum, venipuncture, or clinical specimens**, either state clearly that matrices are **commercial/vendor-supplied** (with supplier context) **or** cite **IRB / institutional review / ethics committee** approval for collection; otherwise cite IRB/ethics as for human subjects research. (3) Only cite **IBC / biosafety** when BSL-2/3, lentivirus, rDNA work, etc. are truly part of the design — do not invent rDNA for unrelated microbial electrochemistry unless applicable.
- **Primary antibodies and ELISA/biosensor capture reagents** (e.g. anti-CRP): set each line’s grounding.sourceUrl to an **exact https URL** copied from the retrieval packet’s literatureQC.references[].url or from verification URLs you were given — never leave PENDING when a packet URL exists.
- experimentPlan.materials MUST contain **at least 8** line items for any wet-lab plan (list each cryoprotectant, basal medium, serum if used, viability reagent, cryovials, pipette tips, programmable freezer / LN2 access or facility fee, PPE, waste containers, etc.). Thin 3-line lists are unacceptable.
- experimentPlan.totalCostUSD MUST be within **10%** of the sum of all materials[].totalCostUSD (recompute the header from line items before returning JSON).
- experimentPlan.totalDurationDays MUST match the last timeline phase endDay within **3 days** (align header to max endDay).
- Include specific materials and plausible catalog identifiers when known; otherwise mark as "VERIFY-CATALOG".
- Budget should add up coherently.
- Timeline must have consistent start/end dependencies.
- Keep references and verificationSources grounded in retrieval packet.
- Include explicit safety and compliance notes (IRB/IBC/ethics approvals) whenever work could involve biosafety or human/animal subjects.
- When describing methodology, bias toward established protocol literature (protocols.io, Bio-protocol, Nature Protocols, peer-reviewed methods, vendor protocols) already present in the retrieval packet — do not invent DOIs or URLs.
- Each protocol step MUST include literatureRefIndex: 0, 1, or 2 pointing at which retrieval packet reference (same order as literatureQC.references in the packet) most informs that step. If none apply, use 0 and explain limitation in criticalNotes.
- Each material line MUST include grounding.sourceUrl either (a) an EXACT URL from retrievalPacket.literatureQC.references[].url, or (b) PENDING until verified. For quoteSourceType prefer verification_tavily or vendor_page when grounded in web checks; use literature_packet when the price claim is tied to a paper. Set lastVerifiedAt to the assumed check time (ISO). stalenessDays should match age from lastVerifiedAt to today if known, else 0 with note in evidenceNote.
- For **core facility / LN2 access / instrument time fees** with no public catalog URL, use grounding.sourceUrl "PENDING", quoteSourceType "model_estimate", and explain the fee basis in evidenceNote (do not invent https URLs).

${outlineBlock}
=== PRIOR SCIENTIST CORRECTIONS (MANDATORY) ===
The bullets below come from past expert reviews of similar experiments (same tenant / domain). You MUST fold them into the JSON plan: update protocol steps, materials lines, budget assumptions, timeline slack, or validation metrics where they override generic defaults. **Echo the correction’s concrete keywords** (e.g. controlled thaw, ramp rate, duration) in at least one protocol step description or criticalNotes so the change is auditable in JSON. If a corrected catalog number is not verifiable from the packet, keep the expert intent in criticalNotes and set catalogNumber to "VERIFY-CATALOG".

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
      references: mergeReferenceScores(
        validated.references.map((r) => ({
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
        qcResult,
      ),
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
    const literatureQC = {
      noveltySignal: "similar_exists",
      noveltyExplanation:
        "Literature retrieval unavailable at generation time. Run /api/literature-qc once retrieval keys are configured.",
      references: [],
    };
    return {
      retrievalSummary:
        "External retrieval unavailable because TAVILY_API_KEY is missing. Plan will use hypothesis and prior feedback.",
      literatureQC,
      noveltyDiagnostics: buildNoveltyDiagnostics(hypothesis, literatureQC.references, literatureQC.noveltySignal),
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
  const noveltyEmbeddingCosines = await computeHypothesisReferenceEmbeddingCosines(
    hypothesis,
    validatedQc.references,
  );
  const noveltyDiagnostics = buildNoveltyDiagnostics(
    hypothesis,
    validatedQc.references,
    validatedQc.noveltySignal,
    { embeddingCosineByIndex: noveltyEmbeddingCosines || undefined },
  );
  return {
    retrievalSummary:
      "Plan generation is grounded in Tavily retrieval plus Llama 8B relevance validation before drafting.",
    literatureQC: {
      noveltySignal: validatedQc.noveltySignal,
      noveltyExplanation: validatedQc.noveltyExplanation,
      references: validatedQc.references,
    },
    noveltyDiagnostics,
    noveltyEmbeddingCosines,
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

function enrichMaterialQuoteFields(plan, generatedAtIso) {
  const mats = plan?.experimentPlan?.materials;
  if (!Array.isArray(mats)) return;
  const now = Date.parse(generatedAtIso) || Date.now();
  for (const m of mats) {
    if (!m.lastVerifiedAt && generatedAtIso) m.lastVerifiedAt = generatedAtIso;
    if (!m.quoteSourceType) m.quoteSourceType = "unknown";
    const parsed = m.lastVerifiedAt ? Date.parse(String(m.lastVerifiedAt)) : NaN;
    if (Number.isFinite(parsed)) {
      const computed = Math.max(0, Math.floor((now - parsed) / 86400000));
      if (m.stalenessDays == null || !Number.isFinite(Number(m.stalenessDays))) m.stalenessDays = computed;
      else m.stalenessDays = Math.max(Number(m.stalenessDays), computed);
    } else if (m.stalenessDays == null) {
      m.stalenessDays = null;
    }
  }
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
  const inVitroFraming = /\b(hela|293t?|cell line|culture|in vitro|wells?|plate|cfu|cryoprotect|thaw)\b/i.test(
    hypothesisText,
  );
  if (sampleN.length === 0) {
    warnings.push("Sample size lacks explicit numeric values.");
  } else if (Math.max(...sampleN) < 3) {
    if (inVitroFraming) {
      warnings.push(
        "Reported N is small; confirm biological versus technical replicate counts for inference in this in-vitro design.",
      );
    } else {
      errors.push("Sample size appears too low for meaningful inference.");
    }
  }

  const hazardCount = Array.isArray(ep?.safety?.hazardousMaterials) ? ep.safety.hazardousMaterials.length : 0;
  const hasEmergency = Array.isArray(ep?.safety?.emergencyProcedures) && ep.safety.emergencyProcedures.length > 0;
  if (hazardCount > 0 && !hasEmergency) {
    errors.push("Safety section lists hazards but no emergency procedures.");
  }

  const evidence = buildEvidenceCoverage(plan?.verificationSources);
  const normalizedEvidence = evidence.coveredCount / evidence.totalSections;
  if (evidence.coveredCount < 4) warnings.push("Verification evidence is sparse across plan sections.");

  let stepsWithLitIdx = 0;
  for (const ph of protocolPhases) {
    for (const st of ph?.steps || []) {
      if (Number.isInteger(st?.literatureRefIndex) && st.literatureRefIndex >= 0 && st.literatureRefIndex <= 2) {
        stepsWithLitIdx += 1;
      }
    }
  }
  if (refs.length > 0 && totalProtocolSteps > 0 && stepsWithLitIdx < totalProtocolSteps * 0.45) {
    warnings.push(
      "Most protocol steps lack literatureRefIndex (0–2) pointing at retrieval references — weaker packet-to-protocol traceability.",
    );
  }

  let quoteStalenessPenalty = 0;
  for (let i = 0; i < materials.length; i++) {
    const m = materials[i];
    const critical = isProcurementCriticalMaterial(m);
    const type = String(m?.quoteSourceType || "unknown").toLowerCase();
    const days = typeof m?.stalenessDays === "number" && Number.isFinite(m.stalenessDays) ? m.stalenessDays : null;
    const hasDate = Boolean(m?.lastVerifiedAt && Number.isFinite(Date.parse(String(m.lastVerifiedAt))));

    if (["model_estimate", "unknown", ""].includes(type)) {
      if (critical || m?.category === "Reagent") {
        warnings.push(
          `Material "${m?.item || `line ${i + 1}`}": quoteSourceType "${type || "unknown"}" — pricing traceability is weak.`,
        );
        quoteStalenessPenalty += 0.25;
      }
    }
    if (days != null) {
      if (days > 365 && critical) {
        errors.push(
          `QUOTE_STALE: critical material "${m?.item}" quote ~${days}d old (>365d) — refresh before procurement.`,
        );
        quoteStalenessPenalty += 1.2;
      } else if (days > 180 && critical) {
        errors.push(
          `QUOTE_STALE: critical material "${m?.item}" quote ~${days}d old (>180d) — confirm current pricing.`,
        );
        quoteStalenessPenalty += 0.8;
      } else if (days > 90 && (critical || m?.category === "Reagent")) {
        warnings.push(`Material "${m?.item}": quote age ~${days}d — re-verify before large spend.`);
        quoteStalenessPenalty += 0.35;
      }
    } else if ((critical || m?.category === "Reagent") && !hasDate) {
      warnings.push(`Material "${m?.item}": missing lastVerifiedAt — quote freshness not auditable.`);
      quoteStalenessPenalty += 0.2;
    }
  }
  quoteStalenessPenalty = Math.min(3.2, quoteStalenessPenalty);

  const completenessScore = Math.max(0, 10 - errors.length * 2 - warnings.length * 0.5);
  const evidenceScore = Math.round(normalizedEvidence * 10 * 10) / 10;
  const operationalScore = Math.max(
    0,
    10 -
      (totalProtocolSteps < 6 ? 2 : 0) -
      (materials.length < 8 ? 1.5 : 0) -
      (timelinePhases.length < 3 ? 1.5 : 0) -
      (errors.length > 0 ? 2 : 0) -
      quoteStalenessPenalty,
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
    const litEmbeddingCosines = await computeHypothesisReferenceEmbeddingCosines(
      hypothesis.trim(),
      validatedQc.references,
    );
    const noveltyDiagnostics = buildNoveltyDiagnostics(
      hypothesis.trim(),
      validatedQc.references,
      validatedQc.noveltySignal,
      { embeddingCosineByIndex: litEmbeddingCosines || undefined },
    );
    return res.json({ ...validatedQc, noveltyDiagnostics });
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
    const { hypothesis, priorFeedback = [], domain: clientDomain, dualFeedbackAb } = req.body || {};
    if (!hypothesis || typeof hypothesis !== "string" || hypothesis.trim().length < 6) {
      return res.status(400).json({ error: "Hypothesis is required." });
    }

    const tenantId = readTenantId(req);
    await initFeedbackStore();
    const baseHypo = hypothesis.trim();
    /** Set `LABMIND_STRICT_PLAN_GATES=1` to restore 422/502 on procurement, governance, safety, or LLM failure. */
    const strictReleaseGates = process.env.LABMIND_STRICT_PLAN_GATES === "1";
    const releaseDegraded = {
      stubReason: null,
      procurementAutoRepair: false,
      procurementBypassed: false,
      governanceAutoRepair: false,
      governanceBypassed: false,
      safetyBypassed: false,
    };
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
    const geminiModel = normalizeGeminiModelId(process.env.GEMINI_MODEL || "gemini-1.5-flash");
    const planLlamaFallbackModels = Array.from(
      new Set(
        [
          process.env.EXPERIMENT_PLAN_LLAMA_FALLBACK_MODEL,
          llama8Model,
          "llama-3.1-8b-instant",
        ].filter((m) => typeof m === "string" && m.trim().length > 0 && m.trim() !== llama70Model),
      ),
    );
    const retrievalPacket = await buildLiteratureRetrievalPacket({
      hypothesis: baseHypo,
      tavilyKey,
      llama8Model,
      priorFeedback: allPriorFeedback,
    });

    const dualOptIn =
      (dualFeedbackAb === true || process.env.LABMIND_DUAL_FEEDBACK_AB === "1") &&
      allPriorFeedback.length > 0 &&
      Boolean(tavilyKey);
    let dualGenerationResult = null;
    if (dualOptIn && process.env.GROQ_API_KEY) {
      const abStart = Date.now();
      try {
        const packetNoPrior = { ...retrievalPacket, priorFeedback: [] };
        let outlineAb = null;
        try {
          outlineAb = await generatePlanOutline({
            chatLlama,
            hypothesis: baseHypo,
            retrievalPacket: packetNoPrior,
            llama8Model,
          });
        } catch {
          outlineAb = null;
        }
        const promptAb = buildPlanPrompt({
          hypothesis: baseHypo,
          retrievalPacket: packetNoPrior,
          outline: outlineAb,
        });
        let rawAb;
        let modelAb = `llama70:${llama70Model}`;
        try {
          const abOut = await chatLlamaWithFallback({
            preferredModel: llama70Model,
            system: "You are a principal scientist creating executable experiment plans. Return strict JSON only.",
            user: promptAb,
            temperature: 0.15,
            fallbackModels: planLlamaFallbackModels,
          });
          rawAb = abOut.text;
          modelAb = `llama70:${abOut.model}`;
        } catch {
          const gemAb = await chatGeminiWithFallback({
            preferredModel: geminiModel,
            prompt: `${promptAb}\nIf uncertain, use conservative defaults and include VERIFY-CATALOG placeholders rather than fabricating exact numbers.`,
          });
          rawAb = gemAb.text;
          modelAb = `gemini:${gemAb.model}`;
        }
        const planAb = extractJsonObject(rawAb);
        if (planAb) {
          if (!hasMeaningfulReferences(planAb.literatureQC?.references)) {
            planAb.literatureQC = retrievalPacket.literatureQC;
          }
          const genIsoAb = new Date().toISOString();
          enrichMaterialQuoteFields(planAb, genIsoAb);
          normalizePlanFinancials(planAb);
          const qAb = evaluatePlanQuality({ hypothesis: baseHypo, plan: planAb });
          dualGenerationResult = {
            ran: true,
            scoreWithoutPriorReviews: qAb.scoreOutOf10,
            gatesPassedWithout: qAb.gatesPassed,
            planningModel: modelAb,
            latencyMs: Date.now() - abStart,
          };
        } else {
          dualGenerationResult = { ran: false, error: "Shadow plan JSON parse failed." };
        }
      } catch (e) {
        dualGenerationResult = { ran: false, error: e instanceof Error ? e.message : String(e) };
      }
    }

    let retrievalOutline = null;
    if (process.env.GROQ_API_KEY) {
      try {
        retrievalOutline = await generatePlanOutline({
          chatLlama,
          hypothesis: baseHypo,
          retrievalPacket,
          llama8Model,
        });
      } catch {
        retrievalOutline = null;
      }
    }

    const planPrompt = buildPlanPrompt({ hypothesis: baseHypo, retrievalPacket, outline: retrievalOutline });
    let planRaw;
    let planningModel = `llama70:${llama70Model}`;
    let llamaError = null;
    try {
      const planOut = await chatLlamaWithFallback({
        preferredModel: llama70Model,
        system: "You are a principal scientist creating executable experiment plans. Return strict JSON only.",
        user: planPrompt,
        temperature: 0.15,
        fallbackModels: planLlamaFallbackModels,
      });
      planRaw = planOut.text;
      planningModel = `llama70:${planOut.model}`;
    } catch (e) {
      llamaError = e instanceof Error ? e.message : String(e);
      // Groq exhausted → Gemini Flash (free-tier-safe fallbacks only)
      planningModel = "gemini:fallback";
      const geminiPrompt = `${planPrompt}\nIf uncertain, use conservative defaults and include VERIFY-CATALOG placeholders rather than fabricating exact numbers.`;
      try {
        const gem = await chatGeminiWithFallback({ preferredModel: geminiModel, prompt: geminiPrompt });
        planningModel = `gemini:${gem.model}`;
        planRaw = gem.text;
      } catch (gemErr) {
        const gm = gemErr instanceof Error ? gemErr.message : String(gemErr);
        if (strictReleaseGates) {
          return res.status(502).json({
            error: "All Groq plan models and Gemini fallback failed.",
            details: `groq error: ${llamaError || "unknown"} | gemini error: ${gm}`,
          });
        }
        planRaw = JSON.stringify(buildMinimalFallbackPlan(baseHypo, retrievalPacket));
        planningModel = "stub:llm-unavailable";
        releaseDegraded.stubReason = "llm_unavailable";
      }
    }

    let plan = extractJsonObject(planRaw);
    if (!plan) {
      if (strictReleaseGates) {
        return res.status(502).json({ error: "Plan model output could not be parsed as JSON." });
      }
      plan = buildMinimalFallbackPlan(baseHypo, retrievalPacket);
      planningModel = `${planningModel}+stub:json-fallback`;
      if (!releaseDegraded.stubReason) releaseDegraded.stubReason = "json_parse";
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
    plan.literatureQC.noveltyDiagnostics = buildNoveltyDiagnostics(
      baseHypo,
      plan.literatureQC.references || [],
      plan.literatureQC.noveltySignal,
      {
        experimentPlan: plan.experimentPlan,
        embeddingCosineByIndex: retrievalPacket.noveltyEmbeddingCosines || undefined,
      },
    );

    applyAllReleaseCompliancePatches({ hypothesis: baseHypo, plan });

    const scientificMechanistic = runScientificMechanisticValidation({
      hypothesis: baseHypo,
      plan,
    });

    let safetyCheck = runSafetyChecks({ hypothesis: baseHypo, plan });
    if (!safetyCheck.ok) {
      if (strictReleaseGates) {
        return res.status(422).json({
          error: "Plan requires human safety review before release.",
          details: safetyCheck.reason,
          requestId: res.locals.requestId,
        });
      }
      forceUniversalComplianceFooter({ plan });
      safetyCheck = runSafetyChecks({ hypothesis: baseHypo, plan });
      if (!safetyCheck.ok) {
        releaseDegraded.safetyBypassed = true;
        const ep = plan?.experimentPlan;
        if (ep && typeof ep === "object") {
          if (!ep.reasoning || typeof ep.reasoning !== "object") ep.reasoning = {};
          const gate =
            "Documented requirement: IRB approval, ethics approval, and institutional biosafety committee review before any high-risk execution.";
          const li = typeof ep.reasoning.literatureInfluence === "string" ? ep.reasoning.literatureInfluence.trim() : "";
          ep.reasoning.literatureInfluence = li ? `${li} ${gate}` : gate;
        }
        safetyCheck = runSafetyChecks({ hypothesis: baseHypo, plan });
      }
    }

    const generatedAtIso = new Date().toISOString();
    enrichMaterialQuoteFields(plan, generatedAtIso);
    normalizePlanFinancials(plan);

    let qualityChecks = evaluatePlanQuality({ hypothesis: baseHypo, plan });
    let groundingCheck = validatePlanGrounding(plan, retrievalPacket);
    if (groundingCheck.procurementGateFailed) {
      if (strictReleaseGates) {
        const feedbackLearningReport = computeFeedbackLearningReport({
          plan,
          allPriorFeedback,
          qualityChecks,
          dualGeneration: dualGenerationResult,
        });
        ensureFullPlanReasoningRoot(plan);
        return res.status(422).json({
          error: "Procurement grounding gate failed: critical reagents / antibodies / cell inputs must cite an allow-listed URL from literature QC or post-plan verification.",
          procurementGateErrors: groundingCheck.errors,
          procurementGateStats: groundingCheck.stats,
          requestId: res.locals.requestId,
          plan,
          qualityChecks: {
            ...qualityChecks,
            gatesPassed: false,
            errors: [...qualityChecks.errors, ...groundingCheck.errors],
            warnings: [...qualityChecks.warnings, ...groundingCheck.warnings],
          },
          scientificMechanistic,
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
            incorporationReport: buildIncorporationReport(allPriorFeedback),
            feedbackLearningReport,
          },
          metadata: {
            generatedAt: generatedAtIso,
            generationLatencyMs: Date.now() - started,
            strictReleaseGates: true,
          },
        });
      }
      const repair = repairProcurementGroundingForRelease(plan, retrievalPacket);
      releaseDegraded.procurementAutoRepair = repair.applied;
      qualityChecks = {
        ...qualityChecks,
        warnings: [...qualityChecks.warnings, ...repair.warnings],
      };
      groundingCheck = validatePlanGrounding(plan, retrievalPacket);
      if (groundingCheck.procurementGateFailed) {
        releaseDegraded.procurementBypassed = true;
        qualityChecks = {
          ...qualityChecks,
          warnings: [
            ...qualityChecks.warnings,
            ...groundingCheck.errors.map((e) => `RELEASE_DEGRADED_PROCUREMENT: ${e}`),
          ],
        };
      }
    }
    const extraOps = runOperationalExtraChecks({ hypothesis: baseHypo, plan, scientificMechanistic });
    qualityChecks = {
      ...qualityChecks,
      warnings: [...qualityChecks.warnings, ...groundingCheck.warnings, ...extraOps.warnings],
      errors: [...qualityChecks.errors, ...extraOps.errors],
    };
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

    const feedbackLearningReport = computeFeedbackLearningReport({
      plan,
      allPriorFeedback,
      qualityChecks,
      dualGeneration: dualGenerationResult,
    });

    let governanceCheck = validateGovernanceRelease({ hypothesis: baseHypo, plan });
    if (!governanceCheck.ok) {
      if (strictReleaseGates) {
        ensureFullPlanReasoningRoot(plan);
        return res.status(422).json({
          error:
            "Governance gate failed: when human subjects, vertebrate animal work, or elevated biocontainment / viral-vector work is implied, the plan must explicitly reference IRB/ethics, IACUC, or IBC review as appropriate.",
          governanceGateErrors: governanceCheck.errors,
          requestId: res.locals.requestId,
          tenantId,
          modelFlow: {
            retrievalModel: `${retrievalPacket.modelFlow?.retrieval || "tavily"} + source-check:${llama8Model}`,
            planningModel,
            retrievalOutlineUsed: Boolean(retrievalOutline),
          },
          plan,
          qualityChecks: {
            ...qualityChecks,
            gatesPassed: false,
            errors: [...qualityChecks.errors, ...governanceCheck.errors],
          },
          scientificMechanistic,
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
            incorporationReport: buildIncorporationReport(allPriorFeedback),
            feedbackLearningReport,
          },
          metadata: {
            generatedAt: generatedAtIso,
            generationLatencyMs: Date.now() - started,
            strictReleaseGates: true,
          },
        });
      }
      releaseDegraded.governanceAutoRepair = Boolean(forceUniversalComplianceFooter({ plan }));
      governanceCheck = validateGovernanceRelease({ hypothesis: baseHypo, plan });
      if (!governanceCheck.ok) {
        releaseDegraded.governanceBypassed = true;
        qualityChecks = {
          ...qualityChecks,
          warnings: [
            ...qualityChecks.warnings,
            ...governanceCheck.errors.map((e) => `RELEASE_DEGRADED_GOVERNANCE: ${e}`),
          ],
        };
      }
    }

    ensureFullPlanReasoningRoot(plan);
    return res.json({
      version: 1,
      requestId: res.locals.requestId,
      tenantId,
      modelFlow: {
        retrievalModel: `${retrievalPacket.modelFlow?.retrieval || "tavily"} + source-check:${llama8Model}`,
        planningModel,
        retrievalOutlineUsed: Boolean(retrievalOutline),
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
        incorporationReport: buildIncorporationReport(allPriorFeedback),
        feedbackLearningReport,
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
        generatedAt: generatedAtIso,
        generationLatencyMs: Date.now() - started,
        strictReleaseGates,
        releaseDegraded,
      },
      plan,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return res.status(500).json({ error: message, requestId: res.locals.requestId });
  }
});

/** Start HTTP when this file is the process entrypoint (Render, `node src/server.js`, etc.). */
function shouldStartHttpServer() {
  if (process.env.NODE_ENV === "test") return false;
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    const absEntry = path.resolve(entry);
    const absModule = fileURLToPath(import.meta.url);
    return pathToFileURL(absEntry).href === pathToFileURL(absModule).href;
  } catch {
    return entry.endsWith("server.js");
  }
}

if (shouldStartHttpServer()) {
  const server = app.listen(PORT, "0.0.0.0", async () => {
    try {
      const store = await initFeedbackStore();
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({ msg: "feedback_store_ready", mode: store.mode }));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("feedback_store_init_failed", e instanceof Error ? e.message : String(e));
    }
    // eslint-disable-next-line no-console
    console.log(`Backend listening on 0.0.0.0:${PORT}`);
  });
  server.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.error("server_listen_failed", err instanceof Error ? err.stack || err.message : String(err));
    process.exit(1);
  });
}

export { app };
