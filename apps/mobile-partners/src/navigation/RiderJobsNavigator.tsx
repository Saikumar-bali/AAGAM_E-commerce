import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RiderJobsStackParamList } from './partnerNavigationTypes';
import { RiderJobsScreen } from '../screens/rider/RiderJobsScreen';
import { RiderOfferDetailScreen } from '../screens/rider/RiderOfferDetailScreen';
import { RiderJobRouteScreen } from '../screens/rider/RiderJobRouteScreen';
import { RiderHistoryScreen } from '../screens/rider/RiderHistoryScreen';
import { RiderJobHistoryDetailScreen } from '../screens/rider/RiderJobHistoryDetailScreen';
import { RiderReceiptScreen } from '../screens/rider/RiderReceiptScreen';

const Stack = createNativeStackNavigator<RiderJobsStackParamList>();

function Jobs({ navigation }: { navigation: any }) {
  return (
    <RiderJobsScreen
      onOpenActive={(deliveryJobId: string) => navigation.navigate('RiderActiveJob', { deliveryJobId })}
      onOpenHistory={() => navigation.navigate('RiderJobHistory')}
      onOpenDashboard={() => navigation.getParent()?.navigate('Dashboard')}
      onOpenReceipt={(deliveryJobId: string) => navigation.navigate('RiderReceipt', { deliveryJobId })}
    />
  );
}

function Active(props: any) {
  return <RiderJobRouteScreen {...props} expected="ACTIVE" />;
}
function Pickup(props: any) {
  return <RiderJobRouteScreen {...props} expected="PICKUP" />;
}
function Delivery(props: any) {
  return <RiderJobRouteScreen {...props} expected="DELIVERY" />;
}
function Return(props: any) {
  return <RiderJobRouteScreen {...props} expected="RETURN" />;
}
function History({ navigation }: { navigation: any }) {
  return (
    <RiderHistoryScreen
      onBack={() => navigation.goBack()}
      onOpenDetail={(deliveryJobId) => navigation.navigate('RiderJobHistoryDetail', { deliveryJobId })}
    />
  );
}

export const RiderJobsNavigator = () => (
  <Stack.Navigator
    initialRouteName="RiderJobs"
    screenOptions={{
      headerShown: false,
      contentStyle: { backgroundColor: '#F4F7FB' },
      animation: 'slide_from_right',
    }}
  >
    <Stack.Screen name="RiderJobs" component={Jobs} />
    <Stack.Screen name="RiderOfferDetail" component={RiderOfferDetailScreen} />
    <Stack.Screen name="RiderActiveJob" component={Active} />
    <Stack.Screen name="RiderPickup" component={Pickup} />
    <Stack.Screen name="RiderDelivery" component={Delivery} />
    <Stack.Screen name="RiderReturn" component={Return} />
    <Stack.Screen name="RiderJobHistory" component={History} />
    <Stack.Screen name="RiderJobHistoryDetail" component={RiderJobHistoryDetailScreen} />
    <Stack.Screen name="RiderReceipt" component={RiderReceiptScreen} />
  </Stack.Navigator>
);
