'use client';

import { MasterDataScreen, PendingName, TextField, fieldClassName } from '../../../components/MasterDataScreen';

export default function SubCategoriesPage() {
  return (
    <MasterDataScreen
      entityType="sub_category"
      title="Sub-Categories"
      description="Each sub-category belongs to one parent category."
      recordsOf={(catalog) => {
        const names = new Map((catalog.categories ?? []).map((category) => [category.id, category.name]));
        return (catalog.sub_categories ?? []).map((row) => ({
          ...row,
          category_name: names.get(row.category_id ?? 0) ?? '',
        }));
      }}
      emptyDraft={{ name: '', category_id: '' }}
      draftFrom={(record) => ({ name: record.name, category_id: String(record.category_id ?? '') })}
      columns={[
        {
          key: 'name',
          header: 'Name',
          render: (row) => <PendingName name={row.source.name} pending={row.pendingEdit} pendingDelete={row.pendingDelete} />,
        },
        {
          key: 'parent',
          header: 'Parent Category',
          render: (row) => row.source.category_name || '—',
        },
      ]}
      renderFields={(draft, setDraft, catalog) => (
        <>
          <TextField label="Name" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
          <label className="block text-sm font-medium text-slate-700">
            Parent category
            <select
              value={draft.category_id}
              onChange={(event) => setDraft({ ...draft, category_id: event.target.value })}
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
        </>
      )}
      payloadFrom={(draft) => {
        if (!draft.name.trim()) {
          return 'Name is required.';
        }
        if (!draft.category_id) {
          return 'Parent category is required.';
        }
        return { name: draft.name.trim(), category_id: Number(draft.category_id) };
      }}
    />
  );
}
