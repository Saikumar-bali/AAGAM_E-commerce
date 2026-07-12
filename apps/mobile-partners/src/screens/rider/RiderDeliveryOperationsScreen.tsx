import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Clock3,
  KeyRound,
  PackageX,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
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

function errorMessage(error: any) {
  const message = error?.response?.data?.message;
  if (Array.isArray(message)) return message.join(', ');
  return message || error?.message || 'The operation could not be completed.';
}

function shortId(value?: string | null) {
  return value ? value.slice(-8).toUpperCase() : 'UNKNOWN';
}

function label(value?: string | null) {
  return String(value || 'UNKNOWN').replaceAll('_', ' ');
}

export const RiderDeliveryOperationsScreen = () => {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [failureReason, setFailureReason] = useState<DeliveryFailureReason>('CUSTOMER_UNAVAILABLE');
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

  const refresh = async () => {
    await workspaceQuery.refetch();
    if (activeJob?.id) await summaryQuery.refetch();
  };

  const perform = async (
    key: string,
    task: () => Promise<any>,
    successTitle: string,
    successMessage: string,
  ) => {
    if (busy) return;
    setBusy(key);
    try {
      await task();
      setOtpCode('');
      setFailureNote('');
      await queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY });
      await queryClient.invalidateQueries({ queryKey: SUMMARY_KEY });
      Alert.alert(successTitle, successMessage);
    } catch (error: any) {
      Alert.alert('Operation failed', errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const confirmFailure = () => {
    if (!activeJob) return;
    const selected = DELIVERY_FAILURE_OPTIONS.find((option) => option.value === failureReason);
    Alert.alert(
      'Record delivery failure?',
      `${selected?.label || 'Delivery failure'} will move this job to the exception workflow.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Record failure',
          style: 'destructive',
          onPress: () => void perform(
            'failure',
            () => deliveryOperationsService.recordFailure(activeJob.id, {
              reason: failureReason,
              note: failureNote.trim() || undefined,
            }),
            'Failure recorded',
            'Start the return when the parcel is ready to go back to the store.',
          ),
        },
      ],
    );
  };

  const completeDelivery = () => {
    if (!activeJob || !summary) return;
    if (summary.requirements.deliveryOtpRequired && otpCode.trim().length !== 6) {
      Alert.alert('Enter the customer code', 'A valid 6-digit delivery OTP is required.');
      return;
    }
    Alert.alert('Complete delivery?', 'This permanently marks the canonical delivery job as delivered.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Complete',
        onPress: () => void perform(
          'complete',
          () => deliveryOperationsService.completeDelivery(activeJob.id, {
            otpCode: otpCode.trim() || undefined,
            proofType: otpCode.trim() ? 'CUSTOMER_OTP' : 'RIDER_CONFIRMATION',
          }),
          'Delivery completed',
          'The order and delivery job are now complete.',
        ),
      },
    ]);
  };

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={workspaceQuery.isRefetching || summaryQuery.isRefetching} onRefresh={() => void refresh()} />}
    >
      <View style={styles.hero}>
        <View>
          <Text style={styles.eyebrow}>RIDER OPERATIONS</Text>
          <Text style={styles.title}>Handoff & exceptions</Text>
          <Text style={styles.subtitle}>OTP, COD, failed delivery, and return-to-store actions</Text>
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={() => void refresh()}>
          <RefreshCw size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {workspaceQuery.isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#0F766E" /><Text style={styles.muted}>Loading active delivery…</Text></View>
      ) : !activeJob ? (
        <View style={styles.emptyCard}>
          <ShieldCheck size={48} color="#94A3B8" />
          <Text style={styles.emptyTitle}>No active delivery</Text>
          <Text style={styles.emptyText}>Accept an addressed offer from the Dashboard before using delivery operations.</Text>
        </View>
      ) : summaryQuery.isLoading ? (
        <View style={styles.center}><ActivityIndicator color="#0F766E" /><Text style={styles.muted}>Loading operation state…</Text></View>
      ) : summaryQuery.error || !summary ? (
        <View style={styles.errorCard}>
          <AlertTriangle size={34} color="#B91C1C" />
          <Text style={styles.errorTitle}>Operations unavailable</Text>
          <Text style={styles.errorText}>{errorMessage(summaryQuery.error)}</Text>
        </View>
      ) : (
        <>
          <View style={styles.statusCard}>
            <View>
              <Text style={styles.cardEyebrow}>ORDER #{shortId(order?.id)}</Text>
              <Text style={styles.cardTitle}>{label(summary.job.status)}</Text>
              <Text style={styles.cardSub}>{order?.store?.name || 'AAGAM Store'} · {order?.customer?.name || 'Customer'}</Text>
            </View>
            <View style={styles.amountBox}>
              <Text style={styles.amountLabel}>{summary.cod.applicable ? 'COD' : 'PREPAID'}</Text>
              <Text style={styles.amount}>₹{(Number(summary.cod.expectedAmountPaise || 0) / 100).toFixed(2)}</Text>
            </View>
          </View>

          {summary.cod.applicable ? (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Banknote size={22} color="#0F766E" />
                <View style={styles.sectionCopy}>
                  <Text style={styles.sectionTitle}>Cash on delivery</Text>
                  <Text style={styles.sectionText}>{summary.cod.collected ? 'Exact payment recorded' : 'Collect the exact order amount'}</Text>
                </View>
                {summary.cod.collected ? <CheckCircle2 size={22} color="#15803D" /> : null}
              </View>
              {policy.collectCod ? (
                <TouchableOpacity
                  style={[styles.primaryButton, busy && styles.disabled]}
                  disabled={Boolean(busy)}
                  onPress={() => void perform(
                    'cod',
                    () => deliveryOperationsService.collectCod(activeJob.id, {
                      amountPaise: summary.cod.expectedAmountPaise,
                      collectionReference: 'CASH_RECEIVED_BY_RIDER',
                    }),
                    'COD collected',
                    'The exact cash amount is recorded. Keep it secure until settlement.',
                  )}
                >
                  {busy === 'cod' ? <ActivityIndicator color="#FFFFFF" /> : <Banknote size={18} color="#FFFFFF" />}
                  <Text style={styles.primaryText}>Confirm ₹{(summary.cod.expectedAmountPaise / 100).toFixed(2)} collected</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          {policy.issueOtp ? (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <KeyRound size={22} color="#7C3AED" />
                <View style={styles.sectionCopy}>
                  <Text style={styles.sectionTitle}>Customer verification</Text>
                  <Text style={styles.sectionText}>{summary.otp.issued ? 'Code is active in the customer order screen' : 'Issue a short-lived customer code'}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.secondaryButton, busy && styles.disabled]}
                disabled={Boolean(busy)}
                onPress={() => void perform(
                  'otp',
                  () => deliveryOperationsService.issueOtp(activeJob.id),
                  'Code issued',
                  'Ask the customer to open the order and read the 6-digit code.',
                )}
              >
                {busy === 'otp' ? <ActivityIndicator color="#6D28D9" /> : <KeyRound size={18} color="#6D28D9" />}
                <Text style={styles.secondaryText}>{summary.otp.issued ? 'Issue a new code' : 'Issue delivery code'}</Text>
              </TouchableOpacity>
              <TextInput
                value={otpCode}
                onChangeText={(value) => setOtpCode(value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Enter customer’s 6-digit code"
                keyboardType="number-pad"
                maxLength={6}
                style={styles.otpInput}
                placeholderTextColor="#94A3B8"
              />
              <Text style={styles.helperText}>The app never displays or stores the plaintext code for the rider.</Text>
            </View>
          ) : null}

          {policy.completeDelivery ? (
            <TouchableOpacity
              style={[styles.completeButton, busy && styles.disabled]}
              disabled={Boolean(busy)}
              onPress={completeDelivery}
            >
              {busy === 'complete' ? <ActivityIndicator color="#FFFFFF" /> : <CheckCircle2 size={20} color="#FFFFFF" />}
              <Text style={styles.completeText}>Complete verified delivery</Text>
            </TouchableOpacity>
          ) : null}

          {policy.recordFailure ? (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <PackageX size={22} color="#B91C1C" />
                <View style={styles.sectionCopy}>
                  <Text style={styles.sectionTitle}>Delivery problem</Text>
                  <Text style={styles.sectionText}>Choose an honest reason. This creates a permanent audit record.</Text>
                </View>
              </View>
              <View style={styles.chipGrid}>
                {DELIVERY_FAILURE_OPTIONS.map((option) => {
                  const selected = failureReason === option.value;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      style={[styles.reasonChip, selected && styles.reasonChipSelected]}
                      onPress={() => setFailureReason(option.value)}
                    >
                      <Text style={[styles.reasonText, selected && styles.reasonTextSelected]}>{option.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TextInput
                value={failureNote}
                onChangeText={setFailureNote}
                placeholder="Optional factual note"
                multiline
                maxLength={500}
                style={styles.noteInput}
                placeholderTextColor="#94A3B8"
              />
              <TouchableOpacity
                style={[styles.dangerButton, busy && styles.disabled]}
                disabled={Boolean(busy)}
                onPress={confirmFailure}
              >
                {busy === 'failure' ? <ActivityIndicator color="#FFFFFF" /> : <AlertTriangle size={18} color="#FFFFFF" />}
                <Text style={styles.dangerText}>Record failed attempt</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {policy.startReturn ? (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <RotateCcw size={22} color="#B45309" />
                <View style={styles.sectionCopy}>
                  <Text style={styles.sectionTitle}>Return parcel to store</Text>
                  <Text style={styles.sectionText}>Start this only when the failed parcel is physically with you.</Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.warningButton, busy && styles.disabled]}
                disabled={Boolean(busy)}
                onPress={() => Alert.alert('Start return?', 'The store must confirm physical receipt before this job closes.', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Start return',
                    onPress: () => void perform(
                      'return',
                      () => deliveryOperationsService.startReturn(activeJob.id),
                      'Return started',
                      'Navigate back to the store. The store will confirm receipt.',
                    ),
                  },
                ])}
              >
                {busy === 'return' ? <ActivityIndicator color="#FFFFFF" /> : <RotateCcw size={18} color="#FFFFFF" />}
                <Text style={styles.warningText}>Start return to store</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {policy.waitingForStoreReturn ? (
            <View style={styles.waitingCard}>
              <Clock3 size={24} color="#92400E" />
              <View style={styles.sectionCopy}>
                <Text style={styles.waitingTitle}>Waiting for store confirmation</Text>
                <Text style={styles.waitingText}>Hand the parcel to the store. Your rider status is released after the store confirms receipt.</Text>
              </View>
            </View>
          ) : null}

          <View style={styles.auditCard}>
            <Text style={styles.auditTitle}>Recent operation audit</Text>
            {summary.operations.length === 0 ? <Text style={styles.muted}>No Phase 3 operations recorded yet.</Text> : summary.operations.slice(0, 8).map((operation) => (
              <View key={operation.id} style={styles.auditRow}>
                <View style={styles.auditDot} />
                <View style={styles.auditCopy}>
                  <Text style={styles.auditType}>{label(operation.type)}</Text>
                  <Text style={styles.auditMeta}>{operation.actorRole || 'SYSTEM'} · {new Date(operation.createdAt).toLocaleString()}</Text>
                </View>
                <Text style={styles.auditStatus}>{operation.status}</Text>
              </View>
            ))}
          </View>
        </>
      )}
      <View style={{ height: 100 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { paddingBottom: 20 },
  hero: { backgroundColor: '#0F172A', paddingTop: 56, paddingHorizontal: 20, paddingBottom: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  eyebrow: { color: '#5EEAD4', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: '#FFFFFF', fontSize: 27, fontWeight: '900', marginTop: 5 },
  subtitle: { color: '#CBD5E1', fontSize: 12, marginTop: 5, maxWidth: 270 },
  refreshButton: { width: 44, height: 44, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  center: { minHeight: 280, alignItems: 'center', justifyContent: 'center', gap: 12 },
  muted: { color: '#64748B', fontSize: 13 },
  emptyCard: { margin: 20, minHeight: 250, borderRadius: 26, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center', padding: 28 },
  emptyTitle: { marginTop: 14, color: '#0F172A', fontSize: 19, fontWeight: '900' },
  emptyText: { marginTop: 7, color: '#64748B', fontSize: 13, lineHeight: 20, textAlign: 'center' },
  errorCard: { margin: 20, borderRadius: 24, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2', padding: 24, alignItems: 'center' },
  errorTitle: { color: '#991B1B', fontSize: 18, fontWeight: '900', marginTop: 10 },
  errorText: { color: '#B91C1C', textAlign: 'center', marginTop: 7 },
  statusCard: { margin: 20, marginBottom: 0, backgroundColor: '#FFFFFF', borderRadius: 24, padding: 18, borderWidth: 1, borderColor: '#E2E8F0', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardEyebrow: { color: '#0F766E', fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  cardTitle: { color: '#0F172A', fontSize: 18, fontWeight: '900', marginTop: 5 },
  cardSub: { color: '#64748B', fontSize: 12, marginTop: 4, maxWidth: 210 },
  amountBox: { alignItems: 'flex-end' },
  amountLabel: { color: '#B45309', fontSize: 10, fontWeight: '900' },
  amount: { color: '#0F172A', fontSize: 18, fontWeight: '900', marginTop: 3 },
  sectionCard: { marginHorizontal: 20, marginTop: 14, backgroundColor: '#FFFFFF', borderRadius: 24, padding: 18, borderWidth: 1, borderColor: '#E2E8F0' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  sectionCopy: { flex: 1 },
  sectionTitle: { color: '#0F172A', fontSize: 16, fontWeight: '900' },
  sectionText: { color: '#64748B', fontSize: 12, lineHeight: 18, marginTop: 3 },
  primaryButton: { minHeight: 50, borderRadius: 15, backgroundColor: '#0F766E', marginTop: 16, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  primaryText: { color: '#FFFFFF', fontWeight: '900', fontSize: 13, textAlign: 'center' },
  secondaryButton: { minHeight: 48, borderRadius: 15, backgroundColor: '#F5F3FF', borderWidth: 1, borderColor: '#DDD6FE', marginTop: 16, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: '#6D28D9', fontWeight: '900' },
  otpInput: { height: 56, borderRadius: 16, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC', marginTop: 12, paddingHorizontal: 16, color: '#0F172A', fontSize: 20, fontWeight: '900', letterSpacing: 3, textAlign: 'center' },
  helperText: { color: '#94A3B8', fontSize: 10, lineHeight: 15, marginTop: 7 },
  completeButton: { minHeight: 56, marginHorizontal: 20, marginTop: 14, borderRadius: 18, backgroundColor: '#15803D', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  completeText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 15 },
  reasonChip: { borderRadius: 999, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC', paddingHorizontal: 12, paddingVertical: 9 },
  reasonChipSelected: { backgroundColor: '#991B1B', borderColor: '#991B1B' },
  reasonText: { color: '#475569', fontSize: 11, fontWeight: '800' },
  reasonTextSelected: { color: '#FFFFFF' },
  noteInput: { minHeight: 78, borderRadius: 15, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC', marginTop: 12, padding: 13, color: '#0F172A', textAlignVertical: 'top' },
  dangerButton: { minHeight: 50, borderRadius: 15, backgroundColor: '#B91C1C', marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  dangerText: { color: '#FFFFFF', fontWeight: '900' },
  warningButton: { minHeight: 50, borderRadius: 15, backgroundColor: '#B45309', marginTop: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  warningText: { color: '#FFFFFF', fontWeight: '900' },
  waitingCard: { marginHorizontal: 20, marginTop: 14, borderRadius: 22, borderWidth: 1, borderColor: '#FDE68A', backgroundColor: '#FFFBEB', padding: 17, flexDirection: 'row', alignItems: 'center', gap: 12 },
  waitingTitle: { color: '#92400E', fontWeight: '900' },
  waitingText: { color: '#A16207', fontSize: 12, lineHeight: 18, marginTop: 3 },
  auditCard: { marginHorizontal: 20, marginTop: 14, backgroundColor: '#FFFFFF', borderRadius: 24, padding: 18, borderWidth: 1, borderColor: '#E2E8F0' },
  auditTitle: { color: '#0F172A', fontSize: 16, fontWeight: '900', marginBottom: 10 },
  auditRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  auditDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#14B8A6', marginRight: 10 },
  auditCopy: { flex: 1 },
  auditType: { color: '#334155', fontSize: 12, fontWeight: '900' },
  auditMeta: { color: '#94A3B8', fontSize: 10, marginTop: 2 },
  auditStatus: { color: '#64748B', fontSize: 9, fontWeight: '900' },
  disabled: { opacity: 0.5 },
});
