import test from "node:test";
import assert from "node:assert/strict";
import {
  validatePlanGrounding,
  collectAllowedReleaseUrls,
  isProcurementCriticalMaterial,
} from "../src/grounding-validator.js";

test("procurement gate fails when critical reagent has PENDING grounding but allow-list exists", () => {
  const retrievalPacket = {
    literatureQC: {
      references: [{ url: "https://example.org/paper", title: "A" }],
    },
  };
  const plan = {
    experimentPlan: {
      materials: [
        {
          item: "Anti-CRP antibody",
          category: "Reagent",
          grounding: { sourceUrl: "PENDING", sourceTitle: "x" },
        },
      ],
    },
    verificationSources: {
      materials: [{ url: "https://vendor.example/sku", title: "V" }],
    },
  };
  const allowed = collectAllowedReleaseUrls(retrievalPacket, plan);
  assert.ok(allowed.size >= 2);
  const r = validatePlanGrounding(plan, retrievalPacket);
  assert.equal(r.procurementGateFailed, true);
  assert.ok(r.errors.some((e) => e.includes("PENDING")));
});

test("procurement gate passes when critical line cites verification URL", () => {
  const retrievalPacket = { literatureQC: { references: [] } };
  const plan = {
    experimentPlan: {
      materials: [
        {
          item: "HeLa cells",
          category: "Reagent",
          grounding: { sourceUrl: "https://atcc.org/products/ccl-2", sourceTitle: "ATCC" },
        },
      ],
    },
    verificationSources: {
      materials: [{ url: "https://atcc.org/products/ccl-2", title: "ATCC CCL-2" }],
    },
  };
  const r = validatePlanGrounding(plan, retrievalPacket);
  assert.equal(r.procurementGateFailed, false);
  assert.equal(r.errors.length, 0);
});

test("standard culture supplements FBS medium pen-strep are not procurement-critical", () => {
  assert.equal(
    isProcurementCriticalMaterial({ item: "Fetal bovine serum", category: "Reagent" }),
    false,
  );
  assert.equal(
    isProcurementCriticalMaterial({ item: "Cell culture medium", category: "Reagent" }),
    false,
  );
  assert.equal(
    isProcurementCriticalMaterial({ item: "Penicillin-streptomycin", category: "Reagent" }),
    false,
  );
  assert.equal(isProcurementCriticalMaterial({ item: "Anti-CRP antibody", category: "Reagent" }), true);
});

test("facility LN2 and viability readout lines are not procurement-critical", () => {
  assert.equal(
    isProcurementCriticalMaterial({ item: "LN2 access or facility fee", category: "Reagent" }),
    false,
  );
  assert.equal(isProcurementCriticalMaterial({ item: "Viability reagent", category: "Reagent" }), false);
});

test("bulk cryoprotectants are not procurement-gated as critical", () => {
  assert.equal(isProcurementCriticalMaterial({ item: "Trehalose", category: "Reagent" }), false);
  assert.equal(isProcurementCriticalMaterial({ item: "Sucrose", category: "Reagent" }), false);
  assert.equal(
    isProcurementCriticalMaterial({ item: "Freezing medium", category: "Reagent" }),
    false,
  );
});

test("cell line may cite major biobank host not in allow-list (HeLa + ATCC)", () => {
  const retrievalPacket = {
    literatureQC: {
      references: [{ url: "https://protocols.io/view/cryo-example", title: "Cryo" }],
    },
  };
  const plan = {
    experimentPlan: {
      materials: [
        {
          item: "HeLa cells",
          category: "Reagent",
          grounding: {
            sourceUrl: "https://catalog.atcc.org/en/products/cells-and-microorganisms/cell-lines",
            sourceTitle: "ATCC",
          },
        },
      ],
    },
    verificationSources: {
      materials: [{ url: "https://www.thermofisher.com/order/genetic-engineering", title: "TF" }],
    },
  };
  const r = validatePlanGrounding(plan, retrievalPacket);
  assert.equal(r.procurementGateFailed, false);
  assert.ok(r.warnings.some((w) => w.includes("PROCUREMENT_CELL_BANK")));
});

