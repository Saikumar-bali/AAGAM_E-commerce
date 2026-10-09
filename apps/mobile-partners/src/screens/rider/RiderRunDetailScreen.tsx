import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  CalendarDays,
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
  Plus,
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
import { riderService } from '../../api/riderService';
import { RIDER_RUNS_QUERY_KEY } from './RiderRunsScreen';
import { PartnerQrScanner } from '../../native/PartnerQrScanner';
import { PartnerDocumentPicker } from '../../native/PartnerDocumentPicker';
import { PartnerConnectivity } from '../../native/PartnerConnectivity';
import { RiderRunOfflineQueue } from '../../services/RiderRunOfflineQueue';
import { RiderRouteMap } from '../../components/rider/RiderRouteMap';
import type { RiderMapStop } from '../../components/rider/riderRouteMapHtml';

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

const SKIP_REASONS = ['Customer requested skip', 'Not on my route today', 'Store instructed skip', 'Customer paid in advance', 'Other'];

const EXTRA_PRESETS = [
  { label: '+0.5L', qty: '+0.5L', price: '40' },
  { label: '+1L', qty: '+1L', price: '80' },
  { label: '+1.5L', qty: '+1.5L', price: '120' },
  { label: '+2L', qty: '+2L', price: '160' },
];

const SCHEDULE_DAYS = [
  { label: 'Today (1d)', days: 1 },
  { label: '2 Days', days: 2 },
  { label: '3 Days', days: 3 },
  { label: '5 Days', days: 5 },
  { label: '7 Days', days: 7 },
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

// A customer may hold more than one subscription (different plan or slot), and
// each delivery becomes its own stop. Identify the customer so the route can
// flag the duplicates, then label each stop with its own plan/slot.
function customerKey(stop: DeliveryRunStop) {
  const customer = stop.deliveryJob.order.customer;
  return customer?.phone || customer?.name || stop.subscriptionDelivery?.subscription?.customerId || stop.id;
}

function planLabel(stop: DeliveryRunStop) {
  const plan = stop.subscriptionDelivery?.subscription?.plan?.name;
  const items = stop.deliveryJob.order.items || [];
  const itemLabel = items.map((item) => `${item.quantity} × ${item.product.name}`).join(' · ');
  return plan || itemLabel || 'Subscription';
}

function stopCoordinates(stop: DeliveryRunStop): Coordinates | null {
  if (typeof stop.deliveryLatitude === 'number' && typeof stop.deliveryLongitude === 'number') {
    return { latitude: stop.deliveryLatitude, longitude: stop.deliveryLongitude };
  }
  const snapshot = stop.subscriptionDelivery?.subscription?.addressSnapshot || {};
  const latitude = typeof snapshot.latitude === 'number' ? snapshot.latitude : undefined;
  const longitude = typeof snapshot.longitude === 'number' ? snapshot.longitude : undefined;
  return latitude != null && longitude != null ? { latitude, longitude } : null;
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

function proofDescriptor(stop: DeliveryRunStop): { kind: 'PHOTO_GPS' | 'TRUSTED_DROP' | 'OTP'; Icon: typeof Camera; tint: string; summary: string; quickLabel: string } {
  const isPhotoGps = (stop as any).proofMode === 'RIDER_PHOTO_GPS';
  const method = stop.subscriptionDelivery?.subscription?.deliveryMethod;
  const cash = stop.cashDuePaise > 0;
  if (isPhotoGps) {
    return {
      kind: 'PHOTO_GPS', Icon: cash ? Banknote : Camera, tint: cash ? '#A15C00' : '#0F766E',
      summary: cash ? `Collect ${money(stop.cashDuePaise)} · Photo proof & GPS (No OTP)` : '₹0 due · Photo proof & GPS (No OTP)',
      quickLabel: 'Deliver now',
    };
  }
  if (cash) {
    return { kind: 'OTP', Icon: Banknote, tint: '#A15C00', summary: `Collect exactly ${money(stop.cashDuePaise)} with customer OTP`, quickLabel: 'Deliver now' };
  }
  if (method === 'TRUSTED_DROP') {
    return { kind: 'TRUSTED_DROP', Icon: Camera, tint: '#0F766E', summary: '₹0 due · one-time QR, arrival/completion GPS and fresh photo required', quickLabel: 'Deliver now' };
  }
  if (method === 'SECURITY_RECEPTION') {
    return { kind: 'OTP', Icon: ShieldCheck, tint: '#155E75', summary: '₹0 due · security/reception OTP handover', quickLabel: 'Deliver now' };
  }
  return { kind: 'OTP', Icon: KeyRound, tint: '#155E75', summary: '₹0 due · customer OTP handover', quickLabel: 'Deliver now' };
}

function ProofSummary({ stop }: { stop: DeliveryRunStop }) {
  const proof = proofDescriptor(stop);
  const ProofIcon = proof.Icon;
  return <View style={styles.proofRow}><ProofIcon size={17} color={proof.tint} /><Text style={styles.proofText}>{proof.summary}</Text></View>;
}

function StopCard({
  stop,
  isCurrent,
  duplicateCustomer,
  onOpen,
  onNavigate,
  onMove,
  onDeliverNow,
  onSkip,
}: {
  stop: DeliveryRunStop;
  isCurrent: boolean;
  duplicateCustomer?: boolean;
  onOpen: () => void;
  onNavigate: () => void;
  onMove: (direction: 'up' | 'down') => void;
  onDeliverNow: () => void;
  onSkip: () => void;
}) {
  const customer = stop.deliveryJob.order.customer;
  const proof = proofDescriptor(stop);
  const actionable = !['DELIVERED', 'CANCELLED', 'FAILED', 'RETURNED'].includes(stop.status);
  const skippable = actionable && !['DELIVERED', 'FAILED', 'CANCELLED', 'RETURNED'].includes(stop.status);
  return (
    <View style={[styles.stopCard, isCurrent && styles.stopCardCurrent]}>
      <View style={styles.stopHeader}>
        <View style={[styles.sequenceCircle, isCurrent && styles.sequenceCircleCurrent]}><Text style={[styles.sequenceText, isCurrent && styles.sequenceTextCurrent]}>{stop.sequenceNumber}</Text></View>
        <View style={styles.stopHeadingCopy}>
          <Text style={styles.customerName}>{customer?.name || 'Customer'}</Text>
          <Text style={styles.addressText} numberOfLines={2}>{addressFrom(stop)}</Text>
          <View style={styles.planRow}>
            <Text style={styles.planText} numberOfLines={1}>{planLabel(stop)}</Text>
            {duplicateCustomer ? <Text style={styles.multiSubBadge}>2 subscriptions</Text> : null}
          </View>
        </View>
        <StatusChip value={stop.status} />
      </View>
      <View style={styles.itemsBox}>
        {stop.deliveryJob.order.items.map((item) => <View key={item.id} style={styles.itemRow}><Package size={15} color="#64748B" /><Text style={styles.itemText}>{item.quantity} × {item.product.name}</Text></View>)}
      </View>
      <ProofSummary stop={stop} />
      {stop.failureReason ? <View style={styles.failureNote}><CircleAlert size={15} color="#B42318" /><Text style={styles.failureNoteText}>{stop.failureReason}</Text></View> : null}

      {actionable ? (
        <View style={styles.quickActions}>
          <TouchableOpacity accessibilityLabel={`Deliver stop ${stop.sequenceNumber} now`} style={styles.quickPrimary} onPress={onDeliverNow}>
            <CheckCircle2 size={16} color="#FFFFFF" />
            <Text style={styles.quickPrimaryText}>{proof.quickLabel}</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityLabel={`Skip stop ${stop.sequenceNumber}`} style={styles.quickGhost} onPress={onSkip}>
            <ArrowDown size={15} color="#B45309" />
            <Text style={styles.quickGhostText}>Skip</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.stopActions}>
        <TouchableOpacity accessibilityLabel={`Navigate to stop ${stop.sequenceNumber}`} style={styles.secondaryButton} onPress={onNavigate}><Navigation size={17} color="#0F766E" /><Text style={styles.secondaryButtonText}>Navigate</Text></TouchableOpacity>
        {skippable ? (
          <View style={styles.reorderButtons}>
            <TouchableOpacity accessibilityLabel="Move stop earlier" style={styles.iconButton} onPress={() => onMove('up')}><ArrowUp size={17} color="#475569" /></TouchableOpacity>
            <TouchableOpacity accessibilityLabel="Move stop later" style={styles.iconButton} onPress={() => onMove('down')}><ArrowDown size={17} color="#475569" /></TouchableOpacity>
          </View>
        ) : null}
        <TouchableOpacity accessibilityLabel={`Open stop ${stop.sequenceNumber} details`} style={styles.primaryButtonSmall} onPress={onOpen}><Text style={styles.primaryButtonSmallText}>{stop.status === 'DELIVERED' ? 'View' : 'Open'}</Text><ChevronRight size={17} color="#FFFFFF" /></TouchableOpacity>
      </View>
    </View>
  );
}

// Module scope so it survives component remounts: a reopened screen would
// otherwise restart a component-scoped counter and reuse an idempotency key
// that a prior add-on already consumed, silently replaying the old request.
let extraMilkNonce = 0;

const nextExtraMilkNonce = () => {
  extraMilkNonce += 1;
  return `${Date.now().toString(36)}-${extraMilkNonce.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

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
  const [extraMilkOpen, setExtraMilkOpen] = useState(false);
  const [extraPreset, setExtraPreset] = useState('+1L');
  const [extraQty, setExtraQty] = useState('+1L');
  const [extraPriceRupees, setExtraPriceRupees] = useState('80');
  const [extraDays, setExtraDays] = useState(1);
  const [extraSlot, setExtraSlot] = useState<'AM' | 'PM'>('PM');
  const [extraNote, setExtraNote] = useState('');
  const [riderLocation, setRiderLocation] = useState<Coordinates | null>(null);
  const locationWatch = useRef<number | null>(null);
  const [skipOpen, setSkipOpen] = useState(false);
  const [skipReason, setSkipReason] = useState('Customer requested skip');
  const [showFullStop, setShowFullStop] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  // A fresh nonce is minted when the add-on dialog opens and held in a ref for
  // the lifetime of that dialog: retries of one submission reuse the same key,
  // while every new add-on (including after a remount) gets a distinct one.
  const extraKeyRef = useRef('');
  // "today" attaches one extra to this delivery; "next" schedules the coming
  // days as a recurring add-on (mirrors the store grid's ATTACH_EVENING_MILK).
  const extraWhen: 'today' | 'next' = extraDays > 1 ? 'next' : 'today';

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
  const selectedStop = run?.stops.find((stop) => stop.id === selectedStopId) || null;
  const currentStop = useMemo(() => run?.stops.find((stop) => ['READY', 'PLANNED', 'ARRIVED', 'RETRY_PENDING'].includes(stop.status)) || null, [run?.stops]);
  // "Deliver now" on a not-yet-arrived stop needs an arrival record first (the
  // server requires it). Remember which stop the rider asked to deliver so the
  // open sheet can auto-arrive and jump straight to the proof step.
  const pendingQuickDeliverRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedStop) { pendingQuickDeliverRef.current = null; return; }
    if (pendingQuickDeliverRef.current !== selectedStop.id) return;
    if (selectedStop.status !== 'READY' && selectedStop.status !== 'PLANNED' && selectedStop.status !== 'RETRY_PENDING') return;
    pendingQuickDeliverRef.current = null;
    arriveMutation.mutate(selectedStop);
  }, [selectedStop?.id, selectedStop?.status]);

  const mapDestination = currentStop
    ? stopCoordinates(currentStop)
    : (run?.store && typeof run.store.latitude === 'number' && typeof run.store.longitude === 'number'
      ? { latitude: run.store.latitude, longitude: run.store.longitude }
      : null);
  const mapDestinationLabel = currentStop
    ? `${currentStop.sequenceNumber}. ${currentStop.deliveryJob.order.customer?.name || 'Customer'}`
    : run?.store?.name || 'Store';
  // Customers holding more than one subscription get one stop per subscription,
  // so flag those so the rider can tell the two deliveries apart and mark each
  // one delivered on its own.
  const duplicateCustomerKeys = useMemo(() => {
    const counts = new Map<string, number>();
    (run?.stops || []).forEach((stop) => {
      const key = customerKey(stop);
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return new Set(Array.from(counts.entries()).filter(([, count]) => count > 1).map(([key]) => key));
  }, [run?.stops]);
  const mapStops = useMemo<RiderMapStop[]>(() => (run?.stops || []).flatMap((stop) => {
    const point = stopCoordinates(stop);
    if (!point) return [];
    const isCurrent = currentStop?.id === stop.id;
    const done = ['DELIVERED', 'COMPLETED'].includes(String(stop.status));
    const multiSub = duplicateCustomerKeys.has(customerKey(stop));
    return [{
      latitude: point.latitude,
      longitude: point.longitude,
      sequence: stop.sequenceNumber,
      label: multiSub ? `${stop.deliveryJob.order.customer?.name || 'Customer'} · ${planLabel(stop)}` : stop.deliveryJob.order.customer?.name || 'Customer',
      state: isCurrent ? 'current' : done ? 'done' : 'upcoming',
    }];
  }), [run?.stops, currentStop?.id, duplicateCustomerKeys]);
  const upcomingStops = useMemo(() => (run?.stops || [])
    .filter((stop) => !['DELIVERED', 'CANCELLED', 'FAILED', 'RETURNED'].includes(String(stop.status)))
    .slice()
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber), [run?.stops]);
  const completed = Number(run?.completedStopCount || 0);
  const total = Math.max(Number(run?.totalStopCount || run?.stops.length || 0), 1);
  const progress = Math.min(100, Math.round((completed / total) * 100));
  const stopPoint = selectedStop ? stopCoordinates(selectedStop) : null;

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
    onError: async (error) => {
      // A conflict means another tab/refetch already bumped the stop; pull the
      // fresh version so the rider can retry instead of staring at a stale sheet.
      if (/changed|refresh and try again/i.test(errorMessage(error))) await refresh();
      Toast.show({ type: 'error', text1: 'Could not record arrival', text2: errorMessage(error) });
    },
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
    mutationFn: async (args: { stop: DeliveryRunStop; photoGpsOnly: boolean }) => {
      const { stop, photoGpsOnly } = args;
      if (!photoGpsOnly && !dropToken) throw new Error('Scan the customer Trusted Drop QR first.');
      const picked = await PartnerDocumentPicker.captureImage();
      if (!picked.type.startsWith('image/')) throw new Error('Delivery proof must be a camera image.');
      if (picked.size > 6 * 1024 * 1024) throw new Error('Delivery proof photo must be 6 MB or smaller.');
      if (photoGpsOnly) {
        // This upload returns a real evidence/... storage key, which is what
        // RiderPhotoProof.storageKey and the admin evidence viewer both expect.
        const uploaded = await riderService.uploadEvidence({
          uri: picked.uri,
          name: picked.name,
          type: picked.type,
          size: picked.size,
        });
        return { id: uploaded.storageKey, name: picked.name };
      }
      const result = await subscriptionOperationsService.uploadTrustedDropEvidence(runId, stop.id, {
        trustedDropToken: dropToken,
        file: { uri: picked.uri, name: picked.name, type: picked.type },
        capturedAt: new Date().toISOString(),
      });
      return { ...result, name: picked.name };
    },
    onSuccess: (result, args) => {
      setTrustedEvidenceId(result.id);
      setTrustedEvidenceName(result.name);
      Toast.show({
        type: 'success',
        text1: args.photoGpsOnly ? 'Delivery photo secured' : 'Drop photo secured',
        text2: args.photoGpsOnly
          ? 'The photo is stored against this stop.'
          : 'The evidence is bound to this stop, rider, and QR version.',
      });
    },
    onError: (error) => Toast.show({ type: 'error', text1: 'Photo upload failed', text2: errorMessage(error) }),
  });

  const completeMutation = useMutation({
    mutationFn: async (stop: DeliveryRunStop) => {
      const coordinates = await currentLocation();
      const isPhotoGps = (stop as any).proofMode === 'RIDER_PHOTO_GPS';
      const trusted = stop.subscriptionDelivery?.subscription?.deliveryMethod === 'TRUSTED_DROP' && stop.cashDuePaise === 0;
      if (!(await PartnerConnectivity.getCurrent())) {
        if (trusted || isPhotoGps) {
          throw new Error('Reconnect before completing; delivery proof photos are verified online.');
        }
        throw new Error('Reconnect before final handover verification; OTP/proof secrets are not persisted offline.');
      }
      if (isPhotoGps && !trustedEvidenceId) throw new Error('Take a delivery photo proof before completing.');
      if (trusted && (!dropToken.trim() || !trustedEvidenceId)) throw new Error('Scan the current Trusted Drop QR and upload a fresh photo.');
      if (!trusted && !isPhotoGps && !/^\d{6}$/.test(otpCode)) throw new Error('Enter the six-digit customer OTP.');
      return subscriptionOperationsService.completeStop(runId, stop.id, {
        ...coordinates,
        version: stop.version,
        riderConfirmed: true,
        otpCode: trusted || isPhotoGps ? undefined : otpCode,
        trustedDropToken: trusted && !isPhotoGps ? dropToken.trim() : undefined,
        evidenceId: isPhotoGps || trusted ? trustedEvidenceId : undefined,
        // Collect only what is still owed today; a part payment already
        // recorded against this stop is subtracted so the door total matches
        // the ledger.
        cashCollectedPaise: stopOutstandingPaise(stop) > 0 ? stopOutstandingPaise(stop) : undefined,
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

  const skipMutation = useMutation({
    mutationFn: async (stop: DeliveryRunStop) => subscriptionOperationsService.skipStop(runId, stop.id, { reason: skipReason.trim() || 'Customer requested skip', version: stop.version }),
    onSuccess: async () => {
      setSkipOpen(false); setSelectedStopId(null);
      await refresh();
      Toast.show({ type: 'success', text1: 'Stop skipped', text2: 'Marked as customer-requested skip; the store and admin can see it.' });
    },
    onError: (error) => Toast.show({ type: 'error', text1: 'Could not skip stop', text2: errorMessage(error) }),
  });

  // Collect a part payment at the door. The rider types the amount in rupees;
  // the server caps it at the day's outstanding due, so we validate the same
  // ceiling here to fail fast with a clear message.
  const paymentMutation = useMutation({
    mutationFn: async ({ stop, amountPaise, note }: { stop: DeliveryRunStop; amountPaise: number; note?: string }) =>
      subscriptionOperationsService.recordStopPayment(runId, stop.id, {
        version: stop.version,
        amountPaise,
        paymentMode: 'CASH',
        note,
      }),
    onSuccess: async (result, vars) => {
      setPaymentOpen(false);
      setPaymentAmount('');
      setPaymentNote('');
      await refresh();
      Toast.show({
        type: 'success',
        text1: `Collected ${money(Number(result?.amountPaise ?? vars.amountPaise))}`,
        text2: 'Recorded against this stop. Hand the cash to the store at settlement.',
      });
    },
    onError: async (error) => {
      if (/changed|refresh and try again/i.test(errorMessage(error))) await refresh();
      Toast.show({ type: 'error', text1: 'Could not record payment', text2: errorMessage(error) });
    },
  });

  // Undo a mistaken completion or skip. This is deliberately explicit: it
  // reverses the funding entitlement and cash counters on the server.
  const undoMutation = useMutation({
    mutationFn: async (stop: DeliveryRunStop) =>
      subscriptionOperationsService.undoStop(runId, stop.id, { version: stop.version, reason: 'Reversed from rider app' }),
    onSuccess: async () => {
      await refresh();
      Toast.show({ type: 'success', text1: 'Stop reopened', text2: 'The delivery count and cash totals were reversed.' });
    },
    onError: async (error) => {
      if (/changed|refresh and try again/i.test(errorMessage(error))) await refresh();
      Toast.show({ type: 'error', text1: 'Could not undo stop', text2: errorMessage(error) });
    },
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

  const extraMilkMutation = useMutation({
    mutationFn: async ({
      stop,
      quantity,
      paise,
      days,
      slot,
      note,
      idempotencyKey,
    }: {
      stop: DeliveryRunStop;
      quantity: string;
      paise: number;
      days: number;
      slot: 'AM' | 'PM';
      note?: string;
      idempotencyKey: string;
    }) => {
      return subscriptionOperationsService.addExtraMilk(runId, stop.id, {
        extraQuantity: quantity,
        extraPaise: paise,
        consecutiveDays: days,
        // Only meaningful for a recurring add-on; the base delivery keeps its slot.
        targetSlot: days > 1 ? slot : undefined,
        note,
      }, idempotencyKey);
    },
    onSuccess: async (result, vars) => {
      setExtraMilkOpen(false);
      setExtraNote('');
      await refresh();
      // Report what the API actually scheduled and charged: a request near the
      // end of a plan is applied to fewer days than asked for, so the recorded
      // scheduledDays/totalExtraPaise can differ from the requested values.
      const scheduledDays = Number(result?.scheduledDays ?? vars.days);
      const totalPaise = Number(result?.totalExtraPaise ?? vars.paise * vars.days);
      Toast.show({
        type: 'success',
        text1: `Extra milk attached! (${vars.quantity})`,
        text2: scheduledDays > 1
          ? `Scheduled ${vars.slot} for ${scheduledDays} day${scheduledDays > 1 ? 's' : ''} (+₹${(totalPaise / 100).toFixed(0)}). Cash due updated.`
          : `Added to today (+₹${(totalPaise / 100).toFixed(0)}). Cash due updated.`,
      });
    },
    onError: (error) => Toast.show({ type: 'error', text1: 'Could not add extra milk', text2: errorMessage(error) }),
  });

  const openStop = (stop: DeliveryRunStop) => {
    setShowFullStop(false);
    setSelectedStopId(stop.id);
  };

  // Rupees still owed on this stop today: the day's due minus whatever the
  // rider (or store) already collected against it.
  const stopOutstandingPaise = (stop: DeliveryRunStop) =>
    Math.max(0, (stop.cashDuePaise || 0) - (stop.subscriptionDelivery?.cashCollectedPaise || 0));

  const openPartPayment = (stop: DeliveryRunStop) => {
    setPaymentAmount(stopOutstandingPaise(stop) > 0 ? String(stopOutstandingPaise(stop) / 100) : '');
    setPaymentNote('');
    setPaymentOpen(true);
  };

  const openNavigation = (stop: DeliveryRunStop) => {
    const snapshot = stop.subscriptionDelivery.subscription.addressSnapshot || {};
    const latitude = typeof snapshot.latitude === 'number' ? snapshot.latitude : undefined;
    const longitude = typeof snapshot.longitude === 'number' ? snapshot.longitude : undefined;
    const destination = latitude != null && longitude != null ? `${latitude},${longitude}` : encodeURIComponent(addressFrom(stop));
    void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${destination}`).catch(() => Toast.show({ type: 'error', text1: 'Maps unavailable' }));
  };

  if (runQuery.isLoading) return <View style={styles.loadingScreen}><ActivityIndicator size="large" color="#0F766E" /><Text style={styles.loadingText}>Loading route…</Text></View>;
  if (runQuery.isError || !run) return <View style={styles.loadingScreen}><CircleAlert size={42} color="#B42318" /><Text style={styles.loadingTitle}>Route unavailable</Text><Text style={styles.loadingText}>{runQuery.error ? errorMessage(runQuery.error) : 'This route could not be loaded.'}</Text><TouchableOpacity style={styles.retryButton} onPress={() => void runQuery.refetch()}><RefreshCw size={18} color="#FFFFFF" /><Text style={styles.retryButtonText}>Retry</Text></TouchableOpacity></View>;

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#0F766E" />
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={runQuery.isRefetching} onRefresh={() => void refresh()} tintColor="#FFFFFF" />}>
        <View style={styles.hero}>
          <View style={styles.headerRow}><TouchableOpacity accessibilityLabel="Back to runs" style={styles.backButton} onPress={() => navigation.goBack()}><ArrowLeft size={22} color="#FFFFFF" /></TouchableOpacity><View style={styles.headerCopy}><Text style={styles.heroEyebrow}>ROUTE {run.routeCode}</Text><Text style={styles.heroTitle}>{run.store.name}</Text></View><View style={styles.routeIcon}><Route size={26} color="#0F766E" /></View></View>
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
        {run.status === 'READY_FOR_PICKUP' && run.storeHandoffConfirmedAt ? <View style={styles.pickupReceiptCard}><View style={styles.pickupReceiptHeader}><Package size={20} color="#0F766E" /><View style={styles.noticeCopy}><Text style={styles.pickupReceiptTitle}>Confirm your independent receipt</Text><Text style={styles.pickupReceiptText}>Count exactly {run.expectedBagCount || run.totalStopCount} bags before accepting this run.</Text></View></View>{run.crateCode ? <TextInput style={styles.input} value={pickupCrateCode} onChangeText={setPickupCrateCode} placeholder="Enter or scan route crate code" placeholderTextColor="#94A3B8" autoCapitalize="characters" /> : null}<TouchableOpacity style={styles.stickyPrimary} disabled={pickupMutation.isPending || Boolean(run.crateCode && !pickupCrateCode.trim())} onPress={() => pickupMutation.mutate()}><ShieldCheck size={20} color="#FFFFFF" /><Text style={styles.stickyPrimaryText}>{pickupMutation.isPending ? 'Verifying receipt…' : `Confirm ${run.expectedBagCount || run.totalStopCount} bags received`}</Text></TouchableOpacity></View> : null}
        {run.status === 'IN_PROGRESS' && currentStop ? <TouchableOpacity style={styles.nextStopCard} onPress={() => openStop(currentStop)}><View style={styles.nextStopIcon}><MapPin size={24} color="#FFFFFF" /></View><View style={styles.nextStopCopy}><Text style={styles.nextStopEyebrow}>NEXT STOP · {currentStop.sequenceNumber}</Text><Text style={styles.nextStopName}>{currentStop.deliveryJob.order.customer?.name || 'Customer'}</Text><Text style={styles.nextStopAddress} numberOfLines={1}>{addressFrom(currentStop)}</Text></View><View style={styles.nextStopQuick}><Text style={styles.nextStopQuickText}>{proofDescriptor(currentStop).quickLabel}</Text><ChevronRight size={18} color="#0F766E" /></View></TouchableOpacity> : null}

        {mapDestination ? (
          <View style={styles.mapSection}>
            <RiderRouteMap
              destination={mapDestination}
              destinationLabel={mapDestinationLabel}
              riderLocation={riderLocation}
              stops={mapStops}
              progressDone={completed}
              progressTotal={total}
            />
          </View>
        ) : null}

        {upcomingStops.length ? (
          <View style={styles.upcomingSection}>
            <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Upcoming stops</Text><Text style={styles.sectionHint}>{upcomingStops.length} to deliver</Text></View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.upcomingRail}>
              {upcomingStops.map((stop, index) => {
                const isCurrent = currentStop?.id === stop.id;
                const point = stopCoordinates(stop);
                return (
                  <TouchableOpacity key={stop.id} activeOpacity={0.85} style={[styles.upcomingCard, isCurrent && styles.upcomingCardCurrent]} onPress={() => openStop(stop)}>
                    <View style={styles.upcomingTopRow}>
                      <View style={[styles.upcomingSeq, isCurrent && styles.upcomingSeqCurrent]}><Text style={[styles.upcomingSeqText, isCurrent && styles.upcomingSeqTextCurrent]}>{stop.sequenceNumber}</Text></View>
                      {isCurrent ? <Text style={styles.upcomingNow}>NOW</Text> : <Text style={styles.upcomingOrder}>#{index + 1}</Text>}
                    </View>
                    <Text style={styles.upcomingName} numberOfLines={1}>{stop.deliveryJob.order.customer?.name || 'Customer'}</Text>
                    <Text style={styles.upcomingAddress} numberOfLines={1}>{planLabel(stop)}</Text>
                    <Text style={styles.upcomingAddress} numberOfLines={2}>{addressFrom(stop)}</Text>
                    {duplicateCustomerKeys.has(customerKey(stop)) ? <Text style={styles.upcomingMultiSub}>2 subscriptions</Text> : null}
                    <View style={styles.upcomingFooter}>
                      <StatusChip value={stop.status} />
                      {point ? <MapPin size={14} color="#0F766E" /> : <Text style={styles.upcomingNoPin}>No pin</Text>}
                    </View>
                    <View style={styles.upcomingActions}>
                      <TouchableOpacity accessibilityLabel={`Deliver stop ${stop.sequenceNumber} now`} style={styles.upcomingDeliver} onPress={() => { pendingQuickDeliverRef.current = stop.id; openStop(stop); }}><CheckCircle2 size={13} color="#FFFFFF" /><Text style={styles.upcomingDeliverText}>Deliver</Text></TouchableOpacity>
                      <TouchableOpacity accessibilityLabel={`Skip stop ${stop.sequenceNumber}`} style={styles.upcomingSkip} onPress={() => { setSkipReason('Customer requested skip'); setSkipOpen(true); openStop(stop); }}><Text style={styles.upcomingSkipText}>Skip</Text></TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Ordered stops</Text><Text style={styles.sectionHint}>No bulk completion</Text></View>
        {run.stops.map((stop) => <StopCard key={stop.id} stop={stop} isCurrent={currentStop?.id === stop.id} duplicateCustomer={duplicateCustomerKeys.has(customerKey(stop))} onOpen={() => openStop(stop)} onNavigate={() => openNavigation(stop)} onMove={(direction) => reorderMutation.mutate({ stop, direction })} onDeliverNow={() => { pendingQuickDeliverRef.current = stop.id; openStop(stop); }} onSkip={() => { setSkipReason('Customer requested skip'); setSkipOpen(true); openStop(stop); }} />)}

        {run.status === 'IN_PROGRESS' ? <TouchableOpacity style={styles.finishButton} disabled={runMutation.isPending} onPress={() => Alert.alert('Finish this route?', 'The server will block completion while any delivery, retry, or return requirement remains unresolved.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Check and finish', onPress: () => runMutation.mutate('finish') }])}><CheckCircle2 size={20} color="#FFFFFF" /><Text style={styles.finishButtonText}>Finish route after all stops</Text></TouchableOpacity> : null}

        {run.status === 'AWAITING_SETTLEMENT' ? <View style={styles.cashCard}><View style={styles.cashTitleRow}><View style={styles.cashIcon}><Banknote size={23} color="#A15C00" /></View><View style={styles.cashCopy}><Text style={styles.cashTitle}>Return cash to store</Text><Text style={styles.cashText}>Individual COD ledgers stay intact. The store independently verifies the physical batch.</Text></View></View><View style={styles.cashTotals}><Text style={styles.cashTotalLabel}>Rider holding</Text><Text style={styles.cashTotalValue}>{money(cashQuery.data?.riderHoldingPaise || 0)}</Text></View><TouchableOpacity style={styles.cashButton} disabled={batchMutation.isPending || !cashQuery.data?.riderHoldingPaise} onPress={() => batchMutation.mutate()}><Text style={styles.cashButtonText}>{batchMutation.isPending ? 'Creating batch…' : 'Create deposit batch'}</Text><ChevronRight size={19} color="#FFFFFF" /></TouchableOpacity></View> : null}
      </ScrollView>

      <Modal visible={Boolean(selectedStop)} transparent animationType="slide" onRequestClose={() => setSelectedStopId(null)}>
        <View style={[styles.modalBackdrop, styles.modalBackdropFull]}><View style={[styles.bottomSheet, styles.bottomSheetFull]}>
          {selectedStop ? <>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}><View><Text style={styles.sheetEyebrow}>STOP {selectedStop.sequenceNumber} · {run.completedStopCount} OF {total} DONE</Text><Text style={styles.sheetTitle}>{selectedStop.deliveryJob.order.customer?.name || 'Customer delivery'}</Text><View style={styles.sheetPlanRow}><Text style={styles.sheetPlanText} numberOfLines={1}>{planLabel(selectedStop)}</Text>{duplicateCustomerKeys.has(customerKey(selectedStop)) ? <Text style={styles.multiSubBadge}>2 subscriptions</Text> : null}</View></View><TouchableOpacity accessibilityLabel="Close stop details" style={styles.closeButton} onPress={() => setSelectedStopId(null)}><X size={21} color="#475569" /></TouchableOpacity></View>
            <ScrollView contentContainerStyle={styles.sheetScroll} keyboardShouldPersistTaps="handled">
              {stopPoint ? (
                <View style={styles.sheetMap}>
                  <RiderRouteMap
                    destination={stopPoint}
                    destinationLabel={`${selectedStop.sequenceNumber}. ${selectedStop.deliveryJob.order.customer?.name || 'Customer'}`}
                    riderLocation={riderLocation}
                    stops={mapStops}
                    progressDone={completed}
                    progressTotal={total}
                    expanded
                  />
                </View>
              ) : null}
              <View style={styles.sheetActionsRow}>
                {selectedStop.deliveryJob.order.customer?.phone ? <TouchableOpacity accessibilityLabel="Call customer" style={styles.sheetChip} onPress={() => void Linking.openURL(`tel:${selectedStop.deliveryJob.order.customer.phone}`)}><Phone size={16} color="#0F766E" /><Text style={styles.sheetChipText}>Call</Text></TouchableOpacity> : null}
                <TouchableOpacity accessibilityLabel="Navigate to customer" style={styles.sheetChip} onPress={() => openNavigation(selectedStop)}><Navigation size={16} color="#0F766E" /><Text style={styles.sheetChipText}>Navigate</Text></TouchableOpacity>
                {!showFullStop ? <TouchableOpacity accessibilityLabel="Show full stop details" style={styles.sheetChipGhost} onPress={() => setShowFullStop(true)}><Text style={styles.sheetChipGhostText}>More details</Text></TouchableOpacity> : null}
              </View>
              <View style={selectedStop.cashDuePaise > 0 ? styles.cashDueBanner : styles.fundedBanner}><Banknote size={21} color={selectedStop.cashDuePaise > 0 ? '#8A4B00' : '#0F766E'} /><View style={styles.bannerCopy}><Text style={selectedStop.cashDuePaise > 0 ? styles.cashDueTitle : styles.fundedTitle}>{selectedStop.cashDuePaise > 0 ? `${money(selectedStop.cashDuePaise)} due now` : 'Customer amount due: ₹0'}</Text><Text style={selectedStop.cashDuePaise > 0 ? styles.cashDueText : styles.fundedText}>{selectedStop.cashDuePaise > 0 ? ((selectedStop as any).proofMode === 'RIDER_PHOTO_GPS' || Boolean(selectedStop.subscriptionDelivery) ? 'Collect the exact cash amount and take delivery photo proof. No OTP needed.' : 'Collect the exact amount only after valid OTP.') : 'Subscription already funded. Do not collect cash.'}</Text></View></View>

              {selectedStop.cashDuePaise > 0 || Number(selectedStop.subscriptionDelivery?.cashCollectedPaise || 0) > 0 ? (() => {
                const outstanding = stopOutstandingPaise(selectedStop);
                const collected = Number(selectedStop.subscriptionDelivery?.cashCollectedPaise || 0);
                return (
                  <View style={styles.partialCard}>
                    <View style={styles.partialHead}>
                      <Banknote size={18} color={outstanding > 0 ? '#8A4B00' : '#0F766E'} />
                      <Text style={styles.partialTitle}>{outstanding > 0 ? `${money(outstanding)} still to collect` : 'This stop is fully collected'}</Text>
                    </View>
                    {collected > 0 ? <Text style={styles.partialText}>Already recorded today: {money(collected)}. The rider holds this cash until store settlement.</Text> : null}
                    {outstanding > 0 ? (
                      <>
                        <Text style={styles.partialText}>Customer can only pay part now? Record what you received. The rest stays on the customer ledger and the stop still completes.</Text>
                        <TouchableOpacity style={styles.partPayButton} onPress={() => openPartPayment(selectedStop)}>
                          <Plus size={17} color="#0F766E" />
                          <Text style={styles.partPayButtonText}>Record a part payment</Text>
                        </TouchableOpacity>
                      </>
                    ) : null}
                  </View>
                );
              })() : null}

              {showFullStop ? (
              <>
              <Text style={styles.sheetAddress}>{addressFrom(selectedStop)}</Text>

              {/* Extra Milk & Scheduling section for active subscription stops */}
              {Boolean(selectedStop.subscriptionDelivery) && !['DELIVERED', 'FAILED', 'CANCELLED', 'RETURNED'].includes(selectedStop.status) ? (
                <View style={styles.extraContainer}>
                  {(selectedStop.subscriptionDelivery as any).deferredReason?.match(/\[(EXTRA|ADD-ON):\s*([^\]|]+)(?:\|\d+)?(?:\|([A-Z]{2}))?\]/) ? (() => {
                    const marker = (selectedStop.subscriptionDelivery as any).deferredReason
                      .match(/\[(EXTRA|ADD-ON):\s*([^\]|]+)(?:\|\d+)?(?:\|([A-Z]{2}))?\]/) as RegExpMatchArray;
                    const [kind, qty, slot] = [marker[1], marker[2], marker[3]];
                    return (
                      <View style={styles.extraActiveBanner}>
                        <Package size={15} color="#704000" />
                        <Text style={styles.extraActiveText}>
                          {kind === 'ADD-ON' ? `Scheduled add-on: ${qty}${slot ? ` · ${slot}` : ''}` : `Extra attached: ${qty}`}
                        </Text>
                      </View>
                    );
                  })() : null}

                  {!extraMilkOpen ? (
                    <TouchableOpacity
                      style={styles.extraTriggerButton}
                      onPress={() => { extraKeyRef.current = nextExtraMilkNonce(); setExtraMilkOpen(true); }}
                    >
                      <Plus size={16} color="#0F766E" />
                      <Text style={styles.extraTriggerText}>+ Extra Milk / Schedule Further Orders</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.extraCard}>
                      <View style={styles.extraHeaderRow}>
                        <View style={styles.extraTitleRow}>
                          <Package size={17} color="#0F766E" />
                          <Text style={styles.extraCardTitle}>Extra Milk / Further Orders</Text>
                        </View>
                        <TouchableOpacity onPress={() => setExtraMilkOpen(false)} style={styles.extraCloseButton}>
                          <X size={17} color="#64748B" />
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.extraCardSubtitle}>
                        Add extra milk today or schedule for upcoming days like the store grid does.
                      </Text>

                      {/* Today-only vs coming-days */}
                      <Text style={styles.extraLabel}>When</Text>
                      <View style={styles.chipRow}>
                        <TouchableOpacity
                          style={[styles.dayChip, extraWhen === 'today' && styles.dayChipActive]}
                          onPress={() => setExtraDays(1)}
                        >
                          <Text style={[styles.dayChipText, extraWhen === 'today' && styles.dayChipTextActive]}>
                            Today only
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.dayChip, extraWhen === 'next' && styles.dayChipActive]}
                          onPress={() => setExtraDays(extraDays > 1 ? extraDays : 3)}
                        >
                          <Text style={[styles.dayChipText, extraWhen === 'next' && styles.dayChipTextActive]}>
                            Coming days
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {/* Quantity Preset Chips */}
                      <Text style={styles.extraLabel}>Select Quantity</Text>
                      <View style={styles.chipRow}>
                        {EXTRA_PRESETS.map((p) => (
                          <TouchableOpacity
                            key={p.label}
                            style={[styles.presetChip, extraPreset === p.label && styles.presetChipActive]}
                            onPress={() => {
                              setExtraPreset(p.label);
                              setExtraQty(p.qty);
                              setExtraPriceRupees(p.price);
                            }}
                          >
                            <Text style={[styles.presetChipText, extraPreset === p.label && styles.presetChipTextActive]}>
                              {p.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      {/* Custom Quantity & Rate inputs */}
                      <View style={styles.extraInputRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.extraLabel}>Rate / Day (₹)</Text>
                          <TextInput
                            style={[styles.input, styles.extraInput]}
                            keyboardType="numeric"
                            value={extraPriceRupees}
                            onChangeText={setExtraPriceRupees}
                            placeholder="80"
                            placeholderTextColor="#94A3B8"
                          />
                        </View>
                        <View style={{ flex: 1, marginLeft: 8 }}>
                          <Text style={styles.extraLabel}>Label</Text>
                          <TextInput
                            style={[styles.input, styles.extraInput]}
                            value={extraQty}
                            onChangeText={setExtraQty}
                            placeholder="+1L"
                            placeholderTextColor="#94A3B8"
                          />
                        </View>
                      </View>

                      {/* Scheduling Duration */}
                      {extraWhen === 'next' ? (
                        <>
                          <Text style={styles.extraLabel}>Schedule for Days</Text>
                          <View style={styles.chipRow}>
                            {SCHEDULE_DAYS.filter((opt) => opt.days > 1).map((opt) => (
                              <TouchableOpacity
                                key={opt.days}
                                style={[styles.dayChip, extraDays === opt.days && styles.dayChipActive]}
                                onPress={() => setExtraDays(opt.days)}
                              >
                                <CalendarDays size={12} color={extraDays === opt.days ? '#FFFFFF' : '#0F766E'} />
                                <Text style={[styles.dayChipText, extraDays === opt.days && styles.dayChipTextActive]}>
                                  {opt.label}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>

                          {/* Which delivery the add-on rides with */}
                          <Text style={styles.extraLabel}>Add-on slot</Text>
                          <View style={styles.chipRow}>
                            {(['AM', 'PM'] as const).map((slot) => (
                              <TouchableOpacity
                                key={slot}
                                style={[styles.dayChip, extraSlot === slot && styles.dayChipActive]}
                                onPress={() => setExtraSlot(slot)}
                              >
                                <Text style={[styles.dayChipText, extraSlot === slot && styles.dayChipTextActive]}>
                                  {slot === 'AM' ? 'Morning (AM)' : 'Evening (PM)'}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </>
                      ) : null}

                      {/* Optional Note */}
                      <Text style={styles.extraLabel}>Note (optional)</Text>
                      <TextInput
                        style={[styles.input, styles.extraNoteInput]}
                        value={extraNote}
                        onChangeText={setExtraNote}
                        placeholder="Customer requested extra milk at delivery…"
                        placeholderTextColor="#94A3B8"
                      />

                      {/* Summary Banner */}
                      <View style={styles.extraSummary}>
                        <Text style={styles.extraSummaryText}>
                          Adding <Text style={{ fontWeight: '700' }}>{extraQty}</Text> at ₹{extraPriceRupees || '0'}/day
                          {extraWhen === 'next'
                            ? ` ${extraSlot} for ${extraDays} days (Total: ₹${(Number(extraPriceRupees || 0) * extraDays).toFixed(0)})`
                            : ' for today'}
                        </Text>
                        <Text style={styles.extraSummaryNote}>
                          {extraWhen === 'next'
                            ? `Stored as [ADD-ON: ${extraQty}|${Math.round(Number(extraPriceRupees || 0) * 100)}|${extraSlot}]. Cash due increases across the scheduled days.`
                            : `Stored as [EXTRA: ${extraQty}|${Math.round(Number(extraPriceRupees || 0) * 100)}]. Today's COD cash collection increases.`}
                        </Text>
                      </View>

                      {/* Submit button */}
                      <TouchableOpacity
                        style={styles.extraSubmitBtn}
                        disabled={extraMilkMutation.isPending || !Number(extraPriceRupees)}
                        onPress={() => {
                          const paise = Math.round(Number(extraPriceRupees || 0) * 100);
                          extraMilkMutation.mutate({
                            stop: selectedStop,
                            quantity: extraQty.trim() || '+1L',
                            paise: paise > 0 ? paise : 8000,
                            days: extraDays,
                            slot: extraSlot,
                            note: extraNote.trim() || undefined,
                            idempotencyKey: `${selectedStop.id}:${extraKeyRef.current}`,
                          });
                        }}
                      >
                        {extraMilkMutation.isPending ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Plus size={18} color="#FFFFFF" />
                        )}
                        <Text style={styles.extraSubmitText}>
                          {extraMilkMutation.isPending
                            ? 'Attaching extra milk…'
                            : extraWhen === 'next'
                              ? `Attach ${extraQty} · ${extraSlot} ×${extraDays}d`
                              : `Attach ${extraQty} (+₹${extraPriceRupees || '0'} today)`}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ) : null}
              </>
              ) : null}

              {selectedStop.status !== 'ARRIVED' && !['DELIVERED', 'FAILED', 'CANCELLED', 'RETURNED'].includes(selectedStop.status) ? (
                <View>
                  {showFullStop ? <Text style={styles.fundedText}>The server requires an arrival record before delivery. “Mark delivered” reads GPS arrival, then reveals the proof step.</Text> : null}
                  <TouchableOpacity style={styles.sheetPrimary} disabled={arriveMutation.isPending} onPress={() => arriveMutation.mutate(selectedStop)}><MapPin size={20} color="#FFFFFF" /><Text style={styles.sheetPrimaryText}>{arriveMutation.isPending ? 'Reading GPS…' : 'I have arrived'}</Text></TouchableOpacity>
                  <TouchableOpacity accessibilityLabel={`Deliver stop ${selectedStop.sequenceNumber} now`} style={styles.sheetSecondary} disabled={arriveMutation.isPending} onPress={() => arriveMutation.mutate(selectedStop)}><CheckCircle2 size={20} color="#0F766E" /><Text style={styles.sheetSecondaryText}>Mark delivered (arrive + proof)</Text></TouchableOpacity>
                </View>
              ) : null}
              {selectedStop.status === 'ARRIVED' ? <>
                {((selectedStop as any).proofMode === 'RIDER_PHOTO_GPS') ? (
                  <>
                    <Text style={styles.inputLabel}>Delivery Photo Proof</Text>
                    <TouchableOpacity
                      style={styles.otpButton}
                      disabled={evidenceMutation.isPending}
                      onPress={() => evidenceMutation.mutate({ stop: selectedStop, photoGpsOnly: true })}
                    >
                      <Camera size={19} color="#0F766E" />
                      <Text style={styles.otpButtonText}>
                        {trustedEvidenceId ? `Photo captured · ${trustedEvidenceName || 'ready'}` : evidenceMutation.isPending ? 'Uploading photo…' : 'Take delivery photo'}
                      </Text>
                    </TouchableOpacity>
                    <Text style={styles.fundedText}>Photo proof &amp; GPS coordinates protect rider and customer delivery.</Text>
                  </>
                ) : (
                  <>
                    {!(selectedStop.subscriptionDelivery.subscription.deliveryMethod === 'TRUSTED_DROP' && selectedStop.cashDuePaise === 0) ? <TouchableOpacity style={styles.otpButton} disabled={otpMutation.isPending} onPress={() => otpMutation.mutate(selectedStop)}><KeyRound size={19} color="#0F766E" /><Text style={styles.otpButtonText}>{otpMutation.isPending ? 'Sending OTP…' : 'Send / resend OTP'}</Text></TouchableOpacity> : null}
                    {selectedStop.subscriptionDelivery.subscription.deliveryMethod === 'TRUSTED_DROP' && selectedStop.cashDuePaise === 0 ? <><Text style={styles.inputLabel}>One-time Trusted Drop QR</Text><TouchableOpacity style={styles.otpButton} disabled={scanTrustedDropMutation.isPending} onPress={() => scanTrustedDropMutation.mutate()}><KeyRound size={19} color="#0F766E" /><Text style={styles.otpButtonText}>{dropToken ? 'QR scanned · scan again' : scanTrustedDropMutation.isPending ? 'Opening scanner…' : 'Scan customer QR'}</Text></TouchableOpacity><Text style={styles.inputLabel}>Fresh drop photo</Text><TouchableOpacity style={styles.otpButton} disabled={!dropToken || evidenceMutation.isPending} onPress={() => evidenceMutation.mutate({ stop: selectedStop, photoGpsOnly: false })}><Camera size={19} color="#0F766E" /><Text style={styles.otpButtonText}>{trustedEvidenceId ? `Photo secured · ${trustedEvidenceName || 'evidence ready'}` : evidenceMutation.isPending ? 'Uploading secure photo…' : 'Take delivery photo'}</Text></TouchableOpacity><Text style={styles.fundedText}>The QR secret is never saved for offline replay. If connectivity changes before completion, rescan the current QR.</Text></> : <><Text style={styles.inputLabel}>Six-digit OTP</Text><TextInput style={[styles.input, styles.otpInput]} value={otpCode} onChangeText={(value) => setOtpCode(value.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" maxLength={6} placeholder="000000" placeholderTextColor="#94A3B8" /></>}
                  </>
                )}
                <Text style={styles.inputLabel}>Delivery note (optional)</Text><TextInput style={[styles.input, styles.noteInput]} multiline value={deliveryNote} onChangeText={setDeliveryNote} placeholder="Quantity confirmed, drop location, recipient…" placeholderTextColor="#94A3B8" />
                <TouchableOpacity style={styles.sheetPrimary} disabled={completeMutation.isPending} onPress={() => completeMutation.mutate(selectedStop)}><CheckCircle2 size={20} color="#FFFFFF" /><Text style={styles.sheetPrimaryText}>{completeMutation.isPending ? 'Verifying delivery…' : 'Verify and complete this stop'}</Text></TouchableOpacity>
                <TouchableOpacity style={styles.failButton} onPress={() => setFailureOpen(true)}><CircleAlert size={19} color="#B42318" /><Text style={styles.failButtonText}>Report failure or request retry</Text></TouchableOpacity>
                <TouchableOpacity style={styles.skipButton} onPress={() => { setSkipReason('Customer requested skip'); setSkipOpen(true); }}><ArrowDown size={19} color="#B45309" /><Text style={styles.skipButtonText}>Skip this stop (customer asked)</Text></TouchableOpacity>
              </> : null}
              {selectedStop.status === 'DELIVERED' ? <View style={styles.deliveredState}><CheckCircle2 size={34} color="#0F766E" /><Text style={styles.deliveredTitle}>Delivery verified</Text><Text style={styles.deliveredText}>Marked delivered by mistake? You can reopen it and the server will reverse the delivery count and cash.</Text>{selectedStop.subscriptionDelivery?.cashCollectedPaise ? <Text style={styles.deliveredCash}>Cash recorded today: {money(Number(selectedStop.subscriptionDelivery.cashCollectedPaise))}</Text> : null}<TouchableOpacity accessibilityLabel="Undo delivery" style={styles.undoButton} disabled={undoMutation.isPending} onPress={() => Alert.alert('Reopen this stop?', 'The delivery count, cash totals and order status for this stop will be reversed. Only do this if the stop was closed by mistake.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Reopen stop', style: 'destructive', onPress: () => undoMutation.mutate(selectedStop) }])}>{undoMutation.isPending ? <ActivityIndicator size="small" color="#B45309" /> : <RefreshCw size={17} color="#B45309" />}<Text style={styles.undoButtonText}>{undoMutation.isPending ? 'Reopening…' : 'Reopen this stop (undo delivery)'}</Text></TouchableOpacity></View> : null}
              {['CANCELLED', 'FAILED'].includes(selectedStop.status) ? <View style={styles.deliveredState}><Text style={styles.deliveredTitle}>{selectedStop.status === 'CANCELLED' ? 'Stop skipped' : 'Stop failed'}</Text><Text style={styles.deliveredText}>{selectedStop.failureReason || 'This stop was closed with an exception.'}</Text><TouchableOpacity accessibilityLabel="Undo skip" style={styles.undoButton} disabled={undoMutation.isPending} onPress={() => Alert.alert('Reopen this stop?', 'The skip/failure counter and the delivery status will be reversed so you can retry it.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Reopen stop', style: 'destructive', onPress: () => undoMutation.mutate(selectedStop) }])}>{undoMutation.isPending ? <ActivityIndicator size="small" color="#B45309" /> : <RefreshCw size={17} color="#B45309" />}<Text style={styles.undoButtonText}>{undoMutation.isPending ? 'Reopening…' : 'Reopen this stop'}</Text></TouchableOpacity></View> : null}
            </ScrollView>
          </> : null}
        </View></View>
      </Modal>

      <Modal visible={failureOpen && Boolean(selectedStop)} transparent animationType="slide" onRequestClose={() => setFailureOpen(false)}>
        <View style={styles.modalBackdrop}><View style={styles.bottomSheet}><View style={styles.sheetHandle} /><View style={styles.sheetHeader}><View><Text style={styles.sheetEyebrow}>DELIVERY EXCEPTION</Text><Text style={styles.sheetTitle}>What prevented delivery?</Text></View><TouchableOpacity style={styles.closeButton} onPress={() => setFailureOpen(false)}><X size={21} color="#475569" /></TouchableOpacity></View><ScrollView contentContainerStyle={styles.sheetScroll}>
          <View style={styles.reasonGrid}>{FAILURE_REASONS.map((reason) => <TouchableOpacity key={reason.value} style={[styles.reasonChip, failureReason === reason.value && styles.reasonChipActive]} onPress={() => setFailureReason(reason.value)}><Text style={[styles.reasonChipText, failureReason === reason.value && styles.reasonChipTextActive]}>{reason.label}</Text></TouchableOpacity>)}</View>
          <Text style={styles.inputLabel}>Operational note</Text><TextInput style={[styles.input, styles.noteInput]} value={failureNote} onChangeText={setFailureNote} multiline placeholder="What happened and what should the next operator know?" placeholderTextColor="#94A3B8" />
          <View style={styles.retryRow}><View style={styles.retryCopy}><Text style={styles.retryTitle}>Retry this stop</Text><Text style={styles.retryText}>Keep it unresolved so the run cannot close accidentally.</Text></View><Switch value={retryRequested} onValueChange={setRetryRequested} trackColor={{ false: '#CBD5E1', true: '#8EDDC0' }} thumbColor={retryRequested ? '#0F766E' : '#FFFFFF'} /></View>
          <TouchableOpacity style={styles.failureSubmit} disabled={failMutation.isPending || !selectedStop} onPress={() => selectedStop && failMutation.mutate(selectedStop)}><CircleAlert size={20} color="#FFFFFF" /><Text style={styles.failureSubmitText}>{failMutation.isPending ? 'Recording…' : retryRequested ? 'Record and keep for retry' : 'Record delivery failure'}</Text></TouchableOpacity>
        </ScrollView></View></View>
      </Modal>

      <Modal visible={skipOpen && Boolean(selectedStop)} transparent animationType="slide" onRequestClose={() => setSkipOpen(false)}>
        <View style={styles.modalBackdrop}><View style={styles.bottomSheet}><View style={styles.sheetHandle} /><View style={styles.sheetHeader}><View><Text style={styles.sheetEyebrow}>SKIP STOP</Text><Text style={styles.sheetTitle}>{selectedStop ? `Stop ${selectedStop.sequenceNumber} · ${selectedStop.deliveryJob.order.customer?.name || 'Customer'}` : 'Skip stop'}</Text></View><TouchableOpacity style={styles.closeButton} onPress={() => setSkipOpen(false)}><X size={21} color="#475569" /></TouchableOpacity></View><ScrollView contentContainerStyle={styles.sheetScroll}>
          <Text style={styles.fundedText}>Skip is for a stop that should not be delivered today — the customer asked to skip, or the stop is not on the route. It marks the stop and its subscription-day delivery as skipped and records the reason for the store and admin. It does not count as a failure.</Text>
          <Text style={styles.inputLabel}>Reason</Text>
          <View style={styles.reasonGrid}>{SKIP_REASONS.map((reason) => <TouchableOpacity key={reason} style={[styles.reasonChip, skipReason === reason && styles.reasonChipActive]} onPress={() => setSkipReason(reason)}><Text style={[styles.reasonChipText, skipReason === reason && styles.reasonChipTextActive]}>{reason}</Text></TouchableOpacity>)}</View>
          <TextInput style={[styles.input, styles.noteInput]} value={skipReason} onChangeText={setSkipReason} multiline placeholder="Why is this stop being skipped?" placeholderTextColor="#94A3B8" />
          <TouchableOpacity style={styles.skipSubmit} disabled={skipMutation.isPending || !selectedStop} onPress={() => selectedStop && skipMutation.mutate(selectedStop)}><ArrowDown size={20} color="#FFFFFF" /><Text style={styles.skipSubmitText}>{skipMutation.isPending ? 'Skipping…' : 'Skip this stop'}</Text></TouchableOpacity>
        </ScrollView></View></View>
      </Modal>

      <Modal visible={paymentOpen && Boolean(selectedStop)} transparent animationType="slide" onRequestClose={() => setPaymentOpen(false)}>
        <View style={styles.modalBackdrop}><View style={styles.bottomSheet}><View style={styles.sheetHandle} /><View style={styles.sheetHeader}><View><Text style={styles.sheetEyebrow}>PART PAYMENT</Text><Text style={styles.sheetTitle}>{selectedStop ? `Stop ${selectedStop.sequenceNumber} · ${selectedStop.deliveryJob.order.customer?.name || 'Customer'}` : 'Record payment'}</Text></View><TouchableOpacity style={styles.closeButton} onPress={() => setPaymentOpen(false)}><X size={21} color="#475569" /></TouchableOpacity></View><ScrollView contentContainerStyle={styles.sheetScroll} keyboardShouldPersistTaps="handled">
          {selectedStop ? (() => {
            const outstanding = stopOutstandingPaise(selectedStop);
            const enteredPaise = Math.round(Number(paymentAmount) * 100);
            const valid = Number.isFinite(enteredPaise) && enteredPaise > 0 && enteredPaise <= outstanding;
            const over = Number.isFinite(enteredPaise) && enteredPaise > outstanding;
            return (
              <>
                <View style={styles.expectedCashBox}><Text style={styles.expectedCashLabel}>Still to collect on this stop</Text><Text style={styles.expectedCashValue}>{money(outstanding)}</Text></View>
                <Text style={styles.inputLabel}>Amount received from customer (₹)</Text>
                <TextInput style={[styles.input, styles.cashInput]} keyboardType="decimal-pad" value={paymentAmount} onChangeText={(value) => setPaymentAmount(value.replace(/[^0-9.]/g, ''))} placeholder="0.00" placeholderTextColor="#94A3B8" />
                <View style={styles.paymentQuickRow}>
                  {[0.25, 0.5, 1].map((fraction) => {
                    const value = Math.round(outstanding * fraction);
                    if (value <= 0) return null;
                    const label = fraction === 1 ? 'Full' : fraction === 0.5 ? 'Half' : 'Quarter';
                    return <TouchableOpacity key={fraction} style={styles.paymentQuickChip} onPress={() => setPaymentAmount(String(value / 100))}><Text style={styles.paymentQuickChipText}>{label} · {money(value)}</Text></TouchableOpacity>;
                  })}
                </View>
                {over ? <Text style={styles.paymentError}>Amount cannot exceed the outstanding {money(outstanding)}.</Text> : null}
                <Text style={styles.inputLabel}>Note (optional)</Text>
                <TextInput style={[styles.input, styles.noteInput]} value={paymentNote} onChangeText={setPaymentNote} multiline placeholder="Customer will pay the rest on the next delivery" placeholderTextColor="#94A3B8" />
                <Text style={styles.cashDisclaimer}>The rest stays on the customer ledger. The stop still completes and the store reconciles the balance later.</Text>
                <TouchableOpacity style={styles.sheetPrimary} disabled={paymentMutation.isPending || !valid} onPress={() => paymentMutation.mutate({ stop: selectedStop, amountPaise: enteredPaise, note: paymentNote.trim() || undefined })}><Banknote size={20} color="#FFFFFF" /><Text style={styles.sheetPrimaryText}>{paymentMutation.isPending ? 'Recording…' : `Record ${valid ? money(enteredPaise) : 'payment'}`}</Text></TouchableOpacity>
              </>
            );
          })() : null}
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
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: '#F3F7F5', gap: 12 }, loadingTitle: { color: '#17211D', fontSize: 19, fontWeight: '600' }, loadingText: { color: '#64748B', fontSize: 13, lineHeight: 19, textAlign: 'center' }, retryButton: { minHeight: 48, borderRadius: 15, backgroundColor: '#0F766E', paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 8 }, retryButtonText: { color: '#FFFFFF', fontWeight: '600' },
  hero: { backgroundColor: '#0F766E', paddingHorizontal: 18, paddingTop: 22, paddingBottom: 21, borderBottomLeftRadius: 30, borderBottomRightRadius: 30 }, headerRow: { flexDirection: 'row', alignItems: 'center' }, backButton: { width: 44, height: 44, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.13)', alignItems: 'center', justifyContent: 'center' }, headerCopy: { flex: 1, marginLeft: 12 }, heroEyebrow: { color: '#BAF3DD', fontSize: 10, letterSpacing: 1.2, fontWeight: '600' }, heroTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '600', marginTop: 2 }, routeIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#ECFFF7', alignItems: 'center', justifyContent: 'center' }, storeAddressRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 14 }, storeAddressText: { flex: 1, color: '#D7F8EA', fontSize: 12, lineHeight: 18 }, progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 }, progressTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' }, progressPercent: { color: '#BAF3DD', fontSize: 13, fontWeight: '600' }, progressTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden', marginTop: 8 }, progressFill: { height: 8, borderRadius: 4, backgroundColor: '#6EE7B7' }, routeStats: { flexDirection: 'row', marginTop: 16, paddingVertical: 12, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.11)' }, routeStat: { flex: 1, alignItems: 'center' }, routeStatValue: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' }, routeStatLabel: { color: '#CFF7E6', fontSize: 10, marginTop: 2 }, routeStatDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.22)' },
  stickyPrimary: { minHeight: 54, margin: 16, marginBottom: 0, borderRadius: 17, backgroundColor: '#0F766E', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, stickyPrimaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' }, offlinePendingCard: { margin: 16, marginBottom: 0, borderRadius: 18, backgroundColor: '#FFF5DE', borderWidth: 1, borderColor: '#F0D9A7', padding: 16, flexDirection: 'row', gap: 12 }, noticeCard: { margin: 16, marginBottom: 0, borderRadius: 18, backgroundColor: '#FFF5DE', borderWidth: 1, borderColor: '#F0D9A7', padding: 16, flexDirection: 'row', gap: 12 }, noticeCopy: { flex: 1 }, noticeTitle: { color: '#704000', fontSize: 14, fontWeight: '600' }, noticeText: { color: '#8A5A14', fontSize: 12, lineHeight: 18, marginTop: 2 },
  nextStopCard: { margin: 16, marginBottom: 0, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#B8DDCE', padding: 16, flexDirection: 'row', alignItems: 'center', shadowColor: '#0F2A20', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 4 }, nextStopIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#0F766E', alignItems: 'center', justifyContent: 'center' }, nextStopCopy: { flex: 1, marginHorizontal: 12 }, nextStopEyebrow: { color: '#0F766E', fontSize: 10, fontWeight: '600', letterSpacing: 1 }, nextStopName: { color: '#17211D', fontSize: 16, fontWeight: '600', marginTop: 2 }, nextStopAddress: { color: '#64748B', fontSize: 11, marginTop: 2 },
  sectionHeader: { marginTop: 23, marginBottom: 11, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sectionTitle: { color: '#17211D', fontSize: 19, fontWeight: '600' }, sectionHint: { color: '#0F766E', fontSize: 10, fontWeight: '600', backgroundColor: '#E2F5EC', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  stopCard: { marginHorizontal: 16, marginBottom: 12, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#E1EAE6' }, stopCardCurrent: { borderColor: '#60C69E', borderWidth: 2 }, stopHeader: { flexDirection: 'row', alignItems: 'flex-start' }, sequenceCircle: { width: 37, height: 37, borderRadius: 19, backgroundColor: '#EEF3F1', alignItems: 'center', justifyContent: 'center' }, sequenceCircleCurrent: { backgroundColor: '#0F766E' }, sequenceText: { color: '#475569', fontSize: 14, fontWeight: '600' }, sequenceTextCurrent: { color: '#FFFFFF' }, stopHeadingCopy: { flex: 1, marginHorizontal: 10 }, customerName: { color: '#17211D', fontSize: 15, fontWeight: '600' }, addressText: { color: '#64748B', fontSize: 11, lineHeight: 16, marginTop: 2 }, statusChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, maxWidth: 105 }, statusChipText: { fontSize: 9, fontWeight: '600', textAlign: 'center' }, statusComplete: { backgroundColor: '#E5F7EE' }, statusCompleteText: { color: '#0F766E' }, statusDanger: { backgroundColor: '#FDECEC' }, statusDangerText: { color: '#B42318' }, statusWarning: { backgroundColor: '#FFF1D6' }, statusWarningText: { color: '#8A4B00' }, statusNeutral: { backgroundColor: '#EEF2F6' }, statusNeutralText: { color: '#475569' }, itemsBox: { marginTop: 12, borderRadius: 13, backgroundColor: '#F8FAF9', padding: 10, gap: 6 }, itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, itemText: { color: '#475569', fontSize: 12, fontWeight: '600' }, proofRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 11 }, proofText: { flex: 1, color: '#475569', fontSize: 11, fontWeight: '500' }, failureNote: { marginTop: 10, borderRadius: 12, backgroundColor: '#FEF1F0', padding: 9, flexDirection: 'row', gap: 8 }, failureNoteText: { flex: 1, color: '#9F2D23', fontSize: 11 }, stopActions: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 8 }, secondaryButton: { minHeight: 42, borderRadius: 13, borderWidth: 1, borderColor: '#B8DDCE', paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 4 }, secondaryButtonText: { color: '#0F766E', fontSize: 11, fontWeight: '600' }, reorderButtons: { flexDirection: 'row', gap: 4 }, iconButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F1F5F3', alignItems: 'center', justifyContent: 'center' }, primaryButtonSmall: { marginLeft: 'auto', minHeight: 42, borderRadius: 13, backgroundColor: '#0F766E', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 4 }, primaryButtonSmallText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' }, planRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }, planText: { color: '#0F766E', fontSize: 11, fontWeight: '600', flexShrink: 1 }, multiSubBadge: { color: '#8A4B00', backgroundColor: '#FFF1D6', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, fontSize: 9, fontWeight: '700', overflow: 'hidden' },
  finishButton: { minHeight: 54, marginHorizontal: 16, marginTop: 6, borderRadius: 17, backgroundColor: '#243C33', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, finishButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' }, cashCard: { margin: 16, borderRadius: 22, backgroundColor: '#FFF8E9', borderWidth: 1, borderColor: '#EDD8A8', padding: 17 }, cashTitleRow: { flexDirection: 'row', alignItems: 'center' }, cashIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: '#FFE9B6', alignItems: 'center', justifyContent: 'center' }, cashCopy: { flex: 1, marginLeft: 11 }, cashTitle: { color: '#704000', fontSize: 16, fontWeight: '600' }, cashText: { color: '#8A5A14', fontSize: 11, lineHeight: 16, marginTop: 2 }, cashTotals: { marginTop: 15, borderRadius: 14, backgroundColor: '#FFFFFF', padding: 12, flexDirection: 'row', justifyContent: 'space-between' }, cashTotalLabel: { color: '#64748B', fontSize: 12, fontWeight: '500' }, cashTotalValue: { color: '#704000', fontSize: 18, fontWeight: '600' }, cashButton: { minHeight: 50, marginTop: 12, borderRadius: 15, backgroundColor: '#A15C00', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, cashButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.46)', justifyContent: 'flex-end' }, bottomSheet: { maxHeight: '91%', backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 9, paddingBottom: 24 }, modalBackdropFull: { backgroundColor: '#FFFFFF' }, bottomSheetFull: { flex: 1, maxHeight: '100%', borderTopLeftRadius: 0, borderTopRightRadius: 0 }, sheetHandle: { width: 44, height: 5, borderRadius: 3, backgroundColor: '#D1D9D5', alignSelf: 'center' }, sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingTop: 14, paddingBottom: 11, borderBottomWidth: 1, borderBottomColor: '#EDF1EF' }, sheetEyebrow: { color: '#0F766E', fontSize: 10, fontWeight: '600', letterSpacing: 1.1 }, sheetTitle: { color: '#17211D', fontSize: 20, fontWeight: '600', marginTop: 2 }, sheetPlanRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }, sheetPlanText: { color: '#0F766E', fontSize: 12, fontWeight: '600', flexShrink: 1 }, closeButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#F1F5F3', alignItems: 'center', justifyContent: 'center' }, sheetScroll: { padding: 18, paddingBottom: 34 }, sheetAddress: { color: '#475569', fontSize: 13, lineHeight: 19 }, contactRow: { marginTop: 10, minHeight: 43, alignSelf: 'flex-start', borderRadius: 13, backgroundColor: '#E7F7EF', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }, contactText: { color: '#0F766E', fontSize: 12, fontWeight: '600' }, cashDueBanner: { marginTop: 14, borderRadius: 16, backgroundColor: '#FFF2D9', borderWidth: 1, borderColor: '#EDD39D', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }, fundedBanner: { marginTop: 14, borderRadius: 16, backgroundColor: '#E6F8EF', borderWidth: 1, borderColor: '#B9E5D1', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }, bannerCopy: { flex: 1 }, cashDueTitle: { color: '#704000', fontSize: 14, fontWeight: '600' }, cashDueText: { color: '#8A5A14', fontSize: 11, lineHeight: 16, marginTop: 2 }, fundedTitle: { color: '#075E45', fontSize: 14, fontWeight: '600' }, fundedText: { color: '#0F766E', fontSize: 11, lineHeight: 16, marginTop: 2 }, sheetPrimary: { minHeight: 54, marginTop: 15, borderRadius: 16, backgroundColor: '#0F766E', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, sheetPrimaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' }, otpButton: { minHeight: 48, marginTop: 14, borderRadius: 15, borderWidth: 1, borderColor: '#9ED6BF', backgroundColor: '#EFFBF5', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, otpButtonText: { color: '#0F766E', fontSize: 13, fontWeight: '600' }, inputLabel: { color: '#334155', fontSize: 12, fontWeight: '600', marginTop: 14, marginBottom: 8 }, input: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: '#D5DEDA', backgroundColor: '#FAFCFB', paddingHorizontal: 14, color: '#17211D', fontSize: 14 }, otpInput: { fontSize: 22, fontWeight: '600', letterSpacing: 7, textAlign: 'center' }, noteInput: { minHeight: 86, paddingTop: 12, textAlignVertical: 'top' }, failButton: { minHeight: 50, marginTop: 10, borderRadius: 15, borderWidth: 1, borderColor: '#F2BBB7', backgroundColor: '#FFF7F6', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, failButtonText: { color: '#B42318', fontSize: 13, fontWeight: '600' }, deliveredState: { alignItems: 'center', paddingVertical: 35, gap: 8 }, deliveredTitle: { color: '#0F766E', fontSize: 18, fontWeight: '600' }, deliveredText: { color: '#64748B', fontSize: 12, textAlign: 'center' },
  reasonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, reasonChip: { minHeight: 42, borderRadius: 13, borderWidth: 1, borderColor: '#D7DFDB', paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center' }, reasonChipActive: { borderColor: '#B42318', backgroundColor: '#FFF0EF' }, reasonChipText: { color: '#475569', fontSize: 11, fontWeight: '600' }, reasonChipTextActive: { color: '#B42318' }, retryRow: { marginTop: 16, borderRadius: 16, backgroundColor: '#F7FAF8', padding: 12, flexDirection: 'row', alignItems: 'center' }, retryCopy: { flex: 1, paddingRight: 12 }, retryTitle: { color: '#17211D', fontSize: 14, fontWeight: '600' }, retryText: { color: '#64748B', fontSize: 11, lineHeight: 16, marginTop: 2 }, failureSubmit: { minHeight: 54, marginTop: 16, borderRadius: 16, backgroundColor: '#B42318', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, failureSubmitText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  expectedCashBox: { borderRadius: 18, backgroundColor: '#FFF5DE', padding: 17, alignItems: 'center' }, expectedCashLabel: { color: '#8A5A14', fontSize: 11, fontWeight: '600' }, expectedCashValue: { color: '#704000', fontSize: 29, fontWeight: '600', marginTop: 4 }, cashInput: { fontSize: 21, fontWeight: '600' }, cashDisclaimer: { color: '#64748B', fontSize: 11, lineHeight: 17, marginTop: 12 },
  pickupReceiptCard: { marginHorizontal: 16, marginBottom: 14, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#B8DDCE', padding: 16, gap: 12 },
  pickupReceiptHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  pickupReceiptTitle: { color: '#17211D', fontSize: 14, fontWeight: '600' },
  pickupReceiptText: { color: '#64748B', fontSize: 11, lineHeight: 17, marginTop: 4 },
  extraContainer: { marginTop: 12 },
  extraActiveBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFF7E6', borderRadius: 12, paddingHorizontal: 11, paddingVertical: 8, borderWidth: 1, borderColor: '#FEDF89', marginBottom: 8 },
  extraActiveText: { color: '#704000', fontSize: 11, fontWeight: '600' },
  extraTriggerButton: { minHeight: 44, borderRadius: 14, borderWidth: 1, borderColor: '#9ED6BF', backgroundColor: '#EFFBF5', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  extraTriggerText: { color: '#0F766E', fontSize: 13, fontWeight: '600' },
  extraCard: { borderRadius: 18, backgroundColor: '#F6FBF9', borderWidth: 1, borderColor: '#C8EADB', padding: 14 },
  extraHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  extraTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  extraCardTitle: { color: '#0F766E', fontSize: 15, fontWeight: '600' },
  extraCloseButton: { padding: 4 },
  extraCardSubtitle: { color: '#64748B', fontSize: 11, lineHeight: 16, marginTop: 4 },
  extraLabel: { color: '#334155', fontSize: 11, fontWeight: '600', marginTop: 10, marginBottom: 5 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  presetChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 11, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF' },
  presetChipActive: { borderColor: '#0F766E', backgroundColor: '#E6F8EF' },
  presetChipText: { color: '#475569', fontSize: 12, fontWeight: '600' },
  presetChipTextActive: { color: '#0F766E' },
  extraInputRow: { flexDirection: 'row', marginTop: 2 },
  extraInput: { minHeight: 42, paddingHorizontal: 10, fontSize: 13 },
  dayChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 11, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF' },
  dayChipActive: { borderColor: '#0F766E', backgroundColor: '#0F766E' },
  dayChipText: { color: '#0F766E', fontSize: 11, fontWeight: '600' },
  dayChipTextActive: { color: '#FFFFFF' },
  extraNoteInput: { minHeight: 44, paddingHorizontal: 10, fontSize: 12 },
  extraSummary: { marginTop: 11, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D5E6DF', padding: 10 },
  extraSummaryText: { color: '#17211D', fontSize: 12, fontWeight: '500' },
  extraSummaryNote: { color: '#0F766E', fontSize: 10, marginTop: 2, fontWeight: '500' },
  extraSubmitBtn: { minHeight: 46, marginTop: 12, borderRadius: 14, backgroundColor: '#0F766E', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  extraSubmitText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  mapSection: { marginHorizontal: 16, marginTop: 16 },
  upcomingSection: { marginTop: 4 },
  upcomingRail: { paddingHorizontal: 16, gap: 12, paddingBottom: 6 },
  upcomingCard: { width: 196, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1EAE6', padding: 13, shadowColor: '#0F2A20', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 3 },
  upcomingCardCurrent: { borderColor: '#0F766E', borderWidth: 2 },
  upcomingTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  upcomingSeq: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#EEF3F1', alignItems: 'center', justifyContent: 'center' },
  upcomingSeqCurrent: { backgroundColor: '#0F766E' },
  upcomingSeqText: { color: '#475569', fontSize: 13, fontWeight: '700' },
  upcomingSeqTextCurrent: { color: '#FFFFFF' },
  upcomingNow: { color: '#0F766E', fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
  upcomingOrder: { color: '#94A3B8', fontSize: 11, fontWeight: '600' },
  upcomingName: { color: '#17211D', fontSize: 14, fontWeight: '600', marginTop: 9 },
  upcomingAddress: { color: '#64748B', fontSize: 11, lineHeight: 16, marginTop: 3, minHeight: 32 }, upcomingMultiSub: { color: '#8A4B00', backgroundColor: '#FFF1D6', alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, fontSize: 9, fontWeight: '700', marginTop: 4, overflow: 'hidden' },
  upcomingFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  upcomingNoPin: { color: '#94A3B8', fontSize: 10, fontWeight: '500' },
  upcomingActions: { flexDirection: 'row', gap: 6, marginTop: 10 },
  upcomingDeliver: { flex: 1, minHeight: 30, borderRadius: 10, backgroundColor: '#0F766E', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  upcomingDeliverText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  upcomingSkip: { minHeight: 30, borderRadius: 10, borderWidth: 1, borderColor: '#F0CFA0', backgroundColor: '#FFF7E8', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  upcomingSkipText: { color: '#B45309', fontSize: 10, fontWeight: '700' },
  nextStopQuick: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  nextStopQuickText: { color: '#0F766E', fontSize: 12, fontWeight: '700' },
  quickActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  quickPrimary: { flex: 1, minHeight: 40, borderRadius: 13, backgroundColor: '#0F766E', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  quickPrimaryText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  quickGhost: { minHeight: 40, borderRadius: 13, borderWidth: 1, borderColor: '#F0CFA0', backgroundColor: '#FFF7E8', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 14 },
  quickGhostText: { color: '#B45309', fontSize: 12, fontWeight: '700' },
  sheetMap: { height: 260, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: '#D9E6E0', backgroundColor: '#E8F3EF' },
  sheetActionsRow: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  sheetChip: { minHeight: 40, borderRadius: 12, borderWidth: 1, borderColor: '#B8DDCE', backgroundColor: '#EFFBF5', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14 },
  sheetChipText: { color: '#0F766E', fontSize: 12, fontWeight: '600' },
  sheetChipGhost: { minHeight: 40, borderRadius: 12, borderWidth: 1, borderColor: '#D5DEDA', backgroundColor: '#FAFCFB', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  sheetChipGhostText: { color: '#475569', fontSize: 12, fontWeight: '600' },
  sheetSecondary: { minHeight: 50, marginTop: 10, borderRadius: 15, borderWidth: 1, borderColor: '#9ED6BF', backgroundColor: '#EFFBF5', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  sheetSecondaryText: { color: '#0F766E', fontSize: 13, fontWeight: '600' },
  skipButton: { minHeight: 50, marginTop: 10, borderRadius: 15, borderWidth: 1, borderColor: '#F0CFA0', backgroundColor: '#FFF7E8', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  skipButtonText: { color: '#B45309', fontSize: 13, fontWeight: '600' },
  skipSubmit: { minHeight: 50, marginTop: 14, borderRadius: 15, backgroundColor: '#B45309', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  skipSubmitText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  partialCard: { marginTop: 12, borderRadius: 15, backgroundColor: '#FFF9EE', borderWidth: 1, borderColor: '#EBD7B0', padding: 12 },
  partialHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  partialTitle: { color: '#8A4B00', fontSize: 13, fontWeight: '700' },
  partialText: { color: '#7A5A1E', fontSize: 11, lineHeight: 16, marginTop: 6 },
  partPayButton: { minHeight: 46, marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: '#9ED6BF', backgroundColor: '#EFFBF5', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  partPayButtonText: { color: '#0F766E', fontSize: 13, fontWeight: '600' },
  paymentQuickRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  paymentQuickChip: { flex: 1, minHeight: 40, borderRadius: 12, borderWidth: 1, borderColor: '#D5DEDA', backgroundColor: '#FAFCFB', alignItems: 'center', justifyContent: 'center' },
  paymentQuickChipText: { color: '#0F766E', fontSize: 11, fontWeight: '600' },
  paymentError: { color: '#B42318', fontSize: 12, fontWeight: '600', marginTop: 8 },
  deliveredCash: { color: '#704000', fontSize: 12, fontWeight: '600', marginTop: 4 },
  undoButton: { minHeight: 46, marginTop: 14, borderRadius: 14, borderWidth: 1, borderColor: '#F2C58F', backgroundColor: '#FFF6E9', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14 },
  undoButtonText: { color: '#B45309', fontSize: 13, fontWeight: '600' },
});
