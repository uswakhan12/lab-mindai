import { useState } from "react";
import type { FullPlan } from "@/types/plan";
import { AlertTriangle, Info, Clock, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { VerificationSourcesBlock } from "./VerificationSourcesBlock";

export function ProtocolTab({ plan }: { plan: FullPlan }) {
  const [checked, setChecked] = useState<Set<number>>(new Set());

  const toggle = (n: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(n) ? next.delete(n) : next.add(n);
      return next;
    });
  };

  const allSteps = plan.experimentPlan.protocol.phases.flatMap((p) => p.steps);
  const completedCount = allSteps.filter((s) => checked.has(s.stepNumber)).length;

  return (
    <div className="space-y-8">
      <VerificationSourcesBlock plan={plan} section="protocol" />
      <div className="rounded-xl border border-border bg-card/40 p-4 flex items-center justify-between flex-wrap gap-3" data-print-hide>
        <p className="text-sm text-lab-teal light:text-teal-800">
          {completedCount} of {allSteps.length} steps complete
        </p>
        <div className="flex-1 min-w-[180px] max-w-md h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary-gradient transition-all duration-500"
            style={{ width: `${(completedCount / allSteps.length) * 100}%` }}
          />
        </div>
      </div>

      {plan.experimentPlan.protocol.phases.map((phase, pi) => (
        <section key={phase.phaseName} className="space-y-4 avoid-break">
          <div className="flex items-baseline gap-3">
            <span className="text-xs font-mono text-lab-teal light:text-teal-800 uppercase tracking-widest">
              Phase {pi + 1}
            </span>
            <h3 className="text-xl font-semibold">{phase.phaseName.replace(/^Phase \d+\s*[—-]\s*/, "")}</h3>
          </div>

          <ol className="space-y-3">
            {phase.steps.map((step) => {
              const isDone = checked.has(step.stepNumber);
              return (
                <li
                  key={step.stepNumber}
                  className={cn(
                    "rounded-xl border bg-card/50 backdrop-blur p-5 transition-all avoid-break",
                    isDone ? "border-emerald-500/30 bg-emerald-500/5" : "border-border hover:border-border/80",
                  )}
                  data-print-card
                >
                  <div className="flex gap-4">
                    <button
                      onClick={() => toggle(step.stepNumber)}
                      className={cn(
                        "shrink-0 h-7 w-7 rounded-md border-2 flex items-center justify-center transition-all",
                        isDone
                          ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                          : "border-border hover:border-primary",
                      )}
                      data-print-hide
                      aria-label={`Mark step ${step.stepNumber} complete`}
                    >
                      {isDone ? <Check className="h-4 w-4" /> : <span className="text-xs font-mono">{step.stepNumber}</span>}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <h4 className={cn("font-semibold", isDone && "line-through text-muted-foreground")}>
                          Step {step.stepNumber}: {step.title}
                        </h4>
                        <span className="shrink-0 inline-flex items-center gap-1 text-xs text-muted-foreground font-mono">
                          <Clock className="h-3 w-3" />
                          {formatDuration(step.durationHours)}
                        </span>
                      </div>
                      <p className="text-sm text-foreground/85 leading-relaxed mb-3">{step.description}</p>

                      {step.criticalNotes.length > 0 && (
                        <div className="rounded-md border border-primary/30 bg-primary/5 p-3 mb-2 flex gap-2">
                          <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                          <div className="space-y-1 text-sm text-foreground/90">
                            {step.criticalNotes.map((n, i) => (
                              <p key={i}>{n}</p>
                            ))}
                          </div>
                        </div>
                      )}
                      {step.safetyWarnings.length > 0 && (
                        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 flex gap-2">
                          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                          <div className="space-y-1 text-sm text-amber-100/90">
                            {step.safetyWarnings.map((w, i) => (
                              <p key={i}>{w}</p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

function formatDuration(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 24) return `${h} h`;
  const days = h / 24;
  return `${days.toFixed(days < 2 ? 1 : 0)} d`;
}
