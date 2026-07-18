import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { FormField, OnboardingShell, palette, PrimaryButton, Section } from '../components/PartnerOnboardingUI';
import { usePartnerOnboardingStore } from '../onboarding/usePartnerOnboardingStore';

export function PartnerVerificationScreen({ navigation }: any) {
  const { response, type, verify, requestVerification, isLoading, testVerificationCode } = usePartnerOnboardingStore();
  const [code, setCode] = useState('');
  const application = response?.application;
  const preferredChannel = application?.email ? 'EMAIL' : 'PHONE';

  const proceed = async () => {
    if (!/^\d{6}$/.test(code)) {
      Alert.alert('Enter the six-digit code', 'Use the latest verification code sent to your contact.');
      return;
    }
    try {
      await verify(code);
      navigation.replace(type === 'RIDER' ? 'RiderApplication' : 'StoreApplication');
    } catch (error: any) {
      Alert.alert('Verification failed', error.message);
    }
  };

  const resend = async () => {
    try {
      await requestVerification(preferredChannel);
      Alert.alert('Code sent', 'A fresh verification code has been issued.');
    } catch (error: any) {
      Alert.alert('Could not resend', error.message);
    }
  };

  return (
    <OnboardingShell
      title="Verify your contact"
      subtitle="This protects the application draft and confirms where review updates should be sent."
      onBack={() => navigation.goBack()}
    >
      <Section title="Verification code" subtitle={application?.email || application?.phoneE164 || 'Verified contact'}>
        <FormField
          label="Six-digit code"
          value={code}
          onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          maxLength={6}
          placeholder="000000"
          style={styles.code}
        />
        {testVerificationCode ? (
          <View style={styles.qaCode}>
            <Text style={styles.qaLabel}>QA verification code</Text>
            <Text style={styles.qaValue}>{testVerificationCode}</Text>
          </View>
        ) : null}
      </Section>
      <PrimaryButton label="Verify and continue" onPress={proceed} loading={isLoading} />
      <PrimaryButton label="Send a new code" onPress={resend} secondary disabled={isLoading} />
      <Text style={styles.note}>For security, older codes stop working after a new code is requested.</Text>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  code: { textAlign: 'center', fontSize: 24, fontWeight: '900', letterSpacing: 8, color: palette.ink },
  qaCode: { borderRadius: 16, backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA', padding: 14, alignItems: 'center' },
  qaLabel: { color: '#9A3412', fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  qaValue: { color: '#7C2D12', fontSize: 22, fontWeight: '900', letterSpacing: 5, marginTop: 5 },
  note: { color: palette.muted, fontSize: 11, lineHeight: 17, textAlign: 'center' },
});
