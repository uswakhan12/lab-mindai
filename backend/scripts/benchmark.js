const BASE_URL = process.env.BENCHMARK_BASE_URL || "http://localhost:8080";

const SAMPLE_HYPOTHESES = [
  "A paper-based electrochemical biosensor functionalized with anti-CRP antibodies will detect C-reactive protein in whole blood at concentrations below 0.5 mg/L within 10 minutes, matching laboratory ELISA sensitivity without requiring sample preprocessing.",
  "Supplementing C57BL/6 mice with Lactobacillus rhamnosus GG for 4 weeks will reduce intestinal permeability by at least 30% compared to controls, measured by FITC-dextran assay, due to upregulation of tight junction proteins claudin-1 and occludin.",
  "Replacing sucrose with trehalose as a cryoprotectant in the freezing medium will increase post-thaw viability of HeLa cells by at least 15 percentage points compared to the standard DMSO protocol, due to trehalose membrane stabilization at low temperatures.",
  "Introducing Sporomusa ovata into a bioelectrochemical system at a cathode potential of -400mV vs SHE will fix CO2 into acetate at a rate of at least 150 mmol/L/day, outperforming current biocatalytic carbon capture benchmarks by at least 20%.",
];

async function runOne(hypothesis) {
  const started = Date.now();
  const res = await fetch(`${BASE_URL}/api/experiment-plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hypothesis, priorFeedback: [] }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      latencyMs: Date.now() - started,
      error: body?.error || "Unknown error",
      details: body?.details || "",
    };
  }
  return {
    ok: true,
    latencyMs: Date.now() - started,
    qualityChecks: body?.qualityChecks,
    modelFlow: body?.modelFlow,
    requestId: body?.requestId,
  };
}

function summarize(results) {
  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  const avgScore =
    ok.length > 0
      ? ok.reduce((sum, r) => sum + Number(r?.qualityChecks?.scoreOutOf10 || 0), 0) / ok.length
      : 0;
  const gatePassRate =
    ok.length > 0
      ? ok.filter((r) => Boolean(r?.qualityChecks?.gatesPassed)).length / ok.length
      : 0;
  const avgLatency = results.reduce((sum, r) => sum + Number(r.latencyMs || 0), 0) / Math.max(1, results.length);
  return {
    total: results.length,
    succeeded: ok.length,
    failed: failed.length,
    averageScoreOutOf10: Math.round(avgScore * 100) / 100,
    qualityGatePassRate: `${Math.round(gatePassRate * 100)}%`,
    averageLatencyMs: Math.round(avgLatency),
  };
}

async function main() {
  // eslint-disable-next-line no-console
  console.log(`Running benchmark against ${BASE_URL}`);
  const results = [];
  for (let i = 0; i < SAMPLE_HYPOTHESES.length; i++) {
    const hypothesis = SAMPLE_HYPOTHESES[i];
    // eslint-disable-next-line no-console
    console.log(`\n[${i + 1}/${SAMPLE_HYPOTHESES.length}] Generating plan...`);
    // eslint-disable-next-line no-await-in-loop
    const out = await runOne(hypothesis);
    results.push(out);
    if (out.ok) {
      // eslint-disable-next-line no-console
      console.log(
        `OK | score ${out.qualityChecks?.scoreOutOf10 ?? "n/a"} | gates ${out.qualityChecks?.gatesPassed ? "pass" : "fail"} | ${out.latencyMs}ms`,
      );
    } else {
      // eslint-disable-next-line no-console
      console.log(`FAIL | status ${out.status} | ${out.error} | ${out.latencyMs}ms`);
    }
  }
  const summary = summarize(results);
  // eslint-disable-next-line no-console
  console.log("\n=== Benchmark Summary ===");
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Benchmark failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
