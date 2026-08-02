import messaging from '@react-native-firebase/messaging';
import React, { useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@aagam/mobile-shared';
import { Bell, ChevronRight, Package, PackageCheck, ShoppingBag, Store, TrendingUp } from 'lucide-react-native';
import { storeService } from '../../api/storeService';
import Toast from 'react-native-toast-message';
import { deliveryOperationsService, STORE_DELIVERY_OPERATIONS_QUERY_KEY } from '../../api/deliveryOperationsService';
import { notificationService } from '../../api/notificationService';
import { PARTNER_NOTIFICATION_QUERY_KEY } from '../PartnerNotificationsScreen';

const { width } = Dimensions.get('window');

function navigateToStorePickup(navigation: any) {
  const parent = navigation?.getParent?.();
  if (parent?.navigate) {
    parent.navigate('StorePickupVerification');
    return;
  }
  navigation?.navigate?.('StorePickupVerification');
}

type StoreSummary = {
  id: string;
  name: string;
  address?: string;
  orderCount?: number;
  inventoryCount?: number;
  totalRevenue?: number;
};

export const StoreDashboard = ({ navigation }: { navigation?: any }) => {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const storesQuery = useQuery({
    queryKey: ['store-owner-dashboard-stores'],
    queryFn: storeService.getStoreDashboardSummaries,
    retry: 1,
  });
  const inboxQuery = useQuery({
    queryKey: PARTNER_NOTIFICATION_QUERY_KEY,
    queryFn: () => notificationService.getInbox(30),
    refetchInterval: 15_000,
    retry: 1,
  });
  const pickupQueueQuery = useQuery({
    queryKey: STORE_DELIVERY_OPERATIONS_QUERY_KEY,
    queryFn: deliveryOperationsService.getQueue,
    refetchInterval: 15_000,
    retry: 1,
  });
  const pickupJobs = useMemo(
    () => (Array.isArray(pickupQueueQuery.data) ? pickupQueueQuery.data : [])
      .filter((job: any) => job.status === 'RIDER_AT_STORE'),
    [pickupQueueQuery.data],
  );

  useEffect(() => {
    let alive = true;
    let unsubscribeForeground: (() => void) | undefined;
    let unsubscribeOpened: (() => void) | undefined;

    const refreshOperationalQueries = () => {
      void queryClient.invalidateQueries({ queryKey: STORE_DELIVERY_OPERATIONS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['store', 'pickup-verification'] });
      void queryClient.invalidateQueries({ queryKey: ['partner-store-orders'] });
      void queryClient.invalidateQueries({ queryKey: PARTNER_NOTIFICATION_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['store-owner-dashboard-stores'] });
    };

    const handleMessage = (message: any, navigate: boolean) => {
      const eventType = String(message?.data?.eventType || '');
      refreshOperationalQueries();
      if (eventType !== 'RIDER_AT_STORE') return;
      Toast.show({
        type: 'info',
        text1: message?.notification?.title || 'Rider arrived at store',
        text2: message?.notification?.body || 'Verify the parcel handoff in Store Pickup.',
        visibilityTime: 6000,
      });
      if (navigate && alive) navigateToStorePickup(navigation);
    };

    try {
      unsubscribeForeground = messaging().onMessage(async (message) => handleMessage(message, false));
      unsubscribeOpened = messaging().onNotificationOpenedApp((message) => handleMessage(message, true));
      void messaging().getInitialNotification().then((message) => {
        if (message && alive) setTimeout(() => handleMessage(message, true), 350);
      }).catch(() => undefined);
    } catch (_error) {
      // Firebase is unavailable in local development builds without native configuration.
    }

    return () => {
      alive = false;
      unsubscribeForeground?.();
      unsubscribeOpened?.();
    };
  }, [navigation, queryClient]);

  const stores: StoreSummary[] = Array.isArray(storesQuery.data) ? storesQuery.data : [];
  const unreadCount = Number(inboxQuery.data?.unreadCount || 0);

  const totals = useMemo(() => ({
    stores: stores.length,
    orders: stores.reduce((sum, store) => sum + Number(store.orderCount || 0), 0),
    inventory: stores.reduce((sum, store) => sum + Number(store.inventoryCount || 0), 0),
    revenue: stores.reduce((sum, store) => sum + Number(store.totalRevenue || 0), 0),
  }), [stores]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={storesQuery.isRefetching || pickupQueueQuery.isRefetching}
          onRefresh={() => void Promise.all([storesQuery.refetch(), inboxQuery.refetch(), pickupQueueQuery.refetch()])}
        />
      }
    >
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>Welcome back,</Text>
            <Text style={styles.managerName}>{user?.name || 'Store Manager'}</Text>
          </View>
          <TouchableOpacity testID="store_dashboard_notifications" style={styles.notificationButton} onPress={() => navigation?.getParent?.()?.navigate?.('Notifications')}>
            <Bell size={21} color="#0F172A" />
            {unreadCount > 0 ? <View style={styles.notificationBadge}><Text style={styles.notificationBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text></View> : null}
          </TouchableOpacity>
        </View>
        <Text style={styles.headerCopy}>Live operational totals from your assigned stores.</Text>
      </View>

      {pickupJobs.length > 0 ? (
        <TouchableOpacity
          testID="store_dashboard_pickup_banner"
          style={styles.pickupBanner}
          activeOpacity={0.88}
          onPress={() => navigateToStorePickup(navigation)}
        >
          <PackageCheck size={23} color="#FFFFFF" />
          <View style={{ flex: 1 }}>
            <Text style={styles.pickupBannerTitle}>
              {pickupJobs.length} rider{pickupJobs.length > 1 ? 's' : ''} waiting for pickup
            </Text>
            <Text style={styles.pickupBannerText}>Tap to verify parcel handoff</Text>
          </View>
          <ChevronRight size={21} color="#CCFBF1" />
        </TouchableOpacity>
      ) : null}

      {storesQuery.isLoading ? (
        <View style={styles.loading}><ActivityIndicator size="large" color="#0F766E" /></View>
      ) : storesQuery.isError ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Could not load store dashboard</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => void storesQuery.refetch()}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.statsGrid}>
            <StatCard title="Stores" value={totals.stores} icon={Store} color="#0F766E" />
            <StatCard title="Orders" value={totals.orders} icon={ShoppingBag} color="#10B981" />
            <StatCard title="Revenue" value={`₹${totals.revenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={TrendingUp} color="#F59E0B" />
            <StatCard title="Products" value={totals.inventory} icon={Package} color="#EF4444" />
          </View>

          <Text style={styles.sectionTitle}>Your stores</Text>
          {stores.map((store) => (
            <TouchableOpacity
              testID={`store_dashboard_card_${store.id}`}
              key={store.id}
              style={styles.storeCard}
              activeOpacity={0.75}
              onPress={() => navigation?.navigate?.('Orders', { screen: 'OrderQueue', params: { storeId: store.id } })}
            >
              <View style={styles.storeAvatar}>
                <Text style={styles.storeAvatarText}>{store.name?.[0]?.toUpperCase() || 'S'}</Text>
              </View>
              <View style={styles.storeDetails}>
                <Text style={styles.storeCardName}>{store.name}</Text>
                <Text style={styles.storeCardAddress} numberOfLines={2}>{store.address || 'Address unavailable'}</Text>
                <Text style={styles.storeCardOrders}>{Number(store.orderCount || 0)} order(s) · {Number(store.inventoryCount || 0)} product(s)</Text>
              </View>
              <ChevronRight size={20} color="#64748B" />
            </TouchableOpacity>
          ))}

          {!stores.length ? (
            <View style={styles.emptyState}>
              <Package size={48} color="#94A3B8" />
              <Text style={styles.emptyText}>No stores assigned</Text>
              <Text style={styles.emptySubtext}>Contact an administrator to assign a store to this account.</Text>
            </View>
          ) : null}
        </>
      )}
    </ScrollView>
  );
};

function StatCard({ title, value, icon: Icon, color }: { title: string; value: string | number; icon: any; color: string }) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <Icon size={23} color={color} />
      <Text style={styles.statTitle}>{title}</Text>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { paddingBottom: 120 },
  header: { paddingHorizontal: 24, paddingTop: 58, paddingBottom: 24, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  greeting: { fontSize: 14, color: '#64748B' },
  managerName: { fontSize: 25, fontWeight: '900', color: '#1E293B', marginTop: 3 },
  headerCopy: { color: '#64748B', marginTop: 6, fontSize: 12 },
  notificationButton: { width: 46, height: 46, borderRadius: 15, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  notificationBadge: { position: 'absolute', right: -4, top: -4, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: '#FFFFFF' },
  notificationBadgeText: { color: '#FFFFFF', fontSize: 8, fontWeight: '900' },
  pickupBanner: {
    marginHorizontal: 24,
    marginTop: 18,
    borderRadius: 20,
    backgroundColor: '#0F766E',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 18,
    elevation: 4,
    shadowColor: '#0F766E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  pickupBannerTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  pickupBannerText: { color: '#CCFBF1', fontSize: 11, fontWeight: '800', marginTop: 3 },
  loading: { minHeight: 300, alignItems: 'center', justifyContent: 'center' },
  statsGrid: { padding: 24, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  statCard: { width: (width - 60) / 2, backgroundColor: '#FFFFFF', padding: 16, borderRadius: 20, marginBottom: 12, borderLeftWidth: 4, elevation: 2 },
  statTitle: { fontSize: 11, color: '#64748B', marginTop: 10, textTransform: 'uppercase', fontWeight: '800' },
  statValue: { fontSize: 18, fontWeight: '900', color: '#1E293B', marginTop: 4 },
  sectionTitle: { paddingHorizontal: 24, fontSize: 18, fontWeight: '900', color: '#1E293B', marginBottom: 14 },
  storeCard: { marginHorizontal: 24, backgroundColor: '#FFFFFF', padding: 16, borderRadius: 20, flexDirection: 'row', alignItems: 'center', marginBottom: 12, elevation: 2 },
  storeAvatar: { width: 48, height: 48, borderRadius: 14, backgroundColor: '#CCFBF1', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  storeAvatarText: { fontSize: 20, fontWeight: '900', color: '#0F766E' },
  storeDetails: { flex: 1 },
  storeCardName: { fontSize: 16, fontWeight: '800', color: '#1E293B' },
  storeCardAddress: { fontSize: 12, color: '#64748B', marginTop: 3 },
  storeCardOrders: { fontSize: 11, color: '#0F766E', fontWeight: '800', marginTop: 6 },
  emptyState: { alignItems: 'center', padding: 48, marginHorizontal: 20, marginTop: 20, backgroundColor: '#FFFFFF', borderRadius: 22 },
  emptyText: { fontSize: 17, fontWeight: '800', color: '#1E293B', marginTop: 12, textAlign: 'center' },
  emptySubtext: { fontSize: 13, color: '#64748B', textAlign: 'center', marginTop: 7 },
  retryButton: { backgroundColor: '#0F766E', borderRadius: 14, paddingHorizontal: 20, paddingVertical: 12, marginTop: 16 },
  retryText: { color: '#FFFFFF', fontWeight: '900' },
});
