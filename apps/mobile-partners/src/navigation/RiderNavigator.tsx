import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Bell,
  BriefcaseBusiness,
  House,
  UserRound,
} from 'lucide-react-native';
import { notificationService } from '../api/notificationService';
import { PARTNER_NOTIFICATION_QUERY_KEY, PartnerNotificationsScreen } from '../screens/PartnerNotificationsScreen';
import { RiderDashboard } from '../screens/rider/RiderDashboard';
import { RiderEarningsScreen } from '../screens/rider/RiderEarningsScreen';
import { RiderOperationsRouterScreen } from '../screens/rider/RiderOperationsRouterScreen';
import { RiderProfileScreen } from '../screens/rider/RiderProfileScreen';
import { RiderNotificationSettingsScreen } from '../screens/rider/RiderNotificationSettingsScreen';
import { RiderTrackingDiagnosticsScreen } from '../screens/rider/RiderTrackingDiagnosticsScreen';
import type { RiderTabParamList } from './partnerNavigationTypes';

const Tab = createBottomTabNavigator<RiderTabParamList>();

export const RiderNavigator = () => {
  const inboxQuery = useQuery({
    queryKey: PARTNER_NOTIFICATION_QUERY_KEY,
    queryFn: () => notificationService.getInbox(1),
    staleTime: 10_000,
    retry: 1,
  });
  const unreadCount = Number(inboxQuery.data?.unreadCount || 0);

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#087B5B',
        tabBarInactiveTintColor: '#4F565D',
        headerShown: false,
        tabBarHideOnKeyboard: true,
        sceneStyle: { backgroundColor: '#FFFFFF' },
        tabBarStyle: {
          position: 'absolute',
          height: 78,
          paddingBottom: 9,
          paddingTop: 8,
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#E6E9E7',
          elevation: 22,
          shadowColor: '#111827',
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.08,
          shadowRadius: 10,
        },
        tabBarItemStyle: { borderRadius: 15 },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', marginTop: 2 },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={RiderDashboard}
        options={{
          title: 'Home',
          tabBarButtonTestID: 'tab_dashboard',
          tabBarIcon: ({ color, size, focused }) => (
            <House size={focused ? size + 2 : size} color={color} fill={focused ? color : 'none'} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />
      <Tab.Screen
        name="Operations"
        component={RiderOperationsRouterScreen}
        options={{
          title: 'Jobs',
          tabBarButtonTestID: 'tab_deliveries',
          tabBarIcon: ({ color, size, focused }) => (
            <BriefcaseBusiness size={focused ? size + 2 : size} color={color} fill={focused ? color : 'none'} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />
      <Tab.Screen
        name="Alerts"
        component={PartnerNotificationsScreen}
        options={{
          title: 'Alerts',
          tabBarButtonTestID: 'tab_alerts',
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: '#EF1D25',
            color: '#FFFFFF',
            fontSize: 10,
            fontWeight: '900',
            minWidth: 20,
            height: 20,
            lineHeight: 20,
          },
          tabBarIcon: ({ color, size, focused }) => (
            <Bell size={focused ? size + 2 : size} color={color} fill={focused ? color : 'none'} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />
      <Tab.Screen
        name="History"
        component={RiderEarningsScreen}
        options={{
          title: 'Earnings',
          tabBarButtonTestID: 'tab_earnings',
          tabBarIcon: ({ color, size, focused }) => (
            <BarChart3 size={focused ? size + 2 : size} color={color} fill={focused ? color : 'none'} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={RiderProfileScreen}
        options={{
          title: 'Profile',
          tabBarButtonTestID: 'tab_profile',
          tabBarIcon: ({ color, size, focused }) => (
            <UserRound size={focused ? size + 2 : size} color={color} fill={focused ? color : 'none'} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />
      <Tab.Screen
        name="NotificationSettings"
        component={RiderNotificationSettingsScreen}
        options={{ tabBarButton: () => null }}
      />
      <Tab.Screen
        name="TrackingDiagnostics"
        component={RiderTrackingDiagnosticsScreen}
        options={{ tabBarButton: () => null }}
      />
    </Tab.Navigator>
  );
};
