import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

import type {CommonStackParamList} from './types';
import {ProfileScreen} from '../screens/common/ProfileScreen';
import {SettingsScreen} from '../screens/common/SettingsScreen';

const Stack = createNativeStackNavigator<CommonStackParamList>();

export function CommonStackNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
    </Stack.Navigator>
  );
}

