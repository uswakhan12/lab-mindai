import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { FullPlan } from "@/types/plan";
import { generateMockPlan } from "@/lib/plan-generator";
import { addToHistory } from "@/lib/storage";
import { PlanView } from "./PlanView";

const LOADING_STEPS = [
  "📚 Searching PubMed for related protocols...",
  "🔬 Identifying required reagents from Sigma-Aldrich catalog...",
  "💰 Estimating costs based on current supplier pricing...",
  "📅 Building timeline with phase dependencies...",
  "✅ Validating protocol against MIQE guidelines...",
];

export function Stage3Plan({ hypothesis }: { hypothesis: string }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [plan, setPlan] = useState<FullPlan | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setStepIdx((i) => Math.min(i + 1, LOADING_STEPS.length - 1));
    }, 1500);
    const finish = setTimeout(() => {
      const p = generateMockPlan(hypothesis);
      addToHistory(hypothesis, p);
      setPlan(p);
    }, LOADING_STEPS.length * 1500 + 200);
    return () => { clearInterval(interval); clearTimeout(finish); };
  }, [hypothesis]);

  if (plan) return <PlanView plan={plan} hypothesis={hypothesis} />;

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
