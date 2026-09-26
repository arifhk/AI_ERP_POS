'use client';

import { MasterDataScreen, PendingName, TextField, fieldClassName } from '../../../components/MasterDataScreen';

export default function VendorsPage() {
  return (
    <MasterDataScreen
      entityType="vendor"
      title="Vendors"
      description="Supplier contacts used on products and bulk import."
      recordsOf={(catalog) => catalog.vendors ?? []}
      emptyDraft={{ name: '', contact_number: '', email: '', address: '', status: 'Active' }}
      draftFrom={(record) => ({
        name: record.name,
        contact_number: record.contact_number ?? '',
        email: record.email ?? '',
        address: record.address ?? '',
        status: record.status || 'Active',
      })}
      columns={[
        { key: 'name', header: 'Vendor', render: (row) => <PendingName name={row.source.name} pending={row.pendingEdit} pendingDelete={row.pendingDelete} /> },
        { key: 'contact', header: 'Contact', render: (row) => row.source.contact_number || '—' },
        { key: 'email', header: 'Email', render: (row) => row.source.email || '—' },
        { key: 'address', header: 'Address', render: (row) => row.source.address || '—' },
        { key: 'vendorStatus', header: 'Account', render: (row) => row.source.status || 'Active' },
      ]}
      renderFields={(draft, setDraft) => (
        <>
          <TextField label="Vendor name" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
          <TextField label="Contact number" value={draft.contact_number} onChange={(contact_number) => setDraft({ ...draft, contact_number })} />
          <TextField label="Email" type="email" value={draft.email} onChange={(email) => setDraft({ ...draft, email })} />
          <label className="block text-sm font-medium text-slate-700">
            Address
            <textarea
              value={draft.address}
              onChange={(event) => setDraft({ ...draft, address: event.target.value })}
              className={fieldClassName()}
              rows={3}
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Status
            <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })} className={fieldClassName()}>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </label>
        </>
      )}
      payloadFrom={(draft) => {
        if (!draft.name.trim()) {
          return 'Vendor name is required.';
        }
        if (draft.email.trim() && !draft.email.includes('@')) {
          return 'Email is not valid.';
        }
        return {
          name: draft.name.trim(),
          contact_number: draft.contact_number.trim(),
          email: draft.email.trim(),
          address: draft.address.trim(),
          status: draft.status || 'Active',
        };
      }}
    />
  );
}
