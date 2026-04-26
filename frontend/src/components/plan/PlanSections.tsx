import { useState, useMemo } from "react";
import type { FullPlan } from "@/types/plan";
import { VerificationSourcesBlock } from "./VerificationSourcesBlock";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ShieldAlert, CheckCircle2, FlaskConical, Brain } from "lucide-react";
import { cn } from "@/lib/utils";
import { REASONING_KICKERS } from "@/lib/planAccents";

const COLORS = ["#3B82F6", "#8B5CF6", "#10B981", "#F59E0B", "#EC4899"];
const RATES: Record<"USD" | "EUR" | "GBP", { rate: number; symbol: string }> = {
  USD: { rate: 1, symbol: "$" },
  EUR: { rate: 0.92, symbol: "€" },
  GBP: { rate: 0.79, symbol: "£" },
};

export function BudgetTab({ plan }: { plan: FullPlan }) {
  const [currency, setCurrency] = useState<"USD" | "EUR" | "GBP">("USD");
  const { rate, symbol } = RATES[currency];
  const ep = plan.experimentPlan;
  const budget = ep.budget;
  const byCategory = Array.isArray(budget?.byCategory) ? budget.byCategory : [];
  const contingencyPercent = Number.isFinite(Number(budget?.contingencyPercent))
    ? Number(budget?.contingencyPercent)
    : 10;

  const data = byCategory.map((c) => ({
    name: c.category,
    value: Math.round(c.amountUSD * rate),
  }));
  const subtotal = data.reduce((s, d) => s + d.value, 0);
  const contingency = Math.round(subtotal * (contingencyPercent / 100));
  const grandTotal = subtotal + contingency;

  if (data.length === 0) {
    return (
      <div className="space-y-6">
        <VerificationSourcesBlock plan={plan} section="budget" />
        <p className="text-sm text-muted-foreground rounded-xl border border-border bg-card/40 p-6">
          No budget categories were returned for this plan. Regenerate after checking model output, or
          ensure material line totals / totalCostUSD are present so the server can infer a budget.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <VerificationSourcesBlock plan={plan} section="budget" />
      <div className="flex items-center justify-between flex-wrap gap-3" data-print-hide>
        <p className="text-sm text-emerald-200/90 light:text-emerald-800">
          All amounts include {contingencyPercent}% contingency buffer.
        </p>
        <div className="flex gap-1 rounded-lg border border-border bg-card/50 p-1">
          {(["USD", "EUR", "GBP"] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCurrency(c)}
              className={`px-3 py-1 text-xs font-mono rounded ${currency === c ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6 items-center print:grid-cols-1" data-budget-row>
        <div className="rounded-xl border border-border bg-card/40 p-5 h-72" data-print-card data-print-chart-hide>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: number) => `${symbol}${v.toLocaleString()}`}
                contentStyle={{ background: "#1a2238", border: "1px solid #334" }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-3">
          {data.map((d, i) => (
            <div
              key={d.name}
              className="flex items-center justify-between p-3 rounded-lg border border-border bg-card/40"
            >
              <div className="flex items-center gap-3">
                <span className="h-3 w-3 rounded-full" style={{ background: COLORS[i] }} />
                <span className="text-sm">{d.name}</span>
              </div>
              <span className="font-mono">
                {symbol}
                {d.value.toLocaleString()}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
            <span className="text-sm text-amber-300">
              Contingency ({contingencyPercent}%)
            </span>
            <span className="font-mono text-amber-300">
              {symbol}
              {contingency.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-between p-4 rounded-lg border border-primary/40 bg-primary/5">
            <span className="font-semibold">Total</span>
            <span className="font-mono font-display text-2xl text-gradient">
              {symbol}
              {grandTotal.toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Hex/rgba fills — print.css was neutering `bg-muted` (track) and `bg-emerald`/`bg-amber` (bars) to white. Inline colors survive PDF export. */
const TIMELINE_PHASE_PAINT: Record<string, { fill: string; border: string }> = {
  preparation: { fill: "rgba(59, 130, 246, 0.65)", border: "rgba(96, 165, 250, 0.9)" },
  treatment: { fill: "rgba(16, 185, 129, 0.65)", border: "rgba(52, 211, 153, 0.9)" },
  measurement: { fill: "rgba(245, 158, 11, 0.65)", border: "rgba(251, 191, 36, 0.9)" },
  analysis: { fill: "rgba(168, 85, 247, 0.65)", border: "rgba(192, 132, 252, 0.9)" },
  storage: { fill: "rgba(6, 182, 212, 0.7)", border: "rgba(103, 232, 249, 0.85)" },
};

const TIMELINE_TRACK = "rgba(120, 120, 130, 0.28)";

export function TimelineTab({ plan }: { plan: FullPlan }) {
  const phases = plan.experimentPlan.timeline.phases;
  const total = plan.experimentPlan.totalDurationDays;
  /** Backend often uses 1-based days (first day = 1). Chart axis is 0..total, so 1-based bars must offset by (start-1) or the first block sits off the left. */
  const minStart = phases.length ? Math.min(...phases.map((p) => p.startDay)) : 0;
  const oneBased = minStart >= 1;
  const typeKeys = Object.keys(TIMELINE_PHASE_PAINT) as (keyof typeof TIMELINE_PHASE_PAINT)[];
  return (
    <div className="space-y-5">
      <VerificationSourcesBlock plan={plan} section="timeline" />
      <div data-timeline-gantt>
        <p className="text-sm text-sky-200/90 light:text-sky-800">
          Total duration:{" "}
          <span className="text-sky-100 light:text-sky-900 font-medium">{total} days (~{Math.ceil(total / 7)} weeks)</span>
        </p>
        <p className="text-xs text-sky-200/90 light:text-sky-800/90 leading-relaxed max-w-2xl">
          Long stretches usually mean <span className="text-sky-100/95 light:text-sky-900">off-bench</span> work: e.g. cryovials in liquid nitrogen, cell expansion, reagent lead time, or scheduled core-facility runs—always cross-check the protocol for what actually happens in those days.
        </p>
        <div className="rounded-xl border border-border bg-card/40 p-5 space-y-3" data-print-card>
          {phases.map((p) => {
            const spanDays = Math.max(0, p.endDay - p.startDay + 1);
            const widthPct = total > 0 ? (spanDays / total) * 100 : 0;
            const t0 = oneBased ? p.startDay - 1 : p.startDay;
            const offsetPct = total > 0 ? (t0 / total) * 100 : 0;
            const paint = TIMELINE_PHASE_PAINT[p.type] ?? TIMELINE_PHASE_PAINT.preparation;
            return (
              <div key={p.name} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{p.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">Day {p.startDay}–{p.endDay} · {Math.max(0, p.endDay - p.startDay + 1)}d</span>
                </div>
                <div
                  className="relative h-7 rounded-md overflow-hidden border border-border/30"
                  style={{ backgroundColor: TIMELINE_TRACK }}
                >
                  <div
                    className="absolute h-full min-w-px rounded-sm shadow-sm box-border"
                    style={{
                      left: `${offsetPct}%`,
                      width: `${widthPct}%`,
                      backgroundColor: paint.fill,
                      border: `2px solid ${paint.border}`,
                    }}
                  />
                </div>
              </div>
            );
          })}
          <div className="flex items-center justify-between pt-3 border-t border-border text-xs font-mono text-muted-foreground">
            <span>{oneBased ? "Day 1" : "Day 0"}</span>
            <span>Day {total}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          {typeKeys.map((k) => {
            const { fill, border } = TIMELINE_PHASE_PAINT[k];
            return (
              <div key={k} className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-sm shrink-0 box-border shadow-sm"
                  style={{ backgroundColor: fill, border: `1px solid ${border}` }}
                />
                <span className="capitalize text-muted-foreground">{k}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ValidationTab({ plan }: { plan: FullPlan }) {
  const v = plan.experimentPlan.validation;
  return (
    <div className="space-y-5">
      <VerificationSourcesBlock plan={plan} section="validation" />
      <Section
        icon={<CheckCircle2 className="h-4 w-4 text-emerald-400" />}
        title="Primary success metrics"
        titleClassName="text-emerald-100 light:text-emerald-900"
      >
        <ul className="space-y-2">
          {v.successMetrics.map((m, i) => (
            <li key={i} className="text-sm flex gap-2">
              <span className="text-emerald-400">✓</span>
              {m}
            </li>
          ))}
        </ul>
      </Section>
      <Section
        icon={<Brain className="h-4 w-4 text-violet-400" />}
        title="Statistical analysis plan"
        titleClassName="text-violet-200 light:text-violet-900"
      >
        <p className="text-sm text-foreground/90 leading-relaxed">{v.statisticalPlan}</p>
        <p className="text-sm mt-3">
          <span className="text-muted-foreground">Sample size:</span> {v.sampleSize}
        </p>
      </Section>
      <Section
        icon={<FlaskConical className="h-4 w-4 text-cyan-400" />}
        title="Required controls"
        titleClassName="text-cyan-200 light:text-cyan-900"
      >
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
            <p className="text-xs uppercase text-emerald-400 mb-1">Positive</p>
            <p className="text-sm">{v.controls.positive}</p>
          </div>
          <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-3">
            <p className="text-xs uppercase text-rose-400 mb-1">Negative</p>
            <p className="text-sm">{v.controls.negative}</p>
          </div>
        </div>
      </Section>
      <Section
        icon={<AlertTriangle className="h-4 w-4 text-amber-400" />}
        title="Failure modes & early detection"
        titleClassName="text-amber-200 light:text-amber-900"
      >
        <div className="space-y-2">
          {v.failureModes.map((f, i) => (
            <div key={i} className="rounded-md border border-border bg-card/30 p-3">
              <p className="font-medium text-sm">{f.mode}</p>
              <p className="text-xs text-muted-foreground mt-1">
                <span className="text-amber-400">Early detection:</span> {f.earlyDetection}
              </p>
            </div>
          ))}
        </div>
      </Section>
      <Section
        icon={<CheckCircle2 className="h-4 w-4 text-sky-400" />}
        title="QC checkpoints"
        titleClassName="text-sky-200 light:text-sky-900"
      >
        <ul className="space-y-1.5">
          {v.qcCheckpoints.map((c, i) => (
            <li key={i} className="text-sm flex gap-2 text-foreground/85">
              <span className="text-primary">▸</span>
              {c}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

export function SafetyTab({ plan }: { plan: FullPlan }) {
  const s = plan.experimentPlan.safety;
  return (
    <div className="space-y-5">
      <VerificationSourcesBlock plan={plan} section="safety" />
      <Section
        icon={<ShieldAlert className="h-4 w-4 text-rose-400" />}
        title="Hazardous materials"
        titleClassName="text-rose-200 light:text-rose-900"
      >
        <div className="space-y-3">
          {s.hazardousMaterials.map((m, i) => (
            <div
              key={i}
              className="rounded-md border border-rose-500/30 bg-rose-500/5 p-3"
              data-print-card
            >
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <p className="font-medium">{m.material}</p>
                <div className="flex gap-1">
                  {m.ghsSymbols.map((g) => (
                    <Badge
                      key={g}
                      variant="outline"
                      className="border-rose-500/40 bg-rose-500/10 text-rose-200 text-xs font-mono"
                    >
                      {g}
                    </Badge>
                  ))}
                </div>
              </div>
              <ul className="text-xs text-foreground/80 space-y-0.5">
                {m.hazards.map((h, j) => (
                  <li key={j}>• {h}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>
      <Section
        icon={<ShieldAlert className="h-4 w-4 text-amber-400" />}
        title="Required PPE"
        titleClassName="text-amber-200 light:text-amber-900"
      >
        <div className="flex flex-wrap gap-2">
          {s.requiredPPE.map((p) => (
            <Badge
              key={p}
              variant="outline"
              className="border-amber-500/30 bg-amber-500/5 text-amber-200"
            >
              {p}
            </Badge>
          ))}
        </div>
      </Section>
      <Section
        icon={<CheckCircle2 className="h-4 w-4 text-emerald-400" />}
        title="Waste disposal"
        titleClassName="text-emerald-200 light:text-emerald-900"
      >
        <ul className="space-y-1.5 text-sm">
          {s.wasteDisposal.map((w, i) => (
            <li key={i} className="flex gap-2 text-foreground/85">
              <span className="text-primary">▸</span>
              {w}
            </li>
          ))}
        </ul>
      </Section>
      <Section
        icon={<AlertTriangle className="h-4 w-4 text-rose-400" />}
        title="Emergency procedures"
        titleClassName="text-rose-200 light:text-rose-900"
      >
        <ul className="space-y-1.5 text-sm">
          {s.emergencyProcedures.map((p, i) => (
            <li key={i} className="flex gap-2 text-foreground/85">
              <span className="text-rose-400">!</span>
              {p}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

export function ReasoningPanel({ plan }: { plan: FullPlan }) {
  const [open, setOpen] = useState(false);
  const reasoning = plan.reasoning;
  const repos = Array.isArray(reasoning?.repositoriesConsulted) ? reasoning.repositoriesConsulted : [];
  const confidence = Array.isArray(reasoning?.confidence) ? reasoning.confidence : [];
  const budgetMethodology =
    typeof reasoning?.budgetMethodology === "string" && reasoning.budgetMethodology.trim()
      ? reasoning.budgetMethodology
      : "—";
  const literatureInfluence =
    typeof reasoning?.literatureInfluence === "string" && reasoning.literatureInfluence.trim()
      ? reasoning.literatureInfluence
      : "—";
  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="rounded-xl border border-border bg-card/40 backdrop-blur"
      data-print-card
    >
      <summary className="cursor-pointer p-5 list-none flex items-center justify-between hover:bg-card/60 transition-colors">
        <span className="flex items-center gap-2 font-medium text-cyan-200 light:text-cyan-900">
          <Brain className="h-4 w-4 text-lab-violet" />
          How the AI thinks (reasoning trace)
        </span>
        <span className="text-xs text-muted-foreground">{open ? "Hide" : "Show"}</span>
      </summary>
      <div className="px-5 pb-5 space-y-4 border-t border-border pt-4">
        <div>
          <p className={cn("text-xs uppercase tracking-widest mb-2", REASONING_KICKERS[0])}>
            Repositories consulted
          </p>
          <ul className="text-sm space-y-1 text-foreground/85">
            {repos.length === 0 ? (
              <li className="text-muted-foreground text-sm">No repositories listed for this draft.</li>
            ) : (
              repos.map((r, i) => (
                <li key={i} className="text-foreground/80">
                  ▸ {r}
                </li>
              ))
            )}
          </ul>
        </div>
        <div>
          <p className={cn("text-xs uppercase tracking-widest mb-2", REASONING_KICKERS[1])}>
            Budget methodology
          </p>
          <p className="text-sm text-foreground/85 leading-relaxed">{budgetMethodology}</p>
        </div>
        <div>
          <p className={cn("text-xs uppercase tracking-widest mb-2", REASONING_KICKERS[2])}>
            Literature influence
          </p>
          <p className="text-sm text-foreground/85 leading-relaxed">{literatureInfluence}</p>
        </div>
        <div>
          <p className={cn("text-xs uppercase tracking-widest mb-2", REASONING_KICKERS[3])}>
            Confidence by section
          </p>
          <div className="space-y-2">
            {confidence.length === 0 ? (
              <p className="text-sm text-muted-foreground">No per-section confidence breakdown.</p>
            ) : (
              confidence.map((c, i) => (
                <div key={i} className="flex items-start justify-between gap-3 text-sm">
                  <div className="flex-1">
                    <span className="font-medium">{c.section}</span>
                    <span className="text-muted-foreground"> — {c.reason}</span>
                  </div>
                  <Badge
                    className={
                      c.level === "High"
                        ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                        : c.level === "Medium"
                          ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                          : "bg-rose-500/15 text-rose-300 border-rose-500/30"
                    }
                  >
                    {c.level}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </details>
  );
}

function Section({
  icon,
  title,
  children,
  titleClassName = "text-foreground/95",
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  titleClassName?: string;
}) {
  return (
    <div
      className="rounded-xl border border-border bg-card/40 backdrop-blur p-5 avoid-break"
      data-print-card
    >
      <div className="flex items-center gap-2 mb-3">
        <span>{icon}</span>
        <h3 className={cn("font-semibold", titleClassName)}>{title}</h3>
      </div>
      {children}
    </div>
  );
}
