import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  FilePlus2,
  KeyRound,
  Minus,
  PackageCheck,
  Plus,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Store,
  XCircle,
} from 'lucide-react-native';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { pickupOperationsService } from '../../api/pickupOperationsService';
import { riderService, RIDER_WORKSPACE_QUERY_KEY } from '../../api/riderService';
import { normalizeParcelCount } from '../../domain/pickupOperations';
import { PartnerDocumentPicker, PartnerPickedDocument } from '../../native/PartnerDocumentPicker';
import { PartnerQrScanner } from '../../native/PartnerQrScanner';

const PICKUP_KEY = ['rider', 'pickup-operations'] as const;
const PROBLEM_TYPES = [
  ['MISSING_ITEM', 'Missing item'],
  ['WRONG_QUANTITY', 'Wrong quantity'],
  ['DAMAGED_PARCEL', 'Damaged parcel'],
  ['UNSEALED_PARCEL', 'Unsealed parcel'],
  ['OTHER', 'Other'],
] as const;

function errorMessage(error: any) {
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

export const RiderPickupOperationsScreen = ({ navigation, deliveryJobId }: { navigation?: any; deliveryJobId?: string }) => {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [parcelCode, setParcelCode] = useState('');
  const [pickupPin, setPickupPin] = useState('');
  const [parcelCount, setParcelCount] = useState('1');
  const [showProblem, setShowProblem] = useState(false);
  const [problemType, setProblemType] = useState('MISSING_ITEM');
  const [problemNote, setProblemNote] = useState('');
  const [evidence, setEvidence] = useState<PartnerPickedDocument[]>([]);

  const pickupQuery = useQuery({
    queryKey: [...PICKUP_KEY, deliveryJobId],
    queryFn: async () => {
      const pickups = await pickupOperationsService.getRiderPickups();
      return pickups.find((entry) => entry.job?.id === deliveryJobId) || null;
    },
    refetchInterval: 5_000,
    retry: 1,
  });
  const workspaceQuery = useQuery({
    queryKey: RIDER_WORKSPACE_QUERY_KEY,
    queryFn: riderService.getWorkspace,
    refetchInterval: 5_000,
    retry: 1,
  });

  const payload = pickupQuery.data;
  const job = payload?.job || workspaceQuery.data?.activeJobs?.find((entry) => entry.id === deliveryJobId) || null;
  const task = payload?.task || null;
  const checklist: any[] = Array.isArray(task?.checklist) ? task.checklist : [];
  const checklistVerified = task?.status === 'VERIFIED';
  const effectiveJobId = String(job?.id || deliveryJobId || '');

  useEffect(() => {
    if (!task) return;
    setQuantities(Object.fromEntries(checklist.map((item: any) => [
      item.orderItemId,
      Math.max(0, Number(item.checkedQuantity || 0)),
    ])));
    setParcelCode(task.parcelCode || '');
  }, [task?.updatedAt, task?.status, job?.id]);

  const exactQuantities = useMemo(() => checklist.length > 0 && checklist.every((item: any) => (
    Number(quantities[item.orderItemId] || 0) === Number(item.expectedQuantity || 0)
  )), [checklist, quantities]);
  const totalExpected = useMemo(() => checklist.reduce((sum, item) => sum + Number(item.expectedQuantity || 0), 0), [checklist]);
  const totalReceived = useMemo(() => checklist.reduce((sum, item) => sum + Number(quantities[item.orderItemId] || 0), 0), [checklist, quantities]);

  const refresh = async () => {
    await Promise.all([pickupQuery.refetch(), workspaceQuery.refetch()]);
  };

  const continueToCustomer = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: PICKUP_KEY }),
      queryClient.invalidateQueries({ queryKey: RIDER_WORKSPACE_QUERY_KEY }),
    ]);
    Toast.show({ type: 'success', text1: 'Pickup verified', text2: 'Opening customer delivery now.' });
    if (navigation && effectiveJobId) navigation.replace('RiderDelivery', { deliveryJobId: effectiveJobId });
  };

  const verifyChecklist = useMutation({
    mutationFn: async () => {
      if (!effectiveJobId) throw new Error('Active pickup job unavailable');
      if (!exactQuantities) throw new Error(`Expected ${totalExpected} units but received ${totalReceived}. Report the mismatch before handoff.`);
      return pickupOperationsService.verifyChecklist(effectiveJobId, {
        lines: checklist.map((item: any) => ({
          orderItemId: item.orderItemId,
          checkedQuantity: Number(quantities[item.orderItemId] || 0),
        })),
        parcelCode: parcelCode.trim() || undefined,
      });
    },
    onSuccess: async () => {
      Toast.show({ type: 'success', text1: 'Exact quantities verified', text2: 'Verify the store handoff using PIN or secure QR.' });
      await refresh();
    },
    onError: (error: any) => Toast.show({ type: 'error', text1: 'Checklist failed', text2: errorMessage(error) }),
  });

  const verifyPin = useMutation({
    mutationFn: async () => {
      if (!effectiveJobId) throw new Error('Active pickup job unavailable');
      if (!/^\d{6}$/.test(pickupPin)) throw new Error('Enter the six-digit PIN shown by the store.');
      const location = await captureLocation();
      return pickupOperationsService.verifyChallenge(effectiveJobId, {
        method: 'STORE_PICKUP_PIN',
        code: pickupPin,
        parcelCount: normalizeParcelCount(parcelCount),
        ...(location || {}),
      });
    },
    onSuccess: async () => {
      setPickupPin('');
      await continueToCustomer();
    },
    onError: (error: any) => Toast.show({ type: 'error', text1: 'Pickup PIN failed', text2: errorMessage(error) }),
  });

  const verifyQr = useMutation({
    mutationFn: async () => {
      if (!effectiveJobId) throw new Error('Active pickup job unavailable');
      const result = await PartnerQrScanner.scan();
      const location = await captureLocation();
      return pickupOperationsService.verifyChallenge(effectiveJobId, {
        method: 'QR_CODE',
        code: result.value,
        parcelCount: normalizeParcelCount(parcelCount),
        ...(location || {}),
      });
    },
    onSuccess: continueToCustomer,
    onError: (error: any) => {
      if (!String(error?.message || '').toLowerCase().includes('cancel')) {
        Toast.show({ type: 'error', text1: 'Secure QR verification failed', text2: errorMessage(error) });
      }
    },
  });

  const reportProblem = useMutation({
    mutationFn: async () => {
      if (!effectiveJobId) throw new Error('Active pickup job unavailable');
      if (problemNote.trim().length < 5) throw new Error('Describe the problem in at least 5 characters.');
      const evidenceKeys: string[] = [];
      for (const file of evidence) evidenceKeys.push((await riderService.uploadEvidence(file)).storageKey);
      return pickupOperationsService.reportProblem(effectiveJobId, {
        problemType,
        note: `${problemNote.trim()} Expected ${totalExpected}; received ${totalReceived}.`,
        evidenceKeys,
      });
    },
    onSuccess: async (result: any) => {
      setShowProblem(false);
      setProblemNote('');
      setEvidence([]);
      Toast.show({ type: 'success', text1: 'Pickup problem reported', text2: result?.supportTicketId ? 'Evidence was attached to a job-linked support ticket.' : 'The store can now correct the parcel.' });
      await refresh();
    },
    onError: (error: any) => Toast.show({ type: 'error', text1: 'Problem report failed', text2: errorMessage(error) }),
  });

  const pickEvidence = async (source: 'DOCUMENT' | 'CAMERA') => {
    try {
      const file = source === 'CAMERA' ? await PartnerDocumentPicker.captureImage() : await PartnerDocumentPicker.pickDocument();
      setEvidence((current) => current.length >= 8 ? current : [...current, file]);
    } catch (error: any) {
      if (!String(error?.message || '').toLowerCase().includes('cancel')) Toast.show({ type: 'error', text1: 'Evidence selection failed', text2: errorMessage(error) });
    }
  };

  const busy = verifyChecklist.isPending || verifyPin.isPending || verifyQr.isPending || reportProblem.isPending;
  const pickupPinValid = /^\d{6}$/.test(pickupPin);

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      refreshControl={<RefreshControl refreshing={pickupQuery.isRefetching || workspaceQuery.isRefetching} onRefresh={() => void refresh()} />}
    >
      <View style={styles.hero}>
        <View style={styles.flex}><Text style={styles.eyebrow}>RIDER PICKUP</Text><Text style={styles.title}>Verify exact handoff</Text><Text style={styles.subtitle}>Count every unit, then verify the owning store.</Text></View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Refresh pickup" style={styles.refreshButton} onPress={() => void refresh()}><RefreshCw size={20} color="#FFFFFF" /></TouchableOpacity>
      </View>

      {pickupQuery.isLoading && !job ? (
        <State loading title="Loading pickup task" text="Reading the canonical store handoff." />
      ) : pickupQuery.error && !job ? (
        <State title="Pickup task unavailable" text={errorMessage(pickupQuery.error)} />
      ) : !job || !task ? (
        <State title="No pickup waiting" text="The app is checking whether the store already confirmed handoff." />
      ) : (
        <>
          <View style={styles.summaryCard}>
            <View style={styles.flex}><Text style={styles.orderCode}>ORDER #{shortId(job.order?.id || job.orderId)}</Text><Text style={styles.storeName}>{job.order?.store?.name || 'Aagaam store'}</Text><Text style={styles.summaryText}>{checklist.length} lines · expected {totalExpected} · received {totalReceived}</Text></View>
            <View style={[styles.badge, checklistVerified ? styles.badgeReady : exactQuantities ? styles.badgeReady : styles.badgePending]}><Text style={styles.badgeText}>{checklistVerified ? 'VERIFIED' : `${totalReceived}/${totalExpected}`}</Text></View>
          </View>

          <View style={styles.card}>
            <View style={styles.sectionHeader}><ClipboardCheck size={22} color="#0F766E" /><View style={styles.flex}><Text style={styles.sectionTitle}>Exact item quantities</Text><Text style={styles.sectionText}>Use + and − to record what is physically received.</Text></View></View>
            {checklist.map((item: any) => {
              const expected = Number(item.expectedQuantity || 0);
              const received = Number(quantities[item.orderItemId] || 0);
              const matches = expected === received;
              return (
                <View key={item.orderItemId} style={[styles.itemCard, matches && styles.itemMatched]}>
                  <View style={styles.flex}><Text style={styles.itemName}>{item.name || 'Order item'}</Text><Text style={[styles.itemMeta, !matches && styles.mismatch]}>Expected {expected} / received {received}</Text></View>
                  <View style={styles.counter}>
                    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Decrease received quantity for ${item.name || 'item'}`} disabled={checklistVerified || busy || received <= 0} style={styles.counterButton} onPress={() => setQuantities((current) => ({ ...current, [item.orderItemId]: Math.max(0, received - 1) }))}><Minus size={18} color="#0F766E" /></TouchableOpacity>
                    <Text style={styles.counterValue}>{received}</Text>
                    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Increase received quantity for ${item.name || 'item'}`} disabled={checklistVerified || busy || received >= 999} style={styles.counterButton} onPress={() => setQuantities((current) => ({ ...current, [item.orderItemId]: received + 1 }))}><Plus size={18} color="#0F766E" /></TouchableOpacity>
                  </View>
                </View>
              );
            })}
            <TextInput value={parcelCode} onChangeText={setParcelCode} editable={!checklistVerified && !busy} placeholder="Optional parcel or seal code" placeholderTextColor="#94A3B8" maxLength={100} style={styles.input} />
            {checklistVerified ? (
              <View style={styles.successCard}><ShieldCheck size={20} color="#15803D" /><Text style={styles.successText}>Exact quantities are locked and verified.</Text></View>
            ) : (
              <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: !exactQuantities || busy }} disabled={!exactQuantities || busy} style={[styles.primaryButton, (!exactQuantities || busy) && styles.disabled]} onPress={() => Alert.alert('Verify exact quantities?', `Expected ${totalExpected} and received ${totalReceived}.`, [{ text: 'Back', style: 'cancel' }, { text: 'Verify', onPress: () => verifyChecklist.mutate() }])}>{verifyChecklist.isPending ? <ActivityIndicator color="#FFFFFF" /> : <CheckCircle2 size={18} color="#FFFFFF" />}<Text style={styles.buttonText}>Verify exact checklist</Text></TouchableOpacity>
            )}
          </View>

          {checklistVerified ? (
            <View style={styles.card}>
              <View style={styles.sectionHeader}><Store size={22} color="#0F766E" /><View style={styles.flex}><Text style={styles.sectionTitle}>Secure store handoff</Text><Text style={styles.sectionText}>Use the store-issued PIN or scan its expiring QR challenge.</Text></View></View>
              <TextInput value={parcelCount} onChangeText={(value) => setParcelCount(value.replace(/\D/g, '').slice(0, 3))} placeholder="Parcel count" placeholderTextColor="#94A3B8" keyboardType="number-pad" style={styles.input} />
              <TextInput value={pickupPin} onChangeText={(value) => setPickupPin(value.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit store PIN" placeholderTextColor="#94A3B8" keyboardType="number-pad" maxLength={6} style={[styles.input, styles.pinInput]} />
              <View style={styles.handoffActions}>
                <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: !pickupPinValid || busy }} disabled={!pickupPinValid || busy} style={[styles.handoffButton, (!pickupPinValid || busy) && styles.disabled]} onPress={() => verifyPin.mutate()}>{verifyPin.isPending ? <ActivityIndicator color="#FFFFFF" /> : <KeyRound size={19} color="#FFFFFF" />}<Text style={styles.buttonText}>Verify PIN</Text></TouchableOpacity>
                <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} style={[styles.qrButton, busy && styles.disabled]} onPress={() => verifyQr.mutate()}>{verifyQr.isPending ? <ActivityIndicator color="#0F766E" /> : <QrCode size={21} color="#0F766E" />}<Text style={styles.qrText}>Scan QR</Text></TouchableOpacity>
              </View>
              <View style={styles.infoCard}><RefreshCw size={18} color="#0F766E" /><Text style={styles.infoText}>Store-confirmed handoff is checked automatically every five seconds. The route changes directly to customer delivery after canonical verification.</Text></View>
            </View>
          ) : null}

          <View style={styles.problemCard}>
            <TouchableOpacity accessibilityRole="button" style={styles.problemHeader} onPress={() => setShowProblem((value) => !value)}><XCircle size={20} color="#B91C1C" /><View style={styles.flex}><Text style={styles.problemTitle}>Quantity or parcel mismatch?</Text><Text style={styles.problemText}>Attach image or PDF evidence before pickup.</Text></View><Text style={styles.problemLink}>{showProblem ? 'Close' : 'Report'}</Text></TouchableOpacity>
            {showProblem ? (
              <View style={styles.problemBody}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.problemTypes}>{PROBLEM_TYPES.map(([value, problemLabel]) => <TouchableOpacity key={value} accessibilityRole="button" accessibilityState={{ selected: problemType === value }} style={[styles.problemChip, problemType === value && styles.problemChipActive]} onPress={() => setProblemType(value)}><Text style={[styles.problemChipText, problemType === value && styles.problemChipTextActive]}>{problemLabel}</Text></TouchableOpacity>)}</ScrollView>
                <TextInput value={problemNote} onChangeText={setProblemNote} placeholder="Describe what is missing, damaged, or incorrect" placeholderTextColor="#94A3B8" multiline maxLength={500} style={[styles.input, styles.multiline]} />
                <View style={styles.evidenceActions}><TouchableOpacity accessibilityRole="button" style={styles.evidenceButton} onPress={() => void pickEvidence('CAMERA')}><Camera size={18} color="#0F766E" /><Text style={styles.evidenceText}>Photo</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" style={styles.evidenceButton} onPress={() => void pickEvidence('DOCUMENT')}><FilePlus2 size={18} color="#0F766E" /><Text style={styles.evidenceText}>Image/PDF</Text></TouchableOpacity></View>
                {evidence.map((file, index) => <TouchableOpacity key={`${file.uri}-${index}`} accessibilityRole="button" accessibilityLabel={`Remove ${file.name}`} style={styles.fileRow} onPress={() => setEvidence((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Text numberOfLines={1} style={styles.fileName}>{file.name}</Text><Text style={styles.remove}>Remove</Text></TouchableOpacity>)}
                <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} style={[styles.dangerButton, busy && styles.disabled]} onPress={() => reportProblem.mutate()}>{reportProblem.isPending ? <ActivityIndicator color="#FFFFFF" /> : <AlertTriangle size={18} color="#FFFFFF" />}<Text style={styles.buttonText}>Submit evidence report</Text></TouchableOpacity>
              </View>
            ) : null}
          </View>
        </>
      )}
    </ScrollView>
  );
};

