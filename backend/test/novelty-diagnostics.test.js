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

test("novelty uses embedding cosine when provided", () => {
  const refs = [
    { title: "Unrelated cooking", relevance: "Recipes for pasta.", url: "https://ex.org/a", score: 0.9 },
    { title: "CRP ELISA protocol", relevance: "C-reactive protein immunoassay steps.", url: "https://ex.org/b", score: 0.5 },
  ];
  const d = buildNoveltyDiagnostics(
    "CRP immunoassay for inflammation biomarker",
    refs,
    "similar_exists",
    { embeddingCosineByIndex: [0.05, 0.88] },
  );
  assert.ok(d.rerankMethod.includes("openai"));
  assert.ok(typeof d.topEmbeddingSimilarity === "number");
  assert.ok(d.perReference[1].embeddingSimilarity >= 0.85);
});
