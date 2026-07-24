import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ClipboardCheck, LayoutGrid, Package, Settings, ShoppingBag } from 'lucide-react-native';
import { StoreDashboard } from '../screens/store/StoreDashboard';
import { StoreDeliveryOperationsScreen } from '../screens/store/StoreDeliveryOperationsScreen';
import { StoreInventoryScreen } from '../screens/store/StoreInventoryScreen';
import { StoreOrdersNavigator } from './StoreOrdersNavigator';
import { StoreSettingsScreen } from '../screens/store/StoreSettingsScreen';

const Tab = createBottomTabNavigator();

export const StoreNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#0F172A',
        tabBarInactiveTintColor: '#A8A29E',
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: 12,
          height: 74,
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
        tabBarItemStyle: { minWidth: 0 },
        tabBarLabelStyle: { fontSize: 9, fontWeight: '900' },
      }}
    >
      <Tab.Screen name="Dashboard" component={StoreDashboard} options={{ tabBarButtonTestID: 'tab_dashboard', tabBarIcon: ({ color, size }) => <LayoutGrid size={size} color={color} /> }} />
      <Tab.Screen name="Orders" component={StoreOrdersNavigator} options={{ tabBarButtonTestID: 'tab_orders', tabBarIcon: ({ color, size }) => <ShoppingBag size={size} color={color} /> }} />
      <Tab.Screen name="Inventory" component={StoreInventoryScreen} options={{ tabBarButtonTestID: 'tab_inventory', tabBarIcon: ({ color, size }) => <Package size={size} color={color} /> }} />
      <Tab.Screen name="Operations" component={StoreDeliveryOperationsScreen} options={{ tabBarButtonTestID: 'tab_operations', tabBarIcon: ({ color, size }) => <ClipboardCheck size={size} color={color} /> }} />
      <Tab.Screen name="Settings" component={StoreSettingsScreen} options={{ tabBarButtonTestID: 'tab_settings', tabBarIcon: ({ color, size }) => <Settings size={size} color={color} /> }} />
    </Tab.Navigator>
  );
};
