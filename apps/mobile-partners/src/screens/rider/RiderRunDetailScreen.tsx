import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  PermissionsAndroid,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NavigationProp, RouteProp } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import {
  ArrowDown,
  ArrowUp,
  Banknote,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  Navigation,
  Package,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react-native';
import {
  DeliveryRunStop,
  subscriptionOperationsService,
} from '../../api/subscriptionOperationsService';
import type { RiderTabParamList } from '../../navigation/partnerNavigationTypes';
import { RIDER_RUNS_QUERY_KEY } from './RiderRunsScreen';
import { PartnerConnectivity } from '../../native/PartnerConnectivity';
import { RiderRunOfflineQueue } from '../../services/RiderRunOfflineQueue';
import { RiderRunConsole } from './RiderRunConsole';
import { riderStopCustomerKey } from './riderStopIdentity';

type Coordinates = { latitude: number; longitude: number; accuracyMetres?: number };

function money(paise: number) {
  return `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function label(value: string) {
  return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function errorMessage(error: unknown) {
  const candidate = error as { response?: { data?: { message?: string | string[] } }; message?: string };
  const message = candidate?.response?.data?.message;
  if (Array.isArray(message)) return message.join(', ');
  return message || candidate?.message || 'The route action could not be completed.';
}

async function requestLocationPermission() {
  if (Platform.OS !== 'android') return true;
  if (await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION)) return true;
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, {
    title: 'Allow precise delivery location',
    message: 'Aagaam records GPS at each route stop to protect the customer, rider, and store.',
    buttonPositive: 'Allow',
    buttonNegative: 'Not now',
  });
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

async function currentLocation(): Promise<Coordinates> {
  const permitted = await requestLocationPermission();
  if (!permitted) throw new Error('Precise location permission is required for route proof.');
  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMetres: position.coords.accuracy,
      }),
      (error) => reject(new Error(error?.message || 'Unable to read precise GPS.')),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 4_000 },
    );
  });
}

function addressFrom(stop?: DeliveryRunStop | null) {
  const snapshot = stop?.subscriptionDelivery?.subscription?.addressSnapshot || {};
  const fields = ['label', 'addressLine1', 'addressLine2', 'landmark', 'city', 'state', 'postalCode'];
  const values = fields.map((key) => snapshot[key]).filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  return values.join(', ') || 'Customer delivery address';
}

// Label each stop with its own plan/slot so a customer's duplicate deliveries
// are distinguishable once the board flags them.
function planLabel(stop: DeliveryRunStop) {
  const plan = stop.subscriptionDelivery?.subscription?.plan?.name;
  const items = stop.deliveryJob.order.items || [];
  const itemLabel = items.map((item) => `${item.quantity} × ${item.product.name}`).join(' · ');
  return plan || itemLabel || 'Subscription';
}

function StatusChip({ value }: { value: string }) {
  const complete = value === 'DELIVERED';
  const danger = ['FAILED', 'RETURN_REQUIRED'].includes(value);
  const pending = value === 'RETRY_PENDING';
  return (
    <View style={[styles.statusChip, complete ? styles.statusComplete : danger ? styles.statusDanger : pending ? styles.statusWarning : styles.statusNeutral]}>
      <Text style={[styles.statusChipText, complete ? styles.statusCompleteText : danger ? styles.statusDangerText : pending ? styles.statusWarningText : styles.statusNeutralText]}>{label(value)}</Text>
    </View>
  );
}

// Compact board row. Every per-stop action (deliver, skip, cash, extra, undo)
// lives in the console sheet the row focuses — the board only owns the route
// ORDER (reorder arrows) and status at a glance.
function StopRow({
  stop,
  isCurrent,
  duplicateCustomer,
  canMoveUp,
  canMoveDown,
  onMove,
  onFocus,
}: {
  stop: DeliveryRunStop;
  isCurrent: boolean;
  duplicateCustomer?: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (direction: 'up' | 'down') => void;
  onFocus: () => void;
}) {
  const customer = stop.deliveryJob.order.customer;
  return (
    <TouchableOpacity
      accessibilityLabel={`Focus stop ${stop.sequenceNumber}`}
      style={[styles.stopRow, isCurrent && styles.stopRowCurrent]}
      onPress={onFocus}
    >
      <View style={[styles.sequenceCircle, isCurrent && styles.sequenceCircleCurrent]}>
        <Text style={[styles.sequenceText, isCurrent && styles.sequenceTextCurrent]}>{stop.sequenceNumber}</Text>
      </View>
      <View style={styles.stopRowCopy}>
        <Text style={styles.customerName} numberOfLines={1}>{customer?.name || 'Customer'}</Text>
        <View style={styles.planRow}>
          <Text style={styles.planText} numberOfLines={1}>{planLabel(stop)}</Text>
          {duplicateCustomer ? <Text style={styles.multiSubBadge}>2 subscriptions</Text> : null}
        </View>
      </View>
      <StatusChip value={stop.status} />
      <View style={styles.reorderButtons}>
        <TouchableOpacity
          accessibilityLabel={`Move stop ${stop.sequenceNumber} earlier`}
          style={[styles.iconButton, !canMoveUp && styles.iconButtonDisabled]}
          disabled={!canMoveUp}
          onPress={() => onMove('up')}
        >
          <ArrowUp size={16} color={canMoveUp ? '#475569' : '#CBD5E1'} />
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityLabel={`Move stop ${stop.sequenceNumber} later`}
          style={[styles.iconButton, !canMoveDown && styles.iconButtonDisabled]}
          disabled={!canMoveDown}
          onPress={() => onMove('down')}
        >
          <ArrowDown size={16} color={canMoveDown ? '#475569' : '#CBD5E1'} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

export const RiderRunDetailScreen = ({ route, navigation }: { route: RouteProp<RiderTabParamList, 'RiderRunDetail'>; navigation: NavigationProp<RiderTabParamList> }) => {
  const runId = route.params.runId;
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [cashModalOpen, setCashModalOpen] = useState(false);
  const [pickupCrateCode, setPickupCrateCode] = useState('');
  const [cashAmount, setCashAmount] = useState('');
  const [createdBatch, setCreatedBatch] = useState<{ id: string; version: number; expectedAmountPaise: number } | null>(null);
  const [offlinePending, setOfflinePending] = useState(0);
  const [riderLocation, setRiderLocation] = useState<Coordinates | null>(null);
  const locationWatch = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;
    const refreshPending = async () => { if (mounted) setOfflinePending((await RiderRunOfflineQueue.list()).length); };
    void refreshPending();
    const unsubscribe = PartnerConnectivity.subscribe((connected) => {
      if (!connected) { void refreshPending(); return; }
      void RiderRunOfflineQueue.flush().then(async (result) => {
        if (!mounted) return;
        setOfflinePending(result.remaining.length);
        if (result.replayed > 0) Toast.show({ type: 'success', text1: 'Offline route actions synced', text2: `${result.replayed} queued action${result.replayed === 1 ? '' : 's'} replayed safely.` });
        if (result.conflicts.length) Toast.show({ type: 'error', text1: 'Route changed while offline', text2: 'Refresh the run before retrying the conflicted action.' });
      });
    });
    void PartnerConnectivity.getCurrent().then(async (connected) => { if (connected) { await RiderRunOfflineQueue.flush(); await refreshPending(); } });
    return () => { mounted = false; unsubscribe(); };
  }, []);

  // Live rider position for the route map. Cleaned up on unmount so the map dot
  // stops updating and the OS watch is released when the rider leaves the run.
  useEffect(() => {
    let cancelled = false;
    void requestLocationPermission().then((permitted) => {
      if (!permitted || cancelled) return;
      locationWatch.current = Geolocation.watchPosition(
        (position) => setRiderLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracyMetres: position.coords.accuracy }),
        () => {},
        { enableHighAccuracy: true, distanceFilter: 12, interval: 6_000, fastestInterval: 4_000 },
      );
    });
    return () => {
      cancelled = true;
      if (locationWatch.current != null) Geolocation.clearWatch(locationWatch.current);
    };
  }, []);

  const runQuery = useQuery({
    queryKey: ['rider', 'delivery-run', runId],
    queryFn: () => subscriptionOperationsService.getRun(runId),
    refetchInterval: 8_000,
    retry: 1,
  });
  const cashQuery = useQuery({
    queryKey: ['rider', 'delivery-run-cash', runId],
    queryFn: () => subscriptionOperationsService.getCashAccountability(runId),
    enabled: Boolean(runQuery.data && ['AWAITING_SETTLEMENT', 'COMPLETED'].includes(runQuery.data.status)),
    retry: 1,
  });
  const run = runQuery.data;
  const currentStop = useMemo(() => run?.stops.find((stop) => ['READY', 'PLANNED', 'ARRIVED', 'RETRY_PENDING'].includes(stop.status)) || null, [run?.stops]);

  // Customers holding more than one subscription get one stop per subscription,
  // so flag those so the rider can tell the two deliveries apart on the board.
  const duplicateCustomerKeys = useMemo(() => {
    const counts = new Map<string, number>();
    (run?.stops || []).forEach((stop) => {
      const key = riderStopCustomerKey(stop);
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return new Set(Array.from(counts.entries()).filter(([, count]) => count > 1).map(([key]) => key));
  }, [run?.stops]);
  const completed = Number(run?.completedStopCount || 0);
  const total = Math.max(Number(run?.totalStopCount || run?.stops.length || 0), 1);

  const refresh = async () => {
    await Promise.all([runQuery.refetch(), cashQuery.refetch()]);
    await queryClient.invalidateQueries({ queryKey: RIDER_RUNS_QUERY_KEY });
  };

  const runMutation = useMutation({
    mutationFn: async (operation: 'start' | 'finish') => {
      if (!run) throw new Error('Route is not loaded.');
      return operation === 'start'
        ? subscriptionOperationsService.startRun(run.id, run.version)
        : subscriptionOperationsService.finishRun(run.id, run.version);
    },
    onSuccess: async (_data, operation) => {
      await refresh();
      Toast.show({ type: 'success', text1: operation === 'start' ? 'Run started' : 'Run closed', text2: operation === 'start' ? 'Complete each customer stop individually.' : 'Route totals and cash accountability are ready.' });
    },
    onError: (error) => Toast.show({ type: 'error', text1: 'Route action failed', text2: errorMessage(error) }),
  });

  const pickupMutation = useMutation({
    mutationFn: async () => {
      if (!run) throw new Error('Route is not loaded.');
      return subscriptionOperationsService.confirmRunPickupReceipt(run.id, {
        version: run.version,
        expectedBagCount: Number(run.expectedBagCount || run.totalStopCount || run.stops.length),
        crateCode: run.crateCode ? pickupCrateCode.trim() : undefined,
      });
    },
    onSuccess: async () => {
      setPickupCrateCode('');
      await refresh();
      Toast.show({ type: 'success', text1: 'Route pickup verified', text2: 'Your independent bag receipt is now recorded.' });
    },
    onError: (error) => Toast.show({ type: 'error', text1: 'Pickup verification failed', text2: errorMessage(error) }),
  });

  const reorderMutation = useMutation({
    mutationFn: async ({ stop, direction }: { stop: DeliveryRunStop; direction: 'up' | 'down' }) => {
      if (!run) throw new Error('Route is not loaded.');
      const next = direction === 'up' ? stop.sequenceNumber - 1 : stop.sequenceNumber + 1;
      if (next < 1 || next > run.stops.length) throw new Error('This stop is already at the route boundary.');
      const payload = { version: stop.version, newSequenceNumber: next, reason: 'Rider route optimization from mobile run view' };
      if (!(await PartnerConnectivity.getCurrent())) {
        await RiderRunOfflineQueue.enqueue({ kind: 'REORDER', runId, stopId: stop.id, payload });
        setOfflinePending((await RiderRunOfflineQueue.list()).length);
        throw new Error('Offline: route reorder queued. The server will reject it if the route version changed.');
      }
      return subscriptionOperationsService.reorderStop(runId, stop.id, payload);
    },
    onSuccess: async () => { await refresh(); Toast.show({ type: 'success', text1: 'Route order updated' }); },
    onError: (error) => Toast.show({ type: 'error', text1: 'Could not reorder stop', text2: errorMessage(error) }),
  });

  const batchMutation = useMutation({
    mutationFn: async () => {
      if (!run || !cashQuery.data) throw new Error('Cash accountability is not loaded.');
      const eligible = cashQuery.data.ledgers.filter((ledger) => ledger.riderHoldingBalancePaise > 0).map((ledger) => ledger.id);
      if (!eligible.length) throw new Error('There are no held COD ledgers to deposit.');
      return subscriptionOperationsService.createCashBatch(run.id, run.version, eligible);
    },
    onSuccess: (batch) => {
      setCreatedBatch({ id: batch.id, version: batch.version, expectedAmountPaise: batch.expectedAmountPaise });
      setCashAmount(String(batch.expectedAmountPaise / 100));
      setCashModalOpen(true);
    },
    onError: (error) => Toast.show({ type: 'error', text1: 'Cash batch not created', text2: errorMessage(error) }),
  });

  const submitBatchMutation = useMutation({
    mutationFn: async () => {
      if (!createdBatch) throw new Error('Cash batch is not ready.');
      const paise = Math.round(Number(cashAmount) * 100);
      if (!Number.isFinite(paise) || paise < 0) throw new Error('Enter a valid physical cash amount.');
      return subscriptionOperationsService.submitCashBatch(createdBatch.id, createdBatch.version, paise);
    },
    onSuccess: async () => {
      setCashModalOpen(false); setCreatedBatch(null); await refresh();
      Toast.show({ type: 'success', text1: 'Cash submitted', text2: 'The store must independently count and verify this batch.' });
    },
    onError: (error) => Toast.show({ type: 'error', text1: 'Cash submission failed', text2: errorMessage(error) }),
  });

  const openNavigation = (stop: DeliveryRunStop) => {
    const snapshot = stop.subscriptionDelivery.subscription.addressSnapshot || {};
    const latitude = typeof snapshot.latitude === 'number' ? snapshot.latitude : undefined;
    const longitude = typeof snapshot.longitude === 'number' ? snapshot.longitude : undefined;
    const destination = latitude != null && longitude != null ? `${latitude},${longitude}` : encodeURIComponent(addressFrom(stop));
    void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${destination}`).catch(() => Toast.show({ type: 'error', text1: 'Maps unavailable' }));
  };

  if (runQuery.isLoading) return <View style={styles.loadingScreen}><ActivityIndicator size="large" color="#0F766E" /><Text style={styles.loadingText}>Loading route…</Text></View>;
  if (runQuery.isError || !run) return <View style={styles.loadingScreen}><CircleAlert size={42} color="#B42318" /><Text style={styles.loadingTitle}>Route unavailable</Text><Text style={styles.loadingText}>{runQuery.error ? errorMessage(runQuery.error) : 'This route could not be loaded.'}</Text><TouchableOpacity style={styles.retryButton} onPress={() => void runQuery.refetch()}><RefreshCw size={18} color="#FFFFFF" /><Text style={styles.retryButtonText}>Retry</Text></TouchableOpacity></View>;

  // Lifecycle: everything that happens *before* the first delivery (handoff,
  // pickup receipt, start) lives in the peek sheet so the primary action is
  // always reachable; the ordered stops live in the expanded board.
  const lifecycle = (
    <>
      {run.status === 'PICKED_UP' ? <TouchableOpacity style={styles.stickyPrimary} disabled={runMutation.isPending} onPress={() => runMutation.mutate('start')}><Navigation size={20} color="#FFFFFF" /><Text style={styles.stickyPrimaryText}>{runMutation.isPending ? 'Starting…' : 'Start delivery run'}</Text></TouchableOpacity> : null}
      {run.status === 'PLANNED' || (run.status === 'READY_FOR_PICKUP' && !run.storeHandoffConfirmedAt) ? <View style={styles.noticeCard}><Clock3 size={20} color="#8A4B00" /><View style={styles.noticeCopy}><Text style={styles.noticeTitle}>Waiting for store handoff</Text><Text style={styles.noticeText}>The store must pack the exact route bags and confirm the physical handoff.</Text></View></View> : null}
      {run.status === 'READY_FOR_PICKUP' && run.storeHandoffConfirmedAt ? <View style={styles.pickupReceiptCard}><View style={styles.pickupReceiptHeader}><Package size={20} color="#0F766E" /><View style={styles.noticeCopy}><Text style={styles.pickupReceiptTitle}>Confirm your independent receipt</Text><Text style={styles.pickupReceiptText}>Count exactly {run.expectedBagCount || run.totalStopCount} bags before accepting this run.</Text></View></View>{run.crateCode ? <TextInput style={styles.input} value={pickupCrateCode} onChangeText={setPickupCrateCode} placeholder="Enter or scan route crate code" placeholderTextColor="#94A3B8" autoCapitalize="characters" /> : null}<TouchableOpacity style={styles.stickyPrimary} disabled={pickupMutation.isPending || Boolean(run.crateCode && !pickupCrateCode.trim())} onPress={() => pickupMutation.mutate()}><ShieldCheck size={20} color="#FFFFFF" /><Text style={styles.stickyPrimaryText}>{pickupMutation.isPending ? 'Verifying receipt…' : `Confirm ${run.expectedBagCount || run.totalStopCount} bags received`}</Text></TouchableOpacity></View> : null}
    </>
  );

  // The route board, hosted inside the console's expanded sheet so the map is
  // the single surface. The board owns only what the console sheet cannot: the
  // route ORDER (tap a row to focus that stop in the sheet, arrows to reorder),
  // the finish action, and cash settlement. Deliver/skip/cash/extra/undo all
  // live in the focused-stop sheet above — no second set of stop actions.
  const board = (focusStop: (stopId: string) => void) => (
    <>
      <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Ordered stops</Text><Text style={styles.sectionHint}>Tap a row to act · arrows reorder</Text></View>
      {run.stops.map((stop, index) => {
        // Terminal stops (delivered, failed, skipped, returned) keep their
        // position: the server rejects reorders once the route executes them.
        const actionable = !['DELIVERED', 'CANCELLED', 'FAILED', 'RETURNED'].includes(stop.status);
        return (
          <StopRow
            key={stop.id}
            stop={stop}
            isCurrent={currentStop?.id === stop.id}
            duplicateCustomer={duplicateCustomerKeys.has(riderStopCustomerKey(stop))}
            canMoveUp={index > 0 && actionable && !reorderMutation.isPending}
            canMoveDown={index < run.stops.length - 1 && actionable && !reorderMutation.isPending}
            onMove={(direction) => reorderMutation.mutate({ stop, direction })}
            onFocus={() => focusStop(stop.id)}
          />
        );
      })}

      {run.status === 'IN_PROGRESS' ? <TouchableOpacity style={styles.finishButton} disabled={runMutation.isPending} onPress={() => Alert.alert('Finish this route?', 'The server will block completion while any delivery, retry, or return requirement remains unresolved.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Check and finish', onPress: () => runMutation.mutate('finish') }])}><CheckCircle2 size={20} color="#FFFFFF" /><Text style={styles.finishButtonText}>Finish route after all stops</Text></TouchableOpacity> : null}

      {run.status === 'AWAITING_SETTLEMENT' ? <View style={styles.cashCard}><View style={styles.cashTitleRow}><View style={styles.cashIcon}><Banknote size={23} color="#A15C00" /></View><View style={styles.cashCopy}><Text style={styles.cashTitle}>Return cash to store</Text><Text style={styles.cashText}>Individual COD ledgers stay intact. The store independently verifies the physical batch.</Text></View></View><View style={styles.cashTotals}><Text style={styles.cashTotalLabel}>Rider holding</Text><Text style={styles.cashTotalValue}>{money(cashQuery.data?.riderHoldingPaise || 0)}</Text></View><TouchableOpacity style={styles.cashButton} disabled={batchMutation.isPending || !cashQuery.data?.riderHoldingPaise} onPress={() => batchMutation.mutate()}><Text style={styles.cashButtonText}>{batchMutation.isPending ? 'Creating batch…' : 'Create deposit batch'}</Text><ChevronRight size={19} color="#FFFFFF" /></TouchableOpacity></View> : null}
    </>
  );

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#0B1B3A" />
      {/* The run screen *is* the board: one map-first surface. The console's
          expanded sheet hosts the ordered stops + lifecycle, so there is no
          second map and no "open map" round-trip. */}
      <RiderRunConsole
        run={run}
        riderLocation={riderLocation}
        completed={completed}
        total={total}
        onClose={() => navigation.goBack()}
        onNavigate={(stop) => openNavigation(stop)}
        onStartRun={() => runMutation.mutate('start')}
        starting={runMutation.isPending}
        resolveLocation={currentLocation}
        onRefresh={refresh}
        onOfflineQueued={() => { void RiderRunOfflineQueue.list().then((queue) => setOfflinePending(queue.length)); }}
        renderBoard={({ focusStop }) => board(focusStop)}
        lifecycle={lifecycle}
        headerChips={offlinePending > 0 ? <Text style={styles.headerChip}>{offlinePending} offline pending</Text> : null}
      />

      <Modal visible={cashModalOpen} transparent animationType="slide" onRequestClose={() => setCashModalOpen(false)}>
        <View style={styles.modalBackdrop}><View style={[styles.bottomSheet, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}><View style={styles.sheetHandle} /><View style={styles.sheetHeader}><View><Text style={styles.sheetEyebrow}>PHYSICAL CASH HANDOFF</Text><Text style={styles.sheetTitle}>Submit deposit batch</Text></View><TouchableOpacity style={styles.closeButton} onPress={() => setCashModalOpen(false)}><X size={21} color="#475569" /></TouchableOpacity></View><View style={styles.sheetScroll}>
          <View style={styles.expectedCashBox}><Text style={styles.expectedCashLabel}>Server-calculated expected amount</Text><Text style={styles.expectedCashValue}>{money(createdBatch?.expectedAmountPaise || 0)}</Text></View>
          <Text style={styles.inputLabel}>Physical amount handed to store</Text><TextInput style={[styles.input, styles.cashInput]} keyboardType="decimal-pad" value={cashAmount} onChangeText={setCashAmount} placeholder="0.00" placeholderTextColor="#94A3B8" />
          <Text style={styles.cashDisclaimer}>A difference does not disappear. It creates a variance review for the store and admin while each COD ledger remains individually auditable.</Text>
          <TouchableOpacity style={styles.sheetPrimary} disabled={submitBatchMutation.isPending} onPress={() => submitBatchMutation.mutate()}><Banknote size={20} color="#FFFFFF" /><Text style={styles.sheetPrimaryText}>{submitBatchMutation.isPending ? 'Submitting…' : 'Submit physical amount'}</Text></TouchableOpacity>
        </View></View></View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B1B3A' },
  headerChip: { alignSelf: 'flex-start', marginTop: 10, color: '#8A4B00', backgroundColor: '#FFF2D9', borderRadius: 9, paddingHorizontal: 9, paddingVertical: 4, fontSize: 10.5, fontWeight: '700', overflow: 'hidden' },
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: '#F3F7F5', gap: 12 }, loadingTitle: { color: '#17211D', fontSize: 19, fontWeight: '600' }, loadingText: { color: '#64748B', fontSize: 13, lineHeight: 19, textAlign: 'center' }, retryButton: { minHeight: 48, borderRadius: 15, backgroundColor: '#0F766E', paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 8 }, retryButtonText: { color: '#FFFFFF', fontWeight: '600' },
  stickyPrimary: { minHeight: 54, margin: 16, marginBottom: 0, borderRadius: 17, backgroundColor: '#0F766E', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, stickyPrimaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' }, noticeCard: { margin: 16, marginBottom: 0, borderRadius: 18, backgroundColor: '#FFF5DE', borderWidth: 1, borderColor: '#F0D9A7', padding: 16, flexDirection: 'row', gap: 12 }, noticeCopy: { flex: 1 }, noticeTitle: { color: '#704000', fontSize: 14, fontWeight: '600' }, noticeText: { color: '#8A5A14', fontSize: 12, lineHeight: 18, marginTop: 2 },
  sectionHeader: { marginTop: 23, marginBottom: 11, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sectionTitle: { color: '#17211D', fontSize: 19, fontWeight: '600' }, sectionHint: { color: '#0F766E', fontSize: 10, fontWeight: '600', backgroundColor: '#E2F5EC', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  stopRow: { marginHorizontal: 16, marginBottom: 8, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E1EAE6', flexDirection: 'row', alignItems: 'center', gap: 10 },
  stopRowCurrent: { borderColor: '#60C69E', borderWidth: 2 },
  stopRowCopy: { flex: 1, minWidth: 0 },
  sequenceCircle: { width: 37, height: 37, borderRadius: 19, backgroundColor: '#EEF3F1', alignItems: 'center', justifyContent: 'center' }, sequenceCircleCurrent: { backgroundColor: '#0F766E' }, sequenceText: { color: '#475569', fontSize: 14, fontWeight: '600' }, sequenceTextCurrent: { color: '#FFFFFF' }, customerName: { color: '#17211D', fontSize: 15, fontWeight: '600' },
  statusChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, maxWidth: 105 }, statusChipText: { fontSize: 9, fontWeight: '600', textAlign: 'center' }, statusComplete: { backgroundColor: '#E5F7EE' }, statusCompleteText: { color: '#0F766E' }, statusDanger: { backgroundColor: '#FDECEC' }, statusDangerText: { color: '#B42318' }, statusWarning: { backgroundColor: '#FFF1D6' }, statusWarningText: { color: '#8A4B00' }, statusNeutral: { backgroundColor: '#EEF2F6' }, statusNeutralText: { color: '#475569' },
  reorderButtons: { flexDirection: 'row', gap: 4 }, iconButton: { width: 36, height: 36, borderRadius: 11, backgroundColor: '#F1F5F3', alignItems: 'center', justifyContent: 'center' }, iconButtonDisabled: { opacity: 0.45 },
  finishButton: { minHeight: 54, marginHorizontal: 16, marginTop: 6, borderRadius: 17, backgroundColor: '#243C33', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, finishButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' }, cashCard: { margin: 16, borderRadius: 22, backgroundColor: '#FFF8E9', borderWidth: 1, borderColor: '#EDD8A8', padding: 17 }, cashTitleRow: { flexDirection: 'row', alignItems: 'center' }, cashIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: '#FFE9B6', alignItems: 'center', justifyContent: 'center' }, cashCopy: { flex: 1, marginLeft: 11 }, cashTitle: { color: '#704000', fontSize: 16, fontWeight: '600' }, cashText: { color: '#8A5A14', fontSize: 11, lineHeight: 16, marginTop: 2 }, cashTotals: { marginTop: 15, borderRadius: 14, backgroundColor: '#FFFFFF', padding: 12, flexDirection: 'row', justifyContent: 'space-between' }, cashTotalLabel: { color: '#64748B', fontSize: 12, fontWeight: '500' }, cashTotalValue: { color: '#704000', fontSize: 18, fontWeight: '600' }, cashButton: { minHeight: 50, marginTop: 12, borderRadius: 15, backgroundColor: '#A15C00', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, cashButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.46)', justifyContent: 'flex-end' }, bottomSheet: { maxHeight: '91%', backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 9, paddingBottom: 24 }, sheetHandle: { width: 44, height: 5, borderRadius: 3, backgroundColor: '#D1D9D5', alignSelf: 'center' }, sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingTop: 14, paddingBottom: 11, borderBottomWidth: 1, borderBottomColor: '#EDF1EF' }, sheetEyebrow: { color: '#0F766E', fontSize: 10, fontWeight: '600', letterSpacing: 1.1 }, sheetTitle: { color: '#17211D', fontSize: 20, fontWeight: '600', marginTop: 2 }, closeButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#F1F5F3', alignItems: 'center', justifyContent: 'center' }, sheetScroll: { padding: 18, paddingBottom: 34 },
  expectedCashBox: { borderRadius: 18, backgroundColor: '#FFF5DE', padding: 17, alignItems: 'center' }, expectedCashLabel: { color: '#8A5A14', fontSize: 11, fontWeight: '600' }, expectedCashValue: { color: '#704000', fontSize: 29, fontWeight: '600', marginTop: 4 }, cashInput: { fontSize: 21, fontWeight: '600' }, cashDisclaimer: { color: '#64748B', fontSize: 11, lineHeight: 17, marginTop: 12 },
  pickupReceiptCard: { marginHorizontal: 16, marginBottom: 14, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#B8DDCE', padding: 16, gap: 12 }, pickupReceiptHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 }, pickupReceiptTitle: { color: '#17211D', fontSize: 14, fontWeight: '600' }, pickupReceiptText: { color: '#64748B', fontSize: 11, lineHeight: 17, marginTop: 4 },
  input: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: '#D5DEDA', backgroundColor: '#FAFCFB', paddingHorizontal: 14, color: '#17211D', fontSize: 14 }, inputLabel: { color: '#334155', fontSize: 12, fontWeight: '600', marginTop: 14, marginBottom: 8 },
  sheetPrimary: { minHeight: 54, marginTop: 15, borderRadius: 16, backgroundColor: '#0F766E', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, sheetPrimaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  multiSubBadge: { color: '#8A4B00', backgroundColor: '#FFF1D6', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, fontSize: 9, fontWeight: '700', overflow: 'hidden' }, planRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }, planText: { color: '#0F766E', fontSize: 11, fontWeight: '600', flexShrink: 1 },
});
