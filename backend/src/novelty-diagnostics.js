/**
 * Defensible novelty / evidence classification beyond a single enum.
 */

function normUrl(u) {
  const s = String(u || "").trim();
  if (!s.startsWith("http")) return "";
  try {
    const x = new URL(s);
    return `${x.hostname.replace(/^www\./, "")}${x.pathname}`.toLowerCase();
  } catch {
    return s.toLowerCase();
  }
}

function hostKind(url) {
  const n = normUrl(url);
  if (n.includes("protocols.io")) return "protocol_repository";
  if (n.includes("bio-protocol")) return "protocol_repository";
  if (n.includes("nature.com") && n.includes("nprot")) return "protocol_repository";
  if (n.includes("jove.com")) return "protocol_repository";
  if (n.includes("openwetware")) return "community_protocol";
  if (/(sigma|thermofisher|fishersci|vwr|qiagen|promega|idtdna|atcc|addgene)/i.test(n)) return "vendor_or_resource";
  if (/(arxiv|semanticscholar|pubmed|nih.gov|doi.org)/i.test(n)) return "peer_literature";
  return "general_web";
}

function tokenize(h) {
  return new Set(
    String(h || "")
      .toLowerCase()
      .replace(/[^a-z0-9%+./-]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 4),
  );
}

function overlapTokens(a, b) {
  let n = 0;
  for (const t of a) if (b.has(t)) n += 1;
  return n;
}

/** Character trigram bag for a cheap embedding-like similarity (no external API). */
function trigramCounts(s) {
  const t = String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  const map = new Map();
  if (t.length < 3) return map;
  for (let i = 0; i <= t.length - 3; i++) {
    const g = t.slice(i, i + 3);
    map.set(g, (map.get(g) || 0) + 1);
  }
  return map;
}

function cosineTrigram(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const v of a.values()) na += v * v;
  for (const v of b.values()) nb += v * v;
  for (const [k, va] of a) {
    const vb = b.get(k);
    if (vb) dot += va * vb;
  }
  const den = Math.sqrt(na) * Math.sqrt(nb);
  return den > 0 ? dot / den : 0;
}

function protocolSkeletonText(experimentPlan) {
  if (!experimentPlan || typeof experimentPlan !== "object") return "";
  const parts = [];
  const phases = Array.isArray(experimentPlan.protocol?.phases) ? experimentPlan.protocol.phases : [];
  for (const ph of phases) {
    parts.push(String(ph?.phaseName || ""));
    for (const st of ph?.steps || []) {
      parts.push(String(st?.title || ""));
      parts.push(String(st?.description || "").slice(0, 220));
    }
  }
  return parts.join(" ");
}

/**
 * @param {string} hypothesis
 * @param {Array<{ title?: string, relevance?: string, url?: string, score?: number }>} references
 * @param {string} noveltySignal - existing coarse signal
 * @param {{ experimentPlan?: object }} [options]
 */
