import { useState } from "react";
import type { FullPlan } from "@/types/plan";
import { OverviewTab } from "./OverviewTab";
import { ProtocolTab } from "./ProtocolTab";
import { MaterialsTab } from "./MaterialsTab";
import { BudgetTab, TimelineTab, ValidationTab, SafetyTab, ReasoningPanel } from "./PlanSections";
import { ScientistReviewPanel } from "./ScientistReviewPanel";
import { Button } from "@/components/ui/button";
import { Download, Link2, FileText, ClipboardList, Package, DollarSign, Calendar, CheckCircle2, ShieldAlert, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { encodeHypothesis, getReviewsForDomain } from "@/lib/storage";
import { cn } from "@/lib/utils";

type TabId = "overview" | "protocol" | "materials" | "budget" | "timeline" | "validation" | "safety";
interface ModelFlow {
  retrievalModel?: string;
  planningModel?: string;
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
}: {
  plan: FullPlan;
  hypothesis: string;
  modelFlow?: ModelFlow;
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
          <h2 className="text-xl font-semibold">Your experiment plan is ready</h2>
          {modelFlow?.planningModel && (
            <p className="text-xs text-muted-foreground mt-1">
              Generated with{" "}
              <span className="font-mono text-foreground">{modelFlow.planningModel}</span>
              {modelFlow.retrievalModel ? (
                <>
                  {" "}· retrieval{" "}
                  <span className="font-mono text-foreground">{modelFlow.retrievalModel}</span>
                </>
              ) : null}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={copyLink}><Link2 className="h-4 w-4 mr-2" />Copy Link</Button>
          <Button size="sm" onClick={downloadPDF} className="bg-primary-gradient"><Download className="h-4 w-4 mr-2" />Download PDF</Button>
        </div>
      </div>

      {/* Demo banner if prior feedback exists */}
      {priorReviews.length > 0 && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex items-start gap-3" data-print-hide>
          <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <p className="text-sm">💡 This plan was improved by <strong>{priorReviews.length} scientist review{priorReviews.length === 1 ? "" : "s"}</strong> from similar experiments in this domain.</p>
        </div>
      )}

      {/* Mobile tabs (dropdown) */}
      <div className="md:hidden" data-print-hide>
        <select value={tab} onChange={(e) => setTab(e.target.value as TabId)}
          className="w-full bg-input border border-border rounded-lg px-3 py-2.5 font-medium">
          {TABS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
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
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all text-left",
                    active ? "bg-primary/15 text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground hover:bg-card/50",
                  )}>
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
          {tab === "overview" && <OverviewTab plan={plan} hypothesis={hypothesis} />}
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
        <section data-print-section><h2>Overview</h2><OverviewTab plan={plan} hypothesis={hypothesis} /></section>
        <section data-print-section><h2>Protocol</h2><ProtocolTab plan={plan} /></section>
        <section data-print-section><h2>Materials</h2><MaterialsTab plan={plan} /></section>
        <section data-print-section><h2>Budget</h2><BudgetTab plan={plan} /></section>
        <section data-print-section><h2>Timeline</h2><TimelineTab plan={plan} /></section>
        <section data-print-section><h2>Validation</h2><ValidationTab plan={plan} /></section>
        <section data-print-section><h2>Safety</h2><SafetyTab plan={plan} /></section>
      </div>

      <ReasoningPanel plan={plan} />
      <ScientistReviewPanel plan={plan} hypothesis={hypothesis} />
    </div>
  );
}
