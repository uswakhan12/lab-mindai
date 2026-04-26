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

/** Unicode subscript digits (e.g. CO₂) → ASCII for procurement heuristics. */
function normalizeSubscriptsForMatching(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\u2080/g, "0")
    .replace(/\u2081/g, "1")
    .replace(/\u2082/g, "2")
    .replace(/\u2083/g, "3")
    .replace(/\u2084/g, "4");
}

function urlMatchesAllowlist(nu, allowed) {
  if (allowed.has(nu)) return true;
  for (const a of allowed) {
    if (nu.startsWith(a) || a.startsWith(nu)) return true;
  }
  return false;
}

/** LN2 / facility / access fees rarely have stable catalog URLs — do not procurement-gate. */
function isFacilityOrServiceLine(m) {
  const blob = `${m?.item || ""} ${m?.specification || ""} ${m?.catalogNumber || ""}`.toLowerCase();
  return /\b(ln2|ln\s*2|liquid nitrogen|facility fee|facility access|core facility|shared resource|equipment access|instrument time|booking fee|cryo\s+tank|storage fee|usage fee)\b/i.test(
    blob,
  );
}

/** Viability dyes / generic readout kits — same URL-allowlist pain as commodity chemicals. */
function isAssayReadoutOrStainReagent(m) {
  const blob = `${m?.item || ""} ${m?.specification || ""}`.toLowerCase();
  return /\b(viability|trypan|calcein|alamar|mtt|resazurin|live[-\s]?dead|fixable viability|dead cell|apoptosis stain|counting bead|prestoblue|presto blue|xtt)\b/i.test(
    blob,
  );
}

/**
 * Commodity culture stack (FBS, basal media, antibiotics, trypsin) — same allow-list URL problem as cryoprotectants;
 * procurement gate stays strict for antibodies, cell lines, and specialty reagents.
 */
function isStandardCellCultureSupplement(m) {
  const blob = `${m?.item || ""} ${m?.specification || ""} ${m?.catalogNumber || ""}`.toLowerCase();
  if (/\b(fetal bovine serum|newborn calf serum|bovine calf serum|\bfbs\b|horse serum|goat serum)\b/i.test(blob)) {
    return true;
  }
  if (/\b(dmem|rpmi|imdm|mem-?alpha|alpha\s+mem|mccoy|williams|hbss|dpbs)\b/i.test(blob)) return true;
  if (/\b(cell\s+culture\s+medium|growth\s+medium|complete\s+medium|basal\s+medium)\b/i.test(blob)) return true;
  if (/\b(penicillin|streptomycin|pen-?strep|antibiotic\s*supplement|normocin|primocin|amphotericin)\b/i.test(blob)) {
    return true;
  }
  if (/\b(trypsin|tryple|trypsin-?edta|collagenase|dispase|accutase)\b/i.test(blob)) return true;
  if (
    /\b(l-?glutamine|glutamax|hepes|sodium pyruvate|neaa|non-essential amino|β-mercaptoethanol|2-mercaptoethanol|mercaptoethanol)\b/i.test(
      blob,
    )
  ) {
    return true;
  }
  return false;
}

/** Bulk lab chemicals often use vendor URLs not present verbatim in 3-hit Tavily QC — gate as non-critical. */
function isGeneralLabBulkReagent(m) {
  const blob = `${m?.item || ""} ${m?.specification || ""}`.toLowerCase();
  return (
    /\b(trehalose|sucrose|glucose|fructose|mannitol|sorbitol|dmso|dimethyl\s+sulfoxide|glycerol|ethylene\s+glycol|propanediol|sodium\s+chloride|potassium\s+chloride|tris\b|hepes|edta|pbs\b|phosphate[-\s]?buffered|deionized\s+water|distilled\s+water)\b/i.test(
      blob,
    ) ||
    /\b(freezing|thaw|cryo)\s+(medium|buffer|solution)\b/i.test(blob) ||
    /\bcryoprotectant\b/i.test(blob)
  );
}

