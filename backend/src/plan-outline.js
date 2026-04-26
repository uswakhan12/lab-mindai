/**
 * Cheap outline pass (Llama 8B) so the main planner follows retrieval-specific structure
 * instead of a generic template.
 */
function extractJsonObject(text) {
  if (!text || typeof text !== "string") return null;
  const fence = text.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function generatePlanOutline({ chatLlama, hypothesis, retrievalPacket, llama8Model }) {
  const user = `You are a principal scientist. Given the hypothesis and ONLY the retrieval packet below, produce a JSON outline for a wet-lab experiment plan.

Return ONLY valid JSON:
{
  "protocolClass": "string (e.g. cell_cryo, biosensor_lateral_flow, murine_gavage, bioelectrochem_batch)",
  "primaryAssay": "string",
  "controlArms": ["string"],
  "criticalReagentFamilies": ["string"],
  "phaseOutline": [
    { "phaseName": "string", "goals": "string", "stepTitles": ["string", "... at least 2 per phase"] }
  ],
  "budgetDrivers": ["what dominates cost — be specific to this hypothesis"],
  "timelineRisks": ["string"],
  "groundingNotes": "1-3 sentences: which themes from the retrieval references (by title keywords) most constrain the design"
}

Rules:
- phaseOutline must have >= 3 phases and >= 6 step titles total across phases.
- Every string must be specific to THIS hypothesis and packet — no placeholder generics like "Phase 1" without context.
- Do NOT invent catalog numbers or URLs.

Hypothesis:
${hypothesis}

Retrieval packet (truncated):
${JSON.stringify(retrievalPacket).slice(0, 28_000)}
`;

  const raw = await chatLlama({
    model: llama8Model,
    system: "Return strict JSON only. No markdown.",
    user,
    temperature: 0.12,
  });
  const parsed = extractJsonObject(raw);
  if (!parsed || !Array.isArray(parsed.phaseOutline)) return null;
  return parsed;
}
