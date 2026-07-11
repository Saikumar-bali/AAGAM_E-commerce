import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '@aagam/mobile-shared';
import { LoginScreen } from '../screens/LoginScreen';
import { SignUpScreen } from '../screens/SignUpScreen';
import { RiderNavigator } from './RiderNavigator';
import { StoreNavigator } from './StoreNavigator';
import { HomeScreen } from '../screens/HomeScreen';

const Stack = createNativeStackNavigator();

const BLOCKED_ROLES = ['CUSTOMER'];
const ALLOWED_PARTNER_ROLES = ['RIDER', 'STORE_OWNER', 'ADMIN'];

const BlockedScreen = () => (
  <View style={styles.blockedContainer}>
    <View style={styles.blockedCard}>
      <View style={styles.logoMark}>
        <Text style={styles.logoText}>A</Text>
      </View>
      <Text style={styles.blockedTitle}>Partners Only</Text>
      <Text style={styles.blockedMessage}>
        This app is for partners only. Use AAGAM for customer access.
      </Text>
    </View>
  </View>
);

const LoadingScreen = () => (
  <View style={styles.loadingContainer}>
    <View style={styles.loadingMark}>
      <Text style={styles.loadingLogo}>A</Text>
    </View>
    <ActivityIndicator size="small" color="#14B8A6" />
    <Text style={styles.loadingTitle}>Preparing AAGAM Partners</Text>
  </View>
);

const RootNavigator = () => {
  const { user, isLoading, initialize } = useAuthStore();

  useEffect(() => {
    void initialize();
  }, [initialize]);

  if (isLoading) return <LoadingScreen />;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          BLOCKED_ROLES.includes(user.role) || !ALLOWED_PARTNER_ROLES.includes(user.role) ? (
            <Stack.Screen name="Blocked" component={BlockedScreen} />
          ) : (
            <>
              {user.role === 'RIDER' && (
                <Stack.Screen name="RiderTabs" component={RiderNavigator} />
              )}
              {user.role === 'STORE_OWNER' && (
                <Stack.Screen name="StoreTabs" component={StoreNavigator} />
              )}
              {user.role === 'ADMIN' && (
                <Stack.Screen name="AdminHome" options={{ headerShown: false }}>
                  {(props: any) => <HomeScreen {...props} role="Admin Panel" />}
                </Stack.Screen>
              )}
            </>
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
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#101827', paddingHorizontal: 28 },
  loadingMark: { width: 82, height: 82, borderRadius: 28, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', marginBottom: 22 },
  loadingLogo: { color: '#101827', fontSize: 38, fontWeight: '900' },
  loadingTitle: { color: '#FFFFFF', fontSize: 21, fontWeight: '900', marginTop: 18 },
  blockedContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC', padding: 24 },
  blockedCard: { backgroundColor: '#FFFFFF', borderRadius: 28, padding: 40, alignItems: 'center', elevation: 5, maxWidth: 340, width: '100%' },
  logoMark: { width: 72, height: 72, borderRadius: 20, backgroundColor: '#0F766E', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  logoText: { color: '#FFFFFF', fontSize: 32, fontWeight: '800' },
  blockedTitle: { fontSize: 22, fontWeight: '700', color: '#0F172A', marginBottom: 8 },
  blockedMessage: { fontSize: 15, color: '#64748B', textAlign: 'center', lineHeight: 22 },
});

export default RootNavigator;
