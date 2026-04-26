#!/usr/bin/env node
/**
 * Optional live smoke: POST /api/experiment-plan for the four benchmark hypotheses.
 * Requires backend deps + env: TAVILY_API_KEY, GROQ_API_KEY or GEMINI_API_KEY, and
 * LABMIND_API_KEY if the server enforces it.
 *
 * Usage (from repo root, with backend/.env loaded):
 *   node backend/scripts/smoke-four-hypotheses.mjs http://127.0.0.1:8080
 */

const HYPOTHESES = [
  "A paper-based electrochemical biosensor functionalized with anti-CRP antibodies will detect C-reactive protein in whole blood at concentrations below 0.5 mg/L within 10 minutes, matching laboratory ELISA sensitivity without requiring sample preprocessing.",
  "Supplementing C57BL/6 mice with Lactobacillus rhamnosus GG for 4 weeks will reduce intestinal permeability by at least 30% compared to controls, measured by FITC-dextran assay, due to upregulation of tight junction proteins claudin-1 and occludin.",
  "Replacing sucrose with trehalose as a cryoprotectant in the freezing medium will increase post-thaw viability of HeLa cells by at least 15 percentage points compared to the standard DMSO protocol, due to trehalose's superior membrane stabilization at low temperatures.",
  "Introducing Sporomusa ovata into a bioelectrochemical system at a cathode potential of −400mV vs SHE will fix CO₂ into acetate at a rate of at least 150 mmol/L/day, outperforming current biocatalytic carbon capture benchmarks by at least 20%.",
];

const baseUrl = process.argv[2] || "http://127.0.0.1:8080";
const apiKey = process.env.LABMIND_API_KEY || "";

async function main() {
  if (!process.env.TAVILY_API_KEY || (!process.env.GROQ_API_KEY && !process.env.GEMINI_API_KEY)) {
    console.error("Skip live smoke: set TAVILY_API_KEY and GROQ_API_KEY or GEMINI_API_KEY.");
    process.exit(0);
  }
  const headers = { "Content-Type": "application/json" };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
    headers["x-api-key"] = apiKey;
  }
  for (let i = 0; i < HYPOTHESES.length; i++) {
    const hypothesis = HYPOTHESES[i];
    console.error(`\n--- Hypothesis ${i + 1} (${hypothesis.slice(0, 72)}…) ---`);
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/experiment-plan`, {
      method: "POST",
      headers,
      body: JSON.stringify({ hypothesis }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("FAIL", res.status, body.error || body);
      process.exitCode = 1;
      return;
    }
    console.error("OK", res.status, "quality gatesPassed=", body.qualityChecks?.gatesPassed);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
