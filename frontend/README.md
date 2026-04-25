# LabMind AI

LabMind AI is a scientific experiment planning web app that turns a research hypothesis into a structured, runnable experiment plan. It guides users through three stages:

- Hypothesis analysis
- Literature QC
- Experiment plan generation

The current implementation is fully client-side and uses a deterministic mock planner (no external AI API required).

## Tech Stack

- React 19
- TypeScript
- Vite 7
- TanStack Start + TanStack Router
- Tailwind CSS 4
- shadcn/ui style component set (Radix UI primitives)

## Features

- Multi-stage guided generation flow (`/generate`)
- Domain-aware mock plan generation (cell biology, diagnostics, microbiology, etc.)
- Hypothesis quality scoring heuristics
- Local history and scientist review persistence using `localStorage`
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

2. Install dependencies:

```bash
npm install
```

3. Start the development server:

```bash
npm run dev
```

4. Open the app in your browser (usually):

- http://localhost:5173

## Available Scripts

- `npm run dev` - Start local development server
- `npm run build` - Build production bundle
- `npm run build:dev` - Build with development mode settings
- `npm run preview` - Preview production build locally
- `npm run lint` - Run ESLint checks
- `npm run format` - Format code with Prettier

## Project Structure

```text
.
├── src/
│   ├── components/        # UI and feature components
│   ├── lib/               # Core client logic (plan generation, storage helpers)
│   ├── routes/            # File-based routes (index, generate, root)
│   ├── types/             # Shared TypeScript types
│   ├── router.tsx         # Router setup and default error UI
│   └── routeTree.gen.ts   # Generated route tree
├── vite.config.ts
├── package.json
└── README.md
```

## Notes

- Data is stored in browser `localStorage` only (history/reviews).
- Because the plan generator is mocked, outputs are deterministic and do not require network calls.
- If you later add a real AI backend, replace the mock generation logic in `src/lib/plan-generator.ts`.

## Troubleshooting

- If `npm run dev` fails due to port conflicts, run:

```bash
npm run dev -- --port 5174
```

- If dependencies fail to install, remove lockfile and reinstall:

```bash
rm -rf node_modules package-lock.json
npm install
```

## License

Add your preferred license here (for example, MIT).
