'use client';

import { MasterEntityManager } from '../../../components/MasterEntityManager';

export default function CategoriesPage() {
  return (
    <MasterEntityManager
      entityType="category"
      title="Categories"
      description="Product categories used by Code Master and the catalog."
    />
  );
}
