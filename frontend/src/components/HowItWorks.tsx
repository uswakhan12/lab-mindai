import { FlaskConical, BookOpenCheck, ClipboardList } from "lucide-react";

const steps = [
  {
    icon: FlaskConical,
    num: "01",
    title: "Enter Hypothesis",
    desc: "Describe your scientific question in plain language. No formatting, no templates required.",
    accent: "teal" as const,
  },
  {
    icon: BookOpenCheck,
    num: "02",
    title: "Literature QC Check",
    desc: "LabMind cross-references recent literature, validates novelty, and surfaces methodological gaps.",
    accent: "violet" as const,
  },
  {
    icon: ClipboardList,
    num: "03",
    title: "Full Experiment Plan",
    desc: "Receive a runnable protocol, materials list, budget, and timeline — ready for the bench Monday morning.",
    accent: "emerald" as const,
  },
];

const stepAccent: Record<"teal" | "violet" | "emerald", { card: string; iconWrap: string; icon: string; num: string }> = {
  teal: {
    card: "border-l-4 border-l-teal-400 hover:bg-teal-500/12",
    iconWrap: "bg-teal-500/20 border-2 border-teal-400/35",
    icon: "text-teal-300",
    num: "text-teal-500/25",
  },
  violet: {
    card: "border-l-4 border-l-violet-400 hover:bg-violet-500/12",
    iconWrap: "bg-violet-500/20 border-2 border-violet-400/35",
    icon: "text-violet-300",
    num: "text-violet-500/25",
  },
  emerald: {
    card: "border-l-4 border-l-emerald-400 hover:bg-emerald-500/12",
    iconWrap: "bg-emerald-500/20 border-2 border-emerald-400/35",
    icon: "text-emerald-400",
    num: "text-emerald-500/25",
  },
};

export function HowItWorks() {
  return (
    <section
      id="how"
      className="app-section-surface-b container mx-auto px-6 py-24 rounded-3xl border border-border/40 bg-card/30 backdrop-blur-sm shadow-sm shadow-violet-500/5"
    >
      <div className="text-center mb-16">
        <p className="text-sm font-medium text-lab-amber uppercase tracking-widest mb-3">Workflow</p>
        <h2 className="text-4xl md:text-5xl font-semibold tracking-tight">
          Three steps. <span className="text-gradient">Zero busywork.</span>
        </h2>
      </div>
      <div className="grid md:grid-cols-3 gap-6 relative">
        {steps.map((s, i) => {
          const a = stepAccent[s.accent];
          return (
          <div
            key={s.num}
            className={`relative rounded-2xl border border-border bg-card/50 p-8 hover:border-border transition-all duration-300 backdrop-blur-sm ${a.card}`}
          >
            <div className={`absolute top-6 right-6 font-display text-5xl font-bold select-none ${a.num}`}>
              {s.num}
            </div>
            <div className={`inline-flex p-3 rounded-xl mb-5 ${a.iconWrap}`}>
              <s.icon className={`h-6 w-6 ${a.icon}`} strokeWidth={1.75} />
            </div>
            <h3 className="text-xl font-semibold mb-2">{s.title}</h3>
            <p className="text-muted-foreground leading-relaxed text-sm">{s.desc}</p>
            {i < steps.length - 1 && (
              <div className="hidden md:block absolute top-1/2 -right-3 w-6 h-px bg-gradient-to-r from-lab-violet/30 to-transparent" />
            )}
          </div>
        );
        })}
      </div>
    </section>
  );
}
