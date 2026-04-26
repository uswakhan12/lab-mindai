import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type StageStatus = "pending" | "active" | "complete" | "working";

export interface PipelineStage {
  id: number;
  label: string;
  status: StageStatus;
}

function activeRingClass(id: number) {
  if (id === 1) return "ring-stage-teal shadow-[0_0_20px_rgba(45,212,191,0.22)]";
  if (id === 2) return "ring-stage-violet shadow-[0_0_20px_rgba(167,139,250,0.2)]";
  return "ring-stage-blue shadow-glow";
}

function activePingClass(id: number) {
  if (id === 1) return "border-teal-400/45";
  if (id === 2) return "border-violet-400/45";
  return "border-primary/40";
}

function stageRingClass(status: StageStatus, id: number) {
  if (status === "active" || status === "working") return activeRingClass(id);
  if (status === "complete")
    return "border-emerald-500/60 bg-emerald-500/15 text-emerald-400";
  return "border-border bg-card text-muted-foreground";
}

function stagePingClass(status: StageStatus) {
  return status === "active";
}

export function PipelineProgress({
  stages,
  onStageClick,
  canSelectStage,
}: {
  stages: PipelineStage[];
  onStageClick?: (id: number) => void;
  canSelectStage?: (id: number) => boolean;
}) {
  return (
    <div className="w-full">
      <p className="text-xs text-muted-foreground mb-3" id="pipeline-help">
        Click a stage to move between steps. Your progress is kept while you stay on this page.
      </p>
      <div className="flex items-center justify-between gap-2 md:gap-4" aria-describedby="pipeline-help">
        {stages.map((stage, i) => {
          const canGo = canSelectStage?.(stage.id) === true;
          const isInteractive = Boolean(onStageClick && canGo);
          return (
            <div key={stage.id} className="flex items-center flex-1 min-w-0">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={isInteractive ? () => onStageClick?.(stage.id) : undefined}
                  tabIndex={isInteractive ? 0 : -1}
                  className={cn(
                    "flex items-center gap-3 min-w-0 text-left rounded-xl -m-1 p-1 transition-colors",
                    isInteractive && "hover:bg-muted/20 cursor-pointer",
                    !isInteractive && "cursor-default",
                  )}
                >
                  <div
                    className={cn(
                      "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-500",
                      stageRingClass(stage.status, stage.id),
                    )}
                  >
                    {stage.status === "complete" ? (
                      <Check className="h-5 w-5" strokeWidth={2.5} />
                    ) : stage.status === "active" || stage.status === "working" ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <span className="text-sm font-semibold">{stage.id}</span>
                    )}
                    {stagePingClass(stage.status) && (
                      <span
                        className={cn(
                          "absolute inset-0 rounded-full border-2 animate-ping",
                          activePingClass(stage.id),
                        )}
                      />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      Stage {stage.id}
                    </p>
                    <p
                      className={cn(
                        "text-sm font-medium truncate transition-colors",
                        stage.status === "pending" && "text-muted-foreground",
                        stage.status !== "pending" && "text-foreground",
                      )}
                    >
                      {stage.label}
                    </p>
                  </div>
                </button>
              </div>
              {i < stages.length - 1 && (
                <div className="flex-1 h-px mx-3 md:mx-5 relative overflow-hidden bg-border">
                  <div
                    className={cn(
                      "absolute inset-y-0 left-0 h-full transition-all duration-700",
                      ["active", "complete", "working"].includes(stages[i + 1].status) ? "w-full" : "w-0",
                      stage.status === "complete" &&
                        (stage.id === 1
                          ? "bg-gradient-to-r from-emerald-500/65 to-teal-500/50"
                          : stage.id === 2
                            ? "bg-gradient-to-r from-emerald-500/65 to-violet-500/50"
                            : "bg-emerald-500/60"),
                      stage.status !== "complete" && "bg-primary/85",
                    )}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
