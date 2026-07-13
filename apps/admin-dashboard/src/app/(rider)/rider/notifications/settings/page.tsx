"use client";

import React from "react";
import DashboardLayout from "@/components/DashboardLayout";
import NotificationPreferences from "@/components/notifications/NotificationPreferences";

export default function RiderNotificationSettingsPage() {
  return (
    <DashboardLayout allowedRole="RIDER">
      <main className="p-2 pb-24 sm:p-4">
        <NotificationPreferences
          role="RIDER"
          backHref="/rider/notifications"
          title="Rider notification preferences"
        />
      </main>
    </DashboardLayout>
  );
}
