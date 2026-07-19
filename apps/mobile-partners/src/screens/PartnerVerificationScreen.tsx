import React, { useEffect, useMemo, useState } from 'react';
import { Alert, BackHandler, StyleSheet, Text, View } from 'react-native';
import { apiClient } from '@aagam/mobile-shared';
import {
  FormField,
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
  verificationRequestErrorMessage,
} from '../onboarding/partnerVerificationPresentation';
import { usePartnerOnboardingStore } from '../onboarding/usePartnerOnboardingStore';

function applicationHeaders(token: string) {
  return { Authorization: `Application ${token}` };
}

function errorCode(error: any): string {
  return String(error?.code || error?.response?.data?.code || 'PNV_FAILED');
}

function errorMessage(error: any): string {
  const raw = error?.response?.data?.message || error?.message || 'Verification failed';
  return Array.isArray(raw) ? raw.join(', ') : String(raw);
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
  const [code, setCode] = useState('');
  const [pnvSupported, setPnvSupported] = useState<boolean | null>(null);
  const [pnvBusy, setPnvBusy] = useState(false);
  const [showSmsFallback, setShowSmsFallback] = useState(false);
  const [fallbackQaCode, setFallbackQaCode] = useState<string | null>(null);
  const [deliveryChecked, setDeliveryChecked] = useState(false);
  const application = response?.application;
  const phoneFlow = application?.verificationChannel === 'PHONE' && Boolean(application?.phoneE164);
  const deliveryChannel: 'EMAIL' | 'PHONE' = phoneFlow ? 'PHONE' : 'EMAIL';

  const destination = useMemo(
    () => application?.phoneE164 || application?.email || 'your verified contact',
    [application?.email, application?.phoneE164],
  );

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
        const configured = Boolean(capabilities.data?.phone?.pnvConfigured);
        const supported = configured && nativeSupport.supported;
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

  const leaveVerification = () => {
    resetVerificationToPartnerHome(navigation);
  };

  const proceedAfterVerification = () => {
    const applicationType = type || application?.type;
    navigation.replace(applicationType === 'RIDER' ? 'RiderApplication' : 'StoreApplication');
  };

  const verifyCode = async () => {
    if (!/^\d{6}$/.test(code)) {
      Alert.alert('Enter the six-digit code', 'Use the latest verification code sent to your contact.');
      return;
    }
    try {
      await verify(code);
      proceedAfterVerification();
    } catch (error: any) {
      Alert.alert('Verification failed', error.message);
    }
  };

  const resend = async () => {
    setDeliveryChecked(false);
    try {
      await requestVerification(deliveryChannel);
      await loadEvents();
      setDeliveryChecked(true);
      Alert.alert(
        'Code request accepted',
        'The provider accepted a fresh verification code request. Check Inbox and Spam, then use the latest code only.',
      );
    } catch (error: any) {
      await loadEvents().catch(() => undefined);
      setDeliveryChecked(true);
      Alert.alert('Could not send a new code', verificationRequestErrorMessage(error));
    }
  };

  const startPnv = async () => {
    if (!applicationId || !accessToken) {
      Alert.alert('Application session missing', 'Resume the application and try again.');
      return;
    }
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
    } catch (error: any) {
      const code = errorCode(error);
      const recoverable = [
        'PNV_UNSUPPORTED',
        'PNV_DECLINED',
        'PNV_CREDENTIAL_FAILED',
        'PNV_PAYLOAD_FAILED',
        'PNV_EXCHANGE_FAILED',
        'PNV_FAILED',
      ].includes(code);
      if (recoverable) setShowSmsFallback(true);
      Alert.alert(
        code === 'PNV_DECLINED' ? 'Phone sharing declined' : 'Phone verification failed',
        recoverable
          ? `${errorMessage(error)} You can verify by SMS instead.`
          : errorMessage(error),
      );
    } finally {
      setPnvBusy(false);
    }
  };

  const selectSmsFallback = async () => {
    if (!applicationId || !accessToken) return;
    setPnvBusy(true);
    try {
      const { data } = await apiClient.post(
        `/partner-onboarding/applications/${applicationId}/contact-code`,
        { channel: 'PHONE', fallbackFrom: 'FIREBASE_PNV' },
        { headers: applicationHeaders(accessToken) },
      );
      setFallbackQaCode(data.code || null);
      setShowSmsFallback(true);
      await loadEvents().catch(() => undefined);
      Alert.alert('SMS code requested', 'Enter the six-digit code after it arrives.');
    } catch (error: any) {
      await loadEvents().catch(() => undefined);
      Alert.alert('Could not send SMS', verificationRequestErrorMessage(error));
    } finally {
      setPnvBusy(false);
    }
  };

  const qaCode = fallbackQaCode || testVerificationCode;
  const deliveryReference = [
    delivery.provider ? `Provider: ${delivery.provider}` : '',
    delivery.failureCode ? `Code: ${delivery.failureCode}` : '',
    delivery.correlationId ? `Reference: ${delivery.correlationId}` : '',
  ].filter(Boolean);

  if (!applicationId || !accessToken) {
    return (
      <OnboardingShell
        title="Application session unavailable"
        subtitle="Return to the partner home and resume the application with its access details."
      >
        <PrimaryButton label="Back to partner home" onPress={leaveVerification} />
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell
      title="Verify your contact"
      subtitle={
        phoneFlow
          ? 'Verify the phone number protecting this application.'
          : 'Enter the latest email code accepted by the verification provider.'
      }
      onBack={leaveVerification}
    >
      <Section title={delivery.title} subtitle={destination}>
        <View
          style={[
            styles.deliveryCard,
            delivery.state === 'SENT' && styles.deliverySent,
            delivery.state === 'FAILED' && styles.deliveryFailed,
            delivery.state === 'UNKNOWN' && styles.deliveryUnknown,
          ]}
        >
          <Text style={styles.deliveryMessage}>{delivery.message}</Text>
          {delivery.expiresAt ? (
            <Text style={styles.deliveryMeta}>
              Expires {new Date(delivery.expiresAt).toLocaleString()}
            </Text>
          ) : null}
          {deliveryReference.map((item) => (
            <Text key={item} style={styles.deliveryMeta} selectable>
              {item}
            </Text>
          ))}
        </View>
      </Section>

      {phoneFlow ? (
        <Section title="Phone number verification" subtitle={destination}>
          <Text style={styles.explainer}>
            Android may ask permission to share the verified number from your SIM. AAGAM sends only the signed Firebase proof to the server and confirms it there.
          </Text>
          {pnvSupported === null ? <Text style={styles.note}>Checking device support…</Text> : null}
          {pnvSupported ? (
            <PrimaryButton label="Verify phone securely" onPress={startPnv} loading={pnvBusy} />
          ) : null}
          {showSmsFallback ? (
            <PrimaryButton
              label="Use SMS verification instead"
              onPress={selectSmsFallback}
              secondary
              disabled={pnvBusy}
            />
          ) : null}
        </Section>
      ) : null}

      {!phoneFlow || showSmsFallback ? (
        <Section title="Verification code" subtitle={destination}>
          <FormField
            label="Six-digit code"
            value={code}
            onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            maxLength={6}
            placeholder="000000"
            style={styles.code}
          />
          {qaCode ? (
            <View style={styles.qaCode}>
              <Text style={styles.qaLabel}>QA verification code</Text>
              <Text style={styles.qaValue}>{qaCode}</Text>
            </View>
          ) : null}
        </Section>
      ) : null}

      {!phoneFlow || showSmsFallback ? (
        <>
          <PrimaryButton label="Verify and continue" onPress={verifyCode} loading={isLoading} />
          <PrimaryButton label="Send a new code" onPress={resend} secondary disabled={isLoading} />
        </>
      ) : null}
      <PrimaryButton label="Back to partner home" onPress={leaveVerification} secondary />
      <Text style={styles.note}>Verification is complete only after the AAGAM server confirms the proof.</Text>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  code: { textAlign: 'center', fontSize: 24, fontWeight: '900', letterSpacing: 8, color: palette.ink },
  explainer: { color: palette.muted, fontSize: 13, lineHeight: 20 },
  deliveryCard: { borderRadius: 16, borderWidth: 1, padding: 14, backgroundColor: '#F8FAFC', borderColor: '#CBD5E1', gap: 6 },
  deliverySent: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
  deliveryFailed: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  deliveryUnknown: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  deliveryMessage: { color: palette.ink, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  deliveryMeta: { color: '#64748B', fontSize: 10, lineHeight: 15, fontWeight: '700' },
  qaCode: { borderRadius: 16, backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA', padding: 14, alignItems: 'center' },
  qaLabel: { color: '#9A3412', fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  qaValue: { color: '#7C2D12', fontSize: 22, fontWeight: '900', letterSpacing: 5, marginTop: 5 },
  note: { color: palette.muted, fontSize: 11, lineHeight: 17, textAlign: 'center' },
});
