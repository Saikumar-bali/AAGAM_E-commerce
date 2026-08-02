import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  SlidersHorizontal,
} from 'lucide-react-native';
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
import { riderService } from '../../api/riderService';
import {
  RiderJobListItem,
  historyItems,
  shortPartnerOrderId,
  startOfLocalWeek,
} from '../../domain/riderReferenceUi';

const HISTORY_KEY = ['rider', 'assignment-history'] as const;
type HistoryFilter = 'ALL' | 'COMPLETED' | 'CANCELLED' | 'RETURNED';

function historyFrom() {
  const value = new Date();
  value.setDate(value.getDate() - 60);
  return value.toISOString();
}

function filterMatches(item: RiderJobListItem, filter: HistoryFilter) {
  if (filter === 'ALL') return true;
  return item.status === filter;
}

function statusVisual(status: RiderJobListItem['status']) {
  if (status === 'COMPLETED') return { label: 'Completed', color: '#148A35', background: '#E8F8E8' };
  if (status === 'RETURNED') return { label: 'Returned', color: '#EB7908', background: '#FFF1E4' };
  if (status === 'CANCELLED') return { label: 'Cancelled', color: '#D51D25', background: '#FFE8E9' };
  if (status === 'IN_PROGRESS') return { label: 'In Progress', color: '#226BD5', background: '#EAF3FF' };
  return { label: 'Assigned', color: '#148A35', background: '#E8F8E8' };
}

function formatDateTime(value: string | null) {
  if (!value) return 'Time unavailable';
  return new Date(value).toLocaleString('en-IN', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function money(value: number | null) {
  return value == null
    ? '—'
    : `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateRangeLabel() {
  const end = new Date();
  const start = startOfLocalWeek(end);
  return `${start.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

export const RiderHistoryScreen = ({ onBack }: { onBack?: () => void }) => {
  const [filter, setFilter] = useState<HistoryFilter>('ALL');
  const workspaceQuery = useQuery({
    queryKey: [...HISTORY_KEY, historyFrom()],
    queryFn: () => riderService.getWorkspaceSince(historyFrom()),
  });
  const allItems = useMemo(() => historyItems(workspaceQuery.data), [workspaceQuery.data]);
  const filteredItems = useMemo(
    () => allItems.filter((item) => filterMatches(item, filter)),
    [allItems, filter],
  );
  const counts = useMemo(() => ({
    completed: allItems.filter((item) => item.status === 'COMPLETED').length,
    cancelled: allItems.filter((item) => item.status === 'CANCELLED').length,
    returned: allItems.filter((item) => item.status === 'RETURNED').length,
  }), [allItems]);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#067B5C" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={(
          <RefreshControl
            refreshing={workspaceQuery.isRefetching}
            onRefresh={() => void workspaceQuery.refetch()}
            tintColor="#FFFFFF"
          />
        )}
      >
        <View style={styles.hero}>
          <View style={styles.headerRow}>
            <TouchableOpacity accessibilityLabel="Back to jobs" style={styles.headerIcon} onPress={onBack}>
              <ArrowLeft size={31} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.title}>Delivery History</Text>
            <View style={styles.headerIcon}><SlidersHorizontal size={29} color="#FFFFFF" /></View>
          </View>

          <View style={styles.filters}>
            <HistoryFilterButton label="All" active={filter === 'ALL'} onPress={() => setFilter('ALL')} />
            <HistoryFilterButton label="Completed" active={filter === 'COMPLETED'} onPress={() => setFilter('COMPLETED')} />
            <HistoryFilterButton label="Cancelled" active={filter === 'CANCELLED'} onPress={() => setFilter('CANCELLED')} />
            <HistoryFilterButton label="Returned" active={filter === 'RETURNED'} onPress={() => setFilter('RETURNED')} />
          </View>

          <View style={styles.rangeCard}>
            <CalendarDays size={22} color="#596168" />
            <Text style={styles.rangeText}>{dateRangeLabel()}</Text>
            <ChevronDown size={24} color="#596168" />
          </View>
        </View>

        <View style={styles.summaryCard}>
          <Summary value={counts.completed} label="Completed" color="#0D8B2E" />
          <View style={styles.summaryDivider} />
          <Summary value={counts.cancelled} label="Cancelled" color="#D51D25" />
          <View style={styles.summaryDivider} />
          <Summary value={counts.returned} label="Returned" color="#EB7908" />
        </View>

        <View style={styles.listArea}>
          {workspaceQuery.isLoading ? (
            <View style={styles.stateCard}>
              <ActivityIndicator size="large" color="#078D63" />
              <Text style={styles.stateText}>Loading delivery history…</Text>
            </View>
          ) : workspaceQuery.isError ? (
            <View style={styles.stateCard}>
              <Text style={styles.stateTitle}>History unavailable</Text>
              <Text style={styles.stateText}>{(workspaceQuery.error as Error)?.message || 'Pull down to try again.'}</Text>
            </View>
          ) : filteredItems.length === 0 ? (
            <View style={styles.stateCard}>
              <Text style={styles.stateTitle}>No deliveries in this view</Text>
              <Text style={styles.stateText}>Completed, cancelled and returned jobs will appear here.</Text>
            </View>
          ) : (
            filteredItems.map((item) => <HistoryCard key={item.key} item={item} />)
          )}
        </View>
      </ScrollView>
    </View>
  );
};

function HistoryFilterButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.filterButton, active && styles.filterButtonActive]}
      onPress={onPress}
    >
      <Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Summary({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function HistoryCard({ item }: { item: RiderJobListItem }) {
  const visual = statusVisual(item.status);
  return (
    <View testID="rider_history_card" style={styles.historyCard}>
      <View style={styles.cardTopRow}>
        <Text style={styles.cardDate}>{formatDateTime(item.time)}</Text>
        <Text style={styles.cardOrder}>#J-{shortPartnerOrderId(item.orderId)}</Text>
        <View style={[styles.statusPill, { backgroundColor: visual.background }]}>
          <Text style={[styles.statusText, { color: visual.color }]}>{visual.label}</Text>
        </View>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.routeTimeline}>
          <View style={[styles.routeDot, { borderColor: visual.color }]}><View style={[styles.routeDotInner, { backgroundColor: visual.color }]} /></View>
          <View style={styles.routeLine} />
          <View style={[styles.routeDot, { borderColor: visual.color }]}><View style={[styles.routeDotInner, { backgroundColor: visual.color }]} /></View>
        </View>
        <View style={styles.routeCopy}>
          <View>
            <Text style={styles.routeLabel}>Pickup</Text>
            <Text style={styles.routeName}>{item.pickupName}</Text>
            <Text style={styles.routeAddress}>{item.pickupAddress}</Text>
          </View>
          <View>
            <Text style={styles.routeLabel}>Delivery</Text>
            <Text style={styles.routeName}>{item.deliveryAddress}</Text>
          </View>
        </View>
        <View style={styles.cardRight}>
          <ChevronRight size={25} color="#4E555A" />
          <Text style={styles.payout}>{money(item.payout)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F8F7' },
  scroll: { flex: 1 },
  content: { paddingBottom: 112 },
  hero: { backgroundColor: '#067B5C', paddingTop: 50, paddingHorizontal: 14, paddingBottom: 68 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  headerIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, color: '#FFFFFF', fontSize: 22, fontWeight: '900', marginLeft: 8 },
  filters: { flexDirection: 'row', gap: 10, marginTop: 14 },
  filterButton: { flex: 1, height: 44, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.32)', alignItems: 'center', justifyContent: 'center' },
  filterButtonActive: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },
  filterText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  filterTextActive: { color: '#087150' },
  rangeCard: { height: 60, borderRadius: 15, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, marginTop: 14 },
  rangeText: { flex: 1, color: '#555D63', fontSize: 14, fontWeight: '600' },
  summaryCard: { marginHorizontal: 14, marginTop: -49, height: 91, borderRadius: 17, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', elevation: 4, borderWidth: 1, borderColor: '#E0E3E2' },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: 28, fontWeight: '900' },
  summaryLabel: { color: '#4A5055', fontSize: 13, marginTop: 4 },
  summaryDivider: { width: 1, height: 52, backgroundColor: '#E2E4E3' },
  listArea: { paddingHorizontal: 14, paddingTop: 12 },
  historyCard: { borderRadius: 17, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E4E3', padding: 14, marginBottom: 11, elevation: 2 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardDate: { color: '#343A3E', fontSize: 12, flex: 1 },
  cardOrder: { color: '#171A1C', fontSize: 13, fontWeight: '900' },
  statusPill: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  statusText: { fontSize: 11, fontWeight: '900' },
  cardBody: { flexDirection: 'row', marginTop: 13, minHeight: 94 },
  routeTimeline: { width: 34, alignItems: 'center', paddingVertical: 3 },
  routeDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  routeDotInner: { width: 7, height: 7, borderRadius: 4 },
  routeLine: { width: 1, flex: 1, borderLeftWidth: 1, borderColor: '#B7C1BC', borderStyle: 'dashed' },
  routeCopy: { flex: 1, justifyContent: 'space-between' },
  routeLabel: { color: '#0A913B', fontSize: 11, fontWeight: '800' },
  routeName: { color: '#171A1C', fontSize: 14, fontWeight: '700', marginTop: 2 },
  routeAddress: { color: '#555D63', fontSize: 11, marginTop: 1 },
  cardRight: { width: 70, alignItems: 'flex-end', justifyContent: 'space-between' },
  payout: { color: '#111111', fontSize: 14, fontWeight: '900' },
  stateCard: { minHeight: 250, alignItems: 'center', justifyContent: 'center', padding: 24 },
  stateTitle: { color: '#111827', fontSize: 18, fontWeight: '900' },
  stateText: { color: '#6B7470', textAlign: 'center', marginTop: 7 },
});
