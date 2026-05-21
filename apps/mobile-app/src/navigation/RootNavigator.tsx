import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '../store/authStore';
import { LoginScreen } from '../screens/LoginScreen';
import { SignUpScreen } from '../screens/SignUpScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { View, ActivityIndicator, Text } from 'react-native';

import { CustomerNavigator } from './CustomerNavigator';
import { RiderNavigator } from './RiderNavigator';
import { StoreNavigator } from './StoreNavigator';

const Stack = createNativeStackNavigator();

export const RootNavigator = () => {
  const { user, isLoading, initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'white' }}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={{ marginTop: 10, color: '#666' }}>Loading Aagam...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <>
            {user.role === 'CUSTOMER' ? (
              <Stack.Screen name="CustomerRoot" component={CustomerNavigator} />
            ) : user.role === 'RIDER' ? (
              <Stack.Screen name="RiderRoot" component={RiderNavigator} />
            ) : user.role === 'STORE_OWNER' ? (
              <Stack.Screen name="StoreRoot" component={StoreNavigator} />
            ) : (
              <Stack.Screen name="Home">
                {(props) => <HomeScreen {...props} role={user.role} />}
              </Stack.Screen>
            )}
          </>
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="SignUp" component={SignUpScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};
