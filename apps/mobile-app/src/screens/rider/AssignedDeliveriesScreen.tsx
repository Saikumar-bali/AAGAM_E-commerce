import React from 'react';
import {NativeStackScreenProps} from '@react-navigation/native-stack';

import {ScreenContainer} from '../common/ScreenContainer';
import {ActionButton, InfoCard} from '../common/UI';
import type {RiderStackParamList} from '../../navigation/types';

type Props = NativeStackScreenProps<RiderStackParamList, 'AssignedDeliveries'>;

export function AssignedDeliveriesScreen({navigation}: Props) {
  return (
    <ScreenContainer title="Assigned Deliveries" subtitle="Rider operational queue">
      <InfoCard title="Current assignment" value="Order #AGM-2401" />
      <InfoCard title="Delivery state" value="Awaiting 'Swipe to Start' flow (Phase 2)" />
      <ActionButton label="Open Live Map" onPress={() => navigation.navigate('LiveMap')} />
      <ActionButton label="View Earnings" onPress={() => navigation.navigate('Earnings')} variant="secondary" />
    </ScreenContainer>
  );
}

