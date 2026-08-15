import type { ReactNode } from 'react';
import StoreSubscriptionPreparationDrawer from '@/components/subscriptions/StoreSubscriptionPreparationDrawer';

export default function StoreSubscriptionsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <StoreSubscriptionPreparationDrawer />
    </>
  );
}
