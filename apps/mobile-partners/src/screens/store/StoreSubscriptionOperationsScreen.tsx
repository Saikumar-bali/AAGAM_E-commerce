import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NavigationProp } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import {
  ArrowLeft,
  Banknote,
  Box,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  PackageCheck,
  RefreshCw,
  Route,
  ScanLine,
  Store,
  Truck,
  X,
} from 'lucide-react-native';
import {
  CashDepositBatch,
  StoreRun,
  subscriptionOperationsService,
} from '../../api/subscriptionOperationsService';
import type { StoreTabParamList } from '../../navigation/partnerNavigationTypes';

const STORE_SUBSCRIPTION_KEY = ['store', 'subscription-operations'] as const;
type Section = 'runs' | 'forecast' | 'cash' | 'exceptions';

function money(paise: number) {
  return `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function label(value: string) {
  return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function errorMessage(error: unknown) {
  const candidate = error as { response?: { data?: { message?: string | string[] } }; message?: string };
  const value = candidate?.response?.data?.message;
  return Array.isArray(value) ? value.join(', ') : value || candidate?.message || 'The operation could not be completed.';
}

function RunStatus({ value }: { value: string }) {
  const ready = ['READY_FOR_PICKUP', 'PICKED_UP', 'IN_PROGRESS', 'COMPLETED'].includes(value);
  const warning = ['AWAITING_SETTLEMENT', 'RETURNING'].includes(value);
  return <View style={[styles.statusChip, ready ? styles.statusReady : warning ? styles.statusWarning : styles.statusNeutral]}><Text style={[styles.statusText, ready ? styles.statusReadyText : warning ? styles.statusWarningText : styles.statusNeutralText]}>{label(value)}</Text></View>;
}

export const StoreSubscriptionOperationsScreen = ({ navigation }: { navigation: NavigationProp<StoreTabParamList> }) => {
  const queryClient = useQueryClient();
  const [section, setSection] = useState<Section>('runs');
  const [packingRun, setPackingRun] = useState<StoreRun | null>(null);
  const [packedBagCount, setPackedBagCount] = useState('');
  const [crateCode, setCrateCode] = useState('');
  const [exceptionNote, setExceptionNote] = useState('');
  const [cashBatch, setCashBatch] = useState<CashDepositBatch | null>(null);
  const [verifiedAmount, setVerifiedAmount] = useState('');
  const [settlementReference, setSettlementReference] = useState('');
  const [varianceReason, setVarianceReason] = useState('');

  const runsQuery = useQuery({ queryKey: [...STORE_SUBSCRIPTION_KEY, 'runs'], queryFn: subscriptionOperationsService.getStoreRuns, refetchInterval: 12_000, retry: 1 });
  const demandQuery = useQuery({ queryKey: [...STORE_SUBSCRIPTION_KEY, 'demand'], queryFn: () => subscriptionOperationsService.getStoreDemand(14), retry: 1 });
  const exceptionsQuery = useQuery({ queryKey: [...STORE_SUBSCRIPTION_KEY, 'exceptions'], queryFn: subscriptionOperationsService.getStoreExceptions, retry: 1 });
  const cashQuery = useQuery({ queryKey: [...STORE_SUBSCRIPTION_KEY, 'cash'], queryFn: subscriptionOperationsService.getStoreCashBatches, refetchInterval: 15_000, retry: 1 });

  const runs = runsQuery.data || [];
  const demand = demandQuery.data || [];
  const exceptions = exceptionsQuery.data || [];
  const cashBatches = cashQuery.data || [];
  const stops = runs.reduce((sum, run) => sum + Number(run.totalStopCount || run.stops.length || 0), 0);
  const products = demand.reduce((sum, row) => sum + row.productTotals.reduce((itemSum, item) => itemSum + item.quantity, 0), 0);
  const submittedCash = cashBatches.filter((batch) => batch.status === 'SUBMITTED').reduce((sum, batch) => sum + Number(batch.submittedAmountPaise || 0), 0);
  const pendingPacking = runs.filter((run) => run.status === 'PLANNED').length;

  const refresh = async () => {
    await Promise.all([runsQuery.refetch(), demandQuery.refetch(), exceptionsQuery.refetch(), cashQuery.refetch()]);
  };

  const packingMutation = useMutation({
    mutationFn: async () => {
      if (!packingRun) throw new Error('Choose a route to pack.');
      const packed = Number(packedBagCount);
      if (!Number.isInteger(packed) || packed < 1) throw new Error('Enter the number of packed bags.');
      const expected = Number(packingRun.expectedBagCount || packingRun.totalStopCount || packingRun.stops.length || 0);
      if (packed !== expected && exceptionNote.trim().length < 5) throw new Error('Explain any bag-count difference.');
      return subscriptionOperationsService.confirmRunPacking(packingRun.id, {
        version: packingRun.version,
        expectedBagCount: expected,
        packedBagCount: packed,
        crateCode: crateCode.trim() || undefined,
        exceptionNote: exceptionNote.trim() || undefined,
      });
    },
    onSuccess: async () => {
      setPackingRun(null); setPackedBagCount(''); setCrateCode(''); setExceptionNote('');
      await refresh();
      Toast.show({ type: 'success', text1: 'Route packing confirmed', text2: 'Each order is packed and ready for rider pickup.' });
    },
    onError: (error) => Toast.show({ type: 'error', text1: 'Packing not confirmed', text2: errorMessage(error) }),
  });

  const pickupMutation = useMutation({
    mutationFn: (run: StoreRun) => subscriptionOperationsService.confirmRunPickup(run.id, run.version),
    onSuccess: async () => { await refresh(); Toast.show({ type: 'success', text1: 'Store handoff confirmed', text2: 'The rider must now independently verify the route bags.' }); },
    onError: (error) => Toast.show({ type: 'error', text1: 'Handoff not confirmed', text2: errorMessage(error) }),
  });

  const verifyMutation = useMutation({
    mutationFn: async () => {
      if (!cashBatch) throw new Error('Choose a submitted batch.');
      const paise = Math.round(Number(verifiedAmount) * 100);
      if (!Number.isFinite(paise) || paise < 0) throw new Error('Enter the independently counted physical amount.');
      if (settlementReference.trim().length < 3) throw new Error('Enter the store settlement reference.');
      if (paise !== cashBatch.expectedAmountPaise && varianceReason.trim().length < 3) throw new Error('A variance reason is required when the amount differs.');
      return subscriptionOperationsService.verifyCashBatch(cashBatch.id, {
        version: cashBatch.version,
        verifiedAmountPaise: paise,
        settlementReference: settlementReference.trim(),
        varianceReason: varianceReason.trim() || undefined,
      });
    },
    onSuccess: async (batch) => {
      setCashBatch(null); setVerifiedAmount(''); setSettlementReference(''); setVarianceReason('');
      await refresh();
      Toast.show({ type: batch.status === 'VARIANCE_REVIEW' ? 'info' : 'success', text1: batch.status === 'VARIANCE_REVIEW' ? 'Variance recorded' : 'Cash batch settled', text2: batch.status === 'VARIANCE_REVIEW' ? 'Admin review is required; individual COD ledgers remain auditable.' : 'All included individual COD ledgers were deposited.' });
    },
    onError: (error) => Toast.show({ type: 'error', text1: 'Cash verification failed', text2: errorMessage(error) }),
  });

  const loading = runsQuery.isLoading || demandQuery.isLoading || cashQuery.isLoading || exceptionsQuery.isLoading;
  const currentError = runsQuery.error || demandQuery.error || cashQuery.error || exceptionsQuery.error;

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#057A55" />
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={runsQuery.isRefetching || demandQuery.isRefetching || cashQuery.isRefetching || exceptionsQuery.isRefetching} onRefresh={() => void refresh()} tintColor="#FFFFFF" />}>
        <View style={styles.hero}>
          <View style={styles.heroGlow} />
          <View style={styles.headerRow}><TouchableOpacity accessibilityLabel="Back" style={styles.backButton} onPress={() => navigation.goBack()}><ArrowLeft size={22} color="#FFFFFF" /></TouchableOpacity><View style={styles.headerCopy}><Text style={styles.eyebrow}>SUBSCRIPTION FULFILMENT</Text><Text style={styles.title}>Morning Runs</Text></View><View style={styles.headerIcon}><Route size={27} color="#057A55" /></View></View>
          <Text style={styles.subtitle}>Prepare by route, verify bag counts, hand off once, then preserve independent proof and COD accountability for every customer stop.</Text>
          <View style={styles.heroMetrics}>
            <View style={styles.heroMetric}><Text style={styles.heroMetricValue}>{runs.length}</Text><Text style={styles.heroMetricLabel}>routes today</Text></View><View style={styles.heroDivider} />
            <View style={styles.heroMetric}><Text style={styles.heroMetricValue}>{stops}</Text><Text style={styles.heroMetricLabel}>customer bags</Text></View><View style={styles.heroDivider} />
            <View style={styles.heroMetric}><Text style={styles.heroMetricValue}>{money(submittedCash)}</Text><Text style={styles.heroMetricLabel}>cash to verify</Text></View>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.segmentRow}>
          {([
            ['runs', 'Runs', pendingPacking],
            ['forecast', '14-day demand', products],
            ['cash', 'Cash', cashBatches.filter((batch) => batch.status === 'SUBMITTED').length],
            ['exceptions', 'Exceptions', exceptions.length],
          ] as Array<[Section, string, number]>).map(([value, text, count]) => <TouchableOpacity key={value} style={[styles.segment, section === value && styles.segmentActive]} onPress={() => setSection(value)}><Text style={[styles.segmentText, section === value && styles.segmentTextActive]}>{text}</Text>{count > 0 ? <View style={[styles.segmentCount, section === value && styles.segmentCountActive]}><Text style={[styles.segmentCountText, section === value && styles.segmentCountTextActive]}>{count > 99 ? '99+' : count}</Text></View> : null}</TouchableOpacity>)}
        </ScrollView>

        {loading ? <View style={styles.stateCard}><ActivityIndicator size="large" color="#087B5A" /><Text style={styles.stateText}>Loading subscription operations…</Text></View> : currentError ? <View style={styles.stateCard}><CircleAlert size={42} color="#B42318" /><Text style={styles.stateTitle}>Operations unavailable</Text><Text style={styles.stateText}>{errorMessage(currentError)}</Text><TouchableOpacity style={styles.retryButton} onPress={() => void refresh()}><RefreshCw size={18} color="#FFFFFF" /><Text style={styles.retryText}>Retry</Text></TouchableOpacity></View> : null}

        {!loading && !currentError && section === 'runs' ? <View style={styles.sectionBody}>{runs.length ? runs.map((run) => <RunCard key={run.id} run={run} onPack={() => { setPackingRun(run); setPackedBagCount(String(run.expectedBagCount || run.totalStopCount || run.stops.length)); }} onPickup={() => pickupMutation.mutate(run)} pickupBusy={pickupMutation.isPending} />) : <EmptyState icon={Route} title="No routes today" text="Generated subscription orders will be grouped here by store, slot, and delivery cluster." />}</View> : null}

        {!loading && !currentError && section === 'forecast' ? <View style={styles.sectionBody}>{demand.length ? demand.map((row) => <View key={`${row.storeId}:${row.serviceDate}`} style={styles.forecastCard}><View style={styles.forecastTop}><View><Text style={styles.forecastDate}>{new Date(`${row.serviceDate}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</Text><Text style={styles.forecastStops}>{row.stopCount} customer bag{row.stopCount === 1 ? '' : 's'}</Text></View><View style={styles.productTotalBadge}><Box size={17} color="#087B5A" /><Text style={styles.productTotalText}>{row.productTotals.reduce((sum, item) => sum + item.quantity, 0)} items</Text></View></View><View style={styles.productList}>{row.productTotals.map((item) => <View key={item.productId} style={styles.productRow}><Text style={styles.productName}>{item.name}</Text><Text style={styles.productQuantity}>× {item.quantity}</Text></View>)}</View></View>) : <EmptyState icon={PackageCheck} title="No forecast demand" text="Future active occurrences will appear without reserving inventory upfront." />}</View> : null}

        {!loading && !currentError && section === 'cash' ? <View style={styles.sectionBody}>{cashBatches.length ? cashBatches.map((batch) => <View key={batch.id} style={styles.cashCard}><View style={styles.cashHeader}><View style={styles.cashIcon}><Banknote size={22} color="#A15C00" /></View><View style={styles.cashCopy}><Text style={styles.cashReference}>{batch.reference}</Text><Text style={styles.cashStatus}>{label(batch.status)}</Text></View><Text style={styles.cashAmount}>{money(batch.status === 'SUBMITTED' ? batch.submittedAmountPaise : batch.expectedAmountPaise)}</Text></View><View style={styles.cashGrid}><Metric label="Expected" value={money(batch.expectedAmountPaise)} /><Metric label="Submitted" value={money(batch.submittedAmountPaise)} /><Metric label="Verified" value={money(batch.verifiedAmountPaise)} /><Metric label="Variance" value={money(batch.variancePaise)} danger={batch.variancePaise !== 0} /></View>{batch.status === 'SUBMITTED' ? <TouchableOpacity style={styles.verifyButton} onPress={() => { setCashBatch(batch); setVerifiedAmount(String(batch.submittedAmountPaise / 100)); setSettlementReference(`STORE-${batch.reference}`); }}><ClipboardCheck size={19} color="#FFFFFF" /><Text style={styles.verifyButtonText}>Independently count and verify</Text><ChevronRight size={18} color="#FFFFFF" /></TouchableOpacity> : null}</View>) : <EmptyState icon={Banknote} title="No cash batches" text="Submitted rider batches will appear here for independent store verification." />}</View> : null}

        {!loading && !currentError && section === 'exceptions' ? <View style={styles.sectionBody}>{exceptions.length ? exceptions.map((item) => <View key={item.id} style={styles.exceptionCard}><CircleAlert size={22} color="#B42318" /><View style={styles.exceptionCopy}><Text style={styles.exceptionTitle}>Stop {item.sequenceNumber} · {label(item.status)}</Text><Text style={styles.exceptionText}>{item.failureReason || 'Operational follow-up required'}</Text><Text style={styles.exceptionRoute}>{item.deliveryRun?.routeCode || 'Route'} · {item.deliveryRun?.store?.name || 'Store'}</Text></View></View>) : <EmptyState icon={CheckCircle2} title="No open exceptions" text="Failed, retry-pending, and return-required stops will appear here." />}</View> : null}
      </ScrollView>

      <Modal visible={Boolean(packingRun)} transparent animationType="slide" onRequestClose={() => setPackingRun(null)}>
        <View style={styles.modalBackdrop}><View style={styles.sheet}><View style={styles.handle} /><View style={styles.sheetHeader}><View><Text style={styles.sheetEyebrow}>ROUTE PACKING</Text><Text style={styles.sheetTitle}>{packingRun?.routeCode}</Text></View><TouchableOpacity style={styles.closeButton} onPress={() => setPackingRun(null)}><X size={21} color="#475569" /></TouchableOpacity></View><ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
          <View style={styles.expectedBox}><PackageCheck size={25} color="#087B5A" /><View><Text style={styles.expectedLabel}>Expected customer bags</Text><Text style={styles.expectedValue}>{packingRun?.expectedBagCount || packingRun?.totalStopCount || packingRun?.stops.length || 0}</Text></View></View>
          <Text style={styles.inputLabel}>Packed bag count</Text><TextInput style={styles.input} keyboardType="number-pad" value={packedBagCount} onChangeText={(value) => setPackedBagCount(value.replace(/\D/g, ''))} placeholder="0" placeholderTextColor="#94A3B8" />
          <Text style={styles.inputLabel}>Route crate QR / code (optional)</Text><View style={styles.scanInput}><ScanLine size={20} color="#087B5A" /><TextInput style={styles.scanTextInput} value={crateCode} onChangeText={setCrateCode} placeholder="Scan or enter crate code" placeholderTextColor="#94A3B8" autoCapitalize="characters" /></View>
          <Text style={styles.inputLabel}>Exception note</Text><TextInput style={[styles.input, styles.noteInput]} multiline value={exceptionNote} onChangeText={setExceptionNote} placeholder="Required only for a bag-count or packing exception" placeholderTextColor="#94A3B8" />
          <TouchableOpacity style={styles.sheetPrimary} disabled={packingMutation.isPending} onPress={() => packingMutation.mutate()}><PackageCheck size={20} color="#FFFFFF" /><Text style={styles.sheetPrimaryText}>{packingMutation.isPending ? 'Confirming…' : 'Confirm route packing'}</Text></TouchableOpacity>
        </ScrollView></View></View>
      </Modal>

      <Modal visible={Boolean(cashBatch)} transparent animationType="slide" onRequestClose={() => setCashBatch(null)}>
        <View style={styles.modalBackdrop}><View style={styles.sheet}><View style={styles.handle} /><View style={styles.sheetHeader}><View><Text style={styles.sheetEyebrow}>INDEPENDENT CASH COUNT</Text><Text style={styles.sheetTitle}>{cashBatch?.reference}</Text></View><TouchableOpacity style={styles.closeButton} onPress={() => setCashBatch(null)}><X size={21} color="#475569" /></TouchableOpacity></View><ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
          <View style={styles.cashCompare}><Metric label="Server expected" value={money(cashBatch?.expectedAmountPaise || 0)} /><Metric label="Rider submitted" value={money(cashBatch?.submittedAmountPaise || 0)} /></View>
          <Text style={styles.inputLabel}>Amount physically counted</Text><TextInput style={[styles.input, styles.moneyInput]} keyboardType="decimal-pad" value={verifiedAmount} onChangeText={setVerifiedAmount} placeholder="0.00" placeholderTextColor="#94A3B8" />
          <Text style={styles.inputLabel}>Settlement reference</Text><TextInput style={styles.input} value={settlementReference} onChangeText={setSettlementReference} placeholder="Store receipt / register reference" placeholderTextColor="#94A3B8" autoCapitalize="characters" />
          <Text style={styles.inputLabel}>Variance reason (required when different)</Text><TextInput style={[styles.input, styles.noteInput]} multiline value={varianceReason} onChangeText={setVarianceReason} placeholder="Count discrepancy, damaged note, missing cash…" placeholderTextColor="#94A3B8" />
          <Text style={styles.auditNote}>Verification updates every included COD ledger with immutable deposit entries. A difference creates VARIANCE_REVIEW; it is never silently written off.</Text>
          <TouchableOpacity style={styles.sheetPrimary} disabled={verifyMutation.isPending} onPress={() => verifyMutation.mutate()}><ClipboardCheck size={20} color="#FFFFFF" /><Text style={styles.sheetPrimaryText}>{verifyMutation.isPending ? 'Verifying…' : 'Verify physical cash batch'}</Text></TouchableOpacity>
        </ScrollView></View></View>
      </Modal>
    </View>
  );
};

