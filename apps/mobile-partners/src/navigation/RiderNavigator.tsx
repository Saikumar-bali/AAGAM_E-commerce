import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useQuery } from '@tanstack/react-query';
import { Bell, ClipboardList, Clock3, House, UserRound } from 'lucide-react-native';
import { notificationService } from '../api/notificationService';
import { PARTNER_NOTIFICATION_QUERY_KEY, PartnerNotificationsScreen } from '../screens/PartnerNotificationsScreen';
import { RiderDashboard } from '../screens/rider/RiderDashboard';
import { RiderEarningsScreen } from '../screens/rider/RiderEarningsScreen';
import { RiderOperationsRouterScreen } from '../screens/rider/RiderOperationsRouterScreen';
import { RiderProfileScreen } from '../screens/rider/RiderProfileScreen';

const Tab = createBottomTabNavigator();

export const RiderNavigator = () => {
  const inboxQuery = useQuery({
    queryKey: PARTNER_NOTIFICATION_QUERY_KEY,
    queryFn: () => notificationService.getInbox(1),
    refetchInterval: 15_000,
    retry: 1,
  });
  const unreadCount = Number(inboxQuery.data?.unreadCount || 0);

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#06996D',
        tabBarInactiveTintColor: '#5F6773',
        headerShown: false,
        tabBarHideOnKeyboard: true,
        sceneStyle: { backgroundColor: '#FFFFFF' },
        tabBarStyle: {
          position: 'absolute',
          height: 76,
          paddingBottom: 10,
          paddingTop: 8,
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#EEF0F2',
          elevation: 20,
          shadowColor: '#111827',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.08,
          shadowRadius: 12,
        },
        tabBarItemStyle: { borderRadius: 16 },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', marginTop: 2 },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={RiderDashboard}
        options={{
          title: 'Dashboard',
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
          title: 'Operations',
          tabBarButtonTestID: 'tab_deliveries',
          tabBarIcon: ({ color, size, focused }) => (
            <ClipboardList size={focused ? size + 2 : size} color={color} strokeWidth={focused ? 2.5 : 2} />
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
            backgroundColor: '#EF2424',
            color: '#FFFFFF',
            fontSize: 10,
            fontWeight: '900',
            minWidth: 19,
            height: 19,
            lineHeight: 19,
          },
          tabBarIcon: ({ color, size, focused }) => (
            <Bell size={focused ? size + 2 : size} color={color} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />
      <Tab.Screen
        name="History"
        component={RiderEarningsScreen}
        options={{
          title: 'History',
          tabBarButtonTestID: 'tab_earnings',
          tabBarIcon: ({ color, size, focused }) => (
            <Clock3 size={focused ? size + 2 : size} color={color} strokeWidth={focused ? 2.5 : 2} />
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
            <UserRound size={focused ? size + 2 : size} color={color} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />
    </Tab.Navigator>
  );
};
