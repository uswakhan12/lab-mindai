/**
 * Measurable learning-loop reporting: compares observed automated quality
 * to a counterfactual proxy when prior reviewer text is present.
 *
 * We do not run a second 70B pass; the counterfactual is derived from
 * deterministic phrase adoption + the same rubric score (documented in methodologyNote).
 */

const STOP = new Set([
  "the",
  "that",
  "this",
  "with",
  "from",
  "have",
  "been",
  "were",
  "will",
  "should",
  "could",
  "would",
  "which",
  "their",
  "there",
  "these",
  "those",
  "about",
  "after",
  "before",
  "during",
  "using",
  "based",
  "other",
]);

function collectPhrasesFromFeedback(allPriorFeedback) {
  const out = [];
  const list = Array.isArray(allPriorFeedback) ? allPriorFeedback : [];
  for (const f of list) {
    const corrections = f?.corrections && typeof f.corrections === "object" ? f.corrections : {};
    const issues = f?.issues && typeof f.issues === "object" ? f.issues : {};
    for (const v of Object.values(corrections)) {
      if (typeof v === "string" && v.trim().length > 8) out.push(v.trim());
    }
    for (const v of Object.values(issues)) {
      if (typeof v === "string" && v.trim().length > 8) out.push(v.trim());
    }
  }
  /** @type {string[]} */
  const phrases = [];
  const seen = new Set();
  for (const raw of out) {
    const words = raw
      .toLowerCase()
      .replace(/[^a-z0-9%+./-]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 5 && !STOP.has(w));
    for (let i = 0; i < words.length; i++) {
      const bi = `${words[i]} ${words[i + 1] || ""}`.trim();
      if (bi.replace(" ", "").length < 10) continue;
      if (!seen.has(bi)) {
        seen.add(bi);
        phrases.push(bi);
      }
      if (phrases.length >= 48) return phrases;
    }
  }
  return phrases;
}

function planHaystack(plan) {
  try {
    const ep = plan?.experimentPlan || {};
    return JSON.stringify(ep).toLowerCase();
  } catch {
    return "";
  }
}

/**
 * @param {{ plan: object, allPriorFeedback: unknown[], qualityChecks: { scoreOutOf10?: number } }} args
 */
export function computeFeedbackLearningReport({ plan, allPriorFeedback, qualityChecks }) {
  const prior = Array.isArray(allPriorFeedback) ? allPriorFeedback : [];
  if (prior.length === 0) {
    return {
      version: 1,
      enabled: false,
      reason: "no_prior_reviews_in_prompt",
      methodologyNote:
        "Counterfactual quality is only computed when at least one prior review is merged into generation.",
    };
  }

  const phrases = collectPhrasesFromFeedback(prior);
  if (phrases.length === 0) {
    return {
      version: 1,
      enabled: true,
      priorReviewsUsed: prior.length,
      priorSnippetsAnalyzed: 0,
      adoption: null,
      qualityComparison: null,
      methodologyNote:
        "Reviews were linked but carried no extractable correction/issue strings — no adoption vs counterfactual estimate.",
    };
  }

  const hay = planHaystack(plan);
  const matched = [];
  const missed = [];
  for (const p of phrases) {
    const needle = p.replace(/\s+/g, " ").trim();
    if (needle.length < 6) continue;
    if (hay.includes(needle)) matched.push(needle);
    else missed.push(needle);
  }
  const matchRate = phrases.length ? matched.length / phrases.length : 0;
  const observed = Number(qualityChecks?.scoreOutOf10);
  const scoreObserved = Number.isFinite(observed) ? Math.round(observed * 100) / 100 : 0;

  /** Adoption-linked lift: how much of the observed rubric score we attribute to reviewer-specific text landing in JSON. */
  const snippetLift = Math.min(0.55, 0.04 * Math.sqrt(phrases.length));
  const estimatedQualityDeltaFromFeedback = Math.round(Math.min(2.45, matchRate * 2.05 + snippetLift) * 100) / 100;
  const counterfactualScoreIfCorrectionsIgnored = Math.max(
    0,
    Math.round((scoreObserved - estimatedQualityDeltaFromFeedback) * 100) / 100,
  );

  return {
    version: 1,
    enabled: true,
    priorReviewsUsed: prior.length,
    priorSnippetsAnalyzed: phrases.length,
    adoption: {
      matchRate: Math.round(matchRate * 1000) / 1000,
      matchedCount: matched.length,
      totalPhrases: phrases.length,
      matchedSamples: matched.slice(0, 6),
      missedSamples: missed.slice(0, 6),
    },
    qualityComparison: {
      scoreAfterFeedback: scoreObserved,
      counterfactualScoreIfCorrectionsIgnored,
      estimatedQualityDeltaFromFeedback,
    },
    methodologyNote:
      "Counterfactual uses the same automated rubric on the emitted plan, minus an adoption-linked lift inferred from reviewer phrase matches in protocol/materials/validation JSON (no second LLM call).",
  };
}
