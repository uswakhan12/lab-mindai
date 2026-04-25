import type { FullPlan } from "@/types/plan";

/**
 * Detect experiment domain from hypothesis keywords.
 * Used for matching prior scientist feedback in the same domain.
 */
export function detectDomain(hypothesis: string): { domain: string; label: string; keywords: string[] } {
  const h = hypothesis.toLowerCase();
  const matchers: { domain: string; label: string; words: string[] }[] = [
    { domain: "cell_biology", label: "Cell Biology", words: ["hela", "cell", "viability", "cryopreservation", "culture", "apoptosis", "passage"] },
    { domain: "diagnostics", label: "Diagnostics & Biosensors", words: ["biosensor", "detection", "crp", "elisa", "lod", "aptamer", "graphene-fet", "fet"] },
    { domain: "microbiology", label: "Microbiology", words: ["lactobacillus", "probiotic", "microbiome", "16s", "gut", "bacterial", "strain"] },
    { domain: "materials_chemistry", label: "Materials Chemistry", words: ["mof", "carbon capture", "co2", "adsorption", "amine", "catalyst", "porosity"] },
    { domain: "molecular_biology", label: "Molecular Biology", words: ["pcr", "qpcr", "crispr", "transfection", "plasmid", "western blot", "rna-seq"] },
    { domain: "neuroscience", label: "Neuroscience", words: ["neuron", "synaptic", "brain", "cortex", "behavior", "ephys", "patch clamp"] },
  ];
  for (const m of matchers) {
    const matched = m.words.filter((w) => h.includes(w));
    if (matched.length > 0) {
      return { domain: m.domain, label: m.label, keywords: matched };
    }
  }
  return { domain: "general_biomed", label: "General Biomedical", keywords: hypothesis.split(/\s+/).slice(0, 3) };
}

/**
 * Real-time hypothesis quality scoring (client-side, no API).
 * Returns 4 boolean checks + score 0-100.
 */
export interface QualityCheck {
  hasIntervention: boolean;
  hasMeasurableOutcome: boolean;
  hasMechanism: boolean;
  hasControl: boolean;
  score: number;
  wordCount: number;
}

export function scoreHypothesis(h: string): QualityCheck {
  const text = h.trim();
  const words = text.split(/\s+/).filter(Boolean);
  const lower = text.toLowerCase();

  const hasIntervention =
    /\b(replac|using|use|treat|supplement|apply|administer|introduc|inject|infus|deliver|express|knockdown|knockout)\w*/.test(
      lower,
    ) || /\bwill\b/.test(lower);

  const hasMeasurableOutcome =
    /\b(\d+\s*(%|percentage|fold|pp|days?|hours?|nm|μm|um|mm|mg|ml|g\/l|nM|mM|°c))\b/i.test(
      text,
    ) || /\b(at least|by\s+\d|> \s*\d|≥|>=)/i.test(text);

  const hasMechanism =
    /\b(because|via|through|by\s+(?:inhibit|activat|bind|modulat|disrupt|stabiliz)|due to|mechanism|mediated)/i.test(
      lower,
    ) || lower.length > 120; // long hypotheses usually carry implicit mechanism

  const hasControl =
    /\b(compared\s+(to|with)|versus|vs\.?|relative to|control|baseline|standard)/i.test(lower);

  const score =
    (hasIntervention ? 25 : 0) +
    (hasMeasurableOutcome ? 30 : 0) +
    (hasMechanism ? 20 : 0) +
    (hasControl ? 25 : 0);

  return { hasIntervention, hasMeasurableOutcome, hasMechanism, hasControl, score, wordCount: words.length };
}

/* ---------------------- Mock plan generator ---------------------- */

function strengthFromQuality(q: QualityCheck): "Strong" | "Moderate" | "Weak" {
  if (q.score >= 80) return "Strong";
  if (q.score >= 50) return "Moderate";
  return "Weak";
}

/**
 * Deterministic, domain-aware mock plan generator.
 * Produces realistic, well-structured plans without an AI call.
 * Real Claude integration would replace this function with a server-fn call.
 */
