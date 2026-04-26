import test from "node:test";
import assert from "node:assert/strict";
import { ensureFullPlanReasoningRoot } from "../src/plan-reasoning-normalize.js";

test("ensureFullPlanReasoningRoot lifts nested experimentPlan.reasoning to plan root", () => {
  const plan = {
    domain: "x",
    hypothesisAnalysis: {},
    literatureQC: { noveltySignal: "similar_exists", noveltyExplanation: "", references: [] },
    experimentPlan: {
      title: "t",
      totalCostUSD: 1,
      totalDurationDays: 1,
      difficultyLevel: "Intermediate",
      expertiseTags: [],
      protocol: { phases: [] },
      materials: [],
      budget: { byCategory: [], contingencyPercent: 0, totalWithContingencyUSD: 0 },
      timeline: { phases: [] },
      validation: {
        successMetrics: [],
        statisticalPlan: "",
        sampleSize: "",
        controls: { positive: "", negative: "" },
        failureModes: [],
        qcCheckpoints: [],
      },
      safety: { hazardousMaterials: [], requiredPPE: [], wasteDisposal: [], emergencyProcedures: [] },
      reasoning: {
        repositoriesConsulted: ["PubMed"],
        budgetMethodology: "Sum",
        literatureInfluence: "Nested only",
        confidence: [{ section: "protocol", level: "High", reason: "ok" }],
      },
    },
  };
  ensureFullPlanReasoningRoot(plan);
  assert.equal(plan.reasoning.literatureInfluence, "Nested only");
  assert.deepEqual(plan.reasoning.repositoriesConsulted, ["PubMed"]);
  assert.equal(plan.experimentPlan.reasoning.literatureInfluence, "Nested only");
});

test("ensureFullPlanReasoningRoot fills defaults when reasoning missing", () => {
  const plan = {
    domain: "x",
    hypothesisAnalysis: {},
    literatureQC: { noveltySignal: "similar_exists", noveltyExplanation: "", references: [] },
    experimentPlan: {
      title: "t",
      totalCostUSD: 1,
      totalDurationDays: 1,
      difficultyLevel: "Intermediate",
      expertiseTags: [],
      protocol: { phases: [] },
      materials: [],
      budget: { byCategory: [], contingencyPercent: 0, totalWithContingencyUSD: 0 },
      timeline: { phases: [] },
      validation: {
        successMetrics: [],
        statisticalPlan: "",
        sampleSize: "",
        controls: { positive: "", negative: "" },
        failureModes: [],
        qcCheckpoints: [],
      },
      safety: { hazardousMaterials: [], requiredPPE: [], wasteDisposal: [], emergencyProcedures: [] },
    },
  };
  ensureFullPlanReasoningRoot(plan);
  assert.ok(Array.isArray(plan.reasoning.repositoriesConsulted));
  assert.ok(plan.reasoning.literatureInfluence.length > 0);
  assert.ok(Array.isArray(plan.reasoning.confidence));
});
