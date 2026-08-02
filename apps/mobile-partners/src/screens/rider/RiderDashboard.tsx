import AsyncStorage from '@react-native-async-storage/async-storage';
import messaging from '@react-native-firebase/messaging';
import { useAuthStore } from '@aagam/mobile-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Bike,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  MapPin,
  Medal,
  Navigation,
  Package,
  Phone,
  RefreshCw,
  Store,
  UserRound,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Toast from 'react-native-toast-message';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  PermissionsAndroid,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import { notificationService } from '../../api/notificationService';
import { riderService } from '../../api/riderService';
import { RiderDashboardHero } from '../../components/rider/RiderDashboardHero';
import { RiderRouteMap } from '../../components/rider/RiderRouteMap';
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
import {
  compareRiderMetric,
  formatActiveMinutes,
  summarizeRiderDay,
} from '../../domain/riderDashboardSummary';
import { RiderOnlineService } from '../../services/RiderOnlineService';
import { RiderTrackingManager, TrackingSnapshot } from '../../services/RiderTrackingManager';
import {
  setupBackgroundMessageHandler,
  startMobilePushLifecycle,
} from '../../utils/notifications';
import { PARTNER_NOTIFICATION_QUERY_KEY } from '../PartnerNotificationsScreen';

setupBackgroundMessageHandler();

const WORKSPACE_KEY = ['rider', 'delivery-workspace'] as const;
const EARNINGS_KEY = ['rider', 'earnings'] as const;
const DASHBOARD_HISTORY_KEY = ['rider', 'dashboard-history'] as const;
const INCENTIVE_TARGET = 5;
const INCENTIVE_REWARD = 200;

function beginningOfYesterday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - 1);
  return date.toISOString();
}

function formatAddress(snapshot?: Record<string, any> | null) {
  if (!snapshot) return 'Delivery address unavailable';
  return [snapshot.line1, snapshot.line2, snapshot.landmark, snapshot.city, snapshot.pincode]
    .filter(Boolean)
    .join(', ');
}

function shortId(value?: string | null) {
  return value ? value.slice(-8).toUpperCase() : 'UNKNOWN';
}

function riderPartnerId(userId?: string | null, riderId?: string | null) {
  const source = riderId || userId || '00000';
  const suffix = source.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase().padStart(6, '0');
  return `AGP${suffix}`;
}

function rupees(value: number | null) {
  if (value == null) return '—';
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function statusTone(status: string) {
  if (['DELIVERED', 'PICKUP_VERIFIED'].includes(status)) {
    return { backgroundColor: '#E9F9EF', color: '#11854C' };
  }
  if (['DELIVERY_FAILED', 'CANCELLED', 'RETURNING_TO_STORE'].includes(status)) {
    return { backgroundColor: '#FDECEC', color: '#C52A2A' };
  }
  if (['RIDER_AT_STORE', 'RIDER_AT_CUSTOMER'].includes(status)) {
    return { backgroundColor: '#FFF5DE', color: '#B96600' };
  }
  return { backgroundColor: '#EAF3FF', color: '#1875D1' };
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

function TrendLabel({ current, previous, inverted = false }: { current: number; previous: number; inverted?: boolean }) {
  const comparison = compareRiderMetric(current, previous);
  const improved = comparison.direction === 'flat'
    ? null
    : inverted
      ? comparison.direction === 'down'
      : comparison.direction === 'up';
  const color = improved == null ? '#6B7280' : improved ? '#079455' : '#E01E2D';
  const Icon = comparison.direction === 'down' ? ArrowDownRight : ArrowUpRight;
  const label = comparison.percent == null
    ? comparison.direction === 'up' ? 'New today' : 'Lower today'
    : `${comparison.percent}% vs yesterday`;

  return (
    <View style={styles.trendRow}>
      {comparison.direction === 'flat' ? <Circle size={8} fill={color} color={color} /> : <Icon size={16} color={color} strokeWidth={3} />}
      <Text style={[styles.trendText, { color }]}>{label}</Text>
    </View>
  );
}

function MetricCard({
  label,
  value,
  current,
  previous,
  inverted,
}: {
  label: string;
  value: string;
  current: number;
  previous: number;
  inverted?: boolean;
}) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      <TrendLabel current={current} previous={previous} inverted={inverted} />
    </View>
  );
}

