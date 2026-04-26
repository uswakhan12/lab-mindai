// localStorage helpers for plan history and scientist reviews.
// All functions are SSR-safe (return defaults when window is undefined).

import type { FullPlan } from "@/types/plan";
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8080";

/** Headers for secured backend routes (LABMIND_API_KEY) and multi-tenant isolation. */
export function labmindApiHeaders(json = true): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h["Content-Type"] = "application/json";
  const key = import.meta.env.VITE_LABMIND_API_KEY as string | undefined;
  if (key) h.Authorization = `Bearer ${key}`;
  const tenant = import.meta.env.VITE_LABMIND_TENANT_ID as string | undefined;
  if (tenant) h["x-tenant-id"] = tenant;
  return h;
}

const HISTORY_KEY = "labmind:history:v1";
const REVIEWS_KEY = "labmind:reviews:v1";
const MAX_HISTORY = 5;

const isBrowser = () => typeof window !== "undefined";

/* -------------------- History -------------------- */

export interface HistoryEntry {
  id: string;
  hypothesis: string;
  timestamp: string; // ISO
  totalCostUSD: number;
  totalDurationDays: number;
  domain: string;
  title: string;
}

export function getHistory(): HistoryEntry[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HistoryEntry[];
  } catch {
    return [];
  }
}

export function addToHistory(hypothesis: string, plan: FullPlan): HistoryEntry {
  const entry: HistoryEntry = {
    id: cryptoRandomId(),
    hypothesis,
    timestamp: new Date().toISOString(),
    totalCostUSD: plan.experimentPlan.totalCostUSD,
    totalDurationDays: plan.experimentPlan.totalDurationDays,
    domain: plan.domain,
    title: plan.experimentPlan.title,
  };
  if (!isBrowser()) return entry;
  const existing = getHistory().filter((h) => h.hypothesis !== hypothesis);
  const next = [entry, ...existing].slice(0, MAX_HISTORY);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota errors */
  }
  return entry;
}

export function clearHistory(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(HISTORY_KEY);
}

/* -------------------- Reviews -------------------- */

export type ReviewSection = "protocol" | "materials" | "budget" | "timeline" | "validation";

export interface Review {
  id: string;
  timestamp: string;
  hypothesis: string;
  domain: string;
  hypothesisKeywords: string[];
  ratings: Record<ReviewSection, number>;
  issues: Record<ReviewSection, string>;
  corrections: Record<ReviewSection, string>;
  overallRating: number;
  reviewerExpertise: string;
  originalPlanSummary: string;
}

export function getReviews(): Review[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(REVIEWS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Review[];
  } catch {
    return [];
  }
}

export function saveReview(review: Review): void {
  if (!isBrowser()) return;
  const all = getReviews();
  all.unshift(review);
  try {
    localStorage.setItem(REVIEWS_KEY, JSON.stringify(all.slice(0, 200)));
  } catch {
    /* ignore */
  }
}

export async function saveReviewToBackend(review: Review): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/reviews`, {
    method: "POST",
    headers: labmindApiHeaders(),
    body: JSON.stringify(review),
  });
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || "Failed to save review to backend.");
  }
}

export function getReviewsForDomain(domain: string): Review[] {
  return getReviews().filter((r) => r.domain === domain);
}

export async function fetchReviewsForDomain(domain: string, limit = 20): Promise<Review[]> {
  const params = new URLSearchParams({ domain, limit: String(limit) });
  const res = await fetch(`${BACKEND_URL}/api/reviews?${params.toString()}`, {
    headers: labmindApiHeaders(false),
  });
  if (!res.ok) return [];
  const payload = (await res.json().catch(() => ({}))) as { reviews?: Review[] };
  return Array.isArray(payload.reviews) ? payload.reviews : [];
}

export function clearReviews(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(REVIEWS_KEY);
}

/** Build a "few-shot" feedback summary string for the same domain. */
export function buildFeedbackContext(domain: string): string | null {
  const prior = getReviewsForDomain(domain);
  if (prior.length === 0) return null;
  const corrections: string[] = [];
  for (const r of prior.slice(0, 5)) {
    for (const section of [
      "protocol",
      "materials",
      "budget",
      "timeline",
      "validation",
    ] as ReviewSection[]) {
      if (r.corrections[section]?.trim()) {
        corrections.push(`- [${section}] ${r.corrections[section].trim()}`);
      }
    }
  }
  if (corrections.length === 0) return null;
  return [
    `Previous scientist feedback for ${prior.length} similar experiment(s) in this domain:`,
    ...corrections.slice(0, 10),
    "Use this feedback to improve your plan for similar experiment types.",
  ].join("\n");
}

/* -------------------- Utilities -------------------- */

export function cryptoRandomId(): string {
  if (isBrowser() && typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Encode hypothesis as URL-safe base64 for shareable links. */
export function encodeHypothesis(h: string): string {
  if (typeof btoa !== "undefined") {
    return btoa(unescape(encodeURIComponent(h)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }
  return encodeURIComponent(h);
}

export function decodeHypothesis(b64: string): string {
  try {
    if (typeof atob !== "undefined") {
      const padded = b64.replace(/-/g, "+").replace(/_/g, "/");
      const padding = "=".repeat((4 - (padded.length % 4)) % 4);
      return decodeURIComponent(escape(atob(padded + padding)));
    }
  } catch {
    /* fall through */
  }
  return decodeURIComponent(b64);
}
