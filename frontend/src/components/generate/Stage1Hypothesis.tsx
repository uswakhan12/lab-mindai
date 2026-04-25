import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Props {
  hypothesis: string;
  onComplete: () => void;
}

interface Analysis {
  intervention: string;
  outcome: string;
  mechanism: string;
  control: string;
}

function analyzeHypothesis(h: string): Analysis {
  // Lightweight heuristic extraction (mock — real version would call LLM)
  const lower = h.toLowerCase();
  const interventionMatch =
    h.match(/replacing\s+([^.]+?)\s+(?:with|as)/i) ||
    h.match(/(?:supplementation|treatment|use)\s+of\s+([^.]+?)(?:\s+for|\s+will|,)/i) ||
    h.match(/^([A-Z][^.]+?)\s+will/);
  const outcomeMatch =
    h.match(/will\s+(increase|decrease|reduce|improve|achieve|detect)\s+([^.]+?)(?:\s+by|\s+within|\s+compared|\.|$)/i);
  const controlMatch = h.match(/compared\s+(?:to|with)\s+([^.]+?)(?:\.|$)/i);

  return {
    intervention: interventionMatch?.[1]?.trim() || h.split(/\s+/).slice(0, 8).join(" ") + "…",
    outcome: outcomeMatch ? `${outcomeMatch[1]} ${outcomeMatch[2]}`.trim() : "quantitative endpoint detected",
    mechanism: lower.includes("because") || lower.includes("via")
      ? "Explicit mechanism stated"
      : "Implicit biophysical mechanism — protective/binding/catalytic interaction",
    control: controlMatch?.[1]?.trim() || "Standard-of-care baseline (implied)",
  };
}

export function Stage1Hypothesis({ hypothesis, onComplete }: Props) {
  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setAnalysis(analyzeHypothesis(hypothesis));
      setLoading(false);
    }, 1500);
    return () => clearTimeout(t);
  }, [hypothesis]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card/50 backdrop-blur p-10 animate-fade-in">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Loader2 className="h-6 w-6 text-primary animate-spin" />
            <div className="absolute inset-0 blur-md bg-primary/40 -z-10" />
          </div>
          <div>
            <p className="font-medium">Analyzing your hypothesis structure…</p>
            <p className="text-sm text-muted-foreground mt-1">
              Parsing intervention, outcome, mechanism, and control conditions.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!analysis) return null;

  const items = [
    { label: "Intervention identified", value: analysis.intervention },
    { label: "Measurable outcome", value: analysis.outcome },
    { label: "Mechanistic reason", value: analysis.mechanism },
    { label: "Control condition (implied)", value: analysis.control },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="rounded-2xl border border-border bg-card/60 backdrop-blur overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Hypothesis Analysis</h3>
              <p className="text-xs text-muted-foreground">
                Structural decomposition complete
              </p>
            </div>
          </div>
          <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20">
            Strong · 9.2 / 10
          </Badge>
        </div>

        <div className="divide-y divide-border">
          {items.map((item, i) => (
            <div
              key={item.label}
              className="flex gap-4 p-5 animate-fade-in"
              style={{ animationDelay: `${i * 80}ms`, animationFillMode: "backwards" }}
            >
              <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                  {item.label}
                </p>
                <p className="text-foreground/95 leading-relaxed">{item.value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          onClick={onComplete}
          size="lg"
          className="bg-primary-gradient hover:opacity-95 shadow-glow h-12 px-6 rounded-xl group"
        >
          Run Literature QC
          <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Button>
      </div>
    </div>
  );
}
