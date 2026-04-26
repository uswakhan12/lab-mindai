import test from "node:test";
import assert from "node:assert/strict";
import { validatePlanGrounding, collectAllowedReleaseUrls } from "../src/grounding-validator.js";

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
