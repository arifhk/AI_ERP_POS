'use client';

import { useState } from 'react';

export type NewCustomerForm = {
  doe: string;
  gender: string;
  type: string;
  firstName: string;
  lastName: string;
  middleName: string;
  email: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
  phone: string;
  ageRange: string;
  dateOfBirth: string;
  cardNo: string;
  bin: string;
  specialNote: string;
  creditCustomer: boolean;
  creditLimit: string;
  discount: string;
};

const EMPTY: NewCustomerForm = {
  doe: '',
  gender: 'Female',
  type: 'Regular',
  firstName: '',
  lastName: '',
  middleName: '',
  email: '',
  address: '',
  city: '',
  postalCode: '',
  country: 'Bangladesh',
  phone: '',
  ageRange: '',
  dateOfBirth: '',
  cardNo: '',
  bin: '',
  specialNote: '',
  creditCustomer: false,
  creditLimit: '',
  discount: '0',
};

const fieldClass =
  'mt-1 min-h-[40px] w-full rounded border border-slate-300 bg-white px-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';

export function AddCustomerModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (customer: NewCustomerForm) => void;
}) {
  const [form, setForm] = useState<NewCustomerForm>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof NewCustomerForm>(key: K, value: NewCustomerForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function save() {
    if (!form.phone.trim()) {
      setError('Phone is required.');
      return;
    }
    onSave(form);
  }

  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-slate-900/50 p-3 sm:items-center">
      <div role="dialog" aria-modal="true" aria-labelledby="add-customer-title" className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white shadow-2xl dark:bg-slate-800">
        <div className="flex items-center justify-between bg-slate-800 px-4 py-3 text-white">
          <h2 id="add-customer-title" className="text-base font-semibold">
            Add Customer
          </h2>
          <button type="button" onClick={onClose} className="min-h-[40px] rounded px-3 text-sm font-semibold text-slate-200 hover:bg-slate-700">
            Close
          </button>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs font-semibold text-slate-500">
            DOE
            <input type="date" value={form.doe} onChange={(event) => set('doe', event.target.value)} className={fieldClass} />
          </label>
          <label className="text-xs font-semibold text-slate-500">
            Gender
            <select value={form.gender} onChange={(event) => set('gender', event.target.value)} className={fieldClass}>
              <option>Female</option>
              <option>Male</option>
              <option>Other</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-500">
            Type
            <select value={form.type} onChange={(event) => set('type', event.target.value)} className={fieldClass}>
              <option>Regular</option>
              <option>VIP PASS</option>
              <option>Staff</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-500">
            First Name
            <input value={form.firstName} onChange={(event) => set('firstName', event.target.value)} className={fieldClass} />
          </label>
          <label className="text-xs font-semibold text-slate-500">
            Last Name
            <input value={form.lastName} onChange={(event) => set('lastName', event.target.value)} className={fieldClass} />
          </label>
          <label className="text-xs font-semibold text-slate-500">
            Middle Name
            <input value={form.middleName} onChange={(event) => set('middleName', event.target.value)} className={fieldClass} />
          </label>
          <label className="text-xs font-semibold text-slate-500">
            Email
            <input type="email" value={form.email} onChange={(event) => set('email', event.target.value)} className={fieldClass} />
          </label>
          <label className="text-xs font-semibold text-slate-500 sm:col-span-2">
            Address
            <input value={form.address} onChange={(event) => set('address', event.target.value)} className={fieldClass} />
          </label>
          <label className="text-xs font-semibold text-slate-500">
            City
            <input value={form.city} onChange={(event) => set('city', event.target.value)} className={fieldClass} />
          </label>
          <label className="text-xs font-semibold text-slate-500">
            Postal Code
            <input value={form.postalCode} onChange={(event) => set('postalCode', event.target.value)} className={fieldClass} />
          </label>
          <label className="text-xs font-semibold text-slate-500">
            Country
            <input value={form.country} onChange={(event) => set('country', event.target.value)} className={fieldClass} />
          </label>
          <label className="text-xs font-semibold text-slate-500">
            Phone
            <input required value={form.phone} onChange={(event) => set('phone', event.target.value)} className={fieldClass} />
          </label>
          <label className="text-xs font-semibold text-slate-500">
            Age Range
            <input value={form.ageRange} onChange={(event) => set('ageRange', event.target.value)} placeholder="18-25" className={fieldClass} />
          </label>
          <label className="text-xs font-semibold text-slate-500">
            Date of Birth
            <input type="date" value={form.dateOfBirth} onChange={(event) => set('dateOfBirth', event.target.value)} className={fieldClass} />
          </label>
          <label className="text-xs font-semibold text-slate-500">
            Card No
            <input value={form.cardNo} onChange={(event) => set('cardNo', event.target.value)} className={fieldClass} />
          </label>
          <label className="text-xs font-semibold text-slate-500">
            BIN
            <input value={form.bin} onChange={(event) => set('bin', event.target.value)} className={fieldClass} />
          </label>
          <label className="text-xs font-semibold text-slate-500 sm:col-span-2">
            Special Note
            <input value={form.specialNote} onChange={(event) => set('specialNote', event.target.value)} className={fieldClass} />
          </label>
          <label className="flex min-h-[40px] items-center gap-2 self-end text-sm font-semibold text-slate-700 dark:text-slate-200">
            <input type="checkbox" checked={form.creditCustomer} onChange={(event) => set('creditCustomer', event.target.checked)} className="h-4 w-4" />
            Credit Customer
          </label>
          <label className="text-xs font-semibold text-slate-500">
            Credit Limit
            <input value={form.creditLimit} onChange={(event) => set('creditLimit', event.target.value)} className={fieldClass} />
          </label>
          <label className="text-xs font-semibold text-slate-500">
            Discount (%)
            <input value={form.discount} onChange={(event) => set('discount', event.target.value)} className={fieldClass} />
          </label>
        </div>
        {error ? <p className="px-4 text-sm font-medium text-rose-600">{error}</p> : null}
        <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-700">
          <button type="button" onClick={onClose} className="min-h-[44px] rounded-md bg-slate-200 px-5 text-sm font-semibold text-slate-800">
            Close
          </button>
          <button type="button" onClick={save} className="min-h-[44px] rounded-md bg-emerald-600 px-6 text-sm font-bold text-white">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
