import { create } from "zustand";
import type {
  HypothesisAnalysis,
  LiteratureQCResult,
  ModelFlowMeta,
  S3StorePhase,
} from "./generateTypes";
import type { FullPlan } from "@/types/plan";

function baseReset(sessionKey: string) {
  return {
    sessionKey,
    activeStage: 1 as 1 | 2 | 3,
    completed: [] as number[],
    workReady: [] as number[],
    s3PipelinePhase: "idle" as S3StorePhase,
    isEditingHypothesis: false,
    hypothesisDraft: "",
    s1Loading: false,
    s1Analysis: null as HypothesisAnalysis | null,
    s2Progress: 0,
    s2Loading: false,
    s2Error: "",
    s2Result: null as LiteratureQCResult | null,
    s2AbortedByEdit: false,
    s2RerunKey: 0,
    s3StepIdx: 0,
    s3Plan: null as FullPlan | null,
    s3ModelFlow: undefined as ModelFlowMeta | undefined,
    s3Error: "",
    s3GenInterrupted: false,
    s3GenRerun: 0,
  };
}

type GenerateState = ReturnType<typeof baseReset> & {
  /** Call when /generate?h= changes (or first load). Resets if hypothesis changed. */
  syncSessionKey: (nextKey: string) => void;
  /**
   * After the user saves an edited hypothesis: always wipe pipeline output and
   * restart from stage 1, even if the text matches the previous session key.
   */
  resetPipelineForHypothesis: (hypothesisKey: string) => void;
  setActiveStage: (n: 1 | 2 | 3) => void;
  /** Marks the current `activeStage` as completed and moves to the next stage. */
  advanceTo: (to: 1 | 2 | 3) => void;
  setS3PipelinePhase: (p: S3StorePhase) => void;
  setIsEditing: (v: boolean) => void;
  setHypothesisDraft: (d: string) => void;
  setS1Loading: (v: boolean) => void;
  setS1Analysis: (a: HypothesisAnalysis | null) => void;
  addWorkReady: (n: number) => void;
  setS2Progress: (n: number) => void;
  setS2Loading: (v: boolean) => void;
  setS2Error: (e: string) => void;
  setS2Result: (r: LiteratureQCResult | null) => void;
  setS2AbortedByEdit: (v: boolean) => void;
  bumpS2Rerun: () => void;
  setS3StepIdx: (i: number) => void;
  nudgeS3Step: (max: number) => void;
  setS3Plan: (p: FullPlan | null) => void;
  setS3ModelFlow: (m: ModelFlowMeta | undefined) => void;
  setS3Error: (e: string) => void;
  setS3GenInterrupted: (v: boolean) => void;
  bumpS3GenRerun: () => void;
};

export const useGenerateStore = create<GenerateState>((set, get) => ({
  ...baseReset(""),

  syncSessionKey: (nextKey) => {
    const cur = get().sessionKey;
    if (cur === nextKey) return;
    set(baseReset(nextKey));
  },

  resetPipelineForHypothesis: (hypothesisKey) => set(baseReset(hypothesisKey)),

  setActiveStage: (n) => set({ activeStage: n }),
  advanceTo: (to) => {
    set((s) => ({
      completed: s.completed.includes(s.activeStage)
        ? s.completed
        : [...s.completed, s.activeStage],
      activeStage: to,
    }));
  },
  setS3PipelinePhase: (p) => set({ s3PipelinePhase: p }),
  setIsEditing: (v) => set({ isEditingHypothesis: v }),
  setHypothesisDraft: (d) => set({ hypothesisDraft: d }),
  setS1Loading: (v) => set({ s1Loading: v }),
  setS1Analysis: (a) => set({ s1Analysis: a }),
  addWorkReady: (n) =>
    set((s) => (s.workReady.includes(n) ? s : { workReady: [...s.workReady, n] })),

  setS2Progress: (n) => set({ s2Progress: n }),
  setS2Loading: (v) => set({ s2Loading: v }),
  setS2Error: (e) => set({ s2Error: e }),
  setS2Result: (r) => set({ s2Result: r }),
  setS2AbortedByEdit: (v) => set({ s2AbortedByEdit: v }),
  bumpS2Rerun: () =>
    set((s) => ({
      s2RerunKey: s.s2RerunKey + 1,
      s2Result: null,
      s2Error: "",
      s2AbortedByEdit: false,
      s2Progress: 0,
    })),

  setS3StepIdx: (i) => set({ s3StepIdx: i }),
  /** Advance loading step; caps at `max`. */
  nudgeS3Step: (max: number) => set((s) => ({ s3StepIdx: Math.min(s.s3StepIdx + 1, max) })),
  setS3Plan: (p) => set({ s3Plan: p }),
  setS3ModelFlow: (m) => set({ s3ModelFlow: m }),
  setS3Error: (e) => set({ s3Error: e }),
  setS3GenInterrupted: (v) => set({ s3GenInterrupted: v }),
  bumpS3GenRerun: () =>
    set((s) => ({
      s3GenRerun: s.s3GenRerun + 1,
      s3Plan: null,
      s3Error: "",
      s3ModelFlow: undefined,
      s3GenInterrupted: false,
      s3PipelinePhase: "idle",
      s3StepIdx: 0,
    })),
}));
