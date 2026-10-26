import Dexie, { type Table } from 'dexie';

/**
 * Rule 14: Dexie stores the sellable catalog and the offline invoice outbox.
 * Never add access tokens, refresh tokens, passwords, or API keys to these tables
 * or to localStorage from this module.
 */

const SECRET_KEYS = new Set([
  'token',
  'access_token',
  'refresh_token',
  'password',
  'secret',
  'authorization',
  'api_key',
  'apikey',
]);

export type LocalProduct = {
  id: string;
  barcode: string;
  name: string;
  price: number;
  stock: number;
  vat_percent: number;
  cart_id: string;
  branch_id: number | null;
};

export type OutboxInvoice = {
  id: string;
  total_amount: number;
  sync_status: 'pending' | 'synced';
  created_at: string;
};

class PosDatabase extends Dexie {
  products!: Table<LocalProduct, string>;
  outbox_invoices!: Table<OutboxInvoice, string>;

  constructor() {
    super('ai_erp_pos');
    this.version(1).stores({
      products: 'id, barcode, name, price, stock, vat_percent',
      outbox_invoices: 'id, sync_status, created_at',
    });
  }
}

export const db = new PosDatabase();

export function sanitizeBarcode(value: string): string | null {
  const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 80);
  if (!cleaned || cleaned.length > 80) {
    return null;
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9 ._+\/-]{0,79}$/.test(cleaned)) {
    return null;
  }
  return cleaned;
}

function assertNoSecrets(row: object) {
  for (const key of Object.keys(row)) {
    if (SECRET_KEYS.has(key.toLowerCase())) {
      throw new Error('Refusing to store credentials in Dexie');
    }
  }
}

export async function replaceLocalProducts(rows: LocalProduct[]) {
  for (const row of rows) {
    assertNoSecrets(row);
  }
  await db.transaction('rw', db.products, async () => {
    await db.products.clear();
    if (rows.length > 0) {
      await db.products.bulkPut(rows);
    }
  });
}
