# 02_AppFlow: POS Interface State Machine

## Navigation Routes

- `/login` — authentication.
- `/dashboard` — analytics and system status.
- `/pos` — cashier terminal.

## `/pos` State Machine

1. **Initial sync.** The cashier runs Sync Products. The browser calls same-origin `/api/products`. That route checks Upstash Redis (`pos:products:{branch_id}`), and on a miss loads the catalog from the Python API on port 8000, then writes Dexie `products`.
2. **Local Dexie scan.** Focus stays on the barcode field. A scan reads `db.products.where('barcode').equals(scannedCode).first()` and adds the line to the cart. This step does not call the network.
3. **Cart shortcuts.**
   - F2: change quantity
   - F3: exchange
   - F4: remove the selected line
   - F6: hold the invoice
   - F10: cancel the invoice
4. **Checkout / outbox sync.** The sale is written to Dexie `outbox_invoices` first. A background job posts the outbox to the Python backend, which persists it in Supabase. The terminal keeps selling if port 8000 is down and shows an unable-to-sync state.

## Error and Empty States

- Backend unreachable: show the offline sync badge and keep local scan, hold, and outbox writes available.
- Unknown barcode: leave the cart unchanged and show a local "no item matches" notice.
- Empty catalog: the cached-items badge reads 0 until Sync Products succeeds.
