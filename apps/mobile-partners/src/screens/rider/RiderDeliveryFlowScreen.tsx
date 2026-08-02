import { useNavigation } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Geolocation from 'react-native-geolocation-service';
import {
  AlertTriangle,
  Bell,
  Check,
  CheckCircle2,
  IndianRupee,
  KeyRound,
  MapPin,
  Navigation,
  PackageCheck,
  Phone,
  RefreshCw,
  RotateCcw,
  Store,
} from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import {
  DeliveryFailureReason,
  deliveryOperationsService,
} from '../../api/deliveryOperationsService';
import { notificationService } from '../../api/notificationService';
import { riderService } from '../../api/riderService';
import {
  DELIVERY_FAILURE_OPTIONS,
  riderOperationPolicy,
} from '../../domain/deliveryOperations';
import {
  DeliveryJobStatus,
  deliveryStatusLabel,
  nextActionForStatus,
} from '../../domain/riderWorkspace';
import { PARTNER_NOTIFICATION_QUERY_KEY } from '../PartnerNotificationsScreen';

const WORKSPACE_KEY = ['rider', 'delivery-workspace'] as const;
const SUMMARY_KEY = ['rider', 'delivery-operations'] as const;
const EARNINGS_KEY = ['rider', 'earnings'] as const;

function errorMessage(error: any) {
  const value = error?.response?.data?.message;
  if (Array.isArray(value)) return value.join(', ');
  return value || error?.message || 'The delivery operation could not be completed.';
}

function capturePodLocation() {
  return new Promise<{ latitude: number; longitude: number; accuracyMetres?: number } | null>((resolve) => {
    Geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMetres: position.coords.accuracy,
      }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 5_000 },
    );
  });
}

function progressIndex(status: DeliveryJobStatus) {
  if (status === 'DELIVERED') return 3;
  if (
    status === 'OUT_FOR_DELIVERY'
    || status === 'RIDER_AT_CUSTOMER'
    || status === 'DELIVERY_FAILED'
    || status === 'RETURNING_TO_STORE'
  ) return 2;
  if (status === 'PICKUP_VERIFIED') return 1;
  return 0;
}

function shortId(value?: string | null) {
  return value ? value.slice(-8).toUpperCase() : 'UNKNOWN';
}

function deliveryAddress(job: any) {
  return [
    job?.order?.addressSnapshot?.line1,
    job?.order?.addressSnapshot?.landmark,
    job?.order?.addressSnapshot?.city,
  ].filter(Boolean).join(', ') || 'Delivery address unavailable';
}

