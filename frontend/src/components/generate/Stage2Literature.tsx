import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, ExternalLink, Library } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { labmindApiHeaders } from "@/lib/storage";
import type { NoveltyDiagnostics } from "@/types/plan";

interface Props {
  hypothesis: string;
  onComplete: () => void;
}

interface Reference {
  title: string;
  authors: string;
  journal: string;
  year: number;
  doi: string;
  relevance: string;
  url?: string;
  validationStatus?: "validated" | "weak_match";
  confidence?: number;
}

interface QCResponse {
  noveltySignal: "not_found" | "similar_exists" | "exact_match";
  noveltyExplanation: string;
  references: Reference[];
  modelFlow?: { retrieval?: string; validator?: string };
  noveltyDiagnostics?: NoveltyDiagnostics;
}

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8080";

function noveltyBadge(signal: QCResponse["noveltySignal"]) {
  if (signal === "exact_match") return "🔴 Exact Match Found";
  if (signal === "similar_exists") return "🟡 Similar Work Exists";
  return "🟢 Not Found";
}

function evidenceTierLabel(tier: string) {
  const labels: Record<string, string> = {
    exact_or_near_protocol: "Exact / near-protocol candidate",
    close_analog: "Close analog",
    related_work: "Related work",
    weakly_related: "Weakly related",
    sparse: "Sparse retrieval",
  };
  return labels[tier] || tier.replace(/_/g, " ");
}

function hostKindLabel(k: string) {
  const labels: Record<string, string> = {
    protocol_repository: "Protocol repo",
    peer_literature: "Literature",
    vendor_or_resource: "Vendor / resource",
    community_protocol: "Community protocol",
    general_web: "Web",
  };
  return labels[k] || k;
}

export function Stage2Literature({ hypothesis, onComplete }: Props) {
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [result, setResult] = useState<QCResponse | null>(null);

  useEffect(() => {
    setLoading(true);
    setError("");
    setResult(null);
    setProgress(0);

    const start = Date.now();
    const duration = 5000;
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min(92, (elapsed / duration) * 100);
      setProgress(pct);
    }, 50);

    const fetchQC = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/literature-qc`, {
          method: "POST",
          headers: labmindApiHeaders(),
          body: JSON.stringify({ hypothesis }),
        });
        const data = (await response.json()) as QCResponse & { error?: string; details?: string };
        if (!response.ok) {
          const parts = [data.error, data.details].filter(Boolean);
          throw new Error(parts.join(" — ") || "Failed to fetch literature QC.");
        }
        setResult(data);
        setProgress(100);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unexpected error";
        setError(message);
      } finally {
        clearInterval(interval);
        setLoading(false);
      }
    };

    fetchQC();
    return () => clearInterval(interval);
  }, [hypothesis]);

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

        {result.noveltyDiagnostics && (
          <div className="mt-5 rounded-xl border border-primary/30 bg-background/40 p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                Evidence classification
              </p>
              <Badge variant="outline" className="border-primary/40 text-foreground/90 font-normal">
                {evidenceTierLabel(result.noveltyDiagnostics.evidenceTier)}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="text-foreground/90">Signal alignment:</span>{" "}
              {result.noveltyDiagnostics.signalAlignmentNote}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-muted-foreground">
              <div className="rounded-lg border border-border/80 bg-card/30 px-2 py-1.5">
                Top score{" "}
                <span className="font-mono text-foreground">
                  {result.noveltyDiagnostics.topRetrievalScore.toFixed(2)}
                </span>
              </div>
              <div className="rounded-lg border border-border/80 bg-card/30 px-2 py-1.5">
                Hypothesis overlap{" "}
                <span className="font-mono text-foreground">
                  {(result.noveltyDiagnostics.topHypothesisOverlap * 100).toFixed(0)}%
                </span>
              </div>
              <div className="rounded-lg border border-border/80 bg-card/30 px-2 py-1.5">
                Protocol host hit{" "}
                {result.noveltyDiagnostics.hasProtocolRepositoryHit ? "yes" : "no"}
              </div>
              <div className="rounded-lg border border-border/80 bg-card/30 px-2 py-1.5">
                Vendor hit {result.noveltyDiagnostics.hasVendorOrResourceHit ? "yes" : "no"}
              </div>
            </div>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
              {result.noveltyDiagnostics.rulesTriggered.map((rule, i) => (
                <li key={i}>{rule}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <p className="text-xs uppercase tracking-widest text-muted-foreground px-1">
          Top relevant prior work
        </p>
        {result.references.map((ref, i) => {
          const diag = result.noveltyDiagnostics?.perReference?.[i];
          return (
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
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {diag ? (
                    <Badge variant="outline" className="text-[10px] font-normal border-border">
                      {hostKindLabel(diag.hostKind)} · score {diag.retrievalScore.toFixed(2)} ·
                      overlap {(diag.hypothesisTokenOverlap * 100).toFixed(0)}%
                    </Badge>
                  ) : null}
                  <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
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
          );
        })}
        {result.references.length === 0 && (
          <div className="rounded-xl border border-border bg-card/50 p-5 text-sm text-muted-foreground">
            No relevant references were found for this hypothesis.
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button
          onClick={onComplete}
          size="lg"
          className="bg-primary-gradient hover:opacity-95 shadow-glow h-12 px-6 rounded-xl group"
          data-testid="stage2-generate-plan"
        >
          Generate Full Experiment Plan
          <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Button>
      </div>
    </div>
  );
}
