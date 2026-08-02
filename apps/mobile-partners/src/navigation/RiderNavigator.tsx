import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { RiderDashboard } from '../screens/rider/RiderDashboard';
import { RiderOperationsRouterScreen } from '../screens/rider/RiderOperationsRouterScreen';
import { RiderEarningsScreen } from '../screens/rider/RiderEarningsScreen';
import { RiderProfileScreen } from '../screens/rider/RiderProfileScreen';
import { PartnerNotificationsScreen } from '../screens/PartnerNotificationsScreen';
import { Bell, BriefcaseBusiness, Home, User, WalletCards } from 'lucide-react-native';

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
          height: 72,
          paddingBottom: 10,
          paddingTop: 7,
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#E6ECE9',
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
        options={{ title: 'Home', tabBarButtonTestID: 'tab_dashboard', tabBarIcon: ({ color, size, focused }) => <Home size={focused ? size + 2 : size} color={color} strokeWidth={focused ? 2.8 : 2} /> }}
      />
      <Tab.Screen
        name="Operations"
        component={RiderOperationsRouterScreen}
        options={{ title: 'Jobs', tabBarButtonTestID: 'tab_deliveries', tabBarIcon: ({ color, size, focused }) => <BriefcaseBusiness size={focused ? size + 2 : size} color={color} strokeWidth={focused ? 2.8 : 2} /> }}
      />
      <Tab.Screen
        name="Alerts"
        component={PartnerNotificationsScreen}
        options={{ tabBarButtonTestID: 'tab_alerts', tabBarIcon: ({ color, size, focused }) => <Bell size={focused ? size + 2 : size} color={color} strokeWidth={focused ? 2.8 : 2} /> }}
      />
      <Tab.Screen
        name="Earnings"
        component={RiderEarningsScreen}
        options={{ tabBarButtonTestID: 'tab_earnings', tabBarIcon: ({ color, size, focused }) => <WalletCards size={focused ? size + 2 : size} color={color} strokeWidth={focused ? 2.8 : 2} /> }}
      />
      <Tab.Screen
        name="Profile"
        component={RiderProfileScreen}
        options={{ tabBarButtonTestID: 'tab_profile', tabBarIcon: ({ color, size, focused }) => <User size={focused ? size + 2 : size} color={color} strokeWidth={focused ? 2.8 : 2} /> }}
      />
    </Tab.Navigator>
  );
};
