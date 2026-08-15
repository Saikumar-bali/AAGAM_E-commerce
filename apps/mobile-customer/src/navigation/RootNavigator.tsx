import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { useAuthStore } from '@aagam/mobile-shared';
import { LoginScreen } from '../screens/LoginScreen';
import { SignUpScreen } from '../screens/SignUpScreen';
import { ResetPasswordScreen } from '../screens/ResetPasswordScreen';
import { CustomerNavigator } from './CustomerNavigator';
import { AagamBrand } from '../components/AagamBrand';
import { navigationRef } from './navigationRef';

const Stack = createNativeStackNavigator();

export const RootNavigator = () => {
  const user = useAuthStore((state) => state.user);
  const initialize = useAuthStore((state) => state.initialize);
  const [isInitializing, setIsInitializing] = useState(true);
  useEffect(() => { let mounted = true; void initialize().finally(() => { if (mounted) setIsInitializing(false); }); return () => { mounted = false; }; }, [initialize]);
  if (isInitializing) return <View style={styles.loadingPage}><AagamBrand /><ActivityIndicator size="small" color="#0F766E" /><Text style={styles.loadingTitle}>Preparing your shop</Text><Text style={styles.loadingSub}>Setting up your grocery experience</Text></View>;
  const roles = new Set<string>([(user as any)?.role, ...(Array.isArray((user as any)?.roles) ? (user as any).roles : [])].filter(Boolean));
  const canShop = roles.has('CUSTOMER');
  return <NavigationContainer ref={navigationRef}><Stack.Navigator screenOptions={{ headerShown: false }}>{user ? canShop ? <Stack.Screen name="CustomerRoot" component={CustomerNavigator} /> : <Stack.Screen name="WrongRole">{() => <View style={styles.wrongRolePage}><AagamBrand /><Text style={styles.wrongRoleTitle}>Customer access unavailable</Text><Text style={styles.wrongRoleText}>Ask Aagaam support to add Customer access to this account.</Text></View>}</Stack.Screen> : <><Stack.Screen name="Login" component={LoginScreen} /><Stack.Screen name="SignUp" component={SignUpScreen} /><Stack.Screen name="ResetPassword" component={ResetPasswordScreen} /></>}</Stack.Navigator></NavigationContainer>;
};

const styles = StyleSheet.create({
  loadingPage: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC', paddingHorizontal: 28, gap: 15 },
  loadingTitle: { color: '#0F172A', fontSize: 21, fontWeight: '900', marginTop: 5 }, loadingSub: { color: '#64748B', fontSize: 13, fontWeight: '600', marginTop: -7 },
  wrongRolePage: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC', paddingHorizontal: 32 }, wrongRoleTitle: { color: '#0F172A', fontSize: 22, fontWeight: '900', marginTop: 26 }, wrongRoleText: { color: '#64748B', fontSize: 15, fontWeight: '600', marginTop: 10, textAlign: 'center', lineHeight: 22 },
});
