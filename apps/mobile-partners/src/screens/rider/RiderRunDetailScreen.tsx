import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  PermissionsAndroid,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import type { NavigationProp, RouteProp } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Banknote,
  Camera,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  KeyRound,
  MapPin,
  Navigation,
  Package,
  Phone,
  RefreshCw,
  Route,
  ShieldCheck,
  Store,
  X,
} from 'lucide-react-native';
import {
  DeliveryFailureReason,
  DeliveryRunStop,
  subscriptionOperationsService,
} from '../../api/subscriptionOperationsService';
import type { RiderTabParamList } from '../../navigation/partnerNavigationTypes';
import { RIDER_RUNS_QUERY_KEY } from './RiderRunsScreen';
import { PartnerQrScanner } from '../../native/PartnerQrScanner';
import { PartnerDocumentPicker } from '../../native/PartnerDocumentPicker';
import { PartnerConnectivity } from '../../native/PartnerConnectivity';
import { RiderRunOfflineQueue } from '../../services/RiderRunOfflineQueue';

const FAILURE_REASONS: Array<{ value: DeliveryFailureReason; label: string }> = [
  { value: 'CUSTOMER_UNREACHABLE', label: 'Customer unreachable' },
  { value: 'CUSTOMER_REFUSED', label: 'Customer refused' },
  { value: 'ADDRESS_NOT_FOUND', label: 'Address not found' },
  { value: 'WRONG_ADDRESS', label: 'Wrong address' },
  { value: 'PAYMENT_NOT_AVAILABLE', label: 'Cash not available' },
  { value: 'PACKAGE_DAMAGED', label: 'Package damaged' },
  { value: 'VEHICLE_BREAKDOWN', label: 'Vehicle breakdown' },
  { value: 'SAFETY_CONCERN', label: 'Safety concern' },
  { value: 'OTHER', label: 'Other' },
];

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

function ProofSummary({ stop }: { stop: DeliveryRunStop }) {
  const method = stop.subscriptionDelivery.subscription.deliveryMethod;
  if (stop.cashDuePaise > 0) {
    return <View style={styles.proofRow}><Banknote size={17} color="#A15C00" /><Text style={styles.proofText}>Collect exactly {money(stop.cashDuePaise)} with customer OTP</Text></View>;
  }
  if (method === 'TRUSTED_DROP') {
    return <View style={styles.proofRow}><Camera size={17} color="#087B5A" /><Text style={styles.proofText}>₹0 due · one-time QR, arrival/completion GPS and fresh photo required</Text></View>;
  }
  if (method === 'SECURITY_RECEPTION') {
    return <View style={styles.proofRow}><ShieldCheck size={17} color="#155E75" /><Text style={styles.proofText}>₹0 due · security/reception OTP handover</Text></View>;
  }
  return <View style={styles.proofRow}><KeyRound size={17} color="#155E75" /><Text style={styles.proofText}>₹0 due · customer OTP handover</Text></View>;
}

function StopCard({
  stop,
  isCurrent,
  onOpen,
  onNavigate,
  onMove,
}: {
  stop: DeliveryRunStop;
  isCurrent: boolean;
  onOpen: () => void;
  onNavigate: () => void;
  onMove: (direction: 'up' | 'down') => void;
}) {
  const customer = stop.deliveryJob.order.customer;
  return (
    <View style={[styles.stopCard, isCurrent && styles.stopCardCurrent]}>
      <View style={styles.stopHeader}>
        <View style={[styles.sequenceCircle, isCurrent && styles.sequenceCircleCurrent]}><Text style={[styles.sequenceText, isCurrent && styles.sequenceTextCurrent]}>{stop.sequenceNumber}</Text></View>
        <View style={styles.stopHeadingCopy}><Text style={styles.customerName}>{customer?.name || 'Customer'}</Text><Text style={styles.addressText} numberOfLines={2}>{addressFrom(stop)}</Text></View>
        <StatusChip value={stop.status} />
      </View>
      <View style={styles.itemsBox}>
        {stop.deliveryJob.order.items.map((item) => <View key={item.id} style={styles.itemRow}><Package size={15} color="#64748B" /><Text style={styles.itemText}>{item.quantity} × {item.product.name}</Text></View>)}
      </View>
      <ProofSummary stop={stop} />
      {stop.failureReason ? <View style={styles.failureNote}><CircleAlert size={15} color="#B42318" /><Text style={styles.failureNoteText}>{stop.failureReason}</Text></View> : null}
      <View style={styles.stopActions}>
        <TouchableOpacity accessibilityLabel={`Navigate to stop ${stop.sequenceNumber}`} style={styles.secondaryButton} onPress={onNavigate}><Navigation size={17} color="#087B5A" /><Text style={styles.secondaryButtonText}>Navigate</Text></TouchableOpacity>
        {!['DELIVERED', 'CANCELLED', 'FAILED', 'RETURNED'].includes(stop.status) ? (
          <View style={styles.reorderButtons}>
            <TouchableOpacity accessibilityLabel="Move stop earlier" style={styles.iconButton} onPress={() => onMove('up')}><ArrowUp size={17} color="#475569" /></TouchableOpacity>
            <TouchableOpacity accessibilityLabel="Move stop later" style={styles.iconButton} onPress={() => onMove('down')}><ArrowDown size={17} color="#475569" /></TouchableOpacity>
          </View>
        ) : null}
        <TouchableOpacity style={styles.primaryButtonSmall} onPress={onOpen}><Text style={styles.primaryButtonSmallText}>{stop.status === 'DELIVERED' ? 'View' : 'Open stop'}</Text><ChevronRight size={17} color="#FFFFFF" /></TouchableOpacity>
      </View>
    </View>
  );
}

