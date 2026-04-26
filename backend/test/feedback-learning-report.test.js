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
  assert.ok(r.qualityComparison.estimatedQualityDeltaFromFeedback > 0);
  assert.ok(
    r.qualityComparison.counterfactualScoreIfCorrectionsIgnored <
      r.qualityComparison.scoreAfterFeedback,
  );
});
