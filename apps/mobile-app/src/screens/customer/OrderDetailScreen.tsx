import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { useSocket } from '../../hooks/useSocket';

export const OrderDetailScreen = () => {
  const route = useRoute<RouteProp<Record<string, { orderId: string }>, string>>();
  const orderId = route.params?.orderId;
  const { emit, on, off } = useSocket();
  const [liveTracking, setLiveTracking] = useState<any | null>(null);

  const { data: trackingPayload, isLoading, error, refetch } = useQuery({
    queryKey: ['order-detail', orderId],
    queryFn: async () => {
      const response = await apiClient.get(`/orders/my/${orderId}/tracking`);
      return response.data;
    },
    enabled: Boolean(orderId),
  });

  useEffect(() => {
    if (!orderId) return;
    emit('joinOrder', { orderId });
    on('riderLocationUpdated', (payload) => {
      if (payload.orderId === orderId) setLiveTracking(payload);
    });
    on('orderTimelineUpdated', (payload) => {
      if (payload.order?.id === orderId) refetch();
    });
    on('trackingStopped', (payload) => {
      if (payload.orderId === orderId) refetch();
    });
    return () => {
      off('riderLocationUpdated');
      off('orderTimelineUpdated');
      off('trackingStopped');
    };
  }, [orderId, emit, on, off, refetch]);

  const order = trackingPayload?.order;

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
  const orderItems = order.itemsSnapshot?.length ? order.itemsSnapshot : trackingPayload.items || [];
  const latestLocation = liveTracking || trackingPayload.tracking?.latestLocation;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.heroCard}>
        <Text style={styles.orderId}>Order #{order.id.slice(-8).toUpperCase()}</Text>
        <Text style={styles.statusText}>{order.status}</Text>
        <Text style={styles.metaText}>{new Date(order.createdAt).toLocaleString()}</Text>
        <Text style={styles.totalText}>₹{pricing.grandTotal ?? order.totalAmount}</Text>
        {trackingPayload.tracking?.etaMinutes ? (
          <Text style={styles.metaText}>ETA {trackingPayload.tracking.etaMinutes} min</Text>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Timeline</Text>
        {(trackingPayload.timeline || []).map((event: any) => (
          <View key={event.id} style={styles.timelineRow}>
            <View style={styles.timelineDot} />
            <View style={{ flex: 1 }}>
              <Text style={styles.boldText}>{String(event.toStatus).replace(/_/g, ' ')}</Text>
              <Text style={styles.bodyText}>{new Date(event.createdAt).toLocaleString()}</Text>
              {event.note ? <Text style={styles.bodyText}>{event.note}</Text> : null}
            </View>
          </View>
        ))}
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
        <Text style={styles.bodyText}>Store: {trackingPayload.store?.name || 'Assigned Store'}</Text>
        <Text style={styles.bodyText}>Rider: {trackingPayload.rider?.name || 'Not assigned yet'}</Text>
        {latestLocation ? (
          <Text style={styles.bodyText}>
            Live location: {Number(latestLocation.latitude).toFixed(5)}, {Number(latestLocation.longitude).toFixed(5)}
          </Text>
        ) : null}
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
  timelineRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  timelineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#0F766E', marginTop: 5 },
  errorText: { color: '#B91C1C', fontWeight: '700' },
});
