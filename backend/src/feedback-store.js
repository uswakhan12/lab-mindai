import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import pg from "pg";
import { buildKeywordSignature, inferOntologyTags, similarityScore } from "./ontology-similarity.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, "..", "data");
const dbPath = path.resolve(dataDir, "labmind.sqlite");

let mode = "sqlite";
let sqliteDbPromise = null;
let pgPool = null;

function usePostgres() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

async function getSqlite() {
  if (!sqliteDbPromise) {
    sqliteDbPromise = (async () => {
      await mkdir(dataDir, { recursive: true });
      const db = await open({
        filename: dbPath,
        driver: sqlite3.Database,
      });
      await db.exec(`
        CREATE TABLE IF NOT EXISTS reviews (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL DEFAULT 'default',
          created_at TEXT NOT NULL,
          hypothesis TEXT NOT NULL,
          domain TEXT NOT NULL,
          ontology_tags TEXT NOT NULL DEFAULT '[]',
          keyword_signature TEXT NOT NULL DEFAULT '{}',
          reviewer_expertise TEXT,
          overall_rating REAL,
          payload_json TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_reviews_domain_created
        ON reviews(domain, created_at DESC);
      `);
      const cols = await db.all(`PRAGMA table_info(reviews)`);
      const names = new Set(cols.map((c) => c.name));
      if (!names.has("tenant_id")) {
        await db.run(`ALTER TABLE reviews ADD COLUMN tenant_id TEXT DEFAULT 'default'`);
      }
      if (!names.has("ontology_tags")) {
        await db.run(`ALTER TABLE reviews ADD COLUMN ontology_tags TEXT DEFAULT '[]'`);
      }
      if (!names.has("keyword_signature")) {
        await db.run(`ALTER TABLE reviews ADD COLUMN keyword_signature TEXT DEFAULT '{}'`);
      }
      try {
        await db.exec(
          `CREATE INDEX IF NOT EXISTS idx_reviews_tenant_created ON reviews(tenant_id, created_at DESC)`,
        );
      } catch {
        /* ignore if index exists or legacy DB */
      }
      return db;
    })();
  }
  return sqliteDbPromise;
}

function getPool() {
  if (!pgPool) {
    pgPool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  }
  return pgPool;
}

