/**
 * Optional OpenAI text-embedding similarity for novelty reranking
 * (semantic paraphrase overlap beyond trigrams).
 */

function dot(a, b) {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

export function cosineSimilarityVectors(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0) return 0;
  const d = dot(a, b);
  const na = Math.sqrt(dot(a, a));
  const nb = Math.sqrt(dot(b, b));
  if (na === 0 || nb === 0) return 0;
  return Math.max(-1, Math.min(1, d / (na * nb)));
}

/**
 * @param {string} hypothesis
 * @param {Array<{ title?: string, relevance?: string }>} references
 * @returns {Promise<number[] | null>} cosine similarity per reference vs hypothesis, or null if skipped / failed
 */
export async function computeHypothesisReferenceEmbeddingCosines(hypothesis, references) {
  const key = process.env.OPENAI_API_KEY?.trim();
  const refs = Array.isArray(references) ? references : [];
  if (!key || refs.length === 0) return null;

  const model = process.env.OPENAI_EMBEDDING_MODEL?.trim() || "text-embedding-3-small";
  const inputs = [
    String(hypothesis || "").slice(0, 8000),
    ...refs.map((r) => `${r?.title || ""} ${r?.relevance || ""}`.trim().slice(0, 8000)),
  ];

  try {
    const resp = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, input: inputs }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const list = Array.isArray(data?.data) ? data.data : [];
    if (list.length !== inputs.length) return null;
    list.sort((x, y) => (x.index ?? 0) - (y.index ?? 0));
    const vectors = list.map((row) => row.embedding).filter((v) => Array.isArray(v));
    if (vectors.length !== inputs.length) return null;
    const h = vectors[0];
    const out = [];
    for (let i = 1; i < vectors.length; i++) {
      out.push(Math.round(cosineSimilarityVectors(h, vectors[i]) * 1000) / 1000);
    }
    return out.length === refs.length ? out : null;
  } catch {
    return null;
  }
}
