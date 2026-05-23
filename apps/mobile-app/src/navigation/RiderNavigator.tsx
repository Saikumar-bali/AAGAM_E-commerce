import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { RiderDashboard } from '../screens/rider/RiderDashboard';
import { RiderHistoryScreen } from '../screens/rider/RiderHistoryScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { LayoutGrid, History, User } from 'lucide-react-native';

const Tab = createBottomTabNavigator();

export const RiderNavigator = () => {
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
        component={RiderDashboard} 
        options={{
          tabBarIcon: ({ color, size }) => <LayoutGrid size={size} color={color} />,
        }}
      />
      <Tab.Screen 
        name="History" 
        component={RiderHistoryScreen}
        options={{
          tabBarIcon: ({ color, size }) => <History size={size} color={color} />,
        }}
      />
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
