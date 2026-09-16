'use client';

import OfflineCustomersPage from '@/components/offline-customers/OfflineCustomersPage';

// Store owners own the offline-customer lifecycle for their own store, so this
// page exposes the full Recycle Bin / restore / permanent-delete workflow scoped
// to the subscriptions of stores they own.
export default function StoreOfflineCustomersPage() {
  return (
    <OfflineCustomersPage
      allowedRole="STORE_OWNER"
      basePath="/store/subscriptions"
      canManage
    />
  );
}
