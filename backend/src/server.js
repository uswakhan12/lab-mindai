import "dotenv/config";
import cors from "cors";
import express from "express";

const app = express();
const PORT = Number(process.env.PORT || 8080);
const TAVILY_URL = "https://api.tavily.com/search";
/** Tavily rejects queries longer than this (see API error: "Max query length is 400 characters"). */
const TAVILY_MAX_QUERY_LENGTH = 400;
const TAVILY_QUERY_SUFFIX = "\n\npapers protocols prior work";

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

app.use(cors());
app.use(express.json());

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

async function tavilySearchRaw(apiKey, query) {
  const q = clipQuery(query);
  const resp = await fetch(TAVILY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey.trim()}`,
    },
    body: JSON.stringify({
      query: q,
      topic: "general",
      search_depth: "basic",
      max_results: 4,
      include_answer: false,
      include_raw_content: false,
    }),
  });
  if (!resp.ok) return [];
  const data = await resp.json();
  return Array.isArray(data?.results) ? data.results : [];
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
    protocol: `${title} ${dom} ${hypoShort} peer-reviewed laboratory protocol methods reproducibility`,
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

function inferGapPhaseName(hypothesis, startDay, endDay) {
  const len = Math.max(0, endDay - startDay + 1);
  const h = String(hypothesis || "").toLowerCase();
  if (/cryo|ln2|liquid nitrogen|freez|vitrif|vial|vapor|−80|−196|nitrogen|dry ice|-80|nitrogen/.test(h)) {
    return `Cryogenic / long-term storage (vapor–liquid N₂, −80°C, or quiescent hold; ${len}d)`;
  }
  if (/incubat|passage|subcultur|expansion|culture|confluen|grow|monolayer/.test(h)) {
    return `Cell expansion / culture (scheduled passes; ${len}d)`;
  }
  if (/mof|synth|reaction|stir|reflux|overnight|column|chromato/.test(h)) {
    return `Process hold / work-up / instrument queue (${len}d)`;
  }
  return `Interphase: active storage, incubation, reagent lead time, or equipment scheduling (${len}d)`;
}

/**
 * If the model leaves calendar gaps between phases, insert a real "storage" phase
 * (cryo, incubation, etc.) so scientists are not left wondering what to do.
 */
function fillTimelineGaps(hypothesis, plan) {
  const ep = plan?.experimentPlan;
  if (!ep || !Array.isArray(ep.timeline?.phases) || ep.timeline.phases.length < 1) return;

  const raw = ep.timeline.phases
    .filter((p) => p && Number.isFinite(p.startDay) && Number.isFinite(p.endDay))
    .map((p) => ({
      name: String(p.name || "Phase").trim() || "Phase",
      startDay: Math.round(p.startDay),
      endDay: Math.round(p.endDay),
      type: p.type,
      dependencies: Array.isArray(p.dependencies) ? p.dependencies : [],
    }));
  if (raw.length === 0) return;
  raw.sort((a, b) => a.startDay - b.startDay);

  const out = [];
  for (let i = 0; i < raw.length; i += 1) {
    if (i > 0) {
      const prev = out[out.length - 1];
      const cur = raw[i];
      if (cur.startDay > prev.endDay + 1) {
        const gapStart = prev.endDay + 1;
        const gapEnd = cur.startDay - 1;
        if (gapEnd >= gapStart) {
          out.push({
            name: inferGapPhaseName(hypothesis, gapStart, gapEnd),
            startDay: gapStart,
            endDay: gapEnd,
            type: "storage",
            dependencies: [prev.name],
          });
        }
      }
    }
    out.push(raw[i]);
  }
  if (out.length && out[0].startDay > 1) {
    const fs = out[0].startDay;
    out.unshift({
      name: inferGapPhaseName(hypothesis, 1, fs - 1),
      startDay: 1,
      endDay: fs - 1,
      type: "storage",
      dependencies: [],
    });
  }
  if (out.length) {
    const T = total;
    const last = out[out.length - 1];
    if (last.endDay < T) {
      const gapStart = last.endDay + 1;
      out.push({
        name: inferGapPhaseName(hypothesis, gapStart, T),
        startDay: gapStart,
        endDay: T,
        type: "storage",
        dependencies: [last.name],
      });
    }
  }
  out.sort((a, b) => a.startDay - b.startDay);
  ep.timeline.phases = out;
  const maxEnd = Math.max(...out.map((p) => p.endDay), ep.totalDurationDays || 0);
  if (Number.isFinite(maxEnd)) {
    ep.totalDurationDays = Math.max(ep.totalDurationDays || 0, maxEnd);
  }
}

function buildPlanPrompt({ hypothesis, retrievalPacket }) {
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
    "timeline":{"phases":[{"name":"string","startDay":0,"endDay":0,"type":"preparation|treatment|analysis|measurement|storage","dependencies":["string"]}]},
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
- **Timeline: use inclusive integer day indices from 1..totalDurationDays. Do not leave gaps** — every day must be assigned. Passive periods (e.g. vials in LN₂, −80°C hold, long incubation, reagent lead time) MUST appear as their own named phase, usually with "type": "storage" or "treatment", not as missing days.
- Timeline phase dependencies should follow execution order.
- Keep references and verificationSources grounded in retrieval packet.

Hypothesis:
${hypothesis}

Retrieval packet:
${JSON.stringify(retrievalPacket).slice(0, 120000)}
`;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/literature-qc", async (req, res) => {
  try {
    const { hypothesis } = req.body || {};
    if (!hypothesis || typeof hypothesis !== "string" || hypothesis.trim().length < 6) {
      return res.status(400).json({ error: "Hypothesis is required." });
    }

    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing TAVILY_API_KEY in backend environment." });
    }

    const query = buildTavilySearchQuery(hypothesis);

    const tavilyResp = await fetch(TAVILY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({
        query,
        topic: "general",
        search_depth: "basic",
        max_results: 5,
        include_answer: false,
        include_raw_content: false,
      }),
    });

    if (!tavilyResp.ok) {
      const errorText = await tavilyResp.text();
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
        error: `Tavily request failed (${tavilyResp.status}).`,
        details: tavilyMessage,
      });
    }

    const tavilyData = await tavilyResp.json();
    const qcResult = mapTavilyToQC(tavilyData);

    // Required by product design: Tavily retrieval + Llama 8B validation for relevance/novelty.
    const llama8Model = process.env.LLAMA8_MODEL || "llama-3.1-8b-instant";
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
      return res.json({
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
      });
    }

    return res.json({
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
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return res.status(500).json({ error: message });
  }
});

