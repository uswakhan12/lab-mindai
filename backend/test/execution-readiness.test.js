import test from "node:test";
import assert from "node:assert/strict";
import { computeExecutionReadiness } from "../src/execution-readiness.js";

function mkPlan(overrides = {}) {
  const phases = Array.from({ length: 6 }, (_, i) => ({
    stepNumber: i + 1,
    title: `Cryopreservation step ${i + 1} trehalose medium`,
    description: `Execute laboratory freeze protocol segment ${i + 1} with trehalose cryoprotectant for hela cells.`,
    durationHours: 2,
    safetyWarnings: [],
    criticalNotes: [],
  }));
  const materials = Array.from({ length: 8 }, (_, i) => ({
    item: `Reagent ${i}`,
    specification: "USP",
    quantity: "1",
    supplier: "Vendor",
    catalogNumber: i === 7 ? "VERIFY-CATALOG" : `SKU-${i}`,
    unitPriceUSD: 100,
    totalCostUSD: 1250,
    category: "Reagent",
    leadTimeWeeks: 1,
  }));
  const tNames = ["Prep", "Treatment", "Analysis", "Reporting"];
  const timelinePhases = tNames.map((name, i) => ({
    name,
    startDay: i * 10,
    endDay: i * 10 + 9,
    type: "preparation",
    dependencies: i === 0 ? [] : [tNames[i - 1]],
  }));

  const base = {
    literatureQC: { references: [{ title: "Prior cryo study" }] },
    experimentPlan: {
      title: "Trehalose cryoprotectant hela post-thaw viability benchmark",
      totalCostUSD: 10000,
      totalDurationDays: 39,
      difficultyLevel: "Intermediate",
      expertiseTags: [],
      protocol: { phases: [{ phaseName: "Wet lab", steps: phases }] },
      materials,
      budget: {
        byCategory: [{ category: "Reagents", amountUSD: 8000 }],
        contingencyPercent: 10,
        totalWithContingencyUSD: 8800,
      },
      timeline: { phases: timelinePhases },
      validation: {
        successMetrics: ["viability"],
        statisticalPlan: "Two-sample t-test with p < 0.05",
        sampleSize: "n = 12 biological replicates per arm",
        controls: { positive: "DMSO", negative: "untreated" },
        failureModes: [],
        qcCheckpoints: [],
      },
      safety: {
        hazardousMaterials: [],
        requiredPPE: ["gloves", "lab coat"],
        wasteDisposal: ["biohazard"],
        emergencyProcedures: ["spill kit"],
      },
    },
    verificationSources: {
      protocol: [{ title: "Cryo protocol trehalose", url: "https://x", snippet: "trehalose hela", validationStatus: "validated" }],
      materials: [{ title: "SKU sheet", url: "https://y", snippet: "reagent", validationStatus: "validated" }],
      budget: [{ title: "Lab costing", url: "https://z", snippet: "budget", validationStatus: "validated" }],
      timeline: [],
      validation: [],
      safety: [],
    },
    reasoning: {
      repositoriesConsulted: [],
      budgetMethodology: "",
      literatureInfluence: "",
      confidence: [],
    },
    domain: "cell_biology",
  };
  return { ...base, ...overrides };
}

test("computeExecutionReadiness awards order_ready for coherent mock plan", () => {
  const plan = mkPlan();
  const qualityChecks = { gatesPassed: true, errors: [], warnings: [] };
  const scientificMechanistic = { assayCompatibility: [], powerSketch: { reportedMeetsHeuristic: true } };
  const er = computeExecutionReadiness({
    hypothesis: "Replacing sucrose with trehalose improves post-thaw viability of HeLa cells.",
    plan,
    qualityChecks,
    scientificMechanistic,
  });
  assert.equal(er.tier, "order_ready");
  assert.ok(er.scoreOutOf10 >= 9);
  assert.ok(er.checklist.length >= 10);
  assert.ok(er.checklist.every((c) => typeof c.ok === "boolean"));
});

test("computeExecutionReadiness downgrades when QC errors exist", () => {
  const plan = mkPlan();
  const qualityChecks = { gatesPassed: false, errors: ["Protocol must contain at least 4 executable steps."], warnings: [] };
  const er = computeExecutionReadiness({
    hypothesis: "Trehalose hela",
    plan,
    qualityChecks,
    scientificMechanistic: {},
  });
  assert.equal(er.tier, "draft");
  assert.ok(er.scoreOutOf10 < 9);
});
