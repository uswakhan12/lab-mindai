import { BookOpen, ExternalLink, Loader2 } from "lucide-react";
import { useGenerateStore } from "@/lib/generateStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { LiteratureQCResult } from "@/lib/generateTypes";

function noveltyBadge(signal: LiteratureQCResult["noveltySignal"]) {
  switch (signal) {
    case "not_found":
      return "Not found in literature (good)";
    case "similar_exists":
      return "Very similar (review closely)";
    case "exact_match":
    default:
      return "Exact/strong prior match (high risk of duplication)";
  }
}

function evidenceTierLabel(tier: string) {
  switch (tier) {
    case "A":
      return "A · Strong, multi-cue overlap";
    case "B":
      return "B · Moderate, explainable";
    case "C":
      return "C · Indirect, weak, or unverifiable";
    case "C?":
    default:
      return `${tier} · Heuristic`;
  }
}

function hostKindLabel(kind: string) {
  switch (kind) {
    case "protocol_repo":
      return "Protocol / methods repository";
    case "vendor":
      return "Vendor / reagent / kit";
    case "resource":
      return "Resource / database";
    case "academic":
      return "Academic paper / preprint";
    case "unknown":
    default:
      return "Unclassified / unknown";
  }
}

interface Props {
  onComplete: () => void;
  /** When true, literature / plan work is stopped — user is editing the hypothesis. */
  suspended?: boolean;
}

