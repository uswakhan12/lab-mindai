import type { PlanVerificationSection } from "@/types/plan";

export type PlanTabId =
  | "overview"
  | "protocol"
  | "materials"
  | "budget"
  | "timeline"
  | "validation"
  | "safety";

/** Uppercase kicker + active nav state per plan tab. */
export const PLAN_TAB_STYLE: Record<
  PlanTabId,
  { kicker: string; navActive: string }
> = {
  overview: {
    kicker: "text-lab-violet light:text-violet-800",
    navActive:
      "bg-lab-violet/12 text-lab-violet border-lab-violet/40 light:bg-violet-100/90 light:text-violet-900 light:border-violet-300/50",
  },
  protocol: {
    kicker: "text-lab-teal light:text-teal-800",
    navActive:
      "bg-lab-teal/12 text-lab-teal border-lab-teal/40 light:bg-teal-100/90 light:text-teal-900 light:border-teal-300/50",
  },
  materials: {
    kicker: "text-amber-300 light:text-amber-900",
    navActive:
      "bg-amber-500/12 text-amber-200 border-amber-500/40 light:bg-amber-100/90 light:text-amber-900 light:border-amber-400/50",
  },
  budget: {
    kicker: "text-emerald-300 light:text-emerald-800",
    navActive:
      "bg-emerald-500/12 text-emerald-200 border-emerald-500/40 light:bg-emerald-100/90 light:text-emerald-900 light:border-emerald-400/50",
  },
  timeline: {
    kicker: "text-sky-300 light:text-sky-800",
    navActive:
      "bg-sky-500/12 text-sky-200 border-sky-500/40 light:bg-sky-100/90 light:text-sky-900 light:border-sky-400/50",
  },
  validation: {
    kicker: "text-cyan-300 light:text-cyan-800",
    navActive:
      "bg-cyan-500/12 text-cyan-200 border-cyan-500/40 light:bg-cyan-100/90 light:text-cyan-900 light:border-cyan-400/50",
  },
  safety: {
    kicker: "text-rose-300 light:text-rose-800",
    navActive:
      "bg-rose-500/12 text-rose-200 border-rose-500/40 light:bg-rose-100/90 light:text-rose-900 light:border-rose-400/50",
  },
};

export const VERIFY_BLOCK_STYLE: Record<
  PlanVerificationSection,
  { box: string; kicker: string; link: string }
> = {
  protocol: {
    box: "border-lab-teal/30 bg-gradient-to-r from-lab-teal/8 to-card/50",
    kicker: "text-lab-teal light:text-teal-800",
    link: "text-lab-teal light:text-teal-700",
  },
  materials: {
    box: "border-amber-500/30 bg-gradient-to-r from-amber-500/8 to-card/50",
    kicker: "text-amber-200 light:text-amber-800",
    link: "text-amber-200 light:text-amber-800",
  },
  budget: {
    box: "border-emerald-500/30 bg-gradient-to-r from-emerald-500/8 to-card/50",
    kicker: "text-emerald-200 light:text-emerald-800",
    link: "text-emerald-300 light:text-emerald-700",
  },
  timeline: {
    box: "border-sky-500/30 bg-gradient-to-r from-sky-500/8 to-card/50",
    kicker: "text-sky-200 light:text-sky-800",
    link: "text-sky-300 light:text-sky-700",
  },
  validation: {
    box: "border-cyan-500/30 bg-gradient-to-r from-cyan-500/8 to-card/50",
    kicker: "text-cyan-200 light:text-cyan-800",
    link: "text-cyan-300 light:text-cyan-700",
  },
  safety: {
    box: "border-rose-500/30 bg-gradient-to-r from-rose-500/8 to-card/50",
    kicker: "text-rose-200 light:text-rose-800",
    link: "text-rose-300 light:text-rose-700",
  },
};

export const REASONING_KICKERS = [
  "text-cyan-300 light:text-cyan-800",
  "text-violet-300 light:text-violet-800",
  "text-amber-300 light:text-amber-800",
  "text-emerald-300 light:text-emerald-800",
] as const;

export const MATERIAL_CATEGORY_BADGE = [
  "border-teal-500/40 bg-teal-500/10 text-teal-200 light:border-teal-600/40 light:text-teal-900",
  "border-violet-500/40 bg-violet-500/10 text-violet-200 light:border-violet-600/40 light:text-violet-900",
  "border-amber-500/40 bg-amber-500/10 text-amber-200 light:border-amber-800/30 light:text-amber-900",
] as const;
