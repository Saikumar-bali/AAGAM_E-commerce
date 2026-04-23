import React from 'react';

import {ScreenContainer} from '../common/ScreenContainer';
import {InfoCard} from '../common/UI';

export function EarningsScreen() {
  return (
    <ScreenContainer title="Earnings" subtitle="Rider payout overview">
      <InfoCard title="Today" value="INR 540.00" />
      <InfoCard title="This week" value="INR 3,820.00" />
    </ScreenContainer>
  );
}

