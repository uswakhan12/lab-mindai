/**
 * Lab execution readiness: deterministic checks that approximate
 * "would a PI order materials Monday?" beyond raw LLM output.
 */

const SECTIONS = ["protocol", "materials", "budget", "timeline", "validation", "safety"];

function countProtocolSteps(plan) {
  const phases = Array.isArray(plan?.experimentPlan?.protocol?.phases) ? plan.experimentPlan.protocol.phases : [];
  return phases.reduce((n, p) => n + (Array.isArray(p?.steps) ? p.steps.length : 0), 0);
}

function validatedSectionCount(verificationSources) {
  let n = 0;
  for (const key of SECTIONS) {
    const list = Array.isArray(verificationSources?.[key]) ? verificationSources[key] : [];
    if (list.some((s) => s?.validationStatus === "validated")) n += 1;
  }
  return n;
}

function timelineDependencyCheck(phases) {
  const names = new Set(
    phases.map((p) => String(p?.name || "").trim()).filter(Boolean),
  );
  if (names.size !== phases.filter((p) => String(p?.name || "").trim()).length) {
    return { ok: false, detail: "Timeline phase names must be unique for dependency resolution." };
  }
  for (const p of phases) {
    const deps = Array.isArray(p?.dependencies) ? p.dependencies : [];
    for (const d of deps) {
      const dn = String(d || "").trim();
      if (!dn) continue;
      if (!names.has(dn)) {
        return { ok: false, detail: `Unknown dependency "${dn}" (not a phase name).` };
      }
    }
    if (Number(p?.endDay) <= Number(p?.startDay)) {
      return { ok: false, detail: `Phase "${p?.name}" has invalid day range.` };
    }
  }
  return { ok: true, detail: "Timeline phases and dependencies are internally consistent." };
}

/**
 * @param {{ hypothesis?: string, plan: object, qualityChecks: object, scientificMechanistic?: object }} args
 */
