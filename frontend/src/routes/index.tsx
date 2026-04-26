import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { HowItWorks } from "@/components/HowItWorks";
import { Footer } from "@/components/Footer";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LabMind AI — From Hypothesis to Runnable Experiment in Minutes" },
      {
        name: "description",
        content:
          "AI that thinks like a senior scientist. Generate complete, operationally grounded experiment plans — protocol, materials, budget, timeline.",
      },
      { property: "og:title", content: "LabMind AI — Scientific Experiment Planning" },
      {
        property: "og:description",
        content: "Turn any hypothesis into a runnable experiment plan in minutes.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <Hero />
        <HowItWorks />
        <section id="examples" className="container mx-auto px-6 py-16 text-center">
          <h2 className="text-3xl md:text-4xl font-semibold mb-3">Examples across disciplines</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            From cryobiology to carbon capture — try a sample hypothesis above to see LabMind in
            action.
          </p>
        </section>
        <section id="about" className="container mx-auto px-6 py-16 max-w-3xl text-center">
          <h2 className="text-3xl md:text-4xl font-semibold mb-4">
            Built by scientists, for scientists
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            LabMind is an AI co-scientist trained on protocols, methods papers, and operational
            knowledge from working research labs. We don't replace judgement — we accelerate the
            grunt work between idea and bench.
          </p>
        </section>
      </main>
      <Footer />
    </div>
  );
}
