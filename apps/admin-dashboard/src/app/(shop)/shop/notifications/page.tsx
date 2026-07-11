'use client';

import React from 'react';
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
        />
      </main>
    </DashboardLayout>
  );
}