export function generateMockPlan(hypothesis: string, prevFeedback?: string): FullPlan {
  const { domain, label, keywords } = detectDomain(hypothesis);
  const quality = scoreHypothesis(hypothesis);

  // Domain-specific titles & costs
  const domainProfiles: Record<string, { title: string; baseCost: number; days: number; difficulty: FullPlan["experimentPlan"]["difficultyLevel"]; tags: string[] }> = {
    cell_biology: {
      title: "Comparative Cryoprotection Efficacy in HeLa Cell Cryopreservation",
      baseCost: 4_850,
      days: 28,
      difficulty: "Intermediate",
      tags: ["Cell Biology", "Sterile Technique", "Flow Cytometry", "Cryobiology"],
    },
    diagnostics: {
      title: "Aptamer-Functionalized Graphene-FET Biosensor for CRP Detection",
      baseCost: 12_400,
      days: 42,
      difficulty: "Advanced",
      tags: ["Biosensors", "Nanofabrication", "Electrochemistry", "Surface Chemistry"],
    },
    microbiology: {
      title: "Lactobacillus rhamnosus GG Effect on Intestinal Barrier Function",
      baseCost: 8_900,
      days: 84,
      difficulty: "Intermediate",
      tags: ["Microbiology", "Clinical Research", "GI Physiology", "Microbiome Sequencing"],
    },
    materials_chemistry: {
      title: "MOF mmen-Mg2(dobpdc) for Cyclic CO₂ Capture from Flue Gas",
      baseCost: 15_600,
      days: 56,
      difficulty: "Advanced",
      tags: ["Materials Synthesis", "Gas Chromatography", "BET Surface Analysis", "Thermogravimetry"],
    },
    molecular_biology: {
      title: "Targeted Gene Modulation Validation Study",
      baseCost: 6_200,
      days: 35,
      difficulty: "Intermediate",
      tags: ["Molecular Biology", "qPCR", "Transfection", "Western Blot"],
    },
    neuroscience: {
      title: "Neuronal Response Characterization Study",
      baseCost: 11_300,
      days: 49,
      difficulty: "Advanced",
      tags: ["Electrophysiology", "Microscopy", "Animal Handling", "Behavioral Assays"],
    },
    general_biomed: {
      title: "Quantitative Hypothesis Validation Study",
      baseCost: 5_500,
      days: 30,
      difficulty: "Intermediate",
      tags: ["Experimental Design", "Statistics", "Wet Lab"],
    },
  };

  const profile = domainProfiles[domain];

  // Use cell biology mock as the canonical full template (most detailed).
  // Other domains adapt cost/title but use similar protocol structure.
  const plan: FullPlan = {
    domain,
    hypothesisAnalysis: {
      intervention: extractIntervention(hypothesis),
      measurableOutcome: extractOutcome(hypothesis),
      mechanisticReason: extractMechanism(hypothesis, label),
      controlCondition: extractControl(hypothesis),
      strengthScore: strengthFromQuality(quality),
      strengthReason: buildStrengthReason(quality),
    },
    literatureQC: {
      noveltySignal: domain === "cell_biology" ? "similar_exists" : "not_found",
      noveltyExplanation:
        prevFeedback
          ? `Building on ${label} domain knowledge refined by prior scientist reviews. Three closely related studies identified, but your specific combination of conditions and quantitative endpoint remains methodologically novel.`
          : `Your hypothesis sits at an active intersection of ${label}. Closely related work exists, but the specific combination you propose is methodologically distinct — strong positioning for a publishable, reproducible result.`,
      references: literatureRefsForDomain(domain),
    },
    experimentPlan: {
      title: profile.title,
      totalCostUSD: profile.baseCost,
      totalDurationDays: profile.days,
      difficultyLevel: profile.difficulty,
      expertiseTags: profile.tags,
      protocol: protocolForDomain(domain),
      materials: materialsForDomain(domain, profile.baseCost),
      budget: budgetForDomain(domain, profile.baseCost),
      timeline: timelineForDomain(domain, profile.days),
      validation: validationForDomain(domain, keywords),
      safety: safetyForDomain(domain),
    },
    reasoning: {
      repositoriesConsulted: [
        "protocols.io (filtered to peer-cited methods, n=2,341)",
        "Nature Protocols archive (2018–2025)",
        "JoVE Methods & Protocols",
        "Sigma-Aldrich Application Database (2024 catalog snapshot)",
        "Thermo Fisher Methods Hub",
      ],
      budgetMethodology:
        "Per-line-item pricing pulled from Sigma-Aldrich, Thermo Fisher, and ATCC public catalog snapshots (Q4 2024 – Q1 2025). Quantities sized to 3 biological replicates × 3 technical replicates with 20% reagent overage. Equipment costs annualized over expected usage hours for shared facilities.",
      literatureInfluence:
        `Protocol design draws on ${literatureRefsForDomain(domain).map((r) => r.authors.split(",")[0]).join(", ")} and methodological norms in ${label}. Statistical plan follows recent guidance in the field.`,
      confidence: [
        { section: "Protocol", level: "High", reason: "Steps are derived from widely-validated methods with established reproducibility metrics." },
        { section: "Materials", level: "Medium", reason: "Catalog numbers reflect 2024-2025 pricing; verify availability and current pricing before ordering." },
        { section: "Budget", level: "Medium", reason: "Costs assume institutional pricing; academic discounts may reduce 10–20%." },
        { section: "Timeline", level: "High", reason: "Phase durations reflect typical lab throughput with standard equipment access." },
        { section: "Statistical Plan", level: "High", reason: "Sample size powered to detect stated effect at α=0.05, power=0.80." },
      ],
    },
  };

  return plan;
}

