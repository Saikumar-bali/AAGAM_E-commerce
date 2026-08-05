import React from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@aagam/mobile-shared';
import { AagamBrand } from '../../components/AagamBrand';

export const OrdersScreen = () => {
  const navigation = useNavigation<any>();
  const { data: orders, isLoading, isError, error, refetch, isRefetching } = useQuery({ queryKey: ['my-orders'], queryFn: async () => (await apiClient.get('/orders/my')).data });
  const orderItems = Array.isArray(orders) ? orders : [];
  if (isLoading && !isRefetching) return <View style={styles.centered}><ActivityIndicator size="large" color="#0F766E" /></View>;
  if (isError && orderItems.length === 0) return <View style={styles.centered}><Text style={styles.emptyTitle}>Orders unavailable</Text><Text style={styles.emptyText}>{(error as Error)?.message || 'Please check your connection and try again.'}</Text><TouchableOpacity style={styles.retryButton} onPress={() => void refetch()}><Text style={styles.retryText}>Try again</Text></TouchableOpacity></View>;
  return <View style={styles.container}><FlatList data={orderItems} keyExtractor={(item) => item.id} contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />} ListHeaderComponent={<View><View style={styles.brandHeader}><AagamBrand compact /><Text style={styles.screenTitle}>My Orders</Text><Text style={styles.screenSubtitle}>Track current deliveries and review past orders.</Text></View>{isError ? <View style={styles.errorBanner}><View style={styles.errorCopy}><Text style={styles.errorTitle}>Could not refresh orders</Text><Text style={styles.errorText}>Showing your last loaded order history.</Text></View><TouchableOpacity onPress={() => void refetch()}><Text style={styles.errorRetry}>Retry</Text></TouchableOpacity></View> : null}</View>} ListEmptyComponent={<View style={styles.emptyContainer}><Text style={styles.emptyTitle}>No orders yet</Text><Text style={styles.emptyText}>Your order history will appear here after checkout.</Text></View>} renderItem={({ item }) => <TouchableOpacity style={styles.orderCard} onPress={() => navigation.navigate('OrderDetail', { orderId: item.id })}><View style={styles.orderHeader}><Text style={styles.orderId}>Order #{item.id.slice(-8).toUpperCase()}</Text><Text style={styles.statusText}>{item.status}</Text></View><Text style={styles.orderMeta}>{item.store?.name || 'Assigned Store'}</Text><Text style={styles.orderMeta}>{new Date(item.createdAt).toLocaleString()}</Text><View style={styles.orderFooter}><Text style={styles.totalText}>₹{item.grandTotal ?? item.totalAmount}</Text><Text style={styles.chevron}>View Details</Text></View></TouchableOpacity>} /></View>;
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, paddingBottom: 170 },
  brandHeader: { marginBottom: 20 },
  screenTitle: { marginTop: 18, color: '#0F172A', fontSize: 25, fontWeight: '900' },
  screenSubtitle: { marginTop: 4, color: '#64748B', fontSize: 12, fontWeight: '700' },
  errorBanner: { marginBottom: 14, borderRadius: 16, borderWidth: 1, borderColor: '#FCD34D', backgroundColor: '#FFFBEB', padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  errorCopy: { flex: 1 },
  errorTitle: { color: '#92400E', fontSize: 12, fontWeight: '900' },
  errorText: { marginTop: 3, color: '#B45309', fontSize: 11 },
  errorRetry: { color: '#0F766E', fontWeight: '900' },
  orderCard: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderId: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  statusText: { color: '#0F766E', fontWeight: '800', fontSize: 12 },
  orderMeta: { marginTop: 6, color: '#64748B' },
  orderFooter: { marginTop: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalText: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  chevron: { color: '#0F766E', fontWeight: '800' },
  emptyContainer: { paddingTop: 60, alignItems: 'center' },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  emptyText: { marginTop: 8, color: '#64748B', textAlign: 'center', paddingHorizontal: 24 },
  retryButton: { marginTop: 16, borderRadius: 14, backgroundColor: '#0F766E', paddingHorizontal: 18, paddingVertical: 12 },
  retryText: { color: '#FFFFFF', fontWeight: '900' },
});
