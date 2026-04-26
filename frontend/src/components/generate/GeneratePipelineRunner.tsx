import { useEffect, useLayoutEffect, useRef } from "react";
import { analyzeHypothesis } from "@/lib/analyzeHypothesis";
import { fetchModelGeneratedPlan } from "@/lib/fetchModelGeneratedPlan";
import { useGenerateStore } from "@/lib/generateStore";
import type { LiteratureQCResult } from "@/lib/generateTypes";
import { addToHistory } from "@/lib/storage";
import { PLAN_LOADING_STEPS } from "@/lib/planLoadingSteps";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8080";

const S3_STEP_MAX = PLAN_LOADING_STEPS.length - 1;

/**
 * Drives stage 1–3 async work from the root layout so generation continues
 * when the user navigates away from `/generate` (e.g. to Home / #about).
 */
export function GeneratePipelineRunner() {
  const sessionKey = useGenerateStore((s) => s.sessionKey);
  const isEditing = useGenerateStore((s) => s.isEditingHypothesis);
  const s1Analysis = useGenerateStore((s) => s.s1Analysis);
  const workReadyStr = useGenerateStore((s) => s.workReady.join(","));
  const s2RerunKey = useGenerateStore((s) => s.s2RerunKey);
  const completedStr = useGenerateStore((s) => s.completed.join(","));
  const s3GenRerun = useGenerateStore((s) => s.s3GenRerun);

  const s1TimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const s2AbortRef = useRef<AbortController | null>(null);
  const s3StepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const s3PlanAbortRef = useRef<AbortController | null>(null);

  // --- Stage 1: hypothesis analysis (timer)
  useEffect(() => {
    if (!sessionKey) {
      if (s1TimerRef.current) {
        clearTimeout(s1TimerRef.current);
        s1TimerRef.current = null;
      }
      return;
    }
    if (isEditing) {
      if (s1TimerRef.current) {
        clearTimeout(s1TimerRef.current);
        s1TimerRef.current = null;
      }
      useGenerateStore.getState().setS1Loading(false);
      return;
    }
    if (s1Analysis) {
      if (s1TimerRef.current) {
        clearTimeout(s1TimerRef.current);
        s1TimerRef.current = null;
      }
      return;
    }

    useGenerateStore.getState().setS1Loading(true);
    s1TimerRef.current = setTimeout(() => {
      s1TimerRef.current = null;
      if (useGenerateStore.getState().isEditingHypothesis) {
        useGenerateStore.getState().setS1Loading(false);
        return;
      }
      if (useGenerateStore.getState().s1Analysis) {
        useGenerateStore.getState().setS1Loading(false);
        return;
      }
      const a = analyzeHypothesis(sessionKey);
      const st = useGenerateStore.getState();
      st.setS1Analysis(a);
      st.setS1Loading(false);
      st.addWorkReady(1);
    }, 1500);

    return () => {
      if (s1TimerRef.current) {
        clearTimeout(s1TimerRef.current);
        s1TimerRef.current = null;
      }
      useGenerateStore.getState().setS1Loading(false);
    };
  }, [sessionKey, isEditing, s1Analysis]);

  // --- Stage 2: literature QC
  useLayoutEffect(() => {
    if (!isEditing) return;
    s2AbortRef.current?.abort();
  }, [isEditing]);

  useEffect(() => {
    if (!sessionKey) return;
    if (isEditing) {
      s2AbortRef.current?.abort();
      return;
    }
    if (!workReadyStr.split(",").filter(Boolean).map(Number).includes(1)) return;

    const s = useGenerateStore.getState();
    if (s.s2Result) return;
    if (s.s2Error) return;

    s.setS2AbortedByEdit(false);
    s.setS2Loading(true);
    s.setS2Error("");
    s.setS2Result(null);
    s.setS2Progress(0);

    const start = Date.now();
    const duration = 5000;
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min(92, (elapsed / duration) * 100);
      useGenerateStore.getState().setS2Progress(pct);
    }, 50);

    const ac = new AbortController();
    s2AbortRef.current = ac;

    const run = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/literature-qc`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hypothesis: sessionKey }),
          signal: ac.signal,
        });
        const data = (await response.json()) as LiteratureQCResult & {
          error?: string;
          details?: string;
        };
        if (!response.ok) {
          const parts = [data.error, data.details].filter(Boolean);
          throw new Error(parts.join(" — ") || "Failed to fetch literature QC.");
        }
        useGenerateStore.getState().setS2Result(data);
        useGenerateStore.getState().setS2Progress(100);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          useGenerateStore.getState().setS2AbortedByEdit(true);
        } else {
          const message = err instanceof Error ? err.message : "Unexpected error";
          useGenerateStore.getState().setS2Error(message);
        }
      } finally {
        clearInterval(interval);
        s2AbortRef.current = null;
        const g = useGenerateStore.getState();
        g.setS2Loading(false);
        if (!ac.signal.aborted) {
          g.addWorkReady(2);
        }
      }
    };

    void run();

    return () => {
      ac.abort();
      clearInterval(interval);
    };
  }, [sessionKey, isEditing, workReadyStr, s2RerunKey]);

  // --- Stage 3: experiment plan
  useLayoutEffect(() => {
    if (!isEditing) return;
    if (s3StepIntervalRef.current) {
      clearInterval(s3StepIntervalRef.current);
      s3StepIntervalRef.current = null;
    }
    s3PlanAbortRef.current?.abort();
    useGenerateStore.getState().setS3PipelinePhase("idle");
    useGenerateStore.getState().setS3StepIdx(0);
  }, [isEditing]);

  useEffect(() => {
    if (!sessionKey) return;
    if (isEditing) return;
    if (!useGenerateStore.getState().completed.includes(2)) return;
    {
      const g = useGenerateStore.getState();
      if (g.s3Plan && g.s3GenRerun === 0) return;
    }

    let cancelled = false;
    const st = useGenerateStore.getState();
    st.setS3GenInterrupted(false);
    st.setS3StepIdx(0);
    st.setS3Error("");
    st.setS3PipelinePhase("loading");

    const stepInterval = setInterval(() => {
      useGenerateStore.getState().nudgeS3Step(S3_STEP_MAX);
    }, 1500);
    s3StepIntervalRef.current = stepInterval;

    const waitCancellable = async (totalMs: number) => {
      const step = 150;
      let left = totalMs;
      while (left > 0) {
        if (cancelled || useGenerateStore.getState().isEditingHypothesis) {
          return false;
        }
        const t = Math.min(step, left);
        await new Promise((r) => setTimeout(r, t));
        left -= t;
      }
      return !cancelled && !useGenerateStore.getState().isEditingHypothesis;
    };

    const run = async () => {
      const introMs = PLAN_LOADING_STEPS.length * 1500 + 200;
      if (!(await waitCancellable(introMs))) {
        if (cancelled) return;
        if (s3StepIntervalRef.current) {
          clearInterval(s3StepIntervalRef.current);
          s3StepIntervalRef.current = null;
        }
        useGenerateStore.getState().setS3StepIdx(0);
        if (useGenerateStore.getState().isEditingHypothesis) {
          useGenerateStore.getState().setS3GenInterrupted(true);
          useGenerateStore.getState().setS3PipelinePhase("idle");
        }
        return;
      }
      if (cancelled || useGenerateStore.getState().isEditingHypothesis) return;
      if (s3StepIntervalRef.current) {
        clearInterval(s3StepIntervalRef.current);
        s3StepIntervalRef.current = null;
      }
      const ac = new AbortController();
      s3PlanAbortRef.current = ac;
      try {
        const generated = await fetchModelGeneratedPlan(sessionKey, ac.signal);
        if (cancelled || useGenerateStore.getState().isEditingHypothesis) return;
        addToHistory(sessionKey, generated.plan);
        const g = useGenerateStore.getState();
        g.setS3ModelFlow(generated.modelFlow);
        g.setS3Plan(generated.plan);
        g.setS3PipelinePhase("ready");
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") {
          if (!cancelled) {
            useGenerateStore.getState().setS3GenInterrupted(true);
            useGenerateStore.getState().setS3PipelinePhase("idle");
          }
        } else if (!cancelled && !useGenerateStore.getState().isEditingHypothesis) {
          useGenerateStore
            .getState()
            .setS3Error(e instanceof Error ? e.message : "Plan generation failed.");
          useGenerateStore.getState().setS3PipelinePhase("error");
        }
      } finally {
        s3PlanAbortRef.current = null;
      }
    };

    void run();

    return () => {
      cancelled = true;
      if (s3StepIntervalRef.current) {
        clearInterval(s3StepIntervalRef.current);
        s3StepIntervalRef.current = null;
      }
      s3PlanAbortRef.current?.abort();
    };
  }, [sessionKey, isEditing, completedStr, s3GenRerun]);

  return null;
}
