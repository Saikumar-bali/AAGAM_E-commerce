import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '@aagam/mobile-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  Bike,
  CheckCircle2,
  Clock,
  HeartPulse,
  MapPin,
  Package,
  RefreshCw,
  Settings,
  Store,
  UserRound,
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
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import Toast from 'react-native-toast-message';
import { notificationService } from '../../api/notificationService';
import { riderService, RIDER_WORKSPACE_QUERY_KEY } from '../../api/riderService';
import {
  RiderAssignmentOffer,
  deliveryStatusLabel,
  isOfferActionable,
  isTrackableDeliveryStatus,
  offerSecondsRemaining,
} from '../../domain/riderWorkspace';
import { RiderOnlineService } from '../../services/RiderOnlineService';
import { RiderTrackingManager } from '../../services/RiderTrackingManager';
import { PARTNER_NOTIFICATION_QUERY_KEY } from '../PartnerNotificationsScreen';

function errorMessage(error: any) {
  const value = error?.response?.data?.message;
  if (Array.isArray(value)) return value.join(', ');
  return value || error?.message || 'The rider operation could not be completed.';
}

function currentLocation() {
  return new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
    Geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }),
      (error) => reject(new Error(error?.message || 'Enable precise GPS and try again.')),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 5_000 },
    );
  });
}

async function requestRiderLocationPermission() {
  if (Platform.OS !== 'android') return true;
  const fine = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
  const fineResult = await PermissionsAndroid.check(fine)
    ? PermissionsAndroid.RESULTS.GRANTED
    : await PermissionsAndroid.request(fine, {
        title: 'Allow rider location',
        message: 'Aagaam Partners uses precise location while you are online and fulfilling deliveries.',
        buttonPositive: 'Allow',
        buttonNegative: 'Not now',
      });
  if (fineResult !== PermissionsAndroid.RESULTS.GRANTED) return false;
  if (Number(Platform.Version) < 29) return true;

  const background = PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION;
  if (await PermissionsAndroid.check(background)) return true;
  const result = await PermissionsAndroid.request(background, {
    title: 'Allow background rider location',
    message: 'Choose Allow all the time so dispatch can keep your availability fresh.',
    buttonPositive: 'Continue',
    buttonNegative: 'Not now',
  });
  if (result === PermissionsAndroid.RESULTS.GRANTED) return true;
  if (Number(Platform.Version) >= 30) {
    Alert.alert(
      'Allow background location',
      'Open App permissions → Location and choose Allow all the time.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open settings', onPress: () => Linking.openSettings().catch(() => undefined) },
      ],
    );
  }
  return false;
}

function shortId(value?: string | null) {
  return value ? value.slice(-8).toUpperCase() : 'UNKNOWN';
}

