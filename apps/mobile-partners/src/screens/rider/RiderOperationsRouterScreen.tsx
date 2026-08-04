import React from 'react';
import { RiderJobsNavigator } from '../../navigation/RiderJobsNavigator';

/**
 * Compatibility export retained for the Rider tab. Operations are now owned by
 * a typed nested stack, so push and cold-start routes have addressable screens.
 */
export const RiderOperationsRouterScreen = () => <RiderJobsNavigator />;
