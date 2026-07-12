import AsyncStorage from '@react-native-async-storage/async-storage';
import messaging from '@react-native-firebase/messaging';
import { useAuthStore } from '@aagam/mobile-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  Bike,
  CheckCircle2,
  Clock,
  MapPin,
  Navigation,
  Package,
  Phone,
  Power,
  RefreshCw,
  ShieldCheck,
  Store,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  PermissionsAndroid,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import { riderService } from '../../api/riderService';
import {
  RiderAssignmentOffer,
  RiderDeliveryJob,
  RiderJobAction,
  RiderWorkspace,
  deliveryStatusLabel,
  isOfferActionable,
  isTrackableDeliveryStatus,
  nextActionForStatus,
  offerSecondsRemaining,
} from '../../domain/riderWorkspace';
import { RiderTrackingManager, TrackingSnapshot } from '../../services/RiderTrackingManager';
import {
  setupBackgroundMessageHandler,
  startMobilePushLifecycle,
} from '../../utils/notifications';

setupBackgroundMessageHandler();

const WORKSPACE_KEY = ['rider', 'delivery-workspace'] as const;

function formatAddress(snapshot?: Record<string, any> | null) {
  if (!snapshot) return 'Delivery address unavailable';
  return [
    snapshot.line1,
    snapshot.line2,
    snapshot.landmark,
    snapshot.city,
    snapshot.pincode,
  ].filter(Boolean).join(', ');
}

function shortId(value?: string | null) {
  return value ? value.slice(-8).toUpperCase() : 'UNKNOWN';
}

function statusTone(status: string) {
  if (['DELIVERED', 'PICKUP_VERIFIED'].includes(status)) {
    return { backgroundColor: '#DCFCE7', color: '#166534' };
  }
  if (['DELIVERY_FAILED', 'CANCELLED', 'RETURNING_TO_STORE'].includes(status)) {
    return { backgroundColor: '#FEE2E2', color: '#991B1B' };
  }
  if (['RIDER_AT_STORE', 'RIDER_AT_CUSTOMER'].includes(status)) {
    return { backgroundColor: '#FEF3C7', color: '#92400E' };
  }
  return { backgroundColor: '#DBEAFE', color: '#1D4ED8' };
}

function StatusChip({ status }: { status: string }) {
  const tone = statusTone(status);
  return (
    <View style={[styles.statusChip, { backgroundColor: tone.backgroundColor }]}>
      <Text style={[styles.statusChipText, { color: tone.color }]}>
        {deliveryStatusLabel(status as any)}
      </Text>
    </View>
  );
}

