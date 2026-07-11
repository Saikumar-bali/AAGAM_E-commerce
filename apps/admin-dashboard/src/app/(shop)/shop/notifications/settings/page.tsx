'use client';

import React from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import NotificationPreferences from '@/components/notifications/NotificationPreferences';

export default function CustomerNotificationSettingsPage() {
  return (
    <DashboardLayout allowedRole="CUSTOMER">
      <main className="mx-auto max-w-6xl p-2 pb-24 sm:p-4">
        <NotificationPreferences
          role="CUSTOMER"
          backHref="/shop/notifications"
          title="Your notification preferences"
        />
      </main>
    </DashboardLayout>
  );
}
