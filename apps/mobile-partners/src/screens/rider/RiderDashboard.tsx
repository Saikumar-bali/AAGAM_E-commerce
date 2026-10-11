import AsyncStorage from '@react-native-async-storage/async-storage';
import { GradientSurface } from '../../components/GradientSurface';
import { useAuthStore } from '@aagam/mobile-shared';
import { useQuery } from '@tanstack/react-query';
import {
  Bike,
  CheckCircle2,
  ChevronRight,
  MapPin,
  Package,
  RefreshCw,
  Route as RouteIcon,
  Store,
  XCircle,
} from 'lucide-react-native';
import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { riderService, RIDER_WORKSPACE_QUERY_KEY } from '../../api/riderService';
import { PartnerTabBrand } from '../../components/PartnerTabBrand';
import { deliveryStatusLabel, isTrackableDeliveryStatus } from '../../domain/riderWorkspace';
import { ensureRiderOnlineService } from '../../services/RiderAvailabilityController';
import { RiderOnlineService } from '../../services/RiderOnlineService';
import { RiderTrackingManager } from '../../services/RiderTrackingManager';

function errorMessage(error: any) {
  const value = error?.response?.data?.message;
  if (Array.isArray(value)) return value.join(', ');
  return value || error?.message || 'The rider operation could not be completed.';
}

function shortId(value?: string | null) {
  return value ? value.slice(-8).toUpperCase() : 'UNKNOWN';
}

