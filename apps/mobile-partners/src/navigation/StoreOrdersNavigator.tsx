import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StoreOrdersScreen } from '../screens/store/StoreOrdersScreen';
import { StoreOrderDetailsScreen } from '../screens/store/StoreOrderDetailsScreen';

const Stack = createNativeStackNavigator();

export const StoreOrdersNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="OrderQueue" component={StoreOrdersScreen} />
    <Stack.Screen name="OrderDetails" component={StoreOrderDetailsScreen} />
  </Stack.Navigator>
);
