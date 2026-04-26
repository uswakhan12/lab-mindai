import { ArrowRight, BookOpen, ExternalLink, Library } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useGenerateStore } from "@/lib/generateStore";
import type { LiteratureQCResult } from "@/lib/generateTypes";

interface Props {
  onComplete: () => void;
  suspended?: boolean;
}

function noveltyBadge(signal: LiteratureQCResult["noveltySignal"]) {
  if (signal === "exact_match") return "🔴 Exact Match Found";
  if (signal === "similar_exists") return "🟡 Similar Work Exists";
  return "🟢 Not Found";
}

export function Stage2Literature({ onComplete, suspended = false }: Props) {
  const loading = useGenerateStore((s) => s.s2Loading);
  const error = useGenerateStore((s) => s.s2Error);
  const progress = useGenerateStore((s) => s.s2Progress);
  const result = useGenerateStore((s) => s.s2Result);
  const abortedByEdit = useGenerateStore((s) => s.s2AbortedByEdit);
  if (suspended) {
    return (
      <div className="rounded-2xl border border-border/80 bg-card/50 backdrop-blur p-8 text-center animate-fade-in">
        <p className="text-sm text-muted-foreground">
          Literature search paused while you edit the hypothesis.
        </p>
        <p className="text-sm text-foreground/90 mt-2">
          Save to apply a new hypothesis and re-run, or cancel to continue.
        </p>
      </div>
    );
  }

  if (!loading && !error && !result && abortedByEdit) {
    return (
      <div className="rounded-2xl border border-border/80 bg-card/50 backdrop-blur p-8 text-center space-y-4 animate-fade-in">
        <p className="text-sm text-foreground/90">
          The literature search was stopped while the hypothesis was open for editing.
        </p>
        <Button
          type="button"
          onClick={() => useGenerateStore.getState().bumpS2Rerun()}
          className="btn-cta"
        >
          Run literature search again
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card/50 backdrop-blur p-10 animate-fade-in">
        <div className="flex items-start gap-4 mb-6">
          <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
            <Library className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-medium">Searching literature using backend Tavily service...</p>
            <p className="text-sm text-muted-foreground mt-1">
              Matching protocols · ranking relevance · preparing novelty signal
            </p>
          </div>
        </div>
        <Progress value={progress} className="h-1.5" />
        <div className="flex justify-between mt-3 text-xs text-muted-foreground font-mono">
          <span>{Math.round(progress)}%</span>
          <span>{Math.round((progress / 100) * 5)} / 5 results scanned</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-card/60 backdrop-blur p-6 animate-fade-in">
        <h3 className="font-semibold text-lg mb-2">Literature QC failed</h3>
        <p className="text-sm text-muted-foreground mb-4">{error}</p>
        <div className="flex justify-end">
          <Button onClick={onComplete} size="lg" className="h-12 px-6 rounded-xl group">
            Continue to Experiment Plan
            <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Button>
        </div>
      </div>
    );
  }

  if (!result) return null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="rounded-2xl border border-border bg-card/60 backdrop-blur p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <h3 className="font-semibold text-lg">Novelty Assessment</h3>
          </div>
          <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/20">
            {noveltyBadge(result.noveltySignal)}
          </Badge>
        </div>
        <p className="text-foreground/90 leading-relaxed">{result.noveltyExplanation}</p>
        {result.modelFlow?.validator && (
          <p className="text-xs text-muted-foreground mt-2">
            Retrieval:{" "}
            <span className="font-mono text-foreground">
              {result.modelFlow.retrieval || "tavily"}
            </span>{" "}
            · Validation:{" "}
            <span className="font-mono text-foreground">{result.modelFlow.validator}</span>
          </p>
        )}
      </div>

      <div className="space-y-3">
        <p className="text-xs uppercase tracking-widest text-muted-foreground px-1">
          Top relevant prior work
        </p>
        {result.references.map((ref, i) => (
          <a
            key={`${ref.title}-${i}`}
            href={ref.url || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-xl border border-border bg-card/50 hover:bg-card hover:border-primary/40 transition-all p-5 group animate-fade-in"
            style={{ animationDelay: `${i * 100}ms`, animationFillMode: "backwards" }}
          >
            <div className="flex items-start justify-between gap-4 mb-2">
              <h4 className="font-medium text-foreground/95 leading-snug group-hover:text-primary transition-colors">
                {ref.title}
              </h4>
              <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0 mt-1 group-hover:text-primary transition-colors" />
            </div>
            <p className="text-sm text-muted-foreground mb-1">{ref.authors}</p>
            <p className="text-xs text-muted-foreground font-mono mb-3">
              {ref.journal} · {ref.year} · {ref.doi === "N/A" ? "source link" : `doi:${ref.doi}`}
            </p>
            {(ref.validationStatus || typeof ref.confidence === "number") && (
              <p className="text-xs mb-2">
                <span
                  className={
                    ref.validationStatus === "validated" ? "text-emerald-400" : "text-amber-400"
                  }
                >
                  {ref.validationStatus === "validated"
                    ? "Validated by Llama 8B"
                    : "Weak match (Llama 8B)"}
                </span>
                {typeof ref.confidence === "number" ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · confidence {(ref.confidence * 100).toFixed(0)}%
                  </span>
                ) : null}
              </p>
            )}
            <p className="text-sm text-foreground/80 border-l-2 border-primary/40 pl-3 leading-relaxed">
              {ref.relevance}
            </p>
          </a>
        ))}
        {result.references.length === 0 && (
          <div className="rounded-xl border border-border bg-card/50 p-5 text-sm text-muted-foreground">
            No relevant references were found for this hypothesis.
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button onClick={onComplete} size="lg" className="btn-cta h-12 px-6 rounded-xl group">
          Generate Full Experiment Plan
          <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Button>
      </div>
    </div>
  );
}
