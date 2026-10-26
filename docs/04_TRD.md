# 04_TRD: Architecture and Tech Stack

## Locked Tech Stack

- **Frontend:** Next.js App Router, React, Tailwind CSS on port 3000.
- **Backend:** Python FastAPI (SQLModel) on port 8000. Uvicorn serves the API.
- **Database:** Supabase PostgreSQL.
- **Cache and rate limit:** Upstash Redis.
- **Offline store:** Dexie.js (IndexedDB).

Do not add another framework, database, or cache without an explicit decision.

## Folder Structure

- `/frontend` — Next.js app. Dexie lives in `src/lib/db.ts`. Upstash lives in `src/lib/redis.ts` and is imported only from server code. POS UI is `src/app/pos/page.tsx`. Catalog route is `src/app/api/products/route.ts`.
- `/backend` — Python API (`main.py`, `routers/`, `models.py`, `requirements.txt`).
- `/docs` — architecture, flow, schema, plan, and the security shield.

## Server-Side Environment Rules

- Secrets stay on the server. `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, Supabase service-role keys, and the JWT signing key are never prefixed with `NEXT_PUBLIC_` and never imported into client components.
- The only browser-visible API origin is `NEXT_PUBLIC_API_URL` (local default `http://localhost:8000`).
- Production browser source maps stay off (`productionBrowserSourceMaps: false`).
- The Next.js catalog route may call only an allowlisted backend origin (local port 8000 or the known API host). It must not fetch a URL supplied by the client.
