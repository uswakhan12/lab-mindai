import { Check, X } from "lucide-react";
import { type QualityCheck } from "@/lib/plan-generator";
import { cn } from "@/lib/utils";

export function HypothesisStrengthMeter({ quality, className }: { quality: QualityCheck; className?: string }) {
  const { score, hasIntervention, hasMeasurableOutcome, hasMechanism, hasControl, wordCount } = quality;
  const tone =
    score >= 75 ? "emerald" : score >= 50 ? "amber" : "rose";

  const barColor = {
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
  }[tone];

  const labelColor = {
    emerald: "text-emerald-400",
    amber: "text-amber-400",
    rose: "text-rose-400",
  }[tone];

  const checks: { label: string; ok: boolean }[] = [
    { label: "Intervention", ok: hasIntervention },
    { label: "Measurable outcome", ok: hasMeasurableOutcome },
    { label: "Mechanism", ok: hasMechanism },
    { label: "Control", ok: hasControl },
  ];

  if (wordCount === 0) return null;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Hypothesis quality</span>
        <span className={cn("font-mono font-medium", labelColor)}>
          {score}/100 · {score >= 75 ? "Strong" : score >= 50 ? "Moderate" : "Needs work"}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full transition-all duration-500", barColor)}
          style={{ width: `${score}%` }}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {checks.map((c) => (
          <div
            key={c.label}
            className={cn(
              "flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors",
              c.ok
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-border bg-card/50 text-muted-foreground",
            )}
          >
            {c.ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
            {c.label}
          </div>
        ))}
      </div>
    </div>
  );
}
