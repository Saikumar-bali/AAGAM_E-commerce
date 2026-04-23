import React from 'react';
import {Pressable, Text} from 'react-native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {useNavigation} from '@react-navigation/native';

import type {CustomerStackParamList} from './types';
import {ShopScreen} from '../screens/customer/ShopScreen';
import {CartScreen} from '../screens/customer/CartScreen';
import {OrdersScreen} from '../screens/customer/OrdersScreen';

const Stack = createNativeStackNavigator<CustomerStackParamList>();

function HeaderActions() {
  const navigation = useNavigation<any>();

  return (
    <Pressable onPress={() => navigation.getParent()?.navigate('CommonStack', {screen: 'Profile'})}>
      <Text style={{color: '#1d4ed8', fontWeight: '700'}}>Profile</Text>
    </Pressable>
  );
}

export function CustomerStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerRight: () => <HeaderActions />,
      }}>
      <Stack.Screen name="Shop" component={ShopScreen} options={{headerShown: false}} />
      <Stack.Screen name="Cart" component={CartScreen} />
      <Stack.Screen name="Orders" component={OrdersScreen} />
    </Stack.Navigator>
  );
}
