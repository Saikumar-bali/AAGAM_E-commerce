import React from 'react';
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Bike, ChevronRight, FileText, LockKeyhole, Store } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { AagamMark } from '../components/AagamMark';
import { resolveApplicantInitialRoute } from '../navigation/applicantRoute';
import { usePartnerOnboardingStore } from '../onboarding/usePartnerOnboardingStore';

const BRAND_GREEN = '#057A55';
const ACTION_GREEN = '#078B4D';

export function PartnerWelcomeScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { applicationId, response } = usePartnerOnboardingStore();
  const continueRoute = resolveApplicantInitialRoute(response);

  const continueExisting = () => navigation.navigate(continueRoute);

  const startApplication = (requestedType: 'RIDER' | 'STORE') => {
    if (!applicationId) {
      navigation.navigate('ApplicationStart', { type: requestedType });
      return;
    }

    Toast.show({
      type: 'info',
      text1: 'Application already in progress',
      text2: 'Continue the saved application before starting another one.',
      onPress: continueExisting,
    });
  };

  const resumeApplication = () => {
    if (applicationId) {
      continueExisting();
      return;
    }
    navigation.navigate('ResumeApplication');
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F9FC" />
      <View style={styles.topGlow} />
      <View style={styles.bottomGlow} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, 18) + 18,
            paddingBottom: Math.max(insets.bottom, 12) + 30,
          },
        ]}
      >
        <View style={styles.brandBlock}>
          <AagamMark size={86} radius={25} style={styles.logoCard} />
          <Text style={styles.brandName}>Aagaam</Text>
          <Text style={styles.brandCaption}>PARTNERS</Text>
        </View>

        <View style={styles.headingBlock}>
          <Text style={styles.kicker}>Grow with Aagaam</Text>
          <Text style={styles.title}>Partner applications</Text>
          <Text style={styles.subtitle}>
            Sign in to your workspace or choose how you want to partner with Aagaam.
          </Text>
        </View>

        <TouchableOpacity
          testID="partner_direct_sign_in"
          accessibilityRole="button"
          style={styles.signInButton}
          activeOpacity={0.86}
          onPress={() => navigation.navigate('Login')}
        >
          <View style={styles.signInIcon}>
            <LockKeyhole size={24} color="#FFFFFF" strokeWidth={2.3} />
          </View>
          <Text style={styles.signInText}>Direct sign in</Text>
          <ChevronRight size={24} color="#FFFFFF" strokeWidth={2.5} />
        </TouchableOpacity>

        <View style={styles.roleRow}>
          <TouchableOpacity
            testID="partner_apply_delivery"
            accessibilityRole="button"
            style={styles.roleCard}
            activeOpacity={0.84}
            onPress={() => startApplication('RIDER')}
          >
            <View style={[styles.roleIcon, styles.riderIcon]}>
              <Bike size={34} color="#078B61" strokeWidth={2.3} />
            </View>
            <Text style={styles.roleTitle}>Delivery Partner</Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="partner_apply_store"
            accessibilityRole="button"
            style={styles.roleCard}
            activeOpacity={0.84}
            onPress={() => startApplication('STORE')}
          >
            <View style={[styles.roleIcon, styles.storeIcon]}>
              <Store size={34} color="#C56A06" strokeWidth={2.3} />
            </View>
            <Text style={styles.roleTitle}>Store Partner</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          testID="partner_resume_application"
          accessibilityRole="button"
          style={styles.resumeRow}
          activeOpacity={0.82}
          onPress={resumeApplication}
        >
          <View style={styles.resumeIcon}>
            <FileText size={22} color={ACTION_GREEN} strokeWidth={2.3} />
          </View>
          <Text style={styles.resumeText}>Resume application</Text>
          <ChevronRight size={22} color="#7A8798" strokeWidth={2.3} />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F7F9FC',
    overflow: 'hidden',
  },
  topGlow: {
    position: 'absolute',
    width: 310,
    height: 310,
    borderRadius: 155,
    right: -135,
    top: -125,
    backgroundColor: '#D8FAF2',
    opacity: 0.9,
  },
  bottomGlow: {
    position: 'absolute',
    width: 250,
    height: 250,
    borderRadius: 125,
    left: -120,
    bottom: -135,
    backgroundColor: '#FFF1C9',
    opacity: 0.8,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 22,
  },
  brandBlock: {
    alignItems: 'center',
  },
  logoCard: {
    backgroundColor: '#061B36',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 9 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 7,
  },
  brandName: {
    color: '#0F172A',
    fontSize: 35,
    lineHeight: 40,
    fontWeight: '900',
    letterSpacing: -1.4,
    marginTop: 14,
  },
  brandCaption: {
    color: BRAND_GREEN,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
    letterSpacing: 2.2,
    marginTop: 1,
  },
  headingBlock: {
    alignItems: 'center',
    marginTop: 37,
    marginBottom: 25,
  },
  kicker: {
    color: BRAND_GREEN,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 7,
  },
  title: {
    color: '#0F172A',
    fontSize: 31,
    lineHeight: 37,
    fontWeight: '900',
    letterSpacing: -1,
    textAlign: 'center',
  },
  subtitle: {
    color: '#6A7789',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 330,
    marginTop: 9,
    fontWeight: '600',
  },
  signInButton: {
    minHeight: 68,
    borderRadius: 21,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND_GREEN,
    shadowColor: BRAND_GREEN,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.24,
    shadowRadius: 18,
    elevation: 6,
  },
  signInIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  signInText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '900',
    textAlign: 'center',
    marginLeft: -8,
  },
  roleRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  roleCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 152,
    borderRadius: 23,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E3E8EE',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 17,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
  },
  roleIcon: {
    width: 73,
    height: 73,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  riderIcon: {
    backgroundColor: '#E5FAF3',
  },
  storeIcon: {
    backgroundColor: '#FFF3D6',
  },
  roleTitle: {
    color: '#0F172A',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 14,
  },
  resumeRow: {
    minHeight: 67,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E3E8EE',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 17,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  resumeIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2FBF7',
  },
  resumeText: {
    flex: 1,
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '900',
    marginLeft: 12,
  },
});
