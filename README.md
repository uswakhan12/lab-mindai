# LabMind AI

LabMind AI is a scientific experiment planning web app that turns a research hypothesis into a structured, runnable experiment plan. It guides users through three stages:

- Hypothesis analysis
- Literature QC
- Experiment plan generation

Current implementation is full-stack:

- **Stage 2 (Literature QC):** Tavily retrieval + Llama 8B validation
- **Stage 3 (Experiment Plan):** Retrieval-grounded Llama 70B planning with Gemini fallback
- **Stage 3 citations:** Tavily source retrieval + Llama 8B source relevance checks
- **Quality gates:** automated plan checks + section evidence coverage scoring
- **Feedback learning store:** SQLite by default (`backend/data/labmind.sqlite`) or **Postgres** when `DATABASE_URL` is set (`docker-compose.yml` included)
- **Multi-tenant + auth:** optional `LABMIND_API_KEY` (Bearer or `x-api-key`) on literature/plan/review routes; `x-tenant-id` scopes reviews per organisation
- **Similar experiment retrieval:** ontology tags + keyword cosine (not just coarse domain)
- **Mechanistic validation:** concentration vs assay heuristics, proportion power sketch, protocol step ↔ evidence links (`scientificMechanistic` in API + UI)

## Tech Stack

- Frontend: React 19, TypeScript, Vite 7, TanStack Start/Router, Tailwind CSS 4
- Backend: Node.js + Express
- Retrieval: Tavily
- Models: Groq (Llama 8B + Llama 70B), Gemini (fallback)

## Features

- Multi-stage guided generation flow (`/generate`)
- Live Literature QC with novelty signal + references
- Model-generated experiment plans (not mock by default)
- Section-wise verification links in Stage 3 with Llama 8B relevance labels
- Hypothesis quality scoring heuristics
- Local history and scientist review persistence using `localStorage`
- Theme toggle (dark default, light mode supported)
- Optional UI click sound toggle
- Shareable route-based hypothesis input via query params

## Prerequisites

- Node.js 18+ (recommended: latest LTS)
- npm (comes with Node.js)

## Getting Started

1. Clone the repository:

```bash
git clone <your-repo-url>
cd lab-mindai
```

2. Backend setup:

```bash
cd backend
npm install
cp .env.example .env
```

Fill `backend/.env` with your keys:

- `TAVILY_API_KEY`
- `GROQ_API_KEY`
- `LLAMA8_MODEL` (recommended: `llama-3.1-8b-instant`)
- `LLAMA70_MODEL` (recommended: `llama-3.3-70b-versatile`)
- `GEMINI_API_KEY`
- `GEMINI_MODEL` (recommended: `gemini-1.5-flash`)

3. Start backend:

```bash
npm run dev
```

4. Frontend setup:

```bash
cd ../frontend
npm install
npm run dev
```

5. Open the app in your browser:

- http://localhost:5173

## Scripts

- Frontend (`frontend/`)
  - `npm run dev` - Start local development server
  - `npm run build` - Build production bundle
  - `npm run lint` - Run ESLint checks
  - `npm run test:e2e` - Run Playwright E2E tests (smoke + full Stage 1→3 pipeline with **mocked** backend APIs)
- Backend (`backend/`)
  - `npm run dev` - Start backend with watch mode
  - `npm run start` - Start backend without watch
  - `npm run test` - Run backend API smoke tests
  - `npm run benchmark` - Run 4-scenario judge benchmark against local backend

## Backend API

- `GET /health` - health check
- `POST /api/literature-qc`
  - Tavily retrieval + Llama 8B validation
  - Returns novelty signal, explanation, references, and validator metadata
- `POST /api/plan-sources`
  - Tavily retrieval of citation links per section (`protocol`, `materials`, `budget`, `timeline`, `validation`, `safety`)
- `POST /api/experiment-plan`
  - Generates full experiment plan using Llama 70B, grounded by retrieval packet
  - Falls back to Gemini if Llama 70B fails or quota is exhausted
  - Then attaches Tavily citations and validates those citations with Llama 8B
  - Merges **similar** prior reviews (ontology + keyword similarity) and domain reviews for the same `x-tenant-id`
  - Returns `modelFlow`, `feedbackSummary`, `qualityChecks`, and **`scientificMechanistic`** (assay heuristics, power sketch, step-level evidence links)
- `GET /api/reviews` / `POST /api/reviews` — list or store structured scientist reviews (tenant-scoped; requires `LABMIND_API_KEY` when that env is set)

## Project Structure

```text
.
├── frontend/
│   ├── src/
│   │   ├── components/        # UI and feature components
│   │   ├── lib/               # Client helpers (storage, theme, sfx, API helpers)
│   │   ├── routes/            # File-based routes (index, generate, root)
│   │   ├── types/             # Shared TypeScript types
│   │   ├── router.tsx         # Router setup and default error UI
│   │   └── routeTree.gen.ts   # Generated route tree
│   ├── package.json
│   └── vite.config.ts
├── backend/
│   ├── src/server.js          # API endpoints + model/retrieval orchestration
│   ├── .env.example
│   └── package.json
└── README.md
```

## Notes

- History remains in browser `localStorage`; scientist reviews persist in **SQLite** (default) or **Postgres** when `DATABASE_URL` is set, scoped by `x-tenant-id`.
- When `LABMIND_API_KEY` is set, mirror it in the frontend as `VITE_LABMIND_API_KEY` (and optional `VITE_LABMIND_TENANT_ID`) so the UI can call secured APIs.
- If model calls fail, Stage 3 now shows a visible error and allows optional manual mock fallback.
- Stage 2 and Stage 3 source checks include model validation status and confidence.
- Backend includes basic observability (request ID + latency logs) and per-IP rate limiting.
- Quality checks include deeper scientific heuristics (unit/concentration detection, statistical plan signal checks, numeric sample size checks, and safety completeness checks).

## Judge Rubric (Built-In)

`/api/experiment-plan` now computes objective quality checks:

- **Completeness:** protocol depth, materials richness, validation fields, budget/timeline presence
- **Evidence grounding:** per-section verification coverage from retrieval + source validation
- **Operational realism:** timeline consistency, budget coherence, and execution readiness indicators

The API returns:

- `qualityChecks.scoreOutOf10`
- `qualityChecks.gatesPassed`
- `qualityChecks.dimensions` (completeness / evidenceGrounding / operationalRealism)
- `qualityChecks.warnings` and `qualityChecks.errors`

Benchmark locally:

```bash
cd backend
npm run benchmark
```

## Postgres (optional, multi-tenant / scale story)

```bash
docker compose up -d
# set in backend/.env:
# DATABASE_URL=postgres://labmind:labmind@localhost:5432/labmind
```

Restart the backend after changing `DATABASE_URL`. Reviews automatically use the `labmind_reviews` table with JSONB metadata.

## Troubleshooting

- If `npm run dev` fails due to port conflicts, run frontend on another port:

```bash
cd frontend && npm run dev -- --port 5174
```

- If Stage 3 says model generation failed:
- verify backend `.env` keys and model names
- restart backend after any `.env` change
- if using custom model ids, ensure they exist and are accessible to your Groq/Gemini account

- If frontend dependencies fail to install:

```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
```

## License

Add your preferred license here (for example, MIT).
