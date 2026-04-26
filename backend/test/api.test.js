import test from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/server.js";

let server;
let baseUrl = "";

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const addr = server.address();
  if (!addr || typeof addr !== "object") throw new Error("Failed to bind test server.");
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

test.after(async () => {
  if (!server) return;
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

test("GET /health returns ok", async () => {
  const res = await fetch(`${baseUrl}/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
});

test("POST /api/literature-qc validates hypothesis input", async () => {
  const res = await fetch(`${baseUrl}/api/literature-qc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hypothesis: "abc" }),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error || "", /Hypothesis is required/i);
});

test("POST /api/experiment-plan validates hypothesis input", async () => {
  const res = await fetch(`${baseUrl}/api/experiment-plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hypothesis: "" }),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error || "", /Hypothesis is required/i);
});

test("POST /api/reviews and GET /api/reviews roundtrip", async () => {
  const review = {
    id: `test-${Date.now()}`,
    timestamp: new Date().toISOString(),
    hypothesis: "Trehalose improves HeLa post-thaw viability.",
    domain: "cell_biology",
    reviewerExpertise: "PI",
    overallRating: 4,
    issues: { protocol: "", materials: "", budget: "", timeline: "", validation: "" },
    corrections: { protocol: "Add controlled thaw duration.", materials: "", budget: "", timeline: "", validation: "" },
  };
  const create = await fetch(`${baseUrl}/api/reviews`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(review),
  });
  assert.equal(create.status, 201);

  const list = await fetch(`${baseUrl}/api/reviews?domain=cell_biology&limit=5`);
  assert.equal(list.status, 200);
  const payload = await list.json();
  assert.ok(Array.isArray(payload.reviews));
  assert.ok(payload.reviews.some((r) => r.id === review.id));
});