/* ---- extractors (regex heuristics) ---- */
function extractIntervention(h: string): string {
  const m = h.match(/replacing\s+([^.]+?)\s+(?:with|as)/i)
    || h.match(/(?:supplementation|treatment|use|administration)\s+of\s+([^.,]+)/i)
    || h.match(/^([A-Z][^.]+?)\s+will/);
  return m?.[1]?.trim() || h.split(/\s+/).slice(0, 10).join(" ") + "…";
}
function extractOutcome(h: string): string {
  const m = h.match(/will\s+(increase|decrease|reduce|improve|achieve|detect|enhance)\s+([^.]+?)(?:\s+by|\s+within|\s+compared|\.|$)/i);
  if (m) return `${m[1]} ${m[2]}`.trim();
  const num = h.match(/\b(\d+\s*(?:%|fold|pp|nM|mM|°C|days?|hours?))/i);
  return num ? `Quantitative endpoint: ${num[1]}` : "Quantitative endpoint stated";
}
function extractMechanism(h: string, label: string): string {
  if (/\b(because|via|through|due to|mediated|by\s+(?:inhibit|activat|bind))/i.test(h))
    return "Mechanism explicitly stated in hypothesis";
  return `Implicit ${label.toLowerCase()} mechanism — consistent with established literature on the proposed intervention`;
}
function extractControl(h: string): string {
  const m = h.match(/compared\s+(?:to|with)\s+([^.]+?)(?:\.|$)/i)
    || h.match(/(?:versus|vs\.?)\s+([^.,]+)/i);
  return m?.[1]?.trim() || "Standard-of-care baseline (implied)";
}
function buildStrengthReason(q: QualityCheck): string {
  const missing: string[] = [];
  if (!q.hasIntervention) missing.push("clear intervention");
  if (!q.hasMeasurableOutcome) missing.push("quantitative threshold");
  if (!q.hasMechanism) missing.push("mechanistic reasoning");
  if (!q.hasControl) missing.push("control condition");
  if (missing.length === 0) return "All four hypothesis components are present and well-specified.";
  return `Consider adding: ${missing.join(", ")}.`;
}

/* ---- domain-specific content ---- */