export const RiderDashboard = ({ navigation }: { navigation?: any }) => {
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const [statusBusy, setStatusBusy] = useState(false);
  const statusBusyRef = useRef(false);
  const [permissionMissing, setPermissionMissing] = useState(false);
  const [offerBusy, setOfferBusy] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
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

  const workspaceQuery = useQuery({
    queryKey: RIDER_WORKSPACE_QUERY_KEY,
    queryFn: riderService.getWorkspace,
    refetchInterval: 8_000,
    retry: 1,
  });
  const inboxQuery = useQuery({
    queryKey: PARTNER_NOTIFICATION_QUERY_KEY,
    queryFn: () => notificationService.getInbox(1),
    staleTime: 10_000,
    retry: 1,
  });

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  const workspace = workspaceQuery.data;
  const activeJob = workspace?.activeJob || null;
  const riderStatus = workspace?.rider?.status || 'OFFLINE';
  const isOnline = riderStatus !== 'OFFLINE';
  const pendingOffers = useMemo(
    () => (workspace?.pendingOffers || []).filter((offer) => isOfferActionable(offer, now)),
    [now, workspace?.pendingOffers],
  );
  const unreadCount = Number(inboxQuery.data?.unreadCount || 0);

  useEffect(() => {
    if (!activeJob || !isTrackableDeliveryStatus(activeJob.status)) {
      if (trackingManager.getSnapshot().active) {
        void trackingManager.stop(activeJob ? 'STATUS_NOT_TRACKABLE' : 'NO_ACTIVE_DELIVERY');
      }
      return;
    }
    void trackingManager.start({
      orderId: activeJob.orderId,
      deliveryJobId: activeJob.id,
      status: activeJob.status,
    }).catch((error: any) => {
      Toast.show({ type: 'error', text1: 'Live tracking unavailable', text2: errorMessage(error) });
    });
  }, [activeJob?.id, activeJob?.status, trackingManager]);

  useEffect(() => {
    if (riderStatus === 'OFFLINE') {
      setPermissionMissing(false);
      void RiderOnlineService.stop().catch(() => undefined);
      return;
    }
    let cancelled = false;
    void requestRiderLocationPermission().then(async (permitted) => {
      if (cancelled) return;
      if (!permitted) {
        setPermissionMissing(true);
        await RiderOnlineService.stop().catch(() => undefined);
        return;
      }
      await RiderOnlineService.start(user?.name || 'Rider').catch(() => undefined);
      if (!cancelled) setPermissionMissing(false);
    });
    return () => { cancelled = true; };
  }, [riderStatus, user?.name]);

  const refresh = async () => {
    await Promise.all([workspaceQuery.refetch(), inboxQuery.refetch()]);
  };

  const changeAvailability = async (online: boolean) => {
    if (statusBusyRef.current) return;
    if (!online && activeJob) {
      Toast.show({ type: 'error', text1: 'Active delivery', text2: 'Complete or return the current delivery before going offline.' });
      return;
    }
    statusBusyRef.current = true;
    setStatusBusy(true);
    try {
      if (online) {
        const permitted = await requestRiderLocationPermission();
        if (!permitted) {
          setPermissionMissing(true);
          throw new Error('Background location is required before going online.');
        }
        // Verify that precise location is available before enabling dispatch.
        // Heartbeats use /riders/me/heartbeat; availability accepts only status.
        await currentLocation();
        await riderService.updateMyStatus('ONLINE');
        try {
          await RiderOnlineService.start(user?.name || 'Rider');
        } catch (serviceError) {
          await riderService.updateMyStatus('OFFLINE').catch(() => undefined);
          throw serviceError;
        }
        setPermissionMissing(false);
      } else {
        await trackingManager.stop('RIDER_OFFLINE');
        await RiderOnlineService.stop().catch(() => undefined);
        await riderService.updateMyStatus('OFFLINE');
        setPermissionMissing(false);
      }
      await queryClient.invalidateQueries({ queryKey: RIDER_WORKSPACE_QUERY_KEY });
      Toast.show({
        type: 'success',
        text1: online ? 'You are online' : 'You are offline',
        text2: online ? 'Dispatch can now send delivery offers.' : 'Offers and location heartbeats are paused.',
      });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Availability update failed', text2: errorMessage(error) });
    } finally {
      statusBusyRef.current = false;
      setStatusBusy(false);
    }
  };

  const acceptMutation = useMutation({
    mutationFn: (assignmentId: string) => riderService.acceptOffer(assignmentId),
    onMutate: (assignmentId) => setOfferBusy(assignmentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RIDER_WORKSPACE_QUERY_KEY });
      Toast.show({ type: 'success', text1: 'Offer accepted', text2: 'Open Jobs to begin the delivery.' });
    },
    onError: (error: any) => Toast.show({ type: 'error', text1: 'Could not accept offer', text2: errorMessage(error) }),
    onSettled: () => setOfferBusy(null),
  });
  const rejectMutation = useMutation({
    mutationFn: (assignmentId: string) => riderService.rejectOffer(assignmentId, 'RIDER_DECLINED'),
    onMutate: (assignmentId) => setOfferBusy(assignmentId),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: RIDER_WORKSPACE_QUERY_KEY }),
    onError: (error: any) => Toast.show({ type: 'error', text1: 'Could not reject offer', text2: errorMessage(error) }),
    onSettled: () => setOfferBusy(null),
  });

  const openActive = () => {
    if (!activeJob) return;
    const screen = activeJob.status === 'RIDER_AT_STORE'
      ? 'RiderPickup'
      : activeJob.status === 'DELIVERY_FAILED' || activeJob.status === 'RETURNING_TO_STORE'
        ? 'RiderReturn'
        : 'RiderActiveJob';
    navigation?.navigate?.('Operations', {
      screen,
      params: { deliveryJobId: activeJob.id },
    });
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#067B5C" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={workspaceQuery.isRefetching || inboxQuery.isRefetching} onRefresh={() => void refresh()} tintColor="#FFFFFF" />}
      >
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.flex}>
              <Text style={styles.eyebrow}>RIDER WORKSPACE</Text>
              <Text style={styles.title}>Hello, {user?.name?.split(' ')[0] || 'Partner'}</Text>
              <Text style={styles.subtitle}>Availability, offers and live delivery health in one place.</Text>
            </View>
            <TouchableOpacity testID="rider_dashboard_alerts" style={styles.iconButton} onPress={() => navigation?.navigate?.('Alerts')}>
              <Bell size={22} color="#FFFFFF" />
              {unreadCount > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text></View> : null}
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} onPress={() => navigation?.navigate?.('Profile')}><UserRound size={22} color="#FFFFFF" /></TouchableOpacity>
          </View>
          <View style={styles.availabilityCard}>
            <View style={[styles.statusIcon, isOnline ? styles.onlineIcon : styles.offlineIcon]}>
              {isOnline ? <Wifi size={22} color="#166534" /> : <WifiOff size={22} color="#991B1B" />}
            </View>
            <View style={styles.flex}>
              <Text style={styles.availabilityTitle}>{isOnline ? riderStatus === 'BUSY' ? 'Busy on a job' : 'Online for offers' : 'Offline'}</Text>
              <Text style={styles.availabilityText}>{permissionMissing ? 'Background location needs attention.' : isOnline ? 'Dispatch heartbeat is active.' : 'Turn online when ready.'}</Text>
            </View>
            {statusBusy ? <ActivityIndicator color="#0F766E" /> : (
              <Switch
                testID="rider_availability_switch"
                value={isOnline}
                disabled={riderStatus === 'BUSY'}
                onValueChange={(value) => void changeAvailability(value)}
                trackColor={{ false: '#CBD5E1', true: '#86EFAC' }}
                thumbColor={isOnline ? '#0F766E' : '#FFFFFF'}
              />
            )}
          </View>
        </View>

        <View style={styles.quickRow}>
          <TouchableOpacity style={styles.quickAction} onPress={() => navigation?.navigate?.('TrackingDiagnostics')}><HeartPulse size={19} color="#0F766E" /><Text style={styles.quickText}>Tracking health</Text></TouchableOpacity>
          <TouchableOpacity style={styles.quickAction} onPress={() => navigation?.navigate?.('NotificationSettings')}><Settings size={19} color="#0F766E" /><Text style={styles.quickText}>Alert settings</Text></TouchableOpacity>
        </View>

        {workspaceQuery.isLoading ? (
          <View style={styles.loading}><ActivityIndicator size="large" color="#0F766E" /><Text style={styles.muted}>Loading Rider Portal…</Text></View>
        ) : workspaceQuery.isError ? (
          <View style={styles.errorCard}><XCircle size={28} color="#B91C1C" /><View style={styles.flex}><Text style={styles.errorTitle}>Workspace unavailable</Text><Text style={styles.errorText}>{errorMessage(workspaceQuery.error)}</Text></View><TouchableOpacity onPress={() => void refresh()}><RefreshCw size={21} color="#B91C1C" /></TouchableOpacity></View>
        ) : (
          <>
            {activeJob ? (
              <TouchableOpacity testID="rider_active_job_card" style={styles.activeCard} onPress={openActive}>
                <View style={styles.cardHeader}>
                  <View style={styles.activeIcon}><Bike size={24} color="#FFFFFF" /></View>
                  <View style={styles.flex}><Text style={styles.cardEyebrow}>ACTIVE DELIVERY</Text><Text style={styles.cardTitle}>{deliveryStatusLabel(activeJob.status)}</Text><Text style={styles.cardText}>Order #{shortId(activeJob.order.id)}</Text></View>
                  <CheckCircle2 size={24} color="#0F766E" />
                </View>
                <View style={styles.routeRow}>
                  <View style={styles.routeItem}><Store size={18} color="#0F766E" /><Text style={styles.routeText}>{activeJob.order.store?.name || 'Pickup store'}</Text></View>
                  <View style={styles.routeItem}><MapPin size={18} color="#0F766E" /><Text style={styles.routeText}>{activeJob.order.addressSnapshot?.city || 'Customer destination'}</Text></View>
                </View>
                <View style={styles.openButton}><Text style={styles.openButtonText}>Open exact active job</Text><Package size={19} color="#FFFFFF" /></View>
              </TouchableOpacity>
            ) : null}

            <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Delivery offers</Text><Text style={styles.sectionText}>{isOnline ? `${pendingOffers.length} waiting` : 'Go online to receive offers'}</Text></View><TouchableOpacity onPress={() => void refresh()}><RefreshCw size={20} color="#0F766E" /></TouchableOpacity></View>
            {pendingOffers.length === 0 ? (
              <View style={styles.emptyCard}><Clock size={38} color="#94A3B8" /><Text style={styles.emptyTitle}>{isOnline ? 'Waiting for the next offer' : 'You are offline'}</Text><Text style={styles.muted}>{isOnline ? 'New assignments appear automatically.' : 'Use the availability switch when ready.'}</Text></View>
            ) : pendingOffers.map((offer) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                now={now}
                busy={offerBusy === offer.id}
                onOpen={() => navigation?.navigate?.('Operations', { screen: 'RiderOfferDetail', params: { assignmentId: offer.id } })}
                onAccept={() => acceptMutation.mutate(offer.id)}
                onReject={() => Alert.alert('Reject this offer?', 'The offer will be returned to dispatch.', [
                  { text: 'Keep offer', style: 'cancel' },
                  { text: 'Reject', style: 'destructive', onPress: () => rejectMutation.mutate(offer.id) },
                ])}
              />
            ))}
          </>
        )}
        <View style={{ height: 110 }} />
      </ScrollView>
    </View>
  );
};

