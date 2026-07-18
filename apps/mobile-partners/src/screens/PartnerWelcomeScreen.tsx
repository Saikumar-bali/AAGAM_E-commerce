import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Bike, ChevronRight, LogIn, Search, Store } from 'lucide-react-native';
import { usePartnerOnboardingStore } from '../onboarding/usePartnerOnboardingStore';
import { OnboardingShell, palette, StatusPill } from '../components/PartnerOnboardingUI';

export function PartnerWelcomeScreen({ navigation }: any) {
  const { applicationId, response } = usePartnerOnboardingStore();

  return (
    <OnboardingShell
      title="Join AAGAM professionally"
      subtitle="Apply as a verified delivery partner or bring your store onto the AAGAM fulfilment network. Your operational account is created only after document review and approval."
    >
      {applicationId && response ? (
        <TouchableOpacity
          style={styles.continueCard}
          onPress={() => navigation.navigate('ApplicationStatus')}
        >
          <View style={{ flex: 1 }}>
            <StatusPill status={response.application.status} />
            <Text style={styles.continueTitle}>Continue your application</Text>
            <Text style={styles.reference}>{response.application.applicationNumber}</Text>
          </View>
          <ChevronRight size={22} color={palette.ink} />
        </TouchableOpacity>
      ) : null}

      <Text style={styles.eyebrow}>Choose an application</Text>
      <View style={styles.cards}>
        <TouchableOpacity
          style={styles.roleCard}
          onPress={() => navigation.navigate('ApplicationStart', { type: 'RIDER' })}
        >
          <View style={[styles.icon, { backgroundColor: '#CCFBF1' }]}>
            <Bike size={27} color="#0F766E" />
          </View>
          <View style={styles.roleCopy}>
            <Text style={styles.roleTitle}>Apply as Rider</Text>
            <Text style={styles.roleText}>
              Submit identity, vehicle, availability, emergency contact, and payout details.
            </Text>
          </View>
          <ChevronRight size={20} color="#94A3B8" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.roleCard}
          onPress={() => navigation.navigate('ApplicationStart', { type: 'STORE' })}
        >
          <View style={[styles.icon, { backgroundColor: '#FEF3C7' }]}>
            <Store size={27} color="#B45309" />
          </View>
          <View style={styles.roleCopy}>
            <Text style={styles.roleTitle}>Register a Store</Text>
            <Text style={styles.roleText}>
              Submit owner, business, location, operating capacity, and settlement details.
            </Text>
          </View>
          <ChevronRight size={20} color="#94A3B8" />
        </TouchableOpacity>
      </View>

      <View style={styles.divider} />

      <TouchableOpacity
        style={styles.action}
        onPress={() => navigation.navigate('ResumeApplication')}
      >
        <Search size={19} color={palette.ink} />
        <Text style={styles.actionText}>Resume with application access</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.action}
        onPress={() => navigation.navigate('Login')}
      >
        <LogIn size={19} color={palette.ink} />
        <Text style={styles.actionText}>Already approved? Sign in</Text>
      </TouchableOpacity>

      <Text style={styles.securityNote}>
        Selecting an application never grants Rider or Store access. Admin approval and one-time account activation are mandatory.
      </Text>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  continueCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#FFFFFF', borderRadius: 24, padding: 18, borderWidth: 1.5, borderColor: '#99F6E4' },
  continueTitle: { color: palette.ink, fontSize: 17, fontWeight: '900', marginTop: 12 },
  reference: { color: palette.muted, fontSize: 12, fontWeight: '700', marginTop: 3 },
  eyebrow: { color: '#475569', fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  cards: { gap: 13 },
  roleCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#FFFFFF', borderRadius: 24, padding: 17, borderWidth: 1, borderColor: '#E8EEF4' },
  icon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  roleCopy: { flex: 1 },
  roleTitle: { color: palette.ink, fontSize: 17, fontWeight: '900' },
  roleText: { color: palette.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  divider: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 2 },
  action: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 17, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', paddingHorizontal: 16 },
  actionText: { color: palette.ink, fontSize: 14, fontWeight: '800' },
  securityNote: { color: '#64748B', fontSize: 11, lineHeight: 17, textAlign: 'center', paddingHorizontal: 8, marginTop: 6 },
});