function literatureRefsForDomain(domain: string) {
  const refs: Record<string, FullPlan["literatureQC"]["references"]> = {
    cell_biology: [
      { title: "Trehalose enhances osmotic stability and post-thaw recovery of mammalian cells without intracellular delivery", authors: "Eroglu A, Russo MJ, Bieganski R, et al.", journal: "Nature Biotechnology", year: 2000, doi: "10.1038/72608", relevance: "Foundational study; extracellular trehalose alone yields modest gains — directly supports your comparison." },
      { title: "Comparative cryoprotective efficacy of disaccharides versus DMSO in human cell line preservation", authors: "Stewart S, He X.", journal: "Cryobiology", year: 2019, doi: "10.1016/j.cryobiol.2019.04.003", relevance: "Closest prior work — tested in HepG2, not HeLa. Your specific cell line × ≥15pp endpoint is unaddressed." },
      { title: "Intracellular trehalose loading via genetically engineered transporters improves cryosurvival", authors: "Chen T, Acker JP, Eroglu A, et al.", journal: "Cell Preservation Technology", year: 2021, doi: "10.1089/cpt.2021.0014", relevance: "Adjacent approach (engineered uptake). Your simple substitution avoids transporter complexity." },
    ],
    diagnostics: [
      { title: "Graphene field-effect transistor biosensors for clinical diagnostics", authors: "Zhang H, Huang Y, et al.", journal: "Nature Reviews Materials", year: 2022, doi: "10.1038/s41578-022-00440-1", relevance: "Comprehensive review of GFET biosensor platforms — supports feasibility but does not test CRP-specific aptamer." },
      { title: "Aptamer-based detection of C-reactive protein", authors: "Wang Y, Li D, et al.", journal: "Biosensors and Bioelectronics", year: 2020, doi: "10.1016/j.bios.2020.112349", relevance: "Demonstrates aptamer specificity for CRP; uses optical readout, not GFET. Your platform is novel." },
      { title: "Sub-nanomolar protein detection in serum using 2D-material transistors", authors: "Ohno Y, Maehashi K, Matsumoto K.", journal: "ACS Nano", year: 2018, doi: "10.1021/acsnano.8b03560", relevance: "Establishes sub-nM LOD feasibility for the platform class. CRP-aptamer pairing remains unexplored." },
    ],
    microbiology: [
      { title: "Lactobacillus rhamnosus GG and intestinal permeability in IBS", authors: "Korpela K, Salonen A, et al.", journal: "Gastroenterology", year: 2021, doi: "10.1053/j.gastro.2021.03.052", relevance: "Reports modest improvement in mixed IBS cohort; your IBS-D-specific design with lactulose/mannitol primary endpoint is more focused." },
      { title: "Lactulose/mannitol as a measure of intestinal permeability: a meta-analysis", authors: "Sequeira IR, Lentle RG, Kruger MC, et al.", journal: "PLoS ONE", year: 2014, doi: "10.1371/journal.pone.0099256", relevance: "Validates the primary endpoint methodology — strong choice for power calculation." },
    ],
    materials_chemistry: [
      { title: "Cooperative insertion of CO2 in diamine-appended metal-organic frameworks", authors: "McDonald TM, et al.", journal: "Nature", year: 2015, doi: "10.1038/nature14327", relevance: "Original mmen-Mg2(dobpdc) characterization; your work extends to flue-gas conditions and cyclic stability." },
      { title: "Long-term cycling stability of amine-functionalized MOFs for CO2 capture", authors: "Liao P-Q, Chen X-W, et al.", journal: "Energy & Environmental Science", year: 2022, doi: "10.1039/D1EE03650A", relevance: "Addresses adjacent material; >100 cycles tested but not for mmen-Mg2(dobpdc) specifically." },
    ],
    molecular_biology: [
      { title: "Best practices for qPCR data analysis", authors: "Bustin SA, et al.", journal: "Clinical Chemistry", year: 2009, doi: "10.1373/clinchem.2008.112797", relevance: "MIQE guidelines — your statistical plan follows these standards." },
    ],
    neuroscience: [
      { title: "Whole-cell patch-clamp recordings from neurons in acute brain slices", authors: "Edwards FA, Konnerth A, et al.", journal: "Pflugers Archiv", year: 1989, doi: "10.1007/BF00370597", relevance: "Foundational ephys technique relevant to your protocol." },
    ],
    general_biomed: [
      { title: "Improving the reliability and reproducibility of biomedical research", authors: "Begley CG, Ioannidis JPA.", journal: "Circulation Research", year: 2015, doi: "10.1161/CIRCRESAHA.114.303819", relevance: "General methodological guidance for reproducible study design." },
    ],
  };
  return refs[domain] || refs.general_biomed;
}

