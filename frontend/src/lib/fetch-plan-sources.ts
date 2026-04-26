import type { FullPlan, PlanVerificationSources } from "@/types/plan";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8080";

export async function fetchPlanVerificationSources(
  hypothesis: string,
  plan: FullPlan,
): Promise<PlanVerificationSources | undefined> {
  const materials = plan.experimentPlan.materials.slice(0, 10).map((m) => m.item);
  const res = await fetch(`${BACKEND_URL}/api/plan-sources`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      hypothesis,
      experimentTitle: plan.experimentPlan.title,
      domain: plan.domain,
      materials,
    }),
  });
  if (!res.ok) return undefined;
  const data = (await res.json()) as { sources?: PlanVerificationSources };
  return data.sources;
}
