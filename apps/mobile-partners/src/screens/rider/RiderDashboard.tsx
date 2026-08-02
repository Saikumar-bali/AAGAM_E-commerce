import messaging from '@react-native-firebase/messaging';
import { useAuthStore } from '@aagam/mobile-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  Bike,
  CheckCircle2,
  Clock,
  MapPin,
  Package,
  RefreshCw,
  Store,
  UserRound,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { riderService } from '../../api/riderService';
import {
  RiderAssignmentOffer,
  deliveryStatusLabel,
  isOfferActionable,
  offerSecondsRemaining,
} from '../../domain/riderWorkspace';
import { PARTNER_NOTIFICATION_QUERY_KEY } from '../PartnerNotificationsScreen';

const WORKSPACE_KEY = ['rider', 'delivery-workspace'] as const;

function errorMessage(error: any) {
  const value = error?.response?.data?.message;
  if (Array.isArray(value)) return value.join(', ');
  return value || error?.message || 'The rider operation could not be completed.';
}

function optionalCurrentLocation() {
  return new Promise<{ latitude: number; longitude: number } | null>((resolve) => {
    Geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 5_000 },
    );
  });
}

function shortId(value?: string | null) {
  return value ? value.slice(-8).toUpperCase() : 'UNKNOWN';
}

