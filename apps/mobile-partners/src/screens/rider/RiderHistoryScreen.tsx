import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight, PackageCheck, RefreshCw } from 'lucide-react-native';
import React, { useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { riderService } from '../../api/riderService';

const FILTERS = ['ALL', 'DELIVERED', 'DELIVERY_FAILED', 'RETURNED_TO_STORE', 'CANCELLED'] as const;
type Filter = typeof FILTERS[number];
const label = (value: string) => value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const when = (value?: string) => value ? new Date(value).toLocaleString() : 'Time unavailable';

export const RiderHistoryScreen = ({ onBack, onOpenReceipt }: { onBack: () => void; onOpenReceipt: (deliveryJobId: string) => void }) => {
  const [status, setStatus] = useState<Filter>('ALL');
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['rider', 'canonical-history', status, page],
    queryFn: () => riderService.getHistory({ status, page, pageSize: 20 }),
    staleTime: 20_000,
  });
  const data = query.data || { items: [], page: 1, totalPages: 1, total: 0 };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to Rider jobs" style={styles.iconButton} onPress={onBack}><ArrowLeft size={22} color="#0F172A" /></TouchableOpacity>
        <View style={styles.headerText}><Text style={styles.title}>Job history</Text><Text style={styles.subtitle}>Canonical delivery outcomes and secure receipts</Text></View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Refresh history" style={styles.iconButton} onPress={() => query.refetch()}><RefreshCw size={19} color="#087B5B" /></TouchableOpacity>
      </View>

      <FlatList
        horizontal
        data={FILTERS as unknown as Filter[]}
        keyExtractor={(item) => item}
        showsHorizontalScrollIndicator={false}
        style={styles.filters}
        contentContainerStyle={styles.filterContent}
        renderItem={({ item }) => (
          <TouchableOpacity style={[styles.filter, status === item && styles.filterActive]} onPress={() => { setStatus(item); setPage(1); }}>
            <Text style={[styles.filterText, status === item && styles.filterTextActive]}>{item === 'ALL' ? 'All' : label(item)}</Text>
          </TouchableOpacity>
        )}
      />

      {query.isLoading ? <View style={styles.state}><ActivityIndicator color="#087B5B" /><Text style={styles.stateText}>Loading authoritative history…</Text></View> : null}
      {query.isError ? <View style={styles.state}><Text style={styles.errorTitle}>History unavailable</Text><Text style={styles.stateText}>Pull to retry. No local or assignment-derived totals are shown.</Text></View> : null}

      {!query.isLoading && !query.isError ? (
        <FlatList
          data={data.items || []}
          keyExtractor={(item: any) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} />}
          ListEmptyComponent={<View style={styles.state}><PackageCheck size={34} color="#94A3B8" /><Text style={styles.errorTitle}>No terminal jobs</Text><Text style={styles.stateText}>Completed, failed, returned and cancelled jobs will appear here.</Text></View>}
          renderItem={({ item }: { item: any }) => (
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Open receipt for order ${item.orderId}`} style={styles.card} onPress={() => onOpenReceipt(item.id)}>
              <View style={styles.row}><View style={styles.flex}><Text style={styles.order}>Order #{String(item.orderId).slice(-8)}</Text><Text style={styles.store}>{item.store?.name || 'Store'}</Text></View><View style={styles.status}><Text style={styles.statusText}>{label(item.status)}</Text></View></View>
              <Text style={styles.meta}>{when(item.outcomeAt)} · {item.itemCount || 0} items · {item.parcelCount || '—'} parcels</Text>
              <View style={styles.receiptRow}><Text style={styles.receipt}>Backend-owned receipt</Text><ChevronRight size={18} color="#087B5B" /></View>
            </TouchableOpacity>
          )}
          ListFooterComponent={data.totalPages > 1 ? (
            <View style={styles.pagination}>
              <TouchableOpacity disabled={page <= 1} style={[styles.pageButton, page <= 1 && styles.disabled]} onPress={() => setPage((value) => Math.max(1, value - 1))}><Text style={styles.pageText}>Previous</Text></TouchableOpacity>
              <Text style={styles.pageLabel}>Page {data.page || page} of {data.totalPages}</Text>
              <TouchableOpacity disabled={page >= data.totalPages} style={[styles.pageButton, page >= data.totalPages && styles.disabled]} onPress={() => setPage((value) => value + 1)}><Text style={styles.pageText}>Next</Text></TouchableOpacity>
            </View>
          ) : null}
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F7F6' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  iconButton: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9' },
  headerText: { flex: 1 }, title: { color: '#0F172A', fontSize: 21, fontWeight: '900' }, subtitle: { color: '#64748B', fontSize: 12, marginTop: 2 },
  filters: { maxHeight: 62 }, filterContent: { gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  filter: { paddingHorizontal: 14, minHeight: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D7E0DC' },
  filterActive: { backgroundColor: '#087B5B', borderColor: '#087B5B' }, filterText: { color: '#475569', fontSize: 12, fontWeight: '800' }, filterTextActive: { color: '#FFFFFF' },
  list: { padding: 16, gap: 12, paddingBottom: 30 }, card: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#E2E8F0', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 }, flex: { flex: 1 }, order: { color: '#0F172A', fontSize: 16, fontWeight: '900' }, store: { color: '#475569', marginTop: 3, fontWeight: '700' },
  status: { backgroundColor: '#ECFDF5', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6 }, statusText: { color: '#047857', fontSize: 10, fontWeight: '900' }, meta: { color: '#64748B', fontSize: 12 },
  receiptRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, borderTopWidth: 1, borderTopColor: '#EEF2F7' }, receipt: { color: '#087B5B', fontWeight: '900' },
  state: { minHeight: 260, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10 }, stateText: { color: '#64748B', textAlign: 'center' }, errorTitle: { color: '#0F172A', fontSize: 18, fontWeight: '900' },
  pagination: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12 }, pageButton: { minHeight: 42, paddingHorizontal: 16, borderRadius: 12, backgroundColor: '#E6F6F1', alignItems: 'center', justifyContent: 'center' }, disabled: { opacity: 0.4 }, pageText: { color: '#087B5B', fontWeight: '900' }, pageLabel: { color: '#64748B', fontSize: 12, fontWeight: '800' },
});
