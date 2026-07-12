import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, PackageCheck, RefreshCw, ShoppingBag, Store } from 'lucide-react-native';
import { storeService } from '../../api/storeService';

function statusTone(status: string) {
  if (status === 'DELIVERED') return { backgroundColor: '#DCFCE7', color: '#166534' };
  if (status === 'CANCELLED' || status === 'PAYMENT_FAILED') return { backgroundColor: '#FEE2E2', color: '#991B1B' };
  if (status === 'PACKED' || status === 'RIDER_ASSIGNED' || status === 'OUT_FOR_DELIVERY') {
    return { backgroundColor: '#DBEAFE', color: '#1D4ED8' };
  }
  return { backgroundColor: '#FEF3C7', color: '#92400E' };
}

export const StoreOrdersScreen = () => {
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const storesQuery = useQuery({
    queryKey: ['partner-stores'],
    queryFn: storeService.getMyStores,
  });
  const stores = Array.isArray(storesQuery.data) ? storesQuery.data : [];
  const activeStoreId = selectedStoreId || stores[0]?.id || null;

  const ordersQuery = useQuery({
    queryKey: ['partner-store-orders', activeStoreId],
    queryFn: () => storeService.getStoreOrders(activeStoreId as string),
    enabled: Boolean(activeStoreId),
    refetchInterval: 15_000,
  });
  const orders = useMemo(() => {
    const value: any = ordersQuery.data;
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.orders)) return value.orders;
    return [];
  }, [ordersQuery.data]);

  const refreshing = storesQuery.isFetching || ordersQuery.isFetching;
  const refresh = async () => {
    await storesQuery.refetch();
    if (activeStoreId) await ordersQuery.refetch();
  };

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>STORE OPERATIONS</Text>
          <Text style={styles.title}>Orders</Text>
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={() => void refresh()}>
          <RefreshCw size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {storesQuery.isLoading ? (
        <View style={styles.loading}><ActivityIndicator size="large" color="#0F766E" /></View>
      ) : stores.length === 0 ? (
        <View style={styles.emptyCard}>
          <Store size={42} color="#94A3B8" />
          <Text style={styles.emptyTitle}>No assigned stores</Text>
          <Text style={styles.emptyText}>Ask an administrator to assign this account to a store.</Text>
        </View>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storeRail}>
            {stores.map((store: any) => {
              const selected = store.id === activeStoreId;
              return (
                <TouchableOpacity
                  key={store.id}
                  style={[styles.storeChip, selected && styles.storeChipSelected]}
                  onPress={() => setSelectedStoreId(store.id)}
                >
                  <Store size={15} color={selected ? '#FFFFFF' : '#0F766E'} />
                  <Text style={[styles.storeChipText, selected && styles.storeChipTextSelected]} numberOfLines={1}>
                    {store.name || 'Store'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.summaryCard}>
            <View style={styles.summaryIcon}><ShoppingBag size={24} color="#0F766E" /></View>
            <View style={styles.summaryCopy}>
              <Text style={styles.summaryLabel}>Current store queue</Text>
              <Text style={styles.summaryValue}>{orders.length} orders</Text>
            </View>
          </View>

          {ordersQuery.isLoading ? (
            <View style={styles.loading}><ActivityIndicator color="#0F766E" /></View>
          ) : orders.length === 0 ? (
            <View style={styles.emptyCard}>
              <PackageCheck size={42} color="#94A3B8" />
              <Text style={styles.emptyTitle}>No orders right now</Text>
              <Text style={styles.emptyText}>New store orders will appear here automatically.</Text>
            </View>
          ) : (
            orders.map((order: any) => {
              const tone = statusTone(order.status || 'PENDING');
              const total = Number(order.grandTotal ?? order.totalAmount ?? 0);
              return (
                <View key={order.id} style={styles.orderCard}>
                  <View style={styles.orderTopRow}>
                    <View>
                      <Text style={styles.orderId}>Order #{String(order.id).slice(-8).toUpperCase()}</Text>
                      <Text style={styles.orderCustomer}>{order.customer?.name || order.customerSnapshot?.name || 'Customer'}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: tone.backgroundColor }]}>
                      <Text style={[styles.statusText, { color: tone.color }]}>{String(order.status || 'PENDING').replaceAll('_', ' ')}</Text>
                    </View>
                  </View>
                  <View style={styles.orderMetaRow}>
                    <Text style={styles.orderMeta}>{order.items?.length || 0} items</Text>
                    <Text style={styles.orderTotal}>₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
                  </View>
                  <View style={styles.orderFooter}>
                    <Text style={styles.orderTime}>{order.createdAt ? new Date(order.createdAt).toLocaleString() : 'Recently created'}</Text>
                    <ChevronRight size={18} color="#64748B" />
                  </View>
                </View>
              );
            })
          )}
        </>
      )}
      <View style={styles.bottomSpace} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F5F3EE' },
  content: { paddingBottom: 120 },
  header: { backgroundColor: '#0F172A', paddingTop: 58, paddingHorizontal: 22, paddingBottom: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomLeftRadius: 32, borderBottomRightRadius: 32 },
  eyebrow: { color: '#94A3B8', fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: '#FFFFFF', fontSize: 30, fontWeight: '900', marginTop: 4 },
  refreshButton: { width: 46, height: 46, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  storeRail: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 4, gap: 10 },
  storeChip: { maxWidth: 210, height: 42, borderRadius: 16, paddingHorizontal: 14, borderWidth: 1, borderColor: '#99F6E4', backgroundColor: '#F0FDFA', flexDirection: 'row', alignItems: 'center', gap: 7 },
  storeChipSelected: { backgroundColor: '#0F766E', borderColor: '#0F766E' },
  storeChipText: { color: '#0F766E', fontSize: 13, fontWeight: '900' },
  storeChipTextSelected: { color: '#FFFFFF' },
  summaryCard: { marginHorizontal: 20, marginTop: 14, backgroundColor: '#FFFFFF', borderRadius: 24, padding: 18, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E7E5E4' },
  summaryIcon: { width: 50, height: 50, borderRadius: 17, backgroundColor: '#CCFBF1', alignItems: 'center', justifyContent: 'center' },
  summaryCopy: { marginLeft: 13 },
  summaryLabel: { color: '#78716C', fontSize: 12, fontWeight: '700' },
  summaryValue: { color: '#0F172A', fontSize: 20, fontWeight: '900', marginTop: 2 },
  loading: { minHeight: 180, alignItems: 'center', justifyContent: 'center' },
  emptyCard: { margin: 20, minHeight: 220, backgroundColor: '#FFFFFF', borderRadius: 28, borderWidth: 1, borderColor: '#E7E5E4', alignItems: 'center', justifyContent: 'center', padding: 26 },
  emptyTitle: { color: '#0F172A', fontSize: 19, fontWeight: '900', marginTop: 14 },
  emptyText: { color: '#64748B', fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 7 },
  orderCard: { marginHorizontal: 20, marginTop: 12, backgroundColor: '#FFFFFF', borderRadius: 24, padding: 18, borderWidth: 1, borderColor: '#E7E5E4' },
  orderTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  orderId: { color: '#0F172A', fontSize: 15, fontWeight: '900' },
  orderCustomer: { color: '#64748B', fontSize: 12, fontWeight: '700', marginTop: 4 },
  statusBadge: { maxWidth: 145, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  statusText: { fontSize: 10, fontWeight: '900', textAlign: 'center' },
  orderMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 18 },
  orderMeta: { color: '#57534E', fontSize: 13, fontWeight: '700' },
  orderTotal: { color: '#0F766E', fontSize: 17, fontWeight: '900' },
  orderFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  orderTime: { color: '#94A3B8', fontSize: 11, fontWeight: '700' },
  bottomSpace: { height: 24 },
});
