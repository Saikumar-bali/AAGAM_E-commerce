import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { RiderDashboard } from '../screens/rider/RiderDashboard';
import { HomeScreen } from '../screens/HomeScreen';
import { LayoutGrid, History, User } from 'lucide-react-native';

const Tab = createBottomTabNavigator();

export const RiderNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#4F46E5',
        tabBarInactiveTintColor: '#94A3B8',
        headerShown: true,
        tabBarStyle: {
          height: 70,
          paddingBottom: 12,
          paddingTop: 8,
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#F1F5F9',
          elevation: 10,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.05,
          shadowRadius: 10,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
      }}
    >
      <Tab.Screen 
        name="Dashboard" 
        component={RiderDashboard} 
        options={{
          tabBarIcon: ({ color, size }) => <LayoutGrid size={size} color={color} />,
        }}
      />
      <Tab.Screen 
        name="History" 
        options={{
          tabBarIcon: ({ color, size }) => <History size={size} color={color} />,
        }}
      >
        {(props) => <HomeScreen {...props} role="Rider History" />}
      </Tab.Screen>
      <Tab.Screen 
        name="Profile" 
        options={{
          tabBarIcon: ({ color, size }) => <User size={size} color={color} />,
        }}
      >
        {(props) => <HomeScreen {...props} role="Rider Profile" />}
      </Tab.Screen>
    </Tab.Navigator>
  );
};
