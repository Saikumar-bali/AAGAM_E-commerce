import React, { useMemo } from 'react';
import {
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  Clock3,
  MapPin,
  Navigation,
  Package,
  Store,
  XCircle,
} from 'lucide-react-native';
import { riderService } from '../../api/riderService';
import {
  RiderAssignmentOffer,
  deliveryStatusLabel,
} from '../../domain/riderWorkspace';

const formatAddressText = (snapshot?: Record<string, any> | null) => {
  if (!snapshot || typeof snapshot !== 'object') return 'Address not available';
  const line = [snapshot.line1, snapshot.line2].filter(Boolean).join(', ');
  const locality = [snapshot.landmark, snapshot.city, snapshot.pincode]
    .filter(Boolean)
    .join(', ');
  return [line, locality].filter(Boolean).join(' • ') || 'Address not available';
};

const assignmentLabel = (assignment: RiderAssignmentOffer) => {
  if (assignment.status === 'ACCEPTED' && assignment.deliveryJob.status === 'DELIVERED') {
    return 'Completed';
  }
  return assignment.status
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
};

const assignmentTone = (assignment: RiderAssignmentOffer) => {
  if (assignment.status === 'ACCEPTED' && assignment.deliveryJob.status === 'DELIVERED') {
    return { backgroundColor: '#DCFCE7', color: '#166534' };
  }
  if (assignment.status === 'ACCEPTED') {
    return { backgroundColor: '#DBEAFE', color: '#1D4ED8' };
  }
  if (assignment.status === 'REJECTED' || assignment.status === 'CANCELLED') {
    return { backgroundColor: '#FEE2E2', color: '#991B1B' };
  }
  if (assignment.status === 'EXPIRED') {
    return { backgroundColor: '#FEF3C7', color: '#92400E' };
  }
  return { backgroundColor: '#F1F5F9', color: '#475569' };
};

const statusIcon = (assignment: RiderAssignmentOffer) => {
  if (assignment.status === 'ACCEPTED') {
    return <CheckCircle2 size={16} color="#166534" />;
  }
  if (assignment.status === 'REJECTED' || assignment.status === 'CANCELLED') {
    return <XCircle size={16} color="#991B1B" />;
  }
  return <Clock3 size={16} color="#92400E" />;
};

