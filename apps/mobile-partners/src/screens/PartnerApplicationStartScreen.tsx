import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { apiClient } from '@aagam/mobile-shared';
import { Mail, Phone } from 'lucide-react-native';
import {
  FormField,
  OnboardingShell,
  palette,
  PrimaryButton,
  Section,
} from '../components/PartnerOnboardingUI';
import {
  PartnerApplicationStartInput,
  startProtectedApplicationAndContinue,
} from '../onboarding/partnerApplicationStartFlow';
import { usePartnerOnboardingStore } from '../onboarding/usePartnerOnboardingStore';
import { PartnerApplicationType } from '../onboarding/types';

export function PartnerApplicationStartScreen({ navigation, route }: any) {
  const type = route.params?.type as PartnerApplicationType;
  const start = usePartnerOnboardingStore((state) => state.start);
  const requestVerification = usePartnerOnboardingStore((state) => state.requestVerification);
  const loading = usePartnerOnboardingStore((state) => state.isLoading);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [channel, setChannel] = useState<'EMAIL' | 'PHONE'>('EMAIL');
  const [phoneAvailable, setPhoneAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    apiClient
      .get('/partner-onboarding/verification-capabilities')
      .then(({ data }) => {
        if (!active) return;
        const enabled = data?.mode !== 'EMAIL_ONLY' && data?.phone?.available !== false;
        setPhoneAvailable(enabled);
        if (!enabled) setChannel('EMAIL');
      })
      .catch(() => {
        if (!active) return;
        setPhoneAvailable(false);
        setChannel('EMAIL');
      });
    return () => {
      active = false;
    };
  }, []);

  const submit = async () => {
    if (!name.trim()) {
      Alert.alert('Full name required', 'Enter the legal name that matches your documents.');
      return;
    }
    if (channel === 'EMAIL' && !email.trim()) {
      Alert.alert('Email required', 'Enter the email address you can verify.');
      return;
    }
    if (channel === 'PHONE' && (!phoneAvailable || !phone.trim())) {
      Alert.alert(
        'Phone verification unavailable',
        'Use email verification while phone verification is unavailable for this deployment.',
      );
      return;
    }

    const application: PartnerApplicationStartInput = {
      type,
      applicantName: name.trim(),
      email: email.trim() || undefined,
      phoneE164: phone.trim() || undefined,
      verificationChannel: channel,
    };

    try {
      await startProtectedApplicationAndContinue({
        start,
        requestVerification,
        application,
        navigation,
        getSession: () => {
          const state = usePartnerOnboardingStore.getState();
          return {
            applicationId: state.applicationId,
            accessToken: state.accessToken,
          };
        },
      });
    } catch (error: any) {
      Alert.alert('Application could not be started', error.message);
    }
  };

  return (
    <OnboardingShell
      title={type === 'RIDER' ? 'Start Rider application' : 'Start Store application'}
      subtitle="We use a verified contact to protect your draft and send review updates. Your contact becomes an operational login only after approval."
      onBack={() => navigation.goBack()}
    >
      <Section title="Applicant identity" subtitle="Use details that match the submitted documents.">
        <FormField
          label="Full legal name"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          placeholder="Enter full name"
        />
        <FormField
          label="Email address"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          placeholder="name@example.com"
        />
        {phoneAvailable ? (
          <FormField
            label="Mobile number"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="+91..."
            hint="Use international format, including country code."
          />
        ) : null}
      </Section>

      <Section title="Verification method">
        <View style={styles.choiceRow}>
          <TouchableOpacity
            style={[styles.choice, channel === 'EMAIL' && styles.choiceActive]}
            onPress={() => setChannel('EMAIL')}
          >
            <Mail size={20} color={channel === 'EMAIL' ? palette.teal : palette.muted} />
            <Text style={[styles.choiceText, channel === 'EMAIL' && styles.choiceTextActive]}>
              Email
            </Text>
          </TouchableOpacity>
          {phoneAvailable ? (
            <TouchableOpacity
              style={[styles.choice, channel === 'PHONE' && styles.choiceActive]}
              onPress={() => setChannel('PHONE')}
            >
              <Phone size={20} color={channel === 'PHONE' ? palette.teal : palette.muted} />
              <Text style={[styles.choiceText, channel === 'PHONE' && styles.choiceTextActive]}>
                Phone
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {phoneAvailable === null ? (
          <Text style={styles.availability}>Checking available verification methods…</Text>
        ) : null}
        {phoneAvailable === false ? (
          <Text style={styles.availability}>
            Phone verification is temporarily unavailable. Use email verification.
          </Text>
        ) : null}
      </Section>

      <PrimaryButton label="Create protected application" onPress={submit} loading={loading} />
      <Text style={styles.consent}>
        Continuing records onboarding consent, application events and document review history. It does not guarantee approval.
      </Text>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  choiceRow: { flexDirection: 'row', gap: 12 },
  choice: {
    flex: 1,
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  choiceActive: { borderColor: '#2DD4BF', backgroundColor: '#F0FDFA' },
  choiceText: { color: palette.muted, fontSize: 14, fontWeight: '800' },
  choiceTextActive: { color: palette.teal },
  availability: { color: '#64748B', fontSize: 12, lineHeight: 18, textAlign: 'center' },
  consent: {
    color: '#64748B',
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
});
