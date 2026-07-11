'use client';

import React from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import NotificationPreferences from '@/components/notifications/NotificationPreferences';

export default function AdminNotificationSettingsPage() {
  return (
    <DashboardLayout allowedRole="ADMIN">
      <main className="p-2 pb-24 sm:p-4">
        <NotificationPreferences
          role="ADMIN"
          backHref="/admin/notifications"
          title="Operations notification preferences"
        />
      </main>
    </DashboardLayout>
  );
}
