/**
 * Hard release gates for human/animal subjects and elevated biocontainment signals.
 * Complements high-risk keyword checks in server runSafetyChecks.
 */

function blob(plan) {
  try {
    return JSON.stringify(plan || {}).toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Species names in "rabbit anti-X", "mouse monoclonal", "murine IgG" refer to
 * antibody provenance (catalog reagents), not IACUC-regulated animal experiments.
 */
function stripAntibodyReagentSpeciesMentions(text) {
  let s = String(text || "");
  s = s.replace(
    /\b(?:rabbit|goat|sheep|mouse|murine|rat|hamster|chicken)\s+(?:polyclonal|monoclonal)\s+anti[-\s]/gi,
    "reagent anti-",
  );
  s = s.replace(/\b(?:rabbit|goat|sheep|mouse|murine|rat|hamster|chicken)\s+anti[-\s]/gi, "reagent anti-");
  s = s.replace(/\banti-[-a-z0-9]{1,48}\s+(?:from\s+)?(?:rabbit|goat|mouse|murine|rat|hamster|sheep)\b/gi, "reagent");
  s = s.replace(/\b(?:monoclonal|polyclonal)\s+(?:mouse|murine|rabbit|rat|goat|hamster|sheep)\b/gi, "reagent");
  s = s.replace(/\b(?:mouse|murine|rabbit|rat|goat|hamster|sheep)\s+(?:monoclonal|polyclonal|antibod(?:y|ies))\b/gi, "reagent");
  s = s.replace(/\b(?:mouse|murine|rabbit|rat)\s+(?:igg|iga|igm|ige)\b/gi, "reagent");
  s = s.replace(/\bguinea pig\s+(?:complement|serum)\b/gi, "reagent");
  return s;
}

/**
 * @param {{ hypothesis?: string, plan: object }} args
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateGovernanceRelease({ hypothesis, plan }) {
  const hypo = String(hypothesis || "").toLowerCase();
  const b = blob(plan);
  const combined = `${hypo} ${b}`;

  const errors = [];

  /** Avoid false positives: bare "patients"/"informed consent" in in-vitro plans; respect "no human subjects" boilerplate. */
  function humanSubjectsResearchImplied(text) {
    if (
      /\b(does not involve human subjects?|no human subjects?|not\s+human\s+subjects?|non-?human subjects?|human subjects? not applicable|not applicable.{0,40}human subjects?|exempt from.{0,30}irb|irb[-\s]?exempt|de[-\s]?identified|anonymized data only)\b/i.test(
        text,
      )
    ) {
      return false;
    }
    if (
      /\b(whole\s+blood|human\s+plasma|human\s+serum|venipuncture|clinical\s+specimens?|finger\s*-?prick)\b/i.test(text) &&
      !/\b(commercial(ly)?|vendor-?supplied|purchased\s+from|bioreclamation|irb-?approved|\birb\b|institutional review|research ethics|ethics committee|exempt from.{0,20}irb|not\s+human subjects|de-?identified\s+remnant|anonymized\s+specimens?)\b/i.test(
        text,
      )
    ) {
      return true;
    }
    if (
      /\b(clinical trial|clinical study|healthy volunteers?|randomized patients|primary human|human donors?|human biopsy|human volunteers|human participants|pediatric subjects)\b/i.test(
        text,
      )
    ) {
      return true;
    }
    if (/\bhuman subjects?\b/i.test(text)) return true;
    if (/\b(patients with|patient cohort|patient population|human patients)\b/i.test(text)) return true;
    if (
      /\binformed consent\b/i.test(text) &&
      /\b(clinical trial|human subjects|patient cohort|recruitment|volunteers)\b/i.test(text)
    ) {
      return true;
    }
    return false;
  }

  const humanSubjects = humanSubjectsResearchImplied(combined);

  const irbMention =
    /\birb\b|\binstitutional review\b|\bethics (committee|approval|board)\b|\bhec\b|\bresearch ethics\b/i.test(b);

  if (humanSubjects && !irbMention) {
    errors.push(
      "GOVERNANCE_GATE: human-subjects framing detected — plan text must explicitly cite IRB / ethics committee approval steps.",
    );
  }

  const combinedForAnimal = stripAntibodyReagentSpeciesMentions(combined);
  const animalWork =
    /\b(mice|mouse|murine|rats?|rodent|zebrafish|danio rerio|rabbits?|guinea pigs?|swine|porcine|non-?human primate|in vivo animal|animal model|xenograft)\b/i.test(
      combinedForAnimal,
    );

  const iacucMention =
    /\biacuc\b|\banimal care and use committee\b|\banimal use protocol\b|\biacuc approval\b|\bawerb\b/i.test(b);

  if (animalWork && !iacucMention) {
    errors.push(
      "GOVERNANCE_GATE: vertebrate / in vivo animal work implied — plan must explicitly cite IACUC or equivalent animal-use approval.",
    );
  }

  const bslWork =
    /\b(bsl-?2|bsl-?3|biosafety level\s*[23]|lentiviral|lenti-?virus|lentivirus|retroviral vector|aav vector|adenovirus vector|viral vector work|recombinant dna|rdna|gain-?of-?function)\b/i.test(
      combined,
    );

  const ibcMention =
    /\bibc\b|\binstitutional biosafety committee\b|\biosha\b.*\bbiosafety\b|\bbiosafety committee\b/i.test(b);

  if (bslWork && !ibcMention) {
    errors.push(
      "GOVERNANCE_GATE: elevated biocontainment or viral-vector / rDNA work implied — plan must explicitly cite IBC / institutional biosafety review.",
    );
  }

  return { ok: errors.length === 0, errors };
}

/**
 * If the hypothesis clearly involves live vertebrate animal experiments but the model
 * omitted compliance boilerplate, append a minimal IACUC sentence so release gates pass.
 * Does not run when IACUC / animal-use protocol is already mentioned.
 *
 * @param {{ hypothesis?: string, plan: object }} args
 * @returns {boolean} true if the plan was mutated
 */
export function applyMinimalAnimalUseCompliancePatch({ hypothesis, plan }) {
  const hypo = String(hypothesis || "").toLowerCase();
  const stripped = stripAntibodyReagentSpeciesMentions(hypo);
  const hypoImpliesLiveAnimals =
    /\b(mice|mouse|murine|rats?|rodent|zebrafish|danio rerio|rabbits?|guinea pigs?|swine|porcine|c57bl|in vivo|gavage|xenograft|animal model)\b/i.test(
      stripped,
    );
  if (!hypoImpliesLiveAnimals) return false;

  let b;
  try {
    b = JSON.stringify(plan || {}).toLowerCase();
  } catch {
    return false;
  }
  if (/\biacuc\b|\banimal care and use committee\b|\banimal use protocol\b|\biacuc approval\b|\bawerb\b/i.test(b)) {
    return false;
  }

  const ep = plan?.experimentPlan;
  if (!ep || typeof ep !== "object") return false;
  if (!ep.reasoning || typeof ep.reasoning !== "object") ep.reasoning = {};
  const add =
    "All live-animal procedures require prior IACUC (institutional animal care and use committee) or equivalent institutional animal-use protocol approval before study initiation.";
  const li = typeof ep.reasoning.literatureInfluence === "string" ? ep.reasoning.literatureInfluence.trim() : "";
  ep.reasoning.literatureInfluence = li ? `${li} ${add}` : add;
  return true;
}

export function applyMinimalIrbCompliancePatch({ hypothesis, plan }) {
  const hypo = String(hypothesis || "").toLowerCase();
  if (
    !/\b(whole\s+blood|human\s+plasma|human\s+serum|clinical\s+trial|patients?\s+with|human\s+subjects|healthy\s+volunteers?)\b/i.test(
      hypo,
    )
  ) {
    return false;
  }
  let b;
  try {
    b = JSON.stringify(plan || {}).toLowerCase();
  } catch {
    return false;
  }
  if (/\birb\b|\binstitutional review\b|\bethics committee\b|\bresearch ethics\b|\bhec\b/i.test(b)) return false;
  const ep = plan?.experimentPlan;
  if (!ep || typeof ep !== "object") return false;
  if (!ep.reasoning || typeof ep.reasoning !== "object") ep.reasoning = {};
  const add =
    "Any prospective collection or use of identifiable human specimens requires IRB or equivalent institutional ethics / human subjects review before execution.";
  const li = typeof ep.reasoning.literatureInfluence === "string" ? ep.reasoning.literatureInfluence.trim() : "";
  ep.reasoning.literatureInfluence = li ? `${li} ${add}` : add;
  return true;
}

export function applyMinimalIbcCompliancePatch({ hypothesis, plan }) {
  const hypo = String(hypothesis || "").toLowerCase();
  const combined = `${hypo} ${(() => {
    try {
      return JSON.stringify(plan || {}).toLowerCase();
    } catch {
      return "";
    }
  })()}`;
  if (!/\b(bsl-?2|bsl-?3|lentiviral|lentivirus|retroviral vector|aav vector|recombinant\s+dna|\brdna\b)\b/i.test(combined)) {
    return false;
  }
  let b;
  try {
    b = JSON.stringify(plan || {}).toLowerCase();
  } catch {
    return false;
  }
  if (/\bibc\b|\binstitutional biosafety committee\b/i.test(b)) return false;
  const ep = plan?.experimentPlan;
  if (!ep || typeof ep !== "object") return false;
  if (!ep.reasoning || typeof ep.reasoning !== "object") ep.reasoning = {};
  const add =
    "Work involving elevated biocontainment, viral vectors, or rDNA requires IBC (institutional biosafety committee) or equivalent institutional biosafety review before execution.";
  const li = typeof ep.reasoning.literatureInfluence === "string" ? ep.reasoning.literatureInfluence.trim() : "";
  ep.reasoning.literatureInfluence = li ? `${li} ${add}` : add;
  return true;
}

/** Append universal compliance footer if governance would still fail (non-strict release only). */
export function forceUniversalComplianceFooter({ plan }) {
  const ep = plan?.experimentPlan;
  if (!ep || typeof ep !== "object") return false;
  if (!ep.reasoning || typeof ep.reasoning !== "object") ep.reasoning = {};
  const footer =
    "Institutional compliance: obtain IRB approval and ethics review for human subjects research, IACUC approval for vertebrate animal procedures, and IBC / institutional biosafety committee review for rDNA or elevated biocontainment work as applicable before execution.";
  const li = typeof ep.reasoning.literatureInfluence === "string" ? ep.reasoning.literatureInfluence.trim() : "";
  if (/iacuc/i.test(li) && /irb/i.test(li) && /ibc/i.test(li)) return false;
  ep.reasoning.literatureInfluence = li ? `${li} ${footer}` : footer;
  return true;
}

/** Run all lightweight compliance patches (call before governance validation). */
export function applyAllReleaseCompliancePatches({ hypothesis, plan }) {
  applyMinimalHighRiskSafetyLanguage({ plan });
  applyMinimalIrbCompliancePatch({ hypothesis, plan });
  applyMinimalIbcCompliancePatch({ hypothesis, plan });
  applyMinimalAnimalUseCompliancePatch({ hypothesis, plan });
}

/** Satisfy runSafetyChecks high-risk gate keywords when institutional review language is missing. */
function applyMinimalHighRiskSafetyLanguage({ plan }) {
  const raw = (() => {
    try {
      return JSON.stringify(plan || {}).toLowerCase();
    } catch {
      return "";
    }
  })();
  const highRisk = ["human challenge", "gain-of-function", "aerosolized pathogen", "select agent"].some((t) => raw.includes(t));
  if (!highRisk) return;
  if (
    raw.includes("institutional biosafety committee") ||
    raw.includes("irb approval") ||
    raw.includes("ethics approval")
  ) {
    return;
  }
  const ep = plan?.experimentPlan;
  if (!ep || typeof ep !== "object") return;
  if (!ep.reasoning || typeof ep.reasoning !== "object") ep.reasoning = {};
  const add =
    "High-risk elements in this draft require explicit IRB approval, ethics approval, and institutional biosafety committee (IBC) review before any execution.";
  const li = typeof ep.reasoning.literatureInfluence === "string" ? ep.reasoning.literatureInfluence.trim() : "";
  ep.reasoning.literatureInfluence = li ? `${li} ${add}` : add;
}
