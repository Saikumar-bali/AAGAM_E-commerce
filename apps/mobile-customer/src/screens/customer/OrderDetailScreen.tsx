import React, { useEffect, useState, useRef } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, useSocket, TrackingMap } from '@aagam/mobile-shared';

const TrackingStateBanner = ({ state, riderName }: { state: string; riderName?: string | null }) => {
  switch (state) {
    case 'NOT_ASSIGNED': return <View style={styles.bannerContainer}><View style={[styles.banner, styles.bannerWaiting]}><View style={styles.bannerDot} /><Text style={styles.bannerText}>Waiting for rider assignment...</Text></View></View>;
    case 'ASSIGNED_NO_LOCATION': return <View style={styles.bannerContainer}><View style={[styles.banner, styles.bannerAssigned]}><View style={[styles.bannerDot, { backgroundColor: '#3B82F6' }]} /><Text style={styles.bannerText}>{riderName ? `${riderName} is heading to pick up your order` : 'Rider is heading to pick up your order'}</Text></View></View>;
    case 'STALE': return <View style={styles.bannerContainer}><View style={[styles.banner, styles.bannerStale]}><View style={[styles.bannerDot, { backgroundColor: '#F59E0B' }]} /><Text style={[styles.bannerText, { color: '#92400E' }]}>Tracking paused — waiting for rider location update</Text></View></View>;
    case 'DELIVERED':
    case 'STOPPED': return <View style={styles.bannerContainer}><View style={[styles.banner, styles.bannerDelivered]}><View style={[styles.bannerDot, { backgroundColor: '#10B981' }]} /><Text style={[styles.bannerText, { color: '#065F46' }]}>Order delivered!</Text></View></View>;
    case 'CANCELLED': return <View style={styles.bannerContainer}><View style={[styles.banner, styles.bannerCancelled]}><View style={[styles.bannerDot, { backgroundColor: '#EF4444' }]} /><Text style={[styles.bannerText, { color: '#991B1B' }]}>Order was cancelled</Text></View></View>;
    default: return null;
  }
};