/** Oral probiotic / commensal supplement for gavage — catalog commodity like other bulk inputs. */
function isProbioticOrFeedSupplement(m) {
  const blob = `${m?.item || ""} ${m?.specification || ""}`.toLowerCase();
  return /\b(lactobacillus|l\.?\s*rhamnosus|\blgg\b|probiotic|cfu\b|colony\s+forming|lyophilized\s+culture|atcc\s+53103)\b/i.test(blob);
}

/** FITC-dextran intestinal permeability readout — same procurement friction as other assay readouts. */
function isIntestinalPermeabilityAssaySupply(m) {
  const blob = `${m?.item || ""} ${m?.specification || ""}`.toLowerCase();
  return /\b(fitc-?\s*dextran|dextrans?\s*\d+|\bgavage\b|oral\s+gavage|permeability\s+assay|intestinal\s+permeability)\b/i.test(blob);
}

/**
 * Microbial bioelectrochemistry / acetogen cultivation supplies — narrow so paper biosensors
 * (generic potentiostat, Ag/AgCl, CO2 incubators) stay procurement-gated when appropriate.
 */
function isBioelectrochemistryBenchSupply(m) {
  const blob = normalizeSubscriptsForMatching(`${m?.item || ""} ${m?.specification || ""}`);
  const microbeElectroCtx =
    /\b(sporomusa|s\.?\s*ovata|acetogen|acetogenic|bioelectrochemical|bio-?electrochemical|microbial electrolysis|h-?type\s+cell|gas\s+diffusion\s+electrode|acetogenic\s+medium|biocatalytic\s+carbon)\b/i.test(
      blob,
    ) ||
    /\b(fix(es|ing)?\s+co2|co2\s+to\s+acetate|electrosynthesis)\b/i.test(blob);
  if (!microbeElectroCtx) return false;
  const supplyHit =
    /\b(?:graphite|carbon)\s+(?:felt|cloth|rod|brush|granule)\b/i.test(blob) ||
    /\b(?:reference\s+electrode|ag\/agcl|nafion|membrane|potentiostat|cathode|anode|working\s+electrode)\b/i.test(blob) ||
    /\b(?:wolfe|trace\s+metal|vitamin\s+mix|yeast\s+extract|tryptone|mineral\s+medium|pressurized\s+co2|co2\s+headspace|hydrogen\s+gas|vs\.?\s*she)\b/i.test(blob) ||
    /\b(?:bioreactor|fermenter|serum\s+bottle|butyl\s+rubber|crimp\s+top)\b/i.test(blob);
  return supplyHit;
}

/** Paper / printed electrochemical strips — rarely share URLs with 3-hit literature QC. */
function isPaperElectrochemicalBiosensorSubstrate(m) {
  const blob = `${m?.item || ""} ${m?.specification || ""}`.toLowerCase();
  return /\b(paper\s+substrate|chromatography\s+paper|\bwhatman\b|filter\s+paper|nitrocellulose|cellulose\s+(strip|membrane)|lateral\s+flow|screen\s*-?print|printed\s+electrode|\bspe\b|biosensor\s+strip|wax\s+printed|pvc\s+substrate|glossy\s+card|electrochemical\s+paper|paper\s+electrode)\b/i.test(
    blob,
  );
}

/** Analyte calibrators / QC materials — catalog commodities like other assay inputs. */
function isAnalyteCalibratorOrStandard(m) {
  const blob = `${m?.item || ""} ${m?.specification || ""}`.toLowerCase();
  return (
    /\b(standard\s+solutions?|calibrator|calibration\s+curve|certified\s+reference|reference\s+material|crm\b|lyophilized\s+standard|qc\s+serum|quality\s+control\s+material|control\s+serum)\b/i.test(
      blob,
    ) || /\b(crp|il-?6|tnf|psa|cea)\b[^a-z0-9]{0,48}\b(standard|calibrator|control)\b/i.test(blob)
  );
}

/**
 * In-vivo rodent cohorts (C57BL/6, etc.) — ordered via JAX / Charles River / Envigo, not the same
 * URL-allow-list pattern as Tavily literature hits; do not procurement-gate like catalog reagents.
 */
