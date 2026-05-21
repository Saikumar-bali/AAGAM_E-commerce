import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StoreDashboard } from '../screens/store/StoreDashboard';
import { HomeScreen } from '../screens/HomeScreen';
import { LayoutGrid, Package, User, Settings } from 'lucide-react-native';

const Tab = createBottomTabNavigator();

export const StoreNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#0F172A',
        tabBarInactiveTintColor: '#A8A29E',
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          left: 18,
          right: 18,
          bottom: 16,
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
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '900',
        },
      }}
    >
      <Tab.Screen 
        name="Dashboard" 
        component={StoreDashboard} 
        options={{
          tabBarIcon: ({ color, size }) => <LayoutGrid size={size} color={color} />,
        }}
      />
      <Tab.Screen 
        name="Inventory" 
        options={{
          tabBarIcon: ({ color, size }) => <Package size={size} color={color} />,
        }}
      >
        {(props) => <HomeScreen {...props} role="Store Inventory" />}
      </Tab.Screen>
      <Tab.Screen 
        name="Settings" 
        options={{
          tabBarIcon: ({ color, size }) => <Settings size={size} color={color} />,
        }}
      >
        {(props) => <HomeScreen {...props} role="Store Settings" />}
      </Tab.Screen>
    </Tab.Navigator>
  );
};
