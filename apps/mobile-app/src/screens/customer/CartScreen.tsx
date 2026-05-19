import React from 'react';
import {NativeStackScreenProps} from '@react-navigation/native-stack';

import {ScreenContainer} from '../common/ScreenContainer';
import {ActionButton, InfoCard} from '../common/UI';
import type {CustomerStackParamList} from '../../navigation/types';
import {formatINR} from '../../utils/currency';

type Props = NativeStackScreenProps<CustomerStackParamList, 'Cart'>;

export function CartScreen({navigation}: Props) {
  const subtotal = 129 + 72 + 45;
  const deliveryFee = 19;
  const total = subtotal + deliveryFee;

  return (
    <ScreenContainer title="Cart" subtitle="Unified app customer flow">
      <InfoCard title="Items in cart" value="3" />
      <InfoCard title="Subtotal" value={formatINR(subtotal)} />
      <InfoCard title="Delivery fee" value={formatINR(deliveryFee)} />
      <InfoCard title="Total" value={formatINR(total)} />
      <InfoCard title="Checkout mode" value="Simulated payment pending (Phase 3)" />
      <ActionButton label="Proceed to Orders" onPress={() => navigation.navigate('Orders')} />
    </ScreenContainer>
  );
}
