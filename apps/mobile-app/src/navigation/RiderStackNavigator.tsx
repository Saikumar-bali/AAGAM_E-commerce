import React from 'react';
import {Pressable, Text} from 'react-native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {useNavigation} from '@react-navigation/native';

import type {RiderStackParamList} from './types';
import {AssignedDeliveriesScreen} from '../screens/rider/AssignedDeliveriesScreen';
import {LiveMapScreen} from '../screens/rider/LiveMapScreen';
import {EarningsScreen} from '../screens/rider/EarningsScreen';

const Stack = createNativeStackNavigator<RiderStackParamList>();

function HeaderActions() {
  const navigation = useNavigation<any>();

  return (
    <Pressable onPress={() => navigation.getParent()?.navigate('CommonStack', {screen: 'Profile'})}>
      <Text style={{color: '#1d4ed8', fontWeight: '700'}}>Profile</Text>
    </Pressable>
  );
}

export function RiderStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerRight: () => <HeaderActions />,
      }}>
      <Stack.Screen name="AssignedDeliveries" component={AssignedDeliveriesScreen} options={{title: 'Deliveries'}} />
      <Stack.Screen name="LiveMap" component={LiveMapScreen} options={{title: 'Live Map'}} />
      <Stack.Screen name="Earnings" component={EarningsScreen} />
    </Stack.Navigator>
  );
}

