'use client';

import { useState } from 'react';
import { API_BASE, apiFetch } from '../utils/api';

type Option = { id: number; name: string };

export function MasterControls({
  label,
  value,
  options,
  disabled = false,
  entityType,
  categoryId,
  onChange,
  onSaved,
}: {
  label: string;
  value: string;
  options: Option[];
  disabled?: boolean;
  entityType: 'category' | 'sub_category' | 'brand' | 'vendor';
  categoryId?: number | null;
  onChange: (id: string) => void;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState<'create' | 'update' | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const selected = options.find((option) => String(option.id) === value);

  function openModal(mode: 'create' | 'update') {
    setError(null);
    setName(mode === 'update' ? selected?.name ?? '' : '');
    setOpen(mode);
  }

  async function save() {
    if (entityType === 'sub_category' && !categoryId) {
      setError('Select a category before adding a sub-category.');
      return;
    }
    setSaving(true);
    setError(null);
    const body = { name: name.trim(), category_id: categoryId ?? null };
    const response = await apiFetch(
      open === 'update' ? `${API_BASE}/masters/${entityType}/${value}` : `${API_BASE}/masters/${entityType}`,
      {
        method: open === 'update' ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    setSaving(false);
    if (!response.ok) {
      setError('Could not save this master record.');
      return;
    }
    const payload = (await response.json()) as { pending?: boolean };
    setOpen(null);
    onSaved();
    if (payload.pending) {
      setError(null);
    }
  }

  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      <div className="flex gap-2">
        <select
          data-manual="true"
          disabled={disabled}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100"
        >
          <option value="">Select</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => openModal('create')} className="shrink-0 rounded-md border border-gray-300 px-2 py-2 text-xs font-semibold text-gray-700">
          Add
        </button>
        <button
          type="button"
          disabled={!selected}
          onClick={() => openModal('update')}
          className="shrink-0 rounded-md border border-gray-300 px-2 py-2 text-xs font-semibold text-gray-700 disabled:opacity-40"
        >
          Edit
        </button>
      </div>
      {open ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={() => setOpen(null)} />
          <div className="relative w-full max-w-sm rounded-xl bg-white p-4 shadow-xl">
            <h3 className="text-sm font-semibold text-gray-900">{open === 'create' ? 'Add' : 'Edit'} {label}</h3>
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(null)} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
                Cancel
              </button>
              <button type="button" disabled={saving || !name.trim()} onClick={() => void save()} className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:bg-indigo-300">
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
