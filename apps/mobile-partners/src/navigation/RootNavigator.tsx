import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { resolvePartnerOperationalRole, useAuthStore } from '@aagam/mobile-shared';
import { LoginScreen } from '../screens/LoginScreen';
import { RiderNavigator } from './RiderNavigator';
import { StoreNavigator } from './StoreNavigator';
import { HomeScreen } from '../screens/HomeScreen';
import { PartnerWelcomeScreen } from '../screens/PartnerWelcomeScreen';
import { PartnerApplicationStartScreen } from '../screens/PartnerApplicationStartScreen';
import { PartnerVerificationScreen } from '../screens/PartnerVerificationScreen';
import { RiderApplicationScreen } from '../screens/RiderApplicationScreen';
import { StoreApplicationScreen } from '../screens/StoreApplicationScreen';
import { PartnerDocumentsScreen } from '../screens/PartnerDocumentsScreen';
import { PartnerApplicationStatusScreen } from '../screens/PartnerApplicationStatusScreen';
import { PartnerActivationScreen } from '../screens/PartnerActivationScreen';
import { PartnerResumeScreen } from '../screens/PartnerResumeScreen';
import { PartnerNotificationsScreen } from '../screens/PartnerNotificationsScreen';
import { AagamBrand } from '../components/AagamBrand';
import { usePartnerOnboardingStore } from '../onboarding/usePartnerOnboardingStore';
import { resolveApplicantInitialRoute } from './applicantRoute';
import type { RootStackParamList } from './partnerNavigationTypes';
import { partnerNavigationRef } from './partnerNavigationRef';

const Stack = createNativeStackNavigator<RootStackParamList>();
export { partnerNavigationRef } from './partnerNavigationRef';
const partnerTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, primary: '#14B8A6', background: '#F4F7FB', card: '#FFFFFF', text: '#111827', border: '#E2E8F0', notification: '#F97316' },
};
const LoadingScreen = () => <View style={styles.loadingContainer}><View style={styles.loadingGlow} /><AagamBrand caption="Partner operations" inverse /><ActivityIndicator size="small" color="#5EEAD4" /><Text style={styles.loadingTitle}>Preparing your workspace</Text><Text style={styles.loadingHint}>Securely loading orders, availability and settlements.</Text></View>;

const BlockedScreen = ({ onLogout, onRefresh, busy }: { onLogout: () => void; onRefresh: () => void; busy: boolean }) => (
  <View style={styles.blockedContainer}>
    <View style={styles.blockedCard}>
      <AagamBrand caption="Partner operations" />
      <Text style={styles.blockedTitle}>Partner access is not active</Text>
      <Text style={styles.blockedMessage}>Complete or resume a Rider or Store application. Operational access appears after approval.</Text>
      <Pressable style={[styles.primaryButton, busy && styles.disabledButton]} disabled={busy} onPress={onRefresh}>
        {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Refresh access</Text>}
      </Pressable>
      <Pressable style={[styles.secondaryButton, busy && styles.disabledButton]} disabled={busy} onPress={onLogout}>
        <Text style={styles.secondaryButtonText}>Log out</Text>
      </Pressable>
    </View>
  </View>
);

