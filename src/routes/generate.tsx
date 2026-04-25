import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { Pencil, FlaskConical } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { PipelineProgress, type PipelineStage } from "@/components/generate/PipelineProgress";
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

  const [activeStage, setActiveStage] = useState<ActiveStage>(1);
  const [completed, setCompleted] = useState<Set<number>>(new Set());

  const stages: PipelineStage[] = [
    {
      id: 1,
      label: "Hypothesis",
      status: completed.has(1) ? "complete" : activeStage === 1 ? "active" : "pending",
    },
    {
      id: 2,
      label: "Literature QC",
      status: completed.has(2) ? "complete" : activeStage === 2 ? "active" : "pending",
    },
    {
      id: 3,
      label: "Experiment Plan",
      status: completed.has(3) ? "complete" : activeStage === 3 ? "active" : "pending",
    },
  ];

  const advance = (next: ActiveStage) => {
    setCompleted((prev) => new Set(prev).add(activeStage));
    setActiveStage(next);
  };

  // Smooth-scroll to the stage content area on transition
  useEffect(() => {
    const el = document.getElementById("stage-content");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [activeStage]);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <div className="container mx-auto px-6 py-10 max-w-4xl">
          {/* Hypothesis card */}
          <div className="rounded-2xl border border-border bg-card/60 backdrop-blur p-5 md:p-6 mb-8 animate-fade-in">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
                <FlaskConical className="h-3.5 w-3.5 text-primary" />
                Your hypothesis
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate({ to: "/" })}
                className="h-8 text-xs text-muted-foreground hover:text-foreground -mr-2"
              >
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Edit
              </Button>
            </div>
            <p className="text-foreground/95 leading-relaxed">{hypothesis}</p>
          </div>

          {/* Pipeline */}
          <div className="rounded-2xl border border-border bg-card/40 backdrop-blur p-5 md:p-6 mb-8">
            <PipelineProgress stages={stages} />
          </div>

          {/* Active stage */}
          <div id="stage-content" className="scroll-mt-24">
            {activeStage === 1 && (
              <Stage1Hypothesis
                key="stage-1"
                hypothesis={hypothesis}
                onComplete={() => advance(2)}
              />
            )}
            {activeStage === 2 && (
              <Stage2Literature
                key="stage-2"
                hypothesis={hypothesis}
                onComplete={() => advance(3)}
              />
            )}
            {activeStage === 3 && <Stage3Plan key="stage-3" />}
          </div>

          <div className="mt-10 text-center">
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              ← Start over with a new hypothesis
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