export const RiderDashboard = ({ navigation }: { navigation?: any }) => {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((state) => state.user);
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

  // Home is deliberately only the rider's assigned delivery work. Availability
  // (online/offline) lives on the Profile tab and offers are no longer shown
  // here: store-assigned subscription work is the only thing on this surface.
  const workspaceQuery = useQuery({
    queryKey: RIDER_WORKSPACE_QUERY_KEY,
    queryFn: riderService.getWorkspace,
    refetchInterval: 8_000,
    retry: 1,
  });

  const workspace = workspaceQuery.data;
  const activeJobs = workspace?.activeJobs || [];
  const activeJob = activeJobs[0] || workspace?.activeJob || null;
  const riderStatus = workspace?.rider?.status || 'OFFLINE';

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
      void RiderOnlineService.stop().catch(() => undefined);
      return;
    }
    let cancelled = false;
    void ensureRiderOnlineService(user?.name || 'Rider').catch(() => undefined);
    return () => { cancelled = true; };
  }, [riderStatus, user?.name]);

  const refresh = async () => {
    await workspaceQuery.refetch();
  };

  const openActive = (job = activeJob) => {
    if (!job) return;
    const screen = job.status === 'RIDER_AT_STORE'
      ? 'RiderPickup'
      : job.status === 'DELIVERY_FAILED' || job.status === 'RETURNING_TO_STORE'
        ? 'RiderReturn'
        : 'RiderActiveJob';
    navigation?.navigate?.('Operations', {
      screen,
      params: { deliveryJobId: job.id },
    });
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#0F766E" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={workspaceQuery.isRefetching} onRefresh={() => void refresh()} tintColor="#FFFFFF" />}
      >
        <GradientSurface preset="teal" style={[styles.hero, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
          <View style={styles.brandRow}>
            <PartnerTabBrand inverse caption="RIDER PARTNER" />
          </View>
          <View style={styles.heroTop}>
            <View style={styles.flex}>
              <Text style={styles.eyebrow}>ASSIGNED DELIVERY</Text>
              <Text style={styles.title}>Hello, {user?.name?.split(' ')[0] || 'Partner'}</Text>
              <Text style={styles.subtitle}>Your store-assigned deliveries appear here.</Text>
            </View>
          </View>
        </GradientSurface>

        {workspaceQuery.isLoading ? (
          <View style={styles.loading}><ActivityIndicator size="large" color="#0F766E" /><Text style={styles.muted}>Loading your assignments…</Text></View>
        ) : workspaceQuery.isError ? (
          <View style={styles.errorCard}><XCircle size={28} color="#B91C1C" /><View style={styles.flex}><Text style={styles.errorTitle}>Assignments unavailable</Text><Text style={styles.errorText}>{errorMessage(workspaceQuery.error)}</Text></View><TouchableOpacity onPress={() => void refresh()}><RefreshCw size={21} color="#B91C1C" /></TouchableOpacity></View>
        ) : activeJobs.length ? (
          <View>
            <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Your assigned deliveries</Text><Text style={styles.sectionText}>{activeJobs.length} waiting for you</Text></View><TouchableOpacity onPress={() => void refresh()}><RefreshCw size={20} color="#0F766E" /></TouchableOpacity></View>
            {activeJobs.map((job) => (
              <TouchableOpacity key={job.id} testID="rider_active_job_card" style={styles.activeCard} onPress={() => openActive(job)}>
                <View style={styles.cardHeader}>
                  <View style={styles.activeIcon}><Bike size={24} color="#FFFFFF" /></View>
                  <View style={styles.flex}><Text style={styles.cardEyebrow}>ASSIGNED DELIVERY</Text><Text style={styles.cardTitle}>{deliveryStatusLabel(job.status)}</Text><Text style={styles.cardText}>Order #{shortId(job.order.id)}</Text></View>
                  <CheckCircle2 size={24} color="#0F766E" />
                </View>
                <View style={styles.routeRow}>
                  <View style={styles.routeItem}><Store size={18} color="#0F766E" /><Text style={styles.routeText}>{job.order.store?.name || 'Pickup store'}</Text></View>
                  <View style={styles.routeItem}><MapPin size={18} color="#0F766E" /><Text style={styles.routeText}>{job.order.addressSnapshot?.city || 'Customer destination'}</Text></View>
                </View>
                <View style={styles.openButton}><Text style={styles.openButtonText}>Open this delivery</Text><Package size={19} color="#FFFFFF" /></View>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Package size={38} color="#94A3B8" />
            <Text style={styles.emptyTitle}>No assigned deliveries yet</Text>
            <Text style={styles.muted}>Your store assigns deliveries to you. They appear here the moment they are assigned.</Text>
            <TouchableOpacity style={styles.routeCta} testID="rider_route_cta" onPress={() => navigation?.navigate?.('Route')}>
              <RouteIcon size={18} color="#FFFFFF" />
              <Text style={styles.routeCtaText}>Open live route</Text>
              <ChevronRight size={16} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        )}
        <View style={{ height: 110 }} />
      </ScrollView>
    </View>
  );
};



const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' }, content: { paddingBottom: 20 }, flex: { flex: 1 },
  hero: { paddingHorizontal: 18, paddingBottom: 18, borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  brandRow: { marginBottom: 16 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 8 }, eyebrow: { color: '#A7F3D0', fontSize: 9, fontWeight: '600', letterSpacing: 1.3 }, title: { color: '#FFFFFF', fontSize: 27, fontWeight: '600', marginTop: 4 }, subtitle: { color: '#D1FAE5', fontSize: 11, marginTop: 4 },
  iconButton: { width: 43, height: 43, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }, badge: { position: 'absolute', right: -3, top: -3, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#EF1D25', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }, badgeText: { color: '#FFFFFF', fontSize: 8, fontWeight: '600' },
  loading: { minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: 10 }, muted: { color: '#64748B', fontSize: 11, textAlign: 'center', marginTop: 4 }, errorCard: { margin: 18, borderRadius: 18, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }, errorTitle: { color: '#991B1B', fontWeight: '600' }, errorText: { color: '#B91C1C', fontSize: 10, marginTop: 4 },
  activeCard: { margin: 18, marginBottom: 4, borderRadius: 23, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#99F6E4', padding: 16 }, cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 }, activeIcon: { width: 47, height: 47, borderRadius: 16, backgroundColor: '#0F766E', alignItems: 'center', justifyContent: 'center' }, offerIcon: { width: 47, height: 47, borderRadius: 16, backgroundColor: '#CCFBF1', alignItems: 'center', justifyContent: 'center' }, cardEyebrow: { color: '#0F766E', fontSize: 9, fontWeight: '600', letterSpacing: 0.8 }, cardTitle: { color: '#0F172A', fontSize: 17, fontWeight: '600', marginTop: 4 }, cardText: { color: '#64748B', fontSize: 10, marginTop: 4 }, routeRow: { marginTop: 14, gap: 8 }, routeItem: { flexDirection: 'row', alignItems: 'center', gap: 8 }, routeText: { color: '#334155', fontSize: 11, fontWeight: '500' }, openButton: { minHeight: 48, borderRadius: 15, backgroundColor: '#0F766E', marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, openButtonText: { color: '#FFFFFF', fontWeight: '600' },
  sectionHeader: { marginHorizontal: 18, marginTop: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sectionTitle: { color: '#0F172A', fontSize: 18, fontWeight: '600' }, sectionText: { color: '#64748B', fontSize: 10, marginTop: 4 }, emptyCard: { margin: 18, minHeight: 170, borderRadius: 22, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center', padding: 20 }, emptyTitle: { color: '#0F172A', fontSize: 16, fontWeight: '600', marginTop: 10 },
  routeCta: { minHeight: 48, borderRadius: 15, backgroundColor: '#0F766E', marginTop: 16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  routeCtaText: { color: '#FFFFFF', fontWeight: '600' },
});