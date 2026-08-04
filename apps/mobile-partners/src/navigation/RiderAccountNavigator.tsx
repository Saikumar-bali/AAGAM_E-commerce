import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RiderProfileScreen } from '../screens/rider/RiderProfileScreen';
import type { RiderAccountStackParamList } from './partnerNavigationTypes';

const Stack = createNativeStackNavigator<RiderAccountStackParamList>();
export const RiderAccountNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F5F7F6' }, animation: 'slide_from_right' }}>
    <Stack.Screen name="AccountHub" component={RiderProfileScreen} />
    <Stack.Screen name="AccountProfile" component={RiderProfileScreen} />
    <Stack.Screen name="AccountDocuments" component={RiderProfileScreen} />
    <Stack.Screen name="AccountAvailability" component={RiderProfileScreen} />
    <Stack.Screen name="AccountSupport" component={RiderProfileScreen} />
    <Stack.Screen name="AccountPrivacy" component={RiderProfileScreen} />
  </Stack.Navigator>
);
