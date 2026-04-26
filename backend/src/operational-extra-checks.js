/**
 * Additional operational realism: lead times, incompatibilities, timeline vs bench hours, n vs power sketch.
 */

const INCOMPAT_PAIRS = [
  ["bleach", "ammonia"],
  ["sodium hypochlorite", "ammonium hydroxide"],
  ["chloramine", "acid"],
];

function lowerBlob(plan) {
  return JSON.stringify(plan?.experimentPlan || {}).toLowerCase();
}

export function runOperationalExtraChecks({ hypothesis, plan, scientificMechanistic }) {
  const warnings = [];
  const errors = [];
  const ep = plan?.experimentPlan || {};
  const materials = Array.isArray(ep.materials) ? ep.materials : [];
  const hypo = String(hypothesis || "").toLowerCase();
  const blob = lowerBlob(plan);

  for (const [a, b] of INCOMPAT_PAIRS) {
    if (/\bdo not\b/i.test(blob) && (blob.includes(a) || blob.includes(b))) continue;
    if (blob.includes(a) && blob.includes(b) && /\b(mix|combine|together|add\s+to)\b/i.test(blob)) {
      errors.push(`Potential incompatible combination mentioned (${a} + ${b}) — verify SDS and institutional policy.`);
    }
  }

  for (const m of materials) {
    const lt = Number(m?.leadTimeWeeks);
    const cat = String(m?.catalogNumber || "");
    const item = String(m?.item || "").toLowerCase();
    if (!Number.isFinite(lt)) continue;
    if (lt < 0 || lt > 80) warnings.push(`Unusual leadTimeWeeks (${lt}) for "${m?.item}" — sanity-check with supplier.`);
    const longLeadSku = /atcc|custom synthesis|gmp|large-scale/i.test(item) || /atcc/i.test(cat);
    if (longLeadSku && lt < 2) {
      warnings.push(`"${m?.item}" typically needs ≥2 weeks lead — listed ${lt}w; verify expedite availability.`);
    }
    if ((item.includes("antibody") || item.includes("primary")) && lt === 0) {
      warnings.push(`Antibody line "${m?.item}" with 0-week lead is often unrealistic unless in-stock at core facility.`);
    }
  }

  let totalStepHours = 0;
  const phases = Array.isArray(ep?.protocol?.phases) ? ep.protocol.phases : [];
  for (const ph of phases) {
    for (const st of ph?.steps || []) {
      const h = Number(st?.durationHours);
      if (Number.isFinite(h) && h > 0) totalStepHours += h;
    }
  }
  const benchDays = totalStepHours / 24;
  const timelineDays = Number(ep?.totalDurationDays || 0);
  if (benchDays > 0 && timelineDays > 0 && benchDays > timelineDays * 1.35) {
    warnings.push(
      `Sum of protocol step durations (~${Math.round(benchDays)} bench-days) exceeds timeline horizon (${timelineDays} days) by >35% — add queue/calendar slack or fix timeline.`,
    );
  }

  const ss = String(ep?.validation?.sampleSize || "");
  const nums = ss.match(/\b(\d{1,4})\b/g)?.map(Number) || [];
  const maxN = nums.length ? Math.max(...nums) : null;
  const rec = scientificMechanistic?.powerSketch?.recommendedNPerGroup;
  if (typeof rec === "number" && rec > 0 && maxN != null && maxN < rec) {
    warnings.push(
      `Largest sample size parsed from validation (${maxN}) is below mechanistic power sketch recommendation (~${rec}/group) — underpowering risk.`,
    );
  }

  if (/\bclinical\b|\bhuman subjects\b/i.test(hypo) && !/\birb\b|\bethics\b/i.test(blob)) {
    warnings.push("Hypothesis suggests human work but protocol text lacks explicit IRB/ethics mention — add governance steps.");
  }

  return { warnings, errors };
}
