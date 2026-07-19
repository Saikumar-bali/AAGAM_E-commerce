import React, { useEffect, useRef, useState } from 'react';
import { Alert, Keyboard, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Mail, Phone, ShieldCheck } from 'lucide-react-native';
import {
  FormField,
  OnboardingShell,
  palette,
  PrimaryButton,
  Section,
} from '../components/PartnerOnboardingUI';
import { resolveApplicantInitialRoute } from '../navigation/applicantRoute';
import { usePartnerOnboardingStore } from '../onboarding/usePartnerOnboardingStore';

export function PartnerResumeScreen({ navigation }: any) {
  const requestResume = usePartnerOnboardingStore((state) => state.requestResume);
  const verifyResume = usePartnerOnboardingStore((state) => state.verifyResume);
  const loading = usePartnerOnboardingStore((state) => state.isLoading);
  const testCode = usePartnerOnboardingStore((state) => state.testVerificationCode);
  const inputRef = useRef<TextInput>(null);
  const [identifier, setIdentifier] = useState('');
  const [masked, setMasked] = useState('');
  const [channel, setChannel] = useState<'PHONE' | 'EMAIL'>('PHONE');
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const request = async () => {
    if (identifier.trim().length < 5) {
      Alert.alert('Contact required', 'Enter the mobile number or email used for your application.');
      return;
    }
    try {
      const result = await requestResume(identifier);
      setMasked(result.maskedDestination);
      setChannel(result.channel);
      setCode('');
      setCountdown(30);
      setTimeout(() => inputRef.current?.focus(), 200);
    } catch (error: any) {
      Alert.alert('Application not found', error.message);
    }
  };

  const verify = async (candidate = code) => {
    if (!/^\d{6}$/.test(candidate)) return;
    Keyboard.dismiss();
    try {
      await verifyResume(identifier, candidate);
      const state = usePartnerOnboardingStore.getState();
      const route = resolveApplicantInitialRoute(state.response);
      navigation.reset({ index: 0, routes: [{ name: route }] });
    } catch (error: any) {
      setCode('');
      Alert.alert('Code not verified', error.message);
    }
  };

  const updateCode = (value: string) => {
    const next = value.replace(/\D/g, '').slice(0, 6);
    setCode(next);
    if (next.length === 6) setTimeout(() => void verify(next), 120);
  };

  const resend = async () => {
    if (countdown > 0) return;
    await request();
  };

  return (
    <OnboardingShell
      title="Resume your application"
      subtitle="Use the phone number or email already attached to the application. No application ID or secret token is required."
      onBack={() => navigation.goBack()}
    >
      {!masked ? (
        <Section title="Find your application" subtitle="Mobile number is the primary recovery method.">
          <View style={styles.identityIcon}><Phone size={25} color={palette.teal} /></View>
          <FormField
            label="Mobile number or email"
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
            keyboardType={identifier.includes('@') ? 'email-address' : 'phone-pad'}
            placeholder="10-digit mobile number or email"
            hint="We will send a single-use six-digit code to the matching contact."
          />
          <PrimaryButton label="Send recovery code" onPress={request} loading={loading} />
        </Section>
      ) : (
        <Section title="Enter the six-digit code" subtitle={`Sent to ${masked}`}>
          <View style={styles.identityIcon}>{channel === 'PHONE' ? <Phone size={25} color={palette.teal} /> : <Mail size={25} color={palette.teal} />}</View>
          <TouchableOpacity style={styles.otpRow} onPress={() => inputRef.current?.focus()} activeOpacity={0.9}>
            {Array.from({ length: 6 }).map((_, index) => (
              <View key={index} style={[styles.otpCell, code.length === index && styles.otpCellActive]}>
                <Text style={styles.otpDigit}>{code[index] || ''}</Text>
              </View>
            ))}
          </TouchableOpacity>
          <TextInput
            ref={inputRef}
            value={code}
            onChangeText={updateCode}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            maxLength={6}
            autoFocus
            style={styles.hiddenInput}
          />
          {__DEV__ && testCode ? <TouchableOpacity onPress={() => updateCode(testCode)}><Text style={styles.devCode}>Development code: {testCode}</Text></TouchableOpacity> : null}
          <PrimaryButton label="Verify and resume" onPress={() => verify()} loading={loading} disabled={code.length !== 6} />
          <TouchableOpacity onPress={resend} disabled={countdown > 0 || loading} style={styles.resend}>
            <Text style={[styles.resendText, countdown > 0 && styles.resendDisabled]}>{countdown > 0 ? `Resend in 00:${String(countdown).padStart(2, '0')}` : 'Resend code'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setMasked(''); setCode(''); }}><Text style={styles.change}>Use a different contact</Text></TouchableOpacity>
        </Section>
      )}
      <View style={styles.secure}><ShieldCheck size={17} color={palette.green} /><Text style={styles.secureText}>Recovery rotates the old application access secret and restores your saved profile, documents and review status.</Text></View>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  identityIcon: { width: 58, height: 58, borderRadius: 20, backgroundColor: '#F0FDFA', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  otpRow: { flexDirection: 'row', gap: 7, justifyContent: 'space-between' },
  otpCell: { flex: 1, maxWidth: 52, height: 58, borderRadius: 15, borderWidth: 1.5, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' },
  otpCellActive: { borderColor: '#14B8A6', backgroundColor: '#F0FDFA' },
  otpDigit: { color: palette.ink, fontSize: 23, fontWeight: '900' },
  hiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  resend: { alignItems: 'center', paddingVertical: 8 },
  resendText: { color: palette.teal, fontSize: 12, fontWeight: '900' },
  resendDisabled: { color: '#94A3B8' },
  change: { color: '#64748B', textAlign: 'center', fontSize: 12, fontWeight: '800' },
  devCode: { color: '#64748B', textAlign: 'center', fontSize: 11 },
  secure: { flexDirection: 'row', gap: 9, alignItems: 'flex-start', borderRadius: 15, backgroundColor: '#F0FDF4', padding: 13 },
  secureText: { flex: 1, color: '#166534', fontSize: 11, lineHeight: 17, fontWeight: '700' },
});
