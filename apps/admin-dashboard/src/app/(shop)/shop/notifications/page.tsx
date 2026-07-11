'use client';

import React from 'react';
import Link from 'next/link';
import { Settings2 } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import NotificationCenter from '@/components/notifications/NotificationCenter';

export default function CustomerNotificationsPage() {
  return (
    <DashboardLayout allowedRole="CUSTOMER">
      <main className="mx-auto max-w-5xl p-2 pb-24 sm:p-4">
        <NotificationCenter
          role="CUSTOMER"
          title="Your Notifications"
          subtitle="Order preparation, rider progress, delivery arrival, support, and account updates."
          rightSlot={(
            <Link
              href="/shop/notifications/settings"
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-black text-white ring-1 ring-white/20 hover:bg-white/15"
            >
              <Settings2 className="h-4 w-4" /> Preferences
            </Link>
          )}
        />
      </main>
    </DashboardLayout>
  );
}
