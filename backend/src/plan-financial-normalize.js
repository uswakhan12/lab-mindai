/**
 * Align experimentPlan.totalCostUSD and budget.byCategory / totalWithContingencyUSD
 * with summed material line totals so QC and execution-readiness math stay consistent
 * when the model rounds categories differently from line items.
 *
 * @param {object | null | undefined} plan
 */
export function normalizePlanFinancials(plan) {
  const ep = plan?.experimentPlan;
  if (!ep || typeof ep !== "object") return;

  const materials = Array.isArray(ep.materials) ? ep.materials : [];
  const matSum = materials.reduce((s, m) => s + Number(m?.totalCostUSD || 0), 0);
  if (!Number.isFinite(matSum) || matSum <= 0) return;

  const rounded = Math.round(matSum);
  ep.totalCostUSD = rounded;

  if (!ep.budget || typeof ep.budget !== "object") ep.budget = {};
  const bud = ep.budget;
  let items = Array.isArray(bud.byCategory) ? bud.byCategory.filter((b) => b && typeof b === "object") : [];
  let sub = items.reduce((s, b) => s + Number(b?.amountUSD || 0), 0);

  if (items.length === 0 || sub <= 0) {
    bud.byCategory = [{ category: "Materials & supplies", amountUSD: rounded }];
  } else if (Math.abs(sub - rounded) / Math.max(sub, rounded, 1) > 0.05) {
    const factor = rounded / sub;
    for (const b of items) {
      const amt = Number(b.amountUSD || 0);
      b.amountUSD = Math.round(amt * factor);
    }
    const newSub = items.reduce((s, b) => s + Number(b.amountUSD || 0), 0);
    const drift = rounded - newSub;
    if (drift !== 0 && items[0]) items[0].amountUSD = Number(items[0].amountUSD || 0) + drift;
  }

  const finalSub = (Array.isArray(bud.byCategory) ? bud.byCategory : []).reduce((s, b) => s + Number(b?.amountUSD || 0), 0);
  const pct = Number(bud.contingencyPercent);
  if (Number.isFinite(pct) && finalSub > 0) {
    bud.totalWithContingencyUSD = Math.round(finalSub * (1 + pct / 100));
  }
}
