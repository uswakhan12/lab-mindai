/**
 * Ontology tags + sparse keyword signatures for "similar experiment type" retrieval
 * without external embedding APIs (hackathon-friendly, deterministic).
 */

const ONTOLOGY_RULES = [
  { id: "assay_immuno", patterns: [/\b(elisa|crp|antibody|biosensor|immunoassay)\b/i] },
  { id: "model_rodent", patterns: [/\b(c57|mouse|mice|rat|rodent|in vivo)\b/i] },
  { id: "microbiome_gut", patterns: [/\b(lactobacillus|probiotic|gut|intestinal|microbiome)\b/i] },
  { id: "cell_culture", patterns: [/\b(hela|cell line|cryoprotect|cryo|dmso|trehalose|thaw|culture)\b/i] },
  { id: "electrochem", patterns: [/\b(electrochemical|cathode|anode|bioelectrochemical|potentiostat)\b/i] },
  { id: "metabolite_co2", patterns: [/\b(co2|acetate|fixation|sporomusa|fermentation)\b/i] },
  { id: "clinical_human", patterns: [/\b(human subjects|patient|clinical trial|irb)\b/i] },
  { id: "molecular_qpcr", patterns: [/\b(qpcr|pcr|primer|rt-pcr|miqe)\b/i] },
];

const STOP = new Set([
  "the", "and", "for", "with", "from", "that", "this", "will", "into", "than", "least", "compared", "controls",
  "due", "within", "without", "using", "based", "between", "such", "each", "other", "have", "been", "were",
]);

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9%/.\-]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

export function inferOntologyTags(text) {
  const t = String(text || "");
  const tags = new Set();
  for (const rule of ONTOLOGY_RULES) {
    if (rule.patterns.some((re) => re.test(t))) tags.add(rule.id);
  }
  if (tags.size === 0) tags.add("general_methods");
  return Array.from(tags);
}

export function buildKeywordSignature(text) {
  const tokens = tokenize(text);
  const sig = {};
  for (const w of tokens) {
    sig[w] = (sig[w] || 0) + 1;
  }
  return sig;
}

function cosineSparse(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const k of Object.keys(a)) na += a[k] * a[k];
  for (const k of Object.keys(b)) nb += b[k] * b[k];
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (denom === 0) return 0;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) dot += (a[k] || 0) * (b[k] || 0);
  return dot / denom;
}

function jaccardTags(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function similarityScore({ domain, ontologyTags, signature }, row) {
  const dMatch = row.domain === domain ? 1 : 0.35;
  const tagSim = jaccardTags(ontologyTags, row.ontologyTags || []);
  let sigSim = 0;
  try {
    let rowSig =
      typeof row.keywordSignature === "string" ? JSON.parse(row.keywordSignature) : row.keywordSignature;
    if (!rowSig || typeof rowSig !== "object") rowSig = {};
    sigSim = cosineSparse(signature, rowSig);
  } catch {
    sigSim = 0;
  }
  return 0.25 * dMatch + 0.35 * tagSim + 0.4 * sigSim;
}
