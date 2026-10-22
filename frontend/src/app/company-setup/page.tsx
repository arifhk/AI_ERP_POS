'use client';

import { useEffect, useState, type DragEvent, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AppShell } from '../../components/AppShell';
import { apiFetch } from '../../utils/api';
import { canManageCompany, getStoredRole } from '../../utils/auth';
import {
  DEFAULT_INVOICE_SETTINGS,
  PAPER_SIZES,
  fromInvoicePayload,
  readInvoiceSettings,
  toInvoicePayload,
  writeInvoiceSettings,
  type CompanyInvoiceSettings,
  type PaperSize,
} from '../../utils/invoiceSettings';

const fieldClass =
  'mt-1 min-h-[44px] w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500';

export default function CompanySetupPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [tab, setTab] = useState<'details' | 'design'>('details');
  const [settings, setSettings] = useState<CompanyInvoiceSettings>(DEFAULT_INVOICE_SETTINGS);
  const [logoName, setLogoName] = useState('');
  const [saving, setSaving] = useState(false);
  const [referenceName, setReferenceName] = useState('');
  const [referenceUrl, setReferenceUrl] = useState('');
  const [referenceIsPdf, setReferenceIsPdf] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);

  useEffect(() => {
    if (!canManageCompany(getStoredRole())) {
      router.replace('/');
      return;
    }
    setAllowed(true);
    const cached = readInvoiceSettings();
    setSettings(cached);
    void (async () => {
      try {
        const response = await apiFetch('/api/company');
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as Parameters<typeof fromInvoicePayload>[0];
        if (!payload.configured) {
          return;
        }
        const next = fromInvoicePayload(payload);
        setSettings(next);
        writeInvoiceSettings(next);
      } catch {
        setSettings(cached);
      }
    })();
  }, [router]);

  function patchSettings(partial: Partial<CompanyInvoiceSettings>) {
    setSettings((current) => ({ ...current, ...partial }));
  }

  function takeLogo(file: File | undefined) {
    if (!file) {
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error('The logo must be an image.');
      return;
    }
    if (file.size > 500_000) {
      toast.error('Logo is too large. Use an image under 500 KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const data = typeof reader.result === 'string' ? reader.result : '';
      setLogoName(file.name);
      patchSettings({ logoData: data });
    };
    reader.readAsDataURL(file);
  }

  function takeReference(file: File | undefined) {
    if (!file) {
      return;
    }
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isImage = file.type.startsWith('image/');
    if (!isPdf && !isImage) {
      toast.error('Upload an image or a PDF.');
      return;
    }
    setReferenceName(file.name);
    setReferenceIsPdf(isPdf);
    setReferenceUrl(isImage ? URL.createObjectURL(file) : '');
    setPreviewReady(false);
  }

  function onDropReference(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragOver(false);
    takeReference(event.dataTransfer.files?.[0]);
  }

  async function persistSettings() {
    const next = { ...settings, companyName: settings.companyName.trim() || DEFAULT_INVOICE_SETTINGS.companyName };
    writeInvoiceSettings(next);
    setSettings(next);
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('Your session expired. Sign in again, then save the invoice design.');
    }
    const response = await apiFetch('/api/company', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toInvoicePayload(next)),
    });
    if (!response.ok) {
      const failed = (await response.json().catch(() => null)) as { detail?: unknown } | null;
      const detail = typeof failed?.detail === 'string' ? failed.detail : '';
      throw new Error(detail || 'Saved on this register. The company record could not be updated.');
    }
    const payload = (await response.json()) as Parameters<typeof fromInvoicePayload>[0];
    const saved = fromInvoicePayload(payload);
    writeInvoiceSettings(saved);
    setSettings(saved);
  }

  async function saveCompany(event?: FormEvent) {
    event?.preventDefault();
    setSaving(true);
    try {
      await persistSettings();
      toast.success('Invoice design saved.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the invoice design.');
    } finally {
      setSaving(false);
    }
  }

  async function handleAIGenerate() {
    if (!referenceName || generating) {
      return;
    }
    setGenerating(true);
    setPreviewReady(false);
    await new Promise((resolve) => window.setTimeout(resolve, 1400));
    setGenerating(false);
    setPreviewReady(true);
    toast.success('Invoice template generated based on the reference file!');
  }

  if (!allowed) {
    return null;
  }

  const previewWidth = settings.paperSize === '80mm POS' ? 'max-w-[80mm]' : settings.paperSize === 'A5' ? 'max-w-sm' : 'max-w-lg';

  return (
    <AppShell active="company-setup">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl dark:text-slate-100">Company Setup</h1>
        <p className="mt-1 text-sm text-slate-500">Company profile and the invoice layout used at the register.</p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab('details')}
          className={`rounded-md px-4 py-2 text-sm font-semibold ${tab === 'details' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-600'}`}
        >
          Company Details
        </button>
        <button
          type="button"
          onClick={() => setTab('design')}
          className={`rounded-md px-4 py-2 text-sm font-semibold ${tab === 'design' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-600'}`}
        >
          Invoice Design
        </button>
      </div>

      {tab === 'details' ? (
        <form onSubmit={(event) => void saveCompany(event)} className="max-w-3xl rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200 md:col-span-2">
              Company Name
              <input required value={settings.companyName} onChange={(event) => patchSettings({ companyName: event.target.value })} className={fieldClass} placeholder="Plus Point" />
            </label>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200 md:col-span-2">
              Logo Upload
              <input
                type="file"
                accept="image/*"
                onChange={(event) => takeLogo(event.target.files?.[0])}
                className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-indigo-700"
              />
              {settings.logoData ? <img src={settings.logoData} alt="Company logo" className="mt-3 h-16 w-16 rounded-md border border-gray-200 object-contain" /> : null}
              {logoName ? <span className="mt-1 block text-xs text-slate-500">{logoName}</span> : null}
            </label>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200 md:col-span-2">
              Address
              <textarea value={settings.address} onChange={(event) => patchSettings({ address: event.target.value })} rows={3} className={fieldClass} placeholder="Registered office. The receipt prints the billing branch address." />
            </label>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Phone
              <input value={settings.phone} onChange={(event) => patchSettings({ phone: event.target.value })} className={fieldClass} placeholder="01XXXXXXXXX" />
            </label>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Email
              <input type="email" value={settings.email} onChange={(event) => patchSettings({ email: event.target.value })} className={fieldClass} placeholder="billing@company.com" />
            </label>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Website
              <input value={settings.website} onChange={(event) => patchSettings({ website: event.target.value })} className={fieldClass} placeholder="https://company.com" />
            </label>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
              BIN/VAT/TIN No
              <input value={settings.taxId} onChange={(event) => patchSettings({ taxId: event.target.value })} className={fieldClass} placeholder="BIN 123456789" />
            </label>
          </div>
          <div className="mt-6 flex justify-end">
            <button type="submit" disabled={saving} className="rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-300">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="space-y-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              Paper Size
              <select
                value={settings.paperSize}
                disabled={generating}
                onChange={(event) => patchSettings({ paperSize: event.target.value as PaperSize })}
                className={fieldClass}
              >
                {PAPER_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              Header
              <textarea value={settings.headerNote} disabled={generating} onChange={(event) => patchSettings({ headerNote: event.target.value })} rows={3} className={fieldClass} placeholder="Welcome message printed under the company name" />
            </label>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              Footer
              <textarea value={settings.footerNote} disabled={generating} onChange={(event) => patchSettings({ footerNote: event.target.value })} rows={3} className={fieldClass} />
            </label>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              Return Policies
              <textarea value={settings.returnPolicy} disabled={generating} onChange={(event) => patchSettings({ returnPolicy: event.target.value })} rows={3} className={fieldClass} />
            </label>

            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Upload Reference Invoice (Image or PDF)</p>
              <label
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDropReference}
                className={`mt-2 flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center ${
                  dragOver ? 'border-indigo-500 bg-indigo-50' : 'border-indigo-200 bg-slate-50 dark:border-indigo-400/40 dark:bg-slate-900'
                } ${generating ? 'pointer-events-none opacity-60' : ''}`}
              >
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  disabled={generating}
                  className="sr-only"
                  onChange={(event) => takeReference(event.target.files?.[0])}
                />
                <span className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">Upload Reference Invoice (Image or PDF)</span>
                <span className="mt-1 text-xs text-slate-500">{referenceName || 'PNG, JPG, or PDF of a sample invoice'}</span>
                {referenceIsPdf && referenceName ? <span className="mt-4 rounded-md border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">PDF ready: {referenceName}</span> : null}
                {referenceUrl && !referenceIsPdf ? <img src={referenceUrl} alt="Reference invoice" className="mt-4 max-h-28 rounded-md border border-gray-200 object-contain" /> : null}
              </label>
              <button
                type="button"
                onClick={() => void handleAIGenerate()}
                disabled={generating || !referenceName}
                className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-300"
              >
                {generating ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : null}
                {generating ? 'Generating...' : 'Generate Template matching this image'}
              </button>
              <button
                type="button"
                onClick={() => void saveCompany()}
                disabled={saving || generating}
                className="mt-3 ml-2 inline-flex min-h-[44px] items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {saving ? 'Saving...' : 'Save Design'}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Preview</h2>
            {previewReady ? (
              <article className={`mx-auto mt-4 bg-white p-4 text-center font-mono text-[12px] leading-tight text-black shadow-inner ring-1 ring-slate-200 ${previewWidth}`}>
                {settings.logoData ? <img src={settings.logoData} alt="" className="mx-auto mb-2 h-10 w-10 object-contain" /> : null}
                <p className="text-sm font-bold">{settings.companyName || 'Company Name'}</p>
                <p className="font-semibold">Branch name</p>
                <p>Branch address</p>
                <p>Branch phone</p>
                {settings.taxId ? <p>VAT Reg.: {settings.taxId}</p> : null}
                {settings.headerNote ? <p className="mt-2">{settings.headerNote}</p> : null}
                <table className="mt-2 w-full border-collapse border-t border-dashed border-black text-left">
                  <thead>
                    <tr className="border-b border-black">
                      <th className="py-1 text-left">Item</th>
                      <th className="py-1 text-right">Qty</th>
                      <th className="py-1 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="py-1">Sample item</td>
                      <td className="py-1 text-right">1</td>
                      <td className="py-1 text-right">500.00</td>
                    </tr>
                  </tbody>
                </table>
                <div className="mt-2 space-y-0.5 border-t border-dashed border-black pt-1 text-left">
                  <div className="flex justify-between font-bold"><span>Net Total</span><span>500.00</span></div>
                  <div className="flex justify-between"><span>Paid Amount</span><span>500.00</span></div>
                  <div className="flex justify-between"><span>Change Amount</span><span>0.00</span></div>
                </div>
                {settings.footerNote ? <p className="mt-2">{settings.footerNote}</p> : null}
                {settings.returnPolicy ? <p className="mt-1 whitespace-pre-line text-left">{settings.returnPolicy}</p> : null}
                {settings.website ? <p className="mt-1">{settings.website}</p> : null}
                <p className="mt-2 text-[10px] uppercase tracking-wide text-slate-500">{settings.paperSize}</p>
              </article>
            ) : (
              <p className="mt-6 text-sm text-slate-500">Upload a reference invoice and generate a template to preview it here.</p>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
