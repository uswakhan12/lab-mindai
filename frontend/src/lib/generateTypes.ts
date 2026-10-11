import type { FullPlan, NoveltyDiagnostics } from "@/types/plan";

export interface HypothesisAnalysis {
  intervention: string;
  outcome: string;
  mechanism: string;
  control: string;
}

export interface Reference {
  title: string;
  authors: string;
  journal: string;
  year: number;
  doi: string;
  relevance: string;
  /** May be set by the literature QC API instead of or in addition to `relevance`. */
  snippet?: string;
  url?: string;
  validationStatus?: "validated" | "weak_match";
  confidence?: number;
}

export interface LiteratureQCResult {
  noveltySignal: "not_found" | "similar_exists" | "exact_match";
  noveltyExplanation: string;
  references: Reference[];
  modelFlow?: { retrieval?: string; validator?: string };
  noveltyDiagnostics?: NoveltyDiagnostics;
}

export interface ModelFlowMeta {
  retrievalModel?: string;
  planningModel?: string;
  retrievalOutlineUsed?: boolean;
}

export type S3StorePhase = "idle" | "loading" | "ready" | "error";

export interface GenerateSessionSnapshot {
  sessionKey: string;
  activeStage: 1 | 2 | 3;
  completed: number[];
  workReady: number[];
  s3PipelinePhase: S3StorePhase;
  isEditingHypothesis: boolean;
  hypothesisDraft: string;
  s1Loading: boolean;
  s1Analysis: HypothesisAnalysis | null;
  s2Progress: number;
  s2Loading: boolean;
  s2Error: string;
  s2Result: LiteratureQCResult | null;
  s2AbortedByEdit: boolean;
  s2RerunKey: number;
  s3StepIdx: number;
  s3Plan: FullPlan | null;
  s3ModelFlow: ModelFlowMeta | undefined;
  s3Error: string;
  s3GenInterrupted: boolean;
  s3GenRerun: number;
}
