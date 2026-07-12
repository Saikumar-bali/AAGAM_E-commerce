import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Dimensions, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { storeService } from '../../api/storeService';
import { LayoutGrid, Package, TrendingUp, ShoppingBag, Plus, ChevronRight, Store } from 'lucide-react-native';

const { width } = Dimensions.get('window');

export const StoreDashboard = () => {
  const { data: stores, isLoading, refetch } = useQuery({
    queryKey: ['my-stores'],
    queryFn: storeService.getMyStores,
  });

  const storeList = Array.isArray(stores) ? stores : [];

  const totals = useMemo(() => {
    const totalOrders = storeList.reduce((sum: number, s: any) => sum + (s._count?.orders || s.orderCount || 0), 0);
    const totalRevenue = storeList.reduce((sum: number, s: any) => sum + (s.revenue || 0), 0);
    return {
      totalStores: storeList.length,
      totalOrders,
      totalRevenue: totalRevenue || storeList.length * 0,
    };
  }, [storeList]);

  const StatCard = ({ title, value, icon: Icon, color }: { title: string; value: string | number; icon: any; color: string }) => (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <View style={styles.statIconContainer}><Icon size={24} color={color} /></View>
      <View>
        <Text style={styles.statTitle}>{title}</Text>
        <Text style={styles.statValue}>{value}</Text>
      </View>
    </View>
  );

  return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.storeName}>Store Manager</Text>
        </View>
      </View>

      <View style={styles.statsGrid}>
        <StatCard title="Stores" value={totals.totalStores} icon={Store} color="#0F766E" />
        <StatCard title="Orders" value={totals.totalOrders} icon={ShoppingBag} color="#10B981" />
        <StatCard title="Revenue" value={`₹${Number(totals.totalRevenue).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`} icon={TrendingUp} color="#F59E0B" />
        <StatCard title="Inventory" value={storeList.length > 0 ? 'Active' : '—'} icon={Package} color="#EF4444" />
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Your Stores</Text>
      </View>

      {storeList.map((store: any) => (
        <TouchableOpacity key={store.id} style={styles.storeCard} activeOpacity={0.7}>
          <View style={styles.storeInfo}>
            <View style={styles.storeAvatar}><Text style={styles.storeAvatarText}>{store.name?.[0] || 'S'}</Text></View>
            <View style={styles.storeDetails}>
              <Text style={styles.storeCardName}>{store.name}</Text>
              <Text style={styles.storeCardAddress}>{store.address}</Text>
              <Text style={styles.storeCardOrders}>{store._count?.orders || store.orderCount || 0} order(s)</Text>
            </View>
          </View>
          <ChevronRight size={20} color="#999" />
        </TouchableOpacity>
      ))}

      {!storeList.length && !isLoading && (
        <View style={styles.emptyState}>
          <Package size={48} color="#CCC" />
          <Text style={styles.emptyText}>No stores found</Text>
          <Text style={styles.emptySubtext}>Contact admin to assign stores to your account</Text>
        </View>
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { padding: 24, paddingTop: 60, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  headerContent: {},
  greeting: { fontSize: 14, color: '#64748B' },
  storeName: { fontSize: 24, fontWeight: 'bold', color: '#1E293B' },
  statsGrid: { padding: 24, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  statCard: { width: (width - 60) / 2, backgroundColor: '#FFF', padding: 16, borderRadius: 20, marginBottom: 12, borderLeftWidth: 4, elevation: 2 },
  statIconContainer: { marginBottom: 12 },
  statTitle: { fontSize: 12, color: '#64748B', marginBottom: 4 },
  statValue: { fontSize: 18, fontWeight: 'bold', color: '#1E293B' },
  sectionHeader: { paddingHorizontal: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#1E293B' },
  storeCard: { marginHorizontal: 24, backgroundColor: '#FFF', padding: 16, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, elevation: 2 },
  storeInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  storeAvatar: { width: 48, height: 48, borderRadius: 14, backgroundColor: '#CCFBF1', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  storeAvatarText: { fontSize: 20, fontWeight: 'bold', color: '#0F766E' },
  storeDetails: { flex: 1 },
  storeCardName: { fontSize: 16, fontWeight: '600', color: '#1E293B', marginBottom: 2 },
  storeCardAddress: { fontSize: 12, color: '#64748B' },
  storeCardOrders: { fontSize: 11, color: '#0F766E', fontWeight: '700', marginTop: 4 },
  emptyState: { alignItems: 'center', padding: 60 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#1E293B', marginTop: 16 },
  emptySubtext: { fontSize: 14, color: '#64748B', textAlign: 'center', marginTop: 8 },
});
