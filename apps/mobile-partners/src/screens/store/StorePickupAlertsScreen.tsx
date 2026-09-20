import React, { useMemo, useState } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  ChevronRight,
  PackageCheck,
  UserRound,
} from 'lucide-react-native';
import { deliveryOperationsService } from '../../api/deliveryOperationsService';
import { notificationService } from '../../api/notificationService';
import { PARTNER_NOTIFICATION_QUERY_KEY } from '../PartnerNotificationsScreen';
import { partnerNavigationRef } from '../../navigation/partnerNavigationRef';
import { AagamBrand } from '../../components/AagamBrand';
import {
  StorePickupTab,
  orderCustomerName,
  orderPaymentMethod,
  orderUnitCount,
  pickupParcelCount,
  pickupStatusTab,
  riderProfile,
  shortStoreOrderId,
} from '../../domain/storeReferenceUi';

const QUEUE_KEY = ['store', 'pickup-alerts'] as const;

const TABS: Array<{ key: StorePickupTab; label: string }> = [
  { key: 'WAITING', label: 'Waiting' },
  { key: 'EN_ROUTE', label: 'En Route' },
  { key: 'OTHER', label: 'Other' },
];

function errorMessage(error: any) {
  const message = error?.response?.data?.message;
  if (Array.isArray(message)) return message.join(', ');
  return message || error?.message || 'Pickup alerts could not be loaded.';
}

