import type { HypothesisAnalysis } from "./generateTypes";

export function analyzeHypothesis(h: string): HypothesisAnalysis {
  const lower = h.toLowerCase();
  const interventionMatch =
    h.match(/replacing\s+([^.]+?)\s+(?:with|as)/i) ||
    h.match(/(?:supplementation|treatment|use)\s+of\s+([^.]+?)(?:\s+for|\s+will|,)/i) ||
    h.match(/^([A-Z][^.]+?)\s+will/);
  const outcomeMatch = h.match(
    /will\s+(increase|decrease|reduce|improve|achieve|detect)\s+([^.]+?)(?:\s+by|\s+within|\s+compared|\.|$)/i,
  );
  const controlMatch = h.match(/compared\s+(?:to|with)\s+([^.]+?)(?:\.|$)/i);

  return {
    intervention: interventionMatch?.[1]?.trim() || h.split(/\s+/).slice(0, 8).join(" ") + "…",
    outcome: outcomeMatch
      ? `${outcomeMatch[1]} ${outcomeMatch[2]}`.trim()
      : "quantitative endpoint detected",
    mechanism:
      lower.includes("because") || lower.includes("via")
        ? "Explicit mechanism stated"
        : "Implicit biophysical mechanism — protective/binding/catalytic interaction",
    control: controlMatch?.[1]?.trim() || "Standard-of-care baseline (implied)",
  };
}
