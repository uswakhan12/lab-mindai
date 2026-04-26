/**
 * Align experimentPlan.totalCostUSD and budget.byCategory / totalWithContingencyUSD
 * with summed material line totals so QC and execution-readiness math stay consistent
 * when the model rounds categories differently from line items.
 *
 * Always ensures `experimentPlan.budget` is a coherent object so API consumers and
 * the frontend never see a missing `budget` when `experimentPlan` exists.
 *
 * @param {object | null | undefined} plan
 */
export function normalizePlanFinancials(plan) {
  const ep = plan?.experimentPlan;
  if (!ep || typeof ep !== "object") return;

  if (!ep.budget || typeof ep.budget !== "object") ep.budget = {};
  const bud = ep.budget;
  if (!Array.isArray(bud.byCategory)) bud.byCategory = [];
  if (!Number.isFinite(Number(bud.contingencyPercent))) bud.contingencyPercent = 10;

  const materials = Array.isArray(ep.materials) ? ep.materials : [];
  const matSum = materials.reduce((s, m) => s + Number(m?.totalCostUSD || 0), 0);

  if (Number.isFinite(matSum) && matSum > 0) {
    const rounded = Math.round(matSum);
    ep.totalCostUSD = rounded;

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
  }

  const cats = Array.isArray(bud.byCategory) ? bud.byCategory.filter((b) => b && typeof b === "object") : [];
  if (cats.length === 0) {
    const header = Number(ep.totalCostUSD);
    if (Number.isFinite(header) && header > 0) {
      bud.byCategory = [{ category: "Materials & supplies", amountUSD: Math.round(header) }];
    }
  }

  const finalSub = (Array.isArray(bud.byCategory) ? bud.byCategory : []).reduce(
    (s, b) => s + Number(b?.amountUSD || 0),
    0,
  );
  const pct = Number(bud.contingencyPercent);
  bud.totalWithContingencyUSD = Number.isFinite(pct)
    ? Math.round(finalSub * (1 + pct / 100))
    : Math.round(finalSub * 1.1);
}
