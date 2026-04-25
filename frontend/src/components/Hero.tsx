import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
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
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 bg-grid pointer-events-none" />
      <div className="absolute inset-0 bg-hero-glow pointer-events-none" />

      <div className="container mx-auto px-6 pt-20 pb-16 relative">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 backdrop-blur px-4 py-1.5 mb-8 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            AI Co-Scientist · Powered by Fulcrum Science
          </div>

          <h1 className="font-display text-5xl md:text-6xl lg:text-7xl font-semibold tracking-tight leading-[1.05] mb-6">
            From Hypothesis to{" "}
            <span className="text-gradient">Runnable Experiment</span>{" "}
            in Minutes
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
            {EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                onClick={() => setHypothesis(ex.text)}
                className="text-sm px-4 py-2 rounded-full border border-border bg-card/60 hover:bg-accent hover:border-primary/40 transition-all backdrop-blur"
              >
                {ex.label}
              </button>
            ))}
          </div>

          <div className="flex justify-center mt-8">
            <Button
              onClick={handleGenerate}
              size="lg"
              className="bg-primary-gradient hover:opacity-95 shadow-glow text-base h-14 px-8 rounded-xl font-medium group"
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