function RunCard({ run, onPack, onPickup, pickupBusy }: { run: StoreRun; onPack: () => void; onPickup: () => void; pickupBusy: boolean }) {
  const productTotals = new Map<string, number>();
  for (const stop of run.stops) for (const item of stop.subscriptionDelivery.order?.items || []) productTotals.set(item.product.name, (productTotals.get(item.product.name) || 0) + item.quantity);
  return <View style={styles.runCard}><View style={styles.runHeader}><View style={styles.runIcon}><Route size={22} color="#087B5A" /></View><View style={styles.runCopy}><Text style={styles.runCode}>{run.routeCode}</Text><Text style={styles.runRider}>{run.rider?.user?.name ? `Rider: ${run.rider.user.name}` : 'Rider not assigned'}</Text></View><RunStatus value={run.status} /></View><View style={styles.runMetrics}><Metric label="Stops" value={String(run.totalStopCount || run.stops.length)} /><Metric label="Bags" value={String(run.expectedBagCount || run.totalStopCount || run.stops.length)} /><Metric label="Cash due" value={money(run.expectedCashPaise)} /></View>{productTotals.size ? <View style={styles.productSummary}>{[...productTotals.entries()].map(([name, quantity]) => <Text key={name} style={styles.productSummaryText}>{quantity} × {name}</Text>)}</View> : null}<View style={styles.customerList}>{run.stops.slice(0, 4).map((stop) => <View key={stop.id} style={styles.customerRow}><Text style={styles.customerSequence}>{stop.sequenceNumber}</Text><Text style={styles.customerText} numberOfLines={1}>{stop.subscriptionDelivery.order?.customer?.name || 'Customer'} · {stop.expectedParcelCount} bag</Text><Text style={styles.customerProof}>{stop.cashDuePaise > 0 ? money(stop.cashDuePaise) : '₹0 funded'}</Text></View>)}{run.stops.length > 4 ? <Text style={styles.moreCustomers}>+ {run.stops.length - 4} more customer bags</Text> : null}</View>{run.status === 'PLANNED' ? <TouchableOpacity style={styles.runPrimary} onPress={onPack}><PackageCheck size={19} color="#FFFFFF" /><Text style={styles.runPrimaryText}>Verify and confirm packing</Text></TouchableOpacity> : null}{run.status === 'READY_FOR_PICKUP' && !run.storeHandoffConfirmedAt ? <TouchableOpacity style={styles.runPrimary} disabled={pickupBusy} onPress={onPickup}><Truck size={19} color="#FFFFFF" /><Text style={styles.runPrimaryText}>{pickupBusy ? 'Confirming…' : 'Confirm store handoff'}</Text></TouchableOpacity> : null}{run.status === 'READY_FOR_PICKUP' && run.storeHandoffConfirmedAt ? <View style={styles.productSummary}><Text style={styles.productSummaryText}>Store handoff recorded · waiting for rider bag receipt</Text></View> : null}</View>;
}

