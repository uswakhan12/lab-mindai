import { useCallback, useEffect, useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { Pencil, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { useGenerateStore } from "@/lib/generateStore";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  PipelineProgress,
  type PipelineStage,
  type StageStatus,
} from "@/components/generate/PipelineProgress";
import { Stage1Hypothesis } from "@/components/generate/Stage1Hypothesis";
import { Stage2Literature } from "@/components/generate/Stage2Literature";
import { Stage3Plan } from "@/components/generate/Stage3Plan";

const searchSchema = z.object({
  h: z.string().optional().default(""),
});

const DEFAULT_HYPOTHESIS =
  "Replacing sucrose with trehalose as a cryoprotectant will increase post-thaw viability of HeLa cells by at least 15 percentage points compared to the standard 10% DMSO protocol.";

export const Route = createFileRoute("/generate")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Generate Experiment Plan — LabMind AI" },
      { name: "description", content: "Watch LabMind think through your hypothesis step by step." },
    ],
  }),
  component: GeneratePage,
});

type ActiveStage = 1 | 2 | 3;

function GeneratePage() {
  const { h } = Route.useSearch();
  const navigate = useNavigate();
  const hypothesis = useMemo(() => (h && h.trim().length > 0 ? h : DEFAULT_HYPOTHESIS), [h]);

  const activeStage = useGenerateStore((s) => s.activeStage);
  const setActiveStage = useGenerateStore((s) => s.setActiveStage);
  const advanceTo = useGenerateStore((s) => s.advanceTo);
  const completed = useGenerateStore((s) => s.completed);
  const workReady = useGenerateStore((s) => s.workReady);
  const s3PipelinePhase = useGenerateStore((s) => s.s3PipelinePhase);
  const isEditingHypothesis = useGenerateStore((s) => s.isEditingHypothesis);
  const hypothesisDraft = useGenerateStore((s) => s.hypothesisDraft);
  const setIsEditing = useGenerateStore((s) => s.setIsEditing);
  const setHypothesisDraft = useGenerateStore((s) => s.setHypothesisDraft);
  const syncSessionKey = useGenerateStore((s) => s.syncSessionKey);
  const resetPipelineForHypothesis = useGenerateStore((s) => s.resetPipelineForHypothesis);

  useEffect(() => {
    syncSessionKey(hypothesis);
  }, [hypothesis, syncSessionKey]);

  const canSelectStage = useCallback(
    (id: number) =>
      id === 1 || (id === 2 && workReady.includes(1)) || (id === 3 && completed.includes(2)),
    [completed, workReady],
  );

  const onPipelineStageClick = useCallback(
    (id: number) => {
      if (!canSelectStage(id)) return;
      setActiveStage(id as ActiveStage);
    },
    [canSelectStage, setActiveStage],
  );

  const stages: PipelineStage[] = useMemo((): PipelineStage[] => {
    const status1: StageStatus = isEditingHypothesis
      ? "active"
      : workReady.includes(1)
        ? "complete"
        : activeStage === 1
          ? "active"
          : "pending";
    const status2: StageStatus = workReady.includes(2)
      ? "complete"
      : activeStage === 2
        ? "active"
        : "pending";
    let status3: StageStatus;
    if (s3PipelinePhase === "ready" && !isEditingHypothesis) {
      status3 = "complete";
    } else if (s3PipelinePhase === "loading") {
      status3 = activeStage === 3 ? "active" : "working";
    } else if (s3PipelinePhase === "error") {
      status3 = "active";
    } else if (s3PipelinePhase === "idle" && isEditingHypothesis) {
      status3 = "pending";
    } else if (activeStage === 3) {
      status3 = "active";
    } else {
      status3 = "pending";
    }
    return [
      { id: 1, label: "Hypothesis", status: status1 },
      { id: 2, label: "Literature QC", status: status2 },
      { id: 3, label: "Experiment Plan", status: status3 },
    ];
  }, [activeStage, workReady, s3PipelinePhase, isEditingHypothesis]);

  const onStartEditHypothesis = useCallback(() => {
    setHypothesisDraft(hypothesis);
    setIsEditing(true);
  }, [hypothesis, setHypothesisDraft, setIsEditing]);

  const onSaveHypothesis = useCallback(() => {
    const t = hypothesisDraft.trim();
    if (!t) {
      toast.error("Hypothesis cannot be empty.");
      return;
    }
    // Always restart analysis → literature → plan for the saved text (any stage, any prior results).
    resetPipelineForHypothesis(t);
    navigate({ to: "/generate", search: { h: t }, replace: true });
  }, [hypothesisDraft, navigate, resetPipelineForHypothesis]);

  const onCancelEditHypothesis = useCallback(() => {
    setIsEditing(false);
    setHypothesisDraft("");
  }, [setHypothesisDraft, setIsEditing]);

  const showStage2 = workReady.includes(1);
  const showStage3 = completed.includes(2);

  useEffect(() => {
    const el = document.getElementById("stage-content");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [activeStage]);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 app-page-generate">
        <div className="container mx-auto px-6 py-10 max-w-4xl">
          <div
            className="rounded-2xl border border-border border-l-4 border-l-lab-teal/45 bg-card/60 backdrop-blur p-5 md:p-6 mb-8 animate-fade-in"
            data-print-hide
          >
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
                <FlaskConical className="h-3.5 w-3.5 text-lab-teal" />
                Your hypothesis
              </div>
              {!isEditingHypothesis ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onStartEditHypothesis}
                  className="h-8 text-xs text-muted-foreground hover:text-foreground -mr-2"
                >
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Edit
                </Button>
              ) : (
                <div className="flex items-center gap-1.5 shrink-0 -mr-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onCancelEditHypothesis}
                    className="h-8 text-xs"
                  >
                    Cancel
                  </Button>
                  <Button size="sm" onClick={onSaveHypothesis} className="h-8 text-xs btn-cta">
                    Save
                  </Button>
                </div>
              )}
            </div>
            {isEditingHypothesis ? (
              <Textarea
                value={hypothesisDraft}
                onChange={(e) => setHypothesisDraft(e.target.value)}
                className="min-h-[140px] text-base leading-relaxed rounded-xl bg-background/50 border-border"
                placeholder="State your testable scientific hypothesis…"
                autoFocus
              />
            ) : (
              <p className="text-foreground/95 leading-relaxed">{hypothesis}</p>
            )}
            {isEditingHypothesis && (
              <p className="text-xs text-muted-foreground mt-3">
                The pipeline is paused while you edit. After <strong>Save</strong>, hypothesis
                analysis, literature QC, and the experiment plan all regenerate from the beginning
                for your saved text. <strong>Cancel</strong> keeps the current run.
              </p>
            )}
          </div>

          <div
            className="rounded-2xl border border-border border-l-4 border-l-lab-violet/40 bg-card/40 backdrop-blur p-5 md:p-6 mb-8"
            data-print-hide
          >
            <PipelineProgress
              stages={stages}
              onStageClick={onPipelineStageClick}
              canSelectStage={canSelectStage}
            />
          </div>

          <div id="stage-content" className="scroll-mt-24">
            <div className={activeStage === 1 ? "block" : "hidden"} aria-hidden={activeStage !== 1}>
              <Stage1Hypothesis suspended={isEditingHypothesis} onComplete={() => advanceTo(2)} />
            </div>
            {showStage2 && (
              <div
                className={activeStage === 2 ? "block" : "hidden"}
                aria-hidden={activeStage !== 2}
              >
                <Stage2Literature suspended={isEditingHypothesis} onComplete={() => advanceTo(3)} />
              </div>
            )}
            {showStage3 && (
              <div
                className={activeStage === 3 ? "block" : "hidden"}
                aria-hidden={activeStage !== 3}
              >
                <Stage3Plan hypothesis={hypothesis} suspended={isEditingHypothesis} />
              </div>
            )}
          </div>

          <div className="mt-10 text-center" data-print-hide>
            <Link
              to="/"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Start over with a new hypothesis
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
