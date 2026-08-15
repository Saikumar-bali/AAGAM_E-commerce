import { useAuthStore } from '@aagam/mobile-shared';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Geolocation from 'react-native-geolocation-service';
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  Check,
  CheckCircle2,
  IndianRupee,
  KeyRound,
  LifeBuoy,
  MapPin,
  MessageCircle,
  Navigation,
  PhoneCall,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Store,
} from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import {
  DeliveryFailureReason,
  deliveryOperationsService,
} from '../../api/deliveryOperationsService';
import { notificationService } from '../../api/notificationService';
import { riderService, RIDER_WORKSPACE_QUERY_KEY } from '../../api/riderService';
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
  if (['OUT_FOR_DELIVERY', 'RIDER_AT_CUSTOMER', 'DELIVERY_FAILED', 'RETURNING_TO_STORE'].includes(status)) return 2;
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

export const RiderDeliveryFlowScreen = ({ deliveryJobId }: { deliveryJobId: string }) => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const [busy, setBusy] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [podNote, setPodNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [failureReason, setFailureReason] = useState<DeliveryFailureReason>('CUSTOMER_UNREACHABLE');
  const [failureNote, setFailureNote] = useState('');
  const [showFailure, setShowFailure] = useState(false);

  const workspaceQuery = useQuery({
    queryKey: RIDER_WORKSPACE_QUERY_KEY,
    queryFn: riderService.getWorkspace,
    refetchInterval: 8_000,
    retry: 1,
  });
  const activeJob = workspaceQuery.data?.activeJobs?.find((job) => job.id === deliveryJobId) || null;
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
  const returningToStore = Boolean(activeJob && ['DELIVERY_FAILED', 'RETURNING_TO_STORE'].includes(activeJob.status));
  const headingToStore = Boolean(activeJob && (returningToStore || ['RIDER_ASSIGNED', 'RIDER_EN_ROUTE_TO_STORE'].includes(activeJob.status)));
  const customerName = activeJob?.order.customer?.name || activeJob?.order.addressSnapshot?.recipientName || 'Customer';
  const destinationName = headingToStore ? activeJob?.order.store?.name || 'Pickup store' : customerName;
  const destinationAddress = headingToStore ? activeJob?.order.store?.address || 'Store address unavailable' : deliveryAddress(activeJob);
  const targetRole: 'CUSTOMER' | 'STORE' = headingToStore ? 'STORE' : 'CUSTOMER';

  const refresh = async () => {
    await workspaceQuery.refetch();
    if (activeJob?.id) await summaryQuery.refetch();
    await inboxQuery.refetch();
  };

  const perform = async (key: string, task: () => Promise<unknown>, title: string, text: string) => {
    if (busy) return;
    setBusy(key);
    try {
      await task();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: RIDER_WORKSPACE_QUERY_KEY }),
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

  const requestPrivateContact = async (channel: 'CALL' | 'MESSAGE' | 'SAFETY_ESCALATION') => {
    if (!activeJob || busy) return;
    setBusy(`contact-${channel}`);
    try {
      const result: any = await riderService.requestContact(activeJob.id, targetRole, channel);
      if (result.uri) await Linking.openURL(result.uri);
      if (result.supportTicketId) {
        Toast.show({ type: 'success', text1: 'Safety escalation created', text2: 'Opening the protected support conversation.' });
        navigation.getParent()?.navigate('RiderSupportConversation', { ticketId: result.supportTicketId });
      } else {
        Toast.show({
          type: 'success',
          text1: channel === 'CALL' ? 'Opening call' : 'Opening message',
          text2: result.source === 'DELIVERY_ADDRESS'
            ? 'Using the phone number saved with this delivery address.'
            : 'Using the contact number saved for this delivery.',
        });
      }
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Contact unavailable', text2: errorMessage(error) });
    } finally {
      setBusy(null);
    }
  };

  const transition = () => {
    if (!activeJob || !nextAction) return;
    Alert.alert(nextAction.label, nextAction.confirmation, [
      { text: 'Back', style: 'cancel' },
      { text: 'Confirm', onPress: () => void perform(`transition-${nextAction.action}`, () => riderService.transitionJob(activeJob.id, nextAction.action), nextAction.label, 'The canonical delivery timeline has been updated.') },
    ]);
  };

  const issueOtp = () => {
    if (!activeJob) return;
    void perform('otp', () => deliveryOperationsService.issueOtp(activeJob.id), 'Customer OTP issued', 'Ask the customer for the new six-digit code.');
  };

  const collectCod = () => {
    if (!activeJob || expectedCod <= 0) return;
    Alert.alert('Confirm cash collection?', `Confirm collection of ₹${(expectedCod / 100).toFixed(2)} from the customer.`, [
      { text: 'Back', style: 'cancel' },
      { text: 'Cash collected', onPress: () => void perform('cod', () => deliveryOperationsService.collectCod(activeJob.id, { amountPaise: expectedCod }), 'COD recorded', 'The persisted Rider cash ledger has been updated.') },
    ]);
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
    const deliveryJobId = activeJob.id;
    Alert.alert('Complete delivery?', 'The server will persist proof, COD, earnings, and events before the receipt opens.', [
      { text: 'Back', style: 'cancel' },
      {
        text: 'Complete delivery',
        onPress: () => void (async () => {
          if (busy) return;
          setBusy('complete');
          try {
            const location = await capturePodLocation();
            await deliveryOperationsService.completeDelivery(deliveryJobId, {
              otpCode,
              proofType: 'CUSTOMER_OTP_PIN',
              riderConfirmed: true,
              note: podNote.trim() || undefined,
              ...(location || {}),
            });
            if (user?.id) await riderService.cacheLastCompletedJob(user.id, deliveryJobId);
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: RIDER_WORKSPACE_QUERY_KEY }),
              queryClient.invalidateQueries({ queryKey: SUMMARY_KEY }),
              queryClient.invalidateQueries({ queryKey: EARNINGS_KEY }),
            ]);
            setOtpCode('');
            setPodNote('');
            setConfirmed(false);
            navigation.replace('RiderReceipt', { deliveryJobId });
          } catch (error: any) {
            Toast.show({ type: 'error', text1: 'Delivery completion failed', text2: errorMessage(error) });
          } finally {
            setBusy(null);
          }
        })(),
      },
    ]);
  };

  const recordFailure = () => {
    if (!activeJob) return;
    if (failureReason === 'OTHER' && failureNote.trim().length < 3) {
      Toast.show({ type: 'error', text1: 'Failure details required', text2: 'Add a brief note when selecting Other.' });
      return;
    }
    Alert.alert('Record delivery failure?', 'This starts the exception and return workflow.', [
      { text: 'Back', style: 'cancel' },
      { text: 'Record failure', style: 'destructive', onPress: () => void perform('failure', () => deliveryOperationsService.recordFailure(activeJob.id, { reason: failureReason, note: failureNote.trim() || undefined }), 'Failure recorded', 'The exact reason is stored for operations review.') },
    ]);
  };

  if (workspaceQuery.isLoading) return <State loading title="Loading active delivery" text="Reading the Rider-owned job." />;
  if (workspaceQuery.isError) return <State title="Active delivery unavailable" text={errorMessage(workspaceQuery.error)} />;
  if (!activeJob) return <State title="No active delivery" text="Refresh Jobs or open the last authoritative receipt from history." />;

  const step = progressIndex(activeJob.status);
  const completionDisabled = busy !== null || !policy.completeDelivery || !/^\d{6}$/.test(otpCode) || !confirmed;

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#067B5C" />
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to Rider jobs" style={styles.headerButton} onPress={() => navigation.goBack()}><ArrowLeft size={21} color="#FFFFFF" /></TouchableOpacity>
        <View style={styles.flex}><Text style={styles.eyebrow}>ACTIVE DELIVERY</Text><Text style={styles.headerTitle}>{deliveryStatusLabel(activeJob.status)}</Text></View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Refresh active delivery" style={styles.headerButton} onPress={() => void refresh()}><RefreshCw size={20} color="#FFFFFF" /></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${unreadCount} unread Rider alerts`} style={styles.headerButton} onPress={() => navigation.getParent()?.navigate('Alerts')}><Bell size={22} color="#FFFFFF" />{unreadCount > 0 ? <View style={styles.notificationBadge}><Text style={styles.notificationBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text></View> : null}</TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={workspaceQuery.isRefetching || summaryQuery.isRefetching} onRefresh={() => void refresh()} />}
      >
        <View style={styles.progressCard}>
          {['Accepted', 'Picked up', 'On the way', 'Delivered'].map((stepLabel, index) => {
            const done = index < step || activeJob.status === 'DELIVERED';
            const active = index === step && activeJob.status !== 'DELIVERED';
            return <React.Fragment key={stepLabel}><View style={styles.stepItem}><View style={[styles.stepDot, done && styles.stepDone, active && styles.stepActive]}>{done ? <Check size={17} color="#FFFFFF" strokeWidth={3} /> : active ? <Navigation size={15} color="#FFFFFF" /> : null}</View><Text style={[styles.stepLabel, (done || active) && styles.stepLabelActive]}>{stepLabel}</Text></View>{index < 3 ? <View style={[styles.stepLine, index < step && styles.stepLineDone]} /> : null}</React.Fragment>;
          })}
        </View>

        <View style={styles.destinationCard}>
          <View style={styles.avatar}>{headingToStore ? <Store size={24} color="#0F766E" /> : <Text style={styles.avatarText}>{destinationName.slice(0, 1).toUpperCase()}</Text>}</View>
          <View style={styles.flex}><Text style={styles.destinationLabel}>{returningToStore ? 'RETURN STORE' : headingToStore ? 'PICKUP STORE' : 'DELIVER TO'}</Text><Text style={styles.destinationName}>{destinationName}</Text><Text style={styles.address}>{destinationAddress}</Text><Text style={styles.orderCode}>Order #{shortId(activeJob.order.id)}</Text></View>
        </View>

        <View style={styles.quickActionsCard}>
          <Text style={styles.quickActionsLabel}>QUICK ACTIONS</Text>
          <View style={styles.quickActions}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Call ${targetRole.toLowerCase()} delivery contact`} style={styles.quickAction} disabled={Boolean(busy)} onPress={() => void requestPrivateContact('CALL')}>{busy === 'contact-CALL' ? <ActivityIndicator color="#0F766E" /> : <PhoneCall size={19} color="#0F766E" />}<Text style={styles.quickActionText}>Call</Text></TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Message ${targetRole.toLowerCase()} delivery contact`} style={styles.quickAction} disabled={Boolean(busy)} onPress={() => void requestPrivateContact('MESSAGE')}>{busy === 'contact-MESSAGE' ? <ActivityIndicator color="#0F766E" /> : <MessageCircle size={19} color="#0F766E" />}<Text style={styles.quickActionText}>Message</Text></TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open delivery support" style={styles.quickAction} onPress={() => navigation.getParent()?.navigate('RiderSupport', { deliveryJobId: activeJob.id })}><LifeBuoy size={19} color="#0F766E" /><Text style={styles.quickActionText}>Support</Text></TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Escalate delivery safety concern" style={[styles.quickAction, styles.quickActionDanger]} disabled={Boolean(busy)} onPress={() => void requestPrivateContact('SAFETY_ESCALATION')}>{busy === 'contact-SAFETY_ESCALATION' ? <ActivityIndicator color="#B91C1C" /> : <ShieldAlert size={19} color="#B91C1C" />}<Text style={styles.quickActionDangerText}>Safety</Text></TouchableOpacity>
          </View>
        </View>

        {summaryQuery.isError ? <View style={styles.errorCard}><AlertTriangle size={24} color="#B91C1C" /><View style={styles.flex}><Text style={styles.errorTitle}>Delivery gates unavailable</Text><Text style={styles.errorText}>{errorMessage(summaryQuery.error)}</Text></View></View> : null}

        {nextAction ? <PrimaryButton label={nextAction.label} busy={busy?.startsWith('transition')} disabled={Boolean(busy)} onPress={transition} /> : null}

        {activeJob.status === 'RIDER_AT_CUSTOMER' && summary ? (
          <View style={styles.card}>
            <View style={styles.sectionHeader}><KeyRound size={21} color="#0F766E" /><Text style={styles.sectionTitle}>Customer verification</Text></View>
            <Text style={styles.hint}>Issue an OTP, collect COD when required, then create the authoritative receipt.</Text>
            <TouchableOpacity accessibilityRole="button" style={styles.secondaryButton} disabled={!policy.issueOtp || Boolean(busy)} onPress={issueOtp}>{busy === 'otp' ? <ActivityIndicator color="#0F766E" /> : <KeyRound size={18} color="#0F766E" />}<Text style={styles.secondaryText}>{summary.otp.issued ? 'Issue new OTP' : 'Issue customer OTP'}</Text></TouchableOpacity>
            {policy.collectCod ? <TouchableOpacity accessibilityRole="button" style={styles.codButton} disabled={Boolean(busy)} onPress={collectCod}>{busy === 'cod' ? <ActivityIndicator color="#92400E" /> : <IndianRupee size={18} color="#92400E" />}<Text style={styles.codText}>Record ₹{(expectedCod / 100).toFixed(2)} cash collection</Text></TouchableOpacity> : null}
            {summary.cod.applicable && summary.cod.collected ? <View style={styles.successStrip}><CheckCircle2 size={18} color="#166534" /><Text style={styles.successText}>COD collection recorded</Text></View> : null}
            <TextInput value={otpCode} onChangeText={(value) => setOtpCode(value.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" maxLength={6} placeholder="6-digit customer OTP" placeholderTextColor="#94A3B8" style={[styles.input, styles.otpInput]} />
            <TextInput value={podNote} onChangeText={setPodNote} placeholder="Optional handoff note" placeholderTextColor="#94A3B8" maxLength={500} style={styles.input} />
            <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: confirmed }} style={styles.confirmRow} onPress={() => setConfirmed((value) => !value)}><View style={[styles.checkbox, confirmed && styles.checkboxChecked]}>{confirmed ? <Check size={16} color="#FFFFFF" /> : null}</View><Text style={styles.confirmText}>Parcel handed to the customer</Text></TouchableOpacity>
            <View style={styles.locationNote}><MapPin size={17} color="#0F766E" /><Text style={styles.locationNoteText}>GPS evidence is attached when available. A denied location does not block a valid OTP handoff.</Text></View>
            <PrimaryButton label="Complete delivery and open receipt" busy={busy === 'complete'} disabled={completionDisabled} onPress={completeDelivery} />
          </View>
        ) : null}

        {policy.startReturn ? <PrimaryButton label="Start return to store" busy={busy === 'return'} disabled={Boolean(busy)} onPress={() => void perform('return', () => deliveryOperationsService.startReturn(activeJob.id), 'Return started', 'Navigate back to the owning store.')} /> : null}

        {policy.recordFailure ? (
          <View style={styles.failureCard}>
            <TouchableOpacity accessibilityRole="button" style={styles.failureHeader} onPress={() => setShowFailure((value) => !value)}><AlertTriangle size={20} color="#B91C1C" /><View style={styles.flex}><Text style={styles.failureTitle}>Unable to deliver?</Text><Text style={styles.failureText}>Record the exact reason before leaving.</Text></View><Text style={styles.failureToggle}>{showFailure ? 'Close' : 'Report'}</Text></TouchableOpacity>
            {showFailure ? <View style={styles.failureBody}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reasonRail}>{DELIVERY_FAILURE_OPTIONS.map((option) => <TouchableOpacity key={option.value} accessibilityRole="button" accessibilityState={{ selected: failureReason === option.value }} style={[styles.reasonChip, failureReason === option.value && styles.reasonChipSelected]} onPress={() => setFailureReason(option.value)}><Text style={[styles.reasonText, failureReason === option.value && styles.reasonTextSelected]}>{option.label}</Text></TouchableOpacity>)}</ScrollView><TextInput value={failureNote} onChangeText={setFailureNote} multiline placeholder="Add operational details" placeholderTextColor="#94A3B8" maxLength={500} style={[styles.input, styles.multiline]} /><TouchableOpacity accessibilityRole="button" style={styles.failureButton} disabled={Boolean(busy)} onPress={recordFailure}>{busy === 'failure' ? <ActivityIndicator color="#FFFFFF" /> : <RotateCcw size={18} color="#FFFFFF" />}<Text style={styles.failureButtonText}>Record failed delivery</Text></TouchableOpacity></View> : null}
          </View>
        ) : null}

      </ScrollView>
    </View>
  );
};

