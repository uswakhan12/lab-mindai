import type { ExperimentPlan, FullPlan } from "@/types/plan";
import { Badge } from "@/components/ui/badge";
import { Clock, DollarSign, Gauge, GraduationCap, Info } from "lucide-react";
import { cn } from "@/lib/utils";

const difficultyTone: Record<ExperimentPlan["difficultyLevel"], string> = {
  Beginner: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  Intermediate: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  Advanced: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

interface Props {
  plan: FullPlan;
  hypothesis: string;
}

export function OverviewTab({ plan, hypothesis }: Props) {
  const ep = plan.experimentPlan;
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-widest text-primary mb-2">Experiment Plan</p>
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight leading-tight">
            {ep.title}
          </h2>
        </div>
        <Badge className={cn("border", difficultyTone[ep.difficultyLevel])}>
          {ep.difficultyLevel}
        </Badge>
      </div>

      <div className="rounded-xl border border-border bg-card/40 backdrop-blur p-5" data-print-card>
        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Hypothesis</p>
        <p className="text-foreground/95 leading-relaxed italic">"{hypothesis}"</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <StatCard
          icon={<DollarSign className="h-5 w-5" />}
          label="Estimated total cost"
          value={`$${ep.totalCostUSD.toLocaleString()}`}
          sub={`Includes ${ep.budget.contingencyPercent}% contingency: $${ep.budget.totalWithContingencyUSD.toLocaleString()}`}
          big
        />
        <StatCard
          icon={<Clock className="h-5 w-5" />}
          label="Estimated duration"
          value={`${ep.totalDurationDays} days`}
          sub={`${Math.ceil(ep.totalDurationDays / 7)} weeks of bench time`}
          big
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card/40 p-5" data-print-card>
          <div className="flex items-center gap-2 mb-3 text-muted-foreground">
            <GraduationCap className="h-4 w-4" />
            <p className="text-xs uppercase tracking-widest">Required expertise</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {ep.expertiseTags.map((tag) => (
              <Badge key={tag} variant="outline" className="bg-card border-border">
                {tag}
              </Badge>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card/40 p-5" data-print-card>
          <div className="flex items-center gap-2 mb-3 text-muted-foreground">
            <Gauge className="h-4 w-4" />
            <p className="text-xs uppercase tracking-widest">Hypothesis assessment</p>
          </div>
          <div className="flex items-center gap-3 mb-2">
            <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
              {plan.hypothesisAnalysis.strengthScore}
            </Badge>
            <span className="text-sm text-muted-foreground">{plan.hypothesisAnalysis.strengthReason}</span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex gap-3" data-print-card>
        <Info className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-100/90 leading-relaxed">
          <strong>Scientific honesty:</strong> All cost estimates reflect 2024-2025 supplier pricing —
          verify current rates before procurement. Catalog numbers should be verified against current
          supplier inventories. Timeline assumes standard institutional lab access.
        </p>
      </div>
    </div>
  );
}

function StatCard({
  icon, label, value, sub, big = false,
}: {
  icon: React.ReactNode; label: string; value: string; sub?: string; big?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/60 backdrop-blur p-5" data-print-card>
      <div className="flex items-center gap-2 text-muted-foreground mb-3">
        {icon}
        <p className="text-xs uppercase tracking-widest">{label}</p>
      </div>
      <p className={cn("font-display font-semibold tracking-tight", big ? "text-4xl text-gradient" : "text-2xl")}>
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground mt-2">{sub}</p>}
    </div>
  );
}
