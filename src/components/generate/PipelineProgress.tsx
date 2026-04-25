import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type StageStatus = "pending" | "active" | "complete";

export interface PipelineStage {
  id: number;
  label: string;
  status: StageStatus;
}

export function PipelineProgress({ stages }: { stages: PipelineStage[] }) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-2 md:gap-4">
        {stages.map((stage, i) => (
          <div key={stage.id} className="flex items-center flex-1 min-w-0">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={cn(
                  "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-500",
                  stage.status === "pending" && "border-border bg-card text-muted-foreground",
                  stage.status === "active" &&
                    "border-primary bg-primary/10 text-primary shadow-glow",
                  stage.status === "complete" &&
                    "border-emerald-500/60 bg-emerald-500/15 text-emerald-400",
                )}
              >
                {stage.status === "complete" ? (
                  <Check className="h-5 w-5" strokeWidth={2.5} />
                ) : stage.status === "active" ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <span className="text-sm font-semibold">{stage.id}</span>
                )}
                {stage.status === "active" && (
                  <span className="absolute inset-0 rounded-full border-2 border-primary/40 animate-ping" />
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
            </div>
            {i < stages.length - 1 && (
              <div className="flex-1 h-px mx-3 md:mx-5 relative overflow-hidden bg-border">
                <div
                  className={cn(
                    "absolute inset-y-0 left-0 transition-all duration-700",
                    stages[i + 1].status === "pending" ? "w-0" : "w-full",
                    stage.status === "complete" ? "bg-emerald-500/60" : "bg-primary",
                  )}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
