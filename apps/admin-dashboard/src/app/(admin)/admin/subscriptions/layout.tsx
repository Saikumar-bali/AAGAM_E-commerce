import type { ReactNode } from 'react';
import AdminSubscriptionPreparationDrawer from '@/components/subscriptions/AdminSubscriptionPreparationDrawer';

export default function AdminSubscriptionsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <AdminSubscriptionPreparationDrawer />
    </>
  );
}
