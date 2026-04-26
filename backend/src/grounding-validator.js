/**
 * Procurement grounding: literature + post-hoc verification URLs are the allow-list
 * for release. Critical materials (reagents, antibodies, cell lines) must cite one.
 */

function normalizeUrl(u) {
  try {
    const x = new URL(u);
    x.hash = "";
    return x.href.replace(/\/$/, "");
  } catch {
    return String(u).trim();
  }
}

function urlMatchesAllowlist(nu, allowed) {
  if (allowed.has(nu)) return true;
  for (const a of allowed) {
    if (nu.startsWith(a) || a.startsWith(nu)) return true;
  }
  return false;
}

/** Reagents, antibodies, cell culture inputs — procurement gate applies. */
export function isProcurementCriticalMaterial(m) {
  const cat = String(m?.category || "");
  const blob = `${m?.item || ""} ${m?.specification || ""} ${m?.catalogNumber || ""}`.toLowerCase();
  if (cat === "Reagent") return true;
  if (/\b(antibody|mab|\banti-|elisa\s+conjugate|secondary\s+antibody|primary\s+antibody)\b/i.test(blob)) return true;
  if (/\b(atcc|ccl-|cell line|hela|293t|cho-k|vero|pbmc|primary cells?)\b/i.test(blob)) return true;
  if (/\b(fbs|fetal bovine serum|serum|medium|dmem|rpmi|trypsin)\b/i.test(blob) && cat !== "Equipment") return true;
  return false;
}

function collectLiteratureUrls(retrievalPacket) {
  const set = new Set();
  const refs = Array.isArray(retrievalPacket?.literatureQC?.references)
    ? retrievalPacket.literatureQC.references
    : [];
  for (const r of refs) {
    const u = String(r?.url || "").trim();
    if (u.startsWith("http")) set.add(normalizeUrl(u));
  }
  return set;
}

function collectVerificationUrls(plan) {
  const set = new Set();
  const vs = plan?.verificationSources;
  if (!vs || typeof vs !== "object") return set;
  for (const key of Object.keys(vs)) {
    const arr = Array.isArray(vs[key]) ? vs[key] : [];
    for (const s of arr) {
      const u = String(s?.url || "").trim();
      if (u.startsWith("http")) set.add(normalizeUrl(u));
    }
  }
  return set;
}

/** URLs that may legally appear on material.grounding.sourceUrl for release. */
export function collectAllowedReleaseUrls(retrievalPacket, plan) {
  const out = new Set();
  for (const u of collectLiteratureUrls(retrievalPacket)) out.add(u);
  for (const u of collectVerificationUrls(plan)) out.add(u);
  return out;
}

/**
 * @returns {{
 *   warnings: string[],
 *   errors: string[],
 *   procurementGateFailed: boolean,
 *   stats: object
 * }}
 */
export function validatePlanGrounding(plan, retrievalPacket) {
  const warnings = [];
  const errors = [];
  const allowed = collectAllowedReleaseUrls(retrievalPacket, plan);
  const materials = Array.isArray(plan?.experimentPlan?.materials) ? plan.experimentPlan.materials : [];
  const criticalCount = materials.filter(isProcurementCriticalMaterial).length;

  if (allowed.size === 0 && criticalCount > 0) {
    return {
      warnings,
      errors: [
        "PROCUREMENT_GATE: no http(s) URLs in literature QC or verification layers — cannot release procurement-critical material lines.",
      ],
      procurementGateFailed: true,
      stats: { groundedCriticalLines: 0, allowedUrlCount: 0, criticalLineCount: criticalCount },
    };
  }

  let groundedLines = 0;
  let unverifiedNonCritical = 0;
  let missingGroundingNonCritical = 0;

  for (let i = 0; i < materials.length; i++) {
    const m = materials[i];
    const g = m?.grounding;
    const url = typeof g?.sourceUrl === "string" ? g.sourceUrl.trim() : "";
    const critical = isProcurementCriticalMaterial(m);

    if (!critical) {
      if (!g || (!url && !g?.sourceTitle)) missingGroundingNonCritical += 1;
      else if (url && url !== "PENDING" && url.startsWith("http")) {
        const nu = normalizeUrl(url);
        if (allowed.size > 0 && !urlMatchesAllowlist(nu, allowed)) unverifiedNonCritical += 1;
      }
      continue;
    }

    // --- Critical line: release gate ---
    if (!g || !url) {
      errors.push(
        `PROCUREMENT_GATE: critical material "${m?.item || `line ${i + 1}`}" missing grounding.sourceUrl (required for release).`,
      );
      continue;
    }
    if (url === "PENDING" || url === "VERIFY") {
      errors.push(
        `PROCUREMENT_GATE: critical material "${m?.item || `line ${i + 1}`}" has unresolved grounding (${url}) — must cite an in-packet or post-verification URL before release.`,
      );
      continue;
    }
    if (!url.startsWith("http")) {
      errors.push(
        `PROCUREMENT_GATE: critical material "${m?.item || `line ${i + 1}`}" grounding.sourceUrl must be http(s).`,
      );
      continue;
    }
    const nu = normalizeUrl(url);
    if (!urlMatchesAllowlist(nu, allowed)) {
      errors.push(
        `PROCUREMENT_GATE: critical material "${m?.item || `line ${i + 1}`}" cites URL not in literature packet or verification allow-list.`,
      );
    } else {
      groundedLines += 1;
    }
  }

  if (missingGroundingNonCritical > Math.ceil(materials.length * 0.45)) {
    warnings.push(
      `${missingGroundingNonCritical}/${materials.length} non-critical materials lack grounding metadata.`,
    );
  }
  if (unverifiedNonCritical > 0) {
    warnings.push(
      `${unverifiedNonCritical} non-critical material(s) cite URLs outside the allow-list (review before ordering).`,
    );
  }

  const procurementGateFailed = errors.some((e) => e.startsWith("PROCUREMENT_GATE"));

  return {
    warnings,
    errors,
    procurementGateFailed,
    stats: {
      groundedCriticalLines: groundedLines,
      allowedUrlCount: allowed.size,
      criticalLineCount: materials.filter(isProcurementCriticalMaterial).length,
    },
  };
}