export function Stage2Literature({ onComplete, suspended = false }: Props) {
  const sessionKey = useGenerateStore((s) => s.sessionKey);
  const s2Loading = useGenerateStore((s) => s.s2Loading);
  const s2Error = useGenerateStore((s) => s.s2Error);
  const s2Progress = useGenerateStore((s) => s.s2Progress);
  const s2Result = useGenerateStore((s) => s.s2Result);
  const s3PipelinePhase = useGenerateStore((s) => s.s3PipelinePhase);
  const bumpS2Rerun = useGenerateStore((s) => s.bumpS2Rerun);

  const s3Loading = s3PipelinePhase === "loading";
  const result = s2Result;

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

  if (s2Error && !result) {
    return (
      <div className="text-center p-6 rounded-2xl border border-destructive/50 bg-destructive/5">
        <p className="text-destructive text-sm">Literature check failed. Try &quot;Run literature QC&quot; again.</p>
        <p className="text-xs text-muted-foreground mt-1">{s2Error}</p>
        <div className="mt-3 flex items-center justify-center">
          <Button
            onClick={() => bumpS2Rerun()}
            variant="secondary"
            size="sm"
            className="text-xs h-7 rounded-full border border-border/80 bg-gradient-to-b from-zinc-800 to-zinc-900"
            data-testid="stage2-run-lit-qc"
          >
            Run literature QC
          </Button>
        </div>
      </div>
    );
  }
  if (s2Loading && !result) {
    return (
      <div className="text-center p-6 rounded-2xl border border-border/60 bg-primary/5">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent mx-auto mb-2 animate-spin" />
        <p className="text-foreground/90">Checking novelty against the literature (Tavily)…</p>
        {s2Progress > 0 && s2Progress < 100 ? (
          <p className="text-sm text-foreground/80 mt-2 max-w-2xl mx-auto">
            {Math.round(s2Progress)}% complete
          </p>
        ) : null}
      </div>
    );
  }

  if (!result) {
    return (
      <div className="text-center p-6 rounded-2xl border border-border/60 bg-primary/5">
        <p className="text-foreground/90">Literature check will start after hypothesis analysis completes.</p>
      </div>
    );
  }

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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-[11px] text-muted-foreground">
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
              {typeof result.noveltyDiagnostics.topTrigramSimilarity === "number" ? (
                <div className="rounded-lg border border-border/80 bg-card/30 px-2 py-1.5">
                  Trigram sim{" "}
                  <span className="font-mono text-foreground">
                    {result.noveltyDiagnostics.topTrigramSimilarity.toFixed(2)}
                  </span>
                </div>
              ) : null}
              {typeof result.noveltyDiagnostics.topCombinedEvidence === "number" ? (
                <div className="rounded-lg border border-border/80 bg-card/30 px-2 py-1.5">
                  Fused rank{" "}
                  <span className="font-mono text-foreground">
                    {result.noveltyDiagnostics.topCombinedEvidence.toFixed(2)}
                  </span>
                </div>
              ) : null}
              {typeof result.noveltyDiagnostics.topEmbeddingSimilarity === "number" ? (
                <div className="rounded-lg border border-border/80 bg-card/30 px-2 py-1.5">
                  Embed sim{" "}
                  <span className="font-mono text-foreground">
                    {result.noveltyDiagnostics.topEmbeddingSimilarity.toFixed(2)}
                  </span>
                </div>
              ) : null}
              {typeof result.noveltyDiagnostics.protocolToPacketAlignment === "number" ? (
                <div className="rounded-lg border border-border/80 bg-card/30 px-2 py-1.5">
                  Protocol↔packet{" "}
                  <span className="font-mono text-foreground">
                    {result.noveltyDiagnostics.protocolToPacketAlignment.toFixed(2)}
                  </span>
                </div>
              ) : null}
              <div className="rounded-lg border border-border/80 bg-card/30 px-2 py-1.5">
                Protocol host hit {result.noveltyDiagnostics.hasProtocolRepositoryHit ? "yes" : "no"}
              </div>
              <div className="rounded-lg border border-border/80 bg-card/30 px-2 py-1.5">
                Vendor hit {result.noveltyDiagnostics.hasVendorOrResourceHit ? "yes" : "no"}
              </div>
            </div>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
              {(result.noveltyDiagnostics.rulesTriggered ?? []).map((rule: string, i: number) => (
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
          const blurb = ref.snippet ?? ref.relevance;
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
                <div className="flex items-center gap-2 text-xs text-primary shrink-0">
                  {diag ? (
                    <Badge variant="outline" className="text-[10px] px-2 py-0 h-5">
                      {hostKindLabel(diag.hostKind)}
                    </Badge>
                  ) : null}
                  <div className="p-1 rounded bg-primary/10 group-hover:bg-primary/20">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </div>
                </div>
              </div>
              <p className="text-sm text-foreground/70 line-clamp-2 mb-3 leading-relaxed">{blurb}</p>
              {diag ? (
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  {typeof ref.confidence === "number" ? (
                    <Badge
                      variant="outline"
                      className={
                        ref.validationStatus === "validated"
                          ? "text-emerald-200 border-emerald-400/40"
                          : "text-amber-200 border-amber-400/40"
                      }
                    >
                      {ref.validationStatus === "validated" ? "Llama 8B validated" : "Llama 8B weak match"}
                    </Badge>
                  ) : null}
                  <span>
                    Relevance <span className="font-mono text-foreground">{diag.retrievalScore.toFixed(2)}</span>
                  </span>
                  <span>
                    Hypothesis overlap{" "}
                    <span className="font-mono text-foreground">
                      {(diag.hypothesisTokenOverlap * 100).toFixed(0)}%
                    </span>
                  </span>
                  {typeof diag.combinedEvidenceScore === "number" ? (
                    <span>
                      Fused{" "}
                      <span className="font-mono text-foreground">
                        {diag.combinedEvidenceScore.toFixed(2)}
                      </span>
                    </span>
                  ) : null}
                </div>
              ) : null}
            </a>
          );
        })}
      </div>

      <div className="pt-2 text-center" data-testid="stage2-build-plan-cta">
        {s2Error && result && (
          <p className="text-destructive text-sm mb-2">Background refresh failed: {s2Error}</p>
        )}
        <div className="mt-1 flex items-center justify-center">
          {s2Loading && <p className="text-xs text-muted-foreground">Literature check running in background…</p>}
        </div>
        <p className="text-xs text-muted-foreground/90 mb-3">
          When you are happy with the literature readout, start plan generation. You can re-run checks
          without losing your current hypothesis{sessionKey ? " and literature session" : ""}.
        </p>
        <div className="w-full max-w-2xl mx-auto flex flex-col gap-2 sm:flex-row sm:items-stretch sm:justify-stretch sm:gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => bumpS2Rerun()}
            className="h-9 shrink-0 w-full min-w-0 rounded-md border text-xs sm:flex-1"
            data-testid="stage2-run-lit-qc"
          >
            Run literature QC
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex h-9 w-full items-stretch rounded-md bg-zinc-800 p-px">
              <Button
                type="button"
                onClick={onComplete}
                disabled={s2Loading || s3Loading}
                className="h-full w-full min-w-0 rounded-[6px] px-2 text-xs leading-tight sm:text-sm btn-cta"
                data-testid="stage2-generate-experiment"
              >
                {s2Loading && (
                  <Loader2 className="mr-1 h-3.5 w-3.5 shrink-0 animate-spin" />
                )}
                {s3Loading ? "Generating plan…" : "Generate next-step experiment plan"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