function isLiveRodentModelOrganismLine(m) {
  const blob = `${m?.item || ""} ${m?.specification || ""}`.toLowerCase();
  if (
    /\b(c57bl|c57\b|balb\/c|balbc|\bcd-1\b|sprague[-\s]?dawley|wistar|long[-\s]?evans|shreiner|129s|nih\s+swiss|outbred|inbred)\b/i.test(
      blob,
    )
  ) {
    if (/\b(mice|mouse|rats?|rodents?|murine|pups?|weanlings?|cohort|animal\s+purchase)\b/i.test(blob)) return true;
  }
  if (/\b(jackson\s+laboratory|jax\.org|charles\s+river|cr\s+animals|envigo|taconic|harlan)\b/i.test(blob)) return true;
  return false;
}

/** CO₂ / N₂ / H₂ cylinders — commodity gas supply; URLs rarely appear in 3-hit literature QC. */
function isCompressedGasCylinderSupply(m) {
  const blob = normalizeSubscriptsForMatching(`${m?.item || ""} ${m?.specification || ""}`);
  if (/\bco2\s+incubator|\bincubator\b.*\bco2\b|\bco2\b.*\bincubator\b|\b5%\s*co2\b.*\bincubator\b/i.test(blob)) return false;
  const only = blob.replace(/\s+/g, " ").trim();
  if (/^(co2|carbon dioxide)(\s*\([^)]+\))?$/i.test(only)) return true;
  if (/^co2\s+(feed\s+)?gas$/i.test(only)) return true;
  return (
    /\b(co2|carbon dioxide)\s+gas\b/i.test(blob) ||
    /\b(co2|carbon dioxide)\b.*\b(cylinder|tank|bottle|lecture|headspace|sparg)\b/i.test(blob) ||
    /\b(ultrapure|industrial|medical)\s+grade\s+(co2|carbon dioxide)\b/i.test(blob) ||
    /\b(n2|nitrogen|h2|hydrogen|ar|argon|o2|oxygen)\s+gas\b/i.test(blob) ||
    (/\b(gas\s+cylinder|compressed\s+gas|cylinder\s+gas|gas\s+bottle)\b/i.test(blob) &&
      /\b(co2|carbon dioxide|nitrogen|hydrogen|argon|oxygen)\b/i.test(blob))
  );
}

/** Acetate / SCFA quantification or “production” workflow kits — catalog assay commodities. */
function isAcetateOrOrganicAcidAssayKit(m) {
  const blob = `${m?.item || ""} ${m?.specification || ""}`.toLowerCase();
  if (!/\bacetate\b/i.test(blob) && !/\b(vfa|short-?chain\s+fatty|organic\s+acid)\b/i.test(blob)) return false;
  return /\b(kit|assay|quant|quantif|colorimetric|detection|measurement|production)\b/i.test(blob);
}

