import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Bike, MapPin, Package, Store } from 'lucide-react-native';
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
import { AagamMark } from '../components/AagamMark';
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

const LoadingScreen = () => (
  <View style={styles.loadingContainer} accessibilityLabel="Loading Aagaam Partner Workspace">
    <StatusBar barStyle="light-content" backgroundColor="#057A55" />
    <View style={styles.loadingTopGlow} />
    <View style={styles.loadingBottomGlow} />

    <View style={styles.loadingBrand}>
      <AagamMark size={88} radius={25} style={styles.loadingLogoCard} />
      <Text style={styles.loadingBrandName}>Aagaam</Text>
      <Text style={styles.loadingBrandCaption}>PARTNERS</Text>
      <View style={styles.loadingRolePill}>
        <Bike size={15} color="#057A55" strokeWidth={2.4} />
        <Text style={styles.loadingRoleText}>RIDER & STORE</Text>
      </View>
    </View>

    <View style={styles.loadingScene}>
      <View style={styles.loadingSkylineOne} />
      <View style={styles.loadingSkylineTwo} />
      <View style={styles.loadingSkylineThree} />
      <View style={styles.loadingRoute} />

      <View style={styles.riderScene}>
        <View style={styles.locationPin}>
          <MapPin size={18} color="#FFFFFF" fill="#FFFFFF" />
        </View>
        <View style={styles.riderCard}>
          <View style={styles.deliveryBox}>
            <Package size={21} color="#FFFFFF" strokeWidth={2.3} />
          </View>
          <Bike size={66} color="#FFFFFF" strokeWidth={1.9} />
        </View>
      </View>

      <View style={styles.storeScene}>
        <View style={[styles.locationPin, styles.storePin]}>
          <Store size={18} color="#FFFFFF" strokeWidth={2.3} />
        </View>
        <View style={styles.storeCard}>
          <View style={styles.storeAwning}>
            {Array.from({ length: 6 }).map((_, index) => (
              <View key={index} style={[styles.awningStripe, index % 2 === 0 && styles.awningStripeGreen]} />
            ))}
          </View>
          <View style={styles.storeBody}>
            <Store size={54} color="#057A55" strokeWidth={1.9} />
            <View style={styles.packageStack}>
              <Package size={25} color="#C9822A" fill="#F6D394" />
              <Package size={20} color="#C9822A" fill="#F6D394" />
            </View>
          </View>
        </View>
      </View>
    </View>

    <View style={styles.loadingCopy}>
      <Text style={styles.loadingTitle}>Loading Partner Workspace</Text>
      <Text style={styles.loadingHint}>Preparing rider and store tools…</Text>
      <View style={styles.loadingDots}>
        <View style={[styles.loadingDot, styles.loadingDotActive]} />
        <View style={styles.loadingDot} />
        <View style={styles.loadingDot} />
        <View style={styles.loadingDot} />
      </View>
    </View>
  </View>
);

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
  loadingContainer: {
    flex: 1,
    backgroundColor: '#057A55',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 82,
    paddingBottom: 62,
    paddingHorizontal: 24,
    overflow: 'hidden',
  },
  loadingTopGlow: {
    position: 'absolute',
    width: 330,
    height: 330,
    borderRadius: 165,
    right: -150,
    top: -125,
    backgroundColor: '#2B9B76',
    opacity: 0.48,
  },
  loadingBottomGlow: {
    position: 'absolute',
    width: 270,
    height: 270,
    borderRadius: 135,
    left: -145,
    bottom: -135,
    backgroundColor: '#2B9B76',
    opacity: 0.44,
  },
  loadingBrand: {
    alignItems: 'center',
    zIndex: 2,
  },
  loadingLogoCard: {
    backgroundColor: '#061B36',
    shadowColor: '#003C2A',
    shadowOffset: { width: 0, height: 9 },
    shadowOpacity: 0.24,
    shadowRadius: 18,
    elevation: 8,
  },
  loadingBrandName: {
    color: '#FFFFFF',
    fontSize: 39,
    lineHeight: 44,
    fontWeight: '900',
    letterSpacing: -1.5,
    marginTop: 16,
  },
  loadingBrandCaption: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '900',
    letterSpacing: 2.5,
  },
  loadingRolePill: {
    minHeight: 35,
    borderRadius: 18,
    backgroundColor: '#E3FFF4',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 11,
  },
  loadingRoleText: {
    color: '#057A55',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  loadingScene: {
    width: '100%',
    maxWidth: 390,
    height: 270,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 5,
    position: 'relative',
  },
  loadingSkylineOne: {
    position: 'absolute',
    left: 7,
    bottom: 35,
    width: 46,
    height: 90,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  loadingSkylineTwo: {
    position: 'absolute',
    left: 86,
    bottom: 35,
    width: 66,
    height: 128,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  loadingSkylineThree: {
    position: 'absolute',
    right: 56,
    bottom: 35,
    width: 54,
    height: 112,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  loadingRoute: {
    position: 'absolute',
    left: 96,
    right: 93,
    top: 82,
    borderTopWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.62)',
    transform: [{ rotate: '-8deg' }],
  },
  riderScene: {
    width: '47%',
    height: 225,
    justifyContent: 'flex-end',
    alignItems: 'center',
    position: 'relative',
  },
  storeScene: {
    width: '50%',
    height: 235,
    justifyContent: 'flex-end',
    alignItems: 'center',
    position: 'relative',
  },
  locationPin: {
    position: 'absolute',
    top: 20,
    left: 12,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#18A77C',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.82)',
    shadowColor: '#003C2A',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.18,
    shadowRadius: 9,
    elevation: 4,
  },
  storePin: {
    left: undefined,
    right: 12,
    top: 1,
  },
  riderCard: {
    width: '100%',
    minHeight: 105,
    borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  deliveryBox: {
    position: 'absolute',
    left: 15,
    top: 14,
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#0C6C4C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeCard: {
    width: '100%',
    minHeight: 165,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    shadowColor: '#003C2A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 6,
  },
  storeAwning: {
    height: 35,
    flexDirection: 'row',
  },
  awningStripe: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  awningStripeGreen: {
    backgroundColor: '#2B9B76',
  },
  storeBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F6FFFB',
  },
  packageStack: {
    position: 'absolute',
    right: 8,
    bottom: 7,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  loadingCopy: {
    alignItems: 'center',
    zIndex: 2,
  },
  loadingTitle: {
    color: '#FFFFFF',
    fontSize: 23,
    lineHeight: 29,
    fontWeight: '900',
    textAlign: 'center',
  },
  loadingHint: {
    color: '#D7F4E8',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 7,
    fontWeight: '600',
  },
  loadingDots: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 22,
  },
  loadingDot: {
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: '#BFECDD',
  },
  loadingDotActive: {
    backgroundColor: '#0AB17E',
  },
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
