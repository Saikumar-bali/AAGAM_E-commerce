import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Bell, BriefcaseBusiness, House, UserRound } from 'lucide-react-native';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { notificationService } from '../api/notificationService';
import { PARTNER_NOTIFICATION_QUERY_KEY, PartnerNotificationsScreen } from '../screens/PartnerNotificationsScreen';
import { RiderDashboard } from '../screens/rider/RiderDashboard';
import { RiderEarningsScreen } from '../screens/rider/RiderEarningsScreen';
import { RiderOperationsRouterScreen } from '../screens/rider/RiderOperationsRouterScreen';
import { RiderNotificationSettingsScreen } from '../screens/rider/RiderNotificationSettingsScreen';
import { RiderTrackingDiagnosticsScreen } from '../screens/rider/RiderTrackingDiagnosticsScreen';
import { RiderAccountNavigator } from './RiderAccountNavigator';
import type { RiderTabParamList } from './partnerNavigationTypes';

const Tab = createBottomTabNavigator<RiderTabParamList>();

export const RiderNavigator = () => {
  const insets = useSafeAreaInsets();
  const inboxQuery = useQuery({
    queryKey: PARTNER_NOTIFICATION_QUERY_KEY,
    queryFn: () => notificationService.getInbox(1),
    staleTime: 10_000,
    retry: 1,
  });
  const unreadCount = Number(inboxQuery.data?.unreadCount || 0);
  const bottom = Math.max(insets.bottom, 6);

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#087B5B',
        tabBarInactiveTintColor: '#4F565D',
        headerShown: false,
        tabBarHideOnKeyboard: true,
        sceneStyle: { backgroundColor: '#FFFFFF' },
        tabBarStyle: {
          minHeight: 64 + bottom,
          height: 64 + bottom,
          paddingBottom: bottom,
          paddingTop: 7,
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#E6E9E7',
          elevation: Platform.OS === 'android' ? 18 : 0,
          shadowColor: '#111827',
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.08,
          shadowRadius: 10,
        },
        tabBarItemStyle: { borderRadius: 15 },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', marginTop: 2 },
      }}
    >
      <Tab.Screen name="Dashboard" component={RiderDashboard} options={{ title: 'Home', tabBarButtonTestID: 'tab_dashboard', tabBarIcon: ({ color, size, focused }) => <House size={focused ? size + 2 : size} color={color} fill={focused ? color : 'none'} strokeWidth={focused ? 2.5 : 2} /> }} />
      <Tab.Screen name="Operations" component={RiderOperationsRouterScreen} options={{ title: 'Jobs', tabBarButtonTestID: 'tab_deliveries', tabBarIcon: ({ color, size, focused }) => <BriefcaseBusiness size={focused ? size + 2 : size} color={color} fill={focused ? color : 'none'} strokeWidth={focused ? 2.5 : 2} /> }} />
      <Tab.Screen name="Alerts" component={PartnerNotificationsScreen} options={{ title: 'Alerts', tabBarButtonTestID: 'tab_alerts', tabBarBadge: unreadCount > 0 ? unreadCount : undefined, tabBarBadgeStyle: { backgroundColor: '#EF1D25', color: '#FFFFFF', fontSize: 10, fontWeight: '900', minWidth: 20, height: 20, lineHeight: 20 }, tabBarIcon: ({ color, size, focused }) => <Bell size={focused ? size + 2 : size} color={color} fill={focused ? color : 'none'} strokeWidth={focused ? 2.5 : 2} /> }} />
      <Tab.Screen name="History" component={RiderEarningsScreen} options={{ title: 'Earnings & cash', tabBarButtonTestID: 'tab_earnings', tabBarIcon: ({ color, size, focused }) => <BarChart3 size={focused ? size + 2 : size} color={color} fill={focused ? color : 'none'} strokeWidth={focused ? 2.5 : 2} /> }} />
      <Tab.Screen name="Profile" component={RiderAccountNavigator} options={{ title: 'Account', tabBarButtonTestID: 'tab_profile', tabBarIcon: ({ color, size, focused }) => <UserRound size={focused ? size + 2 : size} color={color} fill={focused ? color : 'none'} strokeWidth={focused ? 2.5 : 2} /> }} />
      <Tab.Screen name="NotificationSettings" component={RiderNotificationSettingsScreen} options={{ tabBarButton: () => null }} />
      <Tab.Screen name="TrackingDiagnostics" component={RiderTrackingDiagnosticsScreen} options={{ tabBarButton: () => null }} />
    </Tab.Navigator>
  );
};