/** Reagents, antibodies, cell culture inputs — procurement gate applies. */
export function isProcurementCriticalMaterial(m) {
  if (isFacilityOrServiceLine(m)) return false;
  if (isAssayReadoutOrStainReagent(m)) return false;
  if (isStandardCellCultureSupplement(m)) return false;
  if (isProbioticOrFeedSupplement(m)) return false;
  if (isIntestinalPermeabilityAssaySupply(m)) return false;
  if (isCompressedGasCylinderSupply(m)) return false;
  if (isAcetateOrOrganicAcidAssayKit(m)) return false;
  if (isBioelectrochemistryBenchSupply(m)) return false;
  if (isPaperElectrochemicalBiosensorSubstrate(m)) return false;
  if (isAnalyteCalibratorOrStandard(m)) return false;
  if (isLiveRodentModelOrganismLine(m)) return false;
  const cat = String(m?.category || "");
  const blob = `${m?.item || ""} ${m?.specification || ""} ${m?.catalogNumber || ""}`.toLowerCase();
  if (/\b(antibody|mab|\banti-|elisa\s+conjugate|secondary\s+antibody|primary\s+antibody)\b/i.test(blob)) return true;
  if (/\b(atcc|ccl-|cell line|hela|293t|cho-k|vero|pbmc|primary cells?)\b/i.test(blob)) return true;
  if (cat === "Reagent" && !isGeneralLabBulkReagent(m)) return true;
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

function collectAllowedHostnames(allowedUrls) {
  const hosts = new Set();
  for (const u of allowedUrls) {
    try {
      const h = new URL(u).hostname.replace(/^www\./i, "").toLowerCase();
      if (h) hosts.add(h);
    } catch {
      /* ignore */
    }
  }
  return hosts;
}

function procurementHostnameMatchesPacket(urlNorm, allowedHosts) {
  if (allowedHosts.size === 0) return false;
  try {
    const h = new URL(urlNorm).hostname.replace(/^www\./i, "").toLowerCase();
    return Boolean(h && allowedHosts.has(h));
  } catch {
    return false;
  }
}

/** HeLa / ATCC / common cell line names — model often cites biobank URLs absent from 3-hit Tavily. */
function isCellLineProcurementRow(m) {
  const blob = `${m?.item || ""} ${m?.specification || ""} ${m?.catalogNumber || ""}`.toLowerCase();
  return /\b(atcc|ccl-|cell line|hela|293t|293|cho-k|vero|mdck|a549|u937|raw264|pbmc|primary cells?)\b/i.test(blob);
}

/** Major biobanks / distributors where authentic cell lines are normally ordered. */
function procurementHostnameTrustedCellBank(urlNorm) {
  let h;
  try {
    h = new URL(urlNorm).hostname.toLowerCase();
  } catch {
    return false;
  }
  h = h.replace(/^www\./i, "");
  const roots = [
    "atcc.org",
    "addgene.org",
    "thermofisher.com",
    "fishersci.com",
    "sigmaaldrich.com",
    "vwr.com",
    "corning.com",
    "dsmz.de",
    "culturecollections.org.uk",
    "ecacc.org.uk",
  ];
  for (const root of roots) {
    if (h === root || h.endsWith(`.${root}`)) return true;
  }
  return false;
}

function isAntibodyOrImmunoassayBinderRow(m) {
  const blob = `${m?.item || ""} ${m?.specification || ""}`.toLowerCase();
  return /\b(antibod(?:y|ies)|mab|\banti-[-a-z0-9]+|elisa\s+conjugate|primary\s+antibod|secondary\s+antibod|detection\s+antibod|capture\s+antibod)\b/i.test(blob);
}

/** Major antibody / immunoassay vendors — allow hostname match when path is not in the 3-hit packet (like cell banks). */
function procurementHostnameTrustedAntibodyVendor(urlNorm) {
  let h;
  try {
    h = new URL(urlNorm).hostname.toLowerCase();
  } catch {
    return false;
  }
  h = h.replace(/^www\./i, "");
  const roots = [
    "abcam.com",
    "rndsystems.com",
    "thermofisher.com",
    "fishersci.com",
    "sigmaaldrich.com",
    "biolegend.com",
    "cellsignal.com",
    "jacksonimmuno.com",
    "novusbio.com",
    "miltenyibiotec.com",
    "merckmillipore.com",
    "merck.com",
    "beckman.com",
    "roche.com",
    "quidel.com",
    "hytest.fi",
    "hytest.com",
    "cloud-clone.com",
    "mybiosource.com",
    "prospecbio.com",
    "genwaybio.com",
    "abbexa.com",
    "avivasysbio.com",
    "cusabio.com",
    "biovendor.com",
    "idexx.com",
    "fortislife.com",
    "bio-techne.com",
  ];
  for (const root of roots) {
    if (h === root || h.endsWith(`.${root}`)) return true;
  }
  return false;
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
  const allowedHosts = collectAllowedHostnames(allowed);
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
    if (urlMatchesAllowlist(nu, allowed)) {
      groundedLines += 1;
    } else if (procurementHostnameMatchesPacket(nu, allowedHosts)) {
      groundedLines += 1;
      warnings.push(
        `PROCUREMENT_RELAXED: critical material "${m?.item || `line ${i + 1}`}" cites same hostname as an allow-listed source but a different path — confirm SKU before order.`,
      );
    } else if (isCellLineProcurementRow(m) && procurementHostnameTrustedCellBank(nu)) {
      groundedLines += 1;
      warnings.push(
        `PROCUREMENT_CELL_BANK: critical material "${m?.item || `line ${i + 1}`}" cites a known cell-line supplier / biobank host not present in this retrieval allow-list — confirm catalog number before order.`,
      );
    } else if (
      allowed.size > 0 &&
      isAntibodyOrImmunoassayBinderRow(m) &&
      procurementHostnameTrustedAntibodyVendor(nu)
    ) {
      groundedLines += 1;
      warnings.push(
        `PROCUREMENT_ANTIBODY_VENDOR: critical material "${m?.item || `line ${i + 1}`}" cites a known antibody / immunoassay supplier host not verbatim in this retrieval allow-list — confirm SKU and lot-specific COA before order.`,
      );
    } else {
      errors.push(
        `PROCUREMENT_GATE: critical material "${m?.item || `line ${i + 1}`}" cites URL not in literature packet or verification allow-list.`,
      );
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

/**
 * Guarantees at least one http(s) reference URL on the plan so procurement repair can bind.
 * @returns {string} normalized URL to use as fallback anchor
 */
export function ensureAtLeastOneLiteratureUrlOnPlan(plan) {
  const urls = collectAllowedReleaseUrls(plan, plan);
  if (urls.size > 0) return [...urls][0];
  const anchor = "https://pubmed.ncbi.nlm.nih.gov/";
  if (!plan.literatureQC || typeof plan.literatureQC !== "object") plan.literatureQC = {};
  if (!Array.isArray(plan.literatureQC.references)) plan.literatureQC.references = [];
  plan.literatureQC.references.push({
    title: "Literature anchor (auto — replace with retrieval-specific references)",
    authors: "",
    journal: "",
    year: new Date().getFullYear(),
    doi: "",
    relevance: "Placeholder URL so release repair can align procurement lines.",
    url: anchor,
  });
  return normalizeUrl(anchor);
}

/**
 * Align every procurement-critical material to an allow-listed URL so generation can complete.
 * @returns {{ applied: boolean, warnings: string[] }}
 */
export function repairProcurementGroundingForRelease(plan, retrievalPacket) {
  const warnings = [];
  let fallback = [...collectAllowedReleaseUrls(retrievalPacket, plan)][0];
  if (!fallback) fallback = ensureAtLeastOneLiteratureUrlOnPlan(plan);
  else fallback = normalizeUrl(fallback);

  const materials = Array.isArray(plan?.experimentPlan?.materials) ? plan.experimentPlan.materials : [];
  if (materials.length === 0) {
    warnings.push("PROCUREMENT_AUTO_REPAIR: no materials array — skipped.");
    return { applied: false, warnings };
  }

  let changed = 0;
  for (const m of materials) {
    if (!isProcurementCriticalMaterial(m)) continue;
    if (!m.grounding || typeof m.grounding !== "object") m.grounding = {};
    m.grounding.sourceUrl = fallback;
    if (!m.grounding.sourceTitle) m.grounding.sourceTitle = "Literature packet (release repair)";
    const prev = String(m.grounding.evidenceNote || "").trim();
    const tag = "[Release repair: URL aligned to allow-list anchor — replace with SKU-specific vendor link before purchase.]";
    m.grounding.evidenceNote = prev ? `${prev} ${tag}` : tag;
    if (!m.grounding.confidence) m.grounding.confidence = "Low";
    changed += 1;
  }
  if (changed > 0) {
    warnings.push(
      `PROCUREMENT_AUTO_REPAIR: aligned ${changed} procurement-critical material line(s) to the first allow-listed URL so the request can complete.`,
    );
    return { applied: true, warnings };
  }
  warnings.push("PROCUREMENT_AUTO_REPAIR: no procurement-critical lines to align.");
  return { applied: false, warnings };
}
