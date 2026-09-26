'use client';

import { useEffect, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useForm, useWatch, type Control } from 'react-hook-form';
import { MasterControls } from './MasterControls';
import { PosCameraScanner } from './PosCameraScanner';
import { API_BASE, apiFetch } from '../utils/api';
import { compressImageToWebp } from '../utils/compressImage';

const Barcode = dynamic(() => import('react-barcode'), { ssr: false });

export type VariantAttribute = {
  name: string;
  values: string[];
};

export type VariantItem = {
  sku: string;
  combination: Record<string, string>;
  inherit_parent: boolean;
  stock_quantity: number;
  purchase_price: string;
  mrp: string;
  vendor: string;
  custom_vat: boolean;
  sale_vat: string;
  image: string | null;
};

export type CatalogVariant = {
  id?: number;
  sku: string;
  attributes: Record<string, string>;
  inherit_parent: boolean;
  stock_quantity: number;
  purchase_price?: number | null;
  mrp?: number | null;
  vendor?: string | null;
  custom_vat?: boolean;
  sale_vat?: number | null;
  image?: string | null;
  effective_price?: number;
};

export type ProductVariations = {
  attributes: VariantAttribute[];
  items: VariantItem[];
};

export type CatalogProduct = {
  id: number;
  name: string;
  barcode: string;
  additional_barcodes?: string[];
  image?: string | null;
  category?: string;
  sub_category?: string;
  brand?: string;
  vendor?: string;
  design_code?: string;
  design_number?: string;
  item_code?: string | null;
  code_id?: number | null;
  category_id?: number | null;
  sub_category_id?: number | null;
  brand_id?: number | null;
  vendor_id?: number | null;
  ec_product?: boolean;
  purchase_price?: number;
  mrp?: number;
  wsp?: number;
  price_incl_vat?: boolean;
  sdc_vat_code?: string;
  sale_vat?: number;
  custom_vat?: boolean;
  variations?: ProductVariations;
  variants?: CatalogVariant[];
  price: number;
  stock_quantity: number;
  is_active: boolean;
  is_hidden?: boolean;
};

type ProductFormValues = {
  name: string;
  sku: string;
  stock_quantity: string;
  category: string;
  sub_category: string;
  brand: string;
  vendor: string;
  design_code: string;
  ec_product: boolean;
  purchase_price: string;
  mrp: string;
  wsp: string;
  price_incl_vat: boolean;
  sdc_vat_code: string;
  sale_vat: string;
};

const ATTRIBUTES = ['Size', 'Color', 'Material', 'Style'];

const fieldClass =
  'w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500';

function generateSku(existing: Set<string>) {
  let sku = '';
  do {
    const stamp = Date.now().toString().slice(-9);
    const suffix = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0');
    sku = `${stamp}${suffix}`;
  } while (existing.has(sku));
  return sku;
}

export function cloneCatalogProduct(product: CatalogProduct, taken: Set<string>): CatalogProduct {
  const sku = generateSku(taken);
  return {
    ...product,
    name: `${product.name} Copy`,
    barcode: sku,
    variants: (product.variants ?? []).map((variant, index) => ({
      ...variant,
      id: undefined,
      sku: `${sku}-${String(index + 1).padStart(2, '0')}`,
    })),
  };
}

function splitValues(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function variantsFromProduct(product: CatalogProduct | null): VariantItem[] {
  if (!product?.variants?.length) {
    return [];
  }
  return product.variants.map((variant) => ({
    sku: variant.sku,
    combination: variant.attributes ?? {},
    inherit_parent: variant.inherit_parent !== false,
    stock_quantity: variant.stock_quantity ?? 0,
    purchase_price: variant.purchase_price != null ? String(variant.purchase_price) : '',
    mrp: variant.mrp != null ? String(variant.mrp) : '',
    vendor: variant.vendor ?? '',
    custom_vat: Boolean(variant.custom_vat),
    sale_vat: variant.sale_vat != null ? String(variant.sale_vat) : '',
    image: variant.image ?? null,
  }));
}

function readApiError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== 'object' || !('detail' in payload)) {
    return fallback;
  }
  const detail = payload.detail;
  if (typeof detail === 'string') {
    return detail;
  }
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0];
    if (first && typeof first === 'object' && 'msg' in first && typeof first.msg === 'string') {
      return first.msg;
    }
  }
  return fallback;
}

