import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@aagam/mobile-shared';
import {
  Bell,
  Box,
  ChevronRight,
  IndianRupee,
  Route,
  Search,
  ShoppingCart,
  Store,
  TrendingUp,
} from 'lucide-react-native';
import { storeService } from '../../api/storeService';
import { notificationService } from '../../api/notificationService';
import { PARTNER_NOTIFICATION_QUERY_KEY } from '../PartnerNotificationsScreen';
import { storeAssignmentStatus } from '../../domain/storeReferenceUi';
import { AagamBrand } from '../../components/AagamBrand';
import { GradientSurface, GradientPreset } from '../../components/GradientSurface';
import { partnerNavigationRef } from '../../navigation/partnerNavigationRef';
import { palette, radius, spacing, typography } from '../../design/tokens';

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
  if (status === 'PENDING') return { color: '#B45309', backgroundColor: '#FFF3E7' };
  return { color: '#0F766E', backgroundColor: '#EAF8F2' };
}

function greeting(hour: number) {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function money(value: number) {
  return `₹ ${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export const StoreDashboard = ({ navigation }: { navigation?: any }) => {
  const user = useAuthStore((state) => state.user);
  const [searchQuery, setSearchQuery] = useState('');
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

  const stores = useMemo<StoreSummary[]>(
    () => (Array.isArray(storesQuery.data) ? storesQuery.data : []),
    [storesQuery.data],
  );
  const filteredStores = useMemo(() => {
    if (!searchQuery.trim()) return stores;
    const q = searchQuery.toLowerCase();
    return stores.filter(
      (s) =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.address || '').toLowerCase().includes(q) ||
        (s.city || '').toLowerCase().includes(q),
    );
  }, [stores, searchQuery]);

  const unreadCount = Number(inboxQuery.data?.unreadCount || 0);
  const totals = useMemo(
    () => ({
      stores: stores.length,
      orders: stores.reduce((sum, store) => sum + Number(store.orderCount || 0), 0),
      inventory: stores.reduce((sum, store) => sum + Number(store.inventoryCount || 0), 0),
      revenue: stores.reduce((sum, store) => sum + Number(store.totalRevenue || 0), 0),
    }),
    [stores],
  );
  const headline = stores[0]?.name || user?.name || 'Aagaam Store';
  const firstNames = String(user?.name || '').split(' ')[0];

  // Real per-store revenue, tallest-first, drives the hero sparkline so the
  // chart always reflects assigned stores instead of a synthetic series.
  const revenueByStore = useMemo(() => {
    const max = Math.max(1, ...stores.map((s) => Number(s.totalRevenue || 0)));
    return stores
      .map((store) => ({
        id: store.id,
        name: store.name || 'Store',
        ratio: Math.max(0.06, Number(store.totalRevenue || 0) / max),
      }))
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 6);
  }, [stores]);

  const openNotifications = () => {
    if (partnerNavigationRef.isReady()) {
      partnerNavigationRef.navigate('Notifications');
    }
  };

  const refresh = () => void Promise.all([storesQuery.refetch(), inboxQuery.refetch()]);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={palette.teal900} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={storesQuery.isRefetching || inboxQuery.isRefetching} onRefresh={refresh} tintColor="#FFFFFF" />}
      >
        <GradientSurface preset="hero" style={styles.hero}>
          <View style={styles.heroGlowA} />
          <View style={styles.heroGlowB} />

          <View style={styles.topRow}>
            <AagamBrand compact caption="Fast Quality and Trust" inverse />
            <TouchableOpacity
              testID="store_dashboard_notifications"
              accessibilityLabel="Open notifications"
              style={styles.headerIcon}
              onPress={openNotifications}
            >
              <Bell size={22} color="#FFFFFF" />
              {unreadCount > 0 ? (
                <View style={styles.notificationBadge}>
                  <Text style={styles.notificationBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          </View>

          <Text style={styles.welcome}>
            {greeting(new Date().getHours())}{firstNames ? `, ${firstNames}` : ''}
          </Text>
          <Text style={styles.storeName} numberOfLines={1}>{headline}</Text>

          <View style={styles.heroPanel}>
            <View style={styles.heroPanelTop}>
              <View style={styles.flex}>
                <Text style={styles.heroPanelLabel}>RECORDED REVENUE</Text>
                <Text style={styles.heroPanelValue}>{money(totals.revenue)}</Text>
              </View>
              <View style={styles.heroPanelPill}>
                <TrendingUp size={13} color="#BBF7E4" />
                <Text style={styles.heroPanelPillText}>{totals.orders} orders</Text>
              </View>
            </View>
            <View style={styles.spark}>
              {revenueByStore.map((bar, index) => (
                <View key={bar.id} style={styles.sparkCol}>
                  <View
                    style={[
                      styles.sparkBar,
                      { height: `${Math.round(bar.ratio * 100)}%` },
                      index === 0 && styles.sparkBarLead,
                    ]}
                  />
                </View>
              ))}
              {!revenueByStore.length ? <View style={styles.sparkEmpty} /> : null}
            </View>
          </View>
        </GradientSurface>

        <View style={styles.bodySheet}>
          {storesQuery.isLoading ? (
            <View style={styles.stateCard}>
              <ActivityIndicator size="large" color={palette.teal700} />
              <Text style={styles.stateText}>Loading your stores…</Text>
            </View>
          ) : storesQuery.isError ? (
            <View style={styles.stateCard}>
              <Text style={styles.stateTitle}>Dashboard unavailable</Text>
              <Text style={styles.stateText}>Pull down to retry loading assigned stores.</Text>
            </View>
          ) : (
            <>
              <View style={styles.searchBar}>
                <Search size={18} color={palette.slate400} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search stores, orders…"
                  placeholderTextColor={palette.slate400}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')} accessibilityLabel="Clear search">
                    <Text style={styles.searchClear}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.statsGrid}>
                <View style={styles.statsRow}>
                  <DashboardStat
                    icon={ShoppingCart}
                    preset="azure"
                    title="Orders"
                    value={String(totals.orders)}
                    subtitle="All time"
                    testID="store_dashboard_stat_orders"
                  />
                  <DashboardStat
                    icon={IndianRupee}
                    preset="emerald"
                    title="Revenue"
                    value={money(totals.revenue)}
                    subtitle="Recorded"
                    testID="store_dashboard_stat_revenue"
                  />
                </View>
                <View style={styles.statsRow}>
                  <DashboardStat
                    icon={Store}
                    preset="violet"
                    title="Stores"
                    value={String(totals.stores)}
                    subtitle="Assigned"
                    testID="store_dashboard_stat_stores"
                  />
                  <DashboardStat
                    icon={Box}
                    preset="amber"
                    title="Products"
                    value={String(totals.inventory)}
                    subtitle="In Inventory"
                    testID="store_dashboard_stat_products"
                  />
                </View>
              </View>

              <Text style={styles.sectionEyebrow}>TODAY</Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Open subscription delivery runs"
                activeOpacity={0.85}
                style={styles.subscriptionRunCard}
                onPress={() => navigation?.getParent?.()?.navigate?.('StoreSubscriptionOperations')}
              >
                <GradientSurface preset="emerald" radius={radius.lg} style={styles.subscriptionRunSurface}>
                  <View style={styles.subscriptionRunIcon}><Route size={24} color="#0B3B36" /></View>
                  <View style={styles.subscriptionRunCopy}>
                    <Text style={styles.subscriptionRunEyebrow}>SUBSCRIPTION OPERATIONS</Text>
                    <Text style={styles.subscriptionRunTitle}>Delivery runs &amp; cash control</Text>
                    <Text style={styles.subscriptionRunText}>Forecast demand, pack bags, and settle cash.</Text>
                  </View>
                  <ChevronRight size={20} color="#0B3B36" />
                </GradientSurface>
              </TouchableOpacity>

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Assigned Stores</Text>
                <TouchableOpacity onPress={() => navigation?.navigate?.('Orders')}>
                  <Text style={styles.viewAll}>View All</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.storeList}>
                {filteredStores.map((store, index) => {
                  const status = storeAssignmentStatus(store);
                  const tone = statusTone(status);
                  return (
                    <TouchableOpacity
                      testID={`store_dashboard_card_${store.id}`}
                      key={store.id}
                      activeOpacity={0.75}
                      style={[styles.storeRow, index < filteredStores.length - 1 && styles.storeRowBorder]}
                      onPress={() =>
                        navigation?.navigate?.('Orders', {
                          screen: 'OrderQueue',
                          params: { storeId: store.id },
                        })
                      }
                    >
                      <View style={styles.storeIcon}><Store size={22} color={palette.teal700} /></View>
                      <View style={styles.storeCopy}>
                        <Text style={styles.storeRowName} numberOfLines={1}>{store.name || 'Store'}</Text>
                        <Text style={styles.storeAddress} numberOfLines={1}>{locationLabel(store)}</Text>
                      </View>
                      <View style={[styles.statusPill, { backgroundColor: tone.backgroundColor }]}>
                        <Text style={[styles.statusText, { color: tone.color }]}>{status}</Text>
                      </View>
                      <ChevronRight size={18} color={palette.slate300} />
                    </TouchableOpacity>
                  );
                })}
                {!filteredStores.length && stores.length > 0 ? (
                  <View style={styles.emptyAssigned}>
                    <Search size={40} color="#A8B0B7" />
                    <Text style={styles.stateTitle}>No stores match "{searchQuery}"</Text>
                    <Text style={styles.stateText}>Try a different search term.</Text>
                  </View>
                ) : !stores.length ? (
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
  preset,
  title,
  value,
  subtitle,
  testID,
}: {
  icon: any;
  preset: GradientPreset;
  title: string;
  value: string;
  subtitle: string;
  testID?: string;
}) {
  return (
    <View style={styles.statCard} testID={testID}>
      <GradientSurface preset={preset} radius={radius.md} style={styles.statIcon}>
        <Icon size={20} color="#FFFFFF" />
      </GradientSurface>
      <View style={styles.statCopy}>
        <Text style={styles.statTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
        <Text style={styles.statSubtitle} numberOfLines={1}>{subtitle}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  screen: { flex: 1, backgroundColor: palette.slate050 },
  scroll: { flex: 1 },
  content: { paddingBottom: 106 },
  hero: {
    paddingTop: 48,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  heroGlowA: {
    position: 'absolute',
    width: 250,
    height: 250,
    borderRadius: 125,
    right: -90,
    top: -110,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  heroGlowB: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    left: -80,
    top: 40,
    backgroundColor: 'rgba(16,168,110,0.28)',
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  notificationBadge: {
    position: 'absolute',
    right: -3,
    top: -3,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF1D25',
    borderWidth: 2,
    borderColor: '#0B3B36',
  },
  notificationBadgeText: { color: palette.white, fontSize: 9, fontWeight: '700' },
  welcome: { color: '#A7F3D0', fontSize: 13, fontWeight: '600', marginTop: spacing.lg, letterSpacing: 0.2 },
  storeName: { color: palette.white, fontSize: 30, fontWeight: '700', marginTop: 2, letterSpacing: -0.5 },
  heroPanel: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  heroPanelTop: { flexDirection: 'row', alignItems: 'center' },
  heroPanelLabel: { color: '#BBF7E4', fontSize: 10, fontWeight: '700', letterSpacing: 1.4 },
  heroPanelValue: { color: palette.white, fontSize: 30, fontWeight: '700', marginTop: 2, letterSpacing: -0.6 },
  heroPanelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  heroPanelPillText: { color: '#E9FFF6', fontSize: 11, fontWeight: '600' },
  spark: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 46,
    marginTop: spacing.md,
    gap: 6,
  },
  sparkCol: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  sparkBar: { width: '100%', borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.30)' },
  sparkBarLead: { backgroundColor: '#FFFFFF' },
  sparkEmpty: { flex: 1, height: 6, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.24)' },
  bodySheet: {
    minHeight: 520,
    marginTop: -18,
    paddingTop: 26,
    paddingHorizontal: spacing.lg,
    backgroundColor: palette.slate050,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.slate200,
    paddingHorizontal: spacing.lg,
    height: 48,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  searchInput: { flex: 1, fontSize: 14, color: palette.slate900, fontWeight: '500' },
  searchClear: { fontSize: 16, color: palette.slate400, fontWeight: '500' },
  statsGrid: { gap: spacing.md },
  statsRow: { flexDirection: 'row', gap: spacing.md },
  statCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: radius.lg,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.slate200,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    shadowColor: '#0B3B36',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  statIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  statCopy: { flex: 1, minWidth: 0 },
  statTitle: { color: palette.slate500, fontSize: 12, fontWeight: '600', letterSpacing: 0.2 },
  statValue: { color: palette.slate900, fontSize: 24, fontWeight: '700', marginTop: 2, letterSpacing: -0.6 },
  statSubtitle: { color: palette.slate400, fontSize: 11, marginTop: 2 },
  sectionEyebrow: {
    ...typography.eyebrow,
    color: palette.slate400,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  subscriptionRunCard: { borderRadius: radius.lg, overflow: 'hidden' },
  subscriptionRunSurface: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
  },
  subscriptionRunIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subscriptionRunCopy: { flex: 1, marginHorizontal: spacing.md },
  subscriptionRunEyebrow: { color: '#0B3B36', fontSize: 9, fontWeight: '800', letterSpacing: 1.2, opacity: 0.85 },
  subscriptionRunTitle: { color: '#042B22', fontSize: 15, fontWeight: '700', marginTop: 2 },
  subscriptionRunText: { color: '#0B3B36', fontSize: 11, lineHeight: 15, marginTop: 2, opacity: 0.9 },
  sectionHeader: { marginTop: spacing.xl, marginBottom: spacing.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { ...typography.heading, color: palette.slate900 },
  viewAll: { color: palette.teal700, fontSize: 13, fontWeight: '700' },
  storeList: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.slate200,
    backgroundColor: palette.white,
    overflow: 'hidden',
  },
  storeRow: { minHeight: 74, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, gap: spacing.sm },
  storeRowBorder: { borderBottomWidth: 1, borderBottomColor: palette.slate100 },
  storeIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: palette.teal050,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeCopy: { flex: 1, marginRight: spacing.sm },
  storeRowName: { color: palette.slate900, fontSize: 14, fontWeight: '600' },
  storeAddress: { color: palette.slate500, fontSize: 11, marginTop: 3 },
  statusPill: { borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 4 },
  statusText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  stateCard: { minHeight: 300, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  stateTitle: { color: palette.slate900, fontSize: 17, fontWeight: '700', marginTop: spacing.md, textAlign: 'center' },
  stateText: { color: palette.slate500, fontSize: 13, textAlign: 'center', marginTop: spacing.sm },
  emptyAssigned: { minHeight: 160, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
});
