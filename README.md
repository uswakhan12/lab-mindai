<!--
  LabMind AI — consolidated technical & product documentation.
  Generated/expanded from repository source. Prefer verifying behaviour in code
  when this file and implementation diverge.
-->

# LabMind AI

**Turn a scientific hypothesis into an operationally grounded experiment plan.**

[![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=nodedotjs)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-TODO-lightgrey.svg)](#license)
[![Backend](https://img.shields.io/badge/backend-Express-000000?logo=express)](https://expressjs.com/)
[![Frontend](https://img.shields.io/badge/frontend-React%2019-61DAFB?logo=react)](https://react.dev/)

> **Hackathon lineage:** Built around the *AI Scientist* style challenge — compress “hypothesis → runnable lab work” (protocol, materials, budget, timeline, validation) with a literature novelty gate and optional scientist feedback loop.

**Documentation note:** Some authoring prompts ask for extremely long single-file READMEs. This document is **dense and repo-accurate** rather than padded to an arbitrary line count. Split handbooks under `docs/` are **not yet implemented** (TODO).

---

## Table of contents

1. [Overview](#overview)
2. [Problem statement](#problem-statement)
3. [Key innovations](#key-innovations)
4. [Features (from codebase)](#features-from-codebase)
5. [Screenshots & demo](#screenshots--demo)
6. [System architecture](#system-architecture)
7. [Technology stack](#technology-stack)
8. [Repository layout](#repository-layout)
9. [Prerequisites](#prerequisites)
10. [Installation](#installation)
11. [Configuration](#configuration) — includes [scientist-trust contract](#reliability-focused-environment-flags)
12. [Running locally](#running-locally)
13. [Docker & databases](#docker--databases)
14. [Deployment notes](#deployment-notes)
15. [Environment variables](#environment-variables)
16. [API reference](#api-reference)
17. [Authentication & tenancy](#authentication--tenancy)
18. [Database schema](#database-schema)
19. [AI & retrieval pipeline](#ai--retrieval-pipeline)
20. [Experiment plan generation](#experiment-plan-generation)
21. [Quality gates & compliance](#quality-gates--compliance)
22. [UI / UX map](#ui--ux-map)
23. [State & data on the client](#state--data-on-the-client)
24. [Error handling](#error-handling)
25. [Logging & observability](#logging--observability)
26. [Security](#security)
27. [Performance & limits](#performance--limits)
28. [Testing](#testing)
29. [CI/CD](#cicd)
30. [Known limitations](#known-limitations)
31. [Troubleshooting](#troubleshooting)
32. [Roadmap](#roadmap)
33. [Contributing](#contributing)
34. [Code style](#code-style)
35. [License](#license)
36. [Authors & acknowledgements](#authors--acknowledgements)
37. [FAQ](#faq)

---

## Overview

**LabMind AI** is a full-stack web application that guides a researcher (or operator) through three stages:

1. **Hypothesis input** — natural language scientific question with lightweight on-device quality hints.
2. **Literature QC** — fast retrieval plus model validation; novelty signal and references.
3. **Experiment plan** — structured JSON plan: protocol, materials (with grounding), budget, timeline, validation, safety; augmented with verification URLs, automated QC, mechanistic heuristics, execution readiness, and optional incorporation of prior scientist reviews.

**Primary users:** bench scientists, lab leads, CRO scoping staff, hackathon judges, and developers extending the pipeline.

**Why it exists:** operational scoping (what to run, buy, spend, and how long) dominates calendar time more than ideation. LabMind automates the *proposal-shaped* artifact so experts edit rather than invent from zero.

---

## Problem statement

Organisations brief specialist labs to estimate **protocol**, **reagents**, **cost**, **duration**, and **validation**. That work is repetitive, error-prone (e.g. wrong concentration or timeline), and skill-dependent. The challenge is an **AI-powered system that converts scientific questions into operationally realistic experiment plans** a lab could plausibly execute — with a **fast novelty / prior-art signal** before full planning.

---

## Key innovations

| Area | What the repo implements |
|------|---------------------------|
| **Grounded planning** | Retrieval packet (Tavily) injected into planner prompt; per-section Tavily verification + Llama 8B relevance labels. |
| **Governance & procurement gates** | Human/animal/IBC language checks; procurement-critical lines must cite allow-listed URLs under the **scientist-trust** configuration (strict gates on). |
| **Scientist loop** | Reviews stored in SQLite or Postgres; similar reviews merged into planner prompt (`PRIOR SCIENTIST CORRECTIONS`). |
| **Scientist-trust contract** | **`LABMIND_STRICT_PLAN_GATES=1`** so a **200** means gates passed (no silent stubs). **`LABMIND_DUAL_FEEDBACK_AB=1`** so feedback impact is **measured** (shadow plan without priors) whenever priors are merged — not only asserted. |
| **Reasoning contract** | `ensureFullPlanReasoningRoot` normalises `plan.reasoning` for UI and API consumers. |

---

## Features (from codebase)

### Product / science

- Natural-language hypothesis entry with **client-side quality heuristics** (`frontend/src/lib/plan-generator.ts`).
- **Literature QC** via Tavily + mapping + **Llama 8B** validation; novelty `not_found` \| `similar_exists` \| `exact_match`; optional **OpenAI embeddings** for cosine rerank (`embedding-rerank.js`).
- **Novelty diagnostics** beyond a single scalar (`novelty-diagnostics.js`).
- **Full experiment plan JSON** matching `FullPlan` TypeScript type (`frontend/src/types/plan.ts`).
- **Protocol** phases/steps with optional `literatureRefIndex`, `evidenceLinks` (mechanistic pipeline).
- **Materials** with categories, pricing fields, staleness, **grounding** (`sourceUrl`, `evidenceNote`, `confidence`).
- **Budget** by category + contingency; **financial normalisation** to align header with line items (`plan-financial-normalize.js`).
- **Timeline** phased with **dependencies**.
- **Validation** block (metrics, stats plan, sample size, controls, failure modes, QC checkpoints).
- **Safety** (hazards, PPE, waste, emergency).
- **Verification sources** per section (`protocol`, `materials`, `budget`, `timeline`, `validation`, `safety`).
- **Scientific mechanistic validation** (`scientific-mechanistic.js`) exposed in API + UI.
- **Execution readiness** tiering (`execution-readiness.js`).
- **Feedback learning report** (`feedback-learning-report.js`).
- **Dual-feedback A/B shadow** — **permanent part of the trust model** when expert priors are in play: a second planner pass **without** those priors records scores in `feedbackLearningReport` so “learning from reviews” is **auditable** (env `LABMIND_DUAL_FEEDBACK_AB=1` or client `dualFeedbackAb`, with Tavily + Groq + merged feedback present).

### Platform

- **Multi-tenant reviews** via `x-tenant-id` header (default `default`).
- **Optional API key** on protected routes (`LABMIND_API_KEY`).
- **Per-IP rate limiting** (429 with `Retry-After`).
- **Request IDs** on responses and structured request logs.
- **Postgres or SQLite** for reviews.
- **Playwright E2E** (smoke + pipeline) with **mocked** backend in tests.
- **Benchmark script** (`backend/scripts/benchmark.js`) for local judge-style runs.

### Not implemented (TODO)

- **PDF / Word export** of plans (no exporter detected).
- **JWT / OAuth user accounts** (only optional shared API key).
- **Dedicated `docs/` tree** and **GitHub Actions CI** (no workflows in `.github/` at time of writing).
- **Application Dockerfile** (only `docker-compose.yml` for Postgres).

---

## Screenshots & demo

| Asset | Status |
|-------|--------|
| Screenshots / screen recording | **Not checked in** — add under `docs/assets/` or README-linked hosting if required for submission. |

Suggested demo flow for judges: (1) enter one of the four sample hypotheses from the challenge brief, (2) show Literature QC badges and references, (3) expand plan tabs (protocol, materials, budget, timeline), (4) open scientist review, save, (5) run a **similar** second hypothesis and point to `feedbackSummary` / prompt incorporation.

---

## System architecture

### High-level

```mermaid
flowchart LR
  subgraph Client["Browser (Vite + React)"]
    UI["TanStack Router / Start UI"]
    LS["localStorage: history + draft reviews"]
  end
  subgraph API["Node Express :8080"]
    R["Routes + middleware"]
    RL["Rate limit + requestId"]
  end
  subgraph AI["External AI & search"]
    T["Tavily Search"]
    G["Groq Chat (Llama 8B / 70B)"]
    M["Gemini (fallback)"]
    O["OpenAI Embeddings (optional)"]
  end
  subgraph Data["Persistence"]
    S["SQLite labmind.sqlite"]
    P["Postgres labmind_reviews"]
  end
  UI --> R
  R --> RL
  R --> T
  R --> G
  R --> M
  R --> O
  R --> S
  R --> P
  UI --- LS
```

### Experiment-plan sequence (simplified)

```mermaid
sequenceDiagram
  participant U as User
  participant F as Frontend
  participant B as Backend
  participant Tav as Tavily
  participant L8 as Llama 8B
  participant L70 as Llama 70B
  participant Gem as Gemini
  U->>F: POST hypothesis (stage 3)
  F->>B: POST /api/experiment-plan
  B->>Tav: Literature retrieval
  B->>L8: QC / validate refs (literature path)
  opt Outline
    B->>L8: generatePlanOutline
  end
  B->>L70: plan JSON (primary)
  alt Groq failure
    B->>Gem: plan JSON fallback
  end
  B->>Tav: verification sources per section
  B->>L8: validate verification snippets
  B->>B: gates, QC, readiness, feedback merge
  B-->>F: JSON plan + metadata
  F-->>U: Render PlanView
```

---

## Technology stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 19, TypeScript 5, Vite 7, TanStack Router / Start, Tailwind CSS 4, Radix UI, Recharts, Zod, React Hook Form, Lucide icons, Playwright |
| **Backend** | Node.js (ESM), Express 4, `dotenv`, `cors`, `sqlite` / `sqlite3`, `pg` |
| **Database** | SQLite default (`backend/data/labmind.sqlite`); optional Postgres 16 via Docker Compose |
| **AI / search** | Tavily API; Groq OpenAI-compatible chat; Google Gemini REST; optional OpenAI embeddings |
| **DevOps** | `npm` scripts; `docker compose` for local Postgres; **no** checked-in Dockerfile or GitHub Actions |

---

## Repository layout

```text
lab-mindai/
├── README.md                 ← This file
├── docker-compose.yml        ← Optional Postgres
├── frontend/
│   ├── package.json
│   ├── playwright.config.ts
│   ├── vite.config.ts
│   ├── tests/e2e/            ← Playwright specs (mocked APIs)
│   └── src/
│       ├── routes/           ← index, generate, __root
│       ├── components/     ← Hero, Navbar, generate/*, plan/*, ui/*
│       ├── lib/             ← storage, plan-generator, theme, API helpers
│       ├── types/plan.ts    ← FullPlan & related types
│       └── router.tsx
├── backend/
│   ├── package.json
│   ├── scripts/benchmark.js
│   ├── data/                ← SQLite file (gitignored when local)
│   ├── src/
│   │   ├── server.js        ← HTTP API + orchestration
│   │   ├── feedback-store.js
│   │   ├── grounding-validator.js
│   │   ├── governance-gate.js
│   │   ├── scientific-mechanistic.js
│   │   ├── execution-readiness.js
│   │   ├── novelty-diagnostics.js
│   │   ├── embedding-rerank.js
│   │   ├── ontology-similarity.js
│   │   ├── plan-outline.js
│   │   ├── plan-financial-normalize.js
│   │   ├── plan-reasoning-normalize.js
│   │   ├── plan-fallback-stub.js
│   │   ├── feedback-learning-report.js
│   │   ├── operational-extra-checks.js
│   │   └── json-extract.js
│   └── test/                 ← node:test API + unit tests
└── backend/.env.example
```

---

## Prerequisites

- **Node.js** 18+ (LTS recommended).
- **npm** (ships with Node).
- API keys as per [Configuration](#configuration) for full live behaviour.
- **Docker** (optional) — only if using Postgres from `docker-compose.yml`.
- **Playwright** browsers — first `npm run test:e2e` may need browser install depending on env (`PLAYWRIGHT_BROWSERS_PATH`).

---

## Installation

```bash
git clone <YOUR_REPO_URL>
cd lab-mindai
```

### Backend

```bash
cd backend
npm install
cp .env.example .env
# Edit .env — see Configuration
```

### Frontend

```bash
cd ../frontend
npm install
```

---

## Configuration

1. Copy `backend/.env.example` → `backend/.env`.
2. Set at minimum **`TAVILY_API_KEY`**, **`GROQ_API_KEY`**, **`GEMINI_API_KEY`** for end-to-end live generation (Gemini used when Groq plan calls fail).
3. **Scientist-trust defaults (permanent product posture):** set **`LABMIND_STRICT_PLAN_GATES=1`** and **`LABMIND_DUAL_FEEDBACK_AB=1`** in `backend/.env`. These are how LabMind is **meant to be run** whenever a **200** response should mean “a PI could defend this plan,” and whenever you surface **feedback-informed** generation (see [Scientist-trust contract](#reliability-focused-environment-flags)). `backend/.env.example` ships with the same values so new clones match that contract.
4. Optionally set **`LABMIND_API_KEY`**; if set, mirror in frontend as **`VITE_LABMIND_API_KEY`** (and **`VITE_LABMIND_TENANT_ID`** if multi-tenant).
5. Point frontend to backend: **`VITE_BACKEND_URL`** (defaults to `http://localhost:8080` in client code paths — verify in `frontend/src/lib/storage.ts` / API modules).

### Scientist-trust contract (environment) {#reliability-focused-environment-flags}

LabMind’s **credibility with scientists** does not come from never returning an error; it comes from **never calling a failed or gate-violating draft a success**. That behaviour is **locked in** with **`LABMIND_STRICT_PLAN_GATES=1`**. Credibility for the **feedback loop** is **locked in** with **`LABMIND_DUAL_FEEDBACK_AB=1`** whenever merged prior reviews exist, so impact is **measured**, not only narrated.

Keep real secrets in **`backend/.env`** (gitignored). The example file documents the **same trust posture** for copy-paste setup.

#### `LABMIND_STRICT_PLAN_GATES=1` — non‑negotiable for trust‑bearing responses

| Aspect | Behaviour |
|--------|-----------|
| **Product role** | This is the **default intended configuration**: a **200** from `/api/experiment-plan` must mean the plan **passed safety, procurement grounding, and governance** after automated checks, and was produced from **parseable model JSON** (not a last‑resort stub). |
| **What it enforces** | **502** if all planner models fail or output is not parseable JSON; **422** if **safety**, **procurement grounding**, or **governance** still fail after compliance logic. |

**Why scientists can trust it:** There is **no silent downgrade** to a generic stub, **no release** that pretends procurement evidence exists when it does not, and **no missing** IRB / IACUC / IBC language when the hypothesis implies that risk class. **HTTP success aligns with reviewable quality.**

**Engineering escape hatch only:** The codebase still allows **unset** strict gates so a laptop without keys can smoke-test UI paths; that mode is **not** the LabMind trust story and **must not** be used for demos to judges, PIs, or production claims. Treat **`unset` as local debugging only.**

#### `LABMIND_DUAL_FEEDBACK_AB=1` — permanent when you claim “learning from experts”

| Aspect | Behaviour |
|--------|-----------|
| **Product role** | Whenever **merged prior feedback** exists and Tavily + Groq are available, the server runs a **shadow planning pass** with the **same retrieval packet** but **prior corrections stripped** from the prompt. The main response still uses priors; metrics compare **with vs without** that expert context. |
| **Where it surfaces** | **`feedbackSummary.feedbackLearningReport`** (and related dual‑LLM fields) so reviewers and judges see **quantified** movement in score and gates, not only prose. |

**Why that builds trust:** The system **proves** whether expert snippets change the plan quality model, instead of asking the audience to believe it. The cost is roughly **2×** planner tokens and extra latency for that request when the shadow arm runs; that is the **price of an auditable learning story**.

**When the shadow does not run:** If there are **no** merged priors, there is nothing to ablate — enable dual AB anyway so behaviour is consistent the moment reviews exist.

#### Summary

| Variable | Trust guarantee |
|----------|-----------------|
| **`LABMIND_STRICT_PLAN_GATES=1`** | **200 = passed gates**; failures are visible **422/502**, not disguised success. |
| **`LABMIND_DUAL_FEEDBACK_AB=1`** | **Feedback impact is measured** (shadow without priors) whenever priors are merged — core to the **scientist review / learning loop** story. |

Together they are the **permanent baseline** for any environment where LabMind is presented as a **serious lab scoping tool**, not a toy demo.

---

## Running locally

### Backend (port 8080 default)

```bash
cd backend
npm run dev
```

### Frontend (Vite dev server, commonly 5173)

```bash
cd frontend
npm run dev
```

Open the URL printed by Vite (e.g. `http://localhost:5173`). Use the **Generate** flow for stages 1–3.

---

## Docker & databases

### Postgres (optional)

```bash
docker compose up -d
```

Set in `backend/.env`:

```env
DATABASE_URL=postgres://labmind:labmind@localhost:5432/labmind
```

Restart backend. Reviews use table **`labmind_reviews`** (JSONB payload, indexes on tenant + time/domain).

### SQLite (default)

If `DATABASE_URL` is **unset**, reviews use `backend/data/labmind.sqlite` with table **`reviews`** (see schema below).

**TODO:** No Dockerfile for the Node app itself in this repository.

---

## Deployment notes

| Target | Guidance |
|--------|----------|
| **Frontend** | Build static/client bundle via `npm run build`; TanStack Start / Cloudflare plugin may target Workers — follow `frontend/vite.config.ts` and provider docs. **Verify** env vars (`VITE_*`) at build time. |
| **Backend** | Run `node src/server.js` behind a process manager; set `PORT`; configure secrets via platform secret store; enable HTTPS termination at reverse proxy. |
| **AWS / GCP / Azure / Railway / Render** | **Not** codified in-repo — standard Node container or native Node runtime; add health check on `GET /health`. |

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | HTTP listen port (default **8080**). |
| `TAVILY_API_KEY` | Yes\* | Tavily search for literature + verification. \*Literature-qc returns 500 if missing; experiment-plan degrades retrieval when missing. |
| `GROQ_API_KEY` | Yes\* | Llama 8B/70B via Groq. \*Plan path uses Gemini if Groq unavailable but then Gemini key needed. |
| `LLAMA8_MODEL` | No | Default `llama-3.1-8b-instant`. |
| `LLAMA70_MODEL` | No | Default `llama-3.3-70b-versatile`; legacy id remapped in code. |
| `GEMINI_API_KEY` | Strongly recommended | Fallback planner / shadow generation. |
| `GEMINI_MODEL` | No | Default **`gemini-2.5-flash`** (Google AI Studio no longer lists **Gemini 1.5 Flash**; pick any **Model code** from the [Gemini models](https://ai.google.dev/gemini-api/docs/models) docs). Legacy **`gemini-1.5-*`** / **`gemini-pro`** ids are remapped to that default in code. |
| `GEMINI_SECONDARY_MODEL` | No | Optional second Gemini model string. |
| `EXPERIMENT_PLAN_LLAMA_FALLBACK_MODEL` | No | Inserted into Groq fallback model list for planning. |
| `OPENAI_API_KEY` | No | Enables embedding cosine novelty assist. |
| `OPENAI_EMBEDDING_MODEL` | No | Default `text-embedding-3-small`. |
| `LABMIND_DUAL_FEEDBACK_AB` | **Yes (trust posture)** | Set to **`1`** for production and demos: runs the **shadow plan** (no priors in prompt) when merged feedback + Tavily + Groq exist — see [Scientist-trust contract](#reliability-focused-environment-flags). **~2×** planner cost when the arm runs. |
| `LABMIND_STRICT_PLAN_GATES` | **Yes (trust posture)** | Set to **`1`** so **200** means gates passed — see [Scientist-trust contract](#reliability-focused-environment-flags). Unset only for **local engineering** without keys (not for PI/judge-facing runs). |
| `LABMIND_API_KEY` | No | When set, **all** routes using `requireLabmindApiKey` need Bearer or `x-api-key` (skipped when `NODE_ENV=test`). |
| `DATABASE_URL` | No | When set, Postgres mode for reviews. |
| `NODE_ENV` | No | `test` bypasses API key middleware for automated tests. |
| `RATE_LIMIT_RETRY_MAX_MS` | No | Caps for retry backoff parsing (client retry hints). |

Frontend (`VITE_*`):

| Variable | Description |
|----------|-------------|
| `VITE_BACKEND_URL` | Backend origin for API calls. |
| `VITE_LABMIND_API_KEY` | Mirror of `LABMIND_API_KEY` when backend enforces auth. |
| `VITE_LABMIND_TENANT_ID` | Sent as `x-tenant-id` when set. |

---

## API reference

**Base URL:** `http://localhost:8080` (or your deployment).  
**Common headers:** `Content-Type: application/json`; optional `Authorization: Bearer <LABMIND_API_KEY>`; optional `x-tenant-id`; responses include `x-request-id`.

### `GET /health`

| | |
|---|---|
| **Description** | Liveness probe + static rate-limit policy summary. |
| **Auth** | Public. |
| **Response** `200` | `{ ok: true, rateLimit: { windowMs, max } }` — defaults: window **60000** ms, max **30** requests per IP per window. |

---

### `POST /api/literature-qc`

| | |
|---|---|
| **Description** | Tavily retrieval → QC mapping → Llama 8B validation → novelty diagnostics (+ optional embeddings). |
| **Auth** | `requireLabmindApiKey` when `LABMIND_API_KEY` set. |
| **Body** | `{ "hypothesis": string }` — min length **6** trimmed chars. |
| **Success** `200` | `{ ...validatedQc, noveltyDiagnostics }` — includes `noveltySignal`, `noveltyExplanation`, `references`, `modelFlow`, etc. |
| **Errors** | `400` invalid body; `500` missing Tavily key; `502` Tavily HTTP failure with `details`. |

**Example request**

```http
POST /api/literature-qc HTTP/1.1
Content-Type: application/json

{ "hypothesis": "Replacing sucrose with trehalose will improve HeLa post-thaw viability by ≥15% vs DMSO control." }
```

---

### `POST /api/plan-sources`

| | |
|---|---|
| **Description** | Parallel Tavily searches for verification URLs keyed by plan section. |
| **Body** | `{ hypothesis, experimentTitle?, domain?, materials? }` — hypothesis min length **6**. |
| **Errors** | `400` bad input; `500` missing Tavily key. |
| **Success** | `{ version: 1, sources: { ... } }` — shape consumed by plan pipeline (section → `{ title, url, snippet }[]`). |

---

### `POST /api/experiment-plan`

| | |
|---|---|
| **Description** | Full orchestration: feedback retrieval → literature packet → optional outline → Llama 70B plan → Gemini fallback → JSON parse → Tavily verification + Llama 8B validation → QC / gates / readiness / learning report. |
| **Body (common fields)** | `hypothesis` (required), `priorFeedback` (optional array), `domain` (optional client domain hint), `dualFeedbackAb` (optional boolean). |
| **Success** `200` | See success object below. |
| **Errors** | `400` bad hypothesis; `401` API key mismatch; `429` IP rate limit; `422` strict-mode gate failures (may include partial `plan` + `qualityChecks`); `502` upstream / parse (strict); `500` unhandled. |

**Top-level success fields (indicative)**

- `version`, `requestId`, `tenantId`
- `modelFlow`: `{ retrievalModel, planningModel, retrievalOutlineUsed }`
- `feedbackSummary`, `qualityChecks`, `executionReadiness`, `scientificMechanistic`
- `metadata`: `{ generatedAt, generationLatencyMs, strictReleaseGates, releaseDegraded }`
- `plan`: **FullPlan** JSON (domain, hypothesisAnalysis, literatureQC, experimentPlan, verificationSources, reasoning)

---

### `GET /api/reviews`

| | |
|---|---|
| **Query** | `domain` (optional) — when set, filters by domain; `limit` (1–200, default 50). |
| **Success** | `{ version, requestId, tenantId, reviews: Review[] }` |

---

### `POST /api/reviews`

| | |
|---|---|
| **Body** | Stored as JSON; must include **`id`**, **`timestamp`**, **`hypothesis`**, **`domain`** or returns `400`. |
| **Success** `201` | `{ ok: true, requestId, tenantId }` |

---

## Authentication & tenancy

- **Not JWT.** Optional shared secret: when `LABMIND_API_KEY` is set, matching **`Authorization: Bearer …`** or **`x-api-key`** is required on literature, plan-sources, experiment-plan, and reviews routes.
- **`x-tenant-id`**: opaque string (max 64 chars) scoping review storage and similar-review retrieval; default **`default`**.
- **`NODE_ENV=test`**: API key middleware **skipped** so automated tests can hit routes without secrets.

---

## Database schema

### SQLite — table `reviews`

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | Client-generated review id. |
| `tenant_id` | TEXT | Default `default`. |
| `created_at` | TEXT | ISO timestamp string. |
| `hypothesis` | TEXT | Original hypothesis text. |
| `domain` | TEXT | Domain tag for matching. |
| `ontology_tags` | TEXT | JSON array string. |
| `keyword_signature` | TEXT | JSON object string. |
| `reviewer_expertise` | TEXT | Optional. |
| `overall_rating` | REAL | Optional numeric. |
| `payload_json` | TEXT | Full review JSON blob. |

Indexes: `(domain, created_at DESC)`, `(tenant_id, created_at DESC)`.

### Postgres — table `labmind_reviews`

Same logical fields; `ontology_tags` and `keyword_signature` and `payload_json` stored as **JSONB**; indexes on `(tenant_id, created_at DESC)` and `(tenant_id, domain)`.

```mermaid
erDiagram
  REVIEWS {
    text id PK
    text tenant_id
    timestamptz created_at
    text hypothesis
    text domain
    jsonb ontology_tags
    jsonb keyword_signature
    text reviewer_expertise
    float overall_rating
    jsonb payload_json
  }
```

---

## AI & retrieval pipeline

| Stage | Implementation files | Models / services |
|-------|----------------------|-------------------|
| Query shaping | `server.js` (`clipQuery`, Tavily suffix) | Tavily |
| Literature rows | `fetchMergedLiteratureRows`, `mapTavilyToQC` | Tavily |
| Literature validation | `validateLiteratureQcWithLlama` | Llama 8B @ Groq |
| Embeddings (optional) | `embedding-rerank.js` | OpenAI `text-embedding-3-small` |
| Novelty fusion | `novelty-diagnostics.js` | Deterministic trigram + scores |
| Outline | `plan-outline.js` | Llama 8B |
| Plan JSON | `buildPlanPrompt` + `chatLlamaWithFallback` | Llama 70B + fallbacks |
| Gemini fallback | `chatGeminiWithFallback` | Gemini |
| Verification Tavily | `fetchVerificationSourcesFromTavily` | Tavily |
| Source validation | `validateVerificationSourcesWithLlama8` | Llama 8B |

**Fine-tuning:** **Not implemented.** Learning is **in-context** from stored reviews + heuristics (`feedback-learning-report.js`).

---

## Experiment plan generation

1. **Hypothesis** received; domain inferred or taken from client.
2. **Similar reviews** loaded (`findSimilarReviews`, `getReviewsByDomain`) and merged with body `priorFeedback`.
3. **Literature packet** built (`buildLiteratureRetrievalPacket`) — or minimal packet if Tavily missing.
4. **Dual shadow** plan for measured feedback impact when **`LABMIND_DUAL_FEEDBACK_AB=1`** (or body flag) and merged priors + Tavily + Groq are present.
5. **Outline** optional (`generatePlanOutline`).
6. **Planner prompt** includes retrieval JSON (truncated), governance instructions, materials count rules, regulatory hints, **prior scientist corrections** block.
7. **Parse** JSON (`extractJsonObject`); with **`LABMIND_STRICT_PLAN_GATES=1`**, parse failure is **502** (no stub). **Stub fallback exists in code only** for strict‑gates‑unset local runs — **not** part of the scientist‑trust product path.
8. **Merge** literature QC if model omitted meaningful refs.
9. **Verification** sources fetched + validated.
10. **Compliance patches** (`applyAllReleaseCompliancePatches`).
11. **Mechanistic + safety** checks; under strict gates, failures **stop** the request instead of auto‑repair / bypass for display.
12. **Enrich** quotes / financial normalisation.
13. **Quality + grounding**; procurement repair if allowed.
14. **Governance** validation; with strict gates, failure is **422**; footer / bypass paths apply only when strict gates are **unset** (non–trust‑contract runs).
15. **`ensureFullPlanReasoningRoot`** then JSON response.

---

## Quality gates & compliance

| Gate | Purpose |
|------|---------|
| `runSafetyChecks` | High-risk term detection requires IRB/IBC/ethics language in serialised plan. |
| `validatePlanGrounding` | Procurement-critical materials must cite allow-listed URLs from literature + verification. |
| `validateGovernanceRelease` | Animal / human / biocontainment language when implied by hypothesis + plan text. |
| `evaluatePlanQuality` | Completeness, evidence coverage, operational heuristics, warnings/errors. |
| `runOperationalExtraChecks` | Additional operational warnings. |
| `LABMIND_STRICT_PLAN_GATES` | **`1` is the intended default** — failures surface as **422/502** instead of stub/repair/degraded success; **200** stays aligned with scientist trust. |

---

## UI / UX map

| Area | Location (indicative) |
|------|------------------------|
| Landing | `routes/index.tsx`, `Hero`, `HowItWorks`, `Footer` |
| Stage 1 | `generate/Stage1Hypothesis.tsx`, `HypothesisStrengthMeter` |
| Stage 2 | `generate/Stage2Literature.tsx` |
| Stage 3 | `generate/Stage3Plan.tsx`, `plan/PlanView.tsx`, tabs in `PlanSections.tsx`, `ScientistReviewPanel.tsx` |
| Theme / UX chrome | `Navbar`, theme toggle, optional click SFX |
| History / reviews (client) | `lib/storage.ts` |

**State management:** Route-local React state + **TanStack Query** where used; no Redux/Zustand detected as global store.

---

## State & data on the client

- **Plan history** and **draft scientist reviews** — `localStorage` via `lib/storage.ts` (SSR-safe guards).
- **Server-backed reviews** — `POST/GET /api/reviews` when backend available and auth configured.

---

## Error handling

- Express `try/catch` per route with JSON `{ error, requestId?, details? }`.
- Frontend: error boundaries / toast patterns depend on route implementation — see `router.tsx` and stage components for user-visible failures.
- Model **429** handling with selective backoff parsing in `server.js` (`parse429SuggestedWaitMs`).

---

## Logging & observability

- Structured **one-line JSON logs** per request finish: timestamp, `requestId`, method, path, status, `latencyMs`.
- **No** OpenTelemetry / APM integration in-repo (TODO if production hardening required).

---

## Security

| Topic | Implementation |
|-------|----------------|
| Transport | Assume TLS at deployment boundary (not terminated in Express snippet). |
| Secrets | `.env` / platform secret manager — never commit real `.env`. |
| Auth | Shared API key optional; not user-scoped RBAC. |
| Validation | Body string length checks; JSON depth handled implicitly by parsers; large prompt truncation in `buildPlanPrompt` / stringify slices. |
| Rate limiting | In-memory per-IP counter (**not** distributed-safe across replicas). |

---

## Performance & limits

- Tavily query length capped (`TAVILY_MAX_QUERY_LENGTH` logic in `server.js`).
- Prompt slices: retrieval packet truncated (~120k chars in template), outline / dual paths have smaller caps — see `buildPlanPrompt` / `plan-outline.js`.
- Postgres pool `max: 10` in `feedback-store.js`.

---

## Testing

| Suite | Command | Notes |
|-------|-----------|-------|
| Backend unit + API | `cd backend && npm test` | `node:test`; uses `NODE_ENV=test`. |
| Frontend E2E | `cd frontend && npm run test:e2e` | Playwright; mocks network to backend per specs under `tests/e2e/`. |
| Benchmark | `cd backend && npm run benchmark` | Hits local backend; requires running server + keys per script. |

---

## CI/CD

**Not configured** in this repository (no `.github/workflows` found). TODO: add workflow running `backend/npm test` and `frontend/npm run lint` / `npm run test:e2e` with appropriate secrets strategy.

---

## Known limitations

- **In-memory rate limit** not suitable for multi-instance without sticky IP or Redis.
- **No user accounts** — tenancy is header-based only.
- **Model hallucination risk** on catalog numbers — mitigated by `VERIFY-CATALOG`, gates, and prompts but not eliminated.
- **Resilient plan mode** (strict gates **unset**) can return **stub** or **auto-repaired grounding** — **contradicts the scientist-trust contract**; reserve for local engineering only, not for demos or production claims.
- **E2E tests** do not exercise live Groq/Tavily/Gemini by default.

---

## Troubleshooting

| Symptom | Likely cause | Mitigation |
|---------|--------------|------------|
| `401 Unauthorized` | `LABMIND_API_KEY` set but client missing key | Set `VITE_LABMIND_API_KEY` or disable backend key for local dev. |
| `429 Rate limit exceeded` | Many requests from one IP | Wait `Retry-After`; reduce parallel UI calls. |
| `502` Tavily | Bad key, quota, or network | Rotate key; read `details` body. |
| `502` All models failed (strict) | Groq + Gemini both down | Check keys, quotas, model IDs. |
| `422` procurement / governance / safety (strict) | Gate failed | Inspect response `errors` / `warnings`; widen retrieval or fix hypothesis scope. |
| Stage 3 empty or generic | Keys missing or resilient stub | Check `metadata.planningModel` and `releaseDegraded`. |
| UI crash on reasoning | Stale cached plan without `reasoning` | Regenerate plan; backend now normalises `plan.reasoning`. |
| Postgres connection errors | Wrong `DATABASE_URL` | Match `docker-compose.yml` credentials. |
| Playwright fails to start | Port 4173 busy / server | Set `PLAYWRIGHT_BASE_URL` or free port per `playwright.config.ts`. |
| Wrangler log EPERM (build) | Cloudflare plugin log path | Sandbox / permissions issue on some machines; build may still succeed. |

---

## Roadmap

**Short term:** CI workflow; `docs/` split; PDF export; optional Redis rate limiter; Dockerfile for backend.

**Long term:** Multi-agent orchestration; optional RAG vector store; fine-tuning or LoRA from exports; collaborative org workspaces; protocol simulation links.

---

## Contributing

1. Fork / branch from default branch.
2. Run **backend tests** and **frontend lint** before PRs.
3. Keep changes scoped; match existing code style (ESM, TypeScript strictness on frontend).
4. Update this README if you add env vars, routes, or user-visible behaviour.

---

## Code style

- **Frontend:** ESLint (`npm run lint`), Prettier (`npm run format`).
- **Backend:** Plain ESM JavaScript; no separate ESLint config detected in snippet — rely on editor defaults / TODO add `eslint` for backend.

---

## License

**TODO:** Repository placeholder — add a `LICENSE` file (e.g. MIT) and update this section.

---

## Authors & acknowledgements

- **Team / authors:** TODO — add names or organisation.
- **Hackathon:** Inspired by the *AI Scientist* style experiment-planning challenge (hypothesis → literature QC → operational plan).
- **External services:** [Tavily](https://tavily.com/), [Groq](https://groq.com/), [Google AI Gemini](https://ai.google.dev/), optional [OpenAI](https://openai.com/) embeddings.
- **Open-source:** React, Vite, TanStack, Express, Tailwind, Radix, Playwright, and other dependencies per `package.json` files.

---

## FAQ

1. **What is the minimum viable `.env` for a live demo?**  
   `TAVILY_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY` — plus model name envs if you deviate from defaults.

2. **Do I need Postgres?**  
   No. SQLite is automatic when `DATABASE_URL` is unset.

3. **What does strict gating do?**  
   `LABMIND_STRICT_PLAN_GATES=1` is the **default trust posture**: it removes stub/repair “always 200” behaviour so failed gates or models return **422/502** instead of a disguised success.

4. **How does tenancy work?**  
   HTTP header `x-tenant-id`; reviews and similarity queries are scoped.

5. **Is JWT supported?**  
   No — only optional static API key on routes.

6. **Where are prompts?**  
   Primarily inline in `backend/src/server.js` (`buildPlanPrompt`, literature validation, Gemini user payload) and `plan-outline.js`.

7. **Can the model invent DOIs?**  
   Prompts instruct not to invent DOIs/URLs; trust but verify with retrieval + gates.

8. **What currency does the plan use?**  
   Schema uses **USD** fields (`unitPriceUSD`, etc.).

9. **How are prior reviews injected?**  
   `formatPriorFeedbackForPrompt` + merged arrays from DB similarity and domain listing.

10. **What is `executionReadiness`?**  
    Heuristic tier (`order_ready` / `pilot_ready` / `draft`) from backend checks — see `execution-readiness.js`.

11. **What is `scientificMechanistic`?**  
    Concentration heuristics, assay compatibility notes, power sketch, protocol step evidence stats.

12. **Does it fine-tune on feedback?**  
    No — in-context and reporting only.

13. **How to run E2E against real backend?**  
    Not wired by default; set `PLAYWRIGHT_BASE_URL` to a running preview and remove/disable mocks in specs (TODO explicit doc).

14. **Why Gemini if Groq works?**  
    Fallback when Groq returns errors / exhaustion after retries.

15. **What happens without Tavily?**  
    Literature QC errors or degraded retrieval packet; experiment-plan still attempts with limited grounding (see code paths).

16. **Where is rate limit configured?**  
    Constants `RATE_LIMIT_WINDOW_MS` (60s) and `RATE_LIMIT_MAX` (30) in `server.js`; health echo.

17. **Can I deploy frontend-only?**  
    No — plan generation requires the Node backend (or you must rehost API separately).

18. **Is there an OpenAPI spec?**  
    Not checked in — this README is the reference (TODO OpenAPI).

19. **How do I add a new gate?**  
    Implement validation module, call from `/api/experiment-plan` before response, document here.

20. **What file owns CORS?**  
    `app.use(cors())` in `server.js` — open by default; tighten for production.

21. **Why `VERIFY-CATALOG`?**  
    Explicit placeholder when catalog numbers are not verified from sources.

22. **Does health check hit the database?**  
    No — it only returns static JSON + rate limit policy.

23. **What logs exist?**  
    JSON stdout per HTTP response completion.

24. **Is SQLite file committed?**  
    Typically gitignored for local dev data — do not commit PII reviews.

25. **How to reset reviews in dev?**  
    Delete `backend/data/labmind.sqlite` or truncate Postgres table.

---

**End of README** — for the four official sample hypotheses (biosensor / mice / HeLa cryo / *Sporomusa*), see challenge brief; backend tests include domain-specific grounding and governance cases aligned with those scenarios.
