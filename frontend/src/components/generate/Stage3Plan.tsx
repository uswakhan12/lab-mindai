import { useEffect, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ExecutionReadiness, FullPlan, QualityChecks, ScientificMechanistic } from "@/types/plan";
import { detectDomain, generateMockPlan } from "@/lib/plan-generator";
import { addToHistory, fetchReviewsForDomain, getReviewsForDomain, labmindApiHeaders } from "@/lib/storage";
import { fetchPlanVerificationSources } from "@/lib/fetch-plan-sources";
import { PlanView } from "@/components/plan/PlanView";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8080";

const LOADING_STEPS = [
  "📚 Searching literature + protocols.io / Bio-protocol for prior work…",
  "🔬 Identifying required reagents from Sigma-Aldrich catalog...",
  "💰 Estimating costs based on current supplier pricing...",
  "📅 Building timeline with phase dependencies...",
  "✅ Validating protocol against MIQE guidelines...",
  "🔗 Fetching Tavily verification sources (materials, budget, safety, …)...",
];

interface ModelFlow {
  retrievalModel?: string;
  planningModel?: string;
}

interface FeedbackSummary {
  priorFeedbackCount?: number;
  appliedHighlights?: string[];
  feedbackMatch?: { method: string; ontologyTags: string[]; similarReviewCount: number };
}

async function fetchModelGeneratedPlan(
  hypothesis: string,
): Promise<{
  plan: FullPlan;
  modelFlow?: ModelFlow;
  feedbackSummary?: FeedbackSummary;
  qualityChecks?: QualityChecks;
  scientificMechanistic?: ScientificMechanistic;
  executionReadiness?: ExecutionReadiness;
}> {
  const { domain } = detectDomain(hypothesis);
  const localFeedback = getReviewsForDomain(domain).slice(-5);
  const remoteFeedback = await fetchReviewsForDomain(domain, 8);
  const deduped = [...localFeedback, ...remoteFeedback].filter((r, idx, arr) => {
    const signature = `${r.timestamp}-${r.originalPlanSummary}-${r.reviewerExpertise}`;
    return arr.findIndex((x) => `${x.timestamp}-${x.originalPlanSummary}-${x.reviewerExpertise}` === signature) === idx;
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
  });
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { error?: string; details?: string };
    const msg = [payload.error, payload.details].filter(Boolean).join(" — ");
    throw new Error(msg || "Experiment plan generation failed.");
  }
  const data = (await res.json()) as {
    plan?: FullPlan;
    modelFlow?: ModelFlow;
    feedbackSummary?: FeedbackSummary;
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

export function Stage3Plan({ hypothesis }: { hypothesis: string }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [plan, setPlan] = useState<FullPlan | null>(null);
  const [modelFlow, setModelFlow] = useState<ModelFlow | undefined>(undefined);
  const [feedbackSummary, setFeedbackSummary] = useState<FeedbackSummary | undefined>(undefined);
  const [qualityChecks, setQualityChecks] = useState<QualityChecks | undefined>(undefined);
  const [scientificMechanistic, setScientificMechanistic] = useState<ScientificMechanistic | undefined>(undefined);
  const [executionReadiness, setExecutionReadiness] = useState<ExecutionReadiness | undefined>(undefined);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    setStepIdx(0);
    setError("");
    const interval = setInterval(() => {
      setStepIdx((i) => Math.min(i + 1, LOADING_STEPS.length - 1));
    }, 1500);

    const run = async () => {
      await new Promise((r) => setTimeout(r, LOADING_STEPS.length * 1500 + 200));
      if (cancelled) return;
      clearInterval(interval);
      try {
        const generated = await fetchModelGeneratedPlan(hypothesis);
        if (cancelled) return;
        addToHistory(hypothesis, generated.plan);
        setModelFlow(generated.modelFlow);
        setFeedbackSummary(generated.feedbackSummary);
        setQualityChecks(generated.qualityChecks);
        setScientificMechanistic(generated.scientificMechanistic);
        setExecutionReadiness(generated.executionReadiness);
        setPlan(generated.plan);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Plan generation failed.");
      }
    };

    void run();
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [hypothesis]);

  if (plan) {
    return (
      <PlanView
        plan={plan}
        hypothesis={hypothesis}
        modelFlow={modelFlow}
        feedbackSummary={feedbackSummary}
        qualityChecks={qualityChecks}
        scientificMechanistic={scientificMechanistic}
        executionReadiness={executionReadiness}
      />
    );
  }
  if (error) {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-card/60 backdrop-blur p-8 animate-fade-in">
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
          <div>
            <p className="font-semibold">Experiment plan generation failed</p>
            <p className="text-sm text-muted-foreground mt-1">{error}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={async () => {
              const p = generateMockPlan(hypothesis);
              addToHistory(hypothesis, p);
              setModelFlow({ retrievalModel: "mock", planningModel: "mock-fallback" });
              try {
                const verificationSources = await fetchPlanVerificationSources(hypothesis, p);
                setPlan(verificationSources ? { ...p, verificationSources } : p);
              } catch {
                setPlan(p);
              }
            }}
          >
            Use mock plan anyway
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card/50 backdrop-blur p-8 animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <div className="relative">
          <Loader2 className="h-6 w-6 text-primary animate-spin" />
          <div className="absolute inset-0 blur-md bg-primary/40 -z-10" />
        </div>
        <p className="font-medium">Generating your experiment plan…</p>
      </div>
      <div className="space-y-2.5">
        {LOADING_STEPS.slice(0, stepIdx + 1).map((s, i) => (
          <div key={i}
            className={`flex items-center gap-2 text-sm animate-fade-in ${i === stepIdx ? "text-foreground" : "text-muted-foreground"}`}>
            <span className={i < stepIdx ? "text-emerald-400" : ""}>{i < stepIdx ? "✓" : i === stepIdx ? "▸" : "·"}</span>
            <span>{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
