import test from "node:test";
import assert from "node:assert/strict";
import { validateGovernanceRelease } from "../src/governance-gate.js";

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

test("governance fails for lentivirus without IBC", () => {
  const r = validateGovernanceRelease({
    hypothesis: "Lentiviral transduction of HEK293 cells for stable knockdown.",
    plan: { experimentPlan: { title: "Lenti prep" } },
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("IBC")));
});
