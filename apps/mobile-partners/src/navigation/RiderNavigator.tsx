import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { RiderDashboard } from '../screens/rider/RiderDashboard';
import { RiderOperationsRouterScreen } from '../screens/rider/RiderOperationsRouterScreen';
import { RiderHistoryScreen } from '../screens/rider/RiderHistoryScreen';
import { RiderProfileScreen } from '../screens/rider/RiderProfileScreen';
import { PartnerNotificationsScreen } from '../screens/PartnerNotificationsScreen';
import { Bell, ClipboardCheck, History, LayoutGrid, User } from 'lucide-react-native';

const Tab = createBottomTabNavigator();

export const RiderNavigator = () => {
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
          left: 14,
          right: 14,
          bottom: 14,
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
        tabBarItemStyle: { borderRadius: 18 },
        tabBarLabelStyle: { fontSize: 9, fontWeight: '900', marginTop: 1 },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={RiderDashboard}
        options={{ tabBarButtonTestID: 'tab_dashboard', tabBarIcon: ({ color, size, focused }) => <LayoutGrid size={focused ? size + 2 : size} color={color} strokeWidth={focused ? 2.8 : 2} /> }}
      />
      <Tab.Screen
        name="Operations"
        component={RiderOperationsRouterScreen}
        options={{ tabBarButtonTestID: 'tab_deliveries', tabBarIcon: ({ color, size, focused }) => <ClipboardCheck size={focused ? size + 2 : size} color={color} strokeWidth={focused ? 2.8 : 2} /> }}
      />
      <Tab.Screen
        name="Alerts"
        component={PartnerNotificationsScreen}
        options={{ tabBarButtonTestID: 'tab_alerts', tabBarIcon: ({ color, size, focused }) => <Bell size={focused ? size + 2 : size} color={color} strokeWidth={focused ? 2.8 : 2} /> }}
      />
      <Tab.Screen
        name="History"
        component={RiderHistoryScreen}
        options={{ tabBarButtonTestID: 'tab_history', tabBarIcon: ({ color, size, focused }) => <History size={focused ? size + 2 : size} color={color} strokeWidth={focused ? 2.8 : 2} /> }}
      />
      <Tab.Screen
        name="Profile"
        component={RiderProfileScreen}
        options={{ tabBarButtonTestID: 'tab_profile', tabBarIcon: ({ color, size, focused }) => <User size={focused ? size + 2 : size} color={color} strokeWidth={focused ? 2.8 : 2} /> }}
      />
    </Tab.Navigator>
  );
};
