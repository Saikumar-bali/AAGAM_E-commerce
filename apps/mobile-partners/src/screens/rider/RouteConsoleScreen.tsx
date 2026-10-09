import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import type { NavigationProp } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import {
  Banknote,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  MapPin,
  Navigation,
  Package,
  Phone,
  RefreshCw,
  Route as RouteIcon,
} from 'lucide-react-native';
import { subscriptionOperationsService } from '../../api/subscriptionOperationsService';
import type { DeliveryRunStop } from '../../api/subscriptionOperationsService';
import type { RiderTabParamList } from '../../navigation/partnerNavigationTypes';
import { RIDER_RUNS_QUERY_KEY } from './RiderRunsScreen';
import { RiderRouteMap } from '../../components/rider/RiderRouteMap';

const ACTIONABLE: DeliveryRunStop['status'][] = ['READY', 'PLANNED', 'ARRIVED', 'RETRY_PENDING'];
const ACTIVE_RUN_STATUSES = ['PICKED_UP', 'IN_PROGRESS', 'READY_FOR_PICKUP', 'AWAITING_SETTLEMENT'];

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

function addressFrom(stop?: DeliveryRunStop | null) {
  const snapshot = stop?.subscriptionDelivery?.subscription?.addressSnapshot || {};
  const fields = ['label', 'addressLine1', 'addressLine2', 'landmark', 'city', 'state', 'postalCode'];
  return fields.map((key) => snapshot[key]).filter((value): value is string => typeof value === 'string' && value.trim().length > 0).join(', ') || 'Customer delivery address';
}

function stopCoordinates(stop: DeliveryRunStop): Coordinates | null {
  const snapshot = stop.subscriptionDelivery?.subscription?.addressSnapshot || {};
  const latitude = typeof stop.deliveryLatitude === 'number' ? stop.deliveryLatitude : (typeof snapshot.latitude === 'number' ? snapshot.latitude : undefined);
  const longitude = typeof stop.deliveryLongitude === 'number' ? stop.deliveryLongitude : (typeof snapshot.longitude === 'number' ? snapshot.longitude : undefined);
  return latitude != null && longitude != null ? { latitude, longitude } : null;
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
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracyMetres: position.coords.accuracy }),
      (error) => reject(new Error(error?.message || 'Unable to read precise GPS.')),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 4_000 },
    );
  });
}

function statusChipTone(status: string) {
  if (status === 'IN_PROGRESS') return { text: '#075E45', bg: '#DFF7EC' };
  if (status === 'AWAITING_SETTLEMENT') return { text: '#8A4B00', bg: '#FFF2D9' };
  if (['RIDER_NEEDED', 'INTERRUPTED', 'RECOVERY_REQUIRED'].includes(status)) return { text: '#9A3412', bg: '#FFEDD5' };
  if (status === 'COMPLETED') return { text: '#276749', bg: '#E8F8EF' };
  if (status === 'PICKED_UP') return { text: '#155E75', bg: '#E0F2FE' };
  return { text: '#334155', bg: '#E2E8F0' };
}

/**
 * Single-page map Route Console: the subscriber-delivery run for today rendered
 * as one live map with the active stop, its action, and the route rail — the
 * mobile mirror of the web admin `/rider/console` experience.
 */
