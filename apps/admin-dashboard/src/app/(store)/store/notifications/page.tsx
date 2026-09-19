'use client';

import React from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import NotificationCenter from '@/components/notifications/NotificationCenter';

export default function StoreNotificationsPage() {
  return (
    <DashboardLayout allowedRole="STORE_OWNER">
      <main className="p-3 pb-24 sm:p-5">
        <NotificationCenter
          role="STORE_OWNER"
          title="Store Notifications"
          subtitle="New orders, rider assignment responses, rider arrival, pickup handoff, and delivery exceptions."
        />
      </main>
    </DashboardLayout>
  );
}