export function computeExecutionReadiness({ hypothesis, plan, qualityChecks, scientificMechanistic }) {
  const hypo = String(hypothesis || "").toLowerCase();
  const ep = plan?.experimentPlan || {};
  const materials = Array.isArray(ep.materials) ? ep.materials : [];
  const budgetItems = Array.isArray(ep.budget?.byCategory) ? ep.budget.byCategory : [];
  const timelinePhases = Array.isArray(ep.timeline?.phases) ? ep.timeline.phases : [];
  const errors = Array.isArray(qualityChecks?.errors) ? qualityChecks.errors : [];
  const gatesPassed = Boolean(qualityChecks?.gatesPassed);
  const warnings = Array.isArray(qualityChecks?.warnings) ? qualityChecks.warnings : [];

  /** @type {{ id: string, ok: boolean, detail: string }[]} */
  const checklist = [];

  const push = (id, ok, detail) => checklist.push({ id, ok, detail });

  push(
    "qc_gates",
    gatesPassed && errors.length === 0,
    gatesPassed && errors.length === 0
      ? "Automated quality gates passed (no blocking errors)."
      : `${errors.length} blocking error(s); gates ${gatesPassed ? "formally passed" : "failed"}.`,
  );

  const steps = countProtocolSteps(plan);
  push(
    "protocol_granularity",
    steps >= 6,
    steps >= 6
      ? `${steps} protocol steps — sufficient granularity for wet-lab handoff.`
      : `Only ${steps} protocol steps — prefer ≥6 executable steps.`,
  );

  push(
    "materials_breadth",
    materials.length >= 8,
    materials.length >= 8
      ? `${materials.length} material lines — supply chain section is actionable.`
      : `Materials list is thin (${materials.length} lines); target ≥8 SKUs/consumables.`,
  );

  const catalogLines = materials.filter((m) => String(m?.catalogNumber || "").trim().length > 0).length;
  const ratio = materials.length ? catalogLines / materials.length : 0;
  push(
    "catalog_identifiers",
    ratio >= 0.65,
    `${Math.round(ratio * 100)}% of materials carry a catalog or VERIFY-CATALOG placeholder.`,
  );

  const matSum = materials.reduce((s, m) => s + Number(m?.totalCostUSD || 0), 0);
  const headerTotal = Number(ep.totalCostUSD || 0);
  const costAlign =
    matSum > 0 &&
    headerTotal > 0 &&
    Math.abs(headerTotal - matSum) / Math.max(headerTotal, matSum) <= 0.18;
  push(
    "cost_header_vs_materials",
    costAlign,
    costAlign
      ? "Header totalCostUSD aligns with summed material line totals (~18%)."
      : "Mismatch between experimentPlan.totalCostUSD and sum(materials.totalCostUSD).",
  );

  const contingencyPct = Number(ep?.budget?.contingencyPercent || 0);
  const budgetSubtotal = budgetItems.reduce((s, b) => s + Number(b?.amountUSD || 0), 0);
  const reportedBudget = Number(ep?.budget?.totalWithContingencyUSD || 0);
  const expectedBudget = Math.round(budgetSubtotal * (1 + contingencyPct / 100));
  const budgetMath =
    budgetSubtotal > 0 &&
    reportedBudget > 0 &&
    Math.abs(expectedBudget - reportedBudget) <= Math.max(8, reportedBudget * 0.1);
  push(
    "budget_internal_math",
    budgetMath,
    budgetMath
      ? "Budget categories reconcile with total including contingency."
      : "Budget line items do not reconcile with totalWithContingencyUSD.",
  );

  const dep = timelineDependencyCheck(timelinePhases);
  push(
    "timeline_integrity",
    dep.ok && timelinePhases.length >= 3,
    dep.ok && timelinePhases.length >= 3
      ? `${timelinePhases.length} timeline phases; ${dep.detail}`
      : dep.detail || "Timeline needs ≥3 coherent phases.",
  );

  const maxDay = timelinePhases.reduce((m, p) => Math.max(m, Number(p?.endDay || 0)), 0);
  const durationAlign =
    maxDay > 0 && Math.abs(maxDay - Number(ep.totalDurationDays || 0)) <= Math.max(5, maxDay * 0.15);
  push(
    "duration_vs_timeline",
    durationAlign,
    durationAlign
      ? "totalDurationDays matches timeline horizon."
      : "totalDurationDays diverges from last timeline endDay.",
  );

  const vCount = validatedSectionCount(plan?.verificationSources);
  push(
    "evidence_validation_depth",
    vCount >= 2,
    `${vCount}/6 plan sections have at least one LLM-validated web source.`,
  );

  const mechFails = (scientificMechanistic?.assayCompatibility || []).filter((a) => a?.passesHeuristic === false);
  const powerRisk = scientificMechanistic?.powerSketch?.reportedMeetsHeuristic === false;
  push(
    "mechanistic_clearance",
    mechFails.length === 0 && !powerRisk,
    mechFails.length === 0 && !powerRisk
      ? "No failed mechanistic concentration checks or underpowered flags."
      : mechFails.length
        ? `${mechFails.length} mechanistic assay flag(s) require scientist review.`
        : "Power sketch suggests underpowered design vs stated effect.",
  );

  const warnBudget = warnings.some((w) => /budget|materials total|contingency/i.test(w));
  push(
    "no_major_warnings",
    !warnBudget,
    warnBudget ? "Quality engine flagged budget/material coherence — review before ordering." : "No major budget coherence warnings.",
  );

  const title = String(ep.title || "").toLowerCase();
  const keyTerms = hypo
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 5)
    .slice(0, 6);
  const titleHit = keyTerms.length === 0 || keyTerms.some((w) => title.includes(w));
  push(
    "title_hypothesis_alignment",
    titleHit,
    titleHit
      ? "Plan title reflects substantive terms from the hypothesis."
      : "Plan title may be generic relative to the hypothesis — verify scope.",
  );

  const passed = checklist.filter((c) => c.ok).length;
  const n = checklist.length;
  const base = (passed / n) * 8.8;
  const bonus =
    gatesPassed && errors.length === 0 && passed === n ? 1.2 : gatesPassed && errors.length === 0 && passed >= n - 1 ? 0.65 : gatesPassed ? 0.35 : 0;
  const scoreOutOf10 = Math.round(Math.min(10, base + bonus) * 10) / 10;

  let tier = "draft";
  if (scoreOutOf10 >= 9 && gatesPassed && errors.length === 0 && passed === n) {
    tier = "order_ready";
  } else if (gatesPassed) {
    tier = "pilot_ready";
  }

  const headline =
    tier === "order_ready"
      ? "High readiness — suitable for procurement review with normal due diligence."
      : tier === "pilot_ready"
        ? "Pilot-ready — run as feasibility study; resolve flagged items before scale-up spend."
        : "Draft — significant human review required before committing spend.";

  return {
    version: 1,
    scoreOutOf10,
    tier,
    headline,
    checklist,
    summary: {
      passedChecks: passed,
      totalChecks: checklist.length,
      protocolSteps: steps,
      materialLines: materials.length,
      validatedSourceSections: vCount,
    },
  };
}
