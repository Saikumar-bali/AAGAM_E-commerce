import React from 'react';
import {ActivityIndicator, View} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

import {useAuth} from '../context/AuthContext';
import {AuthNavigator} from './AuthNavigator';
import {CommonStackNavigator} from './CommonStackNavigator';
import {CustomerStackNavigator} from './CustomerStackNavigator';
import {RiderStackNavigator} from './RiderStackNavigator';
import type {RootStackParamList} from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

function RoleStack() {
  const {authState} = useAuth();
  return authState.user?.role === 'RIDER' ? <RiderStackNavigator /> : <CustomerStackNavigator />;
}

export function AppNavigator() {
  const {authState, isBootstrapping} = useAuth();

  if (isBootstrapping) {
    return (
      <View style={{flex: 1, justifyContent: 'center', alignItems: 'center'}}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {authState.token ? (
        <Stack.Navigator>
          <Stack.Screen name="RoleStack" component={RoleStack} options={{headerShown: false}} />
          <Stack.Screen name="CommonStack" component={CommonStackNavigator} options={{headerShown: false, presentation: 'modal'}} />
        </Stack.Navigator>
      ) : (
        <AuthNavigator />
      )}
    </NavigationContainer>
  );
}