function OfferCard({
  offer,
  now,
  busy,
  onAccept,
  onReject,
}: {
  offer: RiderAssignmentOffer;
  now: number;
  busy: boolean;
  onAccept: () => void;
  onReject: () => void;
}) {
  const order = offer.deliveryJob.order;
  const remaining = offerSecondsRemaining(offer.expiresAt, now);
  const actionable = isOfferActionable(offer, now);
  return (
    <View style={[styles.offerCard, !actionable && styles.expiredCard]}>
      <View style={styles.cardTopRow}>
        <View style={styles.cardTitleRow}>
          <Package size={18} color="#0F766E" />
          <Text style={styles.orderCode}>Order #{shortId(order.id)}</Text>
        </View>
        <View style={[styles.countdownBadge, !actionable && styles.expiredBadge]}>
          <Clock size={13} color={actionable ? '#92400E' : '#991B1B'} />
          <Text style={[styles.countdownText, !actionable && styles.expiredText]}>
            {remaining === null ? 'Open offer' : remaining > 0 ? `${remaining}s` : 'Expired'}
          </Text>
        </View>
      </View>

      <Text style={styles.offerStore}>{order.store?.name || 'AAGAM store'}</Text>
      <Text style={styles.offerAddress}>{order.store?.address || 'Pickup location available after acceptance'}</Text>
      <View style={styles.offerMetaRow}>
        <Text style={styles.offerMeta}>{order.items?.length || 0} item(s)</Text>
        <Text style={styles.offerAmount}>₹{Number(order.grandTotal || 0).toFixed(2)}</Text>
      </View>

      <View style={styles.offerActions}>
        <TouchableOpacity
          style={[styles.secondaryButton, (busy || !actionable) && styles.disabledButton]}
          disabled={busy || !actionable}
          onPress={onReject}
        >
          <XCircle size={17} color="#B91C1C" />
          <Text style={styles.rejectText}>Reject</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryButton, (busy || !actionable) && styles.disabledButton]}
          disabled={busy || !actionable}
          onPress={onAccept}
        >
          {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <CheckCircle2 size={17} color="#FFFFFF" />}
          <Text style={styles.primaryButtonText}>Accept offer</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function TrackingHealth({ snapshot }: { snapshot: TrackingSnapshot }) {
  const healthy = snapshot.active && !snapshot.error;
  return (
    <View style={[styles.trackingPanel, healthy ? styles.trackingHealthy : styles.trackingWarning]}>
      <View style={styles.trackingHeader}>
        {healthy ? <Wifi size={18} color="#047857" /> : <WifiOff size={18} color="#B45309" />}
        <Text style={[styles.trackingTitle, { color: healthy ? '#047857' : '#B45309' }]}>
          {snapshot.active ? 'Delivery tracking active' : 'Tracking inactive'}
        </Text>
      </View>
      <Text style={styles.trackingDetail}>
        {snapshot.lastSentAt
          ? `Last sent ${new Date(snapshot.lastSentAt).toLocaleTimeString('en-IN')}`
          : 'Waiting for the first accepted GPS update'}
      </Text>
      <Text style={styles.trackingDetail}>
        Offline queue: {snapshot.queuedCount} · Accuracy: {snapshot.lastAccuracy ? `${Math.round(snapshot.lastAccuracy)} m` : '—'}
      </Text>
      {snapshot.error ? <Text style={styles.trackingError}>{snapshot.error}</Text> : null}
    </View>
  );
}