function arrivalTime(job: any) {
  const value = job?.arrivedAt || job?.updatedAt || job?.createdAt;
  if (!value) return 'Recently';
  return new Date(value).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

export const StorePickupAlertsScreen = () => {
  const navigation = useNavigation<any>();
  const [activeTab, setActiveTab] = useState<StorePickupTab>('WAITING');
  const queueQuery = useQuery({
    queryKey: QUEUE_KEY,
    queryFn: deliveryOperationsService.getQueue,
    refetchInterval: 8_000,
    retry: 1,
  });
  const inboxQuery = useQuery({
    queryKey: PARTNER_NOTIFICATION_QUERY_KEY,
    queryFn: () => notificationService.getInbox(1),
    refetchInterval: 15_000,
    retry: 1,
  });
  const jobs = queueQuery.data || [];
  const counts = useMemo(() => ({
    WAITING: jobs.filter((job: any) => pickupStatusTab(job.status) === 'WAITING').length,
    EN_ROUTE: jobs.filter((job: any) => pickupStatusTab(job.status) === 'EN_ROUTE').length,
    OTHER: jobs.filter((job: any) => pickupStatusTab(job.status) === 'OTHER').length,
  }), [jobs]);
  const visibleJobs = useMemo(
    () => jobs.filter((job: any) => pickupStatusTab(job.status) === activeTab),
    [activeTab, jobs],
  );
  const unreadCount = Number(inboxQuery.data?.unreadCount || 0);

  const openNotifications = () => {
    if (partnerNavigationRef.isReady()) {
      partnerNavigationRef.navigate('Notifications');
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#0F766E" />
      <View style={styles.header}>
        <View style={styles.headerGlow} />
        <View style={styles.headerRow}>
          <View style={styles.flex}>
            <Text style={styles.eyebrow}>STORE OPERATIONS</Text>
            <Text style={styles.title}>Pickup alerts</Text>
            <Text style={styles.subtitle}>Rider pickups and delivery operations.</Text>
          </View>
          <TouchableOpacity style={styles.headerIcon} onPress={openNotifications}>
            <Bell size={22} color="#FFFFFF" />
            {unreadCount > 0 ? (
              <View style={styles.notificationBadge}><Text style={styles.notificationBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text></View>
            ) : null}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={(
          <RefreshControl
            refreshing={queueQuery.isRefetching}
            onRefresh={() => void Promise.all([queueQuery.refetch(), inboxQuery.refetch()])}
            tintColor="#0F766E"
          />
        )}
      >
        <View style={styles.alertBanner}>
          <View style={styles.alertBell}><Bell size={28} color="#F16A0B" fill="#F16A0B" /></View>
          <View style={styles.flex}>
            <Text style={styles.alertTitle}>Rider Waiting for Pickup</Text>
            <Text style={styles.alertSubtitle}>{counts.WAITING} rider{counts.WAITING === 1 ? '' : 's'} at store</Text>
          </View>
          <Bell size={29} color="#F16A0B" fill="#F16A0B" />
        </View>

        <View style={styles.tabs}>
          {TABS.map((tab) => {
            const selected = activeTab === tab.key;
            return (
              <TouchableOpacity key={tab.key} style={[styles.tab, selected && styles.tabActive]} onPress={() => setActiveTab(tab.key)}>
                <Text style={[styles.tabText, selected && styles.tabTextActive]}>{tab.label} ({counts[tab.key]})</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {queueQuery.isLoading ? (
          <View style={styles.stateCard}><ActivityIndicator size="large" color="#0F766E" /><Text style={styles.stateText}>Loading pickup alerts…</Text></View>
        ) : queueQuery.isError ? (
          <View style={styles.stateCard}><Text style={styles.stateTitle}>Pickup alerts unavailable</Text><Text style={styles.stateText}>{errorMessage(queueQuery.error)}</Text></View>
        ) : activeTab === 'OTHER' ? (
          <>
            {visibleJobs.map((job: any) => <OtherJobCard key={job.id} job={job} />)}
            <TouchableOpacity style={styles.otherOperationsButton} onPress={() => navigation.navigate('StoreReturnsCod')}>
              <PackageCheck size={20} color="#FFFFFF" />
              <Text style={styles.otherOperationsText}>Open Returns & COD Operations</Text>
              <ChevronRight size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </>
        ) : visibleJobs.length === 0 ? (
          <View style={styles.stateCard}>
            <PackageCheck size={44} color="#A8B0B7" />
            <Text style={styles.stateTitle}>No {activeTab === 'WAITING' ? 'riders waiting' : 'riders en route'}</Text>
            <Text style={styles.stateText}>Pickup jobs will appear here when dispatch updates their status.</Text>
          </View>
        ) : (
          visibleJobs.map((job: any) => (
            <PickupCard
              key={job.id}
              job={job}
              waiting={activeTab === 'WAITING'}
              onPress={() => navigation.navigate('StorePickupVerification', { deliveryJobId: job.id })}
            />
          ))
        )}

        {activeTab === 'WAITING' && counts.WAITING > 0 ? (
          <TouchableOpacity style={styles.viewAllButton} onPress={() => void queueQuery.refetch()}>
            <Text style={styles.viewAllText}>View All Pickup Alerts</Text>
            <ChevronRight size={22} color="#0F766E" />
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </View>
  );
};

function PickupCard({ job, waiting, onPress }: { job: any; waiting: boolean; onPress: () => void }) {
  const order = job?.order || {};
  const rider = riderProfile(job);
  const payment = orderPaymentMethod(order);
  const items = orderUnitCount(order);
  const parcels = pickupParcelCount(job);
  return (
    <View style={styles.pickupCard}>
      <View style={styles.riderRow}>
        <View style={styles.riderAvatar}><UserRound size={28} color="#0F766E" fill="#0F766E" /></View>
        <Text style={styles.riderPrefix}>Rider:</Text>
        <Text style={styles.riderName} numberOfLines={1}>{rider.name}</Text>
        <Text style={styles.time}>{arrivalTime(job)}</Text>
      </View>
      <View style={styles.divider} />
      <InfoRow label="Order ID" value={`#ORD-${shortStoreOrderId(order.id || job.orderId)}`} strong />
      <InfoRow label="Customer" value={orderCustomerName(order)} strong />
      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>Payment</Text>
        <View style={[styles.paymentPill, payment === 'COD' ? styles.codPill : styles.prepaidPill]}>
          <Text style={[styles.paymentText, payment === 'COD' ? styles.codText : styles.prepaidText]}>{payment}</Text>
        </View>
      </View>
      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>Items</Text>
        <Text style={styles.infoValueStrong}>{items}</Text>
        <Text style={styles.middleDot}>•</Text>
        <Text style={styles.infoLabel}>Parcels</Text>
        <Text style={styles.infoValueStrong}>{parcels}</Text>
      </View>
      <TouchableOpacity
        testID={`store_pickup_alert_${job.id}`}
        style={[styles.arrivedButton, !waiting && styles.enRouteButton]}
        onPress={onPress}
      >
        <Text style={styles.arrivedButtonText}>{waiting ? 'Rider Arrived' : 'View Pickup'}</Text>
      </TouchableOpacity>
    </View>
  );
}

function OtherJobCard({ job }: { job: any }) {
  return (
    <View style={styles.otherCard}>
      <Text style={styles.otherOrder}>#ORD-{shortStoreOrderId(job?.order?.id || job?.orderId)}</Text>
      <Text style={styles.otherStatus}>{String(job?.status || 'OPERATION').replaceAll('_', ' ')}</Text>
      <Text style={styles.otherCustomer}>{orderCustomerName(job?.order)}</Text>
    </View>
  );
}

function InfoRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={strong ? styles.infoValueStrong : styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  flex: { flex: 1 },
  header: { backgroundColor: '#0F766E', paddingHorizontal: 20, paddingBottom: 20, overflow: 'hidden', position: 'relative' },
  headerGlow: { position: 'absolute', top: -60, right: -60, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.08)' },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', paddingTop: 56 },
  eyebrow: { color: '#A7F3D0', fontSize: 9, fontWeight: '600', letterSpacing: 1 },
  title: { color: '#FFFFFF', fontSize: 24, fontWeight: '600', marginTop: 2 },
  subtitle: { color: '#D1FAE5', fontSize: 11, marginTop: 4 },
  headerIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  notificationBadge: { position: 'absolute', right: -4, top: -4, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#EF1D25', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  notificationBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '600' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 18, paddingBottom: 38 },
  alertBanner: { minHeight: 92, borderRadius: 16, borderWidth: 1, borderColor: '#FFD4B4', backgroundColor: '#FFF5EC', flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  alertBell: { width: 53, height: 53, borderRadius: 16, backgroundColor: '#FFE8D5', alignItems: 'center', justifyContent: 'center' },
  alertTitle: { color: '#D85B04', fontSize: 18, fontWeight: '600' },
  alertSubtitle: { color: '#E26A18', fontSize: 15, marginTop: 4 },
  tabs: { flexDirection: 'row', gap: 12, marginTop: 16, marginBottom: 16 },
  tab: { flex: 1, height: 50, borderRadius: 999, borderWidth: 1, borderColor: '#E0E3E2', backgroundColor: '#F7F8F7', alignItems: 'center', justifyContent: 'center' },
  tabActive: { backgroundColor: '#0F766E', borderColor: '#0F766E' },
  tabText: { color: '#555D66', fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#FFFFFF' },
  pickupCard: { borderRadius: 20, borderWidth: 1, borderColor: '#E0E3E2', backgroundColor: '#FFFFFF', padding: 16, marginBottom: 12 },
  riderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  riderAvatar: { width: 48, height: 48, borderRadius: 999, backgroundColor: '#E9F9EE', alignItems: 'center', justifyContent: 'center' },
  riderPrefix: { color: '#68707A', fontSize: 14, marginLeft: 4 },
  riderName: { flex: 1, color: '#151820', fontSize: 16, fontWeight: '600' },
  time: { color: '#616A74', fontSize: 13 },
  divider: { height: 1, backgroundColor: '#ECEEED', marginVertical: 12 },
  infoRow: { minHeight: 39, flexDirection: 'row', alignItems: 'center' },
  infoLabel: { flex: 1, color: '#626A74', fontSize: 14 },
  infoValue: { color: '#222831', fontSize: 14 },
  infoValueStrong: { color: '#151820', fontSize: 14, fontWeight: '600' },
  middleDot: { color: '#67717A', marginHorizontal: 12 },
  paymentPill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  prepaidPill: { backgroundColor: '#EAF9EE' },
  codPill: { backgroundColor: '#FFF1E5' },
  paymentText: { fontSize: 12, fontWeight: '600' },
  prepaidText: { color: '#087C35' },
  codText: { color: '#BE5B09' },
  arrivedButton: { height: 51, borderRadius: 16, backgroundColor: '#0F766E', alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  enRouteButton: { backgroundColor: '#356AC3' },
  arrivedButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  viewAllButton: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  viewAllText: { color: '#0F766E', fontSize: 16, fontWeight: '600' },
  otherOperationsButton: { minHeight: 56, borderRadius: 12, backgroundColor: '#0F766E', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12, marginTop: 6 },
  otherOperationsText: { flex: 1, color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  otherCard: { borderRadius: 16, borderWidth: 1, borderColor: '#E1E4E3', backgroundColor: '#FFFFFF', padding: 16, marginBottom: 12 },
  otherOrder: { color: '#151820', fontSize: 14, fontWeight: '600' },
  otherStatus: { color: '#B66B14', fontSize: 11, fontWeight: '600', marginTop: 4 },
  otherCustomer: { color: '#68707A', fontSize: 12, marginTop: 4 },
  stateCard: { minHeight: 300, alignItems: 'center', justifyContent: 'center', padding: 28 },
  stateTitle: { color: '#171A1D', fontSize: 18, fontWeight: '600', marginTop: 12, textAlign: 'center' },
  stateText: { color: '#6D747B', fontSize: 13, marginTop: 8, textAlign: 'center', lineHeight: 20 },
});
