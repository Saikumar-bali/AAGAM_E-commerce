import React from 'react';
import { View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ellipsis, House, LayoutGrid, Repeat, ShoppingCart } from 'lucide-react-native';
import { StoreDashboard } from '../screens/store/StoreDashboard';
import { StoreOperationsHubScreen } from '../screens/store/StoreOperationsHubScreen';
import { StoreSubscriptionsHubScreen } from '../screens/store/StoreSubscriptionsHubScreen';
import { StoreMoreScreen } from '../screens/store/StoreMoreScreen';
import { StoreDeliveryOperationsScreen } from '../screens/store/StoreDeliveryOperationsScreen';
import { StoreSubscriptionOperationsScreen } from '../screens/store/StoreSubscriptionOperationsScreen';
import { StoreInventoryScreen } from '../screens/store/StoreInventoryScreen';
import { StoreOrdersNavigator } from './StoreOrdersNavigator';
import { StoreSettingsScreen } from '../screens/store/StoreSettingsScreen';
import { StorePickupAlertsScreen } from '../screens/store/StorePickupAlertsScreen';
import { StorePickupVerificationEntryScreen } from '../screens/store/StorePickupVerificationEntryScreen';
import { StorePickupSuccessEntryScreen } from '../screens/store/StorePickupSuccessEntryScreen';
import { StoreOfflineCustomerScreen } from '../screens/store/StoreOfflineCustomerScreen';
import { StoreSubscribersScreen } from '../screens/store/StoreSubscribersScreen';
import { StoreSubscriptionPlansScreen } from '../screens/store/StoreSubscriptionPlansScreen';
import { StoreMilkGridScreen } from '../screens/store/StoreMilkGridScreen';
import { StoreRiderAssignmentsScreen } from '../screens/store/StoreRiderAssignmentsScreen';
import { notificationService } from '../api/notificationService';
import { storeService } from '../api/storeService';
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

/**
 * Four-destination store tab bar — Home, Operations, Orders, More — mirroring
 * the web store workspace. Secondary screens (inventory, plans, subscribers,
 * subscription runs, settings, milk grid) drill down from the Operations and
 * More hubs instead of competing for a tab.
 */
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
  const badgeStyle = {
    backgroundColor: '#E1262F',
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '600' as const,
  };

  return (
    <View style={{ flex: 1 }}>
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#0F766E',
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
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginTop: 2 },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={StoreDashboard}
        options={{
          title: 'Home',
          tabBarButtonTestID: 'tab_dashboard',
          tabBarBadge: tabBadge(Number(inboxQuery.data?.unreadCount || 0)),
          tabBarBadgeStyle: badgeStyle,
          tabBarIcon: ({ color, size, focused }) => <House size={focused ? size + 2 : size} color={color} fill={focused ? color : 'none'} strokeWidth={focused ? 2.7 : 2} />,
        }}
      />
      <Tab.Screen
        name="Operations"
        component={StoreOperationsHubScreen}
        options={{
          title: 'Operations',
          tabBarButtonTestID: 'tab_operations',
          tabBarIcon: ({ color, size, focused }) => <LayoutGrid size={focused ? size + 2 : size} color={color} strokeWidth={focused ? 2.7 : 2} />,
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
        name="Subscriptions"
        component={StoreSubscriptionsHubScreen}
        options={{
          title: 'Subscriptions',
          tabBarButtonTestID: 'tab_subscriptions',
          tabBarIcon: ({ color, size, focused }) => <Repeat size={focused ? size + 2 : size} color={color} strokeWidth={focused ? 2.7 : 2} />,
        }}
      />
      <Tab.Screen
        name="More"
        component={StoreMoreScreen}
        options={{
          title: 'More',
          tabBarButtonTestID: 'tab_settings',
          tabBarIcon: ({ color, size, focused }) => <Ellipsis size={focused ? size + 3 : size} color={color} strokeWidth={focused ? 2.7 : 2} />,
        }}
      />
    </Tab.Navigator>
    </View>
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
      <Stack.Screen name="StoreSubscribers" component={StoreSubscribersScreen} />
      <Stack.Screen name="StoreSubscriptionPlans" component={StoreSubscriptionPlansScreen} />
      <Stack.Screen name="StoreMilkGrid" component={StoreMilkGridScreen} />
      <Stack.Screen name="StoreOfflineCustomer" component={StoreOfflineCustomerScreen} />
      <Stack.Screen name="StoreRiderAssignments" component={StoreRiderAssignmentsScreen} />
      <Stack.Screen name="StoreInventory" component={StoreInventoryScreen} />
      <Stack.Screen name="StoreSettings" component={StoreSettingsScreen} />
      <Stack.Screen name="StorePickupAlerts" component={StorePickupAlertsScreen} />
    </Stack.Navigator>
  </View>
);
