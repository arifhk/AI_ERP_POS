# Deploy & Publish — AI ERP & POS

Host the **Next.js** app on **Vercel** and the **FastAPI** API on **Render**. Deploy the backend first so you have a live API URL before building the frontend (`NEXT_PUBLIC_API_URL` is inlined at build time).

## 1. Push the monorepo to GitHub

From the project root (`AI_ERP_POS`):

```bash
git status
git add .
git commit -m "Prepare production deploy for Vercel and Render"
```

Create a GitHub repository (empty, no README), then:

```bash
git remote add origin https://github.com/<YOUR_GITHUB_USER>/<YOUR_REPO>.git
git branch -M main
git push -u origin main
```

Confirm `.env` files were **not** committed (they are gitignored). Only `.env.example` files should be on GitHub.

---

## 2. Deploy the FastAPI backend on Render

Render’s Blueprint UI looks for `render.yaml` at the **repository root**. This repo keeps the blueprint at `backend/render.yaml`. Use either method below.

### Option A — Blueprint (recommended)

1. Open [Render Dashboard](https://dashboard.render.com/) → **New** → **Blueprint**.
2. Connect the GitHub repo.
3. If asked for a Blueprint path, set `backend/render.yaml`.
4. If the UI only scans the repo root, copy `backend/render.yaml` to the repository root, set `rootDir: backend` on the web service, commit, and apply the Blueprint again.
5. Apply. Render creates:
   - Web service `ai-erp-pos-api`
   - PostgreSQL database `ai-erp-pos-db`
   - `DATABASE_URL` and a generated `SECRET_KEY`

### Option B — Manual web service

1. **New** → **Web Service** → select the same GitHub repo.
2. **Root Directory:** `backend`
3. **Runtime:** Python
4. **Build command:** `pip install -r requirements.txt`
5. **Start command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
6. **New** → **PostgreSQL** (Free). In the web service, add env var `DATABASE_URL` from the database **Internal** or **External** connection string.
7. Add the other environment variables listed in section 4.

The API URL will look like:

`https://ai-erp-pos-api.onrender.com`

(Render may append a random suffix. Copy the exact URL from the service page.)

Open `https://<YOUR-RENDER-SERVICE>.onrender.com/health` — you should see `{"status":"ok"}`.

The first request on a free instance can take ~30–60 seconds (cold start).

---

## 3. Deploy the Next.js frontend on Vercel

1. Open [Vercel](https://vercel.com/) → **Add New** → **Project** → import the GitHub repo.
2. **Root Directory:** `frontend` (Edit → `frontend`).
3. Framework: **Next.js** (auto-detected). `frontend/vercel.json` sets `npm ci` and `npm run build`.
4. **Environment variables** (Production, Preview, Development):

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_API_URL` | `https://<YOUR-RENDER-SERVICE>.onrender.com` (no trailing slash) |

5. Deploy.

The frontend URL will look like `https://<YOUR-VERCEL-PROJECT>.vercel.app`.

**Rebuild after changing `NEXT_PUBLIC_API_URL`.** Next.js embeds that value at build time.

### CORS (required)

On the Render web service, set:

```text
CORS_ORIGINS=https://<YOUR-VERCEL-PROJECT>.vercel.app
```

Add more origins with commas (custom domains, preview URLs):

```text
CORS_ORIGINS=https://<YOUR-VERCEL-PROJECT>.vercel.app,https://<YOUR-VERCEL-PROJECT>-git-main-<team>.vercel.app
```

Then **Manual Deploy** the Render service so CORS reloads.

### Optional: same-origin API proxy

`frontend/vercel.json` rewrites `/pos-api/:path*` to Render. After you know the Render hostname:

1. Edit `frontend/vercel.json` and replace `YOUR-RENDER-SERVICE` with your real Render subdomain.
2. Set `NEXT_PUBLIC_API_URL` to `https://<YOUR-VERCEL-PROJECT>.vercel.app/pos-api`.
3. Redeploy Vercel.

Direct `NEXT_PUBLIC_API_URL=https://<YOUR-RENDER-SERVICE>.onrender.com` is enough if CORS is set.

---

## 4. Production environment variables

### Render (backend)

| Variable | Notes |
| --- | --- |
| `SECRET_KEY` | Long random string. Blueprint can generate it. Never use the local default. |
| `ALGORITHM` | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `480` (8 hours) |
| `DATABASE_URL` | Render Postgres connection string. The app rewrites `postgres://` → `postgresql+asyncpg://`. |
| `CORS_ORIGINS` | Exact Vercel origin(s), comma-separated, no trailing slash. |

Do not rely on SQLite on Render: the filesystem is ephemeral.

### Vercel (frontend)

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | Live backend origin, **no trailing slash**. Example: `https://ai-erp-pos-api.onrender.com` |

Local `.env` files stay on your machine. Set the same keys in each host’s dashboard.

---

## 5. Suggested order of operations

1. Push `main` to GitHub.
2. Deploy Render (API + Postgres). Confirm `/health` and `/docs`.
3. Set `CORS_ORIGINS` to a placeholder until Vercel exists, or wait until step 5.
4. Deploy Vercel with `NEXT_PUBLIC_API_URL` pointing at Render.
5. Set `CORS_ORIGINS` to the Vercel URL and restart/redeploy Render.
6. Sign in on the live frontend. If login fails, check CORS, `NEXT_PUBLIC_API_URL`, and Render logs.

---

## 6. Custom domains

- Vercel: Project → **Domains**.
- Render: Service → **Custom Domains**.
- Then update `NEXT_PUBLIC_API_URL` (if the API hostname changed) and `CORS_ORIGINS` to `https://your-frontend-domain`. Redeploy Vercel after changing `NEXT_PUBLIC_*`.

---

## 7. Mobile app (Expo)

Production builds should call the **Render** URL, not a LAN IP. Update `API_BASE` in `mobile/screens/LoginScreen.js` and `mobile/screens/DashboardScreen.js` (or a shared config) to `https://<YOUR-RENDER-SERVICE>.onrender.com`.
