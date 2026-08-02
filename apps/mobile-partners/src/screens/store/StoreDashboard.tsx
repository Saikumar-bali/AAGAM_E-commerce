import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@aagam/mobile-shared';
import {
  Bell,
  Box,
  IndianRupee,
  Menu,
  ShoppingCart,
  Store,
} from 'lucide-react-native';
import { storeService } from '../../api/storeService';
import { notificationService } from '../../api/notificationService';
import { PARTNER_NOTIFICATION_QUERY_KEY } from '../PartnerNotificationsScreen';
import { storeAssignmentStatus } from '../../domain/storeReferenceUi';

const { width } = Dimensions.get('window');

type StoreSummary = {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  status?: string | null;
  isActive?: boolean | null;
  active?: boolean | null;
  orderCount?: number | null;
  inventoryCount?: number | null;
  totalRevenue?: number | null;
};

function locationLabel(store: StoreSummary) {
  if (store.address) return store.address;
  return [store.city, store.state].filter(Boolean).join(', ') || 'Address unavailable';
}

function statusTone(status: string) {
  if (status === 'ACTIVE') return { color: '#138C37', backgroundColor: '#EAF9EC' };
  if (status === 'PENDING') return { color: '#ED7D16', backgroundColor: '#FFF3E7' };
  return { color: '#087B5A', backgroundColor: '#EAF8F2' };
}