export const RiderDashboard = ({ navigation }: { navigation?: any }) => {
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const [statusBusy, setStatusBusy] = useState(false);
  const [offerBusy, setOfferBusy] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const workspaceQuery = useQuery({
    queryKey: WORKSPACE_KEY,
    queryFn: riderService.getWorkspace,
    refetchInterval: 8_000,
    retry: 1,
  });
  const inboxQuery = useQuery({
    queryKey: PARTNER_NOTIFICATION_QUERY_KEY,
    queryFn: () => notificationService.getInbox(1),
    refetchInterval: 15_000,
    retry: 1,
  });

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const openNotification = (message: any) => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY }),
        queryClient.invalidateQueries({ queryKey: PARTNER_NOTIFICATION_QUERY_KEY }),
      ]);
      if (message?.data?.deliveryJobId || message?.data?.orderId) navigation?.navigate?.('Operations');
      else navigation?.navigate?.('Alerts');
    };
    const unsubscribeForeground = messaging().onMessage(async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY }),
        queryClient.invalidateQueries({ queryKey: PARTNER_NOTIFICATION_QUERY_KEY }),
      ]);
      Toast.show({ type: 'info', text1: 'New rider update', text2: 'Your job queue has been refreshed.' });
    });
    const unsubscribeOpened = messaging().onNotificationOpenedApp(openNotification);
    void messaging().getInitialNotification().then((message) => { if (message) openNotification(message); });
    return () => { unsubscribeForeground(); unsubscribeOpened(); };
  }, [navigation, queryClient]);

  const workspace = workspaceQuery.data;
  const riderStatus = workspace?.rider?.status || 'OFFLINE';
  const isOnline = riderStatus !== 'OFFLINE';
  const pendingOffers = useMemo(
    () => (workspace?.pendingOffers || []).filter((offer) => isOfferActionable(offer, now)),
    [now, workspace?.pendingOffers],
  );
  const unreadCount = Number(inboxQuery.data?.unreadCount || 0);

  const refresh = async () => {
    await Promise.all([workspaceQuery.refetch(), inboxQuery.refetch()]);
  };

  const changeAvailability = async (online: boolean) => {
    if (statusBusy) return;
    setStatusBusy(true);
    try {
      const location = online ? await optionalCurrentLocation() : null;
      await riderService.updateMyStatus(online ? 'ONLINE' : 'OFFLINE', location || undefined);
      await queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY });
      Toast.show({
        type: 'success',
        text1: online ? 'You are online' : 'You are offline',
        text2: online
          ? location ? 'Location attached. New offers can now arrive.' : 'Online without GPS. Enable location for better dispatch matching.'
          : 'New delivery offers are paused.',
      });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Availability update failed', text2: errorMessage(error) });
    } finally {
      // Always release the locating state, including API failures raised from
      // inside the geolocation success path.
      setStatusBusy(false);
    }
  };

  const acceptMutation = useMutation({
    mutationFn: (assignmentId: string) => riderService.acceptOffer(assignmentId),
    onMutate: (assignmentId) => setOfferBusy(assignmentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY });
      Toast.show({ type: 'success', text1: 'Offer accepted', text2: 'Open Jobs to begin the pickup flow.' });
    },
    onError: (error: any) => Toast.show({ type: 'error', text1: 'Could not accept offer', text2: errorMessage(error) }),
    onSettled: () => setOfferBusy(null),
  });
  const rejectMutation = useMutation({
    mutationFn: (assignmentId: string) => riderService.rejectOffer(assignmentId, 'RIDER_DECLINED'),
    onMutate: (assignmentId) => setOfferBusy(assignmentId),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY }); },
    onError: (error: any) => Toast.show({ type: 'error', text1: 'Could not reject offer', text2: errorMessage(error) }),
    onSettled: () => setOfferBusy(null),
  });

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
              <Text style={styles.subtitle}>Manage availability, offers and the active delivery.</Text>
            </View>
            <TouchableOpacity testID="rider_dashboard_alerts" style={styles.iconButton} onPress={() => navigation?.navigate?.('Alerts')}>
              <Bell size={23} color="#FFFFFF" />
              {unreadCount > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text></View> : null}
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} onPress={() => navigation?.navigate?.('Profile')}><UserRound size={23} color="#FFFFFF" /></TouchableOpacity>
          </View>
          <View style={styles.availabilityCard}>
            <View style={[styles.statusIcon, isOnline ? styles.onlineIcon : styles.offlineIcon]}>{isOnline ? <Wifi size={22} color="#166534" /> : <WifiOff size={22} color="#991B1B" />}</View>
            <View style={styles.flex}><Text style={styles.availabilityTitle}>{isOnline ? riderStatus === 'BUSY' ? 'Busy on a job' : 'Online for offers' : 'Offline'}</Text><Text style={styles.availabilityText}>{statusBusy ? 'Updating availability…' : isOnline ? 'Dispatch can send delivery offers.' : 'Turn online when you are ready.'}</Text></View>
            {statusBusy ? <ActivityIndicator color="#0F766E" /> : <Switch testID="rider_availability_switch" value={isOnline} disabled={statusBusy || riderStatus === 'BUSY'} onValueChange={(value) => void changeAvailability(value)} trackColor={{ false: '#CBD5E1', true: '#86EFAC' }} thumbColor={isOnline ? '#0F766E' : '#FFFFFF'} />}
          </View>
        </View>

        {workspaceQuery.isLoading ? <View style={styles.loading}><ActivityIndicator size="large" color="#0F766E" /><Text style={styles.muted}>Loading rider workspace…</Text></View> : workspaceQuery.isError ? <View style={styles.errorCard}><XCircle size={28} color="#B91C1C" /><View style={styles.flex}><Text style={styles.errorTitle}>Workspace unavailable</Text><Text style={styles.errorText}>{errorMessage(workspaceQuery.error)}</Text></View><TouchableOpacity onPress={() => void refresh()}><RefreshCw size={21} color="#B91C1C" /></TouchableOpacity></View> : <>
          {workspace?.activeJob ? <TouchableOpacity testID="rider_active_job_card" style={styles.activeCard} onPress={() => navigation?.navigate?.('Operations')}>
            <View style={styles.cardHeader}><View style={styles.activeIcon}><Bike size={24} color="#FFFFFF" /></View><View style={styles.flex}><Text style={styles.cardEyebrow}>ACTIVE DELIVERY</Text><Text style={styles.cardTitle}>{deliveryStatusLabel(workspace.activeJob.status)}</Text><Text style={styles.cardText}>Order #{shortId(workspace.activeJob.order.id)}</Text></View><CheckCircle2 size={24} color="#0F766E" /></View>
            <View style={styles.routeRow}><View style={styles.routeItem}><Store size={18} color="#0F766E" /><Text style={styles.routeText}>{workspace.activeJob.order.store?.name || 'Pickup store'}</Text></View><View style={styles.routeItem}><MapPin size={18} color="#0F766E" /><Text style={styles.routeText}>{workspace.activeJob.order.addressSnapshot?.city || 'Customer destination'}</Text></View></View>
            <View style={styles.openButton}><Text style={styles.openButtonText}>Open active job</Text><Package size={19} color="#FFFFFF" /></View>
          </TouchableOpacity> : null}

          <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Delivery offers</Text><Text style={styles.sectionText}>{isOnline ? `${pendingOffers.length} offer${pendingOffers.length === 1 ? '' : 's'} waiting` : 'Go online to receive offers'}</Text></View><TouchableOpacity onPress={() => void refresh()}><RefreshCw size={20} color="#0F766E" /></TouchableOpacity></View>
          {pendingOffers.length === 0 ? <View style={styles.emptyCard}><Clock size={38} color="#94A3B8" /><Text style={styles.emptyTitle}>{isOnline ? 'Waiting for the next offer' : 'You are offline'}</Text><Text style={styles.muted}>{isOnline ? 'New assignments will appear automatically.' : 'Use the availability switch above when ready.'}</Text></View> : pendingOffers.map((offer) => <OfferCard key={offer.id} offer={offer} now={now} busy={offerBusy === offer.id} onAccept={() => acceptMutation.mutate(offer.id)} onReject={() => Alert.alert('Reject this offer?', 'The offer will be returned to dispatch.', [{ text: 'Keep offer', style: 'cancel' }, { text: 'Reject', style: 'destructive', onPress: () => rejectMutation.mutate(offer.id) }])} />)}
        </>}
        <View style={{ height: 110 }} />
      </ScrollView>
    </View>
  );
};

