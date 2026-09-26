'use client';

import { MasterDataScreen, PendingName, TextField, fieldClassName } from '../../../components/MasterDataScreen';

export default function CodeMasterPage() {
  return (
    <MasterDataScreen
      entityType="code"
      title="Code Master"
      description="Unique code numbers. Each code keeps the category and sub-category used on products."
      recordsOf={(catalog) => {
        const categories = new Map((catalog.categories ?? []).map((row) => [row.id, row.name]));
        const subCategories = new Map((catalog.sub_categories ?? []).map((row) => [row.id, row.name]));
        return (catalog.codes ?? []).map((code) => ({
          ...code,
          name: code.name,
          category_name: categories.get(code.category_id ?? 0) ?? '',
          sub_category_name: subCategories.get(code.sub_category_id ?? 0) ?? '',
        }));
      }}
      emptyDraft={{ code_number: '', name: '', category_id: '', sub_category_id: '' }}
      draftFrom={(record) => ({
        code_number: record.code_number ?? '',
        name: record.name,
        category_id: String(record.category_id ?? ''),
        sub_category_id: String(record.sub_category_id ?? ''),
      })}
      columns={[
        { key: 'code', header: 'Code Number', render: (row) => <span className="font-mono text-slate-800">{row.source.code_number}</span> },
        { key: 'name', header: 'Name', render: (row) => <PendingName name={row.source.name} pending={row.pendingEdit} pendingDelete={row.pendingDelete} /> },
        { key: 'category', header: 'Category', render: (row) => row.source.category_name || '—' },
        { key: 'sub', header: 'Sub-category', render: (row) => row.source.sub_category_name || '—' },
      ]}
      renderFields={(draft, setDraft, catalog) => {
        const subCategories = (catalog.sub_categories ?? []).filter(
          (row) => !draft.category_id || String(row.category_id) === draft.category_id,
        );
        return (
          <>
            <TextField label="Code number" value={draft.code_number} onChange={(code_number) => setDraft({ ...draft, code_number })} />
            <TextField label="Description / name" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
            <label className="block text-sm font-medium text-slate-700">
              Category
              <select
                value={draft.category_id}
                onChange={(event) => setDraft({ ...draft, category_id: event.target.value, sub_category_id: '' })}
                className={fieldClassName()}
              >
                <option value="">Select a category</option>
                {(catalog.categories ?? []).map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Sub-category
              <select
                value={draft.sub_category_id}
                onChange={(event) => setDraft({ ...draft, sub_category_id: event.target.value })}
                className={fieldClassName()}
              >
                <option value="">Select a sub-category</option>
                {subCategories.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        );
      }}
      payloadFrom={(draft) => {
        if (!draft.code_number.trim() || !draft.name.trim()) {
          return 'Code number and name are required.';
        }
        if (!draft.category_id || !draft.sub_category_id) {
          return 'Category and sub-category are required.';
        }
        return {
          code_number: draft.code_number.trim(),
          name: draft.name.trim(),
          category_id: Number(draft.category_id),
          sub_category_id: Number(draft.sub_category_id),
        };
      }}
    />
  );
}
