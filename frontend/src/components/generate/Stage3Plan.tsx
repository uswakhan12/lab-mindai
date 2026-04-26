import { Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FullPlan } from "@/types/plan";
import { generateMockPlan } from "@/lib/plan-generator";
import { addToHistory } from "@/lib/storage";
import { fetchPlanVerificationSources } from "@/lib/fetch-plan-sources";
import { PlanView } from "@/components/plan/PlanView";
import { useGenerateStore } from "@/lib/generateStore";
import { PLAN_LOADING_STEPS } from "@/lib/planLoadingSteps";

export type PlanPipelinePhase = "idle" | "loading" | "ready" | "error";

export function Stage3Plan({
  hypothesis,
  suspended = false,
}: {
  hypothesis: string;
  /** When true, cancel in-flight plan generation. */
  suspended?: boolean;
}) {
  const s3StepIdx = useGenerateStore((s) => s.s3StepIdx);
  const plan = useGenerateStore((s) => s.s3Plan);
  const modelFlow = useGenerateStore((s) => s.s3ModelFlow);
  const error = useGenerateStore((s) => s.s3Error);
  const genInterrupted = useGenerateStore((s) => s.s3GenInterrupted);
  const applyMockAndSources = async () => {
    const p = generateMockPlan(hypothesis);
    addToHistory(hypothesis, p);
    const st = useGenerateStore.getState();
    st.setS3ModelFlow({ retrievalModel: "mock", planningModel: "mock-fallback" });
    try {
      const verificationSources = await fetchPlanVerificationSources(hypothesis, p);
      st.setS3Plan(verificationSources ? { ...p, verificationSources } : p);
    } catch {
      st.setS3Plan(p);
    }
    st.setS3PipelinePhase("ready");
  };

  if (suspended) {
    if (plan) {
      return (
        <div className="space-y-4">
          <div
            className="rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-3 text-sm text-foreground/90"
            data-print-hide
          >
            You are editing the hypothesis. <strong>Save</strong> to run the pipeline with the new
            text. <strong>Cancel</strong> to keep this plan and close the editor.
          </div>
          <PlanView plan={plan} hypothesis={hypothesis} modelFlow={modelFlow} />
        </div>
      );
    }
    return (
      <div
        className="rounded-2xl border border-border/80 bg-card/50 backdrop-blur p-8 text-center animate-fade-in"
        data-print-hide
      >
        <p className="text-sm text-muted-foreground">
          Experiment plan generation is paused while you edit the hypothesis.
        </p>
        <p className="text-sm text-foreground/90 mt-2">
          Save to apply a new hypothesis and re-run, or cancel to continue.
        </p>
      </div>
    );
  }

  if (plan) {
    return <PlanView plan={plan} hypothesis={hypothesis} modelFlow={modelFlow} />;
  }

  if (!suspended && genInterrupted && !error) {
    return (
      <div
        className="rounded-2xl border border-border/80 bg-card/50 backdrop-blur p-8 text-center space-y-4 animate-fade-in"
        data-print-hide
      >
        <p className="text-sm text-foreground/90">
          Plan generation was stopped while the hypothesis was open for editing.
        </p>
        <Button
          type="button"
          onClick={() => useGenerateStore.getState().bumpS3GenRerun()}
          className="btn-cta"
        >
          Generate plan again
        </Button>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-2xl border border-destructive/40 bg-card/60 backdrop-blur p-8 animate-fade-in"
        data-print-hide
      >
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
          <div>
            <p className="font-semibold">Experiment plan generation failed</p>
            <p className="text-sm text-muted-foreground mt-1">{error}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={applyMockAndSources}>
            Use mock plan anyway
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl border border-border bg-card/50 backdrop-blur p-8 animate-fade-in"
      data-print-hide
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="relative">
          <Loader2 className="h-6 w-6 text-primary animate-spin" />
          <div className="absolute inset-0 blur-md bg-primary/40 -z-10" />
        </div>
        <p className="font-medium">Generating your experiment plan…</p>
      </div>
      <div className="space-y-2.5">
        {PLAN_LOADING_STEPS.slice(0, s3StepIdx + 1).map((s, i) => (
          <div
            key={i}
            className={`flex items-center gap-2 text-sm animate-fade-in ${i === s3StepIdx ? "text-foreground" : "text-muted-foreground"}`}
          >
            <span className={i < s3StepIdx ? "text-emerald-400" : ""}>
              {i < s3StepIdx ? "✓" : i === s3StepIdx ? "▸" : "·"}
            </span>
            <span>{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
