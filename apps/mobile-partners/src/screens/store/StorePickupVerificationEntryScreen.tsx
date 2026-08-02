import React from 'react';
import { StorePickupVerificationScreen } from './StorePickupVerificationScreen';

export const StorePickupVerificationEntryScreen = (props: any) => {
  const stackNavigation = typeof props.navigation?.replace === 'function'
    ? props.navigation
    : props.navigation?.getParent?.() || props.navigation;

  return (
    <StorePickupVerificationScreen
      {...props}
      navigation={stackNavigation}
      route={{
        ...props.route,
        params: {
          ...(props.route?.params || {}),
          deliveryJobId: props.route?.params?.deliveryJobId || '__FIRST_WAITING__',
        },
      }}
    />
  );
};
