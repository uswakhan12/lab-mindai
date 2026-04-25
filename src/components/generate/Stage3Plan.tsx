import { Loader2 } from "lucide-react";

export function Stage3Plan() {
  return (
    <div className="rounded-2xl border border-border bg-card/50 backdrop-blur p-12 text-center animate-fade-in">
      <div className="relative inline-flex mb-5">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
        <div className="absolute inset-0 blur-lg bg-primary/40 -z-10" />
      </div>
      <h3 className="text-xl font-semibold mb-2">Generating your experiment plan…</h3>
      <p className="text-muted-foreground max-w-md mx-auto">
        Synthesizing protocol, materials, budget, and timeline. The full plan generator will be
        wired up in the next step.
      </p>
    </div>
  );
}
