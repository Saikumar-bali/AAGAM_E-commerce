import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ShopScreen } from '../screens/customer/ShopScreen';
import { CartScreen } from '../screens/customer/CartScreen';
import { CheckoutScreen } from '../screens/customer/CheckoutScreen';
import { OrdersScreen } from '../screens/customer/OrdersScreen';
import { ProductDetailScreen } from '../screens/customer/ProductDetailScreen';
import { OrderDetailScreen } from '../screens/customer/OrderDetailScreen';
import { CustomerProfileScreen } from '../screens/customer/CustomerProfileScreen';
import { useCartStore } from '../store/cartStore';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

import { ShoppingBag, ShoppingCart, User, ClipboardList } from 'lucide-react-native';

const CustomerTabs = () => {
  const cartItemsCount = useCartStore((state) => state.items.length);

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
        name="Shop" 
        component={ShopScreen} 
        options={{
          tabBarIcon: ({ color, size }) => <ShoppingBag size={size} color={color} />,
        }}
      />
      <Tab.Screen 
        name="Cart" 
        component={CartScreen} 
        options={{ 
          tabBarIcon: ({ color, size }) => <ShoppingCart size={size} color={color} />,
          tabBarBadge: cartItemsCount > 0 ? cartItemsCount : undefined 
        }} 
      />
      <Tab.Screen 
        name="Orders" 
        component={OrdersScreen} 
        options={{
          tabBarIcon: ({ color, size }) => <ClipboardList size={size} color={color} />,
        }}
      />
      <Tab.Screen 
        name="Profile"
        component={CustomerProfileScreen}
        options={{
          tabBarIcon: ({ color, size }) => <User size={size} color={color} />,
        }} 
      />
    </Tab.Navigator>
  );
};

export const CustomerNavigator = () => {
  return (
    <Stack.Navigator>
      <Stack.Screen 
        name="MainTabs" 
        component={CustomerTabs} 
        options={{ headerShown: false }} 
      />
      <Stack.Screen 
        name="Checkout" 
        component={CheckoutScreen} 
        options={{ title: 'Checkout' }} 
      />
      <Stack.Screen 
        name="ProductDetail" 
        component={ProductDetailScreen} 
        options={{ title: 'Product Details' }} 
      />
      <Stack.Screen 
        name="OrderDetail" 
        component={OrderDetailScreen} 
        options={{ title: 'Order Details' }} 
      />
    </Stack.Navigator>
  );
};
