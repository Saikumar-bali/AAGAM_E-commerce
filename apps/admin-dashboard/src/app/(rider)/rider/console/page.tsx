'use client';

import React from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import RiderRunConsole from '@/components/rider/RiderRunConsole';

export default function RiderConsolePage() {
  return (
    <DashboardLayout allowedRole="RIDER">
      <RiderRunConsole />
    </DashboardLayout>
  );
}