function Metric({ label: metricLabel, value, danger = false }: { label: string; value: string; danger?: boolean }) { return <View style={styles.metric}><Text style={[styles.metricValue, danger && styles.metricDanger]}>{value}</Text><Text style={styles.metricLabel}>{metricLabel}</Text></View>; }
function EmptyState({ icon: Icon, title, text }: { icon: React.ComponentType<{ size?: number; color?: string }>; title: string; text: string }) { return <View style={styles.stateCard}><Icon size={43} color="#94A3B8" /><Text style={styles.stateTitle}>{title}</Text><Text style={styles.stateText}>{text}</Text></View>; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F3F7F5' }, content: { paddingBottom: 110 }, hero: { backgroundColor: '#057A55', paddingHorizontal: 17, paddingTop: 24, paddingBottom: 22, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, overflow: 'hidden' }, heroGlow: { position: 'absolute', width: 240, height: 240, borderRadius: 120, right: -100, top: -115, backgroundColor: '#34D399', opacity: 0.23 }, headerRow: { flexDirection: 'row', alignItems: 'center' }, backButton: { width: 44, height: 44, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.13)', alignItems: 'center', justifyContent: 'center' }, headerCopy: { flex: 1, marginLeft: 11 }, eyebrow: { color: '#B9F6DF', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 }, title: { color: '#FFFFFF', fontSize: 27, fontWeight: '900', marginTop: 2 }, headerIcon: { width: 50, height: 50, borderRadius: 16, backgroundColor: '#ECFFF7', alignItems: 'center', justifyContent: 'center' }, subtitle: { color: '#D8F8EA', fontSize: 12, lineHeight: 18, marginTop: 14, maxWidth: 335 }, heroMetrics: { flexDirection: 'row', marginTop: 18, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.12)', paddingVertical: 12 }, heroMetric: { flex: 1, alignItems: 'center' }, heroMetricValue: { color: '#FFFFFF', fontSize: 17, fontWeight: '900' }, heroMetricLabel: { color: '#CAF4E3', fontSize: 9, marginTop: 2 }, heroDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.23)' },
  segmentRow: { paddingHorizontal: 16, paddingVertical: 15, gap: 8 }, segment: { minHeight: 42, borderRadius: 14, borderWidth: 1, borderColor: '#D7E1DC', backgroundColor: '#FFFFFF', paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 7 }, segmentActive: { backgroundColor: '#087B5A', borderColor: '#087B5A' }, segmentText: { color: '#475569', fontSize: 11, fontWeight: '900' }, segmentTextActive: { color: '#FFFFFF' }, segmentCount: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#E6EFEA', alignItems: 'center', justifyContent: 'center' }, segmentCountActive: { backgroundColor: 'rgba(255,255,255,0.2)' }, segmentCountText: { color: '#475569', fontSize: 9, fontWeight: '900' }, segmentCountTextActive: { color: '#FFFFFF' }, sectionBody: { paddingHorizontal: 16 },
  stateCard: { minHeight: 190, marginHorizontal: 16, borderRadius: 22, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1EAE6', alignItems: 'center', justifyContent: 'center', padding: 25, gap: 10 }, stateTitle: { color: '#17211D', fontSize: 17, fontWeight: '900', textAlign: 'center' }, stateText: { color: '#64748B', fontSize: 12, lineHeight: 18, textAlign: 'center' }, retryButton: { minHeight: 47, borderRadius: 14, backgroundColor: '#087B5A', paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 7 }, retryText: { color: '#FFFFFF', fontWeight: '900' },
  runCard: { backgroundColor: '#FFFFFF', borderRadius: 22, borderWidth: 1, borderColor: '#E1EAE6', padding: 15, marginBottom: 13 }, runHeader: { flexDirection: 'row', alignItems: 'center' }, runIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: '#E8F7F0', alignItems: 'center', justifyContent: 'center' }, runCopy: { flex: 1, marginLeft: 11 }, runCode: { color: '#17211D', fontSize: 16, fontWeight: '900' }, runRider: { color: '#64748B', fontSize: 11, marginTop: 2 }, statusChip: { borderRadius: 11, paddingHorizontal: 8, paddingVertical: 6, maxWidth: 110 }, statusText: { fontSize: 8, fontWeight: '900', textAlign: 'center' }, statusReady: { backgroundColor: '#E5F7EE' }, statusReadyText: { color: '#087B5A' }, statusWarning: { backgroundColor: '#FFF1D6' }, statusWarningText: { color: '#8A4B00' }, statusNeutral: { backgroundColor: '#EEF2F6' }, statusNeutralText: { color: '#475569' }, runMetrics: { flexDirection: 'row', marginTop: 14, borderRadius: 14, backgroundColor: '#F7FAF8', paddingVertical: 10 }, metric: { flex: 1, alignItems: 'center' }, metricValue: { color: '#17211D', fontSize: 14, fontWeight: '900' }, metricDanger: { color: '#B42318' }, metricLabel: { color: '#7B8781', fontSize: 9, marginTop: 2 }, productSummary: { marginTop: 10, borderRadius: 13, backgroundColor: '#EFF8F4', padding: 10, gap: 4 }, productSummaryText: { color: '#27604D', fontSize: 11, fontWeight: '700' }, customerList: { marginTop: 10, gap: 7 }, customerRow: { minHeight: 35, borderBottomWidth: 1, borderBottomColor: '#EEF2F0', flexDirection: 'row', alignItems: 'center', gap: 8 }, customerSequence: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#EDF3F0', color: '#475569', textAlign: 'center', lineHeight: 24, fontSize: 10, fontWeight: '900' }, customerText: { flex: 1, color: '#475569', fontSize: 11 }, customerProof: { color: '#087B5A', fontSize: 10, fontWeight: '900' }, moreCustomers: { color: '#64748B', fontSize: 10, fontWeight: '700', marginTop: 3 }, runPrimary: { minHeight: 50, marginTop: 13, borderRadius: 15, backgroundColor: '#087B5A', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, runPrimaryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  forecastCard: { backgroundColor: '#FFFFFF', borderRadius: 20, borderWidth: 1, borderColor: '#E1EAE6', padding: 15, marginBottom: 12 }, forecastTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, forecastDate: { color: '#17211D', fontSize: 16, fontWeight: '900' }, forecastStops: { color: '#64748B', fontSize: 11, marginTop: 2 }, productTotalBadge: { minHeight: 36, borderRadius: 12, backgroundColor: '#E8F7F0', paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 5 }, productTotalText: { color: '#087B5A', fontSize: 11, fontWeight: '900' }, productList: { marginTop: 12, gap: 8 }, productRow: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#EEF2F0', paddingBottom: 7 }, productName: { color: '#475569', fontSize: 12, fontWeight: '700' }, productQuantity: { color: '#17211D', fontSize: 12, fontWeight: '900' },
  cashCard: { backgroundColor: '#FFFFFF', borderRadius: 20, borderWidth: 1, borderColor: '#E1EAE6', padding: 15, marginBottom: 12 }, cashHeader: { flexDirection: 'row', alignItems: 'center' }, cashIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#FFF2D9', alignItems: 'center', justifyContent: 'center' }, cashCopy: { flex: 1, marginLeft: 10 }, cashReference: { color: '#17211D', fontSize: 13, fontWeight: '900' }, cashStatus: { color: '#8A5A14', fontSize: 10, marginTop: 2 }, cashAmount: { color: '#704000', fontSize: 18, fontWeight: '900' }, cashGrid: { flexDirection: 'row', marginTop: 13, borderRadius: 13, backgroundColor: '#F8FAF9', paddingVertical: 10 }, verifyButton: { minHeight: 50, marginTop: 12, borderRadius: 15, backgroundColor: '#A15C00', paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, verifyButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' }, exceptionCard: { backgroundColor: '#FFF9F8', borderRadius: 18, borderWidth: 1, borderColor: '#F2C4C0', padding: 14, marginBottom: 11, flexDirection: 'row', alignItems: 'flex-start', gap: 10 }, exceptionCopy: { flex: 1 }, exceptionTitle: { color: '#8F1E17', fontSize: 13, fontWeight: '900' }, exceptionText: { color: '#A34740', fontSize: 11, lineHeight: 16, marginTop: 3 }, exceptionRoute: { color: '#64748B', fontSize: 10, marginTop: 5 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.47)', justifyContent: 'flex-end' }, sheet: { maxHeight: '91%', backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 9, paddingBottom: 24 }, handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: '#D2DAD6', alignSelf: 'center' }, sheetHeader: { paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#EDF1EF', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, sheetEyebrow: { color: '#087B5A', fontSize: 10, fontWeight: '900', letterSpacing: 1.1 }, sheetTitle: { color: '#17211D', fontSize: 20, fontWeight: '900', marginTop: 2 }, closeButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#F1F5F3', alignItems: 'center', justifyContent: 'center' }, sheetContent: { padding: 18, paddingBottom: 36 }, expectedBox: { borderRadius: 17, backgroundColor: '#E8F7F0', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }, expectedLabel: { color: '#476A5D', fontSize: 11, fontWeight: '700' }, expectedValue: { color: '#087B5A', fontSize: 25, fontWeight: '900' }, inputLabel: { color: '#334155', fontSize: 12, fontWeight: '900', marginTop: 14, marginBottom: 7 }, input: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: '#D5DEDA', backgroundColor: '#FAFCFB', paddingHorizontal: 14, color: '#17211D', fontSize: 14 }, noteInput: { minHeight: 84, paddingTop: 12, textAlignVertical: 'top' }, scanInput: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: '#B8DDCE', backgroundColor: '#F3FBF7', paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 8 }, scanTextInput: { flex: 1, color: '#17211D', fontSize: 14 }, sheetPrimary: { minHeight: 54, marginTop: 16, borderRadius: 16, backgroundColor: '#087B5A', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, sheetPrimaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' }, cashCompare: { flexDirection: 'row', borderRadius: 17, backgroundColor: '#FFF5DE', paddingVertical: 13 }, moneyInput: { fontSize: 20, fontWeight: '900' }, auditNote: { color: '#64748B', fontSize: 11, lineHeight: 17, marginTop: 12 },
});
