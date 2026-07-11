'use client';

import React from 'react';
import Link from 'next/link';
import { Settings2 } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import NotificationCenter from '@/components/notifications/NotificationCenter';

export default function StoreNotificationsPage() {
  return (
    <DashboardLayout allowedRole="STORE_OWNER">
      <main className="p-2 pb-24 sm:p-4">
        <NotificationCenter
          role="STORE_OWNER"
          title="Store Notifications"
          subtitle="New orders, rider assignment responses, rider arrival, pickup handoff, and delivery exceptions."
          rightSlot={(
            <Link
              href="/store/notifications/settings"
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
