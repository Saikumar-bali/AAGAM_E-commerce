import React, { useMemo } from 'react';
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
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@aagam/mobile-shared';
import { ChevronRight, Package, ShoppingBag, Store, TrendingUp } from 'lucide-react-native';
import { storeService } from '../../api/storeService';

const { width } = Dimensions.get('window');

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
  const storesQuery = useQuery({
    queryKey: ['store-owner-dashboard-stores'],
    queryFn: storeService.getStoreDashboardSummaries,
    retry: 1,
  });
  const stores: StoreSummary[] = Array.isArray(storesQuery.data) ? storesQuery.data : [];

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
        <RefreshControl refreshing={storesQuery.isRefetching} onRefresh={() => void storesQuery.refetch()} />
      }
    >
      <View style={styles.header}>
        <Text style={styles.greeting}>Welcome back,</Text>
        <Text style={styles.managerName}>{user?.name || 'Store Manager'}</Text>
        <Text style={styles.headerCopy}>Live operational totals from your assigned stores.</Text>
      </View>

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
              onPress={() => navigation?.navigate?.('Orders', { storeId: store.id })}
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
  greeting: { fontSize: 14, color: '#64748B' },
  managerName: { fontSize: 25, fontWeight: '900', color: '#1E293B', marginTop: 3 },
  headerCopy: { color: '#64748B', marginTop: 6, fontSize: 12 },
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
