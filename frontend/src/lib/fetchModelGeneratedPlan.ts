import { detectDomain } from "@/lib/plan-generator";
import {
  fetchReviewsForDomain,
  getReviewsForDomain,
  labmindApiHeaders,
} from "@/lib/storage";
import type {
  ExecutionReadiness,
  FeedbackLearningReport,
  FullPlan,
  QualityChecks,
  ScientificMechanistic,
} from "@/types/plan";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8080";

export interface ModelFlowMeta {
  retrievalModel?: string;
  planningModel?: string;
  retrievalOutlineUsed?: boolean;
}

export interface IncorporationReportRow {
  index?: number;
  sourceHypothesis?: string;
  domain?: string;
  overallRating?: number;
  reviewerExpertise?: string;
  corrections?: { section: string; excerpt: string }[];
  issues?: { section: string; excerpt: string }[];
  promptInclusion?: string;
}

export interface PlanFeedbackSummary {
  priorFeedbackCount?: number;
  appliedHighlights?: string[];
  feedbackMatch?: { method: string; ontologyTags: string[]; similarReviewCount: number };
  incorporationReport?: IncorporationReportRow[];
  feedbackLearningReport?: FeedbackLearningReport;
}

export async function fetchModelGeneratedPlan(
  hypothesis: string,
  signal?: AbortSignal,
): Promise<{
  plan: FullPlan;
  modelFlow?: ModelFlowMeta;
  feedbackSummary?: PlanFeedbackSummary;
  qualityChecks?: QualityChecks;
  scientificMechanistic?: ScientificMechanistic;
  executionReadiness?: ExecutionReadiness;
}> {
  const { domain } = detectDomain(hypothesis);
  const localFeedback = getReviewsForDomain(domain).slice(-5);
  const remoteFeedback = await fetchReviewsForDomain(domain, 8);
  const deduped = [...localFeedback, ...remoteFeedback].filter((r, idx, arr) => {
    const signature = `${r.timestamp}-${r.originalPlanSummary}-${r.reviewerExpertise}`;
    return (
      arr.findIndex(
        (x) => `${x.timestamp}-${x.originalPlanSummary}-${x.reviewerExpertise}` === signature,
      ) === idx
    );
  });
  const priorFeedback = deduped.slice(0, 10).map((r) => ({
    domain: r.domain,
    overallRating: r.overallRating,
    reviewerExpertise: r.reviewerExpertise,
    issues: r.issues,
    corrections: r.corrections,
  }));

  const res = await fetch(`${BACKEND_URL}/api/experiment-plan`, {
    method: "POST",
    headers: labmindApiHeaders(),
    body: JSON.stringify({ hypothesis, domain, priorFeedback }),
    signal,
  });
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as {
      error?: string;
      details?: string;
      procurementGateErrors?: string[];
      governanceGateErrors?: string[];
    };
    const procGate =
      res.status === 422 &&
      Array.isArray(payload.procurementGateErrors) &&
      payload.procurementGateErrors.length > 0
        ? `\n${payload.procurementGateErrors.join("\n")}`
        : "";
    const govGate =
      res.status === 422 &&
      Array.isArray(payload.governanceGateErrors) &&
      payload.governanceGateErrors.length > 0
        ? `\n${payload.governanceGateErrors.join("\n")}`
        : "";
    const msg = [payload.error, payload.details].filter(Boolean).join(" — ") + procGate + govGate;
    throw new Error(msg || "Experiment plan generation failed.");
  }
  const data = (await res.json()) as {
    plan?: FullPlan;
    modelFlow?: ModelFlowMeta;
    feedbackSummary?: PlanFeedbackSummary;
    qualityChecks?: QualityChecks;
    scientificMechanistic?: ScientificMechanistic;
    executionReadiness?: ExecutionReadiness;
  };
  if (!data?.plan) throw new Error("Backend did not return a plan.");
  return {
    plan: data.plan,
    modelFlow: data.modelFlow,
    feedbackSummary: data.feedbackSummary,
    qualityChecks: data.qualityChecks,
    scientificMechanistic: data.scientificMechanistic,
    executionReadiness: data.executionReadiness,
  };
}