export const RiderHistoryScreen = () => {
  const workspaceQuery = useQuery({
    queryKey: ['rider', 'assignment-history'],
    queryFn: riderService.getWorkspace,
  });

  const assignments = useMemo(
    () => (workspaceQuery.data?.assignmentHistory || []).filter(
      (assignment) => !['CREATED', 'OFFERED'].includes(assignment.status),
    ),
    [workspaceQuery.data?.assignmentHistory],
  );

  const openRoute = (assignment: RiderAssignmentOffer) => {
    const order = assignment.deliveryJob.order;
    if (typeof order.deliveryLat !== 'number' || typeof order.deliveryLng !== 'number') {
      return;
    }
    const destination = `${order.deliveryLat},${order.deliveryLng}`;
    const hasStoreCoords = typeof order.store?.latitude === 'number'
      && typeof order.store?.longitude === 'number';
    const routeUrl = hasStoreCoords
      ? `https://www.google.com/maps/dir/?api=1&origin=${order.store?.latitude},${order.store?.longitude}&destination=${destination}&travelmode=driving`
      : `https://www.google.com/maps/search/?api=1&query=${destination}`;
    void Linking.openURL(routeUrl);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={workspaceQuery.isRefetching}
          onRefresh={() => { void workspaceQuery.refetch(); }}
          tintColor="#0F766E"
        />
      }
    >
      <Text style={styles.eyebrow}>RIDER OPERATIONS</Text>
      <Text style={styles.title}>Assignment History</Text>
      <Text style={styles.subtitle}>
        Accepted, completed, rejected, expired, and cancelled delivery offers.
      </Text>

      {workspaceQuery.isLoading ? (
        <Text style={styles.loading}>Loading assignment history…</Text>
      ) : null}

      {workspaceQuery.error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Could not load history</Text>
          <Text style={styles.errorText}>
            {(workspaceQuery.error as any)?.response?.data?.message
              || (workspaceQuery.error as Error)?.message
              || 'Pull down to try again.'}
          </Text>
        </View>
      ) : null}

      {assignments.map((assignment) => {
        const order = assignment.deliveryJob.order;
        const tone = assignmentTone(assignment);
        const eventTime = assignment.respondedAt
          || assignment.offeredAt
          || assignment.createdAt
          || assignment.deliveryJob.updatedAt;

        return (
          <View key={assignment.id} style={styles.card}>
            <View style={styles.headerRow}>
              <View style={styles.orderHeading}>
                <Package size={17} color="#0F766E" />
                <Text style={styles.orderId}>#{order.id.slice(-8).toUpperCase()}</Text>
              </View>
              <View style={[styles.statusPill, { backgroundColor: tone.backgroundColor }]}>
                {statusIcon(assignment)}
                <Text style={[styles.statusText, { color: tone.color }]}>
                  {assignmentLabel(assignment)}
                </Text>
              </View>
            </View>

            <View style={styles.jobStatusRow}>
              <Text style={styles.jobStatusLabel}>Delivery state</Text>
              <Text style={styles.jobStatusValue}>
                {deliveryStatusLabel(assignment.deliveryJob.status)}
              </Text>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionIcon}>
                <Store size={17} color="#0F766E" />
              </View>
              <View style={styles.sectionBody}>
                <Text style={styles.label}>Pickup</Text>
                <Text style={styles.value}>{order.store?.name || 'Store'}</Text>
                <Text style={styles.sub}>
                  {order.store?.address || 'Store address not available'}
                </Text>
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionIcon}>
                <MapPin size={17} color="#0F766E" />
              </View>
              <View style={styles.sectionBody}>
                <Text style={styles.label}>Destination</Text>
                <Text style={styles.value}>
                  {order.addressSnapshot?.recipientName || 'Customer'}
                </Text>
                <Text style={styles.sub}>{formatAddressText(order.addressSnapshot)}</Text>
              </View>
            </View>

            {assignment.rejectionReason ? (
              <View style={styles.reasonCard}>
                <Text style={styles.reasonLabel}>Reason</Text>
                <Text style={styles.reasonText}>
                  {assignment.rejectionReason.replace(/_/g, ' ')}
                </Text>
              </View>
            ) : null}

            <View style={styles.footerRow}>
              <View style={styles.timeRow}>
                <Clock3 size={14} color="#64748B" />
                <Text style={styles.timeText}>
                  {eventTime ? new Date(eventTime).toLocaleString('en-IN') : 'Time unavailable'}
                </Text>
              </View>
              {typeof order.deliveryLat === 'number'
                && typeof order.deliveryLng === 'number' ? (
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={`Open route for order ${order.id}`}
                    style={styles.routeButton}
                    onPress={() => openRoute(assignment)}
                  >
                    <Navigation size={15} color="#FFFFFF" />
                    <Text style={styles.routeButtonText}>Route</Text>
                  </TouchableOpacity>
                ) : null}
            </View>
          </View>
        );
      })}

      {!workspaceQuery.isLoading && !workspaceQuery.error && assignments.length === 0 ? (
        <View style={styles.empty}>
          <MapPin size={32} color="#94A3B8" />
          <Text style={styles.emptyTitle}>No assignment history yet</Text>
          <Text style={styles.emptyText}>
            Answered and completed delivery offers will appear here.
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { paddingTop: 54, paddingHorizontal: 16, paddingBottom: 112, gap: 12 },
  eyebrow: { color: '#0F766E', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  title: { fontSize: 25, fontWeight: '900', color: '#0F172A' },
  subtitle: { color: '#64748B', marginTop: -5, marginBottom: 6, lineHeight: 20 },
  loading: { color: '#475569', fontWeight: '700', paddingVertical: 18 },
  errorCard: { borderRadius: 18, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2', padding: 16 },
  errorTitle: { color: '#991B1B', fontWeight: '900' },
  errorText: { marginTop: 4, color: '#B91C1C', lineHeight: 19 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 22, borderColor: '#E2E8F0', borderWidth: 1, padding: 16, gap: 13 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  orderHeading: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 },
  orderId: { fontWeight: '900', color: '#0F172A' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6 },
  statusText: { fontSize: 10, fontWeight: '900' },
  jobStatusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 12, backgroundColor: '#F8FAFC', paddingHorizontal: 12, paddingVertical: 9 },
  jobStatusLabel: { color: '#64748B', fontSize: 11, fontWeight: '700' },
  jobStatusValue: { color: '#0F172A', fontSize: 11, fontWeight: '900' },
  section: { flexDirection: 'row', gap: 10 },
  sectionIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#F0FDFA', alignItems: 'center', justifyContent: 'center' },
  sectionBody: { flex: 1, gap: 2 },
  label: { fontSize: 9, fontWeight: '900', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.8 },
  value: { fontSize: 14, fontWeight: '900', color: '#0F172A' },
  sub: { fontSize: 12, color: '#475569', lineHeight: 18 },
  reasonCard: { borderRadius: 12, backgroundColor: '#FFF7ED', paddingHorizontal: 12, paddingVertical: 9 },
  reasonLabel: { color: '#9A3412', fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },
  reasonText: { marginTop: 2, color: '#C2410C', fontSize: 12, fontWeight: '700' },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 },
  timeText: { color: '#64748B', fontSize: 10, fontWeight: '700' },
  routeButton: { borderRadius: 11, backgroundColor: '#0F172A', paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  routeButtonText: { color: '#FFFFFF', fontWeight: '900', fontSize: 11 },
  empty: { marginTop: 28, borderRadius: 22, borderWidth: 1, borderStyle: 'dashed', borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', padding: 32, alignItems: 'center' },
  emptyTitle: { marginTop: 10, color: '#0F172A', fontSize: 16, fontWeight: '900' },
  emptyText: { marginTop: 4, color: '#64748B', textAlign: 'center', lineHeight: 19 },
});