function OfferCard({ offer, now, busy, onAccept, onReject }: { offer: RiderAssignmentOffer; now: number; busy: boolean; onAccept: () => void; onReject: () => void }) {
  const seconds = offerSecondsRemaining(offer.expiresAt, now);
  const job = offer.deliveryJob;
  return <View style={styles.offerCard}><View style={styles.cardHeader}><View style={styles.offerIcon}><Package size={23} color="#0F766E" /></View><View style={styles.flex}><Text style={styles.cardEyebrow}>NEW OFFER · #{shortId(job.order.id)}</Text><Text style={styles.cardTitle}>{job.order.store?.name || 'Aagaam store'}</Text><Text style={styles.cardText}>{job.order.addressSnapshot?.city || 'Customer delivery'}{seconds !== null ? ` · ${seconds}s remaining` : ''}</Text></View></View><View style={styles.offerActions}><TouchableOpacity disabled={busy} style={styles.rejectButton} onPress={onReject}><Text style={styles.rejectText}>Reject</Text></TouchableOpacity><TouchableOpacity disabled={busy} style={styles.acceptButton} onPress={onAccept}>{busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.acceptText}>Accept offer</Text>}</TouchableOpacity></View></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' }, content: { paddingBottom: 20 }, flex: { flex: 1 }, hero: { backgroundColor: '#067B5C', paddingTop: 52, paddingHorizontal: 18, paddingBottom: 22, borderBottomLeftRadius: 30, borderBottomRightRadius: 30 }, heroTop: { flexDirection: 'row', alignItems: 'center', gap: 9 }, eyebrow: { color: '#A7F3D0', fontSize: 9, fontWeight: '900', letterSpacing: 1.3 }, title: { color: '#FFFFFF', fontSize: 27, fontWeight: '900', marginTop: 4 }, subtitle: { color: '#D1FAE5', fontSize: 11, marginTop: 4 }, iconButton: { width: 43, height: 43, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }, badge: { position: 'absolute', right: -3, top: -3, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#EF1D25', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }, badgeText: { color: '#FFFFFF', fontSize: 8, fontWeight: '900' }, availabilityCard: { marginTop: 20, borderRadius: 20, backgroundColor: '#FFFFFF', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }, statusIcon: { width: 45, height: 45, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, onlineIcon: { backgroundColor: '#DCFCE7' }, offlineIcon: { backgroundColor: '#FEE2E2' }, availabilityTitle: { color: '#0F172A', fontSize: 15, fontWeight: '900' }, availabilityText: { color: '#64748B', fontSize: 10, marginTop: 3 }, loading: { minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: 10 }, muted: { color: '#64748B', fontSize: 11, textAlign: 'center', marginTop: 5 }, errorCard: { margin: 18, borderRadius: 18, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }, errorTitle: { color: '#991B1B', fontWeight: '900' }, errorText: { color: '#B91C1C', fontSize: 10, marginTop: 3 }, activeCard: { margin: 18, marginBottom: 4, borderRadius: 23, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#99F6E4', padding: 16 }, cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 }, activeIcon: { width: 47, height: 47, borderRadius: 16, backgroundColor: '#0F766E', alignItems: 'center', justifyContent: 'center' }, offerIcon: { width: 47, height: 47, borderRadius: 16, backgroundColor: '#CCFBF1', alignItems: 'center', justifyContent: 'center' }, cardEyebrow: { color: '#0F766E', fontSize: 9, fontWeight: '900', letterSpacing: 0.8 }, cardTitle: { color: '#0F172A', fontSize: 17, fontWeight: '900', marginTop: 3 }, cardText: { color: '#64748B', fontSize: 10, marginTop: 3 }, routeRow: { marginTop: 14, gap: 8 }, routeItem: { flexDirection: 'row', alignItems: 'center', gap: 7 }, routeText: { color: '#334155', fontSize: 11, fontWeight: '700' }, openButton: { minHeight: 48, borderRadius: 15, backgroundColor: '#0F766E', marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, openButtonText: { color: '#FFFFFF', fontWeight: '900' }, sectionHeader: { marginHorizontal: 18, marginTop: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sectionTitle: { color: '#0F172A', fontSize: 18, fontWeight: '900' }, sectionText: { color: '#64748B', fontSize: 10, marginTop: 3 }, emptyCard: { margin: 18, minHeight: 170, borderRadius: 22, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center', padding: 20 }, emptyTitle: { color: '#0F172A', fontSize: 16, fontWeight: '900', marginTop: 10 }, offerCard: { marginHorizontal: 18, marginTop: 11, borderRadius: 22, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 15 }, offerActions: { flexDirection: 'row', gap: 9, marginTop: 13 }, rejectButton: { flex: 1, minHeight: 45, borderRadius: 14, borderWidth: 1, borderColor: '#FCA5A5', alignItems: 'center', justifyContent: 'center' }, rejectText: { color: '#B91C1C', fontWeight: '900' }, acceptButton: { flex: 2, minHeight: 45, borderRadius: 14, backgroundColor: '#0F766E', alignItems: 'center', justifyContent: 'center' }, acceptText: { color: '#FFFFFF', fontWeight: '900' },
});