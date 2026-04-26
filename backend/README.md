# LabMind Backend

## Setup

1. Install dependencies:
   - `cd backend`
   - `npm install`
2. Create env file:
   - `cp .env.example .env`
   - Add real keys for Tavily + model providers.
3. Start backend:
   - `npm run dev`

Runs on `http://localhost:8080` by default.

## Required env vars

- `TAVILY_API_KEY` - web retrieval
- `GROQ_API_KEY` - Llama 8B + Llama 70B (Groq)
- `LLAMA8_MODEL` - defaults to `llama-3.1-8b-instant`
- `LLAMA70_MODEL` - defaults to `llama-3.3-70b-versatile`
- `GEMINI_API_KEY` - fallback planner
- `GEMINI_MODEL` - defaults to `gemini-1.5-flash`

## Endpoints

- `GET /health` - health check
- `POST /api/literature-qc` — novelty / literature QC for a hypothesis
- `POST /api/plan-sources` — parallel Tavily searches for **verification links** grouped by plan section (protocol, materials, budget, timeline, validation, safety). Each section returns up to two `{ title, url, snippet }` hits.
- `POST /api/experiment-plan` — full plan generation pipeline:
  - Llama 70B plan generation
  - Gemini fallback when Llama 70B fails/credits are exhausted
  - **No Tavily retrieval is used in this endpoint**

### `POST /api/plan-sources`

Request body:

```json
{
  "hypothesis": "…",
  "experimentTitle": "Optional plan title from generated plan",
  "domain": "cell_biology",
  "materials": ["HeLa cells", "Trehalose", "DMSO"]
}
```

Response:

```json
{
  "version": 1,
  "sources": {
    "protocol": [{ "title": "…", "url": "https://…", "snippet": "…" }],
    "materials": [],
    "budget": [],
    "timeline": [],
    "validation": [],
    "safety": []
  }
}
```

### `POST /api/experiment-plan`

Request body:

```json
{
  "hypothesis": "Replacing sucrose with trehalose ...",
  "priorFeedback": [
    {
      "domain": "cell_biology",
      "overallRating": 4,
      "reviewerExpertise": "PI",
      "issues": { "materials": "Wrong supplier" },
      "corrections": { "materials": "Use ATCC source for cell line" }
    }
  ]
}
```

Response:

```json
{
  "version": 1,
  "modelFlow": {
    "retrievalModel": "llama-3.1-8b-instant",
    "planningModel": "llama70:llama-3.3-70b-versatile"
  },
  "plan": { "...": "FullPlan JSON" }
}
```

## Troubleshooting

- **`Tavily request failed (400)`** — Usually fixed by using Bearer auth (this backend does) and a valid key. If it persists, read the `details` field in the JSON error response from `/api/literature-qc`; that text comes from Tavily and explains the invalid parameter.
- **`Query is too long. Max query length is 400 characters`** — Tavily’s hard limit. This backend builds the search string from your hypothesis plus a short suffix and **truncates** so the total length never exceeds 400 (very long hypotheses are cut with an ellipsis before the suffix).
- **Groq / Llama failure** — verify `GROQ_API_KEY`, model names, and account credits.
- **Gemini fallback failure** — verify `GEMINI_API_KEY` and enabled model.
