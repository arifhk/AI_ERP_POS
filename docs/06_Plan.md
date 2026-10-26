# 06_Plan: Sequential Execution

- [x] Phase 1: Environment setup (Next.js and Python running).
- [x] Phase 2: Dexie.js and Redis setup (`frontend/src/lib/db.ts`, `frontend/src/lib/redis.ts`).
- [x] Phase 3: Catalog API checks Redis, verifies the session and branch, fetches the Python backend on a miss, then updates Redis.
- [x] Phase 4: Sync Products writes the catalog with Dexie `bulkPut` and refreshes the cached-items badge.
- [x] Phase 5: POS barcode scanner reads the local Dexie `products` table and does not call the network.
- [ ] Phase 6: Offline checkout writes `outbox_invoices` and drains that queue in the background.