export function buildNoveltyDiagnostics(hypothesis, references, noveltySignal, options = {}) {
  const refs = Array.isArray(references) ? references : [];
  const hypoTokens = tokenize(hypothesis);
  const hypoTri = trigramCounts(hypothesis);
  const protocolSk = protocolSkeletonText(options.experimentPlan);
  const protoTri = protocolSk ? trigramCounts(protocolSk) : null;

  const perReference = refs.map((r, i) => {
    const blob = `${r?.title || ""} ${r?.relevance || ""}`;
    const rt = tokenize(blob);
    const overlap = hypoTokens.size ? overlapTokens(hypoTokens, rt) / Math.max(6, hypoTokens.size) : 0;
    const score = typeof r?.score === "number" && Number.isFinite(r.score) ? r.score : 0;
    const refTri = trigramCounts(blob);
    const trigramSimilarity = Math.round(cosineTrigram(hypoTri, refTri) * 1000) / 1000;
    const protocolTrigramAlignment = protoTri
      ? Math.round(cosineTrigram(protoTri, refTri) * 1000) / 1000
      : 0;
    const combinedEvidenceScore =
      Math.round((0.42 * Math.min(1, score) + 0.38 * trigramSimilarity + 0.2 * overlap) * 1000) / 1000;
    return {
      index: i,
      title: r?.title || "Untitled",
      url: r?.url || "",
      retrievalScore: Math.round(score * 1000) / 1000,
      hypothesisTokenOverlap: Math.round(overlap * 1000) / 1000,
      trigramSimilarity,
      protocolTrigramAlignment,
      combinedEvidenceScore,
      hostKind: hostKind(r?.url),
    };
  });

  const topScore = perReference.length ? Math.max(...perReference.map((p) => p.retrievalScore)) : 0;
  const topOverlap = perReference.length ? Math.max(...perReference.map((p) => p.hypothesisTokenOverlap)) : 0;
  const topTrigramSimilarity = perReference.length ? Math.max(...perReference.map((p) => p.trigramSimilarity)) : 0;
  const topCombinedEvidence = perReference.length ? Math.max(...perReference.map((p) => p.combinedEvidenceScore)) : 0;
  const protocolToPacketAlignment = perReference.length
    ? Math.round(Math.max(...perReference.map((p) => p.protocolTrigramAlignment)) * 1000) / 1000
    : 0;
  const hasProtocolHost = perReference.some((p) => p.hostKind === "protocol_repository");
  const hasVendor = perReference.some((p) => p.hostKind === "vendor_or_resource");

  const rulesTriggered = [];
  let evidenceTier = "sparse";

  /** Tiering uses Tavily score, token overlap, and trigram fusion (rerank proxy). */
  const tierScore = Math.max(topScore, topCombinedEvidence * 0.98);
  const structureBoost = protocolToPacketAlignment >= 0.14 ? 0.04 : 0;

  if (refs.length === 0) {
    rulesTriggered.push("No retrieval hits passed validation — treat novelty as uncertain.");
  } else {
    rulesTriggered.push(
      `Evidence fusion: max(tavily, combined)≈${Math.round(tierScore * 1000) / 1000}; trigram top=${topTrigramSimilarity}; protocol↔packet=${protocolToPacketAlignment}.`,
    );
    if (tierScore + structureBoost >= 0.92 && (hasProtocolHost || topOverlap >= 0.35 || protocolToPacketAlignment >= 0.22)) {
      evidenceTier = "exact_or_near_protocol";
      rulesTriggered.push("Strong fused score with protocol host, high overlap, or protocol↔reference alignment.");
    } else if (tierScore + structureBoost >= 0.84 && (topOverlap >= 0.2 || topTrigramSimilarity >= 0.18)) {
      evidenceTier = "close_analog";
      rulesTriggered.push("Fused score + overlap/trigram indicate close analog (not proven duplicate).");
    } else if (tierScore + structureBoost >= 0.68 || hasProtocolHost || topOverlap >= 0.14 || topTrigramSimilarity >= 0.12) {
      evidenceTier = "related_work";
      rulesTriggered.push("Moderate fused match — related methods; manual read recommended.");
    } else {
      evidenceTier = "weakly_related";
      rulesTriggered.push("Lower fused scores — sources may be only loosely related.");
    }
    if (hasVendor) rulesTriggered.push("At least one hit is vendor/resource page (catalog bias possible).");
  }

  const signalAlignment =
    noveltySignal === "exact_match"
      ? evidenceTier === "exact_or_near_protocol"
        ? "Novelty label aligns with strict protocol-like evidence."
        : "Novelty label is aggressive vs. evidence tier — treat as operational warning, not legal duplicate finding."
      : noveltySignal === "not_found"
        ? evidenceTier === "sparse"
          ? "Novelty label aligns with sparse retrieval."
          : "Retrieval found sources but validator marked not_found — re-check."
        : "Similar-work band — consistent with typical partial overlap in web retrieval.";

  return {
    version: 1,
    evidenceTier,
    noveltySignal,
    topRetrievalScore: topScore,
    topHypothesisOverlap: topOverlap,
    topTrigramSimilarity,
    topCombinedEvidence: Math.round(topCombinedEvidence * 1000) / 1000,
    protocolToPacketAlignment,
    rerankMethod: "trigram_cosine_fusion+v0.42tavily",
    hasProtocolRepositoryHit: hasProtocolHost,
    hasVendorOrResourceHit: hasVendor,
    rulesTriggered,
    signalAlignmentNote: signalAlignment,
    perReference,
  };
}