export const RiderRunDetailScreen = ({ route, navigation }: { route: RouteProp<RiderTabParamList, 'RiderRunDetail'>; navigation: NavigationProp<RiderTabParamList> }) => {
  const runId = route.params.runId;
  const queryClient = useQueryClient();
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [dropToken, setDropToken] = useState('');
  const [trustedEvidenceId, setTrustedEvidenceId] = useState('');
  const [trustedEvidenceName, setTrustedEvidenceName] = useState('');
  const [deliveryNote, setDeliveryNote] = useState('');
  const [failureOpen, setFailureOpen] = useState(false);
  const [failureReason, setFailureReason] = useState<DeliveryFailureReason>('CUSTOMER_UNREACHABLE');
  const [failureNote, setFailureNote] = useState('');
  const [retryRequested, setRetryRequested] = useState(true);
  const [cashModalOpen, setCashModalOpen] = useState(false);
  const [pickupCrateCode, setPickupCrateCode] = useState('');
  const [cashAmount, setCashAmount] = useState('');
  const [createdBatch, setCreatedBatch] = useState<{ id: string; version: number; expectedAmountPaise: number } | null>(null);
  const [offlinePending, setOfflinePending] = useState(0);

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
  const selectedStop = run?.stops.find((stop) => stop.id === selectedStopId) || null;
  const currentStop = useMemo(() => run?.stops.find((stop) => ['READY', 'PLANNED', 'ARRIVED', 'RETRY_PENDING'].includes(stop.status)) || null, [run?.stops]);
  const completed = Number(run?.completedStopCount || 0);
  const total = Math.max(Number(run?.totalStopCount || run?.stops.length || 0), 1);
  const progress = Math.min(100, Math.round((completed / total) * 100));

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

  const arriveMutation = useMutation({
    mutationFn: async (stop: DeliveryRunStop) => {
      const coordinates = await currentLocation();
      const payload = { ...coordinates, version: stop.version };
      if (!(await PartnerConnectivity.getCurrent())) {
        await RiderRunOfflineQueue.enqueue({ kind: 'ARRIVE', runId, stopId: stop.id, payload });
        setOfflinePending((await RiderRunOfflineQueue.list()).length);
        throw new Error('Offline: arrival saved securely and will replay after connectivity returns.');
      }
      return subscriptionOperationsService.arriveAtStop(runId, stop.id, payload);
    },
    onSuccess: async () => { await refresh(); Toast.show({ type: 'success', text1: 'Arrival recorded', text2: 'GPS and timestamp were saved for this stop.' }); },
    onError: (error) => Toast.show({ type: 'error', text1: 'Could not record arrival', text2: errorMessage(error) }),
  });

  const otpMutation = useMutation({
    mutationFn: async (stop: DeliveryRunStop) => subscriptionOperationsService.issueStopOtp(runId, stop.id, stop.version),
    onSuccess: () => Toast.show({ type: 'success', text1: 'OTP sent', text2: 'Ask the customer or reception contact for the six-digit code.' }),
    onError: (error) => Toast.show({ type: 'error', text1: 'OTP could not be sent', text2: errorMessage(error) }),
  });

  const scanTrustedDropMutation = useMutation({
    mutationFn: async () => {
      const result = await PartnerQrScanner.scan();
      if (!result?.value?.trim()) throw new Error('No Trusted Drop QR content was detected.');
      if (!result.value.startsWith('aagam.td.v1.')) throw new Error('This is not an Aagaam Trusted Drop QR.');
      return result.value.trim();
    },
    onSuccess: (token) => { setDropToken(token); setTrustedEvidenceId(''); setTrustedEvidenceName(''); Toast.show({ type: 'success', text1: 'Trusted Drop QR scanned', text2: 'Now capture a fresh photo at the drop point.' }); },
    onError: (error) => Toast.show({ type: 'error', text1: 'QR scan failed', text2: errorMessage(error) }),
  });

  const evidenceMutation = useMutation({
    mutationFn: async (stop: DeliveryRunStop) => {
      if (!dropToken) throw new Error('Scan the customer Trusted Drop QR first.');
      const picked = await PartnerDocumentPicker.captureImage();
      if (!picked.type.startsWith('image/')) throw new Error('Trusted Drop proof must be a camera image.');
      if (picked.size > 6 * 1024 * 1024) throw new Error('Trusted Drop photo must be 6 MB or smaller.');
      const result = await subscriptionOperationsService.uploadTrustedDropEvidence(runId, stop.id, {
        trustedDropToken: dropToken,
        file: { uri: picked.uri, name: picked.name, type: picked.type },
        capturedAt: new Date().toISOString(),
      });
      return { ...result, name: picked.name };
    },
    onSuccess: (result) => { setTrustedEvidenceId(result.id); setTrustedEvidenceName(result.name); Toast.show({ type: 'success', text1: 'Drop photo secured', text2: 'The evidence is bound to this stop, rider, and QR version.' }); },
    onError: (error) => Toast.show({ type: 'error', text1: 'Photo upload failed', text2: errorMessage(error) }),
  });

  const completeMutation = useMutation({
    mutationFn: async (stop: DeliveryRunStop) => {
      const coordinates = await currentLocation();
      const trusted = stop.subscriptionDelivery.subscription.deliveryMethod === 'TRUSTED_DROP' && stop.cashDuePaise === 0;
      if (!(await PartnerConnectivity.getCurrent())) {
        if (trusted) {
          await RiderRunOfflineQueue.enqueue({ kind: 'TRUSTED_DROP_RESCAN_REQUIRED', runId, stopId: stop.id, payload: { version: stop.version } });
          setOfflinePending((await RiderRunOfflineQueue.list()).length);
          throw new Error('Offline: Trusted Drop QR secrets are never stored. Reconnect, refresh, and rescan the current QR.');
        }
        throw new Error('Reconnect before final handover verification; OTP/proof secrets are not persisted offline.');
      }
      if (trusted && (!dropToken.trim() || !trustedEvidenceId)) throw new Error('Scan the current Trusted Drop QR and upload a fresh photo.');
      if (!trusted && !/^\d{6}$/.test(otpCode)) throw new Error('Enter the six-digit customer OTP.');
      return subscriptionOperationsService.completeStop(runId, stop.id, {
        ...coordinates,
        version: stop.version,
        riderConfirmed: true,
        otpCode: trusted ? undefined : otpCode,
        trustedDropToken: trusted ? dropToken.trim() : undefined,
        evidenceId: trusted ? trustedEvidenceId : undefined,
        cashCollectedPaise: stop.cashDuePaise > 0 ? stop.cashDuePaise : undefined,
        note: deliveryNote.trim() || undefined,
      });
    },
    onSuccess: async (_result, stop) => {
      await RiderRunOfflineQueue.clearTrustedDropMarker(runId, stop.id);
      setOfflinePending((await RiderRunOfflineQueue.list()).length);
      setOtpCode(''); setDropToken(''); setTrustedEvidenceId(''); setTrustedEvidenceName(''); setDeliveryNote(''); setSelectedStopId(null);
      await refresh();
      Toast.show({ type: 'success', text1: 'Stop completed', text2: 'Delivery proof and funding entitlement were recorded.' });
    },
    onError: (error) => Toast.show({ type: 'error', text1: 'Delivery not completed', text2: errorMessage(error) }),
  });

  const failMutation = useMutation({
    mutationFn: async (stop: DeliveryRunStop) => {
      const coordinates = await currentLocation();
      const payload = { ...coordinates, version: stop.version, reason: failureReason, note: failureNote.trim() || undefined, retryRequested };
      if (!(await PartnerConnectivity.getCurrent())) {
        await RiderRunOfflineQueue.enqueue({ kind: 'FAIL', runId, stopId: stop.id, payload });
        setOfflinePending((await RiderRunOfflineQueue.list()).length);
        throw new Error('Offline: delivery exception queued and will replay after reconnect.');
      }
      return subscriptionOperationsService.failStop(runId, stop.id, payload);
    },
    onSuccess: async () => {
      setFailureOpen(false); setFailureNote(''); setSelectedStopId(null);
      await refresh();
      Toast.show({ type: 'success', text1: retryRequested ? 'Retry recorded' : 'Failure recorded', text2: retryRequested ? 'The stop remains unresolved and must be retried.' : 'The exception is visible to the store and admin.' });
    },
    onError: (error) => Toast.show({ type: 'error', text1: 'Failure not recorded', text2: errorMessage(error) }),
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

  if (runQuery.isLoading) return <View style={styles.loadingScreen}><ActivityIndicator size="large" color="#087B5A" /><Text style={styles.loadingText}>Loading route…</Text></View>;
  if (runQuery.isError || !run) return <View style={styles.loadingScreen}><CircleAlert size={42} color="#B42318" /><Text style={styles.loadingTitle}>Route unavailable</Text><Text style={styles.loadingText}>{runQuery.error ? errorMessage(runQuery.error) : 'This route could not be loaded.'}</Text><TouchableOpacity style={styles.retryButton} onPress={() => void runQuery.refetch()}><RefreshCw size={18} color="#FFFFFF" /><Text style={styles.retryButtonText}>Retry</Text></TouchableOpacity></View>;

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#057A55" />
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={runQuery.isRefetching} onRefresh={() => void refresh()} tintColor="#FFFFFF" />}>
        <View style={styles.hero}>
          <View style={styles.headerRow}><TouchableOpacity accessibilityLabel="Back to runs" style={styles.backButton} onPress={() => navigation.goBack()}><ArrowLeft size={22} color="#FFFFFF" /></TouchableOpacity><View style={styles.headerCopy}><Text style={styles.heroEyebrow}>ROUTE {run.routeCode}</Text><Text style={styles.heroTitle}>{run.store.name}</Text></View><View style={styles.routeIcon}><Route size={26} color="#057A55" /></View></View>
          <View style={styles.storeAddressRow}><Store size={16} color="#CFF7E6" /><Text style={styles.storeAddressText} numberOfLines={2}>{run.store.address}</Text></View>
          <View style={styles.progressHeader}><Text style={styles.progressTitle}>{completed} of {total} stops</Text><Text style={styles.progressPercent}>{progress}%</Text></View>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>
          <View style={styles.routeStats}>
            <View style={styles.routeStat}><Text style={styles.routeStatValue}>{run.stops.filter((stop) => ['READY', 'PLANNED', 'ARRIVED', 'RETRY_PENDING'].includes(stop.status)).length}</Text><Text style={styles.routeStatLabel}>remaining</Text></View>
            <View style={styles.routeStatDivider} />
            <View style={styles.routeStat}><Text style={styles.routeStatValue}>{run.retryPendingStopCount}</Text><Text style={styles.routeStatLabel}>retry</Text></View>
            <View style={styles.routeStatDivider} />
            <View style={styles.routeStat}><Text style={styles.routeStatValue}>{money(Math.max(0, run.collectedCashPaise - run.depositedCashPaise))}</Text><Text style={styles.routeStatLabel}>cash held</Text></View>
          </View>
        </View>

        {offlinePending > 0 ? <View style={styles.offlinePendingCard}><Clock3 size={20} color="#8A4B00" /><View style={styles.noticeCopy}><Text style={styles.noticeTitle}>{offlinePending} offline action{offlinePending === 1 ? '' : 's'} pending</Text><Text style={styles.noticeText}>Safe non-secret actions will replay after reconnect. Trusted Drop always requires a fresh QR rescan.</Text></View></View> : null}

        {run.status === 'PICKED_UP' ? <TouchableOpacity style={styles.stickyPrimary} disabled={runMutation.isPending} onPress={() => runMutation.mutate('start')}><Navigation size={20} color="#FFFFFF" /><Text style={styles.stickyPrimaryText}>{runMutation.isPending ? 'Starting…' : 'Start delivery run'}</Text></TouchableOpacity> : null}
        {run.status === 'PLANNED' || (run.status === 'READY_FOR_PICKUP' && !run.storeHandoffConfirmedAt) ? <View style={styles.noticeCard}><Clock3 size={20} color="#8A4B00" /><View style={styles.noticeCopy}><Text style={styles.noticeTitle}>Waiting for store handoff</Text><Text style={styles.noticeText}>The store must pack the exact route bags and confirm the physical handoff.</Text></View></View> : null}
        {run.status === 'READY_FOR_PICKUP' && run.storeHandoffConfirmedAt ? <View style={styles.pickupReceiptCard}><View style={styles.pickupReceiptHeader}><Package size={20} color="#087B5A" /><View style={styles.noticeCopy}><Text style={styles.pickupReceiptTitle}>Confirm your independent receipt</Text><Text style={styles.pickupReceiptText}>Count exactly {run.expectedBagCount || run.totalStopCount} bags before accepting this run.</Text></View></View>{run.crateCode ? <TextInput style={styles.input} value={pickupCrateCode} onChangeText={setPickupCrateCode} placeholder="Enter or scan route crate code" placeholderTextColor="#94A3B8" autoCapitalize="characters" /> : null}<TouchableOpacity style={styles.stickyPrimary} disabled={pickupMutation.isPending || Boolean(run.crateCode && !pickupCrateCode.trim())} onPress={() => pickupMutation.mutate()}><ShieldCheck size={20} color="#FFFFFF" /><Text style={styles.stickyPrimaryText}>{pickupMutation.isPending ? 'Verifying receipt…' : `Confirm ${run.expectedBagCount || run.totalStopCount} bags received`}</Text></TouchableOpacity></View> : null}
        {run.status === 'IN_PROGRESS' && currentStop ? <TouchableOpacity style={styles.nextStopCard} onPress={() => setSelectedStopId(currentStop.id)}><View style={styles.nextStopIcon}><MapPin size={24} color="#FFFFFF" /></View><View style={styles.nextStopCopy}><Text style={styles.nextStopEyebrow}>NEXT STOP · {currentStop.sequenceNumber}</Text><Text style={styles.nextStopName}>{currentStop.deliveryJob.order.customer?.name || 'Customer'}</Text><Text style={styles.nextStopAddress} numberOfLines={1}>{addressFrom(currentStop)}</Text></View><ChevronRight size={24} color="#087B5A" /></TouchableOpacity> : null}

        <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Ordered stops</Text><Text style={styles.sectionHint}>No bulk completion</Text></View>
        {run.stops.map((stop) => <StopCard key={stop.id} stop={stop} isCurrent={currentStop?.id === stop.id} onOpen={() => setSelectedStopId(stop.id)} onNavigate={() => openNavigation(stop)} onMove={(direction) => reorderMutation.mutate({ stop, direction })} />)}

        {run.status === 'IN_PROGRESS' ? <TouchableOpacity style={styles.finishButton} disabled={runMutation.isPending} onPress={() => Alert.alert('Finish this route?', 'The server will block completion while any delivery, retry, or return requirement remains unresolved.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Check and finish', onPress: () => runMutation.mutate('finish') }])}><CheckCircle2 size={20} color="#FFFFFF" /><Text style={styles.finishButtonText}>Finish route after all stops</Text></TouchableOpacity> : null}

        {run.status === 'AWAITING_SETTLEMENT' ? <View style={styles.cashCard}><View style={styles.cashTitleRow}><View style={styles.cashIcon}><Banknote size={23} color="#A15C00" /></View><View style={styles.cashCopy}><Text style={styles.cashTitle}>Return cash to store</Text><Text style={styles.cashText}>Individual COD ledgers stay intact. The store independently verifies the physical batch.</Text></View></View><View style={styles.cashTotals}><Text style={styles.cashTotalLabel}>Rider holding</Text><Text style={styles.cashTotalValue}>{money(cashQuery.data?.riderHoldingPaise || 0)}</Text></View><TouchableOpacity style={styles.cashButton} disabled={batchMutation.isPending || !cashQuery.data?.riderHoldingPaise} onPress={() => batchMutation.mutate()}><Text style={styles.cashButtonText}>{batchMutation.isPending ? 'Creating batch…' : 'Create deposit batch'}</Text><ChevronRight size={19} color="#FFFFFF" /></TouchableOpacity></View> : null}
      </ScrollView>

      <Modal visible={Boolean(selectedStop)} transparent animationType="slide" onRequestClose={() => setSelectedStopId(null)}>
        <View style={styles.modalBackdrop}><View style={styles.bottomSheet}>
          {selectedStop ? <>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}><View><Text style={styles.sheetEyebrow}>STOP {selectedStop.sequenceNumber}</Text><Text style={styles.sheetTitle}>{selectedStop.deliveryJob.order.customer?.name || 'Customer delivery'}</Text></View><TouchableOpacity style={styles.closeButton} onPress={() => setSelectedStopId(null)}><X size={21} color="#475569" /></TouchableOpacity></View>
            <ScrollView contentContainerStyle={styles.sheetScroll} keyboardShouldPersistTaps="handled">
              <Text style={styles.sheetAddress}>{addressFrom(selectedStop)}</Text>
              {selectedStop.deliveryJob.order.customer?.phone ? <TouchableOpacity style={styles.contactRow} onPress={() => void Linking.openURL(`tel:${selectedStop.deliveryJob.order.customer.phone}`)}><Phone size={18} color="#087B5A" /><Text style={styles.contactText}>Call customer</Text></TouchableOpacity> : null}
              <View style={selectedStop.cashDuePaise > 0 ? styles.cashDueBanner : styles.fundedBanner}><Banknote size={21} color={selectedStop.cashDuePaise > 0 ? '#8A4B00' : '#087B5A'} /><View style={styles.bannerCopy}><Text style={selectedStop.cashDuePaise > 0 ? styles.cashDueTitle : styles.fundedTitle}>{selectedStop.cashDuePaise > 0 ? `${money(selectedStop.cashDuePaise)} due now` : 'Customer amount due: ₹0'}</Text><Text style={selectedStop.cashDuePaise > 0 ? styles.cashDueText : styles.fundedText}>{selectedStop.cashDuePaise > 0 ? 'Collect the exact amount only after valid OTP.' : 'Subscription already funded. Do not collect cash.'}</Text></View></View>
              {selectedStop.status !== 'ARRIVED' && !['DELIVERED', 'FAILED', 'CANCELLED', 'RETURNED'].includes(selectedStop.status) ? <TouchableOpacity style={styles.sheetPrimary} disabled={arriveMutation.isPending} onPress={() => arriveMutation.mutate(selectedStop)}><MapPin size={20} color="#FFFFFF" /><Text style={styles.sheetPrimaryText}>{arriveMutation.isPending ? 'Reading GPS…' : 'I have arrived'}</Text></TouchableOpacity> : null}
              {selectedStop.status === 'ARRIVED' ? <>
                {!(selectedStop.subscriptionDelivery.subscription.deliveryMethod === 'TRUSTED_DROP' && selectedStop.cashDuePaise === 0) ? <TouchableOpacity style={styles.otpButton} disabled={otpMutation.isPending} onPress={() => otpMutation.mutate(selectedStop)}><KeyRound size={19} color="#087B5A" /><Text style={styles.otpButtonText}>{otpMutation.isPending ? 'Sending OTP…' : 'Send / resend OTP'}</Text></TouchableOpacity> : null}
                {selectedStop.subscriptionDelivery.subscription.deliveryMethod === 'TRUSTED_DROP' && selectedStop.cashDuePaise === 0 ? <><Text style={styles.inputLabel}>One-time Trusted Drop QR</Text><TouchableOpacity style={styles.otpButton} disabled={scanTrustedDropMutation.isPending} onPress={() => scanTrustedDropMutation.mutate()}><KeyRound size={19} color="#087B5A" /><Text style={styles.otpButtonText}>{dropToken ? 'QR scanned · scan again' : scanTrustedDropMutation.isPending ? 'Opening scanner…' : 'Scan customer QR'}</Text></TouchableOpacity><Text style={styles.inputLabel}>Fresh drop photo</Text><TouchableOpacity style={styles.otpButton} disabled={!dropToken || evidenceMutation.isPending} onPress={() => evidenceMutation.mutate(selectedStop)}><Camera size={19} color="#087B5A" /><Text style={styles.otpButtonText}>{trustedEvidenceId ? `Photo secured · ${trustedEvidenceName || 'evidence ready'}` : evidenceMutation.isPending ? 'Uploading secure photo…' : 'Take delivery photo'}</Text></TouchableOpacity><Text style={styles.fundedText}>The QR secret is never saved for offline replay. If connectivity changes before completion, rescan the current QR.</Text></> : <><Text style={styles.inputLabel}>Six-digit OTP</Text><TextInput style={[styles.input, styles.otpInput]} value={otpCode} onChangeText={(value) => setOtpCode(value.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" maxLength={6} placeholder="000000" placeholderTextColor="#94A3B8" /></>}
                <Text style={styles.inputLabel}>Delivery note (optional)</Text><TextInput style={[styles.input, styles.noteInput]} multiline value={deliveryNote} onChangeText={setDeliveryNote} placeholder="Quantity confirmed, drop location, recipient…" placeholderTextColor="#94A3B8" />
                <TouchableOpacity style={styles.sheetPrimary} disabled={completeMutation.isPending} onPress={() => completeMutation.mutate(selectedStop)}><CheckCircle2 size={20} color="#FFFFFF" /><Text style={styles.sheetPrimaryText}>{completeMutation.isPending ? 'Verifying delivery…' : 'Verify and complete this stop'}</Text></TouchableOpacity>
                <TouchableOpacity style={styles.failButton} onPress={() => setFailureOpen(true)}><CircleAlert size={19} color="#B42318" /><Text style={styles.failButtonText}>Report failure or request retry</Text></TouchableOpacity>
              </> : null}
              {selectedStop.status === 'DELIVERED' ? <View style={styles.deliveredState}><CheckCircle2 size={34} color="#087B5A" /><Text style={styles.deliveredTitle}>Delivery verified</Text><Text style={styles.deliveredText}>This stop is immutable and cannot be completed again.</Text></View> : null}
            </ScrollView>
          </> : null}
        </View></View>
      </Modal>

      <Modal visible={failureOpen && Boolean(selectedStop)} transparent animationType="slide" onRequestClose={() => setFailureOpen(false)}>
        <View style={styles.modalBackdrop}><View style={styles.bottomSheet}><View style={styles.sheetHandle} /><View style={styles.sheetHeader}><View><Text style={styles.sheetEyebrow}>DELIVERY EXCEPTION</Text><Text style={styles.sheetTitle}>What prevented delivery?</Text></View><TouchableOpacity style={styles.closeButton} onPress={() => setFailureOpen(false)}><X size={21} color="#475569" /></TouchableOpacity></View><ScrollView contentContainerStyle={styles.sheetScroll}>
          <View style={styles.reasonGrid}>{FAILURE_REASONS.map((reason) => <TouchableOpacity key={reason.value} style={[styles.reasonChip, failureReason === reason.value && styles.reasonChipActive]} onPress={() => setFailureReason(reason.value)}><Text style={[styles.reasonChipText, failureReason === reason.value && styles.reasonChipTextActive]}>{reason.label}</Text></TouchableOpacity>)}</View>
          <Text style={styles.inputLabel}>Operational note</Text><TextInput style={[styles.input, styles.noteInput]} value={failureNote} onChangeText={setFailureNote} multiline placeholder="What happened and what should the next operator know?" placeholderTextColor="#94A3B8" />
          <View style={styles.retryRow}><View style={styles.retryCopy}><Text style={styles.retryTitle}>Retry this stop</Text><Text style={styles.retryText}>Keep it unresolved so the run cannot close accidentally.</Text></View><Switch value={retryRequested} onValueChange={setRetryRequested} trackColor={{ false: '#CBD5E1', true: '#8EDDC0' }} thumbColor={retryRequested ? '#087B5A' : '#FFFFFF'} /></View>
          <TouchableOpacity style={styles.failureSubmit} disabled={failMutation.isPending || !selectedStop} onPress={() => selectedStop && failMutation.mutate(selectedStop)}><CircleAlert size={20} color="#FFFFFF" /><Text style={styles.failureSubmitText}>{failMutation.isPending ? 'Recording…' : retryRequested ? 'Record and keep for retry' : 'Record delivery failure'}</Text></TouchableOpacity>
        </ScrollView></View></View>
      </Modal>

      <Modal visible={cashModalOpen} transparent animationType="slide" onRequestClose={() => setCashModalOpen(false)}>
        <View style={styles.modalBackdrop}><View style={styles.bottomSheet}><View style={styles.sheetHandle} /><View style={styles.sheetHeader}><View><Text style={styles.sheetEyebrow}>PHYSICAL CASH HANDOFF</Text><Text style={styles.sheetTitle}>Submit deposit batch</Text></View><TouchableOpacity style={styles.closeButton} onPress={() => setCashModalOpen(false)}><X size={21} color="#475569" /></TouchableOpacity></View><View style={styles.sheetScroll}>
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
  screen: { flex: 1, backgroundColor: '#F3F7F5' }, content: { paddingBottom: 110 },
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: '#F3F7F5', gap: 12 }, loadingTitle: { color: '#17211D', fontSize: 19, fontWeight: '900' }, loadingText: { color: '#64748B', fontSize: 13, lineHeight: 19, textAlign: 'center' }, retryButton: { minHeight: 48, borderRadius: 15, backgroundColor: '#087B5A', paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 8 }, retryButtonText: { color: '#FFFFFF', fontWeight: '900' },
  hero: { backgroundColor: '#057A55', paddingHorizontal: 18, paddingTop: 22, paddingBottom: 21, borderBottomLeftRadius: 30, borderBottomRightRadius: 30 }, headerRow: { flexDirection: 'row', alignItems: 'center' }, backButton: { width: 44, height: 44, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.13)', alignItems: 'center', justifyContent: 'center' }, headerCopy: { flex: 1, marginLeft: 12 }, heroEyebrow: { color: '#BAF3DD', fontSize: 10, letterSpacing: 1.2, fontWeight: '900' }, heroTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', marginTop: 2 }, routeIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#ECFFF7', alignItems: 'center', justifyContent: 'center' }, storeAddressRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginTop: 14 }, storeAddressText: { flex: 1, color: '#D7F8EA', fontSize: 12, lineHeight: 18 }, progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 }, progressTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' }, progressPercent: { color: '#BAF3DD', fontSize: 13, fontWeight: '900' }, progressTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden', marginTop: 8 }, progressFill: { height: 8, borderRadius: 4, backgroundColor: '#6EE7B7' }, routeStats: { flexDirection: 'row', marginTop: 17, paddingVertical: 12, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.11)' }, routeStat: { flex: 1, alignItems: 'center' }, routeStatValue: { color: '#FFFFFF', fontSize: 17, fontWeight: '900' }, routeStatLabel: { color: '#CFF7E6', fontSize: 10, marginTop: 2 }, routeStatDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.22)' },
  stickyPrimary: { minHeight: 54, margin: 16, marginBottom: 0, borderRadius: 17, backgroundColor: '#087B5A', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 }, stickyPrimaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' }, offlinePendingCard: { margin: 16, marginBottom: 0, borderRadius: 18, backgroundColor: '#FFF5DE', borderWidth: 1, borderColor: '#F0D9A7', padding: 15, flexDirection: 'row', gap: 11 }, noticeCard: { margin: 16, marginBottom: 0, borderRadius: 18, backgroundColor: '#FFF5DE', borderWidth: 1, borderColor: '#F0D9A7', padding: 15, flexDirection: 'row', gap: 11 }, noticeCopy: { flex: 1 }, noticeTitle: { color: '#704000', fontSize: 14, fontWeight: '900' }, noticeText: { color: '#8A5A14', fontSize: 12, lineHeight: 18, marginTop: 2 },
  nextStopCard: { margin: 16, marginBottom: 0, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#B8DDCE', padding: 15, flexDirection: 'row', alignItems: 'center', shadowColor: '#0F2A20', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 4 }, nextStopIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#087B5A', alignItems: 'center', justifyContent: 'center' }, nextStopCopy: { flex: 1, marginHorizontal: 12 }, nextStopEyebrow: { color: '#087B5A', fontSize: 10, fontWeight: '900', letterSpacing: 1 }, nextStopName: { color: '#17211D', fontSize: 16, fontWeight: '900', marginTop: 2 }, nextStopAddress: { color: '#64748B', fontSize: 11, marginTop: 2 },
  sectionHeader: { marginTop: 23, marginBottom: 11, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sectionTitle: { color: '#17211D', fontSize: 19, fontWeight: '900' }, sectionHint: { color: '#087B5A', fontSize: 10, fontWeight: '900', backgroundColor: '#E2F5EC', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10 },
  stopCard: { marginHorizontal: 16, marginBottom: 12, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 15, borderWidth: 1, borderColor: '#E1EAE6' }, stopCardCurrent: { borderColor: '#60C69E', borderWidth: 2 }, stopHeader: { flexDirection: 'row', alignItems: 'flex-start' }, sequenceCircle: { width: 37, height: 37, borderRadius: 19, backgroundColor: '#EEF3F1', alignItems: 'center', justifyContent: 'center' }, sequenceCircleCurrent: { backgroundColor: '#087B5A' }, sequenceText: { color: '#475569', fontSize: 14, fontWeight: '900' }, sequenceTextCurrent: { color: '#FFFFFF' }, stopHeadingCopy: { flex: 1, marginHorizontal: 10 }, customerName: { color: '#17211D', fontSize: 15, fontWeight: '900' }, addressText: { color: '#64748B', fontSize: 11, lineHeight: 16, marginTop: 2 }, statusChip: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10, maxWidth: 105 }, statusChipText: { fontSize: 9, fontWeight: '900', textAlign: 'center' }, statusComplete: { backgroundColor: '#E5F7EE' }, statusCompleteText: { color: '#087B5A' }, statusDanger: { backgroundColor: '#FDECEC' }, statusDangerText: { color: '#B42318' }, statusWarning: { backgroundColor: '#FFF1D6' }, statusWarningText: { color: '#8A4B00' }, statusNeutral: { backgroundColor: '#EEF2F6' }, statusNeutralText: { color: '#475569' }, itemsBox: { marginTop: 12, borderRadius: 13, backgroundColor: '#F8FAF9', padding: 10, gap: 6 }, itemRow: { flexDirection: 'row', alignItems: 'center', gap: 7 }, itemText: { color: '#475569', fontSize: 12, fontWeight: '600' }, proofRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 11 }, proofText: { flex: 1, color: '#475569', fontSize: 11, fontWeight: '700' }, failureNote: { marginTop: 10, borderRadius: 12, backgroundColor: '#FEF1F0', padding: 9, flexDirection: 'row', gap: 7 }, failureNoteText: { flex: 1, color: '#9F2D23', fontSize: 11 }, stopActions: { flexDirection: 'row', alignItems: 'center', marginTop: 13, gap: 8 }, secondaryButton: { minHeight: 42, borderRadius: 13, borderWidth: 1, borderColor: '#B8DDCE', paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 5 }, secondaryButtonText: { color: '#087B5A', fontSize: 11, fontWeight: '900' }, reorderButtons: { flexDirection: 'row', gap: 5 }, iconButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F1F5F3', alignItems: 'center', justifyContent: 'center' }, primaryButtonSmall: { marginLeft: 'auto', minHeight: 42, borderRadius: 13, backgroundColor: '#087B5A', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 4 }, primaryButtonSmallText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  finishButton: { minHeight: 54, marginHorizontal: 16, marginTop: 6, borderRadius: 17, backgroundColor: '#243C33', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, finishButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' }, cashCard: { margin: 16, borderRadius: 22, backgroundColor: '#FFF8E9', borderWidth: 1, borderColor: '#EDD8A8', padding: 17 }, cashTitleRow: { flexDirection: 'row', alignItems: 'center' }, cashIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: '#FFE9B6', alignItems: 'center', justifyContent: 'center' }, cashCopy: { flex: 1, marginLeft: 11 }, cashTitle: { color: '#704000', fontSize: 16, fontWeight: '900' }, cashText: { color: '#8A5A14', fontSize: 11, lineHeight: 16, marginTop: 2 }, cashTotals: { marginTop: 15, borderRadius: 14, backgroundColor: '#FFFFFF', padding: 13, flexDirection: 'row', justifyContent: 'space-between' }, cashTotalLabel: { color: '#64748B', fontSize: 12, fontWeight: '700' }, cashTotalValue: { color: '#704000', fontSize: 18, fontWeight: '900' }, cashButton: { minHeight: 50, marginTop: 12, borderRadius: 15, backgroundColor: '#A15C00', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, cashButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.46)', justifyContent: 'flex-end' }, bottomSheet: { maxHeight: '91%', backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 9, paddingBottom: 24 }, sheetHandle: { width: 44, height: 5, borderRadius: 3, backgroundColor: '#D1D9D5', alignSelf: 'center' }, sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingTop: 14, paddingBottom: 11, borderBottomWidth: 1, borderBottomColor: '#EDF1EF' }, sheetEyebrow: { color: '#087B5A', fontSize: 10, fontWeight: '900', letterSpacing: 1.1 }, sheetTitle: { color: '#17211D', fontSize: 20, fontWeight: '900', marginTop: 2 }, closeButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#F1F5F3', alignItems: 'center', justifyContent: 'center' }, sheetScroll: { padding: 18, paddingBottom: 34 }, sheetAddress: { color: '#475569', fontSize: 13, lineHeight: 19 }, contactRow: { marginTop: 10, minHeight: 43, alignSelf: 'flex-start', borderRadius: 13, backgroundColor: '#E7F7EF', paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 7 }, contactText: { color: '#087B5A', fontSize: 12, fontWeight: '900' }, cashDueBanner: { marginTop: 14, borderRadius: 16, backgroundColor: '#FFF2D9', borderWidth: 1, borderColor: '#EDD39D', padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10 }, fundedBanner: { marginTop: 14, borderRadius: 16, backgroundColor: '#E6F8EF', borderWidth: 1, borderColor: '#B9E5D1', padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10 }, bannerCopy: { flex: 1 }, cashDueTitle: { color: '#704000', fontSize: 14, fontWeight: '900' }, cashDueText: { color: '#8A5A14', fontSize: 11, lineHeight: 16, marginTop: 2 }, fundedTitle: { color: '#075E45', fontSize: 14, fontWeight: '900' }, fundedText: { color: '#087B5A', fontSize: 11, lineHeight: 16, marginTop: 2 }, sheetPrimary: { minHeight: 54, marginTop: 15, borderRadius: 16, backgroundColor: '#087B5A', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, sheetPrimaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' }, otpButton: { minHeight: 48, marginTop: 14, borderRadius: 15, borderWidth: 1, borderColor: '#9ED6BF', backgroundColor: '#EFFBF5', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, otpButtonText: { color: '#087B5A', fontSize: 13, fontWeight: '900' }, inputLabel: { color: '#334155', fontSize: 12, fontWeight: '900', marginTop: 14, marginBottom: 7 }, input: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: '#D5DEDA', backgroundColor: '#FAFCFB', paddingHorizontal: 14, color: '#17211D', fontSize: 14 }, otpInput: { fontSize: 22, fontWeight: '900', letterSpacing: 7, textAlign: 'center' }, noteInput: { minHeight: 86, paddingTop: 12, textAlignVertical: 'top' }, failButton: { minHeight: 50, marginTop: 10, borderRadius: 15, borderWidth: 1, borderColor: '#F2BBB7', backgroundColor: '#FFF7F6', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, failButtonText: { color: '#B42318', fontSize: 13, fontWeight: '900' }, deliveredState: { alignItems: 'center', paddingVertical: 35, gap: 8 }, deliveredTitle: { color: '#087B5A', fontSize: 18, fontWeight: '900' }, deliveredText: { color: '#64748B', fontSize: 12, textAlign: 'center' },
  reasonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, reasonChip: { minHeight: 42, borderRadius: 13, borderWidth: 1, borderColor: '#D7DFDB', paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center' }, reasonChipActive: { borderColor: '#B42318', backgroundColor: '#FFF0EF' }, reasonChipText: { color: '#475569', fontSize: 11, fontWeight: '800' }, reasonChipTextActive: { color: '#B42318' }, retryRow: { marginTop: 16, borderRadius: 16, backgroundColor: '#F7FAF8', padding: 13, flexDirection: 'row', alignItems: 'center' }, retryCopy: { flex: 1, paddingRight: 12 }, retryTitle: { color: '#17211D', fontSize: 14, fontWeight: '900' }, retryText: { color: '#64748B', fontSize: 11, lineHeight: 16, marginTop: 2 }, failureSubmit: { minHeight: 54, marginTop: 16, borderRadius: 16, backgroundColor: '#B42318', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, failureSubmitText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  expectedCashBox: { borderRadius: 18, backgroundColor: '#FFF5DE', padding: 17, alignItems: 'center' }, expectedCashLabel: { color: '#8A5A14', fontSize: 11, fontWeight: '800' }, expectedCashValue: { color: '#704000', fontSize: 29, fontWeight: '900', marginTop: 4 }, cashInput: { fontSize: 21, fontWeight: '900' }, cashDisclaimer: { color: '#64748B', fontSize: 11, lineHeight: 17, marginTop: 12 },
  pickupReceiptCard: { marginHorizontal: 16, marginBottom: 14, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#B8DDCE', padding: 15, gap: 12 },
  pickupReceiptHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  pickupReceiptTitle: { color: '#17211D', fontSize: 14, fontWeight: '900' },
  pickupReceiptText: { color: '#64748B', fontSize: 11, lineHeight: 17, marginTop: 3 },
});
