import test from "node:test";
import assert from "node:assert/strict";
import { cosineSimilarityVectors } from "../src/embedding-rerank.js";

test("cosineSimilarityVectors is 1 for identical vectors", () => {
  const v = [0.1, 0.2, 0.3];
  assert.ok(Math.abs(cosineSimilarityVectors(v, v) - 1) < 1e-6);
});

test("cosineSimilarityVectors orthogonal", () => {
  assert.ok(Math.abs(cosineSimilarityVectors([1, 0], [0, 1])) < 1e-6);
});
