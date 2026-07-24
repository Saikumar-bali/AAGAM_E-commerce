import React, { useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import {
  FormField,
  OnboardingShell,
  palette,
  PrimaryButton,
  Section,
} from '../components/PartnerOnboardingUI';
import { usePartnerOnboardingStore } from '../onboarding/usePartnerOnboardingStore';

export function PartnerActivationScreen({ navigation }: any) {
  const { activate, clear, isLoading } = usePartnerOnboardingStore();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const submit = async () => {
    if (password.length < 10) {
      Alert.alert('Use a stronger password', 'Password must be at least 10 characters.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Passwords do not match', 'Re-enter the same password in both fields.');
      return;
    }
    try {
      await activate(password);
      await clear();
      Alert.alert(
        'Account activated',
        'Your password was created securely. Sign in to enter the approved partner workspace.',
        [{ text: 'Sign in', onPress: () => navigation.reset({ index: 0, routes: [{ name: 'Login' }] }) }],
      );
    } catch (error: any) {
      Alert.alert('Activation failed', error.message);
    }
  };

  return (
    <OnboardingShell
      title="Activate your partner account"
      subtitle="Create the permanent password yourself. AAGAM Admin cannot view, recover, or reuse this password."
      onBack={() => navigation.goBack()}
    >
      <Section title="Secure password" subtitle="Use a unique password that is not shared with store staff or delivery coordinators.">
        <FormField testID="activation_password_input" label="New password" value={password} onChangeText={setPassword} secureTextEntry placeholder="At least 10 characters" autoCapitalize="none" />
        <FormField testID="activation_confirm_password_input" label="Confirm password" value={confirm} onChangeText={setConfirm} secureTextEntry placeholder="Repeat password" autoCapitalize="none" />
      </Section>
      <PrimaryButton testID="activation_activate_button" label="Activate operational account" onPress={submit} loading={isLoading} />
      <Text style={styles.note}>
        The one-time activation token expires and becomes unusable immediately after successful activation.
      </Text>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  note: { color: palette.muted, fontSize: 11, lineHeight: 17, textAlign: 'center' },
});