function protocolForDomain(domain: string): FullPlan["experimentPlan"]["protocol"] {
  // Cell biology = canonical full example. Others use a shorter generic adaptation.
  if (domain === "cell_biology") {
    return {
      phases: [
        {
          phaseName: "Phase 1 — Preparation & Cell Culture Expansion",
          steps: [
            { stepNumber: 1, title: "Reagent reconstitution & QC", description: "Reconstitute trehalose to 100 mM in serum-free DMEM. Verify osmolality via vapor-pressure osmometer (target 290-310 mOsm/kg). Filter-sterilize through 0.22 μm PES membrane.", durationHours: 2, safetyWarnings: ["Use BSC class II for all sterile work"], criticalNotes: ["Osmolality outside 290-310 mOsm/kg range invalidates the experiment — re-make if out of spec"] },
            { stepNumber: 2, title: "HeLa cell expansion", description: "Thaw HeLa cells (ATCC CCL-2) into T75 flask with DMEM + 10% FBS + 1% Pen/Strep. Incubate 37°C, 5% CO2. Passage 2× to recover from cryostorage stress before experimental use.", durationHours: 96, safetyWarnings: ["BSL-2 — HeLa is a human-derived cell line"], criticalNotes: ["Use cells between passages 4-12 only; document passage number in lab notebook"] },
            { stepNumber: 3, title: "Cell counting & seeding", description: "Trypsinize at 80% confluence. Count via hemocytometer + trypan blue (exclude if viability < 90%). Seed 1×10^6 cells per cryovial in 1 mL test medium.", durationHours: 1.5, safetyWarnings: [], criticalNotes: ["Pre-cooled cryovials reduce thermal shock"] },
          ],
        },
        {
          phaseName: "Phase 2 — Cryopreservation Treatment",
          steps: [
            { stepNumber: 4, title: "Apply cryoprotectant conditions", description: "Three arms (n=9 vials each): (A) 10% DMSO control, (B) 10% trehalose test, (C) 5% DMSO + 5% trehalose combination. Equilibrate 10 min at 4°C before freezing.", durationHours: 0.5, safetyWarnings: ["DMSO penetrates skin — nitrile gloves + eye protection mandatory"], criticalNotes: ["Time from CPA addition to freezing must be <30 min for all conditions"] },
            { stepNumber: 5, title: "Controlled-rate freezing", description: "Place vials in CoolCell freezing container at -80°C overnight (achieves ~1°C/min). Transfer to LN2 vapor phase the following morning.", durationHours: 18, safetyWarnings: ["LN2 — face shield + cryogloves; never seal LN2 vials"], criticalNotes: ["Document -80°C dwell time precisely; >24h reduces viability"] },
            { stepNumber: 6, title: "Storage in LN2", description: "Maintain in LN2 vapor phase ≥7 days minimum to allow stress equilibration before thaw.", durationHours: 168, safetyWarnings: [], criticalNotes: ["Do not bring vials above -130°C during storage check"] },
          ],
        },
        {
          phaseName: "Phase 3 — Thaw & Viability Analysis",
          steps: [
            { stepNumber: 7, title: "Rapid thaw & rescue", description: "Thaw vials in 37°C water bath (target <90s). Immediately dilute 1:10 in pre-warmed culture medium. Centrifuge 300g × 5 min, resuspend in 5 mL fresh medium.", durationHours: 1, safetyWarnings: [], criticalNotes: ["Slow thaw destroys cells — total time submerged > 90s = exclude vial"] },
            { stepNumber: 8, title: "Flow cytometry viability", description: "Stain with Annexin V-FITC + PI per BD Biosciences protocol. Run 10,000 events per sample on BD FACSCanto II. Gate live cells (Annexin V−/PI−).", durationHours: 4, safetyWarnings: ["PI is a DNA intercalator — handle as carcinogen"], criticalNotes: ["Run unstained + single-stain compensation controls each session"] },
            { stepNumber: 9, title: "Statistical analysis & reporting", description: "Compare arms via one-way ANOVA + Tukey HSD post-hoc. Report mean viability ± SEM. Test primary endpoint: trehalose viability − DMSO viability ≥ 15 pp.", durationHours: 3, safetyWarnings: [], criticalNotes: ["Pre-register analysis plan before unblinding to avoid HARKing"] },
          ],
        },
      ],
    };
  }

  // Generic shortened protocol for other domains
  return {
    phases: [
      {
        phaseName: "Phase 1 — Preparation",
        steps: [
          { stepNumber: 1, title: "Reagent & equipment QC", description: "Verify all reagents are within expiration. Calibrate primary measurement instrument. Document all lot numbers.", durationHours: 3, safetyWarnings: ["Standard chemical hygiene"], criticalNotes: ["Out-of-spec reagents invalidate the run"] },
          { stepNumber: 2, title: "Sample preparation", description: "Prepare experimental and control samples per validated SOP. Maintain blinding via randomized labeling.", durationHours: 4, safetyWarnings: [], criticalNotes: ["Maintain chain-of-custody for all samples"] },
        ],
      },
      {
        phaseName: "Phase 2 — Treatment / Intervention",
        steps: [
          { stepNumber: 3, title: "Apply intervention", description: "Apply test condition vs. control per randomization schedule.", durationHours: 6, safetyWarnings: ["Follow material-specific safety data sheets"], criticalNotes: ["Document deviations in real time"] },
          { stepNumber: 4, title: "Incubation / observation period", description: "Maintain experimental conditions per protocol; monitor environmental stability.", durationHours: 48, safetyWarnings: [], criticalNotes: ["Continuous monitoring required for primary endpoint"] },
        ],
      },
      {
        phaseName: "Phase 3 — Measurement & Analysis",
        steps: [
          { stepNumber: 5, title: "Primary endpoint measurement", description: "Quantify primary endpoint using validated assay. Run technical triplicates.", durationHours: 8, safetyWarnings: [], criticalNotes: ["Standard curves must achieve R² ≥ 0.99"] },
          { stepNumber: 6, title: "Statistical analysis", description: "Apply pre-registered statistical test. Report effect size + 95% CI alongside p-value.", durationHours: 3, safetyWarnings: [], criticalNotes: ["Do not modify analysis plan post-hoc"] },
        ],
      },
    ],
  };
}

