import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Bike, ChevronRight, LogIn, Search, Store } from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { resolveApplicantInitialRoute } from '../navigation/applicantRoute';
import { usePartnerOnboardingStore } from '../onboarding/usePartnerOnboardingStore';
import { OnboardingShell, palette, StatusPill } from '../components/PartnerOnboardingUI';

export function PartnerWelcomeScreen({ navigation }: any) {
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

  const continueTitle =
    continueRoute === 'VerifyApplication'
      ? 'Verify contact details'
      : continueRoute === 'RiderApplication' || continueRoute === 'StoreApplication'
        ? 'Continue application'
        : continueRoute === 'ApplicationDocuments'
          ? 'Complete document checklist'
          : 'View application status';

  return (
    <OnboardingShell
      title="Partner with Aagaam"
      subtitle="Choose how you want to work with us. We’ll guide you through a short, secure application."
    >
      {applicationId && response ? (
        <TouchableOpacity style={styles.continueCard} onPress={continueExisting} activeOpacity={0.84}>
          <View style={{ flex: 1 }}>
            <StatusPill status={response.application.status} />
            <Text style={styles.continueTitle}>{continueTitle}</Text>
            <Text style={styles.reference}>{response.application.applicationNumber}</Text>
          </View>
          <ChevronRight size={22} color={palette.ink} />
        </TouchableOpacity>
      ) : applicationId ? (
        <TouchableOpacity style={styles.continueCard} onPress={() => navigation.navigate('ResumeApplication')} activeOpacity={0.84}>
          <View style={{ flex: 1 }}>
            <Text style={styles.continueTitle}>Recover saved application</Text>
            <Text style={styles.reference}>Verify your contact and continue from the latest saved step.</Text>
          </View>
          <ChevronRight size={22} color={palette.ink} />
        </TouchableOpacity>
      ) : null}

      <Text style={styles.eyebrow}>I want to join as</Text>
      <View style={styles.cards}>
        <TouchableOpacity style={[styles.roleCard, styles.riderCard]} onPress={() => startApplication('RIDER')} activeOpacity={0.84}>
          <View style={[styles.icon, styles.riderIcon]}><Bike size={28} color="#0F766E" /></View>
          <View style={styles.roleCopy}><Text style={styles.roleTitle}>Delivery partner</Text><Text style={styles.roleText}>Deliver orders on your schedule and track earnings.</Text></View>
          <ChevronRight size={20} color="#0F766E" />
        </TouchableOpacity>

        <TouchableOpacity style={[styles.roleCard, styles.storeCard]} onPress={() => startApplication('STORE')} activeOpacity={0.84}>
          <View style={[styles.icon, styles.storeIcon]}><Store size={28} color="#B45309" /></View>
          <View style={styles.roleCopy}><Text style={styles.roleTitle}>Store partner</Text><Text style={styles.roleText}>Sell products and manage incoming Aagaam orders.</Text></View>
          <ChevronRight size={20} color="#B45309" />
        </TouchableOpacity>
      </View>

      <View style={styles.secondaryPanel}>
        <TouchableOpacity style={styles.action} onPress={() => navigation.navigate('ResumeApplication')}>
          <View style={styles.actionIcon}><Search size={19} color={palette.indigo} /></View>
          <View style={{ flex: 1 }}><Text style={styles.actionText}>Resume application</Text><Text style={styles.actionHint}>Continue using your verified phone or email.</Text></View>
          <ChevronRight size={19} color="#94A3B8" />
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity style={styles.action} onPress={() => navigation.navigate('Login')}>
          <View style={styles.actionIcon}><LogIn size={19} color={palette.teal} /></View>
          <View style={{ flex: 1 }}><Text style={styles.actionText}>Partner sign in</Text><Text style={styles.actionHint}>For approved Rider and Store accounts.</Text></View>
          <ChevronRight size={19} color="#94A3B8" />
        </TouchableOpacity>
      </View>

      <Text style={styles.securityNote}>Partner access activates only after verification and admin approval.</Text>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  continueCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#FFFFFF', borderRadius: 24, padding: 18, borderWidth: 1.5, borderColor: '#99F6E4', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.07, shadowRadius: 16, elevation: 2 },
  continueTitle: { color: palette.ink, fontSize: 17, fontWeight: '900', marginTop: 12 },
  reference: { color: palette.muted, fontSize: 12, fontWeight: '700', marginTop: 3 },
  eyebrow: { color: '#475569', fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.1, marginTop: 4 },
  cards: { gap: 13 },
  roleCard: { minHeight: 116, flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 25, padding: 17, borderWidth: 1.5, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.07, shadowRadius: 17, elevation: 3 },
  riderCard: { backgroundColor: '#F0FDFA', borderColor: '#99F6E4' },
  storeCard: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  icon: { width: 58, height: 58, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  riderIcon: { backgroundColor: '#CCFBF1' },
  storeIcon: { backgroundColor: '#FEF3C7' },
  roleCopy: { flex: 1 },
  roleTitle: { color: palette.ink, fontSize: 18, fontWeight: '900' },
  roleText: { color: palette.muted, fontSize: 12, lineHeight: 18, marginTop: 5, fontWeight: '600' },
  secondaryPanel: { backgroundColor: '#FFFFFF', borderRadius: 24, borderWidth: 1, borderColor: '#E8EEF4', overflow: 'hidden' },
  action: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  actionIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' },
  actionText: { color: palette.ink, fontSize: 14, fontWeight: '900' },
  actionHint: { color: palette.muted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  divider: { height: 1, backgroundColor: '#E2E8F0', marginHorizontal: 16 },
  securityNote: { color: '#64748B', fontSize: 11, lineHeight: 17, textAlign: 'center', paddingHorizontal: 12, marginTop: 4, fontWeight: '700' },
});
