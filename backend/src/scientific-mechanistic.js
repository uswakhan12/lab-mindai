/**
 * Mechanistic-style checks: concentration vs assay heuristics, simplified power,
 * protocol step ↔ evidence links (literature QC + verification sources).
 */

const CONC_RE =
  /\b(\d+(?:\.\d+)?)\s*(mg\/l|mg\/ml|µg\/ml|ug\/ml|ng\/ml|mm|μm|um|nm|mmol\/l|mM|μM|uM|%)\b/gi;

function parseConcentrations(text) {
  const out = [];
  const s = String(text || "");
  let m;
  const re = new RegExp(CONC_RE.source, "gi");
  while ((m = re.exec(s)) !== null) {
    out.push({ value: Number(m[1]), unit: m[2].toLowerCase().replace("µ", "u"), raw: m[0] });
  }
  return out;
}

function toMgPerL(c) {
  const { value, unit } = c;
  if (unit === "mg/l") return value;
  if (unit === "ug/ml") return value * 1000;
  if (unit === "ng/ml") return value / 1000;
  return null;
}

/**
 * Heuristic LOD bands for common assay classes inferred from hypothesis text.
 */
export function validateConcentrationsAgainstAssays(hypothesis, protocolText) {
  const combined = `${hypothesis}\n${protocolText}`;
  const concentrations = parseConcentrations(combined);
  const findings = [];
  const h = hypothesis.toLowerCase();

  if (/\bcrp\b|c-reactive/i.test(h)) {
    const crpTargets = concentrations.filter((c) => /mg\/l/i.test(c.raw));
    for (const c of crpTargets) {
      const mgL = toMgPerL({ ...c, unit: "mg/l" });
      if (mgL == null) continue;
      const typicalElisaLod = { min: 0.03, max: 2.0, note: "Typical high-sensitivity CRP ELISA LOD ~0.03–2 mg/L (vendor-dependent)." };
      const plausible = mgL >= typicalElisaLod.min * 0.5 && mgL <= typicalElisaLod.max * 3;
      findings.push({
        claim: c.raw,
        assayClass: "CRP / inflammation immunoassay",
        benchmark: typicalElisaLod,
        passesHeuristic: plausible,
        detail: plausible
          ? "Target concentration sits in a plausible ELISA-sensitive band — still verify kit LOD/LOQ."
          : "Target may sit outside typical ELISA LOD without dilution — flag for kit-specific validation.",
      });
    }
    if (crpTargets.length === 0) {
      findings.push({
        claim: "CRP endpoint implied",
        assayClass: "CRP / inflammation immunoassay",
        benchmark: { min: 0.03, max: 2.0, note: "ELISA-class sensitivity band" },
        passesHeuristic: null,
        detail: "No explicit mg/L concentration parsed — add numeric target for mechanistic LOD check.",
      });
    }
  }

  const cellMediaM = concentrations.filter((c) => c.unit === "mM" || c.unit === "mmol/l");
  for (const c of cellMediaM) {
    const plausible = c.value >= 0.1 && c.value <= 200;
    findings.push({
      claim: c.raw,
      assayClass: "Cell culture osmolyte / small molecule",
      benchmark: { min: 0.1, max: 200, note: "Broad mM band for media additives (heuristic)" },
      passesHeuristic: plausible,
      detail: plausible
        ? "mM-scale additive is in a common media range — cross-check against osmolarity."
        : "Concentration may be unusual for media; verify osmolarity and cytotoxicity.",
    });
  }

  return { concentrations, assayCompatibility: findings };
}

function extractProportionDelta(hypothesis) {
  const h = String(hypothesis || "");
  const pctPoints = h.match(/(\d+(?:\.\d+)?)\s*percentage\s*points/i);
  if (pctPoints) return { delta: Number(pctPoints[1]) / 100, kind: "absolute_pp" };
  const byAtLeast = h.match(/at\s+least\s+(\d+(?:\.\d+)?)\s*%/i);
  if (byAtLeast) return { delta: Number(byAtLeast[1]) / 100, kind: "min_relative" };
  const reduce = h.match(/(?:reduce|increase|improve)\s+[^.]*?by\s+(\d+(?:\.\d+)?)\s*%/i);
  if (reduce) return { delta: Number(reduce[1]) / 100, kind: "relative_change" };
  return null;
}

/** Two-proportion equal-n approximation: required n per group for 80% power, two-sided alpha. */
export function approximateTwoProportionSampleSize(delta, pControl = 0.5, alpha = 0.05, power = 0.8) {
  if (!delta || delta <= 0 || delta >= 1) return { nPerGroup: null, note: "Effect size not suitable for proportion power sketch." };
  const p1 = Math.min(0.999, Math.max(0.001, pControl));
  const p2 = Math.min(0.999, Math.max(0.001, pControl + delta));
  const pBar = (p1 + p2) / 2;
  const zAlpha = 1.96;
  const zBeta = 0.84;
  const num = 2 * pBar * (1 - pBar) * (zAlpha + zBeta) ** 2;
  const den = (p2 - p1) ** 2;
  const n = Math.ceil(num / den);
  return {
    nPerGroup: Number.isFinite(n) ? Math.min(5000, Math.max(3, n)) : null,
    assumptions: `p_control≈${pControl}, two-sided α=${alpha}, target power=${power}. Uses normal approximation (sketch only).`,
  };
}