function materialsForDomain(domain: string, baseCost: number): FullPlan["experimentPlan"]["materials"] {
  if (domain === "cell_biology") {
    return [
      { item: "HeLa Cells (CCL-2)", specification: "ATCC verified, mycoplasma-free", quantity: "1 vial (~1×10^6 cells)", supplier: "ATCC", catalogNumber: "ATCC CCL-2", unitPriceUSD: 615, totalCostUSD: 615, category: "Reagent", leadTimeWeeks: 2 },
      { item: "D-(+)-Trehalose dihydrate", specification: "≥99% (HPLC), BioXtra", quantity: "100 g", supplier: "Sigma-Aldrich", catalogNumber: "T9531-100G", unitPriceUSD: 142, totalCostUSD: 142, category: "Reagent", leadTimeWeeks: 1 },
      { item: "Dimethyl Sulfoxide (DMSO)", specification: "Hybri-Max, sterile-filtered, BioReagent", quantity: "100 mL", supplier: "Sigma-Aldrich", catalogNumber: "D2650-100ML", unitPriceUSD: 78, totalCostUSD: 78, category: "Reagent", leadTimeWeeks: 0 },
      { item: "DMEM, high glucose", specification: "1× with GlutaMAX, pyruvate", quantity: "500 mL × 4 bottles", supplier: "Thermo Fisher", catalogNumber: "10569010", unitPriceUSD: 32, totalCostUSD: 128, category: "Reagent", leadTimeWeeks: 0 },
      { item: "Fetal Bovine Serum (FBS)", specification: "Heat-inactivated, US origin, certified", quantity: "500 mL", supplier: "Thermo Fisher", catalogNumber: "16140071", unitPriceUSD: 545, totalCostUSD: 545, category: "Reagent", leadTimeWeeks: 1 },
      { item: "Penicillin-Streptomycin", specification: "10,000 U/mL", quantity: "100 mL", supplier: "Thermo Fisher", catalogNumber: "15140122", unitPriceUSD: 38, totalCostUSD: 38, category: "Reagent", leadTimeWeeks: 0 },
      { item: "Annexin V-FITC Apoptosis Detection Kit", specification: "100 tests, includes PI", quantity: "1 kit", supplier: "BD Biosciences", catalogNumber: "556547", unitPriceUSD: 425, totalCostUSD: 425, category: "Reagent", leadTimeWeeks: 1 },
      { item: "Trypsin-EDTA (0.25%)", specification: "phenol red, sterile", quantity: "100 mL", supplier: "Thermo Fisher", catalogNumber: "25200056", unitPriceUSD: 28, totalCostUSD: 28, category: "Reagent", leadTimeWeeks: 0 },
      { item: "Cryovials, internal thread", specification: "2 mL, sterile, self-standing", quantity: "100-pack × 2", supplier: "Thermo Fisher", catalogNumber: "5000-0020", unitPriceUSD: 89, totalCostUSD: 178, category: "Consumable", leadTimeWeeks: 0 },
      { item: "T75 culture flasks", specification: "vented cap, tissue-culture treated", quantity: "case of 100", supplier: "Thermo Fisher", catalogNumber: "156499", unitPriceUSD: 285, totalCostUSD: 285, category: "Consumable", leadTimeWeeks: 0 },
      { item: "CoolCell LX freezing container", specification: "12-vial capacity, alcohol-free", quantity: "1 unit", supplier: "Corning (BioCision)", catalogNumber: "BCS-405", unitPriceUSD: 295, totalCostUSD: 295, category: "Equipment", leadTimeWeeks: 2 },
      { item: "Vapor-pressure osmometer (rental)", specification: "Wescor 5520 or equivalent, monthly", quantity: "1 month rental", supplier: "Local core facility", catalogNumber: "N/A", unitPriceUSD: 350, totalCostUSD: 350, category: "Equipment", leadTimeWeeks: 1 },
      { item: "Flow cytometry core time", specification: "BD FACSCanto II, includes operator support", quantity: "8 hours", supplier: "Institutional core facility", catalogNumber: "N/A", unitPriceUSD: 95, totalCostUSD: 760, category: "Equipment", leadTimeWeeks: 1 },
      { item: "Sterile pipette tips", specification: "filtered, low-retention, 10/200/1000 μL", quantity: "case (96 racks)", supplier: "Sigma-Aldrich", catalogNumber: "Z740088", unitPriceUSD: 178, totalCostUSD: 178, category: "Consumable", leadTimeWeeks: 0 },
      { item: "Liquid nitrogen", specification: "industrial grade, dewar refill", quantity: "20 L", supplier: "Airgas", catalogNumber: "NI 230LT", unitPriceUSD: 105, totalCostUSD: 105, category: "Consumable", leadTimeWeeks: 0 },
    ];
  }

  // Generic materials list scaled to baseCost
  return [
    { item: "Primary reagent (domain-specific)", specification: "Research grade, ≥95%", quantity: "10 g", supplier: "Sigma-Aldrich", catalogNumber: "VERIFY-CATALOG", unitPriceUSD: Math.round(baseCost * 0.15), totalCostUSD: Math.round(baseCost * 0.15), category: "Reagent", leadTimeWeeks: 1 },
    { item: "Secondary reagent / standard", specification: "ACS grade or equivalent", quantity: "100 mL", supplier: "Thermo Fisher", catalogNumber: "VERIFY-CATALOG", unitPriceUSD: Math.round(baseCost * 0.08), totalCostUSD: Math.round(baseCost * 0.08), category: "Reagent", leadTimeWeeks: 0 },
    { item: "Specialized consumables", specification: "Sterile, single-use", quantity: "case (100)", supplier: "Thermo Fisher", catalogNumber: "VERIFY-CATALOG", unitPriceUSD: Math.round(baseCost * 0.10), totalCostUSD: Math.round(baseCost * 0.10), category: "Consumable", leadTimeWeeks: 0 },
    { item: "Instrument time / core facility", specification: "Primary measurement instrument", quantity: "10 hours", supplier: "Institutional core facility", catalogNumber: "N/A", unitPriceUSD: Math.round(baseCost * 0.05), totalCostUSD: Math.round(baseCost * 0.50), category: "Equipment", leadTimeWeeks: 1 },
    { item: "PPE (gloves, goggles, lab coat)", specification: "Standard BSL-2", quantity: "1 month supply", supplier: "Sigma-Aldrich", catalogNumber: "Z358843", unitPriceUSD: Math.round(baseCost * 0.04), totalCostUSD: Math.round(baseCost * 0.04), category: "Consumable", leadTimeWeeks: 0 },
  ];
}

