import React from 'react';
import { StyleSheet, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { CustomerStackParamList } from './customerNavigationTypes';
import {
  House,
  Grid2X2,
  ClipboardList,
  ShoppingCart,
  UserRound,
} from 'lucide-react-native';
import { ShopScreen } from '../screens/customer/ShopScreen';
import { CartScreen } from '../screens/customer/CartScreen';
import { CheckoutScreen } from '../screens/customer/CheckoutScreen';
import { OrdersScreen } from '../screens/customer/OrdersScreen';
import { ProductDetailScreen } from '../screens/customer/ProductDetailScreen';
import { OrderDetailScreen } from '../screens/customer/OrderDetailScreen';
import { ReviewScreen } from '../screens/customer/ReviewScreen';
import { NotificationsScreen } from '../screens/customer/NotificationsScreen';
import { CustomerProfileScreen } from '../screens/customer/CustomerProfileScreen';
import { CustomerSupportScreen } from '../screens/customer/CustomerSupportScreen';
import { DealsScreen } from '../screens/customer/DealsScreen';
import { SavedAddressesScreen } from '../screens/customer/SavedAddressesScreen';
import { SubscriptionPlansScreen } from '../screens/customer/SubscriptionPlansScreen';
import { SubscriptionReviewScreen } from '../screens/customer/SubscriptionReviewScreen';
import { MySubscriptionsScreen } from '../screens/customer/MySubscriptionsScreen';
import { SubscriptionDetailScreen } from '../screens/customer/SubscriptionDetailScreen';
import { AagamBrand } from '../components/AagamBrand';
import { useCartStore } from '../store/cartStore';
import { getCartItemCount } from '../utils/customerCommerce';
import { CustomerBottomNav, CustomerScreenWithNav } from '../components/CustomerBottomNav';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator<CustomerStackParamList>();

const CategoriesBrandHeader = () => (
  <View style={styles.categoriesBrandHeader}>
    <AagamBrand size={42} />
  </View>
);

const CustomerTabs = () => {
  const cartItemsCount = useCartStore((state) => getCartItemCount(state.items));

  return (
    <Tab.Navigator
      tabBar={(props) => <CustomerBottomNav navigation={props.navigation} state={props.state} />}
      screenOptions={{
        tabBarActiveTintColor: '#0F766E',
        tabBarInactiveTintColor: '#64748B',
        headerShown: false,
        tabBarStyle: { display: 'none' },
      }}
    >
      <Tab.Screen
        name="Home"
        component={ShopScreen}
        options={{
          tabBarIcon: ({ color, size }) => <House size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Categories"
        component={ShopScreen}
        options={{
          headerShown: true,
          header: CategoriesBrandHeader,
          tabBarIcon: ({ color, size }) => <Grid2X2 size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Cart"
        component={CartScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <ShoppingCart size={size} color={color} />
          ),
          tabBarBadge: cartItemsCount > 0 ? cartItemsCount : undefined,
        }}
      />
      <Tab.Screen
        name="Orders"
        component={OrdersScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <ClipboardList size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={CustomerProfileScreen}
        options={{
          tabBarIcon: ({ color, size }) => <UserRound size={size} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
};

const withBottomNav = (Component: React.ComponentType<any>, active: 'Home' | 'Categories' | 'Cart' | 'Orders' | 'Profile') => {
  const Screen = (props: any) => (
    <CustomerScreenWithNav active={active}>
      <Component {...props} />
    </CustomerScreenWithNav>
  );
  Screen.displayName = `CustomerScreenWithNav(${Component.displayName || Component.name || 'Screen'})`;
  return Screen;
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
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Deals"
        component={withBottomNav(DealsScreen, 'Home')}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ProductDetail"
        component={withBottomNav(ProductDetailScreen, 'Home')}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="OrderDetail"
        component={withBottomNav(OrderDetailScreen, 'Orders')}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Review"
        component={withBottomNav(ReviewScreen, 'Orders')}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Support"
        component={withBottomNav(CustomerSupportScreen, 'Profile')}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Alerts"
        component={withBottomNav(NotificationsScreen, 'Home')}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="SavedAddresses"
        component={withBottomNav(SavedAddressesScreen, 'Profile')}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="SubscriptionPlans"
        component={withBottomNav(SubscriptionPlansScreen, 'Home')}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="SubscriptionReview"
        component={SubscriptionReviewScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="MySubscriptions"
        component={withBottomNav(MySubscriptionsScreen, 'Profile')}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="SubscriptionDetail"
        component={withBottomNav(SubscriptionDetailScreen, 'Profile')}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
};

const styles = StyleSheet.create({
  categoriesBrandHeader: {
    minHeight: 62,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#DDE7EA',
    backgroundColor: '#FFFFFF',
  },
});