function State({ loading = false, title, text }: { loading?: boolean; title: string; text: string }) {
  return <View style={styles.state}>{loading ? <ActivityIndicator size="large" color="#0F766E" /> : <PackageCheck size={48} color="#94A3B8" />}<Text style={styles.stateTitle}>{title}</Text><Text style={styles.stateText}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F8FAFC' }, content: { paddingBottom: 20 }, flex: { flex: 1 },
  hero: { backgroundColor: '#0F172A', paddingTop: 24, paddingHorizontal: 18, paddingBottom: 22, flexDirection: 'row', alignItems: 'center', gap: 12 }, eyebrow: { color: '#A7F3D0', fontSize: 9, fontWeight: '900', letterSpacing: 1 }, title: { color: '#FFFFFF', fontSize: 23, fontWeight: '900', marginTop: 2 }, subtitle: { color: '#CBD5E1', fontSize: 11, marginTop: 4 }, refreshButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  summaryCard: { margin: 14, marginBottom: 0, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 15, flexDirection: 'row', alignItems: 'center' }, orderCode: { color: '#0F766E', fontSize: 10, fontWeight: '900' }, storeName: { color: '#0F172A', fontSize: 17, fontWeight: '900', marginTop: 3 }, summaryText: { color: '#64748B', fontSize: 10, marginTop: 4 }, badge: { borderRadius: 11, paddingHorizontal: 10, paddingVertical: 7 }, badgeReady: { backgroundColor: '#DCFCE7' }, badgePending: { backgroundColor: '#FEF3C7' }, badgeText: { color: '#0F172A', fontSize: 10, fontWeight: '900' },
  card: { margin: 14, marginBottom: 0, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 15 }, sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 9 }, sectionTitle: { color: '#0F172A', fontSize: 16, fontWeight: '900' }, sectionText: { color: '#64748B', fontSize: 10, lineHeight: 15, marginTop: 3 },
  itemCard: { minHeight: 72, borderRadius: 14, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', padding: 12, marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 9 }, itemMatched: { backgroundColor: '#F0FDF4', borderColor: '#86EFAC' }, itemName: { color: '#0F172A', fontSize: 12, fontWeight: '900' }, itemMeta: { color: '#15803D', fontSize: 10, fontWeight: '800', marginTop: 4 }, mismatch: { color: '#B45309' }, counter: { flexDirection: 'row', alignItems: 'center', gap: 8 }, counterButton: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#CCFBF1', alignItems: 'center', justifyContent: 'center' }, counterValue: { minWidth: 28, color: '#0F172A', fontSize: 17, fontWeight: '900', textAlign: 'center' },
  input: { minHeight: 50, borderRadius: 13, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC', paddingHorizontal: 12, color: '#0F172A', marginTop: 10 }, pinInput: { letterSpacing: 8, fontSize: 18, textAlign: 'center' }, multiline: { minHeight: 110, paddingTop: 12, textAlignVertical: 'top' },
  successCard: { borderRadius: 13, backgroundColor: '#F0FDF4', padding: 12, marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }, successText: { flex: 1, color: '#166534', fontSize: 11, fontWeight: '800' }, primaryButton: { minHeight: 50, borderRadius: 14, backgroundColor: '#067B5C', marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, buttonText: { color: '#FFFFFF', fontWeight: '900' }, disabled: { opacity: 0.45 },
  handoffActions: { flexDirection: 'row', gap: 8, marginTop: 10 }, handoffButton: { flex: 1, minHeight: 50, borderRadius: 14, backgroundColor: '#067B5C', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, qrButton: { flex: 1, minHeight: 50, borderRadius: 14, backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#99F6E4', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, qrText: { color: '#0F766E', fontWeight: '900' }, infoCard: { borderRadius: 13, backgroundColor: '#ECFDF5', padding: 11, marginTop: 10, flexDirection: 'row', gap: 8 }, infoText: { flex: 1, color: '#0F766E', fontSize: 10, lineHeight: 15 },
  problemCard: { margin: 14, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#FECACA', overflow: 'hidden' }, problemHeader: { minHeight: 72, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 9 }, problemTitle: { color: '#991B1B', fontSize: 13, fontWeight: '900' }, problemText: { color: '#7F1D1D', fontSize: 10, marginTop: 3 }, problemLink: { color: '#B91C1C', fontSize: 11, fontWeight: '900' }, problemBody: { borderTopWidth: 1, borderTopColor: '#FECACA', padding: 14 }, problemTypes: { gap: 7, paddingBottom: 2 }, problemChip: { minHeight: 36, borderRadius: 11, backgroundColor: '#FEF2F2', paddingHorizontal: 11, justifyContent: 'center' }, problemChipActive: { backgroundColor: '#B91C1C' }, problemChipText: { color: '#991B1B', fontSize: 9, fontWeight: '800' }, problemChipTextActive: { color: '#FFFFFF' },
  evidenceActions: { flexDirection: 'row', gap: 8, marginTop: 9 }, evidenceButton: { flex: 1, minHeight: 44, borderRadius: 12, backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#99F6E4', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, evidenceText: { color: '#0F766E', fontSize: 11, fontWeight: '900' }, fileRow: { minHeight: 40, borderRadius: 10, backgroundColor: '#F8FAFC', marginTop: 7, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center' }, fileName: { flex: 1, color: '#334155', fontSize: 10 }, remove: { color: '#B91C1C', fontSize: 10, fontWeight: '900' }, dangerButton: { minHeight: 49, borderRadius: 13, backgroundColor: '#B91C1C', marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  state: { minHeight: 480, alignItems: 'center', justifyContent: 'center', padding: 28 }, stateTitle: { color: '#0F172A', fontSize: 19, fontWeight: '900', marginTop: 12 }, stateText: { color: '#64748B', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 6 },
});
