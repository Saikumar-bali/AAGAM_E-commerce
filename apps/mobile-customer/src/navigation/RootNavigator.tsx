import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { useAuthStore } from '@aagam/mobile-shared';
import { LoginScreen } from '../screens/LoginScreen';
import { SignUpScreen } from '../screens/SignUpScreen';
import { CustomerNavigator } from './CustomerNavigator';

const Stack = createNativeStackNavigator();

export const RootNavigator = () => {
  const user = useAuthStore((state) => state.user);
  const initialize = useAuthStore((state) => state.initialize);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    let mounted = true;
    void initialize().finally(() => {
      if (mounted) setIsInitializing(false);
    });
    return () => {
      mounted = false;
    };
  }, [initialize]);

  // Only secure-session restoration may replace the navigator with a splash.
  // OTP/login request loading is owned by each screen so its local form state
  // remains mounted while an authentication request is in flight.
  if (isInitializing) {
    return (
      <View style={styles.loadingPage}>
        <View style={styles.loadingMark}><Text style={styles.loadingLogo}>A</Text></View>
        <ActivityIndicator size="small" color="#0F766E" />
        <Text style={styles.loadingTitle}>Preparing AAGAM</Text>
        <Text style={styles.loadingSub}>Setting up your grocery experience</Text>
      </View>
    );
  }

  const roles = new Set<string>([
    (user as any)?.role,
    ...(Array.isArray((user as any)?.roles) ? (user as any).roles : []),
  ].filter(Boolean));
  const canShop = roles.has('CUSTOMER');

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          canShop ? (
            <Stack.Screen name="CustomerRoot" component={CustomerNavigator} />
          ) : (
            <Stack.Screen name="WrongRole">
              {() => (
                <View style={styles.wrongRolePage}>
                  <View style={styles.wrongRoleMark}><Text style={styles.wrongRoleLogo}>A</Text></View>
                  <Text style={styles.wrongRoleTitle}>Customer access unavailable</Text>
                  <Text style={styles.wrongRoleText}>Ask AAGAM support to add Customer access to this account.</Text>
                </View>
              )}
            </Stack.Screen>
          )
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
  loadingPage: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC', paddingHorizontal: 28 },
  loadingMark: { width: 82, height: 82, borderRadius: 28, backgroundColor: '#0F766E', justifyContent: 'center', alignItems: 'center', marginBottom: 22 },
  loadingLogo: { color: '#FFFFFF', fontSize: 38, fontWeight: '900' },
  loadingTitle: { color: '#0F172A', fontSize: 21, fontWeight: '900', marginTop: 18 },
  loadingSub: { color: '#64748B', fontSize: 13, fontWeight: '600', marginTop: 7 },
  wrongRolePage: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC', paddingHorizontal: 32 },
  wrongRoleMark: { width: 82, height: 82, borderRadius: 28, backgroundColor: '#0F766E', justifyContent: 'center', alignItems: 'center', marginBottom: 22 },
  wrongRoleLogo: { color: '#FFFFFF', fontSize: 38, fontWeight: '900' },
  wrongRoleTitle: { color: '#0F172A', fontSize: 22, fontWeight: '900', marginTop: 18 },
  wrongRoleText: { color: '#64748B', fontSize: 15, fontWeight: '600', marginTop: 10, textAlign: 'center', lineHeight: 22 },
});
