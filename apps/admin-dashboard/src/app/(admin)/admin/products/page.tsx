'use client';

import DashboardLayout from '@/components/DashboardLayout';
import ProductCatalogManager from '@/components/admin/ProductCatalogManager';

export default function AdminProductsPage() {
  return (
    <DashboardLayout allowedRole="ADMIN">
      <ProductCatalogManager />
    </DashboardLayout>
  );
}
