/** Progress lines shown while the experiment plan is being generated (stages 1 & 2 are “intro”). */
export const PLAN_LOADING_STEPS = [
  "📚 Searching PubMed for related protocols...",
  "🔬 Identifying required reagents from Sigma-Aldrich catalog...",
  "💰 Estimating costs based on current supplier pricing...",
  "📅 Building timeline with phase dependencies...",
  "✅ Validating protocol against MIQE guidelines...",
  "🔗 Fetching Tavily verification sources (materials, budget, safety, …)...",
] as const;