export const StoreDashboard = ({ navigation }: { navigation?: any }) => {
  const user = useAuthStore((state) => state.user);
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

  const stores: StoreSummary[] = Array.isArray(storesQuery.data) ? storesQuery.data : [];
  const unreadCount = Number(inboxQuery.data?.unreadCount || 0);
  const totals = useMemo(() => ({
    stores: stores.length,
    orders: stores.reduce((sum, store) => sum + Number(store.orderCount || 0), 0),
    inventory: stores.reduce((sum, store) => sum + Number(store.inventoryCount || 0), 0),
    revenue: stores.reduce((sum, store) => sum + Number(store.totalRevenue || 0), 0),
  }), [stores]);
  const headline = stores[0]?.name || user?.name || 'Aagaam Store';

  const openNotifications = () => {
    const parent = navigation?.getParent?.();
    const root = parent?.getParent?.() || parent || navigation;
    root?.navigate?.('Notifications');
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#057A55" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={(
          <RefreshControl
            refreshing={storesQuery.isRefetching || inboxQuery.isRefetching}
            onRefresh={() => void Promise.all([storesQuery.refetch(), inboxQuery.refetch()])}
            tintColor="#FFFFFF"
          />
        )}
      >
        <View style={styles.hero}>
          <View style={styles.heroShape} />
          <View style={styles.topRow}>
            <TouchableOpacity
              accessibilityLabel="Open more options"
              style={styles.headerIcon}
              onPress={() => navigation?.navigate?.('Settings')}
            >
              <Menu size={34} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity
              testID="store_dashboard_notifications"
              accessibilityLabel="Open notifications"
              style={styles.headerIcon}
              onPress={openNotifications}
            >
              <Bell size={32} color="#FFFFFF" />
              {unreadCount > 0 ? (
                <View style={styles.notificationBadge}>
                  <Text style={styles.notificationBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          </View>
          <Text style={styles.welcome}>Welcome back,</Text>
          <Text style={styles.storeName} numberOfLines={1}>{headline} 👋</Text>
          <Text style={styles.heroSubtitle}>Have a great day ahead!</Text>
        </View>

        <View style={styles.bodySheet}>
          {storesQuery.isLoading ? (
            <View style={styles.stateCard}>
              <ActivityIndicator size="large" color="#078B61" />
              <Text style={styles.stateText}>Loading your stores…</Text>
            </View>
          ) : storesQuery.isError ? (
            <View style={styles.stateCard}>
              <Text style={styles.stateTitle}>Dashboard unavailable</Text>
              <Text style={styles.stateText}>Pull down to retry loading assigned stores.</Text>
            </View>
          ) : (
            <>
              <View style={styles.statsGrid}>
                <DashboardStat icon={Store} title="Stores" value={String(totals.stores)} subtitle="Assigned" tone="#087B5A" iconBackground="#E8F8EE" />
                <DashboardStat icon={ShoppingCart} title="Orders" value={String(totals.orders)} subtitle="Current" tone="#1557A4" iconBackground="#E8F1FD" />
                <DashboardStat icon={IndianRupee} title="Revenue" value={`₹ ${totals.revenue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`} subtitle="Recorded" tone="#087B5A" iconBackground="#E8F8EE" />
                <DashboardStat icon={Box} title="Products" value={String(totals.inventory)} subtitle="In Inventory" tone="#5A2DB7" iconBackground="#F0EAFE" />
              </View>

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Assigned Stores</Text>
                <TouchableOpacity onPress={() => navigation?.navigate?.('Orders')}>
                  <Text style={styles.viewAll}>View All</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.storeList}>
                {stores.map((store, index) => {
                  const status = storeAssignmentStatus(store);
                  const tone = statusTone(status);
                  return (
                    <TouchableOpacity
                      testID={`store_dashboard_card_${store.id}`}
                      key={store.id}
                      activeOpacity={0.75}
                      style={[styles.storeRow, index < stores.length - 1 && styles.storeRowBorder]}
                      onPress={() => navigation?.navigate?.('Orders', {
                        screen: 'OrderQueue',
                        params: { storeId: store.id },
                      })}
                    >
                      <View style={styles.storeIcon}><Store size={23} color="#087B5A" /></View>
                      <View style={styles.storeCopy}>
                        <Text style={styles.storeRowName} numberOfLines={1}>{store.name || 'Store'}</Text>
                        <Text style={styles.storeAddress} numberOfLines={1}>{locationLabel(store)}</Text>
                      </View>
                      <View style={[styles.statusPill, { backgroundColor: tone.backgroundColor }]}>
                        <Text style={[styles.statusText, { color: tone.color }]}>{status}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
                {!stores.length ? (
                  <View style={styles.emptyAssigned}>
                    <Store size={40} color="#A8B0B7" />
                    <Text style={styles.stateTitle}>No stores assigned</Text>
                    <Text style={styles.stateText}>Ask an administrator to assign this account to a store.</Text>
                  </View>
                ) : null}
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

function DashboardStat({
  icon: Icon,
  title,
  value,
  subtitle,
  tone,
  iconBackground,
}: {
  icon: any;
  title: string;
  value: string;
  subtitle: string;
  tone: string;
  iconBackground: string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={styles.statHeading}>
        <View style={[styles.statIcon, { backgroundColor: iconBackground }]}>
          <Icon size={23} color={tone} />
        </View>
        <Text style={[styles.statTitle, { color: tone }]}>{title}</Text>
      </View>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={styles.statSubtitle}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F8F7' },
  scroll: { flex: 1 },
  content: { paddingBottom: 106 },
  hero: {
    minHeight: 292,
    backgroundColor: '#057A55',
    paddingTop: 48,
    paddingHorizontal: 20,
    overflow: 'hidden',
  },
  heroShape: {
    position: 'absolute',
    width: 250,
    height: 250,
    borderRadius: 125,
    right: -90,
    top: -95,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  notificationBadge: {
    position: 'absolute',
    right: -2,
    top: -2,
    minWidth: 23,
    height: 23,
    borderRadius: 12,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F02525',
    borderWidth: 2,
    borderColor: '#057A55',
  },
  notificationBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  welcome: { color: '#E9FFF6', fontSize: 16, marginTop: 18 },
  storeName: { color: '#FFFFFF', fontSize: 32, fontWeight: '900', marginTop: 4 },
  heroSubtitle: { color: '#F1FFF9', fontSize: 17, marginTop: 7 },
  bodySheet: {
    minHeight: 520,
    marginTop: -6,
    paddingTop: 24,
    paddingHorizontal: 18,
    backgroundColor: '#F7F8F7',
    borderTopLeftRadius: 34,
    borderTopRightRadius: 34,
  },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  statCard: {
    width: (width - 50) / 2,
    minHeight: 164,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E3E2',
    padding: 16,
    marginBottom: 12,
    shadowColor: '#10241D',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statIcon: { width: 43, height: 43, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  statTitle: { fontSize: 15, fontWeight: '900' },
  statValue: { color: '#10131A', fontSize: 29, fontWeight: '900', marginTop: 23 },
  statSubtitle: { color: '#626871', fontSize: 13, marginTop: 5 },
  sectionHeader: { marginTop: 15, marginBottom: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { color: '#111417', fontSize: 19, fontWeight: '900' },
  viewAll: { color: '#078B61', fontSize: 14, fontWeight: '800' },
  storeList: { borderRadius: 17, borderWidth: 1, borderColor: '#E1E4E3', backgroundColor: '#FFFFFF', overflow: 'hidden' },
  storeRow: { minHeight: 78, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13 },
  storeRowBorder: { borderBottomWidth: 1, borderBottomColor: '#ECEEED' },
  storeIcon: { width: 45, height: 45, borderRadius: 13, backgroundColor: '#E8F8EE', alignItems: 'center', justifyContent: 'center' },
  storeCopy: { flex: 1, marginLeft: 12, marginRight: 8 },
  storeRowName: { color: '#15181C', fontSize: 14, fontWeight: '900' },
  storeAddress: { color: '#697078', fontSize: 11, marginTop: 4 },
  statusPill: { borderRadius: 10, paddingHorizontal: 11, paddingVertical: 7 },
  statusText: { fontSize: 10, fontWeight: '900' },
  stateCard: { minHeight: 300, alignItems: 'center', justifyContent: 'center', padding: 24 },
  stateTitle: { color: '#161A1D', fontSize: 18, fontWeight: '900', marginTop: 12, textAlign: 'center' },
  stateText: { color: '#6D747B', fontSize: 13, textAlign: 'center', marginTop: 7 },
  emptyAssigned: { minHeight: 220, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
