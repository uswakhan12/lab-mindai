import test from "node:test";
import assert from "node:assert/strict";
import { powerFromHypothesis } from "../src/scientific-mechanistic.js";

test("powerFromHypothesis parses shorthand pp and applies in-vitro pilot floor", () => {
  const h = "Trehalose improves HeLa post-thaw viability by ≥15 pp versus DMSO control.";
  const out = powerFromHypothesis(h, "n = 12 biological replicates per arm");
  assert.ok(out.effect);
  assert.equal(out.effect.kind, "absolute_pp");
  assert.equal(out.reportedMeetsHeuristic, true);
  assert.equal(out.recommendedNPerGroup, 12);
});
