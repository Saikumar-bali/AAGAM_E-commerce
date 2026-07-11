'use client';

import React from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import NotificationPreferences from '@/components/notifications/NotificationPreferences';

export default function StoreNotificationSettingsPage() {
  return (
    <DashboardLayout allowedRole="STORE_OWNER">
      <main className="p-2 pb-24 sm:p-4">
        <NotificationPreferences
          role="STORE_OWNER"
          backHref="/store/notifications"
          title="Store notification preferences"
        />
      </main>
    </DashboardLayout>
  );
}
