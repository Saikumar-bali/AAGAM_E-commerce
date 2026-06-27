import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { useAuthStore } from '@aagam/mobile-shared';
import { LoginScreen } from '../screens/LoginScreen';
import { SignUpScreen } from '../screens/SignUpScreen';
import { CustomerNavigator } from './CustomerNavigator';

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
        <ActivityIndicator size="small" color="#0F766E" />
        <Text style={styles.loadingTitle}>Preparing AAGAM</Text>
        <Text style={styles.loadingSub}>Setting up your grocery experience</Text>
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
            ) : (
              <Stack.Screen name="WrongRole">
                {() => (
                  <View style={styles.wrongRolePage}>
                    <View style={styles.wrongRoleMark}>
                      <Text style={styles.wrongRoleLogo}>A</Text>
                    </View>
                    <Text style={styles.wrongRoleTitle}>AAGAM Customer</Text>
                    <Text style={styles.wrongRoleText}>
                      This app is for customers only. Use AAGAM Partners for rider/store access.
                    </Text>
                  </View>
                )}
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
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 28,
  },
  loadingMark: {
    width: 82,
    height: 82,
    borderRadius: 28,
    backgroundColor: '#0F766E',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 22,
  },
  loadingLogo: { color: '#FFFFFF', fontSize: 38, fontWeight: '900' },
  loadingTitle: { color: '#0F172A', fontSize: 21, fontWeight: '900', marginTop: 18 },
  loadingSub: { color: '#64748B', fontSize: 13, fontWeight: '600', marginTop: 7 },
  wrongRolePage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 32,
  },
  wrongRoleMark: {
    width: 82,
    height: 82,
    borderRadius: 28,
    backgroundColor: '#0F766E',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 22,
  },
  wrongRoleLogo: { color: '#FFFFFF', fontSize: 38, fontWeight: '900' },
  wrongRoleTitle: { color: '#0F172A', fontSize: 22, fontWeight: '900', marginTop: 18 },
  wrongRoleText: {
    color: '#64748B',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 10,
    textAlign: 'center',
    lineHeight: 22,
  },
});