function QuickStatusChip({
  label,
  color,
  active,
  onPress,
}: {
  label: string;
  color: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      activeOpacity={0.78}
      style={[styles.quickChip, { borderColor: active ? color : `${color}70`, backgroundColor: active ? `${color}0E` : '#FFFFFF' }]}
      onPress={onPress}
    >
      <View style={[styles.quickDot, { backgroundColor: color }]} />
      <Text style={[styles.quickChipText, { color: active ? color : '#555F6B' }]}>{label}</Text>
    </TouchableOpacity>
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
          <Package size={18} color="#07966D" />
          <Text style={styles.orderCode}>Order #{shortId(order.id)}</Text>
        </View>
        <View style={[styles.countdownBadge, !actionable && styles.expiredBadge]}>
          <Clock size={13} color={actionable ? '#A15C00' : '#B42318'} />
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
          testID="rider_dashboard_offer_reject_button"
          style={[styles.secondaryButton, (busy || !actionable) && styles.disabledButton]}
          disabled={busy || !actionable}
          onPress={onReject}
        >
          <XCircle size={17} color="#B42318" />
          <Text style={styles.rejectText}>Reject</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="rider_dashboard_offer_accept_button"
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
  const navigatingToStore = ['RIDER_ASSIGNED', 'RIDER_EN_ROUTE_TO_STORE', 'RIDER_AT_STORE', 'RETURNING_TO_STORE'].includes(job.status);
  const routeDestination = navigatingToStore
    ? { latitude: order.store?.latitude, longitude: order.store?.longitude }
    : { latitude: order.deliveryLat, longitude: order.deliveryLng };
  const hasRouteDestination = typeof routeDestination.latitude === 'number' && typeof routeDestination.longitude === 'number';

  const openPoint = (latitude?: number | null, longitude?: number | null, label = 'Location') => {
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      Toast.show({ type: 'error', text1: 'Location unavailable', text2: `${label} coordinates are not available.` });
      return;
    }
    Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=driving`,
    ).catch(() => Toast.show({ type: 'error', text1: 'Navigation unavailable', text2: 'Could not open the maps application.' }));
  };

  return (
    <View style={styles.deliveryCard}>
      <View style={styles.cardTopRow}>
        <View style={styles.cardTitleRow}>
          <Bike size={20} color="#07966D" />
          <Text style={styles.orderCode}>Order #{shortId(order.id)}</Text>
        </View>
        <StatusChip status={job.status} />
      </View>

      <RiderRouteMap
        destination={hasRouteDestination ? routeDestination as { latitude: number; longitude: number } : null}
        destinationLabel={navigatingToStore ? order.store?.name || 'Pickup store' : customerName}
        active={tracking.active}
        riderLocation={tracking.lastLocation}
      />

      <View style={styles.locationBlock}>
        <View style={styles.locationIcon}><Store size={19} color="#07966D" /></View>
        <View style={styles.locationContent}>
          <Text style={styles.locationLabel}>PICKUP</Text>
          <Text style={styles.locationName}>{order.store?.name || 'AAGAM store'}</Text>
          <Text style={styles.locationAddress}>{order.store?.address || 'Store address unavailable'}</Text>
          <TouchableOpacity testID="rider_dashboard_navigate_store_button" onPress={() => openPoint(order.store?.latitude, order.store?.longitude, 'Store')}>
            <Text style={styles.linkText}>Navigate to store →</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.locationBlock}>
        <View style={styles.locationIcon}><MapPin size={19} color="#07966D" /></View>
        <View style={styles.locationContent}>
          <Text style={styles.locationLabel}>DELIVER TO</Text>
          <Text style={styles.locationName}>{customerName}</Text>
          <Text style={styles.locationAddress}>{formatAddress(order.addressSnapshot)}</Text>
          <View style={styles.inlineActions}>
            <TouchableOpacity testID="rider_dashboard_navigate_customer_button" onPress={() => openPoint(order.deliveryLat, order.deliveryLng, 'Customer')}>
              <View style={styles.inlineAction}><Navigation size={14} color="#07966D" /><Text style={styles.inlineActionText}>Navigate</Text></View>
            </TouchableOpacity>
            <TouchableOpacity
              testID="rider_dashboard_call_customer_button"
              onPress={() => customerPhone
                ? Linking.openURL(`tel:${customerPhone}`)
                : Alert.alert('Phone unavailable', 'Customer phone number is unavailable.')}
            >
              <View style={styles.inlineAction}><Phone size={14} color="#07966D" /><Text style={styles.inlineActionText}>Call</Text></View>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {order.items?.length ? (
        <View style={styles.itemsBox}>
          <Text style={styles.itemsTitle}>PICKING LIST</Text>
          {order.items.map((item, index) => (
            <Text key={item.id || index} style={styles.itemLine}>• {item.product?.name || 'Item'} × {item.quantity || 0}</Text>
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
          testID="rider_dashboard_job_action_button"
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

export const RiderDashboard = ({ navigation }: { navigation?: any }) => {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [now, setNow] = useState(Date.now());
  const [locating, setLocating] = useState(false);
  const [onlinePermissionMissing, setOnlinePermissionMissing] = useState(false);
  const [historyFrom] = useState(beginningOfYesterday);
  const [isOnline, setIsOnline] = useState(() => {
    const cached = queryClient.getQueryData<RiderWorkspace>(WORKSPACE_KEY);
    return cached?.rider?.status != null && cached.rider.status !== 'OFFLINE';
  });
  const [trackingSnapshot, setTrackingSnapshot] = useState<TrackingSnapshot>({
    active: false,
    orderId: null,
    deliveryJobId: null,
    status: null,
    lastSentAt: null,
    lastAccuracy: null,
    queuedCount: 0,
    lastLocation: null,
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
      getNativeStatus: riderService.getNativeTrackingStatus,
    });
  }
  const trackingManager = trackingManagerRef.current;

  const workspaceQuery = useQuery<RiderWorkspace>({
    queryKey: WORKSPACE_KEY,
    queryFn: riderService.getWorkspace,
    refetchInterval: isOnline ? 8_000 : 20_000,
  });
  const historyQuery = useQuery<RiderWorkspace>({
    queryKey: [...DASHBOARD_HISTORY_KEY, historyFrom],
    queryFn: () => riderService.getWorkspaceSince(historyFrom),
    staleTime: 60_000,
  });
  const notificationQuery = useQuery({
    queryKey: PARTNER_NOTIFICATION_QUERY_KEY,
    queryFn: () => notificationService.getInbox(1),
    refetchInterval: 15_000,
    retry: 1,
  });

  const workspace = workspaceQuery.data;
  const activeJob = workspace?.activeJob || null;
  const riderStatus = workspace?.rider?.status || (isOnline ? 'ONLINE' : 'OFFLINE');
  const offers = useMemo(
    () => (workspace?.pendingOffers || []).filter((offer) => isOfferActionable(offer, now)),
    [workspace?.pendingOffers, now],
  );
  const history = historyQuery.data?.assignmentHistory || workspace?.assignmentHistory || [];
  const today = useMemo(() => summarizeRiderDay(history, new Date()), [history, now]);
  const yesterdayDate = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return date;
  }, [historyFrom]);
  const yesterday = useMemo(() => summarizeRiderDay(history, yesterdayDate), [history, yesterdayDate]);
  const unreadCount = Number(notificationQuery.data?.unreadCount || 0);
  const ordersRemaining = Math.max(0, INCENTIVE_TARGET - today.completed);
  const avatarUrl = (user as any)?.avatarUrl || (user as any)?.profileImage || (user as any)?.photoUrl;
  const initial = (user?.name || 'R').slice(0, 1).toUpperCase();

  useEffect(() => {
    if (workspace?.rider?.status) {
      const online = workspace.rider.status !== 'OFFLINE';
      setIsOnline(online);
      if (!online) {
        setOnlinePermissionMissing(false);
        RiderOnlineService.stop().catch(() => undefined);
      }
    }
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
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY }),
        queryClient.invalidateQueries({ queryKey: DASHBOARD_HISTORY_KEY }),
        queryClient.invalidateQueries({ queryKey: EARNINGS_KEY }),
        queryClient.invalidateQueries({ queryKey: PARTNER_NOTIFICATION_QUERY_KEY }),
      ]);
    };
    try {
      unsubscribeForeground = messaging().onMessage(async () => refreshWorkspace());
      unsubscribeOpened = messaging().onNotificationOpenedApp(() => refreshWorkspace());
      messaging().getInitialNotification().then((message) => {
        if (message) refreshWorkspace();
      }).catch(() => undefined);
    } catch (_error) {
      // Firebase is optional in local builds without google-services.json.
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
        Toast.show({ type: 'error', text1: 'Tracking unavailable', text2: error?.response?.data?.message || error?.message || 'Could not start rider tracking.' });
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY }),
        queryClient.invalidateQueries({ queryKey: DASHBOARD_HISTORY_KEY }),
        queryClient.invalidateQueries({ queryKey: EARNINGS_KEY }),
      ]);
      Toast.show({ type: 'success', text1: 'Offer accepted', text2: 'This delivery is now assigned to you.' });
    },
    onError: (error: any) => Toast.show({ type: 'error', text1: 'Could not accept offer', text2: error?.response?.data?.message || error?.message || 'The offer may have expired.' }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ assignmentId, reason }: { assignmentId: string; reason?: string }) => riderService.rejectOffer(assignmentId, reason),
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY }),
      queryClient.invalidateQueries({ queryKey: DASHBOARD_HISTORY_KEY }),
      queryClient.invalidateQueries({ queryKey: EARNINGS_KEY }),
    ]),
    onError: (error: any) => Toast.show({ type: 'error', text1: 'Could not reject offer', text2: error?.response?.data?.message || error?.message || 'Please refresh and try again.' }),
  });

  const transitionMutation = useMutation({
    mutationFn: ({ jobId, action }: { jobId: string; action: RiderJobAction }) =>
      riderService.transitionJob(jobId, action, action === 'DELIVERED' ? { proofType: 'RIDER_CONFIRMATION' } : undefined),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY }),
        queryClient.invalidateQueries({ queryKey: DASHBOARD_HISTORY_KEY }),
        queryClient.invalidateQueries({ queryKey: EARNINGS_KEY }),
      ]);
    },
    onError: (error: any) => Toast.show({ type: 'error', text1: 'Delivery update failed', text2: error?.response?.data?.message || error?.message || 'The delivery state changed. Refresh and try again.' }),
  });

  const requestLocationPermission = async () => {
    if (Platform.OS !== 'android') return true;
    const finePermission = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
    const fineResult = await PermissionsAndroid.check(finePermission)
      ? PermissionsAndroid.RESULTS.GRANTED
      : await PermissionsAndroid.request(finePermission, {
          title: 'Allow rider location',
          message: 'AAGAM Partners uses precise location while you are online and fulfilling a delivery.',
          buttonPositive: 'Allow',
          buttonNegative: 'Not now',
        });
    if (fineResult !== PermissionsAndroid.RESULTS.GRANTED) return false;
    if (Number(Platform.Version) < 29) return true;

    const backgroundPermission = PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION;
    if (await PermissionsAndroid.check(backgroundPermission)) return true;
    const backgroundResult = await PermissionsAndroid.request(backgroundPermission, {
      title: 'Allow background rider location',
      message: 'Choose Allow all the time so Android can keep you eligible for delivery offers while the app is in the background.',
      buttonPositive: 'Continue',
      buttonNegative: 'Not now',
    });
    if (backgroundResult === PermissionsAndroid.RESULTS.GRANTED) return true;

    if (Number(Platform.Version) >= 30) {
      Alert.alert(
        'Allow background location',
        'Open App permissions → Location and choose Allow all the time. Then return and tap ONLINE again.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open settings', onPress: () => Linking.openSettings().catch(() => undefined) },
        ],
      );
    }
    return false;
  };

  const grantOnlinePermission = async () => {
    setLocating(true);
    try {
      const permitted = await requestLocationPermission();
      if (!permitted) {
        setOnlinePermissionMissing(true);
        await RiderOnlineService.stop().catch(() => undefined);
        Toast.show({
          type: 'error',
          text1: 'Background location required',
          text2: 'Grant “Allow all the time” to remain eligible while the app is in the background.',
        });
        return false;
      }
      await RiderOnlineService.start(user?.name || 'Rider');
      setOnlinePermissionMissing(false);
      return true;
    } catch (error: any) {
      setOnlinePermissionMissing(true);
      await RiderOnlineService.stop().catch(() => undefined);
      Toast.show({ type: 'error', text1: 'Online recovery unavailable', text2: error?.message || 'Could not start background Rider availability.' });
      return false;
    } finally {
      setLocating(false);
    }
  };

  useEffect(() => {
    if (!workspace?.rider?.status || workspace.rider.status === 'OFFLINE') return;
    let cancelled = false;
    void grantOnlinePermission().then((started) => {
      if (!cancelled && !started) setOnlinePermissionMissing(true);
    });
    return () => {
      cancelled = true;
    };
  }, [workspace?.rider?.status, user?.name]);

  const goOnline = async () => {
    setLocating(true);
    try {
      const permitted = await requestLocationPermission();
      if (!permitted) {
        setLocating(false);
        Toast.show({ type: 'error', text1: 'Location permission required', text2: 'Allow precise and background location before going online.' });
        return;
      }
      Geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          await riderService.updateMyStatus('ONLINE', { latitude, longitude });
          setIsOnline(true);
          RiderOnlineService.start(user?.name || 'Rider').catch(() => undefined);
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY }),
            queryClient.invalidateQueries({ queryKey: DASHBOARD_HISTORY_KEY }),
            queryClient.invalidateQueries({ queryKey: EARNINGS_KEY }),
          ]);
          setLocating(false);
        },
        (error) => {
          setLocating(false);
          Toast.show({ type: 'error', text1: 'GPS unavailable', text2: error.message || 'Enable location services and try again.' });
        },
        { enableHighAccuracy: true, timeout: 15_000, maximumAge: 5_000 },
      );
    } catch (error: any) {
      setLocating(false);
      Toast.show({ type: 'error', text1: 'Could not go online', text2: error?.response?.data?.message || error?.message || 'Please try again.' });
    }
  };

  const goOffline = async () => {
    if (activeJob) {
      Toast.show({ type: 'error', text1: 'Active delivery', text2: 'Complete or return the current delivery before going offline.' });
      return;
    }
    try {
      await riderService.updateMyStatus('OFFLINE');
      setIsOnline(false);
      await trackingManager.stop('RIDER_OFFLINE');
      RiderOnlineService.stop().catch(() => undefined);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY }),
        queryClient.invalidateQueries({ queryKey: DASHBOARD_HISTORY_KEY }),
        queryClient.invalidateQueries({ queryKey: EARNINGS_KEY }),
      ]);
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Could not go offline', text2: error?.response?.data?.message || error?.message || 'Please try again.' });
    }
  };

  const toggleOnline = async (value: boolean) => {
    if (locating) return;
    if (value === isOnline && !onlinePermissionMissing) return;
    if (onlinePermissionMissing) {
      await grantOnlinePermission();
      return;
    }
    if (value) await goOnline();
    else await goOffline();
  };

  const confirmAccept = (offer: RiderAssignmentOffer) => {
    Alert.alert('Accept delivery offer?', `Pickup from ${offer.deliveryJob.order.store?.name || 'AAGAM store'}.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Accept', onPress: () => acceptMutation.mutate(offer.id) },
    ]);
  };

  const confirmReject = (offer: RiderAssignmentOffer) => {
    Alert.alert('Reject delivery offer?', 'The dispatcher can offer this job to another rider.', [
      { text: 'Keep offer', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: () => rejectMutation.mutate({ assignmentId: offer.id, reason: 'RIDER_DECLINED' }) },
    ]);
  };

  const confirmTransition = (action: RiderJobAction) => {
    if (!activeJob) return;
    const descriptor = nextActionForStatus(activeJob.status);
    if (!descriptor || descriptor.action !== action) return;
    Alert.alert(descriptor.label, descriptor.confirmation, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: () => transitionMutation.mutate({ jobId: activeJob.id, action }) },
    ]);
  };

  const showAutomaticStatus = (label: string) => {
    Toast.show({
      type: 'info',
      text1: `${label} status is automatic`,
      text2: label === 'Busy'
        ? 'A rider becomes busy after accepting a delivery.'
        : 'Break mode will be enabled when dispatch adds break scheduling.',
    });
  };

  const refreshAll = async () => {
    await Promise.all([workspaceQuery.refetch(), historyQuery.refetch(), notificationQuery.refetch()]);
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#0B9668" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={workspaceQuery.isRefetching || historyQuery.isRefetching} onRefresh={() => void refreshAll()} tintColor="#FFFFFF" />}
      >
        <RiderDashboardHero>
          <View style={styles.heroContent}>
            <View style={styles.profileRow}>
              <View style={styles.avatarRing}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <View style={styles.avatarFallback}>
                    {initial ? <Text style={styles.avatarInitial}>{initial}</Text> : <UserRound size={30} color="#047857" />}
                  </View>
                )}
              </View>
              <View style={styles.greetingWrap}>
                <Text style={styles.greeting} numberOfLines={1}>Hi, {user?.name?.split(' ')[0] || 'Rider'} <Text style={styles.wave}>👋</Text></Text>
                <Text style={styles.partnerId}>ID: {riderPartnerId(user?.id, workspace?.rider?.id)}</Text>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Open rider alerts"
                style={styles.headerBell}
                onPress={() => navigation?.navigate?.('Alerts')}
              >
                <Bell size={30} color="#FFFFFF" strokeWidth={2.1} />
                {unreadCount > 0 ? (
                  <View style={styles.headerBadge}>
                    <Text style={styles.headerBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            </View>
          </View>
        </RiderDashboardHero>

        <View style={styles.mainContent}>
          <View style={styles.onlineCard}>
            <View style={styles.onlineCopy}>
              <Text style={styles.onlineTitle}>Go Online <Text style={styles.onlineHint}>to start receiving orders</Text></Text>
              {onlinePermissionMissing ? <Text style={styles.permissionHint}>Background location permission required</Text> : null}
            </View>
            <View style={styles.switchGroup}>
              {locating ? <ActivityIndicator size="small" color="#07966D" /> : <Text style={[styles.switchLabel, !isOnline && styles.switchLabelOffline]}>{isOnline ? 'ONLINE' : 'OFFLINE'}</Text>}
              <Switch
                testID="rider_dashboard_online_toggle"
                value={isOnline}
                disabled={locating}
                onValueChange={(value) => void toggleOnline(value)}
                trackColor={{ false: '#D5D9DE', true: '#0DA66B' }}
                thumbColor="#FFFFFF"
                ios_backgroundColor="#D5D9DE"
              />
            </View>
          </View>

          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Quick Status</Text>
            <TouchableOpacity onPress={() => navigation?.navigate?.('Operations')} style={styles.viewAllButton}>
              <Text style={styles.viewAllText}>View all</Text>
              <ChevronRight size={18} color="#5D636A" />
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickStatusRow}>
            <QuickStatusChip label="Online" color="#06A65E" active={riderStatus === 'ONLINE'} onPress={() => void toggleOnline(true)} />
            <QuickStatusChip label="Busy" color="#ED7203" active={riderStatus === 'BUSY' || Boolean(activeJob)} onPress={() => showAutomaticStatus('Busy')} />
            <QuickStatusChip label="Break" color="#1687E8" active={false} onPress={() => showAutomaticStatus('Break')} />
            <QuickStatusChip label="Offline" color="#747B84" active={riderStatus === 'OFFLINE'} onPress={() => void toggleOnline(false)} />
          </ScrollView>

          <Text style={[styles.sectionTitle, styles.summaryHeading]}>Today’s Summary</Text>
          <View style={styles.metricsGrid}>
            <MetricCard
              label="Earnings"
              value={rupees(today.earnings)}
              current={today.earnings || 0}
              previous={yesterday.earnings || 0}
            />
            <MetricCard
              label="Orders Completed"
              value={String(today.completed)}
              current={today.completed}
              previous={yesterday.completed}
            />
            <MetricCard
              label="Active Hours"
              value={formatActiveMinutes(today.activeMinutes)}
              current={today.activeMinutes}
              previous={yesterday.activeMinutes}
            />
            <MetricCard
              label="Cancellation"
              value={String(today.cancelled)}
              current={today.cancelled}
              previous={yesterday.cancelled}
              inverted
            />
          </View>

          <View style={styles.incentiveCard}>
            <View style={styles.incentiveCopy}>
              <Text style={styles.incentiveTitle}>Incentive Zone</Text>
              <Text style={styles.incentiveText}>
                {ordersRemaining > 0
                  ? `Complete ${ordersRemaining} more order${ordersRemaining === 1 ? '' : 's'}\nto earn ₹${INCENTIVE_REWARD} extra`
                  : `Today’s ${INCENTIVE_TARGET}-order target completed`}
              </Text>
            </View>
            <View style={styles.medalGlow}>
              <Medal size={66} color="#F3A20A" fill="#FFD95C" strokeWidth={2.2} />
            </View>
          </View>

          {workspaceQuery.isLoading && !workspace ? (
            <View style={styles.centerState}>
              <ActivityIndicator size="large" color="#07966D" />
              <Text style={styles.centerText}>Loading rider workspace…</Text>
            </View>
          ) : workspaceQuery.error && !workspace ? (
            <View style={styles.errorPanel}>
              <AlertTriangle size={26} color="#B42318" />
              <Text style={styles.errorTitle}>Workspace unavailable</Text>
              <Text style={styles.errorText}>{(workspaceQuery.error as any)?.response?.data?.message || (workspaceQuery.error as Error)?.message || 'Could not load delivery work.'}</Text>
              <TouchableOpacity testID="rider_dashboard_retry_button" style={styles.retryButton} onPress={() => void refreshAll()}>
                <RefreshCw size={16} color="#FFFFFF" />
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.sectionHeadingRow}>
                <View>
                  <Text style={styles.sectionTitle}>Current delivery</Text>
                  <Text style={styles.sectionCaption}>Your assigned order and live route</Text>
                </View>
              </View>
              {activeJob ? (
                <CurrentDelivery
                  job={activeJob}
                  transitionBusy={transitionMutation.isPending}
                  tracking={trackingSnapshot}
                  onTransition={confirmTransition}
                />
              ) : (
                <View style={styles.emptyPanel}>
                  <Bike size={42} color="#C9CDD2" />
                  <Text style={styles.emptyTitle}>No active delivery</Text>
                  <Text style={styles.emptyText}>Go online and accept an addressed offer when you are ready.</Text>
                </View>
              )}

              <View style={styles.sectionHeadingRow}>
                <View>
                  <Text style={styles.sectionTitle}>Addressed offers</Text>
                  <Text style={styles.sectionCaption}>Offers reserved for your rider account</Text>
                </View>
                <TouchableOpacity testID="rider_dashboard_refresh_button" onPress={() => void refreshAll()} style={styles.refreshButton}>
                  <RefreshCw size={17} color="#07966D" />
                </TouchableOpacity>
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
                <View style={styles.emptyPanel}>
                  <Clock size={38} color="#C9CDD2" />
                  <Text style={styles.emptyTitle}>No open offers</Text>
                  <Text style={styles.emptyText}>New dispatcher offers will appear here and through push notifications.</Text>
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  scrollContent: { paddingBottom: 108 },
  heroContent: { paddingTop: 42, paddingHorizontal: 25 },
  profileRow: { flexDirection: 'row', alignItems: 'center' },
  avatarRing: { width: 70, height: 70, borderRadius: 35, padding: 3, backgroundColor: '#FFFFFF', shadowColor: '#003D2D', shadowOpacity: 0.2, shadowRadius: 7, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  avatarImage: { width: '100%', height: '100%', borderRadius: 32 },
  avatarFallback: { flex: 1, borderRadius: 32, backgroundColor: '#E8F8F1', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#047857', fontSize: 28, fontWeight: '900' },
  greetingWrap: { flex: 1, marginLeft: 14 },
  greeting: { color: '#FFFFFF', fontSize: 26, lineHeight: 32, fontWeight: '800' },
  wave: { fontSize: 24 },
  partnerId: { color: '#E5FFF5', fontSize: 16, fontWeight: '500', marginTop: 5 },
  headerBell: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  headerBadge: { position: 'absolute', right: 1, top: 0, minWidth: 24, height: 24, borderRadius: 12, backgroundColor: '#EF2028', paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#057A5B' },
  headerBadgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  mainContent: { paddingHorizontal: 16, marginTop: -20 },
  onlineCard: { minHeight: 98, borderRadius: 21, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E4E6E8', paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', shadowColor: '#111827', shadowOpacity: 0.07, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 4 },
  onlineCopy: { flex: 1, paddingRight: 10 },
  onlineTitle: { color: '#121820', fontSize: 17, fontWeight: '800' },
  onlineHint: { color: '#4E5660', fontWeight: '400' },
  permissionHint: { color: '#B45309', fontSize: 10, fontWeight: '700', marginTop: 5 },
  switchGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  switchLabel: { color: '#07966D', fontSize: 12, fontWeight: '900' },
  switchLabelOffline: { color: '#6B7280' },
  sectionHeaderRow: { marginTop: 29, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  sectionTitle: { color: '#131A22', fontSize: 20, fontWeight: '800' },
  viewAllButton: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 5 },
  viewAllText: { color: '#5D636A', fontSize: 14, fontWeight: '500' },
  quickStatusRow: { gap: 10, paddingVertical: 15, paddingHorizontal: 1 },
  quickChip: { height: 46, minWidth: 100, paddingHorizontal: 15, borderRadius: 23, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  quickDot: { width: 10, height: 10, borderRadius: 5 },
  quickChipText: { fontSize: 14, fontWeight: '600' },
  summaryHeading: { marginTop: 22, marginBottom: 16, paddingHorizontal: 2 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  metricCard: { width: '48.4%', minHeight: 142, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E4E7', padding: 15, shadowColor: '#111827', shadowOpacity: 0.035, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  metricLabel: { color: '#505862', fontSize: 14, fontWeight: '500' },
  metricValue: { color: '#0B1017', fontSize: 26, lineHeight: 34, fontWeight: '800', marginTop: 13 },
  trendRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 5 },
  trendText: { fontSize: 11, fontWeight: '600' },
  incentiveCard: { minHeight: 122, marginTop: 15, borderRadius: 22, backgroundColor: '#E7F8EE', paddingHorizontal: 17, paddingVertical: 18, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  incentiveCopy: { flex: 1 },
  incentiveTitle: { color: '#101820', fontSize: 20, fontWeight: '800' },
  incentiveText: { color: '#39434D', fontSize: 15, lineHeight: 23, fontWeight: '500', marginTop: 7 },
  medalGlow: { width: 88, height: 88, borderRadius: 44, backgroundColor: 'rgba(255,255,255,0.46)', alignItems: 'center', justifyContent: 'center', marginRight: -1 },
  centerState: { minHeight: 240, alignItems: 'center', justifyContent: 'center', gap: 14 },
  centerText: { color: '#64748B', fontWeight: '700' },
  errorPanel: { marginTop: 24, backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 1, borderRadius: 22, padding: 24, alignItems: 'center' },
  errorTitle: { marginTop: 10, color: '#991B1B', fontWeight: '900', fontSize: 18 },
  errorText: { marginTop: 6, color: '#B42318', textAlign: 'center', lineHeight: 20 },
  retryButton: { marginTop: 16, backgroundColor: '#B42318', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 7 },
  retryText: { color: '#FFFFFF', fontWeight: '900' },
  sectionHeadingRow: { marginTop: 29, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  sectionCaption: { marginTop: 4, color: '#69727D', fontSize: 11, fontWeight: '600' },
  refreshButton: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E5F7EF' },
  offerCard: { backgroundColor: '#FFFFFF', borderRadius: 22, padding: 17, marginBottom: 14, borderWidth: 1, borderColor: '#CFEDE1', shadowColor: '#0F172A', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  expiredCard: { opacity: 0.62, borderColor: '#FECACA' },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  orderCode: { color: '#111827', fontSize: 15, fontWeight: '900' },
  countdownBadge: { backgroundColor: '#FFF2D6', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 4 },
  expiredBadge: { backgroundColor: '#FEE2E2' },
  countdownText: { color: '#A15C00', fontSize: 11, fontWeight: '900' },
  expiredText: { color: '#991B1B' },
  offerStore: { marginTop: 15, color: '#111827', fontSize: 17, fontWeight: '900' },
  offerAddress: { marginTop: 4, color: '#68717C', fontSize: 12, lineHeight: 18 },
  offerMetaRow: { marginTop: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  offerMeta: { color: '#68717C', fontSize: 12, fontWeight: '700' },
  offerAmount: { color: '#07966D', fontSize: 19, fontWeight: '900' },
  offerActions: { marginTop: 16, flexDirection: 'row', gap: 10 },
  secondaryButton: { flex: 1, minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  rejectText: { color: '#B42318', fontWeight: '900' },
  primaryButton: { flex: 1.35, minHeight: 46, borderRadius: 14, backgroundColor: '#07966D', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '900' },
  disabledButton: { opacity: 0.48 },
  deliveryCard: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 18, marginBottom: 22, borderWidth: 1, borderColor: '#BFE4D6', shadowColor: '#0F172A', shadowOpacity: 0.07, shadowRadius: 15, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  statusChip: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6, maxWidth: 150 },
  statusChipText: { fontSize: 9, fontWeight: '900', textAlign: 'center' },
  locationBlock: { marginTop: 18, flexDirection: 'row', gap: 12 },
  locationIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#ECFAF4', alignItems: 'center', justifyContent: 'center' },
  locationContent: { flex: 1 },
  locationLabel: { color: '#929BA5', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  locationName: { marginTop: 3, color: '#111827', fontSize: 15, fontWeight: '900' },
  locationAddress: { marginTop: 3, color: '#68717C', fontSize: 12, lineHeight: 18 },
  linkText: { marginTop: 6, color: '#07966D', fontWeight: '900', fontSize: 12 },
  inlineActions: { marginTop: 8, flexDirection: 'row', gap: 8 },
  inlineAction: { borderRadius: 10, backgroundColor: '#DDF6EC', paddingHorizontal: 10, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 5 },
  inlineActionText: { color: '#07966D', fontSize: 11, fontWeight: '900' },
  itemsBox: { marginTop: 18, borderRadius: 16, backgroundColor: '#F7F8FA', padding: 14 },
  itemsTitle: { color: '#68717C', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  itemLine: { marginTop: 6, color: '#39434D', fontSize: 12, fontWeight: '700' },
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
  jobActionButton: { marginTop: 18, minHeight: 50, borderRadius: 15, backgroundColor: '#111827', flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8 },
  jobActionText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  emptyPanel: { backgroundColor: '#FFFFFF', borderRadius: 22, borderWidth: 1, borderColor: '#E2E4E7', borderStyle: 'dashed', padding: 30, alignItems: 'center', marginBottom: 22 },
  emptyTitle: { marginTop: 10, color: '#111827', fontSize: 16, fontWeight: '900' },
  emptyText: { marginTop: 5, color: '#68717C', fontSize: 12, textAlign: 'center', lineHeight: 18 },
});