export const RouteConsoleScreen = ({ navigation }: { navigation: NavigationProp<RiderTabParamList> }) => {
  const queryClient = useQueryClient();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [riderLocation, setRiderLocation] = useState<Coordinates | null>(null);
  const locationWatch = useRef<number | null>(null);

  const runsQuery = useQuery({ queryKey: RIDER_RUNS_QUERY_KEY, queryFn: subscriptionOperationsService.getTodayRuns });
  const runs = runsQuery.data || [];

  const runId = selectedRunId
    || runs.find((candidate) => ACTIVE_RUN_STATUSES.includes(candidate.status))?.id
    || runs[0]?.id
    || null;

  const runQuery = useQuery({
    queryKey: ['rider', 'delivery-run', runId],
    queryFn: () => subscriptionOperationsService.getRun(runId as string),
    enabled: Boolean(runId),
  });
  const run = runQuery.data;

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

  const stops = useMemo(() => run?.stops || [], [run]);
  const actionable = useMemo(() => stops.filter((stop) => ACTIONABLE.includes(stop.status)), [stops]);
  const activeStop = useMemo(
    () => actionable.find((stop) => stop.id === selectedStopId) || actionable[0] || null,
    [actionable, selectedStopId],
  );
  const destination = useMemo(
    () => (activeStop ? stopCoordinates(activeStop) : null) || (run?.store?.latitude != null ? { latitude: run.store.latitude, longitude: run.store.longitude } : null),
    [activeStop, run],
  );
  const destinationLabel = activeStop
    ? `${activeStop.sequenceNumber}. ${activeStop.deliveryJob?.order?.customer?.name || 'Customer'}`
    : run?.store?.name || 'Route';

  const completed = Number(run?.completedStopCount || 0);
  const total = Number(run?.totalStopCount || stops.length || 0);
  const progress = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;

  const refresh = async () => {
    await Promise.all([runQuery.refetch(), runsQuery.refetch()]);
    await queryClient.invalidateQueries({ queryKey: RIDER_RUNS_QUERY_KEY });
  };

  const runMutation = useMutation({
    mutationFn: async () => {
      if (!run) throw new Error('No active run.');
      return subscriptionOperationsService.startRun(run.id, run.version);
    },
    onSuccess: async () => {
      Toast.show({ type: 'success', text1: 'Run started', text2: 'Complete each customer stop individually.' });
      await refresh();
    },
    onError: (error) => Toast.show({ type: 'error', text1: 'Could not start run', text2: errorMessage(error) }),
  });

  const arriveMutation = useMutation({
    mutationFn: async (stop: DeliveryRunStop) => {
      if (!run) throw new Error('No active run.');
      const point = await currentLocation();
      return subscriptionOperationsService.arriveAtStop(run.id, stop.id, { version: stop.version, ...point });
    },
    onSuccess: async () => {
      Toast.show({ type: 'success', text1: 'Arrival recorded', text2: 'Complete the stop with proof to finish.' });
      await refresh();
    },
    onError: (error) => Toast.show({ type: 'error', text1: 'Could not record arrival', text2: errorMessage(error) }),
  });

  const completeMutation = useMutation({
    mutationFn: async (stop: DeliveryRunStop) => {
      if (!run) throw new Error('No active run.');
      const point = await currentLocation();
      return subscriptionOperationsService.completeStop(run.id, stop.id, {
        version: stop.version,
        ...point,
        riderConfirmed: true,
        cashCollectedPaise: stop.cashDuePaise > 0 ? stop.cashDuePaise : undefined,
      });
    },
    onSuccess: async () => {
      Toast.show({ type: 'success', text1: 'Stop completed', text2: 'Delivery proof and funding entitlement were recorded.' });
      setSelectedStopId(null);
      await refresh();
    },
    onError: (error) => Toast.show({ type: 'error', text1: 'Delivery not completed', text2: errorMessage(error) }),
  });

  const openFullProof = () => {
    if (!run) return;
    navigation.navigate('RiderRunDetail', { runId: run.id });
  };

  const runTone = run ? statusChipTone(run.status) : statusChipTone('PLANNED');
  const busy = arriveMutation.isPending || completeMutation.isPending || runMutation.isPending;

  const heroAction = (() => {
    if (!run) return null;
    if (run.status === 'PICKED_UP') {
      return (
        <ConsoleButton tone="primary" disabled={busy} onPress={() => runMutation.mutate()}>
          <Navigation size={18} color="#FFFFFF" />
          <Text style={styles.buttonText}>{runMutation.isPending ? 'Starting…' : 'Start delivery run'}</Text>
        </ConsoleButton>
      );
    }
    if (!activeStop) {
      return <View style={styles.infoTile}><CheckCircle2 size={18} color="#0F766E" /><Text style={styles.infoText}>All stops done. Head back to the store.</Text></View>;
    }
    if (activeStop.status === 'ARRIVED') {
      const needsFullProof = activeStop.proofMode !== 'RIDER_PHOTO_GPS' && activeStop.subscriptionDelivery?.subscription?.deliveryMethod === 'TRUSTED_DROP';
      if (needsFullProof) {
        return (
          <ConsoleButton tone="primary" disabled={busy} onPress={() => openFullProof()}>
            <Package size={18} color="#FFFFFF" />
            <Text style={styles.buttonText}>Open secure proof</Text>
          </ConsoleButton>
        );
      }
      return (
        <ConsoleButton tone="coral" disabled={busy} onPress={() => completeMutation.mutate(activeStop)}>
          <CheckCircle2 size={18} color="#FFFFFF" />
          <Text style={styles.buttonText}>
            {completeMutation.isPending ? 'Completing…' : activeStop.cashDuePaise > 0 ? `Collect ${money(activeStop.cashDuePaise)} & complete` : 'Verify & complete stop'}
          </Text>
        </ConsoleButton>
      );
    }
    return (
      <ConsoleButton tone="primary" disabled={busy} onPress={() => arriveMutation.mutate(activeStop)}>
        <MapPin size={18} color="#FFFFFF" />
        <Text style={styles.buttonText}>{arriveMutation.isPending ? 'Recording…' : 'I have arrived'}</Text>
      </ConsoleButton>
    );
  })();

  if (runsQuery.isLoading || (runId && runQuery.isLoading)) {
    return <View style={styles.centered}><StatusBar barStyle="light-content" backgroundColor="#0F766E" /><ActivityIndicator size="large" color="#0F766E" /><Text style={styles.centeredText}>Loading route…</Text></View>;
  }
  if (!runId || runs.length === 0) {
    return (
      <View style={styles.centered}>
        <StatusBar barStyle="light-content" backgroundColor="#0F766E" />
        <RouteIcon size={44} color="#94A3B8" />
        <Text style={styles.errorTitle}>No route assigned today</Text>
        <Text style={styles.centeredText}>New subscriber runs appear here once dispatchers plan them.</Text>
        <TouchableOpacity style={styles.retry} onPress={() => void refresh()}><RefreshCw size={18} color="#FFFFFF" /><Text style={styles.retryText}>Refresh</Text></TouchableOpacity>
      </View>
    );
  }
  if (runQuery.isError || !run) {
    return (
      <View style={styles.centered}>
        <StatusBar barStyle="light-content" backgroundColor="#0F766E" />
        <CircleAlert size={44} color="#B42318" />
        <Text style={styles.errorTitle}>Route unavailable</Text>
        <Text style={styles.centeredText}>{runQuery.error ? errorMessage(runQuery.error) : 'This route could not be loaded.'}</Text>
        <TouchableOpacity style={styles.retry} onPress={() => void runQuery.refetch()}><RefreshCw size={18} color="#FFFFFF" /><Text style={styles.retryText}>Retry</Text></TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#0F766E" />
      <View style={styles.mapLayer}>
        <RiderRouteMap destination={destination ?? undefined} destinationLabel={destinationLabel} active riderLocation={riderLocation} expanded />
      </View>

      <View style={styles.overlayTop} pointerEvents="box-none">
        <View style={styles.headerCard}>
          <View style={styles.headerRow}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>ROUTE {run.routeCode}</Text>
              <Text style={styles.headerTitle} numberOfLines={1}>{run.store.name}</Text>
            </View>
            <View style={[styles.statusChip, { backgroundColor: runTone.bg }]}><Text style={[styles.statusChipText, { color: runTone.text }]}>{label(run.status)}</Text></View>
          </View>
          <View style={styles.progressRow}>
            <Text style={styles.progressText}>{completed} of {total} stops</Text>
            <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>
            <Text style={styles.progressPct}>{progress}%</Text>
          </View>
        </View>

        {runs.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.runPicker}>
            {runs.map((candidate) => (
              <TouchableOpacity
                key={candidate.id}
                onPress={() => { setSelectedRunId(candidate.id); setSelectedStopId(null); }}
                style={[styles.runPill, candidate.id === run.id && styles.runPillActive]}
              >
                <Text style={[styles.runPillText, candidate.id === run.id && styles.runPillTextActive]}>{candidate.routeCode} · {candidate.store?.name || 'Store'}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : null}
      </View>

      <View style={styles.sheet} pointerEvents="box-none">
        <View style={styles.sheetBody}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
            {stops.map((stop) => {
              const tone = stop.status === 'DELIVERED' ? styles.stopDone : ['FAILED', 'CANCELLED'].includes(stop.status) ? styles.stopFailed : stop.id === activeStop?.id ? styles.stopActive : styles.stopPending;
              return (
                <TouchableOpacity key={stop.id} onPress={() => setSelectedStopId(stop.id)} style={[styles.stopChip, tone]}>
                  <Text style={styles.stopChipSeq}>{stop.sequenceNumber}</Text>
                  <Text style={styles.stopChipName} numberOfLines={1}>{stop.deliveryJob?.order?.customer?.name || 'Customer'}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {activeStop ? (
            <View style={styles.stopCard}>
              <View style={styles.stopCardHead}>
                <View style={styles.stopIcon}><MapPin size={20} color="#FFFFFF" /></View>
                <View style={styles.stopCardCopy}>
                  <Text style={styles.stopEyebrow}>NEXT STOP · {activeStop.sequenceNumber}</Text>
                  <Text style={styles.stopName}>{activeStop.deliveryJob?.order?.customer?.name || 'Customer'}</Text>
                  <Text style={styles.stopAddress} numberOfLines={1}>{addressFrom(activeStop)}</Text>
                </View>
                {activeStop.deliveryJob?.order?.customer?.phone ? (
                  <TouchableOpacity style={styles.iconButton} onPress={() => void Linking.openURL(`tel:${activeStop.deliveryJob.order.customer.phone}`)}>
                    <Phone size={18} color="#0F766E" />
                  </TouchableOpacity>
                ) : null}
              </View>
              <View style={styles.stopMeta}>
                <View style={styles.metaRow}><Package size={15} color="#64748B" /><Text style={styles.metaText}>{activeStop.expectedParcelCount || activeStop.expectedItemCount || 1} parcel(s)</Text></View>
                {activeStop.cashDuePaise > 0 ? <View style={styles.metaRow}><Banknote size={15} color="#B45309" /><Text style={[styles.metaText, styles.cashText]}>Collect {money(activeStop.cashDuePaise)}</Text></View> : null}
              </View>
              {heroAction}
              {activeStop.proofMode === 'RIDER_PHOTO_GPS' ? (
                <TouchableOpacity style={styles.linkButton} onPress={() => openFullProof()}>
                  <Text style={styles.linkText}>Need photo or OTP proof? Open full stop</Text>
                  <ChevronRight size={16} color="#0F766E" />
                </TouchableOpacity>
              ) : null}
            </View>
          ) : (
            <View style={styles.infoTile}><CheckCircle2 size={18} color="#0F766E" /><Text style={styles.infoText}>Every stop in this route is closed.</Text></View>
          )}
        </View>
      </View>
    </View>
  );
};

const ConsoleButton = ({ tone, disabled, onPress, children }: { tone: 'primary' | 'coral'; disabled?: boolean; onPress: () => void; children: React.ReactNode }) => (
  <TouchableOpacity
    accessibilityRole="button"
    disabled={disabled}
    onPress={onPress}
    style={[styles.button, tone === 'coral' ? styles.buttonCoral : styles.buttonPrimary, disabled && styles.buttonDisabled]}
  >
    {children}
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B1E2D' },
  mapLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10, backgroundColor: '#F4F7FB' },
  centeredText: { color: '#64748B', fontSize: 13, textAlign: 'center', lineHeight: 19 },
  errorTitle: { color: '#0F172A', fontSize: 17, fontWeight: '700' },
  retry: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#0F766E', paddingHorizontal: 18, height: 44, borderRadius: 12 },
  retryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },

  overlayTop: { position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 44, paddingHorizontal: 12 },
  headerCard: { backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: 16, padding: 12, shadowColor: '#0F172A', shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  headerCopy: { flex: 1 },
  eyebrow: { color: '#0F766E', fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  headerTitle: { color: '#0F172A', fontSize: 16, fontWeight: '700', marginTop: 2 },
  statusChip: { paddingHorizontal: 10, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  statusChipText: { fontSize: 10, fontWeight: '700' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  progressText: { color: '#334155', fontSize: 11, fontWeight: '600' },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: '#E2E8F0', overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: '#0F766E' },
  progressPct: { color: '#0F766E', fontSize: 11, fontWeight: '700' },

  runPicker: { gap: 8, paddingVertical: 10, paddingRight: 12 },
  runPill: { paddingHorizontal: 12, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  runPillActive: { backgroundColor: '#0F766E', borderColor: '#0F766E' },
  runPillText: { color: '#334155', fontSize: 11, fontWeight: '600' },
  runPillTextActive: { color: '#FFFFFF' },

  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 12 },
  sheetBody: { backgroundColor: 'rgba(255,255,255,0.97)', borderRadius: 20, paddingVertical: 12, shadowColor: '#0F172A', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: -4 }, elevation: 10 },
  rail: { gap: 8, paddingHorizontal: 12, paddingBottom: 10 },
  stopChip: { width: 96, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' },
  stopPending: { backgroundColor: '#F8FAFC' },
  stopActive: { backgroundColor: '#E6F4EF', borderColor: '#0F766E' },
  stopDone: { backgroundColor: '#E8F8EF', borderColor: '#BBE7CE' },
  stopFailed: { backgroundColor: '#FDECEC', borderColor: '#F6C6C6' },
  stopChipSeq: { color: '#0F172A', fontSize: 13, fontWeight: '800' },
  stopChipName: { color: '#475569', fontSize: 10, marginTop: 2 },

  stopCard: { paddingHorizontal: 12, paddingTop: 4, gap: 10 },
  stopCardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stopIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#0F766E', alignItems: 'center', justifyContent: 'center' },
  stopCardCopy: { flex: 1 },
  stopEyebrow: { color: '#0F766E', fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  stopName: { color: '#0F172A', fontSize: 15, fontWeight: '700', marginTop: 1 },
  stopAddress: { color: '#64748B', fontSize: 11, marginTop: 1 },
  iconButton: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center' },
  stopMeta: { flexDirection: 'row', gap: 16 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { color: '#475569', fontSize: 11, fontWeight: '600' },
  cashText: { color: '#B45309' },

  button: { minHeight: 48, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonPrimary: { backgroundColor: '#0F766E' },
  buttonCoral: { backgroundColor: '#F97316' },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },

  infoTile: { marginHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E6F4EF', borderRadius: 12, padding: 12 },
  infoText: { color: '#0F766E', fontSize: 12, fontWeight: '600', flex: 1 },
  linkButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 4 },
  linkText: { color: '#0F766E', fontSize: 11, fontWeight: '600' },
});
