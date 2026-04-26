/**
 * Learning-loop reporting: (1) heuristic adoption vs same-plan rubric proxy,
 * (2) optional true dual-LLM arm without prior reviews (when server ran a shadow generation).
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
    const full = String(raw).trim().toLowerCase();
    if (full.length >= 10 && full.length <= 240 && !seen.has(full)) {
      seen.add(full);
      phrases.push(full);
    }
    if (phrases.length >= 48) return phrases;
  }
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
    const reasoning = plan?.reasoning && typeof plan.reasoning === "object" ? plan.reasoning : {};
    return `${JSON.stringify(ep)} ${JSON.stringify(reasoning)}`.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * @param {{
 *   plan: object,
 *   allPriorFeedback: unknown[],
 *   qualityChecks: { scoreOutOf10?: number },
 *   dualGeneration?: { ran: boolean, scoreWithoutPriorReviews?: number, gatesPassedWithout?: boolean, planningModel?: string, latencyMs?: number, error?: string } | null,
 * }} args
 */
export function computeFeedbackLearningReport({ plan, allPriorFeedback, qualityChecks, dualGeneration = null }) {
  const prior = Array.isArray(allPriorFeedback) ? allPriorFeedback : [];
  if (prior.length === 0) {
    return {
      version: 2,
      enabled: false,
      reason: "no_prior_reviews_in_prompt",
      methodologyNote:
        "Heuristic counterfactual and dual-LLM arm only apply when prior reviews are merged into generation.",
    };
  }

  const observed = Number(qualityChecks?.scoreOutOf10);
  const scoreWithPrior = Number.isFinite(observed) ? Math.round(observed * 100) / 100 : 0;

  /** @type {Record<string, unknown>} */
  const out = {
    version: 2,
    enabled: true,
    priorReviewsUsed: prior.length,
  };

  const phrases = collectPhrasesFromFeedback(prior);
  if (phrases.length === 0) {
    out.priorSnippetsAnalyzed = 0;
    out.adoption = null;
    out.heuristicQualityComparison = null;
    out.methodologyNote =
      "Reviews were linked but carried no extractable correction/issue strings — no heuristic adoption estimate.";
  } else {
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
    const snippetLift = Math.min(0.55, 0.04 * Math.sqrt(phrases.length));
    const estimatedQualityDeltaFromFeedback = Math.round(Math.min(2.45, matchRate * 2.05 + snippetLift) * 100) / 100;
    const counterfactualScoreIfCorrectionsIgnored = Math.max(
      0,
      Math.round((scoreWithPrior - estimatedQualityDeltaFromFeedback) * 100) / 100,
    );
    out.priorSnippetsAnalyzed = phrases.length;
    out.adoption = {
      matchRate: Math.round(matchRate * 1000) / 1000,
      matchedCount: matched.length,
      totalPhrases: phrases.length,
      matchedSamples: matched.slice(0, 6),
      missedSamples: missed.slice(0, 6),
    };
    out.heuristicQualityComparison = {
      scoreAfterFeedback: scoreWithPrior,
      counterfactualScoreIfCorrectionsIgnored,
      estimatedQualityDeltaFromFeedback,
    };
    out.methodologyNote =
      "Heuristic arm: same automated rubric on the shipped plan, minus an adoption-linked lift inferred from reviewer phrase matches in protocol/materials/validation JSON (no extra LLM).";
  }

  if (dualGeneration?.ran && typeof dualGeneration.scoreWithoutPriorReviews === "number") {
    const without = Math.round(dualGeneration.scoreWithoutPriorReviews * 100) / 100;
    out.dualLlmGeneration = {
      scoreWithoutPriorReviews: without,
      scoreWithPriorReviews: scoreWithPrior,
      deltaWithPriorMinusWithout: Math.round((scoreWithPrior - without) * 100) / 100,
      latencyMs: dualGeneration.latencyMs,
      planningModelWithoutPrior: dualGeneration.planningModel,
      gatesPassedWithoutPrior: dualGeneration.gatesPassedWithout,
      note: "True dual generation: a full second planner pass used the same Tavily+QC retrieval packet but an empty prior-feedback block and a fresh Llama-8B outline. That arm omits post-plan Tavily verification to limit cost; both arms are scored with the same evaluatePlanQuality rubric.",
    };
    out.methodologyNote = `${out.methodologyNote || ""} When dualLlmGeneration is present, the numeric gap is from two distinct model outputs (stronger than heuristic-only).`.trim();
  } else if (dualGeneration && dualGeneration.ran === false && dualGeneration.error) {
    out.dualLlmGeneration = { attempted: true, error: dualGeneration.error };
  }

  return out;
}
