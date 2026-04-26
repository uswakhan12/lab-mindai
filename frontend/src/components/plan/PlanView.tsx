import { useState } from "react";
import type {
  ExecutionReadiness,
  FeedbackLearningReport,
  FullPlan,
  QualityChecks,
  ScientificMechanistic,
} from "@/types/plan";
import { Badge } from "@/components/ui/badge";
import { OverviewTab } from "./OverviewTab";
import { ProtocolTab } from "./ProtocolTab";
import { MaterialsTab } from "./MaterialsTab";
import { BudgetTab, TimelineTab, ValidationTab, SafetyTab, ReasoningPanel } from "./PlanSections";
import { ScientistReviewPanel } from "./ScientistReviewPanel";
import { Button } from "@/components/ui/button";
import {
  Download,
  Link2,
  FileText,
  ClipboardList,
  Package,
  DollarSign,
  Calendar,
  CheckCircle2,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { encodeHypothesis, getReviewsForDomain } from "@/lib/storage";
import { cn } from "@/lib/utils";

type TabId =
  | "overview"
  | "protocol"
  | "materials"
  | "budget"
  | "timeline"
  | "validation"
  | "safety";
interface ModelFlow {
  retrievalModel?: string;
  planningModel?: string;
  retrievalOutlineUsed?: boolean;
}
interface IncorporationReportRow {
  index?: number;
  sourceHypothesis?: string;
  domain?: string;
  overallRating?: number;
  reviewerExpertise?: string;
  corrections?: { section: string; excerpt: string }[];
  issues?: { section: string; excerpt: string }[];
  promptInclusion?: string;
}
interface FeedbackSummary {
  priorFeedbackCount?: number;
  appliedHighlights?: string[];
  feedbackMatch?: { method: string; ontologyTags: string[]; similarReviewCount: number };
  incorporationReport?: IncorporationReportRow[];
  feedbackLearningReport?: FeedbackLearningReport;
}

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "overview", label: "Overview", icon: Sparkles },
  { id: "protocol", label: "Protocol", icon: ClipboardList },
  { id: "materials", label: "Materials", icon: Package },
  { id: "budget", label: "Budget", icon: DollarSign },
  { id: "timeline", label: "Timeline", icon: Calendar },
  { id: "validation", label: "Validation", icon: CheckCircle2 },
  { id: "safety", label: "Safety", icon: ShieldAlert },
];

