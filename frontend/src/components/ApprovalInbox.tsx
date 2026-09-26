'use client';

import { useEffect, useState } from 'react';
import { API_BASE, apiFetch } from '../utils/api';
import { getStoredRole, isAdminRole } from '../utils/auth';

type Approval = {
  id: number;
  entity_type: string;
  action: string;
  status: string;
  reason?: string | null;
  payload: { name?: string; code_number?: string; summary?: string };
};

export function ApprovalInbox() {
  const [rows, setRows] = useState<Approval[]>([]);
  const [reason, setReason] = useState<Record<number, string>>({});
  const [isAdmin, setIsAdmin] = useState(false);

  async function load() {
    const response = await apiFetch(`${API_BASE}/approvals/`);
    if (!response.ok) {
      return;
    }
    const data: unknown = await response.json();
    setRows(Array.isArray(data) ? (data as Approval[]) : []);
  }

  useEffect(() => {
    setIsAdmin(isAdminRole(getStoredRole()));
    void load();
  }, []);

  async function review(id: number, action: 'approve' | 'deny' | 'resubmit') {
    const response = await apiFetch(`${API_BASE}/approvals/${id}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action === 'deny' ? { reason: reason[id] ?? '' } : action === 'resubmit' ? rows.find((row) => row.id === id)?.payload ?? {} : {}),
    });
    if (response.ok) {
      await load();
    }
  }

  if (rows.length === 0) {
    return null;
  }

  return (
    <section className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-800">Master data approvals</h2>
      <ul className="mt-3 space-y-3">
        {rows.map((row) => (
          <li key={row.id} className="rounded-md border border-gray-100 px-3 py-2 text-sm">
            <p className="font-medium text-gray-900">
              {row.action} {row.entity_type.replaceAll('_', ' ')} · {row.payload.summary || row.payload.code_number || row.payload.name || 'Untitled'} · {row.status}
            </p>
            {row.reason ? <p className="mt-1 text-red-700">Reason: {row.reason}</p> : null}
            {isAdmin && row.status === 'Pending' ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => void review(row.id, 'approve')} className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white">
                  Approve
                </button>
                <input
                  value={reason[row.id] ?? ''}
                  onChange={(event) => setReason((current) => ({ ...current, [row.id]: event.target.value }))}
                  placeholder="Reason to deny"
                  className="rounded-md border border-gray-300 px-2 py-1 text-xs"
                />
                <button type="button" onClick={() => void review(row.id, 'deny')} className="rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white">
                  Deny
                </button>
              </div>
            ) : null}
            {!isAdmin && (row.status === 'Denied' || row.status === 'Rejected') ? (
              <button type="button" onClick={() => void review(row.id, 'resubmit')} className="mt-2 rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700">
                Resubmit
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
