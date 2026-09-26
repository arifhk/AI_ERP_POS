'use client';

import { MasterEntityManager } from '../../../components/MasterEntityManager';

export default function BrandsPage() {
  return (
    <MasterEntityManager
      entityType="brand"
      title="Brands"
      description="Brands available on products and bulk import."
    />
  );
}
