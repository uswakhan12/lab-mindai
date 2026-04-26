import test from "node:test";
import assert from "node:assert/strict";
import { validateGovernanceRelease, applyMinimalAnimalUseCompliancePatch } from "../src/governance-gate.js";

test("governance fails when clinical trial without IRB text", () => {
  const r = validateGovernanceRelease({
    hypothesis: "A randomized clinical trial of drug X in patients with diabetes.",
    plan: {
      experimentPlan: {
        protocol: { phases: [{ phaseName: "P1", steps: [{ title: "Enroll", description: "Recruit participants" }] }] },
      },
    },
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("IRB")));
});

test("governance passes when IRB explicitly in plan", () => {
  const r = validateGovernanceRelease({
    hypothesis: "A randomized clinical trial of drug X in patients.",
    plan: {
      experimentPlan: {
        protocol: {
          phases: [
            {
              phaseName: "Ethics",
              steps: [
                {
                  title: "IRB submission",
                  description: "Obtain IRB approval before any human subjects procedures.",
                },
              ],
            },
          ],
        },
      },
    },
  });
  assert.equal(r.ok, true);
});

test("governance fails for murine work without IACUC", () => {
  const r = validateGovernanceRelease({
    hypothesis: "C57BL/6 mice receive daily compound gavage.",
    plan: { experimentPlan: { title: "Mouse PK" } },
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("IACUC")));
});

test("in vitro cell line hypothesis passes without IRB boilerplate", () => {
  const r = validateGovernanceRelease({
    hypothesis: "Trehalose improves HeLa post-thaw viability vs DMSO.",
    plan: {
      experimentPlan: {
        title: "Cryopreservation",
        validation: { statisticalPlan: "Two-group t-test on viability %." },
      },
    },
  });
  assert.equal(r.ok, true);
});

test("governance passes when plan states no human subjects involved", () => {
  const r = validateGovernanceRelease({
    hypothesis: "Biomarker comparison in archived specimens.",
    plan: {
      experimentPlan: {
        reasoning: {
          literatureInfluence: "This characterization does not involve human subjects under 45 CFR 46.",
        },
      },
    },
  });
  assert.equal(r.ok, true);
});

test("governance fails for patient cohort without IRB", () => {
  const r = validateGovernanceRelease({
    hypothesis: "Drug effect in patients with NASH.",
    plan: { experimentPlan: { title: "Cohort" } },
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("IRB")));
});

test("governance fails for lentivirus without IBC", () => {
  const r = validateGovernanceRelease({
    hypothesis: "Lentiviral transduction of HEK293 cells for stable knockdown.",
    plan: { experimentPlan: { title: "Lenti prep" } },
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("IBC")));
});

test("governance passes when human whole blood is vendor-supplied matrix only", () => {
  const r = validateGovernanceRelease({
    hypothesis:
      "A biosensor will detect CRP in whole blood below 0.5 mg/L within 10 minutes without preprocessing.",
    plan: {
      experimentPlan: {
        reasoning: {
          literatureInfluence:
            "Spiking and calibration use commercially obtained pooled human EDTA whole blood (vendor catalog) — not human subjects research under local policy.",
        },
      },
    },
  });
  assert.equal(r.ok, true);
});

test("governance fails when whole blood is described without vendor or IRB framing", () => {
  const r = validateGovernanceRelease({
    hypothesis: "CRP detection in whole blood without preprocessing.",
    plan: {
      experimentPlan: {
        title: "Bench assay",
        protocol: { phases: [{ phaseName: "Run", steps: [{ title: "Test", description: "Apply donor whole blood to sensor." }] }] },
      },
    },
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("IRB")));
});

test("applyMinimalAnimalUseCompliancePatch adds IACUC when mice hypothesis lacks it", () => {
  const hypothesis =
    "Supplementing C57BL/6 mice with Lactobacillus rhamnosus GG for 4 weeks will reduce intestinal permeability.";
  const plan = {
    experimentPlan: {
      title: "Mouse permeability",
      reasoning: { literatureInfluence: "Prior work on tight junctions." },
    },
  };
  assert.equal(validateGovernanceRelease({ hypothesis, plan }).ok, false);
  assert.ok(applyMinimalAnimalUseCompliancePatch({ hypothesis, plan }));
  const r = validateGovernanceRelease({ hypothesis, plan });
  assert.equal(r.ok, true);
  assert.match(plan.experimentPlan.reasoning.literatureInfluence, /IACUC/i);
});

test("governance passes for live mouse work when IACUC is explicit", () => {
  const r = validateGovernanceRelease({
    hypothesis: "C57BL/6 mice supplemented with Lactobacillus rhamnosus GG for 4 weeks.",
    plan: {
      experimentPlan: {
        protocol: {
          phases: [
            {
              phaseName: "Ethics",
              steps: [
                {
                  title: "Approvals",
                  description: "All mouse procedures under approved IACUC protocol before gavage begins.",
                },
              ],
            },
          ],
        },
      },
    },
  });
  assert.equal(r.ok, true);
});

test("governance does not require IACUC for catalog anti-CRP antibody biosensor wording", () => {
  const r = validateGovernanceRelease({
    hypothesis:
      "A paper-based electrochemical biosensor functionalized with anti-CRP antibodies will detect C-reactive protein in whole blood at concentrations below 0.5 mg/L within 10 minutes.",
    plan: {
      experimentPlan: {
        title: "CRP paper sensor",
        reasoning: {
          literatureInfluence:
            "Calibration uses commercially obtained pooled human EDTA whole blood (vendor) — not human subjects research.",
        },
        materials: [
          {
            item: "Capture antibody",
            specification: "rabbit polyclonal anti-CRP IgG",
            supplier: "Vendor",
          },
        ],
        protocol: {
          phases: [
            {
              phaseName: "Assay",
              steps: [{ title: "Spotting", description: "Immobilize mouse monoclonal anti-CRP on working electrode." }],
            },
          ],
        },
      },
    },
  });
  assert.equal(r.ok, true);
});
