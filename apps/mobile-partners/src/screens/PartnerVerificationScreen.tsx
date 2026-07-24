import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  BackHandler,
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CheckCircle2, ChevronDown, Mail, ShieldCheck } from 'lucide-react-native';
import { apiClient } from '@aagam/mobile-shared';
import {
  OnboardingShell,
  palette,
  PrimaryButton,
  Section,
} from '../components/PartnerOnboardingUI';
import { FirebasePnv } from '../native/FirebasePnv';
import {
  createVerificationHardwareBackHandler,
  resetVerificationToPartnerHome,
  resolveVerificationDelivery,
} from '../onboarding/partnerVerificationPresentation';
import { usePartnerOnboardingStore } from '../onboarding/usePartnerOnboardingStore';

function applicationHeaders(token: string) {
  return { Authorization: `Application ${token}` };
}

function maskDestination(value: string) {
  if (value.includes('@')) {
    const [name, domain] = value.split('@');
    return `${name.slice(0, 1)}${'•'.repeat(Math.max(3, Math.min(7, name.length - 1)))}@${domain}`;
  }
  const digits = value.replace(/\D/g, '');
  return digits.length > 4 ? `+${digits.slice(0, 2)} •••••• ${digits.slice(-4)}` : value;
}

export function PartnerVerificationScreen({ navigation }: any) {
  const {
    applicationId,
    accessToken,
    response,
    type,
    events,
    verify,
    requestVerification,
    refresh,
    loadEvents,
    isLoading,
    testVerificationCode,
  } = usePartnerOnboardingStore();
  const inputRef = useRef<TextInput>(null);
  const verifyingRef = useRef(false);
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(30);
  const [deliveryChecked, setDeliveryChecked] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [pnvSupported, setPnvSupported] = useState<boolean | null>(null);
  const [pnvBusy, setPnvBusy] = useState(false);
  const [showSmsFallback, setShowSmsFallback] = useState(false);
  const application = response?.application;
  const phoneFlow = application?.verificationChannel === 'PHONE' && Boolean(application?.phoneE164);
  const deliveryChannel: 'EMAIL' | 'PHONE' = phoneFlow ? 'PHONE' : 'EMAIL';
  const destination = application?.phoneE164 || application?.email || '';
  const maskedDestination = maskDestination(destination);
  const delivery = useMemo(
    () => resolveVerificationDelivery(events, deliveryChannel, deliveryChecked),
    [deliveryChannel, deliveryChecked, events],
  );

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      createVerificationHardwareBackHandler(navigation),
    );
    return () => subscription.remove();
  }, [navigation]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  useEffect(() => {
    let active = true;
    if (!applicationId || !accessToken) {
      setDeliveryChecked(true);
      return () => undefined;
    }
    Promise.allSettled([refresh(), loadEvents()]).finally(() => {
      if (active) setDeliveryChecked(true);
    });
    return () => {
      active = false;
    };
  }, [accessToken, applicationId, loadEvents, refresh]);

  useEffect(() => {
    let active = true;
    if (!phoneFlow) return () => undefined;
    Promise.all([
      apiClient.get('/partner-onboarding/verification-capabilities'),
      FirebasePnv.isPnvSupported(),
    ])
      .then(([capabilities, nativeSupport]) => {
        if (!active) return;
        const supported = Boolean(capabilities.data?.phone?.pnvConfigured) && nativeSupport.supported;
        setPnvSupported(supported);
        setShowSmsFallback(!supported);
      })
      .catch(() => {
        if (!active) return;
        setPnvSupported(false);
        setShowSmsFallback(true);
      });
    return () => {
      active = false;
    };
  }, [phoneFlow]);

  const leaveVerification = () => resetVerificationToPartnerHome(navigation);
  const proceedAfterVerification = () => {
    const applicationType = type || application?.type;
    navigation.replace(applicationType === 'RIDER' ? 'RiderApplication' : 'StoreApplication');
  };

  const verifyCode = async (candidate = code) => {
    if (!/^\d{6}$/.test(candidate) || verifyingRef.current) return;
    verifyingRef.current = true;
    Keyboard.dismiss();
    try {
      await verify(candidate);
      proceedAfterVerification();
    } catch (error: any) {
      setCode('');
      Alert.alert('Code not verified', error.message || 'Use the latest six-digit code and try again.');
      setTimeout(() => inputRef.current?.focus(), 200);
    } finally {
      verifyingRef.current = false;
    }
  };

  const updateCode = (value: string) => {
    const next = value.replace(/\D/g, '').slice(0, 6);
    setCode(next);
    if (next.length === 6) setTimeout(() => void verifyCode(next), 120);
  };

  const resend = async () => {
    if (countdown > 0) return;
    setDeliveryChecked(false);
    try {
      await requestVerification(deliveryChannel);
      await loadEvents();
      setDeliveryChecked(true);
      setCountdown(30);
      setCode('');
      Alert.alert('New code sent', `Check ${maskedDestination} and use the latest code.`);
    } catch {
      await loadEvents().catch(() => undefined);
      setDeliveryChecked(true);
      setHelpOpen(true);
      Alert.alert('Code could not be sent', 'Please wait a moment and try again.');
    }
  };

  const startPnv = async () => {
    if (!applicationId || !accessToken) return;
    setPnvBusy(true);
    try {
      const challenge = await apiClient.post(
        `/partner-onboarding/applications/${applicationId}/phone-pnv/challenge`,
        {},
        { headers: applicationHeaders(accessToken) },
      );
      const nativeResult = await FirebasePnv.startPnvVerification(challenge.data.nonce);
      await apiClient.post(
        `/partner-onboarding/applications/${applicationId}/phone-pnv/verify`,
        { token: nativeResult.token },
        { headers: applicationHeaders(accessToken) },
      );
      await refresh();
      proceedAfterVerification();
    } catch {
      setShowSmsFallback(true);
      Alert.alert('Phone verification unavailable', 'Use the six-digit SMS option instead.');
    } finally {
      setPnvBusy(false);
    }
  };

  const selectSmsFallback = async () => {
    if (!applicationId || !accessToken) return;
    setPnvBusy(true);
    try {
      await apiClient.post(
        `/partner-onboarding/applications/${applicationId}/contact-code`,
        { channel: 'PHONE', fallbackFrom: 'FIREBASE_PNV' },
        { headers: applicationHeaders(accessToken) },
      );
      await loadEvents().catch(() => undefined);
      setCountdown(30);
      setShowSmsFallback(true);
    } catch {
      setHelpOpen(true);
      Alert.alert('SMS could not be sent', 'Please wait a moment and try again.');
    } finally {
      setPnvBusy(false);
    }
  };

  if (!applicationId || !accessToken) {
    return (
      <OnboardingShell title="Application session unavailable" subtitle="Return to Partner Home and resume the application.">
        <PrimaryButton label="Back to Partner Home" onPress={leaveVerification} />
      </OnboardingShell>
    );
  }

  const supportReference = delivery.correlationId || null;
  const failed = delivery.state === 'FAILED';

  return (
    <OnboardingShell
      title={phoneFlow ? 'Verify your phone' : 'Verify your email'}
      subtitle="This protects your application and future Rider or Store account."
      onBack={leaveVerification}
    >
      <Section title="Verification code">
        <View style={styles.heroIcon}>
          {failed ? <Mail size={28} color={palette.red} /> : <ShieldCheck size={28} color={palette.teal} />}
        </View>
        <Text style={styles.sentText}>
          {failed ? 'We could not send the code right now.' : 'We sent a six-digit code to'}
        </Text>
        <Text style={styles.destination}>{maskedDestination}</Text>

        {phoneFlow && !showSmsFallback ? (
          <View style={styles.phoneVerification}>
            {pnvSupported === null ? <Text style={styles.helper}>Checking secure phone verification…</Text> : null}
            {pnvSupported ? <PrimaryButton label="Verify phone securely" onPress={startPnv} loading={pnvBusy} /> : null}
            {!pnvSupported ? <PrimaryButton label="Use SMS code" onPress={selectSmsFallback} loading={pnvBusy} secondary /> : null}
          </View>
        ) : (
          <>
            <TouchableOpacity style={styles.otpRow} onPress={() => inputRef.current?.focus()} activeOpacity={0.9}>
              {Array.from({ length: 6 }).map((_, index) => (
                <View key={index} style={[styles.otpCell, code.length === index && styles.otpCellActive, code[index] && styles.otpCellFilled]}>
                  <Text style={styles.otpDigit}>{code[index] || ''}</Text>
                </View>
              ))}
            </TouchableOpacity>
            <TextInput
              ref={inputRef}
              testID="verification_code_input"
              value={code}
              onChangeText={updateCode}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              maxLength={6}
              autoFocus
              style={styles.hiddenInput}
              accessibilityLabel="Six-digit verification code"
            />
            {__DEV__ && testVerificationCode ? (
              <TouchableOpacity onPress={() => updateCode(testVerificationCode)} style={styles.devCode}>
                <Text style={styles.devCodeText}>Development code: {testVerificationCode}</Text>
              </TouchableOpacity>
            ) : null}
            <PrimaryButton testID="verification_verify_button" label="Verify and continue" onPress={() => verifyCode()} loading={isLoading} disabled={code.length !== 6} />
            <TouchableOpacity testID="verification_resend_button" onPress={resend} disabled={countdown > 0 || isLoading} style={styles.resendButton}>
              <Text style={[styles.resendText, countdown > 0 && styles.resendDisabled]}>
                {countdown > 0 ? `Resend code in 00:${String(countdown).padStart(2, '0')}` : 'Resend code'}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </Section>

      {failed || supportReference ? (
        <TouchableOpacity testID="verification_help_card" style={styles.helpCard} onPress={() => setHelpOpen((value) => !value)}>
          <View style={styles.helpHeader}>
            <Text style={styles.helpTitle}>Need help?</Text>
            <ChevronDown size={17} color={palette.muted} />
          </View>
          {helpOpen ? (
            <View style={styles.helpBody}>
              <Text style={styles.helper}>Check your Inbox and Spam folder. Confirm the email is correct, then resend after the timer ends.</Text>
              {supportReference ? <Text selectable style={styles.reference}>Support reference: {supportReference}</Text> : null}
            </View>
          ) : null}
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity testID="verification_back_button" onPress={leaveVerification} style={styles.changeContact}>
        <Text style={styles.changeContactText}>Back to Partner Home</Text>
      </TouchableOpacity>
      <View style={styles.secureNote}>
        <CheckCircle2 size={16} color={palette.green} />
        <Text style={styles.secureNoteText}>AAGAM never asks you to share this code with another person.</Text>
      </View>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  heroIcon: { width: 64, height: 64, borderRadius: 22, backgroundColor: '#F0FDFA', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  sentText: { color: palette.muted, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  destination: { color: palette.ink, fontSize: 16, fontWeight: '900', textAlign: 'center' },
  otpRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 7, marginTop: 8 },
  otpCell: { flex: 1, maxWidth: 52, height: 58, borderRadius: 15, borderWidth: 1.5, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' },
  otpCellActive: { borderColor: '#14B8A6', backgroundColor: '#F0FDFA' },
  otpCellFilled: { borderColor: '#5EEAD4', backgroundColor: '#ECFEFF' },
  otpDigit: { color: palette.ink, fontSize: 23, fontWeight: '900' },
  hiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  resendButton: { alignItems: 'center', paddingVertical: 10 },
  resendText: { color: palette.teal, fontSize: 12, fontWeight: '900' },
  resendDisabled: { color: '#94A3B8' },
  phoneVerification: { gap: 10 },
  helper: { color: palette.muted, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  helpCard: { borderRadius: 17, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC', padding: 14 },
  helpHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  helpTitle: { color: palette.ink, fontSize: 12, fontWeight: '900' },
  helpBody: { gap: 8, marginTop: 10 },
  reference: { color: '#475569', fontSize: 10, lineHeight: 16, fontWeight: '800' },
  changeContact: { alignItems: 'center', paddingVertical: 7 },
  changeContactText: { color: palette.teal, fontSize: 12, fontWeight: '900' },
  secureNote: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  secureNoteText: { color: palette.muted, fontSize: 10, lineHeight: 15, fontWeight: '700', flex: 1 },
  devCode: { borderRadius: 12, padding: 10, backgroundColor: '#FFF7ED', alignItems: 'center' },
  devCodeText: { color: '#9A3412', fontSize: 10, fontWeight: '900' },
});
