import React from 'react';

import {ScreenContainer} from '../common/ScreenContainer';
import {InfoCard} from '../common/UI';

export function OrdersScreen() {
  return (
    <ScreenContainer title="Orders" subtitle="Customer order history + status timeline">
      <InfoCard title="Active order" value="Order #AGM-2401 - Preparing" />
      <InfoCard title="Tracking" value="Live rider map integration starts in Phase 3" />
    </ScreenContainer>
  );
}