function percent(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return '—';
  }
  return `${value.toFixed(2)}%`;
}

function ProfitReadouts({ control }: { control: Control<ProductFormValues> }) {
  const purchase = useWatch({ control, name: 'purchase_price' });
  const mrp = useWatch({ control, name: 'mrp' });
  const cpu = Number(purchase);
  const sale = Number(mrp);
  const onTp = cpu > 0 && Number.isFinite(sale) ? ((sale - cpu) / cpu) * 100 : null;
  const onMrp = sale > 0 && Number.isFinite(cpu) ? ((sale - cpu) / sale) * 100 : null;

  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Profit (%) on TP</p>
        <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-800">
          {percent(onTp)}
        </p>
      </div>
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Profit (%) on MRP</p>
        <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-800">
          {percent(onMrp)}
        </p>
      </div>
    </div>
  );
}

function SkuBarcode({ control }: { control: Control<ProductFormValues> }) {
  const sku = useWatch({ control, name: 'sku' })?.trim() ?? '';
  return (
    <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Primary barcode</p>
      {sku ? (
        <div className="overflow-hidden rounded-md bg-white px-2 py-3 [&_svg]:h-auto [&_svg]:max-w-full">
          <Barcode
            value={sku}
            format="CODE128"
            width={1.4}
            height={56}
            fontSize={12}
            margin={0}
            displayValue
            background="#ffffff"
            lineColor="#111827"
          />
        </div>
      ) : (
        <p className="text-sm text-gray-500">Enter a SKU to generate a barcode.</p>
      )}
    </div>
  );
}

function cartesian(attributes: VariantAttribute[]) {
  return attributes.reduce<Record<string, string>[]>((rows, attribute) => {
    if (rows.length === 0) {
      return attribute.values.map((value) => ({ [attribute.name]: value }));
    }
    return rows.flatMap((row) => attribute.values.map((value) => ({ ...row, [attribute.name]: value })));
  }, []);
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      {children}
    </label>
  );
}

