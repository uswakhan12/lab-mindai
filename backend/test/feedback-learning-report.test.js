import test from "node:test";
import assert from "node:assert/strict";
import { computeFeedbackLearningReport } from "../src/feedback-learning-report.js";

test("learning report disabled when no prior feedback", () => {
  const r = computeFeedbackLearningReport({
    plan: { experimentPlan: { title: "T" } },
    allPriorFeedback: [],
    qualityChecks: { scoreOutOf10: 7.5 },
  });
  assert.equal(r.enabled, false);
  assert.equal(r.version, 2);
});

test("learning report shows positive delta when correction phrases appear in plan", () => {
  const phrase = "Ensure cryopreservation viability metrics are tracked in the thaw log.";
  const r = computeFeedbackLearningReport({
    plan: {
      experimentPlan: {
        protocol: {
          phases: [
            {
              phaseName: "Thaw",
              steps: [
                {
                  title: "QC",
                  description: "cryopreservation viability metrics must appear in thaw log entries.",
                },
              ],
            },
          ],
        },
      },
    },
    allPriorFeedback: [
      {
        corrections: { protocol: phrase, materials: "", budget: "", timeline: "", validation: "" },
        issues: {},
      },
    ],
    qualityChecks: { scoreOutOf10: 8.0 },
  });
  assert.equal(r.enabled, true);
  assert.ok(r.adoption.matchRate > 0);
  assert.ok(r.heuristicQualityComparison.estimatedQualityDeltaFromFeedback > 0);
  assert.ok(
    r.heuristicQualityComparison.counterfactualScoreIfCorrectionsIgnored <
      r.heuristicQualityComparison.scoreAfterFeedback,
  );
});

test("learning report merges dual LLM arm when provided", () => {
  const r = computeFeedbackLearningReport({
    plan: { experimentPlan: { title: "T" } },
    allPriorFeedback: [{ corrections: { protocol: "alpha beta gamma", materials: "", budget: "", timeline: "", validation: "" }, issues: {} }],
    qualityChecks: { scoreOutOf10: 7.5 },
    dualGeneration: {
      ran: true,
      scoreWithoutPriorReviews: 6.2,
      gatesPassedWithout: true,
      planningModel: "llama70:mock",
      latencyMs: 1200,
    },
  });
  assert.ok(r.dualLlmGeneration);
  assert.equal(r.dualLlmGeneration.deltaWithPriorMinusWithout, 1.3);
});
