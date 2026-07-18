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

export function PartnerResumeScreen({ navigation }: any) {
  const resume = usePartnerOnboardingStore((state) => state.resume);
  const loading = usePartnerOnboardingStore((state) => state.isLoading);
  const [applicationId, setApplicationId] = useState('');
  const [accessToken, setAccessToken] = useState('');

  const submit = async () => {
    if (!applicationId.trim() || accessToken.trim().length < 32) {
      Alert.alert(
        'Application access required',
        'Enter the application ID and protected access token saved when the application was started.',
      );
      return;
    }
    try {
      await resume(applicationId.trim(), accessToken.trim());
      navigation.reset({ index: 0, routes: [{ name: 'ApplicationStatus' }] });
    } catch (error: any) {
      Alert.alert('Application could not be restored', error.message);
    }
  };

  return (
    <OnboardingShell
      title="Resume an application"
      subtitle="Application access is separate from Rider or Store login. It can view and edit only the matching onboarding application."
      onBack={() => navigation.goBack()}
    >
      <Section title="Protected application access">
        <FormField
          label="Application ID"
          value={applicationId}
          onChangeText={setApplicationId}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Application ID"
        />
        <FormField
          label="Application access token"
          value={accessToken}
          onChangeText={setAccessToken}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          placeholder="Protected access token"
          multiline
        />
      </Section>
      <PrimaryButton label="Restore application" onPress={submit} loading={loading} />
      <Text style={styles.note}>
        AAGAM Support should never ask for your password. Share application access only through an approved recovery process.
      </Text>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  note: { color: palette.muted, fontSize: 11, lineHeight: 17, textAlign: 'center' },
});