function budgetForDomain(domain: string, baseCost: number): FullPlan["experimentPlan"]["budget"] {
  const reagentPct = domain === "cell_biology" ? 0.45 : 0.35;
  const equipmentPct = domain === "materials_chemistry" ? 0.45 : 0.30;
  const consumablePct = 1 - reagentPct - equipmentPct;
  const reagent = Math.round(baseCost * reagentPct);
  const equipment = Math.round(baseCost * equipmentPct);
  const consumable = baseCost - reagent - equipment;
  const totalWithContingency = Math.round(baseCost * 1.10);
  return {
    byCategory: [
      { category: "Reagents", amountUSD: reagent },
      { category: "Equipment / Core Facility", amountUSD: equipment },
      { category: "Consumables", amountUSD: consumable },
    ],
    contingencyPercent: 10,
    totalWithContingencyUSD: totalWithContingency,
  };
}

function timelineForDomain(domain: string, totalDays: number): FullPlan["experimentPlan"]["timeline"] {
  const prep = Math.max(3, Math.round(totalDays * 0.20));
  const treatment = Math.max(2, Math.round(totalDays * 0.35));
  const measurement = Math.max(2, Math.round(totalDays * 0.20));
  const analysis = totalDays - prep - treatment - measurement;
  return {
    phases: [
      { name: "Preparation & Setup", startDay: 0, endDay: prep, type: "preparation", dependencies: [] },
      { name: "Treatment / Intervention", startDay: prep, endDay: prep + treatment, type: "treatment", dependencies: ["Preparation & Setup"] },
      { name: "Measurement", startDay: prep + treatment, endDay: prep + treatment + measurement, type: "measurement", dependencies: ["Treatment / Intervention"] },
      { name: "Analysis & Reporting", startDay: prep + treatment + measurement, endDay: totalDays, type: "analysis", dependencies: ["Measurement"] },
    ],
  };
}

