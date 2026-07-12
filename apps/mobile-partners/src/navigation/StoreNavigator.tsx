import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StoreDashboard } from '../screens/store/StoreDashboard';
import { StoreDeliveryOperationsScreen } from '../screens/store/StoreDeliveryOperationsScreen';
import { StoreOrdersScreen } from '../screens/store/StoreOrdersScreen';
import { ClipboardCheck, LayoutGrid, ShoppingBag, Settings } from 'lucide-react-native';
import { View, Text, StyleSheet } from 'react-native';

const Tab = createBottomTabNavigator();

const StoreSettingsScreen = () => (
  <View style={styles.placeholder}>
    <Settings size={48} color="#CBD5E1" />
    <Text style={styles.placeholderTitle}>Store Settings</Text>
    <Text style={styles.placeholderText}>Settings and store configuration coming soon.</Text>
  </View>
);

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
        tabBarLabelStyle: { fontSize: 10, fontWeight: '900' },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={StoreDashboard}
        options={{ tabBarIcon: ({ color, size }) => <LayoutGrid size={size} color={color} /> }}
      />
      <Tab.Screen
        name="Orders"
        component={StoreOrdersScreen}
        options={{ tabBarIcon: ({ color, size }) => <ShoppingBag size={size} color={color} /> }}
      />
      <Tab.Screen
        name="Operations"
        component={StoreDeliveryOperationsScreen}
        options={{ tabBarIcon: ({ color, size }) => <ClipboardCheck size={size} color={color} /> }}
      />
      <Tab.Screen
        name="Settings"
        component={StoreSettingsScreen}
        options={{ tabBarIcon: ({ color, size }) => <Settings size={size} color={color} /> }}
      />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  placeholder: { flex: 1, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center', padding: 32 },
  placeholderTitle: { marginTop: 12, fontSize: 18, fontWeight: '900', color: '#0F172A' },
  placeholderText: { marginTop: 6, fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 20 },
});
