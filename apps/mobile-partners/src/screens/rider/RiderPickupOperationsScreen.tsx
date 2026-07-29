import React, { useEffect, useMemo, useState } from 'react';
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
import Geolocation from 'react-native-geolocation-service';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  KeyRound,
  PackageCheck,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Store,
  XCircle,
} from 'lucide-react-native';
import { pickupOperationsService } from '../../api/pickupOperationsService';
import {
  allPickupItemsChecked,
  buildPickupChecklistLines,
  checkedStateFromTask,
  normalizeParcelCount,
} from '../../domain/pickupOperations';

const WORKSPACE_KEY = ['rider', 'delivery-workspace'] as const;
const PICKUP_KEY = ['rider', 'pickup-operations'] as const;
const PROBLEM_TYPES = [
  ['MISSING_ITEM', 'Missing item'],
  ['WRONG_QUANTITY', 'Wrong quantity'],
  ['DAMAGED_PARCEL', 'Damaged parcel'],
  ['UNSEALED_PARCEL', 'Unsealed parcel'],
  ['OTHER', 'Other'],
] as const;

function message(error: any) {
  const value = error?.response?.data?.message;
  if (Array.isArray(value)) return value.join(', ');
  return value || error?.message || 'The pickup operation could not be completed.';
}

function shortId(value?: string | null) {
  return value ? value.slice(-8).toUpperCase() : 'UNKNOWN';
}