const RootNavigator = () => {
  const { user, isLoading, initialize, logout } = useAuthStore();
  const { response: applicationResponse, isHydrated: onboardingHydrated, restore: restoreOnboarding } = usePartnerOnboardingStore();
  const [bootSettled, setBootSettled] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let mounted = true;
    void Promise.allSettled([initialize(), restoreOnboarding()]).then((results) => {
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.warn(index === 0 ? 'Authentication initialization failed' : 'Onboarding restoration failed', result.reason);
        }
      });
      if (mounted) setBootSettled(true);
    });
    return () => { mounted = false; };
  }, [initialize, restoreOnboarding]);

  const refreshAccess = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.allSettled([initialize(), restoreOnboarding()]);
    } finally {
      setRefreshing(false);
    }
  };

  if ((isLoading || !onboardingHydrated) && !bootSettled) return <LoadingScreen />;
  const applicantInitialRoute = resolveApplicantInitialRoute(applicationResponse) as keyof RootStackParamList;
  const operationalRole = resolvePartnerOperationalRole(user as any);
  return <NavigationContainer ref={partnerNavigationRef} theme={partnerTheme}><Stack.Navigator key={user ? `user-${user.id}-${operationalRole || 'blocked'}` : 'applicant'} initialRouteName={user ? undefined : applicantInitialRoute} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F4F7FB' }, animation: 'fade_from_bottom' }}>{user ? operationalRole ? <>{operationalRole === 'RIDER' ? <Stack.Screen name="RiderTabs" component={RiderNavigator} /> : null}{operationalRole === 'STORE_OWNER' ? <Stack.Screen name="StoreTabs" component={StoreNavigator as any} /> : null}{operationalRole === 'ADMIN' ? <Stack.Screen name="AdminHome" options={{ headerShown: false }}>{(props: any) => <HomeScreen {...props} role="Admin Panel" />}</Stack.Screen> : null}{operationalRole === 'RIDER' || operationalRole === 'STORE_OWNER' ? <Stack.Screen name="Notifications" component={PartnerNotificationsScreen} /> : null}</> : <Stack.Screen name="Blocked">{() => <BlockedScreen busy={refreshing || isLoading} onRefresh={() => { void refreshAccess(); }} onLogout={() => { void logout(); }} />}</Stack.Screen> : <><Stack.Screen name="PartnerWelcome" component={PartnerWelcomeScreen} /><Stack.Screen name="Login" component={LoginScreen} /><Stack.Screen name="ApplicationStart" component={PartnerApplicationStartScreen} /><Stack.Screen name="VerifyApplication" component={PartnerVerificationScreen} /><Stack.Screen name="RiderApplication" component={RiderApplicationScreen} /><Stack.Screen name="StoreApplication" component={StoreApplicationScreen} /><Stack.Screen name="ApplicationDocuments" component={PartnerDocumentsScreen} /><Stack.Screen name="ApplicationStatus" component={PartnerApplicationStatusScreen} /><Stack.Screen name="ActivatePartner" component={PartnerActivationScreen} /><Stack.Screen name="ResumeApplication" component={PartnerResumeScreen} /></>}</Stack.Navigator></NavigationContainer>;
};

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0F172A', paddingHorizontal: 28, gap: 17, overflow: 'hidden' },
  loadingGlow: { position: 'absolute', width: 330, height: 330, borderRadius: 999, backgroundColor: '#0F766E', top: -170, right: -140, opacity: 0.55 },
  loadingTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', marginTop: 3 },
  loadingHint: { color: '#CBD5E1', fontSize: 12, lineHeight: 18, textAlign: 'center', maxWidth: 280 },
  blockedContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F4F7FB', padding: 24 },
  blockedCard: { backgroundColor: '#FFFFFF', borderRadius: 30, padding: 32, alignItems: 'center', elevation: 6, maxWidth: 350, width: '100%', borderWidth: 1, borderColor: '#E8EEF4' },
  blockedTitle: { fontSize: 22, fontWeight: '900', color: '#0F172A', marginTop: 26, marginBottom: 8, textAlign: 'center' },
  blockedMessage: { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 22, fontWeight: '600' },
  primaryButton: { marginTop: 24, width: '100%', minHeight: 50, borderRadius: 16, backgroundColor: '#0F766E', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  secondaryButton: { marginTop: 10, width: '100%', minHeight: 48, borderRadius: 16, borderWidth: 1, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  secondaryButtonText: { color: '#334155', fontSize: 15, fontWeight: '800' },
  disabledButton: { opacity: 0.55 },
});
export default RootNavigator;
