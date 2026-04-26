# Deploying LabMind AI

There is **no** rule that you must use Vercel. Below is a **free-tier**, **step-by-step** path that matches how this repo is built: **API on Render (free)** + **frontend on Cloudflare Workers (free)**. You can swap Render for Fly.io, Railway’s trial credit, etc., using the same env ideas.

---

## Free deployment — step by step

### What you will have at the end

| Piece | Free host (example) | Role |
|-------|---------------------|------|
| **Backend** (Express) | [Render](https://render.com) Web Service | Runs `/api/*`, talks to Tavily / Groq / Gemini |
| **Frontend** (TanStack + Worker) | [Cloudflare Workers](https://workers.cloudflare.com) | Serves the UI; browser calls your Render API |

**Costs:** $0 on both free tiers within their limits. **Trade-offs:** Render free apps **sleep** after ~15 minutes idle (first request after sleep can take **30–60+ seconds**). SQLite on Render lives on **ephemeral** disk — **reviews can reset** when the service restarts; for durable reviews use a free Postgres (e.g. [Neon](https://neon.tech)) and set `DATABASE_URL` on the backend.

---

### Step 1 — Put the code on GitHub (if it is not already)

1. Create a repo on GitHub and push this project (or use your existing repo).
2. You will connect **Render** to this repo so it can pull `backend/` on every deploy.

---

### Step 2 — Deploy the backend (Render, free)

1. Go to [https://render.com](https://render.com) and sign up (GitHub login is fine).
2. **Dashboard → New + → Web Service**.
3. Connect your **GitHub** repository and select the **lab-mindai** repo.
4. Configure the service:

   | Field | Value |
   |--------|--------|
   | **Name** | e.g. `labmind-api` |
   | **Region** | Choose closest to you |
   | **Branch** | `main` (or your default branch) |
   | **Root Directory** | `backend` |
   | **Runtime** | `Node` |
   | **Build Command** | **`npm install`** if you set **`DATABASE_URL`** (Postgres — no `sqlite3` load). **`npm run render-build`** if SQLite (compiles `sqlite3` on Render; do **not** use plain `npm install` for SQLite). |
   | **Start Command** | `npm start` |
   | **Instance type** | **Free** |

5. Open **Environment** and add variables (copy names from `backend/.env.example`, use **your real secrets**):

   - **`NODE_VERSION`** — set to **`20.18.0`** (recommended). Render’s default **Node 24** can break native addons; `backend/package.json` `engines` pins **Node 20.x**.
   - **`DATABASE_URL`** — omit if you want **SQLite** (see [SQLite on Render](#sqlite-on-render-no-postgres)). Set to a Postgres URL if you want **Postgres** (avoids native `sqlite3` entirely).
   - `TAVILY_API_KEY`
   - `GROQ_API_KEY`
   - `GEMINI_API_KEY`
   - `GEMINI_MODEL` (e.g. `gemini-1.5-flash`)
   - `LLAMA8_MODEL`, `LLAMA70_MODEL` if you override defaults
   - `LABMIND_STRICT_PLAN_GATES=1`
   - `LABMIND_DUAL_FEEDBACK_AB=1`
   - Optional: `LABMIND_API_KEY` (if set, you must mirror it in the frontend build — see Step 4)

   Render sets **`PORT`** automatically; your app already uses `process.env.PORT`.

6. Click **Create Web Service** and wait until the deploy log shows **Live**.
7. Copy the service URL, e.g. `https://labmind-api.onrender.com` (no trailing slash).

8. **Smoke test:** open `https://YOUR-SERVICE.onrender.com/health` in a browser — you should see JSON like `{ "ok": true, ... }`.

---

### SQLite on Render (no Postgres)

The `sqlite3` package uses a **native addon**. Render’s prebuilt binary sometimes does not load (`ERR_DLOPEN_FAILED`). You can still run **SQLite only** (do **not** set `DATABASE_URL`) using one of these approaches.

#### A — Native Web Service: rebuild `sqlite3` on Render (try this first)

1. Leave **`DATABASE_URL` unset** so the app uses SQLite under `backend/data/`.
2. Set **`NODE_VERSION`** to **`20.18.0`** (or another **20.x** / **22.x** in `engines`).
3. Change **Build Command** to:

   ```bash
   npm run render-build
   ```

   That runs **`npm install`** (tolerates a **`package-lock.json`** that is slightly out of sync with **`package.json`**, unlike **`npm ci`**) then **`npm run rebuild`** inside **`sqlite3`** (always **`node-gyp rebuild`**) so the native addon is compiled on Render’s Linux. For stricter installs later, run **`npm install`** locally, commit an updated lockfile, and you can switch the script back to **`npm ci`** if you prefer.

4. **Start Command** stays `npm start`.
5. On the service **Settings**, use **Clear build cache & deploy** once if you previously ran **`npm install`** for SQLite (old `node_modules` in cache can keep a bad binary).
6. Redeploy and check logs. If the build fails, look for **python / g++ / node-gyp** errors (Render’s Node image usually includes build tools).

**Limits:** Render free disk is **ephemeral** — `labmind.sqlite` can be **lost on restarts** or deploys. Fine for demos; use Postgres if you need durable reviews.

#### B — Docker Web Service (most reliable for SQLite)

If path **A** still fails:

1. In Render, create a **Web Service** with **Environment: Docker** (or switch the existing service to Docker).
2. **Root Directory:** `backend`
3. **Dockerfile Path:** `Dockerfile` (i.e. `backend/Dockerfile` in the repo).
4. Do **not** set `DATABASE_URL` if you want SQLite.
5. Deploy. The image installs **build-essential**-style packages and compiles `sqlite3` inside Debian **bookworm-slim**.

The repo includes **`backend/Dockerfile`** and **`backend/.dockerignore`** for this path.

---

### Step 3 — Build the frontend on your laptop (with the real API URL)

The browser needs to know where the API lives. That value is baked in at **build time** as **`VITE_BACKEND_URL`**.

On your machine (Node 18+):

```bash
cd frontend
npm ci
export VITE_BACKEND_URL="https://YOUR-SERVICE.onrender.com"
# If you set LABMIND_API_KEY on Render, also:
# export VITE_LABMIND_API_KEY="same-secret-as-backend"
# export VITE_LABMIND_TENANT_ID="default"
npm run build
```

Every time you **change** the API URL or API key requirements, run **`npm run build` again** before redeploying the Worker.

---

### Step 4 — Deploy the frontend to Cloudflare (free)

1. Create a free account at [https://dash.cloudflare.com](https://dash.cloudflare.com).
2. On your laptop, install Wrangler once: `npm install -g wrangler` (or use `npx wrangler` without global install).
3. Log in: `npx wrangler login` and complete the browser flow.
4. From the **`frontend/`** folder (after Step 3’s `npm run build` succeeded):

   ```bash
   cd frontend
   npx wrangler deploy
   ```

5. Wrangler prints a **workers.dev** URL (or your custom domain if you attach one). Open it — you should get the LabMind UI, and Stage 2/3 should call your Render API.

**If the UI cannot reach the API:** check the browser **Network** tab for blocked requests; confirm `VITE_BACKEND_URL` exactly matches Render (including `https://`). CORS is open on the backend by default, so mixed origins are usually fine.

---

### Step 5 — After you change code

- **Backend only changed:** push to GitHub → Render auto-redeploys (if auto-deploy is on).
- **Frontend only changed:** `npm run build` again with the same `VITE_*` exports → `npx wrangler deploy` again from `frontend/`.
- **API URL changed:** repeat Step 3 + Step 4 so the new URL is inside the client bundle.

---

## Other free options (same idea)

| Frontend | Backend |
|----------|---------|
| **Cloudflare Workers** (above — matches this repo’s build) | **Fly.io** [free allowance](https://fly.io/docs/about/pricing/) — `fly launch` in `backend/`, set secrets with `fly secrets set` |
| Same | **Railway** — often starts with **trial credit**, not unlimited free; good DX |

You do **not** have to use Vercel. This project’s production frontend build targets **Cloudflare**; using Cloudflare for the UI is the path of least resistance.

---

## What this repo builds (technical)

| Part | Output | Fits free tier |
|------|--------|----------------|
| **Frontend** | `frontend/npm run build` → `dist/client` + `dist/server` Worker + `wrangler.json` | **Cloudflare Workers** |
| **Backend** | Express in `backend/` | **Render / Fly / etc.** |

There is **no** plain `index.html`-only folder for “drag to Netlify static hosting” without changing the build.

---

## Optional: Postgres for reviews (still free tier)

Render’s disk is **not** guaranteed persistent for SQLite. For hackathon demos SQLite may be enough; for **saved reviews across deploys**, create a free Postgres (Neon, Supabase, or Render Postgres), set `DATABASE_URL` on the **backend** service only, redeploy.

---

## Render deploy failed with “Exited with status 1”

1. Open the deploy **Logs** tab. If you see **`ERR_DLOPEN_FAILED`**, **`sqlite3-binding`**, or **`GLIBC_2.xx not found`** on **`libm.so.6`**, the **`sqlite3` native `.node` binary** does not match Render’s OS. **Fixes (pick one):** set **Build Command** to **`npm run render-build`**, then **Clear build cache & deploy**; **or** set **`DATABASE_URL`** to a Postgres URL so the app **never loads `sqlite3`**; **or** use the **Docker** path in [SQLite on Render](#sqlite-on-render-no-postgres).
2. Set **`NODE_VERSION=20.18.0`** if the log shows **Node 24** or odd native-module ABI behavior.
3. Confirm **Root Directory** is **`backend`**, **Start Command** is **`npm start`**, and **Build Command** is **`npm install`** (Postgres only) **or** **`npm run render-build`** (SQLite).
4. The server listens on **`0.0.0.0:$PORT`** in `server.js` for production starts.

---

## Checklist

- [ ] `https://YOUR-API.onrender.com/health` returns 200
- [ ] `VITE_BACKEND_URL` in the **frontend build** equals that API origin (`https`, no trailing slash)
- [ ] All Tavily / Groq / Gemini keys set on **Render**
- [ ] `LABMIND_STRICT_PLAN_GATES` / `LABMIND_DUAL_FEEDBACK_AB` set the way you want on **Render**

---

## Note on “Vercel v0”

**[v0.dev](https://v0.dev)** is a **UI generator**, not a host for this app. **Vercel.com** can host many frontends, but **this** frontend is configured for **Cloudflare Workers** out of the box; using Vercel would require a **different Vite / TanStack build setup** (see older notes in git history or ask to add a Nitro/Vercel migration as a separate task).

---

## Quick reference

| Variable | Where |
|----------|--------|
| `VITE_BACKEND_URL` | **Your laptop** when you run `npm run build` in `frontend/` |
| `VITE_LABMIND_API_KEY`, `VITE_LABMIND_TENANT_ID` | Same, if the API enforces `LABMIND_API_KEY` |
| Tavily, Groq, Gemini, strict/dual, `DATABASE_URL` | **Render** (backend) environment only |