function captureLocation() {
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

export const RiderPickupOperationsScreen = () => {
  const queryClient = useQueryClient();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [parcelCode, setParcelCode] = useState('');
  const [method, setMethod] = useState<'STORE_PICKUP_PIN' | 'QR_CODE'>('STORE_PICKUP_PIN');
  const [challengeCode, setChallengeCode] = useState('');
  const [parcelCount, setParcelCount] = useState('1');
  const [showProblem, setShowProblem] = useState(false);
  const [problemType, setProblemType] = useState('MISSING_ITEM');
  const [problemNote, setProblemNote] = useState('');

  const pickupQuery = useQuery({
    queryKey: PICKUP_KEY,
    queryFn: pickupOperationsService.getRiderPickup,
    refetchInterval: 8_000,
    retry: 1,
  });

  const payload = pickupQuery.data;
  const job = payload?.job || null;
  const task = payload?.task || null;
  const checklist = task?.checklist || [];
  const checklistVerified = task?.status === 'VERIFIED';
  const checklistComplete = allPickupItemsChecked(checklist, checked);

  useEffect(() => {
    setChecked(checkedStateFromTask(task));
    setParcelCode(task?.parcelCode || '');
  }, [task?.status, task?.updatedAt, job?.id]);

  const refresh = async () => {
    await pickupQuery.refetch();
    await queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY });
  };

  const verifyChecklist = useMutation({
    mutationFn: async () => {
      if (!job) throw new Error('Active pickup job unavailable');
      return pickupOperationsService.verifyChecklist(job.id, {
        lines: buildPickupChecklistLines(checklist, checked),
        parcelCode: parcelCode.trim() || undefined,
      });
    },
    onSuccess: async () => {
      Toast.show({ type: 'success', text1: 'Checklist verified', text2: 'The store can now release the parcel.' });
      await refresh();
    },
    onError: (error: any) => Toast.show({ type: 'error', text1: 'Checklist failed', text2: message(error) }),
  });

  const verifyChallenge = useMutation({
    mutationFn: async () => {
      if (!job) throw new Error('Active pickup job unavailable');
      const code = challengeCode.trim();
      if (method === 'STORE_PICKUP_PIN' && !/^\d{6}$/.test(code)) throw new Error('Enter the 6-digit PIN shown by the store.');
      if (method === 'QR_CODE' && code.length < 6) throw new Error('Scan or paste the complete QR payload.');
      const location = await captureLocation();
      return pickupOperationsService.verifyChallenge(job.id, {
        method,
        code,
        parcelCount: normalizeParcelCount(parcelCount),
        ...(location || {}),
      });
    },
    onSuccess: async () => {
      setChallengeCode('');
      Toast.show({ type: 'success', text1: 'Pickup verified', text2: 'Start customer delivery from Dashboard.' });
      await refresh();
    },
    onError: (error: any) => Toast.show({ type: 'error', text1: 'Pickup proof failed', text2: message(error) }),
  });

  const reportProblem = useMutation({
    mutationFn: async () => {
      if (!job) throw new Error('Active pickup job unavailable');
      if (problemNote.trim().length < 5) throw new Error('Describe the problem in at least 5 characters.');
      return pickupOperationsService.reportProblem(job.id, { problemType, note: problemNote.trim() });
    },
    onSuccess: async () => {
      setShowProblem(false);
      Toast.show({ type: 'success', text1: 'Pickup problem reported', text2: 'The store can review the mismatch.' });
      await refresh();
    },
    onError: (error: any) => Toast.show({ type: 'error', text1: 'Problem report failed', text2: message(error) }),
  });

  const busy = verifyChecklist.isPending || verifyChallenge.isPending || reportProblem.isPending;
  const totalUnits = useMemo(
    () => checklist.reduce((sum: number, item: any) => sum + Number(item.expectedQuantity || 0), 0),
    [checklist],
  );

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={pickupQuery.isRefetching} onRefresh={() => void refresh()} />}
    >
      <View style={styles.hero}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>RIDER PICKUP</Text>
          <Text style={styles.title}>Verify parcel handoff</Text>
          <Text style={styles.subtitle}>Check every item before accepting the parcel.</Text>
        </View>
        <TouchableOpacity testID="rider_pickup_refresh" style={styles.refreshButton} onPress={() => void refresh()}>
          <RefreshCw size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {pickupQuery.isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#0F766E" /><Text style={styles.muted}>Loading pickup task…</Text></View>
      ) : pickupQuery.error ? (
        <View style={styles.errorCard}><AlertTriangle size={36} color="#B91C1C" /><Text style={styles.errorTitle}>Pickup task unavailable</Text><Text style={styles.errorText}>{message(pickupQuery.error)}</Text></View>
      ) : !job || !task ? (
        <View style={styles.emptyCard}><PackageCheck size={48} color="#94A3B8" /><Text style={styles.emptyTitle}>No pickup waiting</Text><Text style={styles.emptyText}>Use Dashboard to arrive at the assigned store.</Text></View>
      ) : (
        <>
          <View style={styles.summaryCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.orderCode}>ORDER #{shortId(job.order?.id)}</Text>
              <Text style={styles.storeName}>{job.order?.store?.name || 'AAGAM store'}</Text>
              <Text style={styles.summaryText}>{checklist.length} lines · {totalUnits} units</Text>
            </View>
            <View style={[styles.badge, checklistVerified ? styles.badgeReady : styles.badgePending]}>
              <Text style={[styles.badgeText, checklistVerified ? styles.readyText : styles.pendingText]}>{checklistVerified ? 'VERIFIED' : 'CHECK ITEMS'}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.sectionHeader}><ClipboardCheck size={22} color="#0F766E" /><View style={{ flex: 1 }}><Text style={styles.sectionTitle}>Item checklist</Text><Text style={styles.sectionText}>Tap a line only after confirming its full quantity.</Text></View></View>
            {checklist.map((item: any) => {
              const selected = Boolean(checked[item.orderItemId]);
              return (
                <TouchableOpacity
                  testID={`rider_pickup_item_${item.orderItemId}`}
                  key={item.orderItemId}
                  style={[styles.itemCard, selected && styles.itemChecked]}
                  disabled={checklistVerified || busy}
                  onPress={() => setChecked((current) => ({ ...current, [item.orderItemId]: !current[item.orderItemId] }))}
                >
                  <View style={[styles.checkbox, selected && styles.checkboxChecked]}>{selected ? <CheckCircle2 size={18} color="#FFFFFF" /> : null}</View>
                  <View style={{ flex: 1 }}><Text style={styles.itemName}>{item.name || 'Order item'}</Text><Text style={styles.itemMeta}>Expected quantity: {item.expectedQuantity}</Text></View>
                  <Text style={styles.itemQty}>×{item.expectedQuantity}</Text>
                </TouchableOpacity>
              );
            })}
            <TextInput testID="rider_pickup_parcel_code" value={parcelCode} onChangeText={setParcelCode} editable={!checklistVerified && !busy} placeholder="Optional parcel or seal code" placeholderTextColor="#94A3B8" maxLength={100} style={styles.input} />
            {checklistVerified ? (
              <View style={styles.success}><ShieldCheck size={20} color="#15803D" /><Text style={styles.successText}>Checklist verified. Complete the store handoff below.</Text></View>
            ) : (
              <TouchableOpacity testID="rider_pickup_verify_checklist" style={[styles.primary, (!checklistComplete || busy) && styles.disabled]} disabled={!checklistComplete || busy} onPress={() => Alert.alert('Verify complete checklist?', 'Every quantity must match the packed parcel.', [{ text: 'Back', style: 'cancel' }, { text: 'Verify checklist', onPress: () => verifyChecklist.mutate() }])}>
                {verifyChecklist.isPending ? <ActivityIndicator color="#FFFFFF" /> : <CheckCircle2 size={18} color="#FFFFFF" />}
                <Text style={styles.primaryText}>Verify complete checklist</Text>
              </TouchableOpacity>
            )}
          </View>

          {checklistVerified ? (
            <View style={styles.card}>
              <View style={styles.sectionHeader}><KeyRound size={22} color="#0F766E" /><View style={{ flex: 1 }}><Text style={styles.sectionTitle}>Store pickup proof</Text><Text style={styles.sectionText}>Enter the PIN or QR payload shown by the owning store.</Text></View></View>
              <View style={styles.methodRow}>
                <TouchableOpacity testID="rider_pickup_method_pin" style={[styles.method, method === 'STORE_PICKUP_PIN' && styles.methodActive]} onPress={() => { setMethod('STORE_PICKUP_PIN'); setChallengeCode(''); }}><KeyRound size={17} color={method === 'STORE_PICKUP_PIN' ? '#FFFFFF' : '#0F766E'} /><Text style={[styles.methodText, method === 'STORE_PICKUP_PIN' && styles.methodTextActive]}>PIN</Text></TouchableOpacity>
                <TouchableOpacity testID="rider_pickup_method_qr" style={[styles.method, method === 'QR_CODE' && styles.methodActive]} onPress={() => { setMethod('QR_CODE'); setChallengeCode(''); }}><QrCode size={17} color={method === 'QR_CODE' ? '#FFFFFF' : '#0F766E'} /><Text style={[styles.methodText, method === 'QR_CODE' && styles.methodTextActive]}>QR payload</Text></TouchableOpacity>
              </View>
              <TextInput testID="rider_pickup_challenge_code" value={challengeCode} onChangeText={(value) => setChallengeCode(method === 'STORE_PICKUP_PIN' ? value.replace(/\D/g, '').slice(0, 6) : value)} placeholder={method === 'STORE_PICKUP_PIN' ? '6-digit pickup PIN' : 'Scan or paste QR payload'} placeholderTextColor="#94A3B8" keyboardType={method === 'STORE_PICKUP_PIN' ? 'number-pad' : 'default'} autoCapitalize="none" style={styles.input} />
              <TextInput testID="rider_pickup_parcel_count" value={parcelCount} onChangeText={(value) => setParcelCount(value.replace(/\D/g, '').slice(0, 3))} placeholder="Parcel count" placeholderTextColor="#94A3B8" keyboardType="number-pad" style={styles.input} />
              <TouchableOpacity testID="rider_pickup_verify_challenge" style={[styles.primary, busy && styles.disabled]} disabled={busy} onPress={() => verifyChallenge.mutate()}>
                {verifyChallenge.isPending ? <ActivityIndicator color="#FFFFFF" /> : method === 'STORE_PICKUP_PIN' ? <KeyRound size={18} color="#FFFFFF" /> : <QrCode size={18} color="#FFFFFF" />}
                <Text style={styles.primaryText}>Verify store handoff</Text>
              </TouchableOpacity>
              <View style={styles.info}><Store size={19} color="#0F766E" /><Text style={styles.infoText}>The store may instead confirm physical handoff directly. Pull to refresh after confirmation.</Text></View>
            </View>
          ) : null}

          <View style={styles.problemCard}>
            <TouchableOpacity testID="rider_pickup_problem_toggle" style={styles.problemHeader} onPress={() => setShowProblem((value) => !value)}><XCircle size={20} color="#B91C1C" /><View style={{ flex: 1 }}><Text style={styles.problemTitle}>Parcel does not match?</Text><Text style={styles.problemText}>Report the exact mismatch before pickup.</Text></View><Text style={styles.problemLink}>{showProblem ? 'Close' : 'Report'}</Text></TouchableOpacity>
            {showProblem ? (
              <View style={styles.problemBody}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.problemTypes}>
                  {PROBLEM_TYPES.map(([value, label]) => <TouchableOpacity key={value} style={[styles.problemChip, problemType === value && styles.problemChipActive]} onPress={() => setProblemType(value)}><Text style={[styles.problemChipText, problemType === value && styles.problemChipTextActive]}>{label}</Text></TouchableOpacity>)}
                </ScrollView>
                <TextInput testID="rider_pickup_problem_note" value={problemNote} onChangeText={setProblemNote} placeholder="Describe what is missing, damaged, or incorrect" placeholderTextColor="#94A3B8" multiline maxLength={500} style={[styles.input, styles.multiline]} />
                <TouchableOpacity testID="rider_pickup_report_problem" style={[styles.danger, busy && styles.disabled]} disabled={busy} onPress={() => reportProblem.mutate()}>{reportProblem.isPending ? <ActivityIndicator color="#FFFFFF" /> : <AlertTriangle size={18} color="#FFFFFF" />}<Text style={styles.primaryText}>Submit pickup problem</Text></TouchableOpacity>
              </View>
            ) : null}
          </View>
        </>
      )}
      <View style={{ height: 110 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F8FAFC' }, content: { paddingBottom: 20 },
  hero: { backgroundColor: '#0F172A', paddingTop: 56, paddingHorizontal: 20, paddingBottom: 24, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, flexDirection: 'row', alignItems: 'center', gap: 12 },
  eyebrow: { color: '#5EEAD4', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 }, title: { color: '#FFFFFF', fontSize: 27, fontWeight: '900', marginTop: 5 }, subtitle: { color: '#CBD5E1', fontSize: 12, marginTop: 5 },
  refreshButton: { width: 44, height: 44, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  center: { minHeight: 300, alignItems: 'center', justifyContent: 'center', gap: 12 }, muted: { color: '#64748B', fontWeight: '700' },
  emptyCard: { margin: 20, minHeight: 260, borderRadius: 26, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center', padding: 28 }, emptyTitle: { marginTop: 14, color: '#0F172A', fontSize: 19, fontWeight: '900' }, emptyText: { marginTop: 7, color: '#64748B', textAlign: 'center' },
  errorCard: { margin: 20, borderRadius: 24, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2', padding: 24, alignItems: 'center' }, errorTitle: { color: '#991B1B', fontSize: 18, fontWeight: '900', marginTop: 10 }, errorText: { color: '#B91C1C', textAlign: 'center', marginTop: 7 },
  summaryCard: { margin: 18, marginBottom: 0, borderRadius: 24, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 17, flexDirection: 'row', gap: 12 }, orderCode: { color: '#0F766E', fontSize: 10, fontWeight: '900' }, storeName: { color: '#0F172A', fontSize: 19, fontWeight: '900', marginTop: 5 }, summaryText: { color: '#64748B', fontSize: 12, marginTop: 5 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7, alignSelf: 'flex-start' }, badgeReady: { backgroundColor: '#DCFCE7' }, badgePending: { backgroundColor: '#FEF3C7' }, badgeText: { fontSize: 9, fontWeight: '900' }, readyText: { color: '#166534' }, pendingText: { color: '#92400E' },
  card: { marginHorizontal: 18, marginTop: 14, borderRadius: 24, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 17 }, sectionHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 14 }, sectionTitle: { color: '#0F172A', fontSize: 17, fontWeight: '900' }, sectionText: { color: '#64748B', fontSize: 11, lineHeight: 17, marginTop: 3 },
  itemCard: { borderRadius: 17, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC', padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 10 }, itemChecked: { borderColor: '#5EEAD4', backgroundColor: '#F0FDFA' }, checkbox: { width: 28, height: 28, borderRadius: 9, borderWidth: 2, borderColor: '#94A3B8', alignItems: 'center', justifyContent: 'center' }, checkboxChecked: { borderColor: '#0F766E', backgroundColor: '#0F766E' }, itemName: { color: '#0F172A', fontSize: 13, fontWeight: '900' }, itemMeta: { color: '#64748B', fontSize: 10, marginTop: 3 }, itemQty: { color: '#0F172A', fontSize: 15, fontWeight: '900' },
  input: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', paddingHorizontal: 13, color: '#0F172A', fontWeight: '700', marginTop: 10 }, multiline: { minHeight: 90, paddingTop: 12, textAlignVertical: 'top' },
  primary: { minHeight: 50, borderRadius: 15, backgroundColor: '#0F766E', marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, danger: { minHeight: 50, borderRadius: 15, backgroundColor: '#B91C1C', marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, primaryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' }, disabled: { opacity: 0.45 },
  success: { marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: '#BBF7D0', backgroundColor: '#F0FDF4', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }, successText: { flex: 1, color: '#166534', fontSize: 12, fontWeight: '800' },
  methodRow: { flexDirection: 'row', gap: 8 }, method: { flex: 1, minHeight: 44, borderRadius: 13, borderWidth: 1, borderColor: '#5EEAD4', backgroundColor: '#F0FDFA', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, methodActive: { backgroundColor: '#0F766E', borderColor: '#0F766E' }, methodText: { color: '#0F766E', fontSize: 12, fontWeight: '900' }, methodTextActive: { color: '#FFFFFF' },
  info: { marginTop: 13, borderRadius: 14, backgroundColor: '#F0FDFA', borderWidth: 1, borderColor: '#99F6E4', padding: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 8 }, infoText: { flex: 1, color: '#115E59', fontSize: 11, fontWeight: '700' },
  problemCard: { marginHorizontal: 18, marginTop: 14, borderRadius: 22, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', padding: 15 }, problemHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 }, problemTitle: { color: '#991B1B', fontSize: 15, fontWeight: '900' }, problemText: { color: '#B91C1C', fontSize: 11, marginTop: 3 }, problemLink: { color: '#991B1B', fontWeight: '900' }, problemBody: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#FECACA', paddingTop: 12 }, problemTypes: { gap: 8 }, problemChip: { borderRadius: 999, borderWidth: 1, borderColor: '#FCA5A5', backgroundColor: '#FFFFFF', paddingHorizontal: 11, paddingVertical: 8 }, problemChipActive: { backgroundColor: '#B91C1C', borderColor: '#B91C1C' }, problemChipText: { color: '#991B1B', fontSize: 10, fontWeight: '900' }, problemChipTextActive: { color: '#FFFFFF' },
});
