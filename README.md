# LabMind AI

LabMind AI is a scientific experiment planning web app that turns a research hypothesis into a structured, runnable experiment plan. It guides users through three stages:

- Hypothesis analysis
- Literature QC
- Experiment plan generation

Current implementation is full-stack:

- **Stage 2 (Literature QC):** Tavily retrieval + Llama 8B validation
- **Stage 3 (Experiment Plan):** Llama 70B planning with Gemini fallback
- **Stage 3 citations:** Tavily source retrieval + Llama 8B source relevance checks

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
- Backend (`backend/`)
  - `npm run dev` - Start backend with watch mode
  - `npm run start` - Start backend without watch

## Backend API

- `GET /health` - health check
- `POST /api/literature-qc`
  - Tavily retrieval + Llama 8B validation
  - Returns novelty signal, explanation, references, and validator metadata
- `POST /api/plan-sources`
  - Tavily retrieval of citation links per section (`protocol`, `materials`, `budget`, `timeline`, `validation`, `safety`)
- `POST /api/experiment-plan`
  - Generates full experiment plan using Llama 70B
  - Falls back to Gemini if Llama 70B fails or quota is exhausted
  - Then attaches Tavily citations and validates those citations with Llama 8B
  - Returns `modelFlow` showing planning model and source-check model used

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

- Data is stored in browser `localStorage` only (history/reviews).
- If model calls fail, Stage 3 now shows a visible error and allows optional manual mock fallback.
- Stage 2 and Stage 3 source checks include model validation status and confidence.

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