async function ensurePostgresSchema() {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS labmind_reviews (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'default',
      created_at TIMESTAMPTZ NOT NULL,
      hypothesis TEXT NOT NULL,
      domain TEXT NOT NULL,
      ontology_tags JSONB NOT NULL DEFAULT '[]',
      keyword_signature JSONB NOT NULL DEFAULT '{}',
      reviewer_expertise TEXT,
      overall_rating DOUBLE PRECISION,
      payload_json JSONB NOT NULL
    );
    CREATE INDEX IF NOT EXISTS labmind_reviews_tenant_created
      ON labmind_reviews (tenant_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS labmind_reviews_tenant_domain
      ON labmind_reviews (tenant_id, domain);
  `);
}

export async function initFeedbackStore() {
  if (usePostgres()) {
    mode = "postgres";
    await ensurePostgresSchema();
    return { mode: "postgres" };
  }
  mode = "sqlite";
  await getSqlite();
  return { mode: "sqlite" };
}

function metaFromReview(review) {
  const hypothesis = review.hypothesis || "";
  const ontologyTags = inferOntologyTags(hypothesis);
  const keywordSignature = buildKeywordSignature(hypothesis);
  return { ontologyTags, keywordSignature: JSON.stringify(keywordSignature) };
}

export async function saveReviewRecord(review, { tenantId = "default" } = {}) {
  const { ontologyTags, keywordSignature } = metaFromReview(review);
  if (mode === "postgres" || usePostgres()) {
    await ensurePostgresSchema();
    const pool = getPool();
    await pool.query(
      `INSERT INTO labmind_reviews
        (id, tenant_id, created_at, hypothesis, domain, ontology_tags, keyword_signature, reviewer_expertise, overall_rating, payload_json)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         tenant_id = EXCLUDED.tenant_id,
         created_at = EXCLUDED.created_at,
         hypothesis = EXCLUDED.hypothesis,
         domain = EXCLUDED.domain,
         ontology_tags = EXCLUDED.ontology_tags,
         keyword_signature = EXCLUDED.keyword_signature,
         reviewer_expertise = EXCLUDED.reviewer_expertise,
         overall_rating = EXCLUDED.overall_rating,
         payload_json = EXCLUDED.payload_json`,
      [
        review.id,
        tenantId,
        review.timestamp,
        review.hypothesis,
        review.domain,
        JSON.stringify(ontologyTags),
        keywordSignature,
        review.reviewerExpertise || "",
        Number(review.overallRating || 0),
        JSON.stringify(review),
      ],
    );
    return;
  }
  const db = await getSqlite();
  await db.run(
    `INSERT OR REPLACE INTO reviews
      (id, tenant_id, created_at, hypothesis, domain, ontology_tags, keyword_signature, reviewer_expertise, overall_rating, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    review.id,
    tenantId,
    review.timestamp,
    review.hypothesis,
    review.domain,
    JSON.stringify(ontologyTags),
    keywordSignature,
    review.reviewerExpertise || "",
    Number(review.overallRating || 0),
    JSON.stringify(review),
  );
}

export async function getReviewsByDomain(tenantId, domain, limit = 50) {
  if (mode === "postgres" || usePostgres()) {
    await ensurePostgresSchema();
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT payload_json FROM labmind_reviews WHERE tenant_id = $1 AND domain = $2 ORDER BY created_at DESC LIMIT $3`,
      [tenantId, domain, limit],
    );
    return rows.map((r) => r.payload_json).filter(Boolean);
  }
  const db = await getSqlite();
  const rows = await db.all(
    `SELECT payload_json FROM reviews WHERE tenant_id = ? AND domain = ? ORDER BY created_at DESC LIMIT ?`,
    tenantId,
    domain,
    limit,
  );
  return rows
    .map((r) => {
      try {
        return JSON.parse(r.payload_json);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export async function getRecentReviews(tenantId, limit = 100) {
  if (mode === "postgres" || usePostgres()) {
    await ensurePostgresSchema();
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT payload_json FROM labmind_reviews WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [tenantId, limit],
    );
    return rows.map((r) => r.payload_json).filter(Boolean);
  }
  const db = await getSqlite();
  const rows = await db.all(
    `SELECT payload_json FROM reviews WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?`,
    tenantId,
    limit,
  );
  return rows
    .map((r) => {
      try {
        return JSON.parse(r.payload_json);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export async function findSimilarReviews({
  tenantId = "default",
  hypothesis,
  domain,
  limit = 12,
  candidatePool = 120,
}) {
  const ontologyTags = inferOntologyTags(hypothesis);
  const signature = buildKeywordSignature(hypothesis);
  const queryCtx = { domain, ontologyTags, signature };

  let rows = [];
  if (mode === "postgres" || usePostgres()) {
    await ensurePostgresSchema();
    const pool = getPool();
    const { rows: r } = await pool.query(
      `SELECT hypothesis, domain, ontology_tags, keyword_signature, payload_json, created_at
       FROM labmind_reviews
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [tenantId, candidatePool],
    );
    rows = r;
  } else {
    const db = await getSqlite();
    rows = await db.all(
      `SELECT hypothesis, domain, ontology_tags, keyword_signature, payload_json, created_at
       FROM reviews
       WHERE tenant_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      tenantId,
      candidatePool,
    );
  }

  const scored = rows
    .map((row) => {
      let tags = [];
      try {
        tags = typeof row.ontology_tags === "string" ? JSON.parse(row.ontology_tags) : row.ontology_tags;
      } catch {
        tags = [];
      }
      const score = similarityScore(queryCtx, {
        domain: row.domain,
        ontologyTags: tags,
        keywordSignature: row.keyword_signature,
      });
      let payload = row.payload_json;
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch {
          payload = null;
        }
      }
      return { score, payload };
    })
    .filter((x) => x.payload)
    .sort((a, b) => b.score - a.score);

  const seen = new Set();
  const out = [];
  for (const item of scored) {
    const id = item.payload.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ ...item.payload, __similarityScore: Math.round(item.score * 1000) / 1000 });
    if (out.length >= limit) break;
  }
  return { reviews: out, ontologyTags, matchMethod: "ontology_tags + keyword_cosine + domain" };
}
