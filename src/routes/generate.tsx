import { createFileRoute, Link } from "@tanstack/react-router";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/generate")({
  head: () => ({
    meta: [
      { title: "Generate Experiment Plan — LabMind AI" },
      { name: "description", content: "Generating your experiment plan." },
    ],
  }),
  component: GeneratePage,
});

function GeneratePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 container mx-auto px-6 py-24 flex items-center justify-center">
        <div className="max-w-xl text-center">
          <Loader2 className="h-10 w-10 text-primary animate-spin mx-auto mb-6" />
          <h1 className="text-3xl md:text-4xl font-semibold mb-3">Generation engine coming online</h1>
          <p className="text-muted-foreground mb-8">
            The plan generator will live here. Connect Lovable Cloud + AI to power literature QC
            and protocol synthesis.
          </p>
          <Link to="/">
            <Button variant="outline">← Back to home</Button>
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
