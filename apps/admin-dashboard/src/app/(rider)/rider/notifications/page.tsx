'use client';

import React from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import NotificationCenter from '@/components/notifications/NotificationCenter';

export default function RiderNotificationsPage() {
  return (
    <DashboardLayout allowedRole="RIDER">
      <main className="p-2 pb-24 sm:p-4">
        <NotificationCenter
          role="RIDER"
          title="Rider Notifications"
          subtitle="Only delivery offers addressed to you, assignment responses, pickup updates, and completion messages."
        />
      </main>
    </DashboardLayout>
  );
}
