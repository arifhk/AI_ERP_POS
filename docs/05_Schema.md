# 05_Schema: Data Models

The live Supabase tables are created from `backend/models.py`. Product and user primary keys are integers. Dexie mirrors the sellable catalog; it is not a second source of truth.

## 1. Products (Supabase, then Redis, then Dexie)

| Field | Notes |
| --- | --- |
| `id` | Primary key. Integer in Supabase. Dexie stores a string sellable id (`p-{id}` or `v-{id}`). |
| `barcode` | String, indexed. Exact match for the scanner. |
| `name` | String, indexed in Dexie. |
| `price` | Decimal. Indexed in Dexie. |
| `stock` | Integer. Dexie column mapped from `stock_quantity`. Indexed in Dexie. |
| `vat_percent` | Decimal. Dexie column mapped from `sale_vat`. Indexed in Dexie. |
| `branch_id` | Foreign key. Cache key and authorization scope. |

Redis key: `pos:products:{branch_id}` with a 3600 second TTL. The value is the sanitized sellable list, not raw ORM rows and not images.

## 2. Invoices

| Field | Notes |
| --- | --- |
| `id` | Primary key |
| `total_amount` | Decimal |
| `sync_status` | `pending` or `synced` |
| `created_at` | Timestamp |

## 3. Local Dexie `outbox_invoices`

Temporary offline sales waiting for background sync.

| Field | Notes |
| --- | --- |
| `id` | Primary key |
| `total_amount` | Decimal |
| `sync_status` | `pending` or `synced` |
| `created_at` | ISO timestamp |

Dexie `products` indexes: `id, barcode, name, price, stock, vat_percent`.

Neither table stores access tokens, refresh tokens, passwords, or API keys.
