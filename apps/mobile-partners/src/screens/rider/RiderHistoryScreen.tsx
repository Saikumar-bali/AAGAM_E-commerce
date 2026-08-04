import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, ChevronRight, RefreshCw } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { riderService } from '../../api/riderService';

type HistoryStatus = 'ALL' | 'DELIVERED' | 'DELIVERY_FAILED' | 'CANCELLED' | 'RETURNED_TO_STORE';
type RangePreset = 7 | 30 | 90 | 'ALL';

const STATUS_OPTIONS: Array<{ value: HistoryStatus; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'DELIVERY_FAILED', label: 'Failed' },
  { value: 'RETURNED_TO_STORE', label: 'Returned' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const RANGE_OPTIONS: Array<{ value: RangePreset; label: string }> = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 'ALL', label: 'All time' },
];

function rangeParams(range: RangePreset) {
  if (range === 'ALL') return {};
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - (range - 1));
  return { from: from.toISOString(), to: new Date().toISOString() };
}

function statusVisual(status: string) {
  if (status === 'DELIVERED') return { label: 'Delivered', color: '#15803D', background: '#DCFCE7' };
  if (status === 'RETURNED_TO_STORE') return { label: 'Returned', color: '#C2410C', background: '#FFEDD5' };
  if (status === 'DELIVERY_FAILED') return { label: 'Failed', color: '#B91C1C', background: '#FEE2E2' };
  return { label: 'Cancelled', color: '#7C3AED', background: '#EDE9FE' };
}