export function powerFromHypothesis(hypothesis, reportedSampleSizeText) {
  const deltaInfo = extractProportionDelta(hypothesis);
  const nums = String(reportedSampleSizeText || "").match(/\b\d{1,4}\b/g);
  const parsedN = nums?.map(Number) ?? [];
  const maxN = parsedN.length ? Math.max(...parsedN) : null;
  if (!deltaInfo) {
    return {
      effect: null,
      recommendedNPerGroup: null,
      reportedNumericHints: parsedN,
      note: "No clear proportion-style effect parsed — power sketch skipped or use custom stats.",
    };
  }
  const rec = approximateTwoProportionSampleSize(deltaInfo.delta);
  const meets = maxN != null && rec.nPerGroup != null && maxN >= rec.nPerGroup;
  return {
    effect: deltaInfo,
    recommendedNPerGroup: rec.nPerGroup,
    assumptions: rec.assumptions,
    reportedNumericHints: parsedN,
    reportedMeetsHeuristic: meets,
    note: meets
      ? "Reported sample size meets heuristic minimum for stated proportion delta (sketch)."
      : maxN != null && rec.nPerGroup
        ? `Reported n≈${maxN} is below heuristic ${rec.nPerGroup}/group for stated effect — underpowered risk.`
        : "Add explicit n per arm for quantitative power review.",
  };
}

function pickRefs(literatureQC) {
  const refs = Array.isArray(literatureQC?.references) ? literatureQC.references : [];
  return refs
    .filter((r) => r?.title)
    .slice(0, 3)
    .map((r, i) => ({
      index: i,
      title: r.title,
      url: r.url || "#",
      source: "literature_qc",
    }));
}

function pickVerificationCandidates(verificationSources, section, limit = 6) {
  const arr = Array.isArray(verificationSources?.[section]) ? verificationSources[section] : [];
  return arr.slice(0, limit).map((s) => ({
    title: s.title,
    url: s.url,
    snippet: typeof s.snippet === "string" ? s.snippet : "",
    source: "verification",
    validationStatus: s.validationStatus,
  }));
}

function tokenSetForOverlap(s) {
  return new Set(
    String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9%+./-]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
}

function overlapScore(stepBlob, sourceBlob) {
  const a = tokenSetForOverlap(stepBlob);
  const b = tokenSetForOverlap(sourceBlob);
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  if (a.size === 0 || b.size === 0) return 0;
  return inter / Math.sqrt(a.size * b.size);
}

export function attachProtocolStepEvidence(plan) {
  const lit = pickRefs(plan.literatureQC);
  const verProto = pickVerificationCandidates(plan.verificationSources, "protocol", 8);
  const phases = plan?.experimentPlan?.protocol?.phases;
  if (!Array.isArray(phases)) return { stepsAnnotated: 0 };

  let count = 0;
  for (const phase of phases) {
    const steps = Array.isArray(phase?.steps) ? phase.steps : [];
    for (const step of steps) {
      const stepText = `${step?.title || ""}\n${step?.description || ""}`;
      const links = [];
      if (lit.length > 0) {
        const ranked = lit
          .map((r) => ({ r, s: overlapScore(stepText, `${r.title || ""}`) }))
          .sort((a, b) => b.s - a.s);
        links.push((ranked[0] || { r: lit[0] }).r);
      }
      if (verProto.length > 0) {
        const rankedV = verProto
          .map((v) => ({ v, s: overlapScore(stepText, `${v.title || ""} ${v.snippet || ""}`) }))
          .sort((a, b) => b.s - a.s);
        const strong = rankedV.filter((x) => x.s >= 0.06).slice(0, 2).map((x) => x.v);
        if (strong.length > 0) links.push(...strong);
        else links.push(rankedV[0].v);
      }
      const dedup = [];
      const seen = new Set();
      for (const L of links) {
        const k = `${L.url || ""}|${L.title || ""}`;
        if (seen.has(k)) continue;
        seen.add(k);
        dedup.push(L);
      }
      step.evidenceLinks = dedup;
      count += 1;
    }
  }
  return { stepsAnnotated: count };
}

export function runScientificMechanisticValidation({ hypothesis, plan }) {
  const protocolText = JSON.stringify(plan?.experimentPlan?.protocol || {});
  const conc = validateConcentrationsAgainstAssays(hypothesis, protocolText);
  const sampleText = plan?.experimentPlan?.validation?.sampleSize || "";
  const power = powerFromHypothesis(hypothesis, sampleText);
  const evidence = attachProtocolStepEvidence(plan);

  return {
    version: 1,
    disclaimer:
      "Mechanistic checks are heuristic engineering aids, not peer review. Always validate against kit IFUs, SOPs, and biostatistics.",
    concentrations: conc.concentrations,
    assayCompatibility: conc.assayCompatibility,
    powerSketch: power,
    protocolEvidence: evidence,
  };
}
