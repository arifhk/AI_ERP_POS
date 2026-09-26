'use client';

import { useEffect, useState } from 'react';
import Papa from 'papaparse';
import { API_BASE, apiFetch } from '../utils/api';
import { getStoredRole, isAdminRole } from '../utils/auth';

const SAMPLE_HEADERS = [
  'Code_Number',
  'Design_Number',
  'Brand',
  'Vendor',
  'EC_Product',
  'Purchase_CPU',
  'MRP_Sale',
  'WSP',
  'VAT_Type',
  'Sale_VAT',
  'Additional_Barcodes',
  'Variant_Color',
  'Variant_Size',
  'Variant_Custom_Price',
] as const;

const SAMPLE_ROWS = [
  ['1001', '01', 'Plus Point', 'Main Vendor', 'No', '400', '800', '600', 'Default', '', '8901001,8901002', 'Red', 'M', ''],
  ['1001', '01', 'Plus Point', 'Main Vendor', 'No', '400', '800', '600', 'Default', '', '', 'Blue', 'L', '850'],
];

type ImportError = { row: number; message: string };

type BulkVariant = {
  row: number;
  attributes: Record<string, string>;
  inherit_parent: boolean;
  mrp: number | null;
  price: number | null;
};

type BulkProduct = {
  row: number;
  code_number: string;
  design_number: string;
  brand: string;
  vendor: string;
  ec_product: boolean;
  purchase_price: number;
  mrp: number;
  price: number;
  wsp: number;
  custom_vat: boolean;
  sale_vat: number;
  additional_barcodes: string[];
  variants: BulkVariant[];
};

type ImportResult = {
  created: number;
  variants_created: number;
  skipped: number;
  queued?: number;
  pending_approval?: boolean;
  errors: ImportError[];
};

function cell(row: Record<string, string>, header: (typeof SAMPLE_HEADERS)[number]) {
  return (row[header] ?? '').trim();
}

function parseFlag(value: string) {
  return ['1', 'true', 'yes', 'y'].includes(value.trim().toLowerCase());
}

function parseAmount(value: string) {
  if (!value.trim()) {
    return 0;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    return null;
  }
  return number;
}

export function downloadSampleCsv() {
  const lines = [SAMPLE_HEADERS.join(','), ...SAMPLE_ROWS.map((row) => row.map((value) => (value.includes(',') ? `"${value}"` : value)).join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'product-import-sample.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export function parseProductCsv(file: File) {
  return new Promise<{ products: BulkProduct[]; errors: ImportError[] }>((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      complete(result) {
        resolve(groupRows(result.data));
      },
      error(error) {
        reject(error);
      },
    });
  });
}

function groupRows(rows: Record<string, string>[]) {
  const errors: ImportError[] = [];
  const groups = new Map<string, BulkProduct>();

  rows.forEach((row, index) => {
    const line = index + 2;
    const codeNumber = cell(row, 'Code_Number');
    const designNumber = cell(row, 'Design_Number');
    if (!codeNumber || !designNumber) {
      errors.push({ row: line, message: 'Code number and design number are required.' });
      return;
    }

    const purchase = parseAmount(cell(row, 'Purchase_CPU'));
    const mrp = parseAmount(cell(row, 'MRP_Sale'));
    const wsp = parseAmount(cell(row, 'WSP'));
    const saleVat = parseAmount(cell(row, 'Sale_VAT'));
    const customPrice = cell(row, 'Variant_Custom_Price') ? parseAmount(cell(row, 'Variant_Custom_Price')) : null;
    if (purchase === null || mrp === null || wsp === null || saleVat === null || customPrice === null) {
      errors.push({ row: line, message: 'A price value is not a valid number.' });
      return;
    }

    const vatType = cell(row, 'VAT_Type').toLowerCase();
    if (vatType && vatType !== 'default' && vatType !== 'custom') {
      errors.push({ row: line, message: 'VAT_Type must be Default or Custom.' });
      return;
    }

    const key = `${codeNumber.toLowerCase()}|${designNumber.toLowerCase()}`;
    let product = groups.get(key);
    if (!product) {
      product = {
        row: line,
        code_number: codeNumber,
        design_number: designNumber,
        brand: cell(row, 'Brand'),
        vendor: cell(row, 'Vendor'),
        ec_product: parseFlag(cell(row, 'EC_Product')),
        purchase_price: purchase,
        mrp,
        price: mrp,
        wsp,
        custom_vat: vatType === 'custom',
        sale_vat: saleVat,
        additional_barcodes: cell(row, 'Additional_Barcodes')
          .split(',')
          .map((code) => code.trim())
          .filter(Boolean),
        variants: [],
      };
      groups.set(key, product);
    }

    const color = cell(row, 'Variant_Color');
    const size = cell(row, 'Variant_Size');
    if (!color && !size && customPrice === null) {
      return;
    }
    const attributes: Record<string, string> = {};
    if (color) {
      attributes.Color = color;
    }
    if (size) {
      attributes.Size = size;
    }
    product.variants.push({
      row: line,
      attributes,
      inherit_parent: customPrice === null,
      mrp: customPrice,
      price: customPrice,
    });
  });

  return { products: [...groups.values()], errors };
}

