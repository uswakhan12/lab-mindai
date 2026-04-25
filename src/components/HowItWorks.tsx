import { FlaskConical, BookOpenCheck, ClipboardList } from "lucide-react";

const steps = [
  {
    icon: FlaskConical,
    num: "01",
    title: "Enter Hypothesis",
    desc: "Describe your scientific question in plain language. No formatting, no templates required.",
  },
  {
    icon: BookOpenCheck,
    num: "02",
    title: "Literature QC Check",
    desc: "LabMind cross-references recent literature, validates novelty, and surfaces methodological gaps.",
  },
  {
    icon: ClipboardList,
    num: "03",
    title: "Full Experiment Plan",
    desc: "Receive a runnable protocol, materials list, budget, and timeline — ready for the bench Monday morning.",
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="container mx-auto px-6 py-24">
      <div className="text-center mb-16">
        <p className="text-sm font-medium text-primary uppercase tracking-widest mb-3">Workflow</p>
        <h2 className="text-4xl md:text-5xl font-semibold tracking-tight">
          Three steps. <span className="text-gradient">Zero busywork.</span>
        </h2>
      </div>
      <div className="grid md:grid-cols-3 gap-6 relative">
        {steps.map((s, i) => (
          <div
            key={s.num}
            className="relative rounded-2xl border border-border bg-card/50 p-8 hover:border-primary/40 hover:bg-card transition-all duration-300 backdrop-blur-sm"
          >
            <div className="absolute top-6 right-6 font-display text-5xl font-bold text-muted/40 select-none">
              {s.num}
            </div>
            <div className="inline-flex p-3 rounded-xl bg-primary/10 border border-primary/20 mb-5">
              <s.icon className="h-6 w-6 text-primary" strokeWidth={1.75} />
            </div>
            <h3 className="text-xl font-semibold mb-2">{s.title}</h3>
            <p className="text-muted-foreground leading-relaxed text-sm">{s.desc}</p>
            {i < steps.length - 1 && (
              <div className="hidden md:block absolute top-1/2 -right-3 w-6 h-px bg-gradient-to-r from-border to-transparent" />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
