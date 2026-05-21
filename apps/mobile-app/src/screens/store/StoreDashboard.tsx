import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Dimensions, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { LayoutGrid, Package, TrendingUp, ShoppingBag, Plus, Settings, ChevronRight } from 'lucide-react-native';

const { width } = Dimensions.get('window');

interface StoreStats {
  totalInventory: number;
  lowStockItems: number;
  totalOrders: number;
  revenue: number;
}

export const StoreDashboard = () => {
  const { data: stores, isLoading, refetch } = useQuery({
    queryKey: ['my-stores'],
    queryFn: async () => {
      const response = await apiClient.get('/stores/my-stores');
      return response.data;
    },
  });

  const stats: StoreStats = {
    totalInventory: 124,
    lowStockItems: 5,
    totalOrders: 48,
    revenue: 15420.50,
  };

  const StatCard = ({ title, value, icon: Icon, color }: any) => (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <View style={styles.statIconContainer}>
        <Icon size={24} color={color} />
      </View>
      <View>
        <Text style={styles.statTitle}>{title}</Text>
        <Text style={styles.statValue}>{value}</Text>
      </View>
    </View>
  );

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.storeName}>Store Manager</Text>
        </View>
        <TouchableOpacity style={styles.profileButton}>
          <Settings size={24} color="#666" />
        </TouchableOpacity>
      </View>

      <View style={styles.statsGrid}>
        <StatCard title="Inventory" value={stats.totalInventory} icon={Package} color="#0F766E" />
        <StatCard title="Orders" value={stats.totalOrders} icon={ShoppingBag} color="#10B981" />
        <StatCard title="Revenue" value={`$${stats.revenue}`} icon={TrendingUp} color="#F59E0B" />
        <StatCard title="Low Stock" value={stats.lowStockItems} icon={LayoutGrid} color="#EF4444" />
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Your Stores</Text>
        <TouchableOpacity style={styles.addButton}>
          <Plus size={20} color="#FFF" />
          <Text style={styles.addButtonText}>Add Store</Text>
        </TouchableOpacity>
      </View>

      {Array.isArray(stores) && stores.map((store: any) => (
        <TouchableOpacity key={store.id} style={styles.storeCard} activeOpacity={0.7}>
          <View style={styles.storeInfo}>
            <View style={styles.storeAvatar}>
              <Text style={styles.storeAvatarText}>{store.name[0]}</Text>
            </View>
            <View>
              <Text style={styles.storeCardName}>{store.name}</Text>
              <Text style={styles.storeCardAddress}>{store.address}</Text>
            </View>
          </View>
          <ChevronRight size={20} color="#999" />
        </TouchableOpacity>
      ))}

      {!stores?.length && !isLoading && (
        <View style={styles.emptyState}>
          <Package size={48} color="#CCC" />
          <Text style={styles.emptyText}>No stores found</Text>
          <Text style={styles.emptySubtext}>Start by creating your first store</Text>
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    padding: 24,
    paddingTop: 60,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  greeting: {
    fontSize: 14,
    color: '#64748B',
    fontFamily: 'Inter-Regular',
  },
  storeName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1E293B',
    fontFamily: 'Inter-Bold',
  },
  profileButton: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  statsGrid: {
    padding: 24,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statCard: {
    width: (width - 60) / 2,
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 20,
    marginBottom: 12,
    borderLeftWidth: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 15,
  },
  statIconContainer: {
    marginBottom: 12,
  },
  statTitle: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E293B',
  },
  sectionHeader: {
    paddingHorizontal: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E293B',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F766E',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  addButtonText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  storeCard: {
    marginHorizontal: 24,
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 15,
  },
  storeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  storeAvatar: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#CCFBF1',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  storeAvatarText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0F766E',
  },
  storeCardName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 2,
  },
  storeCardAddress: {
    fontSize: 12,
    color: '#64748B',
  },
  emptyState: {
    alignItems: 'center',
    padding: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E293B',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 8,
  },
});
