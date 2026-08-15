import React, { useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function phoneForApi(value: string) {
  const compact = value.replace(/[\s().-]/g, '');
  if (!compact) return '';
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

  const submit = async () => {
    if (!name.trim()) {
      Alert.alert('Full name required', 'Enter the legal name that matches your documents.');
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      Alert.alert('Valid email required', 'Enter a valid email address. A verification code will be sent there.');
      return;
    }
    const normalizedPhone = phoneForApi(phone);
    if (normalizedPhone && !/^\+[1-9]\d{7,14}$/.test(normalizedPhone)) {
      Alert.alert('Invalid mobile number', 'Enter a valid mobile number or leave it blank. Indian 10-digit numbers are accepted.');
      return;
    }

    const application: PartnerApplicationStartInput = {
      type,
      applicantName: name.trim(),
      email: normalizedEmail,
      phoneE164: normalizedPhone || undefined,
      verificationChannel: 'EMAIL',
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
      subtitle="Your email must be verified before you continue. Your mobile number is an optional operational contact and is not used for this verification step."
      onBack={() => navigation.goBack()}
    >
      <Section title="Applicant identity" subtitle="Use details that match your submitted documents.">
        <FormField testID="application_start_name_input" label="Full legal name" value={name} onChangeText={setName} autoCapitalize="words" placeholder="Enter full name" />
        <Text style={styles.primaryLabel}><Mail size={15} color={palette.teal} /> Mandatory verification</Text>
        <FormField
          testID="application_start_email_input"
          label="Email address"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          placeholder="name@example.com"
          hint="We send a six-digit verification code to this email. Verification is required before the application can continue."
        />
        <Text style={styles.optionalLabel}><Phone size={15} color={palette.muted} /> Optional operational contact</Text>
        <FormField
          testID="application_start_phone_input"
          label="Mobile number (optional)"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="10-digit number or +91..."
          hint="Used for operational contact when provided. No phone OTP is required for a new application."
        />
      </Section>

      <PrimaryButton testID="application_start_submit_button" label="Send email verification code" onPress={submit} loading={loading} />
      <Text style={styles.consent}>Continuing records onboarding consent, application events and document review history. It does not guarantee approval.</Text>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  primaryLabel: { color: palette.teal, fontSize: 12, fontWeight: '900', flexDirection: 'row' },
  optionalLabel: { color: palette.muted, fontSize: 12, fontWeight: '900' },
  consent: { color: '#64748B', fontSize: 11, lineHeight: 17, textAlign: 'center', paddingHorizontal: 8 },
});
