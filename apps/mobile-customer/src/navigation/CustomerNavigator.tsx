import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ShoppingBag, ShoppingCart, User, ClipboardList, Bell } from 'lucide-react-native';
import { ShopScreen } from '../screens/customer/ShopScreen';
import { CartScreen } from '../screens/customer/CartScreen';
import { CheckoutScreen } from '../screens/customer/CheckoutScreen';
import { OrdersScreen } from '../screens/customer/OrdersScreen';
import { ProductDetailScreen } from '../screens/customer/ProductDetailScreen';
import { OrderDetailScreen } from '../screens/customer/OrderDetailScreen';
import { ReviewScreen } from '../screens/customer/ReviewScreen';
import { NotificationsScreen } from '../screens/customer/NotificationsScreen';
import { CustomerProfileScreen } from '../screens/customer/CustomerProfileScreen';
import { useCartStore } from '../store/cartStore';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const CustomerTabs = () => {
  const cartItemsCount = useCartStore((state) => state.items.length);

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#0F172A',
        tabBarInactiveTintColor: '#A8A29E',
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          left: 14,
          right: 14,
          bottom: 12,
          height: 76,
          paddingBottom: 12,
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
      <Tab.Screen name="Shop" component={ShopScreen} options={{ tabBarIcon: ({ color, size }) => <ShoppingBag size={size} color={color} /> }} />
      <Tab.Screen name="Cart" component={CartScreen} options={{ tabBarIcon: ({ color, size }) => <ShoppingCart size={size} color={color} />, tabBarBadge: cartItemsCount > 0 ? cartItemsCount : undefined }} />
      <Tab.Screen name="Orders" component={OrdersScreen} options={{ tabBarIcon: ({ color, size }) => <ClipboardList size={size} color={color} /> }} />
      <Tab.Screen name="Alerts" component={NotificationsScreen} options={{ tabBarIcon: ({ color, size }) => <Bell size={size} color={color} /> }} />
      <Tab.Screen name="Profile" component={CustomerProfileScreen} options={{ tabBarIcon: ({ color, size }) => <User size={size} color={color} /> }} />
    </Tab.Navigator>
  );
};

export const CustomerNavigator = () => {
  return (
    <Stack.Navigator>
      <Stack.Screen name="MainTabs" component={CustomerTabs} options={{ headerShown: false }} />
      <Stack.Screen name="Checkout" component={CheckoutScreen} options={{ title: 'Checkout', headerShadowVisible: false }} />
      <Stack.Screen name="ProductDetail" component={ProductDetailScreen} options={{ title: 'Product Details', headerShadowVisible: false }} />
      <Stack.Screen name="OrderDetail" component={OrderDetailScreen} options={{ title: 'Order Details', headerShadowVisible: false }} />
      <Stack.Screen name="Review" component={ReviewScreen} options={{ title: 'Review Order', headerShadowVisible: false }} />
    </Stack.Navigator>
  );
};
