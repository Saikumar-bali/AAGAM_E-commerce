import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '@aagam/mobile-shared';
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

const Stack = createNativeStackNavigator();
export const partnerNavigationRef = createNavigationContainerRef<any>();
const roleSet = (user: any) => new Set<string>([user?.role, ...(Array.isArray(user?.roles) ? user.roles : [])].filter(Boolean));
const LoadingScreen = () => <View style={styles.loadingContainer}><AagamBrand caption="Partner operations" inverse /><ActivityIndicator size="small" color="#14B8A6" /><Text style={styles.loadingTitle}>Preparing partner workspace</Text></View>;
const BlockedScreen = () => <View style={styles.blockedContainer}><View style={styles.blockedCard}><AagamBrand caption="Partner operations" /><Text style={styles.blockedTitle}>Partner access required</Text><Text style={styles.blockedMessage}>This account can still shop in Aagam Customer. Complete or resume a Rider/Store application to unlock Partner operations.</Text></View></View>;

const RootNavigator = () => {
  const { user, isLoading, initialize } = useAuthStore();
  const { response: applicationResponse, isHydrated: onboardingHydrated, restore: restoreOnboarding } = usePartnerOnboardingStore();
  useEffect(() => { void Promise.all([initialize(), restoreOnboarding()]); }, [initialize, restoreOnboarding]);
  if (isLoading || !onboardingHydrated) return <LoadingScreen />;
  const applicantInitialRoute = resolveApplicantInitialRoute(applicationResponse);
  const roles = roleSet(user);
  const operationalRole = roles.has('ADMIN') ? 'ADMIN' : roles.has('RIDER') ? 'RIDER' : roles.has('STORE_OWNER') ? 'STORE_OWNER' : null;
  return <NavigationContainer ref={partnerNavigationRef}><Stack.Navigator key={user ? `user-${user.id}-${operationalRole || 'blocked'}` : 'applicant'} initialRouteName={user ? undefined : applicantInitialRoute} screenOptions={{ headerShown: false }}>{user ? operationalRole ? <>{operationalRole === 'RIDER' ? <Stack.Screen name="RiderTabs" component={RiderNavigator} /> : null}{operationalRole === 'STORE_OWNER' ? <Stack.Screen name="StoreTabs" component={StoreNavigator} /> : null}{operationalRole === 'ADMIN' ? <Stack.Screen name="AdminHome" options={{ headerShown: false }}>{(props: any) => <HomeScreen {...props} role="Admin Panel" />}</Stack.Screen> : null}{operationalRole === 'RIDER' || operationalRole === 'STORE_OWNER' ? <Stack.Screen name="Notifications" component={PartnerNotificationsScreen} /> : null}</> : <Stack.Screen name="Blocked" component={BlockedScreen} /> : <><Stack.Screen name="PartnerWelcome" component={PartnerWelcomeScreen} /><Stack.Screen name="Login" component={LoginScreen} /><Stack.Screen name="ApplicationStart" component={PartnerApplicationStartScreen} /><Stack.Screen name="VerifyApplication" component={PartnerVerificationScreen} /><Stack.Screen name="RiderApplication" component={RiderApplicationScreen} /><Stack.Screen name="StoreApplication" component={StoreApplicationScreen} /><Stack.Screen name="ApplicationDocuments" component={PartnerDocumentsScreen} /><Stack.Screen name="ApplicationStatus" component={PartnerApplicationStatusScreen} /><Stack.Screen name="ActivatePartner" component={PartnerActivationScreen} /><Stack.Screen name="ResumeApplication" component={PartnerResumeScreen} /></>}</Stack.Navigator></NavigationContainer>;
};

const styles = StyleSheet.create({ loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#101827', paddingHorizontal: 28, gap: 18 }, loadingTitle: { color: '#FFFFFF', fontSize: 21, fontWeight: '900' }, blockedContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC', padding: 24 }, blockedCard: { backgroundColor: '#FFFFFF', borderRadius: 28, padding: 40, alignItems: 'center', elevation: 5, maxWidth: 340, width: '100%' }, blockedTitle: { fontSize: 22, fontWeight: '700', color: '#0F172A', marginTop: 26, marginBottom: 8 }, blockedMessage: { fontSize: 15, color: '#64748B', textAlign: 'center', lineHeight: 22 } });
export default RootNavigator;