function OfferCard({ offer, now, busy, onOpen, onAccept, onReject }: { offer: RiderAssignmentOffer; now: number; busy: boolean; onOpen: () => void; onAccept: () => void; onReject: () => void }) {
  const seconds = offerSecondsRemaining(offer.expiresAt, now);
  const job = offer.deliveryJob;
  return (
    <TouchableOpacity activeOpacity={0.9} style={styles.offerCard} onPress={onOpen}>
      <View style={styles.cardHeader}><View style={styles.offerIcon}><Package size={23} color="#0F766E" /></View><View style={styles.flex}><Text style={styles.cardEyebrow}>NEW OFFER · #{shortId(job.order.id)}</Text><Text style={styles.cardTitle}>{job.order.store?.name || 'Aagaam store'}</Text><Text style={styles.cardText}>{job.order.addressSnapshot?.city || 'Customer delivery'}{seconds !== null ? ` · ${seconds}s` : ''}</Text></View></View>
      <View style={styles.offerActions}><TouchableOpacity disabled={busy} style={styles.rejectButton} onPress={onReject}><Text style={styles.rejectText}>Reject</Text></TouchableOpacity><TouchableOpacity disabled={busy} style={styles.acceptButton} onPress={onAccept}>{busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.acceptText}>Accept offer</Text>}</TouchableOpacity></View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' }, content: { paddingBottom: 20 }, flex: { flex: 1 },
  hero: { backgroundColor: '#067B5C', paddingTop: 52, paddingHorizontal: 18, paddingBottom: 22, borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 9 }, eyebrow: { color: '#A7F3D0', fontSize: 9, fontWeight: '900', letterSpacing: 1.3 }, title: { color: '#FFFFFF', fontSize: 27, fontWeight: '900', marginTop: 4 }, subtitle: { color: '#D1FAE5', fontSize: 11, marginTop: 4 },
  iconButton: { width: 43, height: 43, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }, badge: { position: 'absolute', right: -3, top: -3, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#EF1D25', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }, badgeText: { color: '#FFFFFF', fontSize: 8, fontWeight: '900' },
  availabilityCard: { marginTop: 20, borderRadius: 20, backgroundColor: '#FFFFFF', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }, statusIcon: { width: 45, height: 45, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, onlineIcon: { backgroundColor: '#DCFCE7' }, offlineIcon: { backgroundColor: '#FEE2E2' }, availabilityTitle: { color: '#0F172A', fontSize: 15, fontWeight: '900' }, availabilityText: { color: '#64748B', fontSize: 10, marginTop: 3 },
  quickRow: { flexDirection: 'row', gap: 10, marginHorizontal: 18, marginTop: 14 }, quickAction: { flex: 1, minHeight: 48, borderRadius: 15, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#B7E4D7', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, quickText: { color: '#0F766E', fontSize: 11, fontWeight: '900' },
  loading: { minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: 10 }, muted: { color: '#64748B', fontSize: 11, textAlign: 'center', marginTop: 5 }, errorCard: { margin: 18, borderRadius: 18, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }, errorTitle: { color: '#991B1B', fontWeight: '900' }, errorText: { color: '#B91C1C', fontSize: 10, marginTop: 3 },
  activeCard: { margin: 18, marginBottom: 4, borderRadius: 23, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#99F6E4', padding: 16 }, cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 }, activeIcon: { width: 47, height: 47, borderRadius: 16, backgroundColor: '#0F766E', alignItems: 'center', justifyContent: 'center' }, offerIcon: { width: 47, height: 47, borderRadius: 16, backgroundColor: '#CCFBF1', alignItems: 'center', justifyContent: 'center' }, cardEyebrow: { color: '#0F766E', fontSize: 9, fontWeight: '900', letterSpacing: 0.8 }, cardTitle: { color: '#0F172A', fontSize: 17, fontWeight: '900', marginTop: 3 }, cardText: { color: '#64748B', fontSize: 10, marginTop: 3 }, routeRow: { marginTop: 14, gap: 8 }, routeItem: { flexDirection: 'row', alignItems: 'center', gap: 7 }, routeText: { color: '#334155', fontSize: 11, fontWeight: '700' }, openButton: { minHeight: 48, borderRadius: 15, backgroundColor: '#0F766E', marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, openButtonText: { color: '#FFFFFF', fontWeight: '900' },
  sectionHeader: { marginHorizontal: 18, marginTop: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sectionTitle: { color: '#0F172A', fontSize: 18, fontWeight: '900' }, sectionText: { color: '#64748B', fontSize: 10, marginTop: 3 }, emptyCard: { margin: 18, minHeight: 170, borderRadius: 22, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center', padding: 20 }, emptyTitle: { color: '#0F172A', fontSize: 16, fontWeight: '900', marginTop: 10 },
  offerCard: { marginHorizontal: 18, marginTop: 11, borderRadius: 22, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 15 }, offerActions: { flexDirection: 'row', gap: 9, marginTop: 13 }, rejectButton: { flex: 1, minHeight: 45, borderRadius: 14, borderWidth: 1, borderColor: '#FCA5A5', alignItems: 'center', justifyContent: 'center' }, rejectText: { color: '#B91C1C', fontWeight: '900' }, acceptButton: { flex: 2, minHeight: 45, borderRadius: 14, backgroundColor: '#0F766E', alignItems: 'center', justifyContent: 'center' }, acceptText: { color: '#FFFFFF', fontWeight: '900' },
});
