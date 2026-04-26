import { Loader2, CheckCircle2, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useGenerateStore } from "@/lib/generateStore";

interface Props {
  onComplete: () => void;
  /** When true, analysis is stopped — user is editing the hypothesis. */
  suspended?: boolean;
}

export function Stage1Hypothesis({ onComplete, suspended = false }: Props) {
  const loading = useGenerateStore((s) => s.s1Loading);
  const analysis = useGenerateStore((s) => s.s1Analysis);
  if (suspended) {
    return (
      <div className="rounded-2xl border border-border/80 bg-card/50 backdrop-blur p-8 text-center animate-fade-in">
        <p className="text-sm text-muted-foreground">
          Hypothesis is open for editing. Generation is paused.
        </p>
        <p className="text-sm text-foreground/90 mt-2">
          Save to apply the text and restart this step, or cancel to continue.
        </p>
      </div>
    );
  }

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
              <p className="text-xs text-muted-foreground">Structural decomposition complete</p>
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
        <Button onClick={onComplete} size="lg" className="btn-cta h-12 px-6 rounded-xl group">
          Run Literature QC
          <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Button>
      </div>
    </div>
  );
}
