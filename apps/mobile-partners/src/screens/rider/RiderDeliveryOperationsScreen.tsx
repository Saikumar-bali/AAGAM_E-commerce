import { useQuery, useQueryClient } from '@tanstack/react-query';
import Geolocation from 'react-native-geolocation-service';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Clock3,
  KeyRound,
  MapPin,
  PackageX,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import Toast from 'react-native-toast-message';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  DeliveryFailureReason,
  deliveryOperationsService,
} from '../../api/deliveryOperationsService';
import { riderService } from '../../api/riderService';
import {
  DELIVERY_FAILURE_OPTIONS,
  riderOperationPolicy,
} from '../../domain/deliveryOperations';
import { normalizeRiderWorkspace } from '../../domain/riderWorkspace';

const WORKSPACE_KEY = ['rider', 'delivery-workspace'] as const;
const SUMMARY_KEY = ['rider', 'delivery-operations'] as const;

type PodLocation = {
  latitude: number;
  longitude: number;
  accuracyMetres?: number;
};

function errorMessage(error: any) {
  const message = error?.response?.data?.message;
  if (Array.isArray(message)) return message.join(', ');
  return message || error?.message || 'The operation could not be completed.';
}

function readable(value?: string | null) {
  return String(value || 'UNKNOWN').replaceAll('_', ' ');
}

function shortId(value?: string | null) {
  return value ? value.slice(-8).toUpperCase() : 'UNKNOWN';
}

function capturePodLocation() {
  return new Promise<PodLocation>((resolve, reject) => {
    Geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMetres: position.coords.accuracy,
        }),
      reject,
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 5_000 },
    );
  });
}

