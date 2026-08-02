import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  Box,
  CircleCheck,
  Ellipsis,
  House,
  ShoppingCart,
} from 'lucide-react-native';
import { StoreDashboard } from '../screens/store/StoreDashboard';
import { StoreDeliveryOperationsScreen } from '../screens/store/StoreDeliveryOperationsScreen';
import { StoreInventoryScreen } from '../screens/store/StoreInventoryScreen';
import { StoreOrdersNavigator } from './StoreOrdersNavigator';
import { StoreSettingsScreen } from '../screens/store/StoreSettingsScreen';
import { StorePickupAlertsScreen } from '../screens/store/StorePickupAlertsScreen';
import { StorePickupVerificationEntryScreen } from '../screens/store/StorePickupVerificationEntryScreen';
import { StorePickupSuccessEntryScreen } from '../screens/store/StorePickupSuccessEntryScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const StoreTabs = () => (
  <Tab.Navigator
    screenOptions={{
      tabBarActiveTintColor: '#078B4D',
      tabBarInactiveTintColor: '#5D6570',
      headerShown: false,
      tabBarHideOnKeyboard: true,
      sceneStyle: { backgroundColor: '#FAFBFA' },
      tabBarStyle: {
        position: 'absolute',
        height: 83,
        paddingBottom: 12,
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
      tabBarItemStyle: { minWidth: 0 },
      tabBarLabelStyle: { fontSize: 10, fontWeight: '800', marginTop: 2 },
    }}
  >
    <Tab.Screen
      name="Dashboard"
      component={StoreDashboard}
      options={{
        title: 'Dashboard',
        tabBarButtonTestID: 'tab_dashboard',
        tabBarIcon: ({ color, size, focused }) => <House size={focused ? size + 2 : size} color={color} fill={focused ? color : 'none'} strokeWidth={focused ? 2.7 : 2} />,
      }}
    />
    <Tab.Screen
      name="Orders"
      component={StoreOrdersNavigator}
      options={{
        title: 'Orders',
        tabBarButtonTestID: 'tab_orders',
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
    <Tab.Screen
      name="StorePickupVerification"
      component={StorePickupVerificationEntryScreen}
      options={{
        tabBarButton: () => null,
        tabBarStyle: { display: 'none' },
      }}
    />
  </Tab.Navigator>
);

export const StoreNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#FAFBFA' }, animation: 'slide_from_right' }}>
    <Stack.Screen name="StoreTabs" component={StoreTabs} />
    <Stack.Screen name="StorePickupVerification" component={StorePickupVerificationEntryScreen} />
    <Stack.Screen name="StorePickupSuccess" component={StorePickupSuccessEntryScreen} />
    <Stack.Screen name="StoreReturnsCod" component={StoreDeliveryOperationsScreen} />
  </Stack.Navigator>
);
