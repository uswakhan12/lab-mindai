import type { ExecutionReadiness, ExperimentPlan, FullPlan } from "@/types/plan";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, Clock, DollarSign, Gauge, GraduationCap, Info } from "lucide-react";
import { cn } from "@/lib/utils";

const difficultyTone: Record<ExperimentPlan["difficultyLevel"], string> = {
  Beginner: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  Intermediate: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  Advanced: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

/** Rotating accent so expertise tags don’t all look identical. */
const expertiseBadgeStyles = [
  "border-teal-500/45 bg-teal-500/12 text-teal-200 light:border-teal-600/35 light:bg-teal-500/10 light:text-teal-900",
  "border-violet-500/45 bg-violet-500/12 text-violet-200 light:border-violet-600/35 light:bg-violet-500/10 light:text-violet-900",
  "border-cyan-500/45 bg-cyan-500/12 text-cyan-200 light:border-cyan-600/35 light:bg-cyan-500/10 light:text-cyan-900",
  "border-sky-500/45 bg-sky-500/12 text-sky-200 light:border-sky-600/35 light:bg-sky-500/10 light:text-sky-900",
];

interface Props {
  plan: FullPlan;
  hypothesis: string;
  executionReadiness?: ExecutionReadiness;
}

export function OverviewTab({ plan, hypothesis, executionReadiness }: Props) {
  const ep = plan.experimentPlan;
  const budget = ep.budget;
  const contingencyPct = Number.isFinite(Number(budget?.contingencyPercent))
    ? Number(budget?.contingencyPercent)
    : 10;
  const totalWithContingency = Number.isFinite(Number(budget?.totalWithContingencyUSD))
    ? Number(budget?.totalWithContingencyUSD)
    : Math.round(Number(ep.totalCostUSD || 0) * (1 + contingencyPct / 100));
  const hasVerificationSources =
    !!plan.verificationSources &&
    Object.values(plan.verificationSources).some((arr) => Array.isArray(arr) && arr.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-widest text-lab-violet mb-2">Experiment Plan</p>
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight leading-tight">
            {ep.title}
          </h2>
        </div>
        <Badge className={cn("border", difficultyTone[ep.difficultyLevel])}>
          {ep.difficultyLevel}
        </Badge>
      </div>

      {hasVerificationSources && (
        <div
          className="rounded-xl border border-cyan-500/25 bg-gradient-to-r from-cyan-500/8 to-card/50 p-4 text-sm"
          data-print-card
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300 light:text-cyan-800 mb-1.5 flex items-center gap-2">
            <Info className="h-3.5 w-3.5 shrink-0 text-cyan-400 light:text-cyan-700" />
            Live web verification (Tavily)
          </p>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Use the &quot;Verify this section&quot; blocks in Protocol, Materials, Budget, Timeline,
            Validation, and Safety to open independent web sources before you order reagents or lock
            in spend.
          </p>
        </div>
      )}

      <div
        className="rounded-xl border border-border/80 border-l-4 border-l-lab-teal/50 bg-gradient-to-br from-lab-teal/8 via-card/50 to-card/40 backdrop-blur p-5"
        data-print-card
      >
        <p className="text-xs uppercase tracking-widest text-lab-teal mb-2">Hypothesis</p>
        <p className="text-foreground/95 leading-relaxed italic">"{hypothesis}"</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <StatCard
          tone="cost"
          icon={<DollarSign className="h-5 w-5" />}
          label="Estimated total cost"
          value={`$${Number(ep.totalCostUSD ?? 0).toLocaleString()}`}
          sub={`Includes ${contingencyPct}% contingency: $${totalWithContingency.toLocaleString()}`}
          big
        />
        <StatCard
          tone="duration"
          icon={<Clock className="h-5 w-5" />}
          label="Estimated duration"
          value={`${Number(ep.totalDurationDays ?? 0)} days`}
          sub={`${Math.ceil(Number(ep.totalDurationDays ?? 0) / 7)} weeks of bench time`}
          big
        />
      </div>

      {!!executionReadiness && (
        <div
          className={cn(
            "rounded-xl border p-4 flex flex-wrap items-center gap-4",
            executionReadiness.tier === "order_ready" &&
              "border-emerald-500/35 bg-emerald-500/[0.06]",
            executionReadiness.tier === "pilot_ready" && "border-amber-500/35 bg-amber-500/[0.06]",
            executionReadiness.tier === "draft" && "border-border bg-card/30",
          )}
          data-print-card
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/15 p-2.5 text-primary">
              <ClipboardCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                Procurement readiness
              </p>
              <p className="text-xl font-semibold">
                {executionReadiness.scoreOutOf10.toFixed(1)}
                <span className="text-sm font-normal text-muted-foreground"> / 10</span>
              </p>
            </div>
          </div>
          <p className="text-sm text-foreground/85 flex-1 min-w-[200px] leading-relaxed">
            {executionReadiness.headline}
          </p>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <div
          className="rounded-xl border border-violet-500/20 bg-gradient-to-b from-violet-500/6 to-card/40 p-5"
          data-print-card
        >
          <div className="flex items-center gap-2 mb-3 text-violet-300 light:text-violet-800">
            <GraduationCap className="h-4 w-4 text-violet-400 light:text-violet-700" />
            <p className="text-xs uppercase tracking-widest">Required expertise</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {ep.expertiseTags.map((tag, i) => (
              <Badge key={tag} className={cn("border font-medium", expertiseBadgeStyles[i % expertiseBadgeStyles.length])}>
                {tag}
              </Badge>
            ))}
          </div>
        </div>

        <div
          className="rounded-xl border border-emerald-500/25 bg-gradient-to-b from-emerald-500/8 to-card/40 p-5"
          data-print-card
        >
          <div className="flex items-center gap-2 mb-3 text-emerald-300 light:text-emerald-800">
            <Gauge className="h-4 w-4 text-emerald-400 light:text-emerald-700" />
            <p className="text-xs uppercase tracking-widest">Hypothesis assessment</p>
          </div>
          <div className="flex items-center gap-3 mb-2">
            <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/40 light:text-emerald-900 light:border-emerald-600/35">
              {plan.hypothesisAnalysis.strengthScore}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {plan.hypothesisAnalysis.strengthReason}
            </span>
          </div>
        </div>
      </div>

      <div
        className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex gap-3"
        data-print-card
      >
        <Info className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-100/90 leading-relaxed">
          <strong>Scientific honesty:</strong> All cost estimates reflect 2024-2025 supplier pricing
          — verify current rates before procurement. Catalog numbers should be verified against
          current supplier inventories. Timeline assumes standard institutional lab access.
        </p>
      </div>
    </div>
  );
}

const statTone: Record<
  "cost" | "duration",
  { card: string; label: string; value: string }
> = {
  cost: {
    card:
      "border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 via-card/55 to-card/50",
    label: "text-emerald-300/90 light:text-emerald-800",
    value: "text-4xl text-emerald-200 light:text-emerald-700",
  },
  duration: {
    card:
      "border-sky-500/25 bg-gradient-to-br from-sky-500/10 via-card/55 to-card/50",
    label: "text-sky-300/90 light:text-sky-900",
    value: "text-4xl text-sky-200 light:text-sky-800",
  },
};

function StatCard({
  icon,
  label,
  value,
  sub,
  big = false,
  tone = "cost",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  big?: boolean;
  tone?: "cost" | "duration";
}) {
  const t = statTone[tone];
  return (
    <div className={cn("rounded-xl border backdrop-blur p-5", t.card)} data-print-card>
      <div className={cn("flex items-center gap-2 mb-3", t.label)}>
        {icon}
        <p className="text-xs uppercase tracking-widest">{label}</p>
      </div>
      <p
        className={cn(
          "font-display font-semibold tracking-tight",
          big ? t.value : "text-2xl text-foreground",
        )}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground mt-2">{sub}</p>}
    </div>
  );
}