function CurrentDelivery({
  job,
  transitionBusy,
  tracking,
  onTransition,
}: {
  job: RiderDeliveryJob;
  transitionBusy: boolean;
  tracking: TrackingSnapshot;
  onTransition: (action: RiderJobAction) => void;
}) {
  const order = job.order;
  const next = nextActionForStatus(job.status);
  const customerName = order.customer?.name || order.addressSnapshot?.recipientName || 'Customer';
  const customerPhone = order.customer?.phone || order.addressSnapshot?.phoneE164 || null;

  const openPoint = (latitude?: number | null, longitude?: number | null, label = 'Location') => {
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      Alert.alert('Location unavailable', `${label} coordinates are not available.`);
      return;
    }
    const destination = `${latitude},${longitude}`;
    Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`,
    ).catch(() => Alert.alert('Navigation unavailable', 'Could not open the maps application.'));
  };

  return (
    <View style={styles.deliveryCard}>
      <View style={styles.cardTopRow}>
        <View style={styles.cardTitleRow}>
          <Bike size={20} color="#0F766E" />
          <Text style={styles.orderCode}>Order #{shortId(order.id)}</Text>
        </View>
        <StatusChip status={job.status} />
      </View>

      <View style={styles.locationBlock}>
        <View style={styles.locationIcon}><Store size={19} color="#0F766E" /></View>
        <View style={styles.locationContent}>
          <Text style={styles.locationLabel}>PICKUP</Text>
          <Text style={styles.locationName}>{order.store?.name || 'AAGAM store'}</Text>
          <Text style={styles.locationAddress}>{order.store?.address || 'Store address unavailable'}</Text>
          <TouchableOpacity onPress={() => openPoint(order.store?.latitude, order.store?.longitude, 'Store')}>
            <Text style={styles.linkText}>Navigate to store →</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.locationBlock}>
        <View style={styles.locationIcon}><MapPin size={19} color="#0F766E" /></View>
        <View style={styles.locationContent}>
          <Text style={styles.locationLabel}>DELIVER TO</Text>
          <Text style={styles.locationName}>{customerName}</Text>
          <Text style={styles.locationAddress}>{formatAddress(order.addressSnapshot)}</Text>
          <View style={styles.inlineActions}>
            <TouchableOpacity onPress={() => openPoint(order.deliveryLat, order.deliveryLng, 'Customer')}>
              <View style={styles.inlineAction}><Navigation size={14} color="#0F766E" /><Text style={styles.inlineActionText}>Navigate</Text></View>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => customerPhone
                ? Linking.openURL(`tel:${customerPhone}`)
                : Alert.alert('Phone unavailable', 'Customer phone number is unavailable.')}
            >
              <View style={styles.inlineAction}><Phone size={14} color="#0F766E" /><Text style={styles.inlineActionText}>Call</Text></View>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {order.items?.length ? (
        <View style={styles.itemsBox}>
          <Text style={styles.itemsTitle}>PICKING LIST</Text>
          {order.items.map((item, index) => (
            <Text key={item.id || index} style={styles.itemLine}>
              • {item.product?.name || 'Item'} × {item.quantity || 0}
            </Text>
          ))}
        </View>
      ) : null}

      {job.status === 'RIDER_AT_STORE' ? (
        <View style={styles.waitingPanel}>
          <Clock size={18} color="#92400E" />
          <View style={styles.waitingTextWrap}>
            <Text style={styles.waitingTitle}>Waiting for pickup verification</Text>
            <Text style={styles.waitingText}>The store must verify the handoff before you can leave for the customer.</Text>
          </View>
        </View>
      ) : null}

      <TrackingHealth snapshot={tracking} />

      {next ? (
        <TouchableOpacity
          style={[styles.jobActionButton, transitionBusy && styles.disabledButton]}
          disabled={transitionBusy}
          onPress={() => onTransition(next.action)}
        >
          {transitionBusy ? <ActivityIndicator color="#FFFFFF" /> : <ArrowRight size={20} color="#FFFFFF" />}
          <Text style={styles.jobActionText}>{next.label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export const RiderDashboard = () => {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [now, setNow] = useState(Date.now());
  const [locating, setLocating] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [trackingSnapshot, setTrackingSnapshot] = useState<TrackingSnapshot>({
    active: false,
    orderId: null,
    deliveryJobId: null,
    status: null,
    lastSentAt: null,
    lastAccuracy: null,
    queuedCount: 0,
    error: null,
  });

  const trackingManagerRef = useRef<RiderTrackingManager | null>(null);
  if (!trackingManagerRef.current) {
    trackingManagerRef.current = new RiderTrackingManager({
      location: Geolocation as any,
      storage: AsyncStorage,
      sendPing: riderService.sendLocationPing,
      startSession: riderService.startTracking,
      stopSession: riderService.stopTracking,
    });
  }
  const trackingManager = trackingManagerRef.current;

  const workspaceQuery = useQuery<RiderWorkspace>({
    queryKey: WORKSPACE_KEY,
    queryFn: riderService.getWorkspace,
    refetchInterval: isOnline ? 8_000 : 20_000,
  });
  const workspace = workspaceQuery.data;
  const activeJob = workspace?.activeJob || null;
  const offers = useMemo(
    () => (workspace?.pendingOffers || []).filter((offer) => isOfferActionable(offer, now)),
    [workspace?.pendingOffers, now],
  );

  useEffect(() => {
    if (workspace?.rider?.status) setIsOnline(workspace.rider.status !== 'OFFLINE');
  }, [workspace?.rider?.status]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => trackingManager.subscribe(setTrackingSnapshot), [trackingManager]);

  useEffect(() => {
    let unsubscribeTokenRefresh: (() => void) | undefined;
    let unsubscribeForeground: (() => void) | undefined;
    let unsubscribeOpened: (() => void) | undefined;
    let alive = true;

    startMobilePushLifecycle('AAGAM Partners').then((unsubscribe) => {
      if (alive) unsubscribeTokenRefresh = unsubscribe;
      else unsubscribe();
    }).catch(() => undefined);

    const refreshWorkspace = () => {
      void queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY });
    };
    try {
      unsubscribeForeground = messaging().onMessage(async () => refreshWorkspace());
      unsubscribeOpened = messaging().onNotificationOpenedApp(() => refreshWorkspace());
      messaging().getInitialNotification().then((message) => {
        if (message) refreshWorkspace();
      }).catch(() => undefined);
    } catch (_e) {
      // Firebase not configured in dev builds without google-services.json
    }

    return () => {
      alive = false;
      unsubscribeTokenRefresh?.();
      unsubscribeForeground?.();
      unsubscribeOpened?.();
    };
  }, [queryClient]);

  useEffect(() => {
    if (activeJob && isOnline && isTrackableDeliveryStatus(activeJob.status)) {
      trackingManager.start({
        orderId: activeJob.orderId,
        deliveryJobId: activeJob.id,
        status: activeJob.status,
      }).catch((error) => {
        Alert.alert('Tracking unavailable', error?.response?.data?.message || error?.message || 'Could not start rider tracking.');
      });
      return;
    }

    if (trackingManager.getSnapshot().active) {
      void trackingManager.stop(activeJob ? 'STATUS_NOT_TRACKABLE' : 'NO_ACTIVE_DELIVERY');
    }
  }, [activeJob?.id, activeJob?.status, isOnline, trackingManager]);

  const acceptMutation = useMutation({
    mutationFn: riderService.acceptOffer,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY });
      Alert.alert('Offer accepted', 'This delivery is now assigned to you.');
    },
    onError: (error: any) => Alert.alert('Could not accept offer', error?.response?.data?.message || error?.message || 'The offer may have expired.'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ assignmentId, reason }: { assignmentId: string; reason?: string }) =>
      riderService.rejectOffer(assignmentId, reason),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY }),
    onError: (error: any) => Alert.alert('Could not reject offer', error?.response?.data?.message || error?.message || 'Please refresh and try again.'),
  });

  const transitionMutation = useMutation({
    mutationFn: ({ jobId, action }: { jobId: string; action: RiderJobAction }) =>
      riderService.transitionJob(jobId, action, action === 'DELIVERED' ? { proofType: 'RIDER_CONFIRMATION' } : undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY });
    },
    onError: (error: any) => Alert.alert('Delivery update failed', error?.response?.data?.message || error?.message || 'The delivery state changed. Refresh and try again.'),
  });

  const requestLocationPermission = async () => {
    if (Platform.OS !== 'android') return true;
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: 'Allow rider location',
        message: 'AAGAM Partners uses your location only while you are online and fulfilling a delivery.',
        buttonPositive: 'Allow',
        buttonNegative: 'Not now',
      },
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  };

  const goOnline = async () => {
    setLocating(true);
    try {
      const permitted = await requestLocationPermission();
      if (!permitted) {
        Alert.alert('Location permission required', 'Allow precise location before going online.');
        return;
      }
      Geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          await riderService.updateMyStatus('ONLINE', { latitude, longitude });
          setIsOnline(true);
          await queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY });
          setLocating(false);
        },
        (error) => {
          setLocating(false);
          Alert.alert('GPS unavailable', error.message || 'Enable location services and try again.');
        },
        { enableHighAccuracy: true, timeout: 15_000, maximumAge: 5_000 },
      );
    } catch (error: any) {
      setLocating(false);
      Alert.alert('Could not go online', error?.response?.data?.message || error?.message || 'Please try again.');
    }
  };

  const goOffline = async () => {
    if (activeJob) {
      Alert.alert('Active delivery', 'Complete or return the current delivery before going offline.');
      return;
    }
    try {
      await riderService.updateMyStatus('OFFLINE');
      setIsOnline(false);
      await trackingManager.stop('RIDER_OFFLINE');
      await queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY });
    } catch (error: any) {
      Alert.alert('Could not go offline', error?.response?.data?.message || error?.message || 'Please try again.');
    }
  };

  const confirmAccept = (offer: RiderAssignmentOffer) => {
    Alert.alert(
      'Accept delivery offer?',
      `Pickup from ${offer.deliveryJob.order.store?.name || 'AAGAM store'}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Accept', onPress: () => acceptMutation.mutate(offer.id) },
      ],
    );
  };

  const confirmReject = (offer: RiderAssignmentOffer) => {
    Alert.alert(
      'Reject delivery offer?',
      'The dispatcher can offer this job to another rider.',
      [
        { text: 'Keep offer', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: () => rejectMutation.mutate({ assignmentId: offer.id, reason: 'RIDER_DECLINED' }),
        },
      ],
    );
  };

  const confirmTransition = (action: RiderJobAction) => {
    if (!activeJob) return;
    const descriptor = nextActionForStatus(activeJob.status);
    if (!descriptor || descriptor.action !== action) return;
    Alert.alert(descriptor.label, descriptor.confirmation, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: () => transitionMutation.mutate({ jobId: activeJob.id, action }),
      },
    ]);
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>AAGAM PARTNERS</Text>
          <Text style={styles.heading}>{user?.name || 'Rider workspace'}</Text>
          <Text style={styles.subheading}>Addressed offers and one active delivery</Text>
        </View>
        <TouchableOpacity
          style={[styles.onlineToggle, isOnline ? styles.online : styles.offline]}
          disabled={locating}
          onPress={isOnline ? goOffline : goOnline}
        >
          {locating ? <ActivityIndicator color="#0F766E" /> : <Power size={18} color={isOnline ? '#047857' : '#64748B'} />}
          <Text style={[styles.onlineToggleText, { color: isOnline ? '#047857' : '#64748B' }]}>
            {isOnline ? 'ONLINE' : 'OFFLINE'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={workspaceQuery.isRefetching}
            onRefresh={() => workspaceQuery.refetch()}
            tintColor="#0F766E"
          />
        }
      >
        {workspaceQuery.isLoading ? (
          <View style={styles.centerState}><ActivityIndicator size="large" color="#0F766E" /><Text style={styles.centerText}>Loading rider workspace…</Text></View>
        ) : workspaceQuery.error ? (
          <View style={styles.errorPanel}>
            <AlertTriangle size={26} color="#B91C1C" />
            <Text style={styles.errorTitle}>Workspace unavailable</Text>
            <Text style={styles.errorText}>{(workspaceQuery.error as any)?.response?.data?.message || (workspaceQuery.error as Error)?.message || 'Could not load delivery work.'}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => workspaceQuery.refetch()}><RefreshCw size={16} color="#FFFFFF" /><Text style={styles.retryText}>Retry</Text></TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.summaryRow}>
              <View style={styles.summaryCard}><ShieldCheck size={20} color="#0F766E" /><Text style={styles.summaryValue}>{activeJob ? '1' : '0'}</Text><Text style={styles.summaryLabel}>Active delivery</Text></View>
              <View style={styles.summaryCard}><Clock size={20} color="#B45309" /><Text style={styles.summaryValue}>{offers.length}</Text><Text style={styles.summaryLabel}>Addressed offers</Text></View>
            </View>

            <View style={styles.sectionHeadingRow}>
              <View><Text style={styles.sectionHeading}>Current delivery</Text><Text style={styles.sectionCaption}>Only the job assigned to your rider profile</Text></View>
            </View>
            {activeJob ? (
              <CurrentDelivery
                job={activeJob}
                transitionBusy={transitionMutation.isPending}
                tracking={trackingSnapshot}
                onTransition={confirmTransition}
              />
            ) : (
              <View style={styles.emptyPanel}><Bike size={42} color="#CBD5E1" /><Text style={styles.emptyTitle}>No active delivery</Text><Text style={styles.emptyText}>Accept an addressed offer when you are ready.</Text></View>
            )}

            <View style={styles.sectionHeadingRow}>
              <View><Text style={styles.sectionHeading}>Addressed offers</Text><Text style={styles.sectionCaption}>Other riders cannot see or accept these offers</Text></View>
              <TouchableOpacity onPress={() => workspaceQuery.refetch()} style={styles.refreshButton}><RefreshCw size={16} color="#0F766E" /></TouchableOpacity>
            </View>
            {offers.length ? offers.map((offer) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                now={now}
                busy={acceptMutation.isPending || rejectMutation.isPending || Boolean(activeJob)}
                onAccept={() => confirmAccept(offer)}
                onReject={() => confirmReject(offer)}
              />
            )) : (
              <View style={styles.emptyPanel}><Clock size={38} color="#CBD5E1" /><Text style={styles.emptyTitle}>No open offers</Text><Text style={styles.emptyText}>New dispatcher offers will appear here and through push notifications.</Text></View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { backgroundColor: '#FFFFFF', paddingTop: 54, paddingHorizontal: 20, paddingBottom: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  eyebrow: { color: '#0F766E', fontSize: 10, fontWeight: '900', letterSpacing: 1.6 },
  heading: { marginTop: 3, color: '#0F172A', fontSize: 22, fontWeight: '900' },
  subheading: { marginTop: 3, color: '#64748B', fontSize: 12, fontWeight: '600' },
  onlineToggle: { minWidth: 104, height: 44, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  online: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
  offline: { backgroundColor: '#F1F5F9', borderColor: '#CBD5E1' },
  onlineToggleText: { fontSize: 11, fontWeight: '900' },
  scrollContent: { padding: 18, paddingBottom: 118 },
  centerState: { minHeight: 300, alignItems: 'center', justifyContent: 'center', gap: 14 },
  centerText: { color: '#64748B', fontWeight: '700' },
  errorPanel: { backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 1, borderRadius: 24, padding: 24, alignItems: 'center' },
  errorTitle: { marginTop: 10, color: '#991B1B', fontWeight: '900', fontSize: 18 },
  errorText: { marginTop: 6, color: '#B91C1C', textAlign: 'center', lineHeight: 20 },
  retryButton: { marginTop: 16, backgroundColor: '#B91C1C', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 7 },
  retryText: { color: '#FFFFFF', fontWeight: '900' },
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  summaryCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 22, padding: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  summaryValue: { marginTop: 10, color: '#0F172A', fontSize: 26, fontWeight: '900' },
  summaryLabel: { marginTop: 2, color: '#64748B', fontSize: 11, fontWeight: '700' },
  sectionHeadingRow: { marginTop: 8, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionHeading: { color: '#0F172A', fontSize: 18, fontWeight: '900' },
  sectionCaption: { marginTop: 3, color: '#64748B', fontSize: 11, fontWeight: '600' },
  refreshButton: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#CCFBF1' },
  offerCard: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: '#CCFBF1', shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 3 },
  expiredCard: { opacity: 0.62, borderColor: '#FECACA' },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  orderCode: { color: '#0F172A', fontSize: 15, fontWeight: '900' },
  countdownBadge: { backgroundColor: '#FEF3C7', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 4 },
  expiredBadge: { backgroundColor: '#FEE2E2' },
  countdownText: { color: '#92400E', fontSize: 11, fontWeight: '900' },
  expiredText: { color: '#991B1B' },
  offerStore: { marginTop: 15, color: '#0F172A', fontSize: 17, fontWeight: '900' },
  offerAddress: { marginTop: 4, color: '#64748B', fontSize: 12, lineHeight: 18 },
  offerMetaRow: { marginTop: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  offerMeta: { color: '#64748B', fontSize: 12, fontWeight: '700' },
  offerAmount: { color: '#0F766E', fontSize: 19, fontWeight: '900' },
  offerActions: { marginTop: 16, flexDirection: 'row', gap: 10 },
  secondaryButton: { flex: 1, minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  rejectText: { color: '#B91C1C', fontWeight: '900' },
  primaryButton: { flex: 1.35, minHeight: 46, borderRadius: 14, backgroundColor: '#0F766E', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '900' },
  disabledButton: { opacity: 0.48 },
  deliveryCard: { backgroundColor: '#FFFFFF', borderRadius: 26, padding: 19, marginBottom: 22, borderWidth: 1, borderColor: '#BAE6FD', shadowColor: '#0F172A', shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  statusChip: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6, maxWidth: 150 },
  statusChipText: { fontSize: 9, fontWeight: '900', textAlign: 'center' },
  locationBlock: { marginTop: 18, flexDirection: 'row', gap: 12 },
  locationIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#F0FDFA', alignItems: 'center', justifyContent: 'center' },
  locationContent: { flex: 1 },
  locationLabel: { color: '#94A3B8', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  locationName: { marginTop: 3, color: '#0F172A', fontSize: 15, fontWeight: '900' },
  locationAddress: { marginTop: 3, color: '#64748B', fontSize: 12, lineHeight: 18 },
  linkText: { marginTop: 6, color: '#0F766E', fontWeight: '900', fontSize: 12 },
  inlineActions: { marginTop: 8, flexDirection: 'row', gap: 8 },
  inlineAction: { borderRadius: 10, backgroundColor: '#CCFBF1', paddingHorizontal: 10, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 5 },
  inlineActionText: { color: '#0F766E', fontSize: 11, fontWeight: '900' },
  itemsBox: { marginTop: 18, borderRadius: 16, backgroundColor: '#F8FAFC', padding: 14 },
  itemsTitle: { color: '#64748B', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  itemLine: { marginTop: 6, color: '#334155', fontSize: 12, fontWeight: '700' },
  waitingPanel: { marginTop: 16, backgroundColor: '#FFFBEB', borderColor: '#FDE68A', borderWidth: 1, borderRadius: 16, padding: 13, flexDirection: 'row', gap: 10 },
  waitingTextWrap: { flex: 1 },
  waitingTitle: { color: '#92400E', fontWeight: '900', fontSize: 13 },
  waitingText: { marginTop: 3, color: '#A16207', fontSize: 11, lineHeight: 17 },
  trackingPanel: { marginTop: 16, borderRadius: 16, padding: 13, borderWidth: 1 },
  trackingHealthy: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
  trackingWarning: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  trackingHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  trackingTitle: { fontSize: 12, fontWeight: '900' },
  trackingDetail: { marginTop: 5, color: '#475569', fontSize: 10, fontWeight: '600' },
  trackingError: { marginTop: 7, color: '#B45309', fontSize: 10, fontWeight: '800' },
  jobActionButton: { marginTop: 18, minHeight: 50, borderRadius: 15, backgroundColor: '#0F172A', flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8 },
  jobActionText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  emptyPanel: { backgroundColor: '#FFFFFF', borderRadius: 22, borderWidth: 1, borderColor: '#E2E8F0', borderStyle: 'dashed', padding: 30, alignItems: 'center', marginBottom: 22 },
  emptyTitle: { marginTop: 10, color: '#0F172A', fontSize: 16, fontWeight: '900' },
  emptyText: { marginTop: 5, color: '#64748B', fontSize: 12, textAlign: 'center', lineHeight: 18 },
});