export function PlanView({
  plan,
  hypothesis,
  modelFlow,
  feedbackSummary,
  qualityChecks,
  scientificMechanistic,
  executionReadiness,
}: {
  plan: FullPlan;
  hypothesis: string;
  modelFlow?: ModelFlow;
  feedbackSummary?: FeedbackSummary;
  qualityChecks?: QualityChecks;
  scientificMechanistic?: ScientificMechanistic;
  executionReadiness?: ExecutionReadiness;
}) {
  const [tab, setTab] = useState<TabId>("overview");
  const priorReviews = getReviewsForDomain(plan.domain);

  const copyLink = async () => {
    const url = `${window.location.origin}/generate?h=${encodeHypothesis(hypothesis)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied! Anyone with this link can view your experiment plan.");
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const downloadPDF = () => {
    toast.dismiss();
    requestAnimationFrame(() => window.print());
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header bar */}
      <div className="flex items-start justify-between gap-3 flex-wrap" data-print-hide>
        <div>
          <p className="text-xs uppercase tracking-widest text-primary mb-1">Stage 3 · Complete</p>
          <h2 className="text-xl font-semibold" data-testid="plan-ready-header">
            Your experiment plan is ready
          </h2>
          {modelFlow?.planningModel && (
            <p className="text-xs text-muted-foreground mt-1">
              Generated with{" "}
              <span className="font-mono text-foreground">{modelFlow.planningModel}</span>
              {modelFlow.retrievalModel ? (
                <>
                  {" "}
                  · retrieval{" "}
                  <span className="font-mono text-foreground">{modelFlow.retrievalModel}</span>
                </>
              ) : null}
              {modelFlow.retrievalOutlineUsed ? (
                <span className="text-emerald-400/90">
                  {" "}
                  · Llama 8B retrieval outline merged into planner
                </span>
              ) : null}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={copyLink}>
            <Link2 className="h-4 w-4 mr-2" />
            Copy Link
          </Button>
          <Button size="sm" onClick={downloadPDF} className="bg-primary-gradient">
            <Download className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
        </div>
      </div>

      {!!executionReadiness && (
        <div
          data-testid="execution-readiness-panel"
          className={cn(
            "rounded-xl border p-4 space-y-3",
            executionReadiness.tier === "order_ready" &&
              "border-emerald-500/45 bg-emerald-500/[0.08]",
            executionReadiness.tier === "pilot_ready" && "border-amber-500/45 bg-amber-500/[0.08]",
            executionReadiness.tier === "draft" && "border-rose-500/40 bg-rose-500/[0.06]",
          )}
          data-print-hide
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">
                Lab execution readiness
              </p>
              <p className="text-2xl font-semibold tracking-tight">
                {executionReadiness.scoreOutOf10.toFixed(1)}
                <span className="text-base font-normal text-muted-foreground"> / 10</span>
              </p>
              <p className="text-sm text-foreground/90 mt-1 max-w-2xl leading-relaxed">
                {executionReadiness.headline}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                {executionReadiness.summary.passedChecks}/{executionReadiness.summary.totalChecks}{" "}
                automated checks · {executionReadiness.summary.protocolSteps} protocol steps ·{" "}
                {executionReadiness.summary.materialLines} material lines ·{" "}
                {executionReadiness.summary.validatedSourceSections} sections with validated sources
              </p>
            </div>
            <Badge
              className={cn(
                "shrink-0 border text-xs uppercase tracking-wide",
                executionReadiness.tier === "order_ready" &&
                  "bg-emerald-500/20 text-emerald-200 border-emerald-500/40",
                executionReadiness.tier === "pilot_ready" &&
                  "bg-amber-500/20 text-amber-100 border-amber-500/40",
                executionReadiness.tier === "draft" &&
                  "bg-rose-500/15 text-rose-100 border-rose-500/35",
              )}
            >
              {executionReadiness.tier === "order_ready"
                ? "Order review"
                : executionReadiness.tier === "pilot_ready"
                  ? "Pilot study"
                  : "Draft"}
            </Badge>
          </div>
          <ul className="grid gap-1.5 text-xs text-muted-foreground sm:grid-cols-2">
            {executionReadiness.checklist.map((c) => (
              <li
                key={c.id}
                className="flex gap-2 items-start rounded-lg bg-card/40 border border-border/60 px-2.5 py-1.5"
              >
                <span
                  className={cn("shrink-0 font-mono", c.ok ? "text-emerald-400" : "text-amber-400")}
                >
                  {c.ok ? "✓" : "!"}
                </span>
                <span className="leading-snug">{c.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Demo banner if prior feedback exists */}
      {priorReviews.length > 0 && (
        <div
          className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex items-start gap-3"
          data-print-hide
        >
          <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <p className="text-sm">
            💡 This plan was improved by{" "}
            <strong>
              {priorReviews.length} scientist review{priorReviews.length === 1 ? "" : "s"}
            </strong>{" "}
            from similar experiments in this domain.
          </p>
        </div>
      )}

      {!!feedbackSummary?.feedbackMatch && (
        <div
          className="rounded-xl border border-border bg-card/50 p-4 text-sm space-y-1"
          data-print-hide
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            Feedback retrieval
          </p>
          <p className="text-muted-foreground">
            Method:{" "}
            <span className="font-mono text-foreground">
              {feedbackSummary.feedbackMatch.method}
            </span>
            {" · "}
            Matched <strong>{feedbackSummary.feedbackMatch.similarReviewCount}</strong> similar
            review(s) by ontology + keywords.
          </p>
          <p className="text-xs text-muted-foreground">
            Tags:{" "}
            <span className="font-mono text-foreground">
              {feedbackSummary.feedbackMatch.ontologyTags.join(", ") || "—"}
            </span>
          </p>
        </div>
      )}

      {!!feedbackSummary?.appliedHighlights?.length && (
        <div
          className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2"
          data-print-hide
        >
          <p className="text-sm font-medium text-emerald-100">
            Applied prior feedback from{" "}
            {feedbackSummary.priorFeedbackCount || feedbackSummary.appliedHighlights.length} similar
            review
            {(feedbackSummary.priorFeedbackCount || feedbackSummary.appliedHighlights.length) === 1
              ? ""
              : "s"}
            :
          </p>
          <ul className="text-sm text-emerald-50/90 space-y-1 list-disc pl-5">
            {feedbackSummary.appliedHighlights.map((item, idx) => (
              <li key={`${item}-${idx}`}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {!!feedbackSummary?.incorporationReport?.length && (
        <details className="rounded-xl border border-border bg-card/50 p-4 text-sm" data-print-hide>
          <summary className="cursor-pointer font-medium text-foreground">
            Learning loop — what was injected into this generation
          </summary>
          <div className="mt-3 space-y-4 text-muted-foreground">
            {feedbackSummary.incorporationReport.map((row) => (
              <div
                key={row.index}
                className="rounded-lg border border-border/70 bg-background/30 p-3 space-y-2"
              >
                <p className="text-xs text-foreground/80">
                  Review <span className="font-mono">#{row.index}</span>
                  {row.domain ? ` · domain ${row.domain}` : ""}
                  {row.overallRating != null ? ` · rating ${row.overallRating}/5` : ""}
                  {row.reviewerExpertise ? ` · ${row.reviewerExpertise}` : ""}
                </p>
                {row.sourceHypothesis ? (
                  <p className="text-xs italic text-muted-foreground/90">
                    “{row.sourceHypothesis}…”
                  </p>
                ) : null}
                {row.corrections && row.corrections.length > 0 ? (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-primary mb-1">
                      Corrections passed to prompt
                    </p>
                    <ul className="text-xs space-y-1 list-disc pl-4">
                      {row.corrections.map((c, i) => (
                        <li key={i}>
                          <span className="text-foreground/90">{c.section}:</span> {c.excerpt}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {row.issues && row.issues.length > 0 ? (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-amber-400/90 mb-1">
                      Flagged issues
                    </p>
                    <ul className="text-xs space-y-1 list-disc pl-4">
                      {row.issues.map((c, i) => (
                        <li key={i}>
                          <span className="text-foreground/90">{c.section}:</span> {c.excerpt}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {row.promptInclusion ? (
                  <p className="text-[11px] text-muted-foreground/80">{row.promptInclusion}</p>
                ) : null}
              </div>
            ))}
          </div>
        </details>
      )}

      {feedbackSummary?.feedbackLearningReport?.enabled ? (
        <div
          className="rounded-xl border border-cyan-500/25 bg-cyan-500/5 p-4 text-sm space-y-3"
          data-print-hide
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-cyan-200/90">
            Learning loop — metrics
          </p>
          {feedbackSummary.feedbackLearningReport.dualLlmGeneration &&
          typeof feedbackSummary.feedbackLearningReport.dualLlmGeneration
            .scoreWithoutPriorReviews === "number" ? (
            <div className="rounded-lg border border-cyan-400/20 bg-background/30 p-3 space-y-2">
              <p className="text-[11px] font-medium text-cyan-100/95">Dual LLM arm (true A/B)</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div className="rounded-md border border-border/60 bg-background/40 px-2 py-1.5">
                  <p className="text-muted-foreground">Without prior reviews</p>
                  <p className="font-mono text-foreground text-base">
                    {feedbackSummary.feedbackLearningReport.dualLlmGeneration.scoreWithoutPriorReviews.toFixed(
                      2,
                    )}
                    /10
                  </p>
                </div>
                <div className="rounded-md border border-border/60 bg-background/40 px-2 py-1.5">
                  <p className="text-muted-foreground">With prior reviews (shipped)</p>
                  <p className="font-mono text-foreground text-base">
                    {feedbackSummary.feedbackLearningReport.dualLlmGeneration.scoreWithPriorReviews.toFixed(
                      2,
                    )}
                    /10
                  </p>
                </div>
                <div className="rounded-md border border-border/60 bg-background/40 px-2 py-1.5">
                  <p className="text-muted-foreground">Δ (with − without)</p>
                  <p className="font-mono text-cyan-100 text-base">
                    {feedbackSummary.feedbackLearningReport.dualLlmGeneration
                      .deltaWithPriorMinusWithout >= 0
                      ? "+"
                      : ""}
                    {feedbackSummary.feedbackLearningReport.dualLlmGeneration.deltaWithPriorMinusWithout.toFixed(
                      2,
                    )}
                  </p>
                </div>
              </div>
              {feedbackSummary.feedbackLearningReport.dualLlmGeneration
                .planningModelWithoutPrior ? (
                <p className="text-[10px] text-muted-foreground font-mono">
                  Shadow model:{" "}
                  {
                    feedbackSummary.feedbackLearningReport.dualLlmGeneration
                      .planningModelWithoutPrior
                  }{" "}
                  · {feedbackSummary.feedbackLearningReport.dualLlmGeneration.latencyMs ?? "—"} ms
                </p>
              ) : null}
              {feedbackSummary.feedbackLearningReport.dualLlmGeneration.note ? (
                <p className="text-[10px] text-muted-foreground/90 leading-relaxed">
                  {feedbackSummary.feedbackLearningReport.dualLlmGeneration.note}
                </p>
              ) : null}
            </div>
          ) : feedbackSummary.feedbackLearningReport.dualLlmGeneration?.attempted &&
            feedbackSummary.feedbackLearningReport.dualLlmGeneration.error ? (
            <p className="text-xs text-amber-400/90">
              Dual LLM arm attempted but failed:{" "}
              {feedbackSummary.feedbackLearningReport.dualLlmGeneration.error}
            </p>
          ) : null}
          {feedbackSummary.feedbackLearningReport.heuristicQualityComparison ? (
            <div className="space-y-2">
              <p className="text-[11px] font-medium text-muted-foreground">
                Heuristic adoption (same plan)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2">
                  <p className="text-muted-foreground">Observed rubric score</p>
                  <p className="font-mono text-lg text-foreground">
                    {feedbackSummary.feedbackLearningReport.heuristicQualityComparison.scoreAfterFeedback.toFixed(
                      2,
                    )}
                    <span className="text-muted-foreground text-sm">/10</span>
                  </p>
                </div>
                <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2">
                  <p className="text-muted-foreground">Counterfactual (no adoption credit)</p>
                  <p className="font-mono text-lg text-foreground">
                    {feedbackSummary.feedbackLearningReport.heuristicQualityComparison.counterfactualScoreIfCorrectionsIgnored.toFixed(
                      2,
                    )}
                    <span className="text-muted-foreground text-sm">/10</span>
                  </p>
                </div>
                <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2">
                  <p className="text-muted-foreground">Δ attributed to feedback text</p>
                  <p className="font-mono text-lg text-cyan-100">
                    +
                    {feedbackSummary.feedbackLearningReport.heuristicQualityComparison.estimatedQualityDeltaFromFeedback.toFixed(
                      2,
                    )}
                  </p>
                </div>
              </div>
            </div>
          ) : null}
          {feedbackSummary.feedbackLearningReport.adoption ? (
            <p className="text-xs text-muted-foreground">
              Review phrase adoption:{" "}
              <span className="font-mono text-foreground">
                {(feedbackSummary.feedbackLearningReport.adoption.matchRate * 100).toFixed(0)}%
              </span>{" "}
              ({feedbackSummary.feedbackLearningReport.adoption.matchedCount}/
              {feedbackSummary.feedbackLearningReport.adoption.totalPhrases} phrases matched in plan
              JSON).
            </p>
          ) : null}
          {feedbackSummary.feedbackLearningReport.methodologyNote ? (
            <p className="text-[11px] text-muted-foreground/90 leading-relaxed">
              {feedbackSummary.feedbackLearningReport.methodologyNote}
            </p>
          ) : null}
        </div>
      ) : null}

      {!!qualityChecks && (
        <div
          className={`rounded-xl border p-4 space-y-2 ${qualityChecks.gatesPassed ? "border-emerald-500/30 bg-emerald-500/5" : "border-rose-500/30 bg-rose-500/5"}`}
          data-print-hide
        >
          <p className="text-sm font-medium">
            Judge quality score:{" "}
            <span className="font-mono">{qualityChecks.scoreOutOf10.toFixed(1)}/10</span>
            {" · "}
            <span>
              {qualityChecks.gatesPassed ? "Quality gates passed" : "Quality gates failed"}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            Completeness {qualityChecks.dimensions.completeness.toFixed(1)} · Evidence{" "}
            {qualityChecks.dimensions.evidenceGrounding.toFixed(1)} · Operational realism{" "}
            {qualityChecks.dimensions.operationalRealism.toFixed(1)}
          </p>
        </div>
      )}

      {!!scientificMechanistic && (
        <details
          className="rounded-xl border border-primary/25 bg-primary/5 p-4 text-sm"
          data-print-hide
          data-testid="mechanistic-validation-panel"
        >
          <summary className="cursor-pointer font-medium text-foreground">
            Mechanistic validation (concentrations · power sketch · step evidence)
          </summary>
          <div className="mt-3 space-y-3 text-muted-foreground">
            <p className="text-xs leading-relaxed">{scientificMechanistic.disclaimer}</p>
            <div>
              <p className="text-xs font-semibold text-primary mb-1">
                Assay / concentration checks
              </p>
              <ul className="list-disc pl-4 space-y-1">
                {scientificMechanistic.assayCompatibility.map((a, i) => (
                  <li key={i}>
                    <span className="text-foreground/90">{a.assayClass}</span>: {a.detail}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold text-primary mb-1">
                Power sketch (hypothesis-derived)
              </p>
              <pre className="text-[11px] font-mono whitespace-pre-wrap bg-card/60 border border-border rounded-md p-2 overflow-x-auto">
                {JSON.stringify(scientificMechanistic.powerSketch, null, 2)}
              </pre>
            </div>
            <p className="text-xs">
              Protocol steps annotated with evidence links:{" "}
              <strong className="text-foreground">
                {scientificMechanistic.protocolEvidence.stepsAnnotated}
              </strong>
            </p>
          </div>
        </details>
      )}

      {/* Mobile tabs (dropdown) */}
      <div className="md:hidden" data-print-hide>
        <select
          value={tab}
          onChange={(e) => setTab(e.target.value as TabId)}
          className="w-full bg-input border border-border rounded-lg px-3 py-2.5 font-medium"
        >
          {TABS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {/* Desktop layout */}
      <div className="grid md:grid-cols-[200px,1fr] gap-6 md:items-start">
        {/* Sidebar nav — opaque surface so scrolling main column never paints over labels */}
        <div className="hidden md:block relative z-20 self-start" data-print-hide>
          <nav className="space-y-1 sticky top-20 rounded-xl border border-border/80 bg-card/95 backdrop-blur-md p-2 shadow-sm">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = t.id === tab;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all text-left",
                    active
                      ? "bg-primary/15 text-primary border border-primary/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-card/50",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{t.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab content (screen) */}
        <div className="min-w-0 relative z-0" data-print-hide>
          <div
            className="hidden md:block sticky top-20 z-[5] mb-4 rounded-lg border border-border/80 bg-background/95 px-4 py-2.5 backdrop-blur-md supports-[backdrop-filter]:bg-background/90"
            aria-live="polite"
          >
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              {TABS.find((t) => t.id === tab)?.label}
            </p>
          </div>
          {tab === "overview" && (
            <OverviewTab
              plan={plan}
              hypothesis={hypothesis}
              executionReadiness={executionReadiness}
            />
          )}
          {tab === "protocol" && <ProtocolTab plan={plan} />}
          {tab === "materials" && <MaterialsTab plan={plan} />}
          {tab === "budget" && <BudgetTab plan={plan} />}
          {tab === "timeline" && <TimelineTab plan={plan} />}
          {tab === "validation" && <ValidationTab plan={plan} />}
          {tab === "safety" && <SafetyTab plan={plan} />}
        </div>
      </div>

      {/* Print-only: render ALL sections sequentially */}
      <div data-print-only className="space-y-8 hidden">
        <section data-print-section>
          <h2>Overview</h2>
          <OverviewTab
            plan={plan}
            hypothesis={hypothesis}
            executionReadiness={executionReadiness}
          />
        </section>
        <section data-print-section>
          <h2>Protocol</h2>
          <ProtocolTab plan={plan} />
        </section>
        <section data-print-section>
          <h2>Materials</h2>
          <MaterialsTab plan={plan} />
        </section>
        <section data-print-section>
          <h2>Budget</h2>
          <BudgetTab plan={plan} />
        </section>
        <section data-print-section>
          <h2>Timeline</h2>
          <TimelineTab plan={plan} />
        </section>
        <section data-print-section>
          <h2>Validation</h2>
          <ValidationTab plan={plan} />
        </section>
        <section data-print-section>
          <h2>Safety</h2>
          <SafetyTab plan={plan} />
        </section>
      </div>

      <ReasoningPanel plan={plan} />
      <ScientistReviewPanel plan={plan} hypothesis={hypothesis} />
    </div>
  );
}
