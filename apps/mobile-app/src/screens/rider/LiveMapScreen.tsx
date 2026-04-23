import React from 'react';

import {ScreenContainer} from '../common/ScreenContainer';
import {InfoCard} from '../common/UI';

export function LiveMapScreen() {
  return (
    <ScreenContainer title="Live Map" subtitle="Rider location feed placeholder">
      <InfoCard title="GPS Source" value="Will use react-native-location in Phase 2" />
      <InfoCard title="Realtime Channel" value="WebSocket gateway riderMoved updates" />
    </ScreenContainer>
  );
}