export function BulkProductImport({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (message: string) => void;
}) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<{ products: BulkProduct[]; errors: ImportError[] } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsAdmin(isAdminRole(getStoredRole()));
  }, []);

  async function onFile(file: File | undefined) {
    setResult(null);
    setError(null);
    if (!file) {
      setParsed(null);
      setFileName('');
      return;
    }
    setFileName(file.name);
    try {
      setParsed(await parseProductCsv(file));
    } catch {
      setParsed(null);
      setError('Could not read that CSV file.');
    }
  }

  async function importProducts() {
    if (!parsed || parsed.products.length === 0) {
      setError('No valid products to import.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await apiFetch(`${API_BASE}/products/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: 1,
          branch_id: 1,
          products: parsed.products,
        }),
      });
      const payload = (await response.json()) as ImportResult & { detail?: string };
      if (!response.ok) {
        throw new Error(typeof payload.detail === 'string' ? payload.detail : 'Import failed.');
      }
      const merged = [...parsed.errors, ...(payload.errors ?? [])];
      setResult({ ...payload, errors: merged });
      if (payload.pending_approval) {
        onImported(`Submitted ${payload.queued ?? parsed.products.length} products for approval.`);
      } else if (payload.created > 0) {
        onImported(`Imported ${payload.created} products and ${payload.variants_created} variants.`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Import failed.');
    } finally {
      setBusy(false);
    }
  }

  const previewErrors = result?.errors ?? parsed?.errors ?? [];

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="bulk-import-title">
      <button type="button" aria-label="Close bulk import" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute inset-x-0 top-8 mx-auto flex max-h-[90vh] w-[min(720px,calc(100%-2rem))] flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 id="bulk-import-title" className="text-lg font-semibold text-gray-900">
              Bulk Import
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Rows that share a Code Number and Design Number become one product. Name, category, item code, and SKUs are assigned from Code Master. Standard users submit the batch for approval.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-sm font-semibold text-gray-500 hover:bg-gray-100">
            Close
          </button>
        </div>
        <div className="space-y-4 overflow-y-auto px-5 py-5">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={downloadSampleCsv}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Download Sample CSV
            </button>
            <label className="cursor-pointer rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
              Choose CSV
              <input
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(event) => void onFile(event.target.files?.[0])}
              />
            </label>
          </div>
          {fileName ? <p className="text-sm text-gray-600">{fileName}</p> : null}
          {parsed ? (
            <p className="text-sm text-gray-700">
              {parsed.products.length} products ready
              {parsed.errors.length > 0 ? `, ${parsed.errors.length} rows skipped while reading` : ''}.
            </p>
          ) : null}
          {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          {result ? (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {result.pending_approval
                ? `Submitted ${result.queued ?? 0} products for approval. Skipped ${result.skipped}.`
                : `Created ${result.created} products and ${result.variants_created} variants. Skipped ${result.skipped}.`}
            </p>
          ) : null}
          {previewErrors.length > 0 ? (
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {previewErrors.slice(0, 50).map((item) => (
                <li key={`${item.row}-${item.message}`}>
                  Row {item.row}: {item.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-100 px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !parsed || parsed.products.length === 0}
            onClick={() => void importProducts()}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:bg-indigo-300"
          >
            {busy ? 'Importing...' : isAdmin ? 'Import products' : 'Submit for approval'}
          </button>
        </div>
      </div>
    </div>
  );
}
