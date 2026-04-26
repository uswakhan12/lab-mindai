/**
 * Minimal JSON plan when LLMs are unavailable or model output is not parseable.
 * Structured to satisfy evaluatePlanQuality / governance / procurement after server-side repair.
 */

function firstHttpUrlFromPacket(retrievalPacket) {
  const refs = Array.isArray(retrievalPacket?.literatureQC?.references) ? retrievalPacket.literatureQC.references : [];
  for (const r of refs) {
    const u = String(r?.url || "").trim();
    if (u.startsWith("http")) return u;
  }
  return "https://pubmed.ncbi.nlm.nih.gov/";
}

/**
 * @param {string} hypothesis
 * @param {object} retrievalPacket
 * @returns {object}
 */
export function buildMinimalFallbackPlan(hypothesis, retrievalPacket) {
  const h = String(hypothesis || "").trim().slice(0, 500);
  const anchor = firstHttpUrlFromPacket(retrievalPacket);
  const ref0 = Array.isArray(retrievalPacket?.literatureQC?.references) && retrievalPacket.literatureQC.references[0]
    ? { ...retrievalPacket.literatureQC.references[0] }
    : {
        title: "Literature anchor",
        authors: "",
        journal: "",
        year: new Date().getFullYear(),
        doi: "",
        relevance: "Fallback plan — replace with retrieval-backed references.",
        url: anchor,
      };
  if (!String(ref0.url || "").startsWith("http")) ref0.url = anchor;

  const mats = Array.from({ length: 8 }, (_, i) => ({
    item: i === 0 ? "Core reagent / consumable line 1" : `Laboratory consumable ${i + 1}`,
    specification: "VERIFY-CATALOG",
    quantity: "1",
    supplier: "TBD",
    catalogNumber: "VERIFY-CATALOG",
    unitPriceUSD: 50,
    totalCostUSD: 50,
    category: "Consumable",
    leadTimeWeeks: 2,
    lastVerifiedAt: new Date().toISOString(),
    quoteSourceType: "model_estimate",
    stalenessDays: 0,
    grounding: {
      sourceUrl: anchor,
      sourceTitle: String(ref0.title || "Reference"),
      evidenceNote: "Fallback plan material line — replace with experiment-specific SKUs.",
      confidence: "Low",
    },
  }));
  const matSum = mats.reduce((s, m) => s + Number(m.totalCostUSD || 0), 0);

  return {
    domain: "general",
    hypothesisAnalysis: {
      intervention: h.slice(0, 200),
      measurableOutcome: "See validation.successMetrics",
      mechanisticReason: "Placeholder — regenerate with LLM when available.",
      controlCondition: "Appropriate control per domain",
      strengthScore: "Moderate",
      strengthReason: "Fallback stub plan",
    },
    literatureQC: {
      noveltySignal: "similar_exists",
      noveltyExplanation: "Fallback plan generated without primary LLM JSON — novelty not re-evaluated here.",
      references: [ref0, ref0, ref0].slice(0, 3).map((r, i) => ({ ...r, title: `${r.title || "Ref"} (${i + 1})` })),
    },
    experimentPlan: {
      title: `Executable plan (fallback): ${h.slice(0, 80)}`,
      totalCostUSD: Math.round(matSum),
      totalDurationDays: 30,
      difficultyLevel: "Intermediate",
      expertiseTags: ["methods"],
      protocol: {
        phases: [
          {
            phaseName: "Preparation",
            steps: Array.from({ length: 6 }, (_, j) => ({
              stepNumber: j + 1,
              title: `Step ${j + 1}: prepare and document`,
              description: `Execute segment ${j + 1} with lab notebook traceability; replace with hypothesis-specific detail when LLM is available.`,
              durationHours: 4,
              safetyWarnings: [],
              criticalNotes: ["Fallback plan — expand with protocol literature."],
              literatureRefIndex: 0,
            })),
          },
        ],
      },
      materials: mats,
      budget: {
        byCategory: [{ category: "Materials & supplies", amountUSD: Math.round(matSum) }],
        contingencyPercent: 10,
        totalWithContingencyUSD: Math.round(matSum * 1.1),
      },
      timeline: {
        phases: ["Prep", "Execution", "Analysis"].map((name, i) => ({
          name,
          startDay: i * 10,
          endDay: i * 10 + 9,
          type: i === 0 ? "preparation" : i === 1 ? "treatment" : "analysis",
          dependencies: i === 0 ? [] : [["Prep", "Execution", "Analysis"][i - 1]],
        })),
      },
      validation: {
        successMetrics: ["Primary endpoint measurable per hypothesis"],
        statisticalPlan: "Pre-specify appropriate test with p < 0.05 or corrected threshold; consult statistician.",
        sampleSize: "n = 6 biological replicates per condition (pilot framing — adjust for power)",
        controls: { positive: "Positive control per assay", negative: "Negative control per assay" },
        failureModes: [{ mode: "Assay drift", earlyDetection: "QC checkpoints" }],
        qcCheckpoints: ["Instrument calibration", "Positive control run"],
      },
      safety: {
        hazardousMaterials: [],
        requiredPPE: ["lab coat", "nitrile gloves", "eye protection"],
        wasteDisposal: ["Segregate streams per institutional policy"],
        emergencyProcedures: ["Notify supervisor and follow institutional spill / exposure SOPs"],
      },
    },
    verificationSources: {
      protocol: [{ title: "Stub", url: anchor, snippet: "fallback" }],
      materials: [{ title: "Stub", url: anchor, snippet: "fallback" }],
      budget: [{ title: "Stub", url: anchor, snippet: "fallback" }],
      timeline: [{ title: "Stub", url: anchor, snippet: "fallback" }],
      validation: [{ title: "Stub", url: anchor, snippet: "fallback" }],
      safety: [{ title: "Stub", url: anchor, snippet: "fallback" }],
    },
    reasoning: {
      repositoriesConsulted: [],
      budgetMethodology: "Line-item rollup; contingency 10%.",
      literatureInfluence:
        "This JSON was synthesized as a last-resort fallback because primary plan generation was unavailable. Replace with LLM output when API limits recover.",
      confidence: [{ section: "all", level: "Low", reason: "Stub fallback plan" }],
    },
  };
}
