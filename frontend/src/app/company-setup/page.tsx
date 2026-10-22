'use client';

import { useEffect, useState, type DragEvent, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AppShell } from '../../components/AppShell';
import { canManageCompany, getStoredRole } from '../../utils/auth';

const PAPER_SIZES = ['80mm POS', 'A4', 'A5'] as const;

type PaperSize = (typeof PAPER_SIZES)[number];

type CompanyForm = {
  name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  taxId: string;
};

const emptyCompany: CompanyForm = {
  name: '',
  address: '',
  phone: '',
  email: '',
  website: '',
  taxId: '',
};

const fieldClass =
  'mt-1 min-h-[44px] w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500';

export default function CompanySetupPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [tab, setTab] = useState<'details' | 'design'>('details');
  const [company, setCompany] = useState<CompanyForm>(emptyCompany);
  const [logoName, setLogoName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [paperSize, setPaperSize] = useState<PaperSize>('80mm POS');
  const [headerNote, setHeaderNote] = useState('');
  const [footerNote, setFooterNote] = useState('Thank you for shopping with us.');
  const [returnPolicy, setReturnPolicy] = useState('Returns accepted within 3 days with the original invoice.');
  const [referenceName, setReferenceName] = useState('');
  const [referenceUrl, setReferenceUrl] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);

  useEffect(() => {
    if (!canManageCompany(getStoredRole())) {
      router.replace('/');
      return;
    }
    setAllowed(true);
  }, [router]);

  function setField(key: keyof CompanyForm, value: string) {
    setCompany((current) => ({ ...current, [key]: value }));
  }

  function takeLogo(file: File | undefined) {
    if (!file) {
      return;
    }
    setLogoName(file.name);
    setLogoUrl(URL.createObjectURL(file));
  }

  function takeReference(file: File | undefined) {
    if (!file) {
      return;
    }
    setReferenceName(file.name);
    setReferenceUrl(URL.createObjectURL(file));
    setPreviewReady(false);
  }

  function onDropReference(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragOver(false);
    takeReference(event.dataTransfer.files?.[0]);
  }

  async function saveCompany(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    await new Promise((resolve) => window.setTimeout(resolve, 400));
    setSaving(false);
    toast.success('Company details saved.');
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
    toast.success('Invoice template generated based on reference image!');
  }

  if (!allowed) {
    return null;
  }

  const previewWidth = paperSize === '80mm POS' ? 'max-w-[80mm]' : paperSize === 'A5' ? 'max-w-sm' : 'max-w-lg';

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
              <input required value={company.name} onChange={(event) => setField('name', event.target.value)} className={fieldClass} placeholder="Bashundhara City" />
            </label>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200 md:col-span-2">
              Logo Upload
              <input
                type="file"
                accept="image/*"
                onChange={(event) => takeLogo(event.target.files?.[0])}
                className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-indigo-700"
              />
              {logoUrl ? <img src={logoUrl} alt="Company logo" className="mt-3 h-16 w-16 rounded-md border border-gray-200 object-contain" /> : null}
            </label>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200 md:col-span-2">
              Address
              <textarea required value={company.address} onChange={(event) => setField('address', event.target.value)} rows={3} className={fieldClass} placeholder="Bashundhara, Dhaka" />
            </label>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Phone
              <input required value={company.phone} onChange={(event) => setField('phone', event.target.value)} className={fieldClass} placeholder="01XXXXXXXXX" />
            </label>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Email
              <input required type="email" value={company.email} onChange={(event) => setField('email', event.target.value)} className={fieldClass} placeholder="billing@company.com" />
            </label>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Website
              <input value={company.website} onChange={(event) => setField('website', event.target.value)} className={fieldClass} placeholder="https://company.com" />
            </label>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
              BIN/VAT/TIN No
              <input value={company.taxId} onChange={(event) => setField('taxId', event.target.value)} className={fieldClass} placeholder="BIN 123456789" />
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
                value={paperSize}
                disabled={generating}
                onChange={(event) => setPaperSize(event.target.value as PaperSize)}
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
              <textarea value={headerNote} disabled={generating} onChange={(event) => setHeaderNote(event.target.value)} rows={3} className={fieldClass} placeholder="Welcome message printed under the store name" />
            </label>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              Footer
              <textarea value={footerNote} disabled={generating} onChange={(event) => setFooterNote(event.target.value)} rows={3} className={fieldClass} />
            </label>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              Return Policies
              <textarea value={returnPolicy} disabled={generating} onChange={(event) => setReturnPolicy(event.target.value)} rows={3} className={fieldClass} />
            </label>

            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Upload Reference Invoice for AI Design</p>
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
                  accept="image/*"
                  disabled={generating}
                  className="sr-only"
                  onChange={(event) => takeReference(event.target.files?.[0])}
                />
                <span className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">Drop an invoice image here, or click to browse</span>
                <span className="mt-1 text-xs text-slate-500">{referenceName || 'PNG or JPG of a sample invoice'}</span>
                {referenceUrl ? <img src={referenceUrl} alt="Reference invoice" className="mt-4 max-h-28 rounded-md border border-gray-200 object-contain" /> : null}
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
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Preview</h2>
            {previewReady ? (
              <article className={`mx-auto mt-4 bg-white p-4 text-center font-mono text-[12px] leading-tight text-black shadow-inner ring-1 ring-slate-200 ${previewWidth}`}>
                {logoUrl ? <img src={logoUrl} alt="" className="mx-auto mb-2 h-10 w-10 object-contain" /> : null}
                <p className="text-sm font-bold">{company.name || 'Company Name'}</p>
                <p>{company.address || 'Address'}</p>
                <p>{[company.phone, company.email].filter(Boolean).join(' · ') || 'Phone · Email'}</p>
                {company.website ? <p>{company.website}</p> : null}
                {company.taxId ? <p>{company.taxId}</p> : null}
                {headerNote ? <p className="mt-2">{headerNote}</p> : null}
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
                {footerNote ? <p className="mt-2">{footerNote}</p> : null}
                {returnPolicy ? <p className="mt-1 text-left">{returnPolicy}</p> : null}
                <p className="mt-2 text-[10px] uppercase tracking-wide text-slate-500">{paperSize}</p>
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
