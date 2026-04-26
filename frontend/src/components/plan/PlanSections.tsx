import { useState, useMemo } from "react";
import type { FullPlan } from "@/types/plan";
import { VerificationSourcesBlock } from "./VerificationSourcesBlock";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ShieldAlert, CheckCircle2, FlaskConical, Brain } from "lucide-react";

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

  const data = ep.budget.byCategory.map((c) => ({
    name: c.category,
    value: Math.round(c.amountUSD * rate),
  }));
  const subtotal = data.reduce((s, d) => s + d.value, 0);
  const contingency = Math.round(subtotal * (ep.budget.contingencyPercent / 100));
  const grandTotal = subtotal + contingency;

  return (
    <div className="space-y-6">
      <VerificationSourcesBlock plan={plan} section="budget" />
      <div className="flex items-center justify-between flex-wrap gap-3" data-print-hide>
        <p className="text-sm text-muted-foreground">
          All amounts include {ep.budget.contingencyPercent}% contingency buffer.
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

      <div className="grid md:grid-cols-2 gap-6 items-center">
        <div className="rounded-xl border border-border bg-card/40 p-5 h-72" data-print-card>
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
              Contingency ({ep.budget.contingencyPercent}%)
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

export function TimelineTab({ plan }: { plan: FullPlan }) {
  const phases = plan.experimentPlan.timeline.phases;
  const total = plan.experimentPlan.totalDurationDays;
  const colors: Record<string, string> = {
    preparation: "bg-blue-500/70 border-blue-400",
    treatment: "bg-emerald-500/70 border-emerald-400",
    measurement: "bg-amber-500/70 border-amber-400",
    analysis: "bg-purple-500/70 border-purple-400",
  };
  return (
    <div className="space-y-5">
      <VerificationSourcesBlock plan={plan} section="timeline" />
      <p className="text-sm text-muted-foreground">
        Total duration:{" "}
        <span className="text-foreground font-medium">
          {total} days (~{Math.ceil(total / 7)} weeks)
        </span>
      </p>
      <div className="rounded-xl border border-border bg-card/40 p-5 space-y-3" data-print-card>
        {phases.map((p) => {
          const widthPct = ((p.endDay - p.startDay) / total) * 100;
          const offsetPct = (p.startDay / total) * 100;
          return (
            <div key={p.name} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{p.name}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  Day {p.startDay}–{p.endDay} · {p.endDay - p.startDay}d
                </span>
              </div>
              <div className="relative h-7 rounded-md bg-muted/40 overflow-hidden">
                <div
                  className={`absolute h-full border-l-2 rounded-md ${colors[p.type] || colors.preparation}`}
                  style={{ left: `${offsetPct}%`, width: `${widthPct}%` }}
                />
              </div>
            </div>
          );
        })}
        <div className="flex items-center justify-between pt-3 border-t border-border text-xs font-mono text-muted-foreground">
          <span>Day 0</span>
          <span>Day {total}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-3 text-xs">
        {Object.entries(colors).map(([k, v]) => (
          <div key={k} className="flex items-center gap-2">
            <span className={`h-3 w-3 rounded ${v}`} />
            <span className="capitalize text-muted-foreground">{k}</span>
          </div>
        ))}
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
      <Section icon={<Brain className="h-4 w-4 text-primary" />} title="Statistical analysis plan">
        <p className="text-sm text-foreground/90 leading-relaxed">{v.statisticalPlan}</p>
        <p className="text-sm mt-3">
          <span className="text-muted-foreground">Sample size:</span> {v.sampleSize}
        </p>
      </Section>
      <Section icon={<FlaskConical className="h-4 w-4 text-primary" />} title="Required controls">
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
      <Section icon={<CheckCircle2 className="h-4 w-4 text-primary" />} title="QC checkpoints">
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
      <Section icon={<ShieldAlert className="h-4 w-4 text-rose-400" />} title="Hazardous materials">
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
      <Section icon={<ShieldAlert className="h-4 w-4 text-amber-400" />} title="Required PPE">
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
      <Section icon={<CheckCircle2 className="h-4 w-4 text-primary" />} title="Waste disposal">
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
        <span className="flex items-center gap-2 font-medium">
          <Brain className="h-4 w-4 text-primary" />
          🧠 How the AI thinks (reasoning trace)
        </span>
        <span className="text-xs text-muted-foreground">{open ? "Hide" : "Show"}</span>
      </summary>
      <div className="px-5 pb-5 space-y-4 border-t border-border pt-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
            Repositories consulted
          </p>
          <ul className="text-sm space-y-1">
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
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
            Budget methodology
          </p>
          <p className="text-sm text-foreground/85 leading-relaxed">
            {budgetMethodology}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
            Literature influence
          </p>
          <p className="text-sm text-foreground/85 leading-relaxed">
            {literatureInfluence}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
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
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl border border-border bg-card/40 backdrop-blur p-5 avoid-break"
      data-print-card
    >
      <div className="flex items-center gap-2 mb-3">
        <span>{icon}</span>
        <h3 className="font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  );
}
