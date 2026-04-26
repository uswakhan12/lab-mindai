import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, "..", "data");
const dbPath = path.resolve(dataDir, "labmind.sqlite");

let dbPromise = null;

async function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      await mkdir(dataDir, { recursive: true });
      const db = await open({
        filename: dbPath,
        driver: sqlite3.Database,
      });
      await db.exec(`
        CREATE TABLE IF NOT EXISTS reviews (
          id TEXT PRIMARY KEY,
          created_at TEXT NOT NULL,
          hypothesis TEXT NOT NULL,
          domain TEXT NOT NULL,
          reviewer_expertise TEXT,
          overall_rating REAL,
          payload_json TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_reviews_domain_created
        ON reviews(domain, created_at DESC);
      `);
      return db;
    })();
  }
  return dbPromise;
}

export async function saveReviewRecord(review) {
  const db = await getDb();
  await db.run(
    `INSERT OR REPLACE INTO reviews
      (id, created_at, hypothesis, domain, reviewer_expertise, overall_rating, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    review.id,
    review.timestamp,
    review.hypothesis,
    review.domain,
    review.reviewerExpertise || "",
    Number(review.overallRating || 0),
    JSON.stringify(review),
  );
}

export async function getReviewsByDomain(domain, limit = 50) {
  const db = await getDb();
  const rows = await db.all(
    `SELECT payload_json
     FROM reviews
     WHERE domain = ?
     ORDER BY created_at DESC
     LIMIT ?`,
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

export async function getRecentReviews(limit = 100) {
  const db = await getDb();
  const rows = await db.all(
    `SELECT payload_json
     FROM reviews
     ORDER BY created_at DESC
     LIMIT ?`,
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
