/**
 * Ensure top-level `plan.reasoning` matches the API / frontend contract.
 * LLMs sometimes nest `reasoning` only under `experimentPlan`; governance and safety
 * patches also write to `experimentPlan.reasoning`.
 *
 * @param {object | null | undefined} plan
 */
export function ensureFullPlanReasoningRoot(plan) {
  if (!plan || typeof plan !== "object") return;
  const ep = plan.experimentPlan;
  const nested = ep?.reasoning && typeof ep.reasoning === "object" ? ep.reasoning : {};
  const root = plan.reasoning && typeof plan.reasoning === "object" ? plan.reasoning : {};

  const str = (...vals) => {
    for (const v of vals) {
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  };
  const pickArray = (a, b, fallback) => {
    if (Array.isArray(a) && a.length > 0) return a;
    if (Array.isArray(b) && b.length > 0) return b;
    return fallback;
  };

  const nLi = str(nested.literatureInfluence);
  const rLi = str(root.literatureInfluence);
  const literatureInfluence =
    (nLi.length >= rLi.length ? str(nested.literatureInfluence, root.literatureInfluence) : str(root.literatureInfluence, nested.literatureInfluence)) ||
    "No literature influence narrative was attached to this draft.";

  const merged = {
    repositoriesConsulted: pickArray(root.repositoriesConsulted, nested.repositoriesConsulted, []),
    budgetMethodology:
      str(root.budgetMethodology, nested.budgetMethodology) ||
      "Materials line-item rollup; replace with explicit methodology when available.",
    literatureInfluence,
    confidence: pickArray(root.confidence, nested.confidence, [
      { section: "all", level: "Medium", reason: "Reasoning confidence not specified." },
    ]),
  };

  plan.reasoning = merged;
  if (ep && typeof ep === "object") {
    ep.reasoning = { ...nested, ...merged };
  }
}