export const RiderDeliveryFlowScreen = () => {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [podNote, setPodNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [failureReason, setFailureReason] = useState<DeliveryFailureReason>('CUSTOMER_UNREACHABLE');
  const [failureNote, setFailureNote] = useState('');
  const [showFailure, setShowFailure] = useState(false);

  const workspaceQuery = useQuery({
    queryKey: WORKSPACE_KEY,
    queryFn: riderService.getWorkspace,
    refetchInterval: 8_000,
    retry: 1,
  });
  const activeJob = workspaceQuery.data?.activeJob || null;
  const summaryQuery = useQuery({
    queryKey: [...SUMMARY_KEY, activeJob?.id],
    queryFn: () => deliveryOperationsService.getSummary(activeJob!.id),
    enabled: Boolean(activeJob?.id),
    refetchInterval: activeJob ? 10_000 : false,
    retry: 1,
  });
  const inboxQuery = useQuery({
    queryKey: PARTNER_NOTIFICATION_QUERY_KEY,
    queryFn: () => notificationService.getInbox(1),
    refetchInterval: 15_000,
    retry: 1,
  });

  const summary = summaryQuery.data || null;
  const policy = useMemo(() => riderOperationPolicy(summary), [summary]);
  const nextAction = activeJob ? nextActionForStatus(activeJob.status) : null;
  const unreadCount = Number(inboxQuery.data?.unreadCount || 0);
  const expectedCod = Number(summary?.cod?.expectedAmountPaise || 0);
  const returningToStore = activeJob?.status === 'RETURNING_TO_STORE';
  const headingToStore = Boolean(
    activeJob
    && (returningToStore || ['RIDER_ASSIGNED', 'RIDER_EN_ROUTE_TO_STORE'].includes(activeJob.status)),
  );
  const customerName = activeJob?.order.customer?.name
    || activeJob?.order.addressSnapshot?.recipientName
    || 'Customer';
  const customerPhone = activeJob?.order.customer?.phone
    || activeJob?.order.addressSnapshot?.phoneE164
    || null;
  const storePhone = (activeJob?.order.store as any)?.owner?.phone || null;
  const destinationName = headingToStore
    ? activeJob?.order.store?.name || 'Pickup store'
    : customerName;
  const destinationPhone = headingToStore ? storePhone : customerPhone;
  const destinationAddress = headingToStore
    ? activeJob?.order.store?.address || 'Store address unavailable'
    : deliveryAddress(activeJob);

  const refresh = async () => {
    await workspaceQuery.refetch();
    if (activeJob?.id) await summaryQuery.refetch();
    await inboxQuery.refetch();
  };

  const perform = async (
    key: string,
    task: () => Promise<unknown>,
    title: string,
    text: string,
  ) => {
    if (busy) return;
    setBusy(key);
    try {
      await task();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY }),
        queryClient.invalidateQueries({ queryKey: SUMMARY_KEY }),
        queryClient.invalidateQueries({ queryKey: EARNINGS_KEY }),
      ]);
      Toast.show({ type: 'success', text1: title, text2: text });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Operation failed', text2: errorMessage(error) });
    } finally {
      setBusy(null);
    }
  };

  const transition = () => {
    if (!activeJob || !nextAction) return;
    Alert.alert(nextAction.label, nextAction.confirmation, [
      { text: 'Back', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: () => void perform(
          `transition-${nextAction.action}`,
          () => riderService.transitionJob(activeJob.id, nextAction.action),
          nextAction.label,
          'The delivery timeline has been updated.',
        ),
      },
    ]);
  };

  const issueOtp = () => {
    if (!activeJob) return;
    void perform(
      'otp',
      () => deliveryOperationsService.issueOtp(activeJob.id),
      'Customer OTP issued',
      'Ask the customer for the new six-digit code.',
    );
  };

  const collectCod = () => {
    if (!activeJob || expectedCod <= 0) return;
    Alert.alert(
      'Confirm cash collection?',
      `Confirm collection of ₹${(expectedCod / 100).toFixed(2)} from the customer.`,
      [
        { text: 'Back', style: 'cancel' },
        {
          text: 'Cash collected',
          onPress: () => void perform(
            'cod',
            () => deliveryOperationsService.collectCod(activeJob.id, { amountPaise: expectedCod }),
            'COD recorded',
            'The rider cash ledger has been updated.',
          ),
        },
      ],
    );
  };

  const completeDelivery = () => {
    if (!activeJob || !summary) return;
    if (!/^\d{6}$/.test(otpCode)) {
      Toast.show({ type: 'error', text1: 'Enter the customer OTP', text2: 'A complete six-digit code is required.' });
      return;
    }
    if (!confirmed) {
      Toast.show({ type: 'error', text1: 'Confirm the handoff', text2: 'Confirm that the parcel was handed to the customer.' });
      return;
    }

    Alert.alert(
      'Complete delivery?',
      'The OTP and rider confirmation are required. GPS evidence is attached when available, but a denied location will not block a valid handoff.',
      [
        { text: 'Back', style: 'cancel' },
        {
          text: 'Complete delivery',
          onPress: () => void perform(
            'complete',
            async () => {
              const location = await capturePodLocation();
              await deliveryOperationsService.completeDelivery(activeJob.id, {
                otpCode,
                proofType: 'CUSTOMER_OTP_PIN',
                riderConfirmed: true,
                note: podNote.trim() || undefined,
                ...(location || {}),
              });
              setOtpCode('');
              setPodNote('');
              setConfirmed(false);
            },
            'Delivery completed',
            'Proof of delivery has been recorded securely.',
          ),
        },
      ],
    );
  };

  const recordFailure = () => {
    if (!activeJob) return;
    if (failureReason === 'OTHER' && failureNote.trim().length < 3) {
      Toast.show({ type: 'error', text1: 'Failure details required', text2: 'Add a brief note when selecting Other.' });
      return;
    }
    Alert.alert('Record delivery failure?', 'This starts the exception and return workflow.', [
      { text: 'Back', style: 'cancel' },
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
          'The exact reason is stored for operations review.',
        ),
      },
    ]);
  };

  if (workspaceQuery.isLoading) return <Loading label="Loading active delivery…" />;
  if (workspaceQuery.isError) {
    return (
      <WorkspaceError
        error={workspaceQuery.error}
        onRetry={() => void workspaceQuery.refetch()}
      />
    );
  }
  if (!activeJob) return <Empty onRefresh={() => void refresh()} />;

  const step = progressIndex(activeJob.status);
  const completionDisabled = busy !== null
    || !policy.completeDelivery
    || !/^\d{6}$/.test(otpCode)
    || !confirmed;

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#067B5C" />
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>ACTIVE DELIVERY</Text>
          <Text style={styles.headerTitle}>{deliveryStatusLabel(activeJob.status)}</Text>
        </View>
        <TouchableOpacity style={styles.headerButton} onPress={() => void refresh()}>
          <RefreshCw size={20} color="#FFFFFF" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerButton} onPress={() => navigation.navigate('Alerts')}>
          <Bell size={22} color="#FFFFFF" />
          {unreadCount > 0 ? (
            <View style={styles.notificationBadge}>
              <Text style={styles.notificationBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.progressCard}>
          {['Accepted', 'Picked up', 'On the way', 'Delivered'].map((label, index) => {
            const done = index < step || activeJob.status === 'DELIVERED';
            const active = index === step && activeJob.status !== 'DELIVERED';
            return (
              <React.Fragment key={label}>
                <View style={styles.stepItem}>
                  <View style={[styles.stepDot, done && styles.stepDone, active && styles.stepActive]}>
                    {done ? <Check size={17} color="#FFFFFF" strokeWidth={3} /> : active ? <Navigation size={15} color="#FFFFFF" /> : null}
                  </View>
                  <Text style={[styles.stepLabel, (done || active) && styles.stepLabelActive]}>{label}</Text>
                </View>
                {index < 3 ? <View style={[styles.stepLine, index < step && styles.stepLineDone]} /> : null}
              </React.Fragment>
            );
          })}
        </View>

        <View style={styles.destinationCard}>
          <View style={styles.avatar}>
            {headingToStore
              ? <Store size={24} color="#0F766E" />
              : <Text style={styles.avatarText}>{destinationName.slice(0, 1).toUpperCase()}</Text>}
          </View>
          <View style={styles.flex}>
            <Text style={styles.destinationLabel}>{returningToStore ? 'RETURN STORE' : headingToStore ? 'PICKUP STORE' : 'DELIVER TO'}</Text>
            <Text style={styles.destinationName}>{destinationName}</Text>
            <Text style={styles.address}>{destinationAddress}</Text>
            <Text style={styles.orderCode}>Order #{shortId(activeJob.order.id)}</Text>
          </View>
          <TouchableOpacity
            style={[styles.callButton, !destinationPhone && styles.callButtonDisabled]}
            disabled={!destinationPhone}
            onPress={() => destinationPhone
              ? void Linking.openURL(`tel:${destinationPhone}`)
              : undefined}
          >
            <Phone size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {policy.waitingForStoreReturn ? (
          <View style={styles.locationNote}>
            <Store size={18} color="#0F766E" />
            <Text style={styles.locationNoteText}>Return this parcel to the owning store shown above. Store verification will complete the return.</Text>
          </View>
        ) : null}

        {summaryQuery.isError ? (
          <View style={styles.errorCard}>
            <AlertTriangle size={24} color="#B91C1C" />
            <View style={styles.flex}>
              <Text style={styles.errorTitle}>Delivery gates unavailable</Text>
              <Text style={styles.errorText}>{errorMessage(summaryQuery.error)}</Text>
            </View>
          </View>
        ) : null}

        {nextAction ? (
          <PrimaryButton
            testID="rider_delivery_next_action"
            label={nextAction.label}
            busy={busy?.startsWith('transition')}
            disabled={Boolean(busy)}
            onPress={transition}
          />
        ) : null}

        {activeJob.status === 'RIDER_AT_CUSTOMER' && summary ? (
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <KeyRound size={21} color="#0F766E" />
              <Text style={styles.sectionTitle}>Customer verification</Text>
            </View>
            <Text style={styles.hint}>Issue an OTP, collect COD when required, then complete delivery.</Text>
            <TouchableOpacity
              testID="rider_issue_delivery_otp"
              style={styles.secondaryButton}
              disabled={!policy.issueOtp || Boolean(busy)}
              onPress={issueOtp}
            >
              {busy === 'otp' ? <ActivityIndicator color="#0F766E" /> : <KeyRound size={18} color="#0F766E" />}
              <Text style={styles.secondaryText}>{summary.otp.issued ? 'Issue new OTP' : 'Issue customer OTP'}</Text>
            </TouchableOpacity>
            {policy.collectCod ? (
              <TouchableOpacity testID="rider_collect_cod" style={styles.codButton} disabled={Boolean(busy)} onPress={collectCod}>
                {busy === 'cod' ? <ActivityIndicator color="#92400E" /> : <IndianRupee size={18} color="#92400E" />}
                <Text style={styles.codText}>Record ₹{(expectedCod / 100).toFixed(2)} cash collection</Text>
              </TouchableOpacity>
            ) : null}
            {summary.cod.applicable && summary.cod.collected ? (
              <View style={styles.successStrip}><CheckCircle2 size={18} color="#166534" /><Text style={styles.successText}>COD collection recorded</Text></View>
            ) : null}
            <TextInput
              testID="rider_delivery_otp"
              value={otpCode}
              onChangeText={(value) => setOtpCode(value.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="6-digit customer OTP"
              placeholderTextColor="#94A3B8"
              style={[styles.input, styles.otpInput]}
            />
            <TextInput
              testID="rider_delivery_note"
              value={podNote}
              onChangeText={setPodNote}
              placeholder="Optional handoff note"
              placeholderTextColor="#94A3B8"
              style={styles.input}
            />
            <TouchableOpacity testID="rider_confirm_handoff" style={styles.confirmRow} onPress={() => setConfirmed((value) => !value)}>
              <View style={[styles.checkbox, confirmed && styles.checkboxChecked]}>
                {confirmed ? <Check size={16} color="#FFFFFF" /> : null}
              </View>
              <Text style={styles.confirmText}>Parcel handed to the customer</Text>
            </TouchableOpacity>
            <View style={styles.locationNote}>
              <MapPin size={17} color="#0F766E" />
              <Text style={styles.locationNoteText}>GPS evidence is optional. A denied permission or temporary location failure will not block a valid OTP handoff.</Text>
            </View>
            <PrimaryButton
              testID="rider_complete_delivery"
              label="Complete delivery"
              busy={busy === 'complete'}
              disabled={completionDisabled}
              onPress={completeDelivery}
            />
          </View>
        ) : null}

        {policy.startReturn ? (
          <PrimaryButton
            testID="rider_start_return"
            label="Start return to store"
            busy={busy === 'return'}
            disabled={Boolean(busy)}
            onPress={() => void perform(
              'return',
              () => deliveryOperationsService.startReturn(activeJob.id),
              'Return started',
              'Navigate back to the owning store.',
            )}
          />
        ) : null}

        {policy.recordFailure ? (
          <View style={styles.failureCard}>
            <TouchableOpacity style={styles.failureHeader} onPress={() => setShowFailure((value) => !value)}>
              <AlertTriangle size={20} color="#B91C1C" />
              <View style={styles.flex}>
                <Text style={styles.failureTitle}>Unable to deliver?</Text>
                <Text style={styles.failureText}>Record the exact reason before leaving.</Text>
              </View>
              <Text style={styles.failureToggle}>{showFailure ? 'Close' : 'Report'}</Text>
            </TouchableOpacity>
            {showFailure ? (
              <View style={styles.failureBody}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reasonRail}>
                  {DELIVERY_FAILURE_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option.value}
                      style={[styles.reasonChip, failureReason === option.value && styles.reasonChipSelected]}
                      onPress={() => setFailureReason(option.value)}
                    >
                      <Text style={[styles.reasonText, failureReason === option.value && styles.reasonTextSelected]}>{option.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <TextInput
                  value={failureNote}
                  onChangeText={setFailureNote}
                  multiline
                  placeholder="Add operational details"
                  placeholderTextColor="#94A3B8"
                  style={[styles.input, styles.multiline]}
                />
                <TouchableOpacity testID="rider_record_failure" style={styles.failureButton} disabled={Boolean(busy)} onPress={recordFailure}>
                  {busy === 'failure' ? <ActivityIndicator color="#FFFFFF" /> : <RotateCcw size={18} color="#FFFFFF" />}
                  <Text style={styles.failureButtonText}>Record failed delivery</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        ) : null}
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
};

function PrimaryButton({
  label,
  onPress,
  busy,
  disabled,
  testID,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      testID={testID}
      disabled={busy || disabled}
      onPress={onPress}
      style={[styles.primaryButton, (busy || disabled) && styles.disabled]}
    >
      {busy ? <ActivityIndicator color="#FFFFFF" /> : <PackageCheck size={20} color="#FFFFFF" />}
      <Text style={styles.primaryText}>{label}</Text>
    </TouchableOpacity>
  );
}

function Loading({ label }: { label: string }) {
  return <View style={styles.loading}><ActivityIndicator size="large" color="#0F766E" /><Text style={styles.hint}>{label}</Text></View>;
}

function WorkspaceError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <View style={styles.loading}>
      <AlertTriangle size={48} color="#B91C1C" />
      <Text style={styles.emptyTitle}>Delivery workspace unavailable</Text>
      <Text style={styles.hint}>{errorMessage(error)}</Text>
      <TouchableOpacity style={styles.secondaryButton} onPress={onRetry}>
        <RefreshCw size={18} color="#0F766E" /><Text style={styles.secondaryText}>Retry workspace</Text>
      </TouchableOpacity>
    </View>
  );
}

function Empty({ onRefresh }: { onRefresh: () => void }) {
  return (
    <View style={styles.loading}>
      <PackageCheck size={48} color="#94A3B8" />
      <Text style={styles.emptyTitle}>No active delivery</Text>
      <Text style={styles.hint}>Accepted jobs appear here automatically.</Text>
      <TouchableOpacity style={styles.secondaryButton} onPress={onRefresh}>
        <RefreshCw size={18} color="#0F766E" /><Text style={styles.secondaryText}>Refresh workspace</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  flex: { flex: 1 },
  header: { minHeight: 112, paddingTop: 48, paddingHorizontal: 18, paddingBottom: 16, backgroundColor: '#067B5C', flexDirection: 'row', alignItems: 'center', gap: 9 },
  eyebrow: { color: '#A7F3D0', fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  headerTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', marginTop: 3 },
  headerButton: { width: 43, height: 43, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  notificationBadge: { position: 'absolute', right: -3, top: -3, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#EF1D25', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  notificationBadgeText: { color: '#FFFFFF', fontSize: 8, fontWeight: '900' },
  content: { padding: 16 },
  progressCard: { borderRadius: 21, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 16, flexDirection: 'row', alignItems: 'flex-start' },
  stepItem: { width: 54, alignItems: 'center' },
  stepDot: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  stepDone: { backgroundColor: '#0F766E', borderColor: '#0F766E' },
  stepActive: { backgroundColor: '#F59E0B', borderColor: '#F59E0B' },
  stepLabel: { color: '#94A3B8', fontSize: 8, fontWeight: '800', textAlign: 'center', marginTop: 6 },
  stepLabelActive: { color: '#334155' },
  stepLine: { flex: 1, height: 3, marginTop: 15, backgroundColor: '#E2E8F0' },
  stepLineDone: { backgroundColor: '#0F766E' },
  destinationCard: { marginTop: 13, borderRadius: 21, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 15, flexDirection: 'row', alignItems: 'center', gap: 11 },
  avatar: { width: 50, height: 50, borderRadius: 17, backgroundColor: '#CCFBF1', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#0F766E', fontSize: 20, fontWeight: '900' },
  destinationLabel: { color: '#0F766E', fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  destinationName: { color: '#0F172A', fontSize: 17, fontWeight: '900', marginTop: 2 },
  address: { color: '#64748B', fontSize: 10, lineHeight: 15, marginTop: 3 },
  orderCode: { color: '#0F766E', fontSize: 9, fontWeight: '900', marginTop: 5 },
  callButton: { width: 44, height: 44, borderRadius: 15, backgroundColor: '#0F766E', alignItems: 'center', justifyContent: 'center' },
  callButtonDisabled: { opacity: 0.35 },
  errorCard: { marginTop: 13, borderRadius: 17, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2', padding: 13, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  errorTitle: { color: '#991B1B', fontWeight: '900' },
  errorText: { color: '#B91C1C', fontSize: 10, marginTop: 3 },
  card: { marginTop: 13, borderRadius: 22, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { color: '#0F172A', fontSize: 16, fontWeight: '900' },
  hint: { color: '#64748B', fontSize: 11, lineHeight: 17, marginTop: 6, textAlign: 'center' },
  primaryButton: { minHeight: 52, borderRadius: 16, backgroundColor: '#0F766E', marginTop: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  secondaryButton: { minHeight: 48, borderRadius: 15, borderWidth: 1, borderColor: '#99F6E4', backgroundColor: '#F0FDFA', marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  secondaryText: { color: '#0F766E', fontSize: 12, fontWeight: '900' },
  codButton: { minHeight: 48, borderRadius: 15, borderWidth: 1, borderColor: '#FDE68A', backgroundColor: '#FFFBEB', marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  codText: { color: '#92400E', fontSize: 12, fontWeight: '900' },
  successStrip: { marginTop: 10, borderRadius: 13, backgroundColor: '#F0FDF4', padding: 10, flexDirection: 'row', alignItems: 'center', gap: 7 },
  successText: { color: '#166534', fontSize: 11, fontWeight: '800' },
  input: { minHeight: 49, borderRadius: 14, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', paddingHorizontal: 13, color: '#0F172A', marginTop: 10 },
  otpInput: { textAlign: 'center', fontSize: 21, letterSpacing: 4 },
  confirmRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  checkbox: { width: 27, height: 27, borderRadius: 8, borderWidth: 2, borderColor: '#94A3B8', alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: '#0F766E', borderColor: '#0F766E' },
  confirmText: { color: '#334155', fontSize: 12, fontWeight: '800' },
  locationNote: { marginTop: 12, borderRadius: 13, backgroundColor: '#F0FDFA', padding: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  locationNoteText: { flex: 1, color: '#115E59', fontSize: 10, lineHeight: 15, fontWeight: '700' },
  failureCard: { marginTop: 13, borderRadius: 20, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2', padding: 14 },
  failureHeader: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  failureTitle: { color: '#991B1B', fontSize: 14, fontWeight: '900' },
  failureText: { color: '#B91C1C', fontSize: 10, marginTop: 2 },
  failureToggle: { color: '#991B1B', fontWeight: '900' },
  failureBody: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#FECACA' },
  reasonRail: { gap: 7 },
  reasonChip: { borderRadius: 999, borderWidth: 1, borderColor: '#FCA5A5', backgroundColor: '#FFFFFF', paddingHorizontal: 10, paddingVertical: 8 },
  reasonChipSelected: { backgroundColor: '#B91C1C', borderColor: '#B91C1C' },
  reasonText: { color: '#991B1B', fontSize: 9, fontWeight: '900' },
  reasonTextSelected: { color: '#FFFFFF' },
  multiline: { minHeight: 84, paddingTop: 12, textAlignVertical: 'top' },
  failureButton: { minHeight: 49, borderRadius: 15, backgroundColor: '#B91C1C', marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  failureButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  disabled: { opacity: 0.45 },
  loading: { flex: 1, minHeight: 500, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: '#F8FAFC' },
  emptyTitle: { color: '#0F172A', fontSize: 20, fontWeight: '900', marginTop: 12 },
});