function PrimaryButton({ label, busy, disabled, onPress }: { label: string; busy?: boolean; disabled?: boolean; onPress: () => void }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: Boolean(disabled) }} style={[styles.primaryButton, disabled && styles.disabled]} disabled={disabled} onPress={onPress}>{busy ? <ActivityIndicator color="#FFFFFF" /> : <CheckCircle2 size={19} color="#FFFFFF" />}<Text style={styles.primaryText}>{label}</Text></TouchableOpacity>;
}

function State({ loading = false, title, text }: { loading?: boolean; title: string; text: string }) {
  return <View style={styles.state}>{loading ? <ActivityIndicator size="large" color="#0F766E" /> : <Navigation size={46} color="#94A3B8" />}<Text style={styles.stateTitle}>{title}</Text><Text style={styles.stateText}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' }, flex: { flex: 1 }, header: { backgroundColor: '#067B5C', paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 9 }, eyebrow: { color: '#A7F3D0', fontSize: 9, fontWeight: '900', letterSpacing: 1 }, headerTitle: { color: '#FFFFFF', fontSize: 21, fontWeight: '900', marginTop: 2 }, headerButton: { width: 42, height: 42, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' }, notificationBadge: { position: 'absolute', right: -3, top: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center' }, notificationBadgeText: { color: '#FFFFFF', fontSize: 8, fontWeight: '900' }, content: { padding: 14 },
  progressCard: { borderRadius: 17, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 13, flexDirection: 'row', alignItems: 'flex-start' }, stepItem: { width: 54, alignItems: 'center' }, stepDot: { width: 31, height: 31, borderRadius: 16, backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' }, stepDone: { backgroundColor: '#15803D' }, stepActive: { backgroundColor: '#0F766E' }, stepLabel: { color: '#94A3B8', fontSize: 8, fontWeight: '800', marginTop: 5, textAlign: 'center' }, stepLabelActive: { color: '#0F172A' }, stepLine: { flex: 1, height: 3, backgroundColor: '#E2E8F0', marginTop: 14 }, stepLineDone: { backgroundColor: '#15803D' },
  destinationCard: { marginTop: 10, borderRadius: 17, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 14, flexDirection: 'row', gap: 11 }, avatar: { width: 48, height: 48, borderRadius: 15, backgroundColor: '#CCFBF1', alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#0F766E', fontSize: 20, fontWeight: '900' }, destinationLabel: { color: '#0F766E', fontSize: 9, fontWeight: '900' }, destinationName: { color: '#0F172A', fontSize: 16, fontWeight: '900', marginTop: 3 }, address: { color: '#64748B', fontSize: 10, lineHeight: 16, marginTop: 4 }, orderCode: { color: '#475569', fontSize: 9, fontWeight: '800', marginTop: 5 },
  contactCard: { marginTop: 10, borderRadius: 17, backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#99F6E4', padding: 14 }, contactHeader: { flexDirection: 'row', gap: 9 }, contactTitle: { color: '#0F172A', fontSize: 13, fontWeight: '900' }, contactText: { color: '#475569', fontSize: 10, lineHeight: 15, marginTop: 3 }, contactActions: { flexDirection: 'row', gap: 8, marginTop: 11 }, contactButton: { flex: 1, minHeight: 46, borderRadius: 13, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#99D8C8', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, contactButtonText: { color: '#0F766E', fontSize: 11, fontWeight: '900' }, safetyButton: { minHeight: 44, borderRadius: 12, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, safetyText: { color: '#B91C1C', fontSize: 11, fontWeight: '900' },
  quickActionsCard: { marginTop: 10, borderRadius: 15, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D7E3DF', padding: 9 }, quickActionsLabel: { color: '#64748B', fontSize: 8, fontWeight: '900', letterSpacing: 1, marginBottom: 7 }, quickActions: { flexDirection: 'row', gap: 7 }, quickAction: { flex: 1, minHeight: 48, borderRadius: 12, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center', gap: 3 }, quickActionText: { color: '#0F766E', fontSize: 8, fontWeight: '900' }, quickActionDanger: { backgroundColor: '#FEF2F2' }, quickActionDangerText: { color: '#B91C1C', fontSize: 8, fontWeight: '900' },
  errorCard: { marginTop: 10, borderRadius: 15, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', padding: 13, flexDirection: 'row', gap: 9 }, errorTitle: { color: '#991B1B', fontSize: 12, fontWeight: '900' }, errorText: { color: '#7F1D1D', fontSize: 10, lineHeight: 15, marginTop: 3 },
  primaryButton: { minHeight: 51, borderRadius: 14, backgroundColor: '#067B5C', marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, primaryText: { color: '#FFFFFF', fontWeight: '900' }, disabled: { opacity: 0.45 },
  card: { marginTop: 10, borderRadius: 17, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 14 }, sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 }, sectionTitle: { color: '#0F172A', fontSize: 15, fontWeight: '900' }, hint: { color: '#64748B', fontSize: 10, lineHeight: 15, marginTop: 6 }, secondaryButton: { minHeight: 47, borderRadius: 13, backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#99F6E4', marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, secondaryText: { color: '#0F766E', fontWeight: '900' }, codButton: { minHeight: 47, borderRadius: 13, backgroundColor: '#FEF3C7', marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, codText: { color: '#92400E', fontWeight: '900' }, successStrip: { borderRadius: 12, backgroundColor: '#F0FDF4', padding: 10, marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 7 }, successText: { color: '#166534', fontSize: 11, fontWeight: '900' }, input: { minHeight: 49, borderRadius: 12, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC', paddingHorizontal: 12, color: '#0F172A', marginTop: 9 }, otpInput: { letterSpacing: 8, fontSize: 18, textAlign: 'center' }, confirmRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 8 }, checkbox: { width: 25, height: 25, borderRadius: 8, borderWidth: 1, borderColor: '#94A3B8', alignItems: 'center', justifyContent: 'center' }, checkboxChecked: { backgroundColor: '#0F766E', borderColor: '#0F766E' }, confirmText: { color: '#0F172A', fontSize: 12, fontWeight: '800' }, locationNote: { borderRadius: 12, backgroundColor: '#F0FDFA', padding: 10, marginTop: 7, flexDirection: 'row', gap: 7 }, locationNoteText: { flex: 1, color: '#0F766E', fontSize: 9, lineHeight: 14 },
  failureCard: { marginTop: 10, borderRadius: 17, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#FECACA', overflow: 'hidden' }, failureHeader: { minHeight: 68, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 9 }, failureTitle: { color: '#991B1B', fontSize: 13, fontWeight: '900' }, failureText: { color: '#7F1D1D', fontSize: 10, marginTop: 3 }, failureToggle: { color: '#B91C1C', fontSize: 10, fontWeight: '900' }, failureBody: { borderTopWidth: 1, borderTopColor: '#FECACA', padding: 13 }, reasonRail: { gap: 7 }, reasonChip: { minHeight: 36, borderRadius: 11, backgroundColor: '#FEF2F2', paddingHorizontal: 11, justifyContent: 'center' }, reasonChipSelected: { backgroundColor: '#B91C1C' }, reasonText: { color: '#991B1B', fontSize: 9, fontWeight: '800' }, reasonTextSelected: { color: '#FFFFFF' }, multiline: { minHeight: 95, paddingTop: 11, textAlignVertical: 'top' }, failureButton: { minHeight: 48, borderRadius: 13, backgroundColor: '#B91C1C', marginTop: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, failureButtonText: { color: '#FFFFFF', fontWeight: '900' },
  supportButton: { minHeight: 49, borderRadius: 14, borderWidth: 1, borderColor: '#99D8C8', marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, supportText: { color: '#0F766E', fontWeight: '900' },
  state: { flex: 1, minHeight: 480, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: '#F8FAFC' }, stateTitle: { color: '#0F172A', fontSize: 20, fontWeight: '900', marginTop: 12, textAlign: 'center' }, stateText: { color: '#64748B', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 7 },
});
