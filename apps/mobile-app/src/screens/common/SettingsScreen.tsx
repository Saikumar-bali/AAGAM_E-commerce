import React from 'react';

import {ScreenContainer} from './ScreenContainer';
import {InfoCard} from './UI';

export function SettingsScreen() {
  return (
    <ScreenContainer title="Settings" subtitle="Common preferences">
      <InfoCard title="Notifications" value="Enabled for role-specific alerts" />
      <InfoCard title="Map Refresh" value="Every 3 seconds (placeholder)" />
    </ScreenContainer>
  );
}

