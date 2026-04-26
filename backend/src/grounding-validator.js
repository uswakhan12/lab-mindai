/**
 * Ensure plan citations / material provenance trace back to the retrieval packet where claimed.
 */

function collectPacketUrls(retrievalPacket) {
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

function normalizeUrl(u) {
  try {
    const x = new URL(u);
    x.hash = "";
    return x.href.replace(/\/$/, "");
  } catch {
    return String(u).trim();
  }
}

/**
 * @returns {{ warnings: string[], errors: string[], stats: object }}
 */
export function validatePlanGrounding(plan, retrievalPacket) {
  const warnings = [];
  const errors = [];
  const allowed = collectPacketUrls(retrievalPacket);
  const materials = Array.isArray(plan?.experimentPlan?.materials) ? plan.experimentPlan.materials : [];

  let groundedLines = 0;
  let unverifiedUrls = 0;
  let missingGrounding = 0;

  for (let i = 0; i < materials.length; i++) {
    const m = materials[i];
    const g = m?.grounding;
    const url = typeof g?.sourceUrl === "string" ? g.sourceUrl.trim() : "";
    if (!g || (!url && !g?.sourceTitle)) {
      missingGrounding += 1;
      continue;
    }
    if (!url || url === "PENDING" || url === "VERIFY") continue;
    if (!url.startsWith("http")) {
      warnings.push(`Material line ${i + 1} (${m?.item || "?"}): grounding.sourceUrl is not a valid http(s) URL.`);
      continue;
    }
    const nu = normalizeUrl(url);
    if (allowed.size === 0) {
      warnings.push("No literature URLs in retrieval packet — cannot verify material grounding URLs.");
      break;
    }
    if (!allowed.has(nu) && ![...allowed].some((a) => nu.startsWith(a) || a.startsWith(nu))) {
      unverifiedUrls += 1;
      warnings.push(
        `Material "${m?.item || i + 1}": grounding URL not found in literature QC packet — may be hallucinated or from post-hoc verification only.`,
      );
    } else {
      groundedLines += 1;
    }
  }

  if (missingGrounding > Math.ceil(materials.length * 0.4)) {
    warnings.push(
      `${missingGrounding}/${materials.length} materials lack explicit grounding {sourceUrl, sourceTitle} — weaker traceability for procurement audit.`,
    );
  }

  if (unverifiedUrls > 0) {
    warnings.push(
      `${unverifiedUrls} material grounding URL(s) are not in the pre-plan literature packet — confirm against verification sources before ordering.`,
    );
  }

  return {
    warnings,
    errors,
    stats: { groundedLines, missingGrounding, unverifiedUrls, allowedUrlCount: allowed.size },
  };
}
