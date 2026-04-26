import { detectDomain } from "@/lib/plan-generator";
import { getReviewsForDomain } from "@/lib/storage";
import type { FullPlan } from "@/types/plan";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8080";

export interface ModelFlowMeta {
  retrievalModel?: string;
  planningModel?: string;
}

export async function fetchModelGeneratedPlan(
  hypothesis: string,
  signal?: AbortSignal,
): Promise<{ plan: FullPlan; modelFlow?: ModelFlowMeta }> {
  const { domain } = detectDomain(hypothesis);
  const priorFeedback = getReviewsForDomain(domain)
    .slice(-5)
    .map((r) => ({
      domain: r.domain,
      overallRating: r.overallRating,
      reviewerExpertise: r.reviewerExpertise,
      issues: r.issues,
      corrections: r.corrections,
    }));

  const res = await fetch(`${BACKEND_URL}/api/experiment-plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hypothesis, priorFeedback }),
    signal,
  });
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { error?: string; details?: string };
    const msg = [payload.error, payload.details].filter(Boolean).join(" — ");
    throw new Error(msg || "Experiment plan generation failed.");
  }
  const data = (await res.json()) as { plan?: FullPlan; modelFlow?: ModelFlowMeta };
  if (!data?.plan) throw new Error("Backend did not return a plan.");
  return { plan: data.plan, modelFlow: data.modelFlow };
}
