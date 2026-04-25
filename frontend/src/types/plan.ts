// Core types for the LabMind experiment plan.
export type Difficulty = "Beginner" | "Intermediate" | "Advanced";
export type NoveltySignal = "not_found" | "similar_exists" | "exact_match";
export type MaterialCategory = "Reagent" | "Equipment" | "Consumable";
export type PhaseType = "preparation" | "treatment" | "analysis" | "measurement";

export interface HypothesisAnalysis {
  intervention: string;
  measurableOutcome: string;
  mechanisticReason: string;
  controlCondition: string;
  strengthScore: "Strong" | "Moderate" | "Weak";
  strengthReason: string;
}

export interface Reference {
  title: string;
  authors: string;
  journal: string;
  year: number;
  doi: string;
  relevance: string;
}

export interface LiteratureQC {
  noveltySignal: NoveltySignal;
  noveltyExplanation: string;
  references: Reference[];
}

export interface ProtocolStep {
  stepNumber: number;
  title: string;
  description: string;
  durationHours: number;
  safetyWarnings: string[];
  criticalNotes: string[];
}

export interface ProtocolPhase {
  phaseName: string;
  steps: ProtocolStep[];
}

export interface Material {
  item: string;
  specification: string;
  quantity: string;
  supplier: string;
  catalogNumber: string;
  unitPriceUSD: number;
  totalCostUSD: number;
  category: MaterialCategory;
  leadTimeWeeks: number;
}

export interface BudgetBreakdown {
  byCategory: { category: string; amountUSD: number }[];
  contingencyPercent: number;
  totalWithContingencyUSD: number;
}

export interface TimelinePhase {
  name: string;
  startDay: number;
  endDay: number;
  type: PhaseType;
  dependencies: string[];
}

export interface Validation {
  successMetrics: string[];
  statisticalPlan: string;
  sampleSize: string;
  controls: { positive: string; negative: string };
  failureModes: { mode: string; earlyDetection: string }[];
  qcCheckpoints: string[];
}

export interface Safety {
  hazardousMaterials: { material: string; hazards: string[]; ghsSymbols: string[] }[];
  requiredPPE: string[];
  wasteDisposal: string[];
  emergencyProcedures: string[];
}

export interface ExperimentPlan {
  title: string;
  totalCostUSD: number;
  totalDurationDays: number;
  difficultyLevel: Difficulty;
  expertiseTags: string[];
  protocol: { phases: ProtocolPhase[] };
  materials: Material[];
  budget: BudgetBreakdown;
  timeline: { phases: TimelinePhase[] };
  validation: Validation;
  safety: Safety;
}

export interface FullPlan {
  hypothesisAnalysis: HypothesisAnalysis;
  literatureQC: LiteratureQC;
  experimentPlan: ExperimentPlan;
  /** Domain tag for matching feedback (e.g. "cell_biology") */
  domain: string;
  /** AI reasoning trace for transparency */
  reasoning: {
    repositoriesConsulted: string[];
    budgetMethodology: string;
    literatureInfluence: string;
    confidence: { section: string; level: "High" | "Medium" | "Low"; reason: string }[];
  };
}
