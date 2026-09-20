'use client';

import React from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import NotificationCenter from '@/components/notifications/NotificationCenter';

export default function CustomerNotificationsPage() {
  return (
    <DashboardLayout allowedRole="CUSTOMER">
      <main className="p-3 pb-24 sm:p-5">
        <NotificationCenter
          role="CUSTOMER"
          title="Notifications"
          subtitle="Order updates, delivery status, promotions, and account alerts."
        />
      </main>
    </DashboardLayout>
  );
}
