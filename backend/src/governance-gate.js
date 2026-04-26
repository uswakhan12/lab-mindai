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
 * @param {{ hypothesis?: string, plan: object }} args
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateGovernanceRelease({ hypothesis, plan }) {
  const hypo = String(hypothesis || "").toLowerCase();
  const b = blob(plan);
  const combined = `${hypo} ${b}`;

  const errors = [];

  const humanSubjects =
    /\b(clinical trial|clinical study|human subjects?|patients?|healthy volunteers?|informed consent|randomized patients)\b/i.test(
      combined,
    ) ||
    /\b(primary human|human donors?|human biopsy|human volunteers|human participants|pediatric subjects)\b/i.test(
      combined,
    );

  const irbMention =
    /\birb\b|\binstitutional review\b|\bethics (committee|approval|board)\b|\bhec\b|\bresearch ethics\b/i.test(b);

  if (humanSubjects && !irbMention) {
    errors.push(
      "GOVERNANCE_GATE: human-subjects framing detected — plan text must explicitly cite IRB / ethics committee approval steps.",
    );
  }

  const animalWork =
    /\b(mice|mouse|murine|rats?|rodent|zebrafish|danio rerio|rabbits?|guinea pigs?|swine|porcine|non-?human primate|in vivo animal|animal model|xenograft)\b/i.test(
      combined,
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