/**
 * Live web references per plan section (materials, budget, safety, etc.) for scientist verification.
 * Runs several bounded Tavily searches in parallel.
 */
app.post("/api/plan-sources", async (req, res) => {
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

app.post("/api/experiment-plan", async (req, res) => {
  try {
    const { hypothesis, priorFeedback = [] } = req.body || {};
    if (!hypothesis || typeof hypothesis !== "string" || hypothesis.trim().length < 6) {
      return res.status(400).json({ error: "Hypothesis is required." });
    }

    const baseHypo = hypothesis.trim();
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
    const retrievalPacket = {
      retrievalSummary:
        "No external retrieval used for this endpoint. Plan is generated from hypothesis + prior scientist feedback only.",
      literatureQC: {
        noveltySignal: "similar_exists",
        noveltyExplanation:
          "External literature retrieval is disabled for /api/experiment-plan. Use /api/literature-qc for validated retrieval.",
        references: [],
      },
      verificationSources: {
        protocol: [],
        materials: [],
        budget: [],
        timeline: [],
        validation: [],
        safety: [],
      },
      priorFeedback,
    };

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
    try {
      fillTimelineGaps(baseHypo, plan);
    } catch (e) {
      // non-fatal; return plan as model produced
    }

    // Plan is model-generated. Tavily is used only after generation for real citation links.
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
    if (!plan.literatureQC) {
      plan.literatureQC = retrievalPacket.literatureQC;
    }

    return res.json({
      version: 1,
      modelFlow: {
        retrievalModel: `source-check:${llama8Model}`,
        planningModel,
      },
      plan,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return res.status(500).json({ error: message });
  }
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend running at http://localhost:${PORT}`);
});
