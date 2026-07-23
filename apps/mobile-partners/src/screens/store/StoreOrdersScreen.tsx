import React, { useEffect, useMemo, useState } from 'react';
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
import { ChevronRight, RefreshCw, ShoppingBag, Store } from 'lucide-react-native';
import { storeService } from '../../api/storeService';

function statusTone(status: string) {
  if (status === 'DELIVERED') return { backgroundColor: '#DCFCE7', color: '#166534' };
  if (status === 'CANCELLED' || status === 'PAYMENT_FAILED') return { backgroundColor: '#FEE2E2', color: '#991B1B' };
  if (status === 'PACKED' || status === 'RIDER_ASSIGNED' || status === 'OUT_FOR_DELIVERY') {
    return { backgroundColor: '#DBEAFE', color: '#1D4ED8' };
  }
  return { backgroundColor: '#FEF3C7', color: '#92400E' };
}

export const StoreOrdersScreen = ({ navigation, route }: { navigation?: any; route?: any }) => {
  const requestedStoreId = route?.params?.storeId as string | undefined;
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(requestedStoreId || null);
  const storesQuery = useQuery({
    queryKey: ['partner-stores'],
    queryFn: storeService.getMyStores,
    retry: 1,
  });
  const stores = Array.isArray(storesQuery.data) ? storesQuery.data : [];

  useEffect(() => {
    if (requestedStoreId && stores.some((store: any) => store.id === requestedStoreId)) {
      setSelectedStoreId(requestedStoreId);
      return;
    }
    setSelectedStoreId((current) => current && stores.some((store: any) => store.id === current) ? current : stores[0]?.id || null);
  }, [requestedStoreId, stores]);

  const activeStoreId = selectedStoreId || stores[0]?.id || null;
  const ordersQuery = useQuery({
    queryKey: ['partner-store-orders', activeStoreId],
    queryFn: () => storeService.getStoreOrders(activeStoreId as string),
    enabled: Boolean(activeStoreId),
    refetchInterval: 15_000,
    retry: 1,
  });
  const orders = useMemo(() => {
    const value: any = ordersQuery.data;
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.orders)) return value.orders;
    return [];
  }, [ordersQuery.data]);

  const refresh = async () => {
    await storesQuery.refetch();
    if (activeStoreId) await ordersQuery.refetch();
  };

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={storesQuery.isFetching || ordersQuery.isFetching} onRefresh={() => void refresh()} />}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>STORE OPERATIONS</Text>
          <Text style={styles.title}>Orders</Text>
        </View>
        <TouchableOpacity testID="store_orders_refresh" style={styles.refreshButton} onPress={() => void refresh()}>
          <RefreshCw size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {storesQuery.isLoading ? (
        <View style={styles.loading}><ActivityIndicator size="large" color="#0F766E" /></View>
      ) : storesQuery.isError ? (
        <View style={styles.emptyCard}><Text style={styles.emptyTitle}>Could not load stores</Text><Text style={styles.emptyText}>Pull down or tap refresh to retry.</Text></View>
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
                  testID={`store_orders_store_${store.id}`}
                  key={store.id}
                  style={[styles.storeChip, selected && styles.storeChipSelected]}
                  onPress={() => setSelectedStoreId(store.id)}
                >
                  <Store size={15} color={selected ? '#FFFFFF' : '#0F766E'} />
                  <Text style={[styles.storeChipText, selected && styles.storeChipTextSelected]} numberOfLines={1}>{store.name || 'Store'}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.summaryCard}>
            <View style={styles.summaryIcon}><ShoppingBag size={24} color="#0F766E" /></View>
            <View><Text style={styles.summaryLabel}>Current store queue</Text><Text style={styles.summaryValue}>{orders.length} orders</Text></View>
          </View>

          {ordersQuery.isLoading ? (
            <View style={styles.loading}><ActivityIndicator color="#0F766E" /></View>
          ) : ordersQuery.isError ? (
            <View style={styles.emptyCard}><Text style={styles.emptyTitle}>Could not load orders</Text><Text style={styles.emptyText}>The selected store remains unchanged. Retry when the connection is available.</Text></View>
          ) : orders.length === 0 ? (
            <View style={styles.emptyCard}><ShoppingBag size={42} color="#94A3B8" /><Text style={styles.emptyTitle}>No orders yet</Text><Text style={styles.emptyText}>New orders for this store will appear here.</Text></View>
          ) : (
            orders.map((order: any) => {
              const tone = statusTone(order.status || 'PENDING');
              const total = Number(order.grandTotal ?? order.totalAmount ?? 0);
              return (
                <TouchableOpacity
                  testID={`store_order_card_${order.id}`}
                  key={order.id}
                  style={styles.orderCard}
                  activeOpacity={0.75}
                  onPress={() => navigation?.navigate?.('Operations', { orderId: order.id, storeId: activeStoreId })}
                >
                  <View style={styles.orderTopRow}>
                    <View>
                      <Text style={styles.orderId}>Order #{String(order.id).slice(-8).toUpperCase()}</Text>
                      <Text style={styles.customerName}>{order.customer?.name || order.addressSnapshot?.recipientName || 'Customer'}</Text>
                    </View>
                    <View style={[styles.statusChip, { backgroundColor: tone.backgroundColor }]}><Text style={[styles.statusText, { color: tone.color }]}>{String(order.status || 'PENDING').replaceAll('_', ' ')}</Text></View>
                  </View>
                  <View style={styles.orderBottomRow}>
                    <View><Text style={styles.totalLabel}>ORDER TOTAL</Text><Text style={styles.total}>₹{total.toFixed(2)}</Text></View>
                    <Text style={styles.orderTime}>{order.createdAt ? new Date(order.createdAt).toLocaleString() : 'Recently created'}</Text>
                    <ChevronRight size={18} color="#64748B" />
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </>
      )}
      <View style={{ height: 100 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { paddingBottom: 20 },
  header: { backgroundColor: '#0F172A', paddingTop: 56, paddingHorizontal: 20, paddingBottom: 24, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: '#5EEAD4', fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  title: { color: '#FFFFFF', fontSize: 28, fontWeight: '900', marginTop: 4 },
  refreshButton: { width: 44, height: 44, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  loading: { minHeight: 160, alignItems: 'center', justifyContent: 'center' },
  storeRail: { gap: 8, padding: 18, paddingBottom: 8 },
  storeChip: { maxWidth: 180, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: '#E2E8F0', flexDirection: 'row', alignItems: 'center', gap: 7 },
  storeChipSelected: { backgroundColor: '#0F766E' },
  storeChipText: { color: '#334155', fontWeight: '800', flexShrink: 1 },
  storeChipTextSelected: { color: '#FFFFFF' },
  summaryCard: { marginHorizontal: 18, marginTop: 8, marginBottom: 4, padding: 16, borderRadius: 20, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  summaryIcon: { width: 48, height: 48, borderRadius: 15, backgroundColor: '#CCFBF1', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  summaryLabel: { color: '#64748B', fontSize: 11, fontWeight: '800' },
  summaryValue: { color: '#0F172A', fontSize: 18, fontWeight: '900', marginTop: 3 },
  emptyCard: { margin: 18, minHeight: 180, borderRadius: 24, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyTitle: { marginTop: 12, color: '#0F172A', fontSize: 18, fontWeight: '900' },
  emptyText: { marginTop: 6, color: '#64748B', textAlign: 'center', lineHeight: 20 },
  orderCard: { marginHorizontal: 18, marginTop: 12, borderRadius: 22, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 16 },
  orderTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  orderId: { color: '#0F766E', fontSize: 11, fontWeight: '900' },
  customerName: { color: '#0F172A', fontSize: 16, fontWeight: '900', marginTop: 5 },
  statusChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  statusText: { fontSize: 9, fontWeight: '900' },
  orderBottomRow: { marginTop: 14, paddingTop: 13, borderTopWidth: 1, borderTopColor: '#F1F5F9', flexDirection: 'row', alignItems: 'center', gap: 12 },
  totalLabel: { color: '#94A3B8', fontSize: 9, fontWeight: '900' },
  total: { color: '#0F172A', fontSize: 16, fontWeight: '900', marginTop: 2 },
  orderTime: { flex: 1, color: '#64748B', fontSize: 10, textAlign: 'right' },
});