export const OrderDetailScreen = () => {
  const route = useRoute<RouteProp<Record<string, { orderId: string }>, string>>();
  const navigation = useNavigation<any>();
  const orderId = route.params?.orderId;
  const { emit, on, off } = useSocket();
  const [liveTracking, setLiveTracking] = useState<any | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const queryClient = useQueryClient();
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const { data: trackingPayload, isLoading, error, refetch } = useQuery({
    queryKey: ['order-detail', orderId],
    queryFn: async () => {
      const response = await apiClient.get(`/tracking/my/order/${orderId}`);
      return response.data;
    },
    enabled: Boolean(orderId),
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (!orderId) return;
    emit('joinOrder', { orderId });
    setSocketConnected(true);
    on('riderLocationUpdated', (payload: any) => { if (payload.orderId === orderId) setLiveTracking(payload); });
    on('riderMoved', (payload: any) => { if (payload.orderId === orderId) setLiveTracking(payload); });
    on('orderTimelineUpdated', (payload: any) => { if (payload.order?.id === orderId) refetch(); });
    on('orderStatusUpdated', (payload: any) => { if (payload.orderId === orderId) refetch(); });
    on('trackingStopped', (payload: any) => { if (payload.orderId === orderId) refetch(); });
    return () => { off('riderLocationUpdated'); off('riderMoved'); off('orderTimelineUpdated'); off('orderStatusUpdated'); off('trackingStopped'); };
  }, [orderId, emit, on, off, refetch]);

  useEffect(() => {
    if (!socketConnected || !orderId) return;
    pollingRef.current = setInterval(() => refetch(), 10000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [socketConnected, orderId, refetch]);

  const order = trackingPayload?.order;
  const tracking = trackingPayload?.tracking;
  const trackingState = tracking?.trackingState || 'NOT_ASSIGNED';
  const latestLocation = liveTracking || tracking?.latestLocation;
  const etaMinutes = liveTracking?.etaMinutes ?? tracking?.etaMinutes;
  const distanceKm = liveTracking?.distanceKm ?? tracking?.distanceKm;
  const lastPingAt = latestLocation?.createdAt || tracking?.lastPingAt;

  const buildMarkers = () => {
    const markers: { latitude: number; longitude: number; type: 'store' | 'delivery' | 'rider'; label?: string }[] = [];
    if (trackingPayload?.store?.latitude && trackingPayload?.store?.longitude) markers.push({ latitude: trackingPayload.store.latitude, longitude: trackingPayload.store.longitude, type: 'store', label: trackingPayload.store.name || 'Store' });
    if (order?.deliveryLat && order?.deliveryLng) markers.push({ latitude: order.deliveryLat, longitude: order.deliveryLng, type: 'delivery', label: 'Delivery' });
    if (latestLocation?.latitude && latestLocation?.longitude) markers.push({ latitude: latestLocation.latitude, longitude: latestLocation.longitude, type: 'rider', label: trackingPayload?.rider?.name || 'Rider' });
    else if (trackingPayload?.rider?.latitude && trackingPayload?.rider?.longitude) markers.push({ latitude: trackingPayload.rider.latitude, longitude: trackingPayload.rider.longitude, type: 'rider', label: trackingPayload?.rider?.name || 'Rider' });
    return markers;
  };

  const buildRoutePath = () => !tracking?.routePath || tracking.routePath.length < 2 ? [] : tracking.routePath.map((p: any) => ({ latitude: p.latitude, longitude: p.longitude }));
  const getPingAgeText = () => {
    if (!lastPingAt) return 'No location data';
    const ageSeconds = Math.floor((Date.now() - new Date(lastPingAt).getTime()) / 1000);
    if (ageSeconds < 60) return `${ageSeconds}s ago`;
    return `${Math.floor(ageSeconds / 60)}m ago`;
  };

  if (isLoading) return <View style={styles.centered}><ActivityIndicator size="large" color="#0F766E" /></View>;
  if (error || !order) return <View style={styles.centered}><Text style={styles.errorText}>Unable to load order details.</Text></View>;

  const address = order.addressSnapshot;
  const pricing = order.pricingSnapshot || order;
  const orderItems = order.itemsSnapshot?.length ? order.itemsSnapshot : trackingPayload.items || [];
  const canReview = order.status === 'DELIVERED';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.heroCard}>
        <Text style={styles.orderId}>Order #{order.id.slice(-8).toUpperCase()}</Text>
        <Text style={styles.statusText}>{order.status.replace(/_/g, ' ')}</Text>
        <Text style={styles.metaText}>{new Date(order.createdAt).toLocaleString()}</Text>
        <Text style={styles.totalText}>₹{pricing.grandTotal ?? order.totalAmount}</Text>
      </View>

      <TrackingStateBanner state={trackingState} riderName={trackingPayload?.rider?.name} />

      {trackingState === 'LIVE' || trackingState === 'STALE' || trackingState === 'ASSIGNED_NO_LOCATION' ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Live Tracking</Text>
          <TrackingMap markers={buildMarkers()} routePath={buildRoutePath()} style={styles.trackingMap} />
          <View style={styles.trackingInfo}>
            {etaMinutes ? <View style={styles.trackingInfoItem}><Text style={styles.trackingInfoLabel}>ETA</Text><Text style={styles.trackingInfoValue}>{etaMinutes} min</Text></View> : null}
            {distanceKm != null ? <View style={styles.trackingInfoItem}><Text style={styles.trackingInfoLabel}>Distance</Text><Text style={styles.trackingInfoValue}>{distanceKm} km</Text></View> : null}
            <View style={styles.trackingInfoItem}><Text style={styles.trackingInfoLabel}>Last Update</Text><Text style={styles.trackingInfoValue}>{getPingAgeText()}</Text></View>
          </View>
          {trackingPayload?.rider && <View style={styles.riderInfo}><View style={styles.riderInfoRow}><Text style={styles.riderLabel}>Rider</Text><Text style={styles.riderName}>{trackingPayload.rider.name || 'Assigned'}</Text></View>{trackingPayload.rider.phone && <TouchableOpacity style={styles.callBtn} onPress={() => Linking.openURL(`tel:${trackingPayload.rider.phone}`)}><Text style={styles.callBtnText}>Call Rider</Text></TouchableOpacity>}</View>}
        </View>
      ) : null}

      {canReview ? <TouchableOpacity style={styles.reviewButton} onPress={() => navigation.navigate('Review', { orderId })}><Text style={styles.reviewButtonText}>Review order</Text></TouchableOpacity> : null}

      <View style={styles.card}><Text style={styles.cardTitle}>Timeline</Text>{(trackingPayload.timeline || []).map((event: any) => <View key={event.id} style={styles.timelineRow}><View style={[styles.timelineDot, event.toStatus === order.status && styles.timelineDotActive]} /><View style={{ flex: 1 }}><Text style={[styles.boldText, event.toStatus === order.status && styles.timelineTextActive]}>{String(event.toStatus).replace(/_/g, ' ')}</Text><Text style={styles.bodyText}>{new Date(event.createdAt).toLocaleString()}</Text>{event.note ? <Text style={styles.bodyText}>{event.note}</Text> : null}</View></View>)}</View>

      <View style={styles.card}><Text style={styles.cardTitle}>Delivery Address</Text>{address ? <><Text style={styles.boldText}>{address.recipientName}</Text><Text style={styles.bodyText}>{address.phoneE164}</Text><Text style={styles.bodyText}>{address.line1}{address.line2 ? `, ${address.line2}` : ''}</Text><Text style={styles.bodyText}>{address.city}, {address.state} - {address.pincode}</Text></> : <Text style={styles.bodyText}>Address snapshot unavailable.</Text>}</View>

      <View style={styles.card}><Text style={styles.cardTitle}>Items</Text>{orderItems.map((item: any, index: number) => <View key={item.id || item.productId || index} style={styles.row}><View style={{ flex: 1 }}><Text style={styles.boldText}>{item.name || item.product?.name || 'Item'}</Text><Text style={styles.bodyText}>Qty {item.quantity} x ₹{item.unitPrice ?? item.price}</Text></View><Text style={styles.boldText}>₹{item.lineTotal ?? item.quantity * (item.unitPrice ?? item.price ?? 0)}</Text></View>)}</View>

      <View style={styles.card}><Text style={styles.cardTitle}>Payment</Text><Text style={styles.bodyText}>Method: {order.payment?.method || 'N/A'}</Text><Text style={styles.bodyText}>Status: {order.payment?.status || 'N/A'}</Text><Text style={styles.bodyText}>Store: {trackingPayload.store?.name || 'Assigned Store'}</Text></View>
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
  timelineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#E2E8F0', marginTop: 5 },
  timelineDotActive: { backgroundColor: '#0F766E' },
  timelineTextActive: { color: '#0F766E' },
  errorText: { color: '#B91C1C', fontWeight: '700' },
  callBtn: { marginTop: 10, alignSelf: 'flex-start', backgroundColor: '#0F766E', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  callBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },
  trackingMap: { height: 200, marginBottom: 12 },
  trackingInfo: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  trackingInfoItem: { alignItems: 'center' },
  trackingInfoLabel: { fontSize: 10, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase' },
  trackingInfoValue: { fontSize: 16, fontWeight: '800', color: '#0F172A', marginTop: 2 },
  riderInfo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  riderInfoRow: { flex: 1 },
  riderLabel: { fontSize: 10, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase' },
  riderName: { fontSize: 15, fontWeight: '800', color: '#0F172A', marginTop: 2 },
  bannerContainer: { marginTop: 12 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16 },
  bannerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#94A3B8' },
  bannerText: { fontSize: 13, fontWeight: '700', color: '#475569', flex: 1 },
  bannerWaiting: { backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  bannerAssigned: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE' },
  bannerStale: { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A' },
  bannerDelivered: { backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0' },
  bannerCancelled: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
  reviewButton: { marginTop: 16, borderRadius: 18, backgroundColor: '#0F172A', paddingVertical: 15, alignItems: 'center' },
  reviewButtonText: { color: '#FFFFFF', fontWeight: '900' },
});
