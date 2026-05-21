import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '../store/authStore';
import { LoginScreen } from '../screens/LoginScreen';
import { SignUpScreen } from '../screens/SignUpScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';

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
      <View style={styles.loadingPage}>
        <View style={styles.loadingMark}>
          <Text style={styles.loadingLogo}>A</Text>
        </View>
        <ActivityIndicator size="small" color="#14B8A6" />
        <Text style={styles.loadingTitle}>Preparing Aagam</Text>
        <Text style={styles.loadingSub}>Syncing your commerce workspace</Text>
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

const styles = StyleSheet.create({
  loadingPage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#101827',
    paddingHorizontal: 28,
  },
  loadingMark: {
    width: 82,
    height: 82,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 22,
  },
  loadingLogo: { color: '#101827', fontSize: 38, fontWeight: '900' },
  loadingTitle: { color: '#FFFFFF', fontSize: 21, fontWeight: '900', marginTop: 18 },
  loadingSub: { color: '#94A3B8', fontSize: 13, fontWeight: '600', marginTop: 7 },
});