export function ProductEditor({
  mode,
  product,
  takenSkus: _takenSkus,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit';
  product: CatalogProduct | null;
  takenSkus: Set<string>;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const variations = product?.variations;
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [image, setImage] = useState<string | null>(product?.image ?? null);
  const [imageBytes, setImageBytes] = useState<number | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [barcodes, setBarcodes] = useState<string[]>(product?.additional_barcodes ?? []);
  const [barcodeDraft, setBarcodeDraft] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [codes, setCodes] = useState<Array<{ id: number; code_number: string; name: string; category_id: number; sub_category_id: number }>>([]);
  const [categories, setCategories] = useState<Array<{ id: number; name: string }>>([]);
  const [subCategories, setSubCategories] = useState<Array<{ id: number; name: string; category_id: number }>>([]);
  const [brands, setBrands] = useState<Array<{ id: number; name: string }>>([]);
  const [vendors, setVendors] = useState<Array<{ id: number; name: string }>>([]);
  const [codeId, setCodeId] = useState(product?.code_id ? String(product.code_id) : '');
  const [categoryId, setCategoryId] = useState(product?.category_id ? String(product.category_id) : '');
  const [subCategoryId, setSubCategoryId] = useState(product?.sub_category_id ? String(product.sub_category_id) : '');
  const [brandId, setBrandId] = useState(product?.brand_id ? String(product.brand_id) : '');
  const [vendorId, setVendorId] = useState(product?.vendor_id ? String(product.vendor_id) : '');
  const [designNumber, setDesignNumber] = useState(product?.design_number ?? '');
  const [codeModal, setCodeModal] = useState<'create' | 'update' | null>(null);
  const [codeForm, setCodeForm] = useState({ code_number: '', name: '', category_id: '', sub_category_id: '' });
  const [codeError, setCodeError] = useState<string | null>(null);
  const [attributeChoice, setAttributeChoice] = useState('');
  const [customAttribute, setCustomAttribute] = useState('');
  const [attributeValues, setAttributeValues] = useState('');
  const [attributes, setAttributes] = useState<VariantAttribute[]>(variations?.attributes ?? []);
  const [colorsText, setColorsText] = useState('');
  const [sizesText, setSizesText] = useState('');
  const [items, setItems] = useState<VariantItem[]>(() => variantsFromProduct(product));
  const [defaultVat, setDefaultVat] = useState(5);
  const [customVat, setCustomVat] = useState(product?.custom_vat ?? false);

  const { register, handleSubmit, setValue, control, getValues } = useForm<ProductFormValues>({
    defaultValues: {
      name: product?.name ?? '',
      sku: mode === 'edit' ? product?.barcode ?? '' : '',
      stock_quantity: product ? String(product.stock_quantity) : '',
      category: product?.category ?? '',
      sub_category: product?.sub_category ?? '',
      brand: product?.brand ?? '',
      vendor: product?.vendor ?? '',
      design_code: product?.design_code ?? '',
      ec_product: product?.ec_product ?? false,
      purchase_price: product?.purchase_price ? String(product.purchase_price) : '',
      mrp: String(product?.mrp || product?.price || ''),
      wsp: product?.wsp ? String(product.wsp) : '',
      price_incl_vat: product?.price_incl_vat ?? false,
      sdc_vat_code: product?.sdc_vat_code ?? '',
      sale_vat: product?.custom_vat && product.sale_vat != null ? String(product.sale_vat) : '5',
    },
  });

  useEffect(() => {
    let cancelled = false;
    apiFetch(`${API_BASE}/masters/catalog`)
      .then(async (response) => {
        if (!response.ok || cancelled) {
          return;
        }
        const data = (await response.json()) as {
          codes: typeof codes;
          categories: typeof categories;
          sub_categories: typeof subCategories;
          brands: typeof brands;
          vendors: typeof vendors;
        };
        if (cancelled) {
          return;
        }
        setCodes(data.codes ?? []);
        setCategories(data.categories ?? []);
        setSubCategories(data.sub_categories ?? []);
        setBrands(data.brands ?? []);
        setVendors(data.vendors ?? []);
      })
      .catch(() => undefined);
    if (mode === 'create') {
      apiFetch(`${API_BASE}/products/next-sku`)
        .then(async (response) => {
          if (!response.ok || cancelled) {
            return;
          }
          const data = (await response.json()) as { sku?: string };
          if (!cancelled && data.sku) {
            setValue('sku', data.sku);
          }
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [mode, setValue]);

  useEffect(() => {
    const code = codes.find((item) => String(item.id) === codeId);
    if (!code) {
      return;
    }
    const category = categories.find((item) => item.id === code.category_id);
    const subCategory = subCategories.find((item) => item.id === code.sub_category_id);
    setCategoryId(String(code.category_id));
    setSubCategoryId(String(code.sub_category_id));
    setValue('name', code.name);
    setValue('category', category?.name ?? '');
    setValue('sub_category', subCategory?.name ?? '');
  }, [codeId, codes, categories, subCategories, setValue]);

  const selectedCode = codes.find((item) => String(item.id) === codeId);
  const itemCode = selectedCode && designNumber.trim() ? `${selectedCode.code_number}-${designNumber.trim()}` : product?.item_code ?? '';

  useEffect(() => {
    let cancelled = false;
    apiFetch(`${API_BASE}/settings/default-vat`)
      .then(async (response) => {
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as { default_vat?: number };
        if (!cancelled && typeof data.default_vat === 'number') {
          setDefaultVat(data.default_vat);
          if (!customVat) {
            setValue('sale_vat', String(data.default_vat));
          }
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [customVat, setValue]);

  function addBarcode(raw: string) {
    const code = raw.trim();
    if (!code) {
      return;
    }
    const sku = getValues('sku').trim().toLowerCase();
    const duplicate = sku === code.toLowerCase() || barcodes.some((item) => item.toLowerCase() === code.toLowerCase());
    setCameraOpen(false);
    setBarcodeDraft('');
    if (duplicate) {
      setFormError('That barcode is already on this product.');
      return;
    }
    setFormError(null);
    setBarcodes((current) => [...current, code]);
  }

  async function onImageSelected(file: File | undefined) {
    if (!file) {
      return;
    }
    setCompressing(true);
    setFormError(null);
    try {
      const compressed = await compressImageToWebp(file);
      setImage(compressed.dataUrl);
      setImageBytes(compressed.bytes);
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Could not compress the image.');
    } finally {
      setCompressing(false);
    }
  }

  function addAttribute() {
    const name = (attributeChoice === 'Custom' ? customAttribute : attributeChoice).trim();
    const values = attributeValues
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (!name || values.length === 0) {
      setFormError('Choose an attribute and enter at least one value.');
      return;
    }
    setFormError(null);
    setAttributes((current) => {
      const rest = current.filter((item) => item.name.toLowerCase() !== name.toLowerCase());
      return [...rest, { name, values }];
    });
    setAttributeValues('');
    setCustomAttribute('');
  }

  function generateItems() {
    const matrix: VariantAttribute[] = [];
    const colors = splitValues(colorsText);
    const sizes = splitValues(sizesText);
    if (colors.length > 0) {
      matrix.push({ name: 'Color', values: colors });
    }
    if (sizes.length > 0) {
      matrix.push({ name: 'Size', values: sizes });
    }
    const source = [...matrix, ...attributes.filter((attribute) => attribute.name !== 'Color' && attribute.name !== 'Size')];
    if (source.length === 0) {
      setFormError('Enter sizes, colors, or another attribute before generating items.');
      return;
    }
    const sku = getValues('sku').trim() || 'SKU';
    const combinations = cartesian(source);
    setAttributes(source);
    setItems(
      combinations.map((combination, index) => ({
        sku: `${sku}-${String(index + 1).padStart(2, '0')}`,
        combination,
        inherit_parent: true,
        stock_quantity: 0,
        purchase_price: '',
        mrp: '',
        vendor: '',
        custom_vat: false,
        sale_vat: '',
        image: null,
      })),
    );
    setFormError(null);
  }

  function updateItem(sku: string, patch: Partial<VariantItem>) {
    setItems((current) => current.map((item) => (item.sku === sku ? { ...item, ...patch } : item)));
  }

  async function reloadMasters() {
    const response = await apiFetch(`${API_BASE}/masters/catalog`);
    if (!response.ok) {
      return;
    }
    const data = (await response.json()) as {
      codes: typeof codes;
      categories: typeof categories;
      sub_categories: typeof subCategories;
      brands: typeof brands;
      vendors: typeof vendors;
    };
    setCodes(data.codes ?? []);
    setCategories(data.categories ?? []);
    setSubCategories(data.sub_categories ?? []);
    setBrands(data.brands ?? []);
    setVendors(data.vendors ?? []);
  }

  async function saveCode() {
    setCodeError(null);
    const response = await apiFetch(
      codeModal === 'update' ? `${API_BASE}/masters/code/${codeId}` : `${API_BASE}/masters/code`,
      {
        method: codeModal === 'update' ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code_number: codeForm.code_number.trim(),
          name: codeForm.name.trim(),
          category_id: Number(codeForm.category_id),
          sub_category_id: Number(codeForm.sub_category_id),
        }),
      },
    );
    if (!response.ok) {
      setCodeError('Could not save the code. Admins save immediately; other users send it for approval.');
      return;
    }
    setCodeModal(null);
    await reloadMasters();
  }

  async function onSubmit(values: ProductFormValues) {
    if (!itemCode) {
      setFormError('Select a code number and enter a design number. The item code is built from both.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    const mrp = Number(values.mrp);
    const payload = {
      name: values.name.trim(),
      barcode: values.sku.trim(),
      price: mrp,
      additional_barcodes: barcodes,
      design_number: designNumber.trim(),
      item_code: itemCode,
      code_id: codeId ? Number(codeId) : null,
      category_id: categoryId ? Number(categoryId) : null,
      sub_category_id: subCategoryId ? Number(subCategoryId) : null,
      brand_id: brandId ? Number(brandId) : null,
      vendor_id: vendorId ? Number(vendorId) : null,
      image,
      category: values.category.trim(),
      sub_category: values.sub_category.trim(),
      brand: brands.find((item) => String(item.id) === brandId)?.name ?? values.brand.trim(),
      vendor: vendors.find((item) => String(item.id) === vendorId)?.name ?? values.vendor.trim(),
      design_code: itemCode,
      ec_product: values.ec_product,
      purchase_price: Number(values.purchase_price) || 0,
      mrp,
      wsp: Number(values.wsp) || 0,
      price_incl_vat: values.price_incl_vat,
      sdc_vat_code: values.sdc_vat_code.trim(),
      custom_vat: customVat,
      sale_vat: customVat ? Number(values.sale_vat) || 0 : defaultVat,
      variations: { attributes, items },
      variants: items.map((item) => ({
        sku: item.sku,
        attributes: item.combination,
        inherit_parent: item.inherit_parent,
        stock_quantity: item.stock_quantity,
        purchase_price: item.inherit_parent ? null : Number(item.purchase_price) || 0,
        mrp: item.inherit_parent ? null : Number(item.mrp) || 0,
        price: item.inherit_parent ? null : Number(item.mrp) || 0,
        vendor: item.inherit_parent ? null : item.vendor.trim(),
        custom_vat: item.inherit_parent ? false : item.custom_vat,
        sale_vat: item.inherit_parent || !item.custom_vat ? null : Number(item.sale_vat) || 0,
        image: item.inherit_parent ? null : item.image,
      })),
    };

    try {
      const response =
        mode === 'create'
          ? await apiFetch(`${API_BASE}/products/`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                tenant_id: 1,
                branch_id: 1,
                is_active: true,
                ...payload,
              }),
            })
          : await apiFetch(`${API_BASE}/products/${product?.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });

      if (!response.ok) {
        let message = mode === 'create' ? 'Could not create the product.' : 'Could not update the product.';
        try {
          message = readApiError(await response.json(), message);
        } catch {
          // Keep the generic message if the error body is not JSON.
        }
        throw new Error(message);
      }

      const saved = (await response.json()) as { pending?: boolean };
      onSaved(
        saved.pending
          ? 'Submitted for Admin Approval'
          : mode === 'create'
            ? 'Product added successfully.'
            : 'Product updated successfully.',
      );
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Could not save the product.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="product-form-title">
      <button type="button" aria-label="Close product form" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 flex w-full max-w-6xl flex-col bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 id="product-form-title" className="text-lg font-semibold text-gray-900">
              {mode === 'create' ? 'Add New Product' : 'Edit Product'}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              SKU stays the primary barcode. Extra fields describe pricing, tax, and variations.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md px-2 py-1 text-sm font-semibold text-gray-500 hover:bg-gray-100 disabled:opacity-60"
          >
            Close
          </button>
        </div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.defaultPrevented) {
              return;
            }
            const target = event.target;
            if (!(target instanceof HTMLElement)) {
              return;
            }
            if (target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON') {
              return;
            }
            const form = event.currentTarget;
            const fields = [...form.querySelectorAll<HTMLElement>('input, select')].filter((element) => {
              if (element instanceof HTMLInputElement && (element.type === 'hidden' || element.type === 'file' || element.readOnly)) {
                return false;
              }
              if (element instanceof HTMLSelectElement && element.disabled) {
                return false;
              }
              if (element instanceof HTMLInputElement && element.disabled) {
                return false;
              }
              return true;
            });
            const index = fields.indexOf(target);
            if (index < 0) {
              return;
            }
            event.preventDefault();
            const next = fields[index + 1];
            if (next) {
              next.focus();
              return;
            }
            void handleSubmit(onSubmit)();
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
            <div className="grid gap-6 lg:grid-cols-2">
              <section className="space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Basic info</h3>
                <div>
                  <span className="mb-1 block text-sm font-medium text-gray-700">Code Number</span>
                  <div className="flex gap-2">
                    <select data-manual="true" value={codeId} onChange={(event) => setCodeId(event.target.value)} className={fieldClass}>
                      <option value="">Select</option>
                      {codes.map((code) => (
                        <option key={code.id} value={code.id}>
                          {code.code_number}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={() => { setCodeError(null); setCodeForm({ code_number: '', name: '', category_id: categoryId, sub_category_id: subCategoryId }); setCodeModal('create'); }} className="shrink-0 rounded-md border border-gray-300 px-2 text-xs font-semibold">Add</button>
                    <button type="button" disabled={!codeId} onClick={() => { const current = codes.find((code) => String(code.id) === codeId); setCodeForm({ code_number: current?.code_number ?? '', name: current?.name ?? '', category_id: String(current?.category_id ?? ''), sub_category_id: String(current?.sub_category_id ?? '') }); setCodeModal('update'); }} className="shrink-0 rounded-md border border-gray-300 px-2 text-xs font-semibold disabled:opacity-40">Edit</button>
                  </div>
                </div>
                <Field label="Name">
                  <input readOnly className={`${fieldClass} bg-gray-100`} {...register('name', { required: true })} />
                </Field>
                <Field label="SKU">
                  <input readOnly className={`${fieldClass} bg-gray-100 font-mono`} {...register('sku')} />
                </Field>
                <Field label="Design Number">
                  <input data-manual="true" value={designNumber} onChange={(event) => setDesignNumber(event.target.value)} className={fieldClass} placeholder="PP1200" />
                </Field>
                <Field label="Item Code">
                  <input readOnly value={itemCode} className={`${fieldClass} bg-gray-100 font-mono`} />
                </Field>
                <div>
                  <span className="mb-1 block text-sm font-medium text-gray-700">Custom Barcodes</span>
                  <div className="flex gap-2">
                    <input
                      value={barcodeDraft}
                      onChange={(event) => setBarcodeDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          addBarcode(barcodeDraft);
                        }
                      }}
                      className={`${fieldClass} font-mono`}
                      placeholder="Type or scan a barcode"
                    />
                    <button
                      type="button"
                      onClick={() => setCameraOpen(true)}
                      className="shrink-0 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                    >
                      Camera
                    </button>
                  </div>
                  {barcodes.length > 0 ? (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {barcodes.map((code) => (
                        <li key={code} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-800">
                          <span className="font-mono">{code}</span>
                          <button type="button" aria-label={`Remove barcode ${code}`} onClick={() => setBarcodes((current) => current.filter((item) => item !== code))}>
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <MasterControls label="Category" value={categoryId} options={categories} disabled={Boolean(codeId)} entityType="category" onChange={setCategoryId} onSaved={() => void reloadMasters()} />
                  <MasterControls label="Sub-category" value={subCategoryId} options={subCategories.filter((item) => !categoryId || String(item.category_id) === categoryId)} disabled={Boolean(codeId)} entityType="sub_category" categoryId={categoryId ? Number(categoryId) : null} onChange={setSubCategoryId} onSaved={() => void reloadMasters()} />
                  <MasterControls label="Brand" value={brandId} options={brands} entityType="brand" onChange={setBrandId} onSaved={() => void reloadMasters()} />
                  <MasterControls label="Vendor" value={vendorId} options={vendors} entityType="vendor" onChange={setVendorId} onSaved={() => void reloadMasters()} />
                </div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-indigo-600" {...register('ec_product')} />
                  EC Product
                </label>
                {codeModal ? (
                  <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close code form" onClick={() => setCodeModal(null)} />
                    <div className="relative w-full max-w-md space-y-3 rounded-xl bg-white p-4 shadow-xl">
                      <h3 className="text-sm font-semibold text-gray-900">{codeModal === 'create' ? 'Add code' : 'Edit code'}</h3>
                      <input value={codeForm.code_number} onChange={(event) => setCodeForm((current) => ({ ...current, code_number: event.target.value }))} placeholder="Code number" className={fieldClass} />
                      <input value={codeForm.name} onChange={(event) => setCodeForm((current) => ({ ...current, name: event.target.value }))} placeholder="Name" className={fieldClass} />
                      <select value={codeForm.category_id} onChange={(event) => setCodeForm((current) => ({ ...current, category_id: event.target.value }))} className={fieldClass}>
                        <option value="">Category</option>
                        {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </select>
                      <select value={codeForm.sub_category_id} onChange={(event) => setCodeForm((current) => ({ ...current, sub_category_id: event.target.value }))} className={fieldClass}>
                        <option value="">Sub-category</option>
                        {subCategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </select>
                      {codeError ? <p className="text-sm text-red-700">{codeError}</p> : null}
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setCodeModal(null)} className="rounded-md border border-gray-300 px-3 py-2 text-sm">Cancel</button>
                        <button type="button" onClick={() => void saveCode()} className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white">Save</button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Image and pricing</h3>
                <div>
                  <span className="mb-1 block text-sm font-medium text-gray-700">Product Image</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => void onImageSelected(event.target.files?.[0])}
                    className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-indigo-700"
                  />
                  <p className="mt-1 text-xs text-gray-500">Compressed to WebP, about 50KB, before upload.</p>
                  {compressing ? <p className="mt-2 text-sm text-gray-500">Compressing image…</p> : null}
                  {image ? (
                    <div className="mt-3 flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={image} alt="Compressed product" className="h-20 w-20 rounded-md border border-gray-200 object-cover" />
                      <div className="text-xs text-gray-500">
                        <p>WebP{imageBytes ? ` · ${Math.max(1, Math.round(imageBytes / 1024))}KB` : ''}</p>
                        <button type="button" onClick={() => { setImage(null); setImageBytes(null); }} className="mt-1 font-semibold text-red-600">
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Purchase (CPU)">
                    <input type="number" min="0" step="0.01" className={fieldClass} {...register('purchase_price')} />
                  </Field>
                  <Field label="MRP (Sale)">
                    <input required type="number" min="0" step="0.01" className={fieldClass} {...register('mrp', { required: true })} />
                  </Field>
                  <Field label="WSP">
                    <input type="number" min="0" step="0.01" className={fieldClass} {...register('wsp')} />
                  </Field>
                </div>
                <ProfitReadouts control={control} />
                <div className="space-y-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">VAT, tax and GP %</p>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-indigo-600" {...register('price_incl_vat')} />
                    Price Incl. VAT
                  </label>
                  <p className="text-xs text-gray-500">System default VAT is {defaultVat}%.</p>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <input
                      type="checkbox"
                      checked={customVat}
                      onChange={(event) => {
                        const enabled = event.target.checked;
                        setCustomVat(enabled);
                        if (!enabled) {
                          setValue('sale_vat', String(defaultVat));
                        }
                      }}
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600"
                    />
                    Custom VAT
                  </label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="SDC VAT Code">
                      <input className={fieldClass} {...register('sdc_vat_code')} />
                    </Field>
                    <Field label="Sale VAT (%)">
                      <input type="number" min="0" step="0.01" disabled={!customVat} className={fieldClass} {...register('sale_vat')} />
                    </Field>
                  </div>
                </div>
                <SkuBarcode control={control} />
              </section>
            </div>

            <section className="space-y-3 rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Product variations and matrix generator</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Colors">
                  <input value={colorsText} onChange={(event) => setColorsText(event.target.value)} placeholder="Red, Blue, Black" className={fieldClass} />
                </Field>
                <Field label="Sizes">
                  <input value={sizesText} onChange={(event) => setSizesText(event.target.value)} placeholder="S, M, L" className={fieldClass} />
                </Field>
              </div>
              <div className="flex flex-col gap-2 lg:flex-row">
                <select
                  value={attributeChoice}
                  onChange={(event) => setAttributeChoice(event.target.value)}
                  className={fieldClass}
                >
                  <option value="">Select Attribute</option>
                  {ATTRIBUTES.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                  <option value="Custom">Custom</option>
                </select>
                {attributeChoice === 'Custom' ? (
                  <input
                    value={customAttribute}
                    onChange={(event) => setCustomAttribute(event.target.value)}
                    placeholder="Attribute name"
                    className={fieldClass}
                  />
                ) : null}
                <input
                  value={attributeValues}
                  onChange={(event) => setAttributeValues(event.target.value)}
                  placeholder="Values, comma separated"
                  className={fieldClass}
                />
                <button type="button" onClick={addAttribute} className="shrink-0 rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                  Add Attribute
                </button>
                <button type="button" onClick={generateItems} className="shrink-0 rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-800">
                  Generate Items
                </button>
              </div>
              {attributes.length > 0 ? (
                <ul className="flex flex-wrap gap-2">
                  {attributes.map((attribute) => (
                    <li key={attribute.name} className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700">
                      {attribute.name}: {attribute.values.join(', ')}
                    </li>
                  ))}
                </ul>
              ) : null}
              {items.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="text-xs uppercase text-gray-500">
                      <tr>
                        <th className="px-2 py-2">SKU</th>
                        <th className="px-2 py-2">Combination</th>
                        <th className="px-2 py-2">Inherit</th>
                        <th className="px-2 py-2">Stock</th>
                        <th className="px-2 py-2">Own price and vendor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.sku} className="border-t border-gray-100 align-top">
                          <td className="px-2 py-2 font-mono text-xs">{item.sku}</td>
                          <td className="px-2 py-2">{Object.entries(item.combination).map(([key, value]) => `${key}: ${value}`).join(' · ')}</td>
                          <td className="px-2 py-2">
                            <label className="flex items-center gap-2 text-xs text-gray-700">
                              <input
                                type="checkbox"
                                checked={item.inherit_parent}
                                onChange={(event) => updateItem(item.sku, { inherit_parent: event.target.checked })}
                              />
                              Inherit from parent
                            </label>
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="number"
                              min="0"
                              value={item.stock_quantity}
                              onChange={(event) => updateItem(item.sku, { stock_quantity: Number(event.target.value) })}
                              className="w-24 rounded-md border border-gray-300 px-2 py-1"
                            />
                          </td>
                          <td className="px-2 py-2">
                            {item.inherit_parent ? (
                              <span className="text-xs text-gray-500">Uses parent price, image, vendor, and VAT</span>
                            ) : (
                              <div className="grid gap-2 sm:grid-cols-2">
                                <input value={item.mrp} onChange={(event) => updateItem(item.sku, { mrp: event.target.value })} placeholder="MRP" className="rounded-md border border-gray-300 px-2 py-1" />
                                <input value={item.vendor} onChange={(event) => updateItem(item.sku, { vendor: event.target.value })} placeholder="Vendor" className="rounded-md border border-gray-300 px-2 py-1" />
                                <label className="flex items-center gap-2 text-xs text-gray-700">
                                  <input type="checkbox" checked={item.custom_vat} onChange={(event) => updateItem(item.sku, { custom_vat: event.target.checked })} />
                                  Custom VAT
                                </label>
                                <input
                                  value={item.sale_vat}
                                  disabled={!item.custom_vat}
                                  onChange={(event) => updateItem(item.sku, { sale_vat: event.target.value })}
                                  placeholder={`${defaultVat}%`}
                                  className="rounded-md border border-gray-300 px-2 py-1"
                                />
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="text-xs sm:col-span-2"
                                  onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    if (!file) {
                                      return;
                                    }
                                    void compressImageToWebp(file).then((compressed) => updateItem(item.sku, { image: compressed.dataUrl }));
                                  }}
                                />
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>

            {formError ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p> : null}
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-100 px-5 py-4">
            <button type="button" onClick={onClose} disabled={submitting} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60">
              Cancel
            </button>
            <button type="submit" disabled={submitting || compressing} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:bg-indigo-300">
              {submitting ? 'Saving...' : mode === 'create' ? 'Save Product' : 'Update Product'}
            </button>
          </div>
        </form>
      </div>
      {cameraOpen ? <PosCameraScanner onScan={addBarcode} onClose={() => setCameraOpen(false)} /> : null}
    </div>
  );
}
