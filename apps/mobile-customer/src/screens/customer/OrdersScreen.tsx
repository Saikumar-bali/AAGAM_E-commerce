import React from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@aagam/mobile-shared';

export const OrdersScreen = () => {
  const navigation = useNavigation<any>();
  const { data: orders, isLoading, refetch, isRefetching } = useQuery({ queryKey: ['my-orders'], queryFn: async () => (await apiClient.get('/orders/my')).data });
  if (isLoading && !isRefetching) return <View style={styles.centered}><ActivityIndicator size="large" color="#0F766E" /></View>;
  return <View style={styles.container}><FlatList data={orders} keyExtractor={(item) => item.id} contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />} ListEmptyComponent={<View style={styles.emptyContainer}><Text style={styles.emptyTitle}>No orders yet</Text><Text style={styles.emptyText}>Your order history will appear here after checkout.</Text></View>} renderItem={({ item }) => <TouchableOpacity style={styles.orderCard} onPress={() => navigation.navigate('OrderDetail', { orderId: item.id })}><View style={styles.orderHeader}><Text style={styles.orderId}>Order #{item.id.slice(-8).toUpperCase()}</Text><Text style={styles.statusText}>{item.status}</Text></View><Text style={styles.orderMeta}>{item.store?.name || 'Assigned Store'}</Text><Text style={styles.orderMeta}>{new Date(item.createdAt).toLocaleString()}</Text><View style={styles.orderFooter}><Text style={styles.totalText}>₹{item.grandTotal ?? item.totalAmount}</Text><Text style={styles.chevron}>View Details</Text></View></TouchableOpacity>} /></View>;
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, paddingBottom: 170 },
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
  emptyText: { marginTop: 8, color: '#64748B', textAlign: 'center' },
});