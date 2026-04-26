import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowRight, Sparkles } from "lucide-react";

const EXAMPLES = [
  {
    label: "🧫 Cell Cryopreservation",
    text: "Replacing sucrose with trehalose as a cryoprotectant will increase post-thaw viability of HeLa cells by at least 15 percentage points compared to the standard 10% DMSO protocol.",
  },
  {
    label: "🩸 CRP Biosensor",
    text: "A graphene-FET biosensor functionalized with anti-CRP aptamers will detect C-reactive protein in undiluted serum at sub-nanomolar concentrations within 5 minutes.",
  },
  {
    label: "🦠 Probiotic Gut Health",
    text: "Daily oral supplementation of Lactobacillus rhamnosus GG for 8 weeks will reduce intestinal permeability (measured by lactulose/mannitol ratio) by ≥20% in adults with IBS-D.",
  },
  {
    label: "🌱 CO₂ Carbon Capture",
    text: "An amine-functionalized MOF (mmen-Mg2(dobpdc)) will achieve >90% CO₂ capture efficiency from flue gas at 40°C with cyclic stability over 100 adsorption-desorption cycles.",
  },
];

export function Hero() {
  const [hypothesis, setHypothesis] = useState("");
  const navigate = useNavigate();

  const handleGenerate = () => {
    navigate({ to: "/generate", search: { h: hypothesis || "" } as never });
  };

  return (
    <section className="relative overflow-hidden border-b border-border/25">
      <div className="absolute inset-0 bg-grid pointer-events-none" />
      <div className="absolute inset-0 bg-hero-glow pointer-events-none" />

      <div className="container mx-auto px-6 pt-20 pb-16 relative">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 rounded-full border-2 border-cyan-500/40 bg-gradient-to-r from-cyan-500/20 via-violet-500/15 to-fuchsia-500/20 backdrop-blur-md px-4 py-1.5 mb-8 text-xs text-muted-foreground shadow-lg shadow-cyan-500/25">
            <Sparkles className="h-3.5 w-3.5 text-amber-400 dark:text-amber-300 light:text-amber-600" />
            <span>
              <span className="text-foreground/90">AI Co-Scientist</span>
              <span className="text-muted-foreground"> · </span>
              <span className="text-fuchsia-400 dark:text-fuchsia-300 light:text-fuchsia-800">Powered by Fulcrum Science</span>
            </span>
          </div>

          <h1 className="font-display text-5xl md:text-6xl lg:text-7xl font-semibold tracking-tight leading-[1.05] mb-6">
            From Hypothesis to <span className="text-gradient">Runnable Experiment</span> in Minutes
          </h1>

          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            AI that thinks like a senior scientist. Generate complete, operationally grounded
            experiment plans — protocol, materials, budget, timeline — ready to run on Monday.
          </p>
        </div>

        <div className="max-w-3xl mx-auto mt-14">
          <label className="block text-sm font-medium mb-3 text-foreground/90">
            Enter your scientific hypothesis
          </label>
          <div className="relative group">
            <div className="absolute -inset-px rounded-2xl bg-primary-gradient opacity-0 group-focus-within:opacity-60 blur transition-opacity duration-500" />
            <Textarea
              value={hypothesis}
              onChange={(e) => setHypothesis(e.target.value)}
              placeholder="e.g. Replacing sucrose with trehalose as a cryoprotectant will increase post-thaw viability of HeLa cells by at least 15 percentage points compared to DMSO protocol..."
              className="relative min-h-[160px] text-base resize-none rounded-2xl bg-card/80 backdrop-blur border-border focus-visible:ring-primary/50 p-6 leading-relaxed"
            />
          </div>

          <div className="flex flex-wrap gap-2 mt-5 justify-center">
            {EXAMPLES.map((ex, i) => (
              <button
                key={ex.label}
                type="button"
                onClick={() => setHypothesis(ex.text)}
                className={cn(
                  "text-sm px-4 py-2 rounded-full border-2 bg-card/90 backdrop-blur transition-all shadow-sm",
                  i % 3 === 0 &&
                    "border-emerald-500/45 text-emerald-200 dark:text-emerald-300/90 light:text-emerald-900 bg-emerald-500/15 hover:border-emerald-500/45 hover:bg-emerald-500/25 hover:shadow-emerald-500/25",
                  i % 3 === 1 &&
                    "border-violet-500/45 text-violet-200 dark:text-violet-300/90 light:text-violet-900 bg-violet-500/15 hover:border-violet-500/45 hover:bg-violet-500/25 hover:shadow-violet-500/25",
                  i % 3 === 2 &&
                    "border-amber-500/45 text-amber-200 dark:text-amber-300/90 light:text-amber-900 bg-amber-500/15 hover:border-amber-500/45 hover:bg-amber-500/25 hover:shadow-amber-500/25",
                )}
              >
                {ex.label}
              </button>
            ))}
          </div>

          <div className="flex justify-center mt-8">
            <Button
              onClick={handleGenerate}
              size="lg"
              className="btn-cta text-base h-14 px-8 rounded-xl font-medium group"
            >
              Generate Experiment Plan
              <ArrowRight className="ml-1 h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
