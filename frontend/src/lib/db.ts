import Dexie, { type EntityTable } from 'dexie';

export type CachedProduct = {
  id: string;
  barcode: string;
  name: string;
  price: number;
  stock: number;
  vat: number;
};

const db = new Dexie('POSDatabase') as Dexie & {
  products: EntityTable<CachedProduct, 'id'>;
};

db.version(1).stores({
  products: 'id, barcode, name, price, stock, vat',
});

db.version(2).stores({
  products: 'id, barcode, name, price',
});

export { db };
