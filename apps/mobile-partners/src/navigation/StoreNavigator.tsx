import React from 'react';
import { View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Box,
  CircleCheck,
  Ellipsis,
  House,
  ShoppingCart,
} from 'lucide-react-native';
import { StoreDashboard } from '../screens/store/StoreDashboard';
import { StoreDeliveryOperationsScreen } from '../screens/store/StoreDeliveryOperationsScreen';
import { StoreSubscriptionOperationsScreen } from '../screens/store/StoreSubscriptionOperationsScreen';
import { StoreSubscriptionPreparationFab } from '../screens/store/StoreSubscriptionPreparationFab';
import { StoreInventoryScreen } from '../screens/store/StoreInventoryScreen';
import { StoreOrdersNavigator } from './StoreOrdersNavigator';
import { StoreSettingsScreen } from '../screens/store/StoreSettingsScreen';
import { StorePickupAlertsScreen } from '../screens/store/StorePickupAlertsScreen';
import { StorePickupVerificationEntryScreen } from '../screens/store/StorePickupVerificationEntryScreen';
import { StorePickupSuccessEntryScreen } from '../screens/store/StorePickupSuccessEntryScreen';
import { notificationService } from '../api/notificationService';
import { storeService } from '../api/storeService';
import { deliveryOperationsService } from '../api/deliveryOperationsService';
import { PARTNER_NOTIFICATION_QUERY_KEY } from '../screens/PartnerNotificationsScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

async function pendingStoreOrders() {
  const result = await storeService.getPendingOrderCount();
  return Number(result?.count || 0);
}

function tabBadge(count: number) {
  if (count <= 0) return undefined;
  return count > 99 ? '99+' : count;
}

const StoreTabs = () => {
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, 6);
  const inboxQuery = useQuery({
    queryKey: PARTNER_NOTIFICATION_QUERY_KEY,
    queryFn: () => notificationService.getInbox(1),
    refetchInterval: 15_000,
    retry: 1,
  });
  const orderBadgeQuery = useQuery({
    queryKey: ['store', 'pending-order-badge'],
    queryFn: pendingStoreOrders,
    refetchInterval: 15_000,
    retry: 1,
  });
  const pickupBadgeQuery = useQuery({
    queryKey: ['store', 'pickup-waiting-badge'],
    queryFn: async () => {
      const queue = await deliveryOperationsService.getQueue();
      return queue.filter((job: any) => job.status === 'RIDER_AT_STORE').length;
    },
    refetchInterval: 10_000,
    retry: 1,
  });
  const badgeStyle = {
    backgroundColor: '#E1262F',
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900' as const,
  };

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#078B4D',
        tabBarInactiveTintColor: '#5D6570',
        headerShown: false,
        tabBarHideOnKeyboard: true,
        sceneStyle: { backgroundColor: '#FAFBFA' },
        tabBarStyle: {
          height: 58 + bottomPadding,
          paddingBottom: bottomPadding,
          paddingTop: 8,
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#E7E9E8',
          elevation: 18,
          shadowColor: '#10241D',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.08,
          shadowRadius: 12,
        },
        tabBarItemStyle: {
          flex: 1,
          minWidth: 0,
          paddingHorizontal: 0,
        },
        tabBarIconStyle: { marginTop: 0 },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '800', marginTop: 2 },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={StoreDashboard}
        options={{
          title: 'Dashboard',
          tabBarButtonTestID: 'tab_dashboard',
          tabBarBadge: tabBadge(Number(inboxQuery.data?.unreadCount || 0)),
          tabBarBadgeStyle: badgeStyle,
          tabBarIcon: ({ color, size, focused }) => <House size={focused ? size + 2 : size} color={color} fill={focused ? color : 'none'} strokeWidth={focused ? 2.7 : 2} />,
        }}
      />
      <Tab.Screen
        name="Orders"
        component={StoreOrdersNavigator}
        options={{
          title: 'Orders',
          tabBarButtonTestID: 'tab_orders',
          tabBarBadge: tabBadge(Number(orderBadgeQuery.data || 0)),
          tabBarBadgeStyle: badgeStyle,
          tabBarIcon: ({ color, size, focused }) => <ShoppingCart size={focused ? size + 2 : size} color={color} fill={focused ? color : 'none'} strokeWidth={focused ? 2.7 : 2} />,
        }}
      />
      <Tab.Screen
        name="Inventory"
        component={StoreInventoryScreen}
        options={{
          title: 'Inventory',
          tabBarButtonTestID: 'tab_inventory',
          tabBarIcon: ({ color, size, focused }) => <Box size={focused ? size + 2 : size} color={color} strokeWidth={focused ? 2.7 : 2} />,
        }}
      />
      <Tab.Screen
        name="Operations"
        component={StorePickupAlertsScreen}
        options={{
          title: 'Operations',
          tabBarButtonTestID: 'tab_operations',
          tabBarBadge: tabBadge(Number(pickupBadgeQuery.data || 0)),
          tabBarBadgeStyle: badgeStyle,
          tabBarIcon: ({ color, size, focused }) => <CircleCheck size={focused ? size + 2 : size} color={color} strokeWidth={focused ? 2.7 : 2} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={StoreSettingsScreen}
        options={{
          title: 'More',
          tabBarButtonTestID: 'tab_settings',
          tabBarIcon: ({ color, size, focused }) => <Ellipsis size={focused ? size + 3 : size} color={color} strokeWidth={focused ? 2.7 : 2} />,
        }}
      />
    </Tab.Navigator>
  );
};

export const StoreNavigator = () => (
  <View style={{ flex: 1 }}>
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#FAFBFA' }, animation: 'slide_from_right' }}>
      <Stack.Screen name="StoreTabs" component={StoreTabs} />
      <Stack.Screen name="StorePickupVerification" component={StorePickupVerificationEntryScreen} />
      <Stack.Screen name="StorePickupSuccess" component={StorePickupSuccessEntryScreen} />
      <Stack.Screen name="StoreReturnsCod" component={StoreDeliveryOperationsScreen} />
      <Stack.Screen name="StoreSubscriptionOperations" component={StoreSubscriptionOperationsScreen} />
    </Stack.Navigator>
    <StoreSubscriptionPreparationFab />
  </View>
);
