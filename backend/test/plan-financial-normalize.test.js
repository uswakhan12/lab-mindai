import test from "node:test";
import assert from "node:assert/strict";
import { normalizePlanFinancials } from "../src/plan-financial-normalize.js";

test("normalizePlanFinancials aligns header and budget with material sum", () => {
  const plan = {
    experimentPlan: {
      totalCostUSD: 999,
      materials: [
        { item: "A", totalCostUSD: 400 },
        { item: "B", totalCostUSD: 600 },
      ],
      budget: {
        byCategory: [
          { category: "Reagents", amountUSD: 300 },
          { category: "Disposables", amountUSD: 700 },
        ],
        contingencyPercent: 10,
        totalWithContingencyUSD: 999,
      },
    },
  };
  normalizePlanFinancials(plan);
  assert.equal(plan.experimentPlan.totalCostUSD, 1000);
  const sub = plan.experimentPlan.budget.byCategory.reduce((s, b) => s + b.amountUSD, 0);
  assert.equal(sub, 1000);
  assert.equal(plan.experimentPlan.budget.totalWithContingencyUSD, 1100);
});

test("normalizePlanFinancials fills empty budget from materials", () => {
  const plan = {
    experimentPlan: {
      materials: [{ item: "X", totalCostUSD: 500 }],
      budget: { byCategory: [], contingencyPercent: 0 },
    },
  };
  normalizePlanFinancials(plan);
  assert.equal(plan.experimentPlan.totalCostUSD, 500);
  assert.equal(plan.experimentPlan.budget.byCategory[0].amountUSD, 500);
  assert.equal(plan.experimentPlan.budget.totalWithContingencyUSD, 500);
});

test("normalizePlanFinancials creates budget when missing and material sum is zero but header has cost", () => {
  const plan = {
    experimentPlan: {
      totalCostUSD: 2400,
      materials: [{ item: "X", totalCostUSD: 0 }],
    },
  };
  normalizePlanFinancials(plan);
  assert.ok(plan.experimentPlan.budget);
  assert.equal(plan.experimentPlan.budget.byCategory[0].amountUSD, 2400);
  assert.equal(plan.experimentPlan.budget.totalWithContingencyUSD, 2640);
});

test("normalizePlanFinancials ensures budget shell when plan has empty materials and no cost", () => {
  const plan = { experimentPlan: { materials: [] } };
  normalizePlanFinancials(plan);
  assert.ok(Array.isArray(plan.experimentPlan.budget.byCategory));
  assert.equal(plan.experimentPlan.budget.totalWithContingencyUSD, 0);
});
