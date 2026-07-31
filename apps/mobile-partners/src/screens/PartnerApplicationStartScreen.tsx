import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
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

function phoneForApi(value: string) {
  const compact = value.replace(/[\s().-]/g, '');
  if (/^\d{10}$/.test(compact)) return `+91${compact}`;
  if (/^91\d{10}$/.test(compact)) return `+${compact}`;
  return compact;
}

export function PartnerApplicationStartScreen({ navigation, route }: any) {
  const type = route.params?.type as PartnerApplicationType;
  const start = usePartnerOnboardingStore((state) => state.start);
  const loading = usePartnerOnboardingStore((state) => state.isLoading);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [phoneAvailable, setPhoneAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    apiClient
      .get('/partner-onboarding/verification-capabilities')
      .then(({ data }) => {
        if (!active) return;
        setPhoneAvailable(data?.mode !== 'EMAIL_ONLY' && data?.phone?.available !== false);
      })
      .catch(() => {
        if (active) setPhoneAvailable(false);
      });
    return () => { active = false; };
  }, []);

  const submit = async () => {
    if (!name.trim()) {
      Alert.alert('Full name required', 'Enter the legal name that matches your documents.');
      return;
    }
    const normalizedPhone = phoneForApi(phone);
    if (phoneAvailable !== false && !/^\+[1-9]\d{7,14}$/.test(normalizedPhone)) {
      Alert.alert('Mobile number required', 'Enter a valid mobile number. Indian 10-digit numbers are accepted.');
      return;
    }
    if (phoneAvailable === false && !email.trim()) {
      Alert.alert('Email required', 'Phone verification is unavailable, so enter an email address.');
      return;
    }

    const application: PartnerApplicationStartInput = {
      type,
      applicantName: name.trim(),
      phoneE164: phoneAvailable === false ? undefined : normalizedPhone,
      email: email.trim() || undefined,
      verificationChannel: phoneAvailable === false ? 'EMAIL' : 'PHONE',
    };

    try {
      await startProtectedApplicationAndContinue({
        start,
        application,
        navigation,
        getSession: () => {
          const state = usePartnerOnboardingStore.getState();
          return { applicationId: state.applicationId, accessToken: state.accessToken };
        },
      });
    } catch (error: any) {
      Alert.alert('Application could not be started', error.message);
    }
  };

  return (
    <OnboardingShell
      title={type === 'RIDER' ? 'Start Rider application' : 'Start Store application'}
      subtitle="Your verified mobile number protects the application and becomes your primary Aagaam login after approval."
      onBack={() => navigation.goBack()}
    >
      <Section title="Applicant identity" subtitle="Use details that match your submitted documents.">
        <FormField testID="application_start_name_input" label="Full legal name" value={name} onChangeText={setName} autoCapitalize="words" placeholder="Enter full name" />
        {phoneAvailable !== false ? (
          <>
            <Text style={styles.primaryLabel}><Phone size={15} color={palette.teal} /> Primary login</Text>
            <FormField
              testID="application_start_phone_input"
              label="Mobile number"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="10-digit number or +91..."
              hint="We send a six-digit SMS code. This number becomes your login after approval."
            />
          </>
        ) : null}
        <Text style={styles.optionalLabel}><Mail size={15} color={palette.muted} /> Optional recovery contact</Text>
        <FormField
          testID="application_start_email_input"
          label={phoneAvailable === false ? 'Email address' : 'Email address (optional)'}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          placeholder="name@example.com"
          hint="Used for review updates and account recovery when provided."
        />
      </Section>

      {phoneAvailable === null ? <Text style={styles.availability}>Checking verification availability…</Text> : null}
      {phoneAvailable === false ? <Text style={styles.warning}>Phone verification is unavailable on this deployment. Email verification will be used.</Text> : null}
      <PrimaryButton testID="application_start_submit_button" label={phoneAvailable === false ? 'Continue with email' : 'Send SMS code'} onPress={submit} loading={loading} />
      <Text style={styles.consent}>Continuing records onboarding consent, application events and document review history. It does not guarantee approval.</Text>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  primaryLabel: { color: palette.teal, fontSize: 12, fontWeight: '900', flexDirection: 'row' },
  optionalLabel: { color: palette.muted, fontSize: 12, fontWeight: '900' },
  availability: { color: '#64748B', fontSize: 12, textAlign: 'center' },
  warning: { color: '#B45309', backgroundColor: '#FFFBEB', borderRadius: 14, padding: 12, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  consent: { color: '#64748B', fontSize: 11, lineHeight: 17, textAlign: 'center', paddingHorizontal: 8 },
});
