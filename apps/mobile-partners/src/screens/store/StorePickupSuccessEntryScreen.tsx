import React from 'react';
import { StorePickupSuccessScreen } from './StorePickupSuccessScreen';

export const StorePickupSuccessEntryScreen = (props: any) => (
  <StorePickupSuccessScreen
    {...props}
    route={{
      ...props.route,
      params: {
        ...(props.route?.params || {}),
        storeId: props.route?.params?.storeId || props.route?.params?.receipt?.storeId || undefined,
      },
    }}
  />
);