export const RiderDeliveryOperationsScreen = () => {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [podNote, setPodNote] = useState('');
  const [riderConfirmed, setRiderConfirmed] = useState(false);
  const [lastPodLocation, setLastPodLocation] = useState<PodLocation | null>(null);
  const [failureReason, setFailureReason] =
    useState<DeliveryFailureReason>('CUSTOMER_UNREACHABLE');
  const [failureNote, setFailureNote] = useState('');

  const workspaceQuery = useQuery({
    queryKey: WORKSPACE_KEY,
    queryFn: async () => normalizeRiderWorkspace(await riderService.getWorkspace()),
    refetchInterval: 12_000,
  });
  const activeJob = workspaceQuery.data?.activeJob || null;
  const summaryQuery = useQuery({
    queryKey: [...SUMMARY_KEY, activeJob?.id],
    queryFn: () => deliveryOperationsService.getSummary(activeJob!.id),
    enabled: Boolean(activeJob?.id),
    refetchInterval: activeJob ? 12_000 : false,
  });
  const summary = summaryQuery.data || null;
  const policy = useMemo(() => riderOperationPolicy(summary), [summary]);
  const order = summary?.job?.order || activeJob?.order;
  const recordedProof = summary?.operations?.find(
    (operation) => operation.type === 'DELIVERY_PROOF_RECORDED',
  );

  const refresh = async () => {
    await workspaceQuery.refetch();
    if (activeJob?.id) await summaryQuery.refetch();
  };

  const perform = async (
    key: string,
    task: () => Promise<unknown>,
    successTitle: string,
    successMessage: string,
  ) => {
    if (busy) return;
    setBusy(key);
    try {
      await task();
      await queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY });
      await queryClient.invalidateQueries({ queryKey: SUMMARY_KEY });
      Toast.show({ type: 'success', text1: successTitle, text2: successMessage });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Operation failed', text2: errorMessage(error) });
    } finally {
      setBusy(null);
    }
  };

  const recordPod = () => {
    if (!activeJob || !summary) return;
    if (otpCode.trim().length !== 6) {
      Toast.show({ type: 'error', text1: 'Enter the customer code', text2: 'A valid 6-digit OTP/PIN is required.' });
      return;
    }
    if (!riderConfirmed) {
      Toast.show({ type: 'error', text1: 'Confirm the handoff', text2: 'Confirm that the parcel was handed to the customer.' });
      return;
    }

    Alert.alert(
      'Record proof of delivery?',
      'OTP, rider confirmation, live GPS, accuracy, time, and note will be stored.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Record POD',
          onPress: () =>
            void perform(
              'complete',
              async () => {
                const location = await capturePodLocation();
                setLastPodLocation(location);
                await deliveryOperationsService.completeDelivery(activeJob.id, {
                  otpCode: otpCode.trim(),
                  proofType: 'CUSTOMER_OTP_PIN',
                  riderConfirmed: true,
                  note: podNote.trim() || undefined,
                  latitude: location.latitude,
                  longitude: location.longitude,
                  accuracyMetres: location.accuracyMetres,
                });
                setOtpCode('');
                setPodNote('');
                setRiderConfirmed(false);
              },
              'Proof of delivery recorded',
              'The verified handoff evidence is stored against this order.',
            ),
        },
      ],
    );
  };

  const recordFailure = () => {
    if (!activeJob) return;
    const option = DELIVERY_FAILURE_OPTIONS.find(
      (item) => item.value === failureReason,
    );
    Alert.alert(
      'Record failed delivery?',
      `${option?.label || 'Failure'} will start the exception workflow.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Record failure',
          style: 'destructive',
          onPress: () =>
            void perform(
              'failure',
              () =>
                deliveryOperationsService.recordFailure(activeJob.id, {
                  reason: failureReason,
                  note: failureNote.trim() || undefined,
                }),
              'Failure recorded',
              'The exact reason is stored and return handling is now available.',
            ),
        },
      ],
    );
  };

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={workspaceQuery.isRefetching || summaryQuery.isRefetching}
          onRefresh={() => void refresh()}
        />
      }
    >
      <View style={styles.hero}>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>RIDER OPERATIONS</Text>
          <Text style={styles.title}>Delivery proof & exceptions</Text>
          <Text style={styles.subtitle}>
            OTP, COD, GPS evidence, failure reasons, and returns
          </Text>
        </View>
        <TouchableOpacity testID="rider_operations_refresh_button" style={styles.refreshButton} onPress={() => void refresh()}>
          <RefreshCw size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <View style={styles.infoCard}>
        <MapPin size={18} color="#0F766E" />
        <Text style={styles.infoText}>
          During an active trip, Android keeps the ongoing “AAGAM delivery tracking active” notification visible through the foreground service.
        </Text>
      </View>

      {workspaceQuery.isLoading ? (
        <Loading text="Loading active delivery…" />
      ) : !activeJob ? (
        <EmptyState />
      ) : summaryQuery.isLoading ? (
        <Loading text="Loading delivery operations…" />
      ) : summaryQuery.error || !summary ? (
        <View style={styles.errorCard}>
          <AlertTriangle size={32} color="#B91C1C" />
          <Text style={styles.errorTitle}>Operations unavailable</Text>
          <Text style={styles.errorText}>{errorMessage(summaryQuery.error)}</Text>
        </View>
      ) : (
        <>
          <View style={styles.statusCard}>
            <View style={styles.flex}>
              <Text style={styles.cardEyebrow}>ORDER #{shortId(order?.id)}</Text>
              <Text style={styles.cardTitle}>{readable(summary.job.status)}</Text>
              <Text style={styles.cardText}>
                {order?.store?.name || 'AAGAM Store'} · {order?.customer?.name || 'Customer'}
              </Text>
            </View>
            <View style={styles.amountBox}>
              <Text style={styles.amountLabel}>{summary.cod.applicable ? 'COD' : 'PREPAID'}</Text>
              <Text style={styles.amount}>
                ₹{(Number(summary.cod.expectedAmountPaise || 0) / 100).toFixed(2)}
              </Text>
            </View>
          </View>

          {summary.cod.applicable ? (
            <Section
              icon={Banknote}
              title="Cash on delivery"
              text={summary.cod.collected ? 'Exact payment recorded' : 'Collect the exact order amount'}
              done={summary.cod.collected}
            >
              {policy.collectCod ? (
                <ActionButton
                  testID="rider_operations_record_cod_button"
                  label="Record exact COD collection"
                  busy={busy === 'cod'}
                  disabled={Boolean(busy)}
                  onPress={() =>
                    void perform(
                      'cod',
                      () =>
                        deliveryOperationsService.collectCod(activeJob.id, {
                          amountPaise: summary.cod.expectedAmountPaise,
                          collectionReference: 'CASH_RECEIVED_BY_RIDER',
                        }),
                      'COD collected',
                      'The exact cash amount is recorded in the COD ledger.',
                    )
                  }
                />
              ) : null}
            </Section>
          ) : null}

          <Section
            icon={KeyRound}
            title="Proof of delivery"
            text="Customer OTP + rider confirmation + live GPS"
            done={Boolean(recordedProof)}
          >
            {recordedProof ? (
              <View style={styles.proofCard}>
                <Text style={styles.proofTitle}>Auditable POD stored</Text>
                <Text style={styles.proofText}>
                  Method: {readable(recordedProof.details?.verificationMethod || 'CUSTOMER_OTP_PIN')}
                </Text>
                <Text style={styles.proofText}>
                  Verified: {new Date(recordedProof.details?.verifiedAt || recordedProof.createdAt).toLocaleString()}
                </Text>
                {recordedProof.details?.latitude != null ? (
                  <Text style={styles.proofText}>
                    GPS: {Number(recordedProof.details.latitude).toFixed(5)}, {Number(recordedProof.details.longitude).toFixed(5)} · ±{Math.round(Number(recordedProof.details.accuracyMetres || 0))}m
                  </Text>
                ) : null}
                {recordedProof.details?.note ? (
                  <Text style={styles.proofText}>Note: {recordedProof.details.note}</Text>
                ) : null}
              </View>
            ) : (
              <>
                {policy.issueOtp ? (
                  <ActionButton
                    testID="rider_operations_issue_otp_button"
                    label={summary.otp.issued ? 'Issue a fresh customer OTP' : 'Issue customer OTP'}
                    busy={busy === 'otp'}
                    disabled={Boolean(busy)}
                    secondary
                    onPress={() =>
                      void perform(
                        'otp',
                        () => deliveryOperationsService.issueOtp(activeJob.id),
                        'OTP issued',
                        'Ask the customer for the current 6-digit code.',
                      )
                    }
                  />
                ) : null}
                <TextInput
                  testID="rider_operations_otp_input"
                  style={styles.input}
                  value={otpCode}
                  onChangeText={(value) => setOtpCode(value.replace(/\D/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  placeholder="6-digit customer OTP"
                  placeholderTextColor="#94A3B8"
                  maxLength={6}
                />
                <TextInput
                  testID="rider_operations_pod_note_input"
                  style={[styles.input, styles.multiline]}
                  value={podNote}
                  onChangeText={setPodNote}
                  placeholder="Optional handoff note"
                  placeholderTextColor="#94A3B8"
                  multiline
                  maxLength={500}
                />
                <TouchableOpacity
                  testID="rider_operations_confirm_checkbox"
                  style={[styles.confirmRow, riderConfirmed && styles.confirmRowActive]}
                  onPress={() => setRiderConfirmed((value) => !value)}
                >
                  <View style={[styles.checkbox, riderConfirmed && styles.checkboxActive]}>
                    {riderConfirmed ? <CheckCircle2 size={18} color="#FFFFFF" /> : null}
                  </View>
                  <Text style={styles.confirmText}>
                    I confirm the parcel was physically handed to the customer.
                  </Text>
                </TouchableOpacity>
                {lastPodLocation ? (
                  <Text style={styles.locationText}>
                    Last GPS: {lastPodLocation.latitude.toFixed(5)}, {lastPodLocation.longitude.toFixed(5)}
                  </Text>
                ) : null}
                {policy.completeDelivery ? (
                  <ActionButton
                    testID="rider_operations_record_pod_button"
                    label="Verify OTP and record POD"
                    busy={busy === 'complete'}
                    disabled={Boolean(busy)}
                    onPress={recordPod}
                  />
                ) : (
                  <Text style={styles.helper}>
                    Arrive at the customer and collect required COD before recording POD.
                  </Text>
                )}
              </>
            )}
          </Section>

          {policy.recordFailure ? (
            <Section
              icon={PackageX}
              title="Delivery exception"
              text="Use the exact operational reason"
            >
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.reasonRow}
              >
                {DELIVERY_FAILURE_OPTIONS.map((option) => (
                  <TouchableOpacity
                    testID="rider_operations_failure_reason_chip"
                    key={option.value}
                    onPress={() => setFailureReason(option.value)}
                    style={[
                      styles.reasonChip,
                      failureReason === option.value && styles.reasonChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.reasonText,
                        failureReason === option.value && styles.reasonTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TextInput
                testID="rider_operations_failure_note_input"
                style={[styles.input, styles.multiline]}
                value={failureNote}
                onChangeText={setFailureNote}
                placeholder="What happened?"
                placeholderTextColor="#94A3B8"
                multiline
                maxLength={500}
              />
              <ActionButton
                testID="rider_operations_record_failure_button"
                label="Record failed delivery"
                busy={busy === 'failure'}
                disabled={Boolean(busy)}
                danger
                onPress={recordFailure}
              />
            </Section>
          ) : null}

          {policy.startReturn ? (
            <Section icon={RotateCcw} title="Return to store" text="Start tracked reverse logistics">
              <ActionButton
                testID="rider_operations_start_return_button"
                label="Start return to store"
                busy={busy === 'return'}
                disabled={Boolean(busy)}
                onPress={() =>
                  void perform(
                    'return',
                    () => deliveryOperationsService.startReturn(activeJob.id),
                    'Return started',
                    'Take the parcel to the assigned store for inspection.',
                  )
                }
              />
            </Section>
          ) : null}

          {policy.waitingForStoreReturn ? (
            <View style={styles.waitingCard}>
              <Clock3 size={22} color="#B45309" />
              <View style={styles.flex}>
                <Text style={styles.waitingTitle}>Store confirmation pending</Text>
                <Text style={styles.waitingText}>
                  Store staff must confirm and inspect the returned parcel.
                </Text>
              </View>
            </View>
          ) : null}
        </>
      )}
    </ScrollView>
  );
};

function Loading({ text }: { text: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color="#0F766E" />
      <Text style={styles.muted}>{text}</Text>
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.emptyCard}>
      <ShieldCheck size={48} color="#94A3B8" />
      <Text style={styles.emptyTitle}>No active delivery</Text>
      <Text style={styles.emptyText}>
        Accept an addressed offer from the Dashboard before using delivery operations.
      </Text>
    </View>
  );
}

function Section({
  icon: Icon,
  title,
  text,
  done = false,
  children,
}: {
  icon: any;
  title: string;
  text: string;
  done?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <Icon size={22} color="#0F766E" />
        <View style={styles.flex}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.sectionText}>{text}</Text>
        </View>
        {done ? <CheckCircle2 size={22} color="#15803D" /> : null}
      </View>
      {children}
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  busy,
  disabled,
  secondary,
  danger,
  testID,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  secondary?: boolean;
  danger?: boolean;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.button,
        secondary && styles.secondaryButton,
        danger && styles.dangerButton,
        disabled && styles.disabled,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={secondary ? '#0F766E' : '#FFFFFF'} />
      ) : (
        <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 18, paddingBottom: 44 },
  flex: { flex: 1 },
  hero: { borderRadius: 24, backgroundColor: '#0F172A', padding: 20, flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  eyebrow: { color: '#5EEAD4', fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  title: { marginTop: 6, color: '#FFFFFF', fontSize: 24, fontWeight: '900' },
  subtitle: { marginTop: 6, color: '#CBD5E1', fontSize: 13, lineHeight: 19 },
  refreshButton: { width: 44, height: 44, borderRadius: 16, backgroundColor: '#0F766E', alignItems: 'center', justifyContent: 'center', marginLeft: 12 },
  infoCard: { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 18, borderWidth: 1, borderColor: '#99F6E4', backgroundColor: '#F0FDFA', padding: 14, marginBottom: 14 },
  infoText: { flex: 1, marginLeft: 10, color: '#115E59', fontSize: 12, fontWeight: '700', lineHeight: 18 },
  center: { padding: 44, alignItems: 'center' },
  muted: { marginTop: 12, color: '#64748B', fontWeight: '700' },
  emptyCard: { alignItems: 'center', borderRadius: 24, backgroundColor: '#FFFFFF', padding: 36, borderWidth: 1, borderColor: '#E2E8F0' },
  emptyTitle: { marginTop: 14, fontSize: 20, fontWeight: '900', color: '#0F172A' },
  emptyText: { marginTop: 8, color: '#64748B', textAlign: 'center', lineHeight: 20 },
  errorCard: { borderRadius: 22, backgroundColor: '#FEF2F2', padding: 20, borderWidth: 1, borderColor: '#FECACA' },
  errorTitle: { marginTop: 10, color: '#991B1B', fontWeight: '900', fontSize: 18 },
  errorText: { marginTop: 6, color: '#B91C1C', lineHeight: 20 },
  statusCard: { borderRadius: 22, backgroundColor: '#FFFFFF', padding: 18, borderWidth: 1, borderColor: '#E2E8F0', flexDirection: 'row', marginBottom: 14 },
  cardEyebrow: { color: '#0F766E', fontSize: 11, fontWeight: '900' },
  cardTitle: { marginTop: 4, color: '#0F172A', fontSize: 20, fontWeight: '900' },
  cardText: { marginTop: 4, color: '#64748B', fontSize: 12 },
  amountBox: { borderRadius: 16, backgroundColor: '#F0FDFA', padding: 12, alignItems: 'flex-end', marginLeft: 12 },
  amountLabel: { color: '#0F766E', fontSize: 10, fontWeight: '900' },
  amount: { marginTop: 4, color: '#134E4A', fontSize: 18, fontWeight: '900' },
  sectionCard: { borderRadius: 22, backgroundColor: '#FFFFFF', padding: 18, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 14 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { marginLeft: 12, color: '#0F172A', fontSize: 17, fontWeight: '900' },
  sectionText: { marginTop: 3, marginLeft: 12, color: '#64748B', fontSize: 12, lineHeight: 17 },
  input: { borderRadius: 14, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', paddingHorizontal: 14, paddingVertical: 12, color: '#0F172A', fontWeight: '700', marginBottom: 10 },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  button: { minHeight: 48, borderRadius: 14, backgroundColor: '#0F766E', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginTop: 4 },
  buttonText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14 },
  secondaryButton: { backgroundColor: '#F0FDFA', borderWidth: 1, borderColor: '#5EEAD4' },
  secondaryButtonText: { color: '#0F766E' },
  dangerButton: { backgroundColor: '#B91C1C' },
  disabled: { opacity: 0.5 },
  confirmRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: '#CBD5E1', padding: 12, marginBottom: 10 },
  confirmRowActive: { borderColor: '#14B8A6', backgroundColor: '#F0FDFA' },
  checkbox: { width: 24, height: 24, borderRadius: 8, borderWidth: 2, borderColor: '#94A3B8', alignItems: 'center', justifyContent: 'center' },
  checkboxActive: { borderColor: '#0F766E', backgroundColor: '#0F766E' },
  confirmText: { flex: 1, marginLeft: 10, color: '#334155', fontSize: 12, fontWeight: '800', lineHeight: 18 },
  locationText: { color: '#0F766E', fontSize: 11, fontWeight: '800', marginBottom: 10 },
  helper: { color: '#92400E', backgroundColor: '#FFFBEB', padding: 12, borderRadius: 12, fontSize: 12, fontWeight: '700' },
  proofCard: { borderRadius: 16, backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0', padding: 14 },
  proofTitle: { color: '#166534', fontSize: 15, fontWeight: '900' },
  proofText: { marginTop: 5, color: '#15803D', fontSize: 12, lineHeight: 17 },
  reasonRow: { paddingBottom: 10 },
  reasonChip: { borderRadius: 999, borderWidth: 1, borderColor: '#CBD5E1', paddingHorizontal: 12, paddingVertical: 9, marginRight: 8 },
  reasonChipActive: { borderColor: '#B91C1C', backgroundColor: '#FEF2F2' },
  reasonText: { color: '#475569', fontSize: 12, fontWeight: '800' },
  reasonTextActive: { color: '#991B1B' },
  waitingCard: { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 20, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', padding: 16 },
  waitingTitle: { marginLeft: 12, color: '#92400E', fontSize: 15, fontWeight: '900' },
  waitingText: { marginTop: 4, marginLeft: 12, color: '#B45309', fontSize: 12, lineHeight: 18 },
});
