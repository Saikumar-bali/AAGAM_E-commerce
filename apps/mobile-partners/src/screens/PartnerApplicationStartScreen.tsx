import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Mail, Phone } from 'lucide-react-native';
import { FormField, OnboardingShell, palette, PrimaryButton, Section } from '../components/PartnerOnboardingUI';
import { usePartnerOnboardingStore } from '../onboarding/usePartnerOnboardingStore';
import { PartnerApplicationType } from '../onboarding/types';

export function PartnerApplicationStartScreen({ navigation, route }: any) {
  const type = route.params?.type as PartnerApplicationType;
  const start = usePartnerOnboardingStore((state) => state.start);
  const loading = usePartnerOnboardingStore((state) => state.isLoading);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [channel, setChannel] = useState<'EMAIL' | 'PHONE'>('EMAIL');

  const submit = async () => {
    if (!name.trim()) {
      Alert.alert('Full name required', 'Enter the legal name that matches your documents.');
      return;
    }
    if (channel === 'EMAIL' && !email.trim()) {
      Alert.alert('Email required', 'Enter the email address you can verify.');
      return;
    }
    if (channel === 'PHONE' && !phone.trim()) {
      Alert.alert('Phone required', 'Enter the mobile number you can verify.');
      return;
    }
    try {
      await start({
        type,
        applicantName: name.trim(),
        email: email.trim() || undefined,
        phoneE164: phone.trim() || undefined,
        verificationChannel: channel,
      });
      navigation.replace('VerifyApplication');
    } catch (error: any) {
      Alert.alert('Application could not be started', error.message);
    }
  };

  return (
    <OnboardingShell
      title={type === 'RIDER' ? 'Start Rider application' : 'Start Store application'}
      subtitle="We use a verified contact to protect your draft and send review updates. Your contact is not an operational login until approval."
      onBack={() => navigation.goBack()}
    >
      <Section title="Applicant identity" subtitle="Use details that match the submitted documents.">
        <FormField label="Full legal name" value={name} onChangeText={setName} autoCapitalize="words" placeholder="Enter full name" />
        <FormField label="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="name@example.com" />
        <FormField label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+91..." hint="Use international format, including country code." />
      </Section>

      <Section title="Verification method">
        <View style={styles.choiceRow}>
          <TouchableOpacity
            style={[styles.choice, channel === 'EMAIL' && styles.choiceActive]}
            onPress={() => setChannel('EMAIL')}
          >
            <Mail size={20} color={channel === 'EMAIL' ? palette.teal : palette.muted} />
            <Text style={[styles.choiceText, channel === 'EMAIL' && styles.choiceTextActive]}>Email</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.choice, channel === 'PHONE' && styles.choiceActive]}
            onPress={() => setChannel('PHONE')}
          >
            <Phone size={20} color={channel === 'PHONE' ? palette.teal : palette.muted} />
            <Text style={[styles.choiceText, channel === 'PHONE' && styles.choiceTextActive]}>Phone</Text>
          </TouchableOpacity>
        </View>
      </Section>

      <PrimaryButton label="Create protected application" onPress={submit} loading={loading} />
      <Text style={styles.consent}>
        Continuing records the onboarding consent version, application events, and document review history. It does not guarantee approval.
      </Text>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  choiceRow: { flexDirection: 'row', gap: 12 },
  choice: { flex: 1, minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 17, borderWidth: 1.5, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  choiceActive: { borderColor: '#2DD4BF', backgroundColor: '#F0FDFA' },
  choiceText: { color: palette.muted, fontSize: 14, fontWeight: '800' },
  choiceTextActive: { color: palette.teal },
  consent: { color: '#64748B', fontSize: 11, lineHeight: 17, textAlign: 'center', paddingHorizontal: 8 },
});
