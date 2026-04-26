import test from "node:test";
import assert from "node:assert/strict";
import { buildNoveltyDiagnostics } from "../src/novelty-diagnostics.js";

test("novelty diagnostics includes trigram fusion fields", () => {
  const refs = [
    {
      title: "Cryopreservation of mammalian cells",
      relevance: "We describe controlled-rate freezing for HeLa viability recovery.",
      url: "https://example.org/p1",
      score: 0.88,
    },
  ];
  const d = buildNoveltyDiagnostics(
    "HeLa cryopreservation viability after DMSO freezing",
    refs,
    "similar_exists",
    {
      experimentPlan: {
        protocol: {
          phases: [
            {
              phaseName: "Cryo",
              steps: [{ title: "Controlled-rate freezing", description: "DMSO cryoprotectant ramp." }],
            },
          ],
        },
      },
    },
  );
  assert.equal(typeof d.topTrigramSimilarity, "number");
  assert.ok(d.topTrigramSimilarity >= 0);
  assert.equal(typeof d.topCombinedEvidence, "number");
  assert.ok(d.perReference[0].trigramSimilarity != null);
  assert.ok(d.rerankMethod.includes("trigram"));
});
