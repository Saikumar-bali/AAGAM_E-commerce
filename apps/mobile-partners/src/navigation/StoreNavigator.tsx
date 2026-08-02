import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ClipboardCheck, LayoutGrid, Package, Settings, ShoppingBag } from 'lucide-react-native';
import { StoreDashboard } from '../screens/store/StoreDashboard';
import { StoreDeliveryOperationsScreen } from '../screens/store/StoreDeliveryOperationsScreen';
import { StoreInventoryScreen } from '../screens/store/StoreInventoryScreen';
import { StoreOrdersNavigator } from './StoreOrdersNavigator';
import { StoreSettingsScreen } from '../screens/store/StoreSettingsScreen';
import { StorePickupVerificationScreen } from '../screens/store/StorePickupVerificationScreen';
import { deliveryOperationsService, STORE_DELIVERY_OPERATIONS_QUERY_KEY } from '../api/deliveryOperationsService';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const StoreTabs = () => {
  const pickupQueueQuery = useQuery({
    queryKey: STORE_DELIVERY_OPERATIONS_QUERY_KEY,
    queryFn: deliveryOperationsService.getQueue,
    refetchInterval: 15_000,
    retry: 1,
  });
  const pickupCount = (Array.isArray(pickupQueueQuery.data) ? pickupQueueQuery.data : [])
    .filter((job: any) => job.status === 'RIDER_AT_STORE').length;

  return (
  <Tab.Navigator
    screenOptions={{
      tabBarActiveTintColor: '#0F766E',
      tabBarInactiveTintColor: '#94A3B8',
      headerShown: false,
      tabBarHideOnKeyboard: true,
      sceneStyle: { backgroundColor: '#F4F7FB' },
      tabBarStyle: {
        position: 'absolute',
        left: 12,
        right: 12,
        bottom: 12,
        height: 76,
        paddingBottom: 14,
        paddingTop: 8,
        backgroundColor: '#FFFFFF',
        borderTopWidth: 0,
        borderRadius: 28,
        elevation: 18,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.14,
        shadowRadius: 24,
      },
      tabBarItemStyle: { minWidth: 0, borderRadius: 18 },
      tabBarLabelStyle: { fontSize: 9, fontWeight: '900', marginTop: 1 },
    }}
  >
    <Tab.Screen name="Dashboard" component={StoreDashboard} options={{ tabBarButtonTestID: 'tab_dashboard', tabBarIcon: ({ color, size, focused }) => <LayoutGrid size={focused ? size + 2 : size} color={color} strokeWidth={focused ? 2.8 : 2} /> }} />
    <Tab.Screen name="Orders" component={StoreOrdersNavigator} options={{ tabBarButtonTestID: 'tab_orders', tabBarIcon: ({ color, size, focused }) => <ShoppingBag size={focused ? size + 2 : size} color={color} strokeWidth={focused ? 2.8 : 2} /> }} />
    <Tab.Screen name="Inventory" component={StoreInventoryScreen} options={{ tabBarButtonTestID: 'tab_inventory', tabBarIcon: ({ color, size, focused }) => <Package size={focused ? size + 2 : size} color={color} strokeWidth={focused ? 2.8 : 2} /> }} />
    <Tab.Screen
      name="Operations"
      component={StoreDeliveryOperationsScreen}
      options={{
        tabBarButtonTestID: 'tab_operations',
        tabBarBadge: pickupCount > 0 ? (pickupCount > 99 ? '99+' : pickupCount) : undefined,
        tabBarBadgeStyle: {
          backgroundColor: '#DC2626',
          color: '#FFFFFF',
          fontSize: 10,
          fontWeight: '900',
          minWidth: 20,
          height: 20,
          borderRadius: 10,
          textAlign: 'center',
          textAlignVertical: 'center',
        },
        tabBarIcon: ({ color, size, focused }) => (
          <ClipboardCheck size={focused ? size + 2 : size} color={color} strokeWidth={focused ? 2.8 : 2} />
        ),
      }}
    />
    <Tab.Screen name="Settings" component={StoreSettingsScreen} options={{ tabBarButtonTestID: 'tab_settings', tabBarIcon: ({ color, size, focused }) => <Settings size={focused ? size + 2 : size} color={color} strokeWidth={focused ? 2.8 : 2} /> }} />
  </Tab.Navigator>
  );
};

export const StoreNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F4F7FB' }, animation: 'slide_from_right' }}>
    <Stack.Screen name="StoreTabs" component={StoreTabs} />
    <Stack.Screen name="StorePickupVerification" component={StorePickupVerificationScreen} />
  </Stack.Navigator>
);