test("probiotic supplement and FITC-dextran permeability inputs are not procurement-critical", () => {
  assert.equal(
    isProcurementCriticalMaterial({ item: "Lactobacillus rhamnosus GG", specification: "10^9 CFU per dose", category: "Reagent" }),
    false,
  );
  assert.equal(
    isProcurementCriticalMaterial({ item: "FITC-dextran", specification: "4000 Da for permeability assay", category: "Reagent" }),
    false,
  );
});

test("live C57BL/6 mouse cohort lines are not procurement-critical", () => {
  assert.equal(
    isProcurementCriticalMaterial({
      item: "C57BL/6 mice",
      specification: "6-week-old females from vendor",
      category: "Reagent",
    }),
    false,
  );
});

test("paper biosensor substrate and CRP standard solutions are not procurement-critical", () => {
  assert.equal(
    isProcurementCriticalMaterial({ item: "Paper substrate", specification: "Whatman grade 1 for SPE", category: "Reagent" }),
    false,
  );
  assert.equal(
    isProcurementCriticalMaterial({ item: "CRP standard solutions", specification: "Lyophilized calibrator set", category: "Reagent" }),
    false,
  );
});

test("procurement gate passes antibody line on trusted vendor host with packet URLs present", () => {
  const retrievalPacket = {
    literatureQC: {
      references: [{ url: "https://example.org/paper-biosensor-review", title: "Review" }],
    },
  };
  const plan = {
    experimentPlan: {
      materials: [
        {
          item: "Anti-CRP capture antibody",
          category: "Reagent",
          grounding: { sourceUrl: "https://www.abcam.com/en-us/products/primary-antibodies/crp-antibody", sourceTitle: "Abcam" },
        },
        {
          item: "anti-CRP antibodies",
          category: "Reagent",
          grounding: { sourceUrl: "https://www.rndsystems.com/crp-antibody", sourceTitle: "R&D" },
        },
      ],
    },
    verificationSources: { materials: [] },
  };
  const r = validatePlanGrounding(plan, retrievalPacket);
  assert.equal(r.procurementGateFailed, false);
  assert.ok(r.warnings.filter((w) => w.includes("PROCUREMENT_ANTIBODY_VENDOR")).length >= 2);
});

test("CO2 gas and acetate production kits are not procurement-critical", () => {
  assert.equal(
    isProcurementCriticalMaterial({ item: "CO2 gas", specification: "99.9% for reactor headspace", category: "Reagent" }),
    false,
  );
  assert.equal(
    isProcurementCriticalMaterial({ item: "Acetate production kit", specification: "Colorimetric endpoint", category: "Reagent" }),
    false,
  );
});

test("Unicode CO₂ item label is treated as compressed gas supply", () => {
  assert.equal(
    isProcurementCriticalMaterial({ item: "CO\u2082", specification: "", category: "Reagent" }),
    false,
  );
});

test("Sporomusa bioelectrochemistry bench supplies are not procurement-critical when contextual", () => {
  assert.equal(
    isProcurementCriticalMaterial({
      item: "Graphite felt cathode",
      specification: "For Sporomusa ovata bioelectrochemical reactor",
      category: "Reagent",
    }),
    false,
  );
});

test("hostname match relaxes gate when path differs but host is allow-listed", () => {
  const retrievalPacket = { literatureQC: { references: [] } };
  const plan = {
    experimentPlan: {
      materials: [
        {
          item: "HeLa cells",
          category: "Reagent",
          grounding: { sourceUrl: "https://www.atcc.org/en/Products/Cells_and_Microorganisms/Continuous_Cell_Lines.aspx", sourceTitle: "ATCC" },
        },
      ],
    },
    verificationSources: {
      materials: [{ url: "https://atcc.org/products/ccl-2", title: "ATCC CCL-2" }],
    },
  };
  const r = validatePlanGrounding(plan, retrievalPacket);
  assert.equal(r.procurementGateFailed, false);
  assert.ok(r.warnings.some((w) => w.includes("PROCUREMENT_RELAXED")));
});
