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

/**
 * @param {string} hypothesis
 * @param {Array<{ title?: string, relevance?: string, url?: string, score?: number }>} references
 * @param {string} noveltySignal - existing coarse signal
 */
export function buildNoveltyDiagnostics(hypothesis, references, noveltySignal) {
  const refs = Array.isArray(references) ? references : [];
  const hypoTokens = tokenize(hypothesis);
  const perReference = refs.map((r, i) => {
    const blob = `${r?.title || ""} ${r?.relevance || ""}`;
    const rt = tokenize(blob);
    const overlap = hypoTokens.size ? overlapTokens(hypoTokens, rt) / Math.max(6, hypoTokens.size) : 0;
    const score = typeof r?.score === "number" && Number.isFinite(r.score) ? r.score : 0;
    return {
      index: i,
      title: r?.title || "Untitled",
      url: r?.url || "",
      retrievalScore: Math.round(score * 1000) / 1000,
      hypothesisTokenOverlap: Math.round(overlap * 1000) / 1000,
      hostKind: hostKind(r?.url),
    };
  });

  const topScore = perReference.length ? Math.max(...perReference.map((p) => p.retrievalScore)) : 0;
  const topOverlap = perReference.length ? Math.max(...perReference.map((p) => p.hypothesisTokenOverlap)) : 0;
  const hasProtocolHost = perReference.some((p) => p.hostKind === "protocol_repository");
  const hasVendor = perReference.some((p) => p.hostKind === "vendor_or_resource");

  const rulesTriggered = [];
  let evidenceTier = "sparse";

  if (refs.length === 0) {
    rulesTriggered.push("No retrieval hits passed validation — treat novelty as uncertain.");
  } else {
    if (topScore >= 0.92 && (hasProtocolHost || topOverlap >= 0.35)) {
      evidenceTier = "exact_or_near_protocol";
      rulesTriggered.push("Top hit score ≥0.92 and strong protocol host or high hypothesis token overlap.");
    } else if (topScore >= 0.88 && topOverlap >= 0.22) {
      evidenceTier = "close_analog";
      rulesTriggered.push("High retrieval score with substantive lexical overlap — likely close analog, not proven duplicate.");
    } else if (topScore >= 0.72 || hasProtocolHost || topOverlap >= 0.15) {
      evidenceTier = "related_work";
      rulesTriggered.push("Moderate match strength — related methods or endpoints; manual read recommended.");
    } else {
      evidenceTier = "weakly_related";
      rulesTriggered.push("Lower scores/overlap — sources may be only loosely related.");
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
    hasProtocolRepositoryHit: hasProtocolHost,
    hasVendorOrResourceHit: hasVendor,
    rulesTriggered,
    signalAlignmentNote: signalAlignment,
    perReference,
  };
}
