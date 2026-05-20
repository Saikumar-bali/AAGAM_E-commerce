import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

export const OrderDetailScreen = () => {
  const route = useRoute<RouteProp<Record<string, { orderId: string }>, string>>();
  const orderId = route.params?.orderId;

  const { data: order, isLoading, error } = useQuery({
    queryKey: ['order-detail', orderId],
    queryFn: async () => {
      const response = await apiClient.get(`/orders/my/${orderId}`);
      return response.data;
    },
    enabled: Boolean(orderId),
  });

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0F766E" />
      </View>
    );
  }

  if (error || !order) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Unable to load order details.</Text>
      </View>
    );
  }

  const address = order.addressSnapshot;
  const pricing = order.pricingSnapshot || order;
  const orderItems = order.itemsSnapshot?.length ? order.itemsSnapshot : order.items || [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.heroCard}>
        <Text style={styles.orderId}>Order #{order.id.slice(-8).toUpperCase()}</Text>
        <Text style={styles.statusText}>{order.status}</Text>
        <Text style={styles.metaText}>{new Date(order.createdAt).toLocaleString()}</Text>
        <Text style={styles.totalText}>₹{pricing.grandTotal ?? order.totalAmount}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Delivery Address</Text>
        {address ? (
          <>
            <Text style={styles.boldText}>{address.recipientName}</Text>
            <Text style={styles.bodyText}>{address.phoneE164}</Text>
            <Text style={styles.bodyText}>
              {address.line1}
              {address.line2 ? `, ${address.line2}` : ''}
            </Text>
            <Text style={styles.bodyText}>
              {address.city}, {address.state} - {address.pincode}
            </Text>
          </>
        ) : (
          <Text style={styles.bodyText}>Address snapshot unavailable.</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Items</Text>
        {orderItems.map((item: any, index: number) => (
          <View key={item.id || item.productId || index} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.boldText}>{item.name || item.product?.name || 'Item'}</Text>
              <Text style={styles.bodyText}>
                Qty {item.quantity} x ₹{item.unitPrice ?? item.price}
              </Text>
            </View>
            <Text style={styles.boldText}>₹{item.lineTotal ?? item.quantity * (item.unitPrice ?? item.price ?? 0)}</Text>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Payment & Tracking</Text>
        <Text style={styles.bodyText}>Payment method: {order.payment?.method || 'N/A'}</Text>
        <Text style={styles.bodyText}>Payment status: {order.payment?.status || 'N/A'}</Text>
        <Text style={styles.bodyText}>Store: {order.store?.name || 'Assigned Store'}</Text>
        <Text style={styles.bodyText}>Rider: {order.rider?.user?.name || 'Not assigned yet'}</Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 16, paddingBottom: 24 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  heroCard: { borderRadius: 24, backgroundColor: '#0F766E', padding: 20 },
  orderId: { color: '#CCFBF1', fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  statusText: { marginTop: 8, color: '#FFFFFF', fontSize: 28, fontWeight: '800' },
  metaText: { marginTop: 6, color: '#E6FFFA' },
  totalText: { marginTop: 14, color: '#FFFFFF', fontSize: 30, fontWeight: '800' },
  card: { marginTop: 16, borderRadius: 20, backgroundColor: '#FFFFFF', padding: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  cardTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginBottom: 12 },
  boldText: { color: '#0F172A', fontWeight: '800' },
  bodyText: { marginTop: 4, color: '#475569' },
  row: { flexDirection: 'row', gap: 12, justifyContent: 'space-between', marginBottom: 12 },
  errorText: { color: '#B91C1C', fontWeight: '700' },
});
