import React from 'react';
import { StorePickupVerificationScreen } from './StorePickupVerificationScreen';

export const StorePickupVerificationEntryScreen = (props: any) => (
  <StorePickupVerificationScreen
    {...props}
    route={{
      ...props.route,
      params: {
        ...(props.route?.params || {}),
        deliveryJobId: props.route?.params?.deliveryJobId || '__FIRST_WAITING__',
      },
    }}
  />
);