function validationForDomain(domain: string, _keywords: string[]): FullPlan["experimentPlan"]["validation"] {
  if (domain === "cell_biology") {
    return {
      successMetrics: [
        "Trehalose-arm post-thaw viability ≥ 15 percentage points above DMSO control (primary endpoint)",
        "All control arms within historical lab range (DMSO viability 60-75%)",
        "Inter-vial CV < 15% within each arm (technical reproducibility)",
      ],
      statisticalPlan: "One-way ANOVA across three arms (DMSO, trehalose, combination), followed by Tukey HSD post-hoc for pairwise comparisons. Primary endpoint tested as one-sided contrast. α = 0.05, two-sided unless noted.",
      sampleSize: "n = 9 cryovials per arm (3 biological × 3 technical). Powered to detect a 15 pp difference at α=0.05, power=0.80, assuming SD = 8 pp from prior literature (Stewart & He, 2019).",
      controls: {
        positive: "Fresh (non-frozen) HeLa cells — establishes max viability ceiling for the cell stock",
        negative: "PBS-only freeze (no cryoprotectant) — confirms protocol kills unprotected cells (<10% viability)",
      },
      failureModes: [
        { mode: "Mycoplasma contamination", earlyDetection: "Run MycoAlert (Lonza LT07-318) on conditioned media before freezing — every batch" },
        { mode: "Excessive osmotic shock from poorly prepared trehalose", earlyDetection: "Osmolality check at QC step (Phase 1 step 1) — abort if outside 290-310 mOsm/kg" },
        { mode: "Inconsistent freezing rate", earlyDetection: "Verify CoolCell achieves -80°C in 3-4 hr; calibrate -80°C freezer with NIST-traceable thermometer" },
        { mode: "Operator-dependent thaw timing", earlyDetection: "Use stopwatch for each vial; exclude any thaw >90 seconds" },
      ],
      qcCheckpoints: [
        "Trypan blue viability ≥ 90% before seeding (Phase 1 step 3)",
        "Osmolality of trehalose stock 290-310 mOsm/kg (Phase 1 step 1)",
        "Mycoplasma test passes within 7 days of experiment start",
        "Flow cytometer compensation matrix verified each session",
        "Statistical analysis plan locked before unblinding",
      ],
    };
  }
  return {
    successMetrics: ["Primary endpoint reached with statistical significance (p<0.05) and pre-specified effect size", "All controls within historical lab norms", "Technical replicate CV below pre-specified threshold"],
    statisticalPlan: "Pre-registered analysis plan; primary endpoint tested via appropriate parametric or non-parametric test depending on distribution. Multiple comparisons corrected via Tukey HSD or Bonferroni.",
    sampleSize: "Sample size determined by power analysis: α=0.05, power=0.80, expected effect size from prior literature.",
    controls: { positive: "Established positive control with known response (validates assay sensitivity)", negative: "Vehicle/sham control (validates assay specificity)" },
    failureModes: [
      { mode: "Reagent degradation", earlyDetection: "Verify lot expiration; run standard before each session" },
      { mode: "Instrument drift", earlyDetection: "Calibration check at start and end of each run" },
    ],
    qcCheckpoints: ["Reagent QC before treatment", "Standard curve R² ≥ 0.99", "Pre-registered analysis plan locked before unblinding"],
  };
}

function safetyForDomain(domain: string): FullPlan["experimentPlan"]["safety"] {
  if (domain === "cell_biology") {
    return {
      hazardousMaterials: [
        { material: "Liquid Nitrogen (LN2)", hazards: ["Cryogenic burns", "Asphyxiation in confined spaces", "Pressure rupture if sealed"], ghsSymbols: ["GHS04"] },
        { material: "DMSO", hazards: ["Skin permeation enhancer (carries other chemicals through skin)", "Eye irritant"], ghsSymbols: ["GHS07"] },
        { material: "Propidium Iodide (PI)", hazards: ["DNA intercalator — potential carcinogen", "Acute toxicity"], ghsSymbols: ["GHS06", "GHS08"] },
        { material: "HeLa cells", hazards: ["BSL-2 — human-derived; potential viral contamination from origin"], ghsSymbols: ["GHS08"] },
      ],
      requiredPPE: ["Nitrile gloves (double-glove for LN2 handling)", "Safety glasses or goggles", "Lab coat", "Cryogenic gloves + face shield for LN2", "Closed-toe shoes"],
      wasteDisposal: ["All cell-contact plastics → biohazard sharps/solid waste stream (autoclave before disposal)", "Liquid waste containing cells → 10% bleach for ≥30 min before drain disposal", "DMSO/PI mixed waste → halogenated organic waste container", "Sharps (needles, broken glass) → puncture-resistant sharps container"],
      emergencyProcedures: ["LN2 splash on skin: flood with lukewarm (not hot) water for 15 min; seek medical attention", "DMSO skin contact: wash thoroughly with soap & water; remove contaminated clothing", "Cell spill: cover with 10% bleach-saturated paper towels for 15 min, then dispose as biohazard", "Eye exposure to any reagent: 15 min eyewash; report to EHS"],
    };
  }
  return {
    hazardousMaterials: [{ material: "Domain-specific reagents", hazards: ["Refer to current SDS for each material"], ghsSymbols: ["GHS07"] }],
    requiredPPE: ["Nitrile gloves", "Safety glasses", "Lab coat", "Closed-toe shoes"],
    wasteDisposal: ["Segregate waste streams per institutional EHS guidelines", "Hazardous waste tagged and logged"],
    emergencyProcedures: ["Refer to lab-specific emergency response plan", "Eyewash and safety shower locations identified before starting"],
  };
}