function money(value: unknown) {
  return `₹${(Number(value || 0) / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function address(job: any) {
  const snapshot = job?.order?.addressSnapshot || {};
  return [snapshot.line1, snapshot.landmark, snapshot.city].filter(Boolean).join(', ') || 'Delivery address unavailable';
}

export const RiderHistoryScreen = ({
  onBack,
  onOpenDetail,
}: {
  onBack?: () => void;
  onOpenDetail?: (deliveryJobId: string) => void;
}) => {
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<HistoryStatus>('ALL');
  const [range, setRange] = useState<RangePreset>(30);
  const params = useMemo(() => ({ status, ...rangeParams(range) }), [range, status]);
  const query = useQuery({
    queryKey: ['rider', 'canonical-history', params],
    queryFn: () => riderService.getHistory(params),
    retry: 1,
  });
  const jobs: any[] = Array.isArray(query.data) ? query.data : [];

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#067B5C" />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to Rider jobs" style={styles.headerButton} onPress={onBack}>
          <ArrowLeft size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.flex}>
          <Text allowFontScaling style={styles.eyebrow}>AUTHORITATIVE RECORDS</Text>
          <Text allowFontScaling style={styles.title}>Delivery history</Text>
        </View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Refresh delivery history" style={styles.headerButton} onPress={() => void query.refetch()}>
          <RefreshCw size={21} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRail}
        contentContainerStyle={styles.filterContent}
      >
        {STATUS_OPTIONS.map((option) => (
          <TouchableOpacity
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: status === option.value }}
            style={[styles.chip, status === option.value && styles.chipActive]}
            onPress={() => setStatus(option.value)}
          >
            <Text style={[styles.chipText, status === option.value && styles.chipTextActive]}>{option.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.rangeArea}>
        <CalendarDays size={19} color="#0F766E" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rangeRail}>
          {RANGE_OPTIONS.map((option) => (
            <TouchableOpacity
              key={String(option.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: range === option.value }}
              style={[styles.rangeButton, range === option.value && styles.rangeButtonActive]}
              onPress={() => setRange(option.value)}
            >
              <Text style={[styles.rangeText, range === option.value && styles.rangeTextActive]}>{option.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
      >
        <Text style={styles.resultText}>{jobs.length} canonical record{jobs.length === 1 ? '' : 's'}</Text>
        {query.isLoading ? (
          <State icon={<ActivityIndicator size="large" color="#0F766E" />} title="Loading history" text="Reading Rider-owned delivery records from the server." />
        ) : query.isError ? (
          <State title="History unavailable" text={(query.error as Error)?.message || 'Pull down to retry.'} />
        ) : jobs.length === 0 ? (
          <State title="No matching deliveries" text="Change the server-side status or date range filters." />
        ) : jobs.map((job) => {
          const visual = statusVisual(String(job.status));
          return (
            <TouchableOpacity
              key={job.id}
              testID={`rider_history_${job.id}`}
              accessibilityRole="button"
              accessibilityLabel={`Open delivery ${String(job.orderId).slice(-8)} details`}
              style={styles.card}
              onPress={() => onOpenDetail?.(job.id)}
            >
              <View style={styles.cardHeader}>
                <View style={styles.flex}>
                  <Text style={styles.orderCode}>ORDER #{String(job.orderId).slice(-8).toUpperCase()}</Text>
                  <Text style={styles.date}>{new Date(job.updatedAt).toLocaleString('en-IN')}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: visual.background }]}>
                  <Text style={[styles.badgeText, { color: visual.color }]}>{visual.label}</Text>
                </View>
              </View>
              <Text style={styles.store}>{job.order?.store?.name || 'Pickup store'}</Text>
              <Text style={styles.address}>{address(job)}</Text>
              <View style={styles.cardFooter}>
                <Text style={styles.amount}>{money(job.order?.grandTotalPaise)}</Text>
                <View style={styles.openRow}><Text style={styles.openText}>Details and receipt</Text><ChevronRight size={20} color="#0F766E" /></View>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

function State({ icon, title, text }: { icon?: React.ReactNode; title: string; text: string }) {
  return (
    <View style={styles.state}>
      {icon}
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  flex: { flex: 1 },
  header: { backgroundColor: '#067B5C', paddingHorizontal: 16, paddingBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: '#A7F3D0', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  title: { color: '#FFFFFF', fontSize: 25, fontWeight: '900', marginTop: 2 },
  filterRail: { flexGrow: 0, backgroundColor: '#FFFFFF' },
  filterContent: { paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
  chip: { minHeight: 40, borderRadius: 20, borderWidth: 1, borderColor: '#CBD5E1', paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center' },
  chipActive: { backgroundColor: '#0F766E', borderColor: '#0F766E' },
  chipText: { color: '#475569', fontSize: 12, fontWeight: '800' },
  chipTextActive: { color: '#FFFFFF' },
  rangeArea: { backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E2E8F0', borderBottomWidth: 1, borderBottomColor: '#E2E8F0', paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 9 },
  rangeRail: { gap: 7 },
  rangeButton: { minHeight: 34, borderRadius: 10, backgroundColor: '#F1F5F9', paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  rangeButtonActive: { backgroundColor: '#CCFBF1' },
  rangeText: { color: '#64748B', fontSize: 11, fontWeight: '800' },
  rangeTextActive: { color: '#0F766E' },
  list: { flex: 1 },
  listContent: { padding: 14 },
  resultText: { color: '#64748B', fontSize: 11, fontWeight: '700', marginBottom: 9 },
  card: { borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 15, marginBottom: 11 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  orderCode: { color: '#0F172A', fontSize: 13, fontWeight: '900' },
  date: { color: '#64748B', fontSize: 11, marginTop: 3 },
  badge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  badgeText: { fontSize: 10, fontWeight: '900' },
  store: { color: '#0F766E', fontSize: 14, fontWeight: '900', marginTop: 13 },
  address: { color: '#475569', fontSize: 12, lineHeight: 18, marginTop: 4 },
  cardFooter: { borderTopWidth: 1, borderTopColor: '#E2E8F0', marginTop: 13, paddingTop: 12, flexDirection: 'row', alignItems: 'center' },
  amount: { flex: 1, color: '#0F172A', fontSize: 16, fontWeight: '900' },
  openRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  openText: { color: '#0F766E', fontSize: 12, fontWeight: '800' },
  state: { minHeight: 280, alignItems: 'center', justifyContent: 'center', padding: 30 },
  stateTitle: { color: '#0F172A', fontSize: 18, fontWeight: '900', marginTop: 12, textAlign: 'center' },
  stateText: { color: '#64748B', fontSize: 12, lineHeight: 18, marginTop: 6, textAlign: 'center' },
});
