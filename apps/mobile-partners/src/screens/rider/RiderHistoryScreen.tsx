import React, { useMemo } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Clock3, MapPin, Navigation, Route } from 'lucide-react-native';
import { riderService } from '../../api/riderService';

const formatDuration = (minutes?: number | null) => {
  if (!minutes || minutes <= 0) return 'N/A';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
};

const formatAddressText = (snapshot?: any) => {
  if (!snapshot || typeof snapshot !== 'object') return 'Address not available';
  const line = [snapshot.line1, snapshot.line2].filter(Boolean).join(', ');
  const locality = [snapshot.landmark, snapshot.city, snapshot.pincode].filter(Boolean).join(', ');
  return [line, locality].filter(Boolean).join(' • ') || 'Address not available';
};

export const RiderHistoryScreen = () => {
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['rider-history'],
    queryFn: riderService.getAssignedOrders,
  });

  const historyOrders = useMemo(() => {
    const list = Array.isArray(data) ? data : [];
    return list.filter((o: any) => o.status === 'DELIVERED' || o.status === 'OUT_FOR_DELIVERY');
  }, [data]);

  const openRoute = (order: any) => {
    if (!order?.deliveryLat || !order?.deliveryLng) return;
    const destination = `${order.deliveryLat},${order.deliveryLng}`;
    const hasStoreCoords = typeof order.store?.latitude === 'number' && typeof order.store?.longitude === 'number';
    const routeUrl = hasStoreCoords
      ? `https://www.google.com/maps/dir/?api=1&origin=${order.store.latitude},${order.store.longitude}&destination=${destination}&travelmode=driving`
      : `https://www.google.com/maps/search/?api=1&query=${destination}`;
    Linking.openURL(routeUrl);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}>
      <Text style={styles.title}>Trip History</Text>
      <Text style={styles.subtitle}>From store to customer with distance and delivery time.</Text>
      {isLoading ? <Text style={styles.loading}>Loading trips...</Text> : null}
      {historyOrders.map((order: any) => (
        <View key={order.id} style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.orderId}>#{order.id.slice(-8).toUpperCase()}</Text>
            <Text style={styles.status}>{String(order.status).replace(/_/g, ' ')}</Text>
          </View>
          <View style={styles.metricRow}>
            <View style={styles.metricPill}><Route size={14} color="#0F766E" /><Text style={styles.metricText}>{order.trackingSummary?.distanceKm ?? 0} km</Text></View>
            <View style={styles.metricPill}><Clock3 size={14} color="#1D4ED8" /><Text style={styles.metricText}>{formatDuration(order.trackingSummary?.durationMinutes)}</Text></View>
          </View>
          <View style={styles.section}>
            <Text style={styles.label}>From</Text>
            <Text style={styles.value}>{order.store?.name || 'Store'}</Text>
            <Text style={styles.sub}>{order.store?.address || 'Store address not available'}</Text>
          </View>
          <View style={styles.section}>
            <Text style={styles.label}>To</Text>
            <Text style={styles.value}>{order.addressSnapshot?.recipientName || order.customer?.name || 'Customer'}</Text>
            <Text style={styles.sub}>{formatAddressText(order.addressSnapshot)}</Text>
          </View>
          <TouchableOpacity style={styles.routeButton} onPress={() => openRoute(order)}>
            <Navigation size={16} color="#FFFFFF" />
            <Text style={styles.routeButtonText}>Open route in Google Maps</Text>
          </TouchableOpacity>
        </View>
      ))}
      {!isLoading && historyOrders.length === 0 ? (
        <View style={styles.empty}><MapPin size={28} color="#94A3B8" /><Text style={styles.emptyText}>No completed trips yet.</Text></View>
      ) : null}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 16, paddingBottom: 30, gap: 12 },
  title: { fontSize: 24, fontWeight: '900', color: '#0F172A' },
  subtitle: { color: '#64748B', marginTop: -4, marginBottom: 4 },
  loading: { color: '#475569' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, borderColor: '#E2E8F0', borderWidth: 1, padding: 14, gap: 10 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderId: { fontWeight: '900', color: '#0F172A' },
  status: { fontSize: 12, fontWeight: '800', color: '#7C3AED' },
  metricRow: { flexDirection: 'row', gap: 10 },
  metricPill: { flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  metricText: { fontSize: 12, fontWeight: '800', color: '#0F172A' },
  section: { gap: 2 },
  label: { fontSize: 11, fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase' },
  value: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  sub: { fontSize: 13, color: '#475569' },
  routeButton: { marginTop: 4, height: 44, borderRadius: 12, backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  routeButtonText: { color: '#FFFFFF', fontWeight: '800' },
  empty: { marginTop: 30, alignItems: 'center', gap: 10 },
  emptyText: { color: '#64748B', fontWeight: '700' },
});
