import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ArrowLeft, CalendarDays, ChevronRight, IndianRupee, Pause, Users, UserPlus } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { subscriptionOperationsService } from '../../api/subscriptionOperationsService';

type Segment = 'Active' | 'Paused' | 'Cancelled' | 'All';

const SEGMENTS: Segment[] = ['Active', 'Paused', 'Cancelled', 'All'];
const STATUS_GROUPS: Record<Segment, string[]> = {
  Active: ['ACTIVE', 'PAYMENT_DUE', 'GRACE_PERIOD', 'PENDING_CASH_COLLECTION'],
  Paused: ['PAUSED'],
  Cancelled: ['CANCELLED', 'COMPLETED'],
  All: [],
};

function money(paise: number) {
  return `₹${(Number(paise || 0) / 100).toLocaleString('en-IN')}`;
}

function date(value?: string | null) {
  return value ? new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—';
}

export const StoreSubscribersScreen = ({ navigation }: { navigation: any }) => {
  const insets = useSafeAreaInsets();
  const [segment, setSegment] = useState<Segment>('Active');
  const query = useQuery({
    queryKey: ['store-subscribers'],
    queryFn: subscriptionOperationsService.getSubscribers,
    retry: 1,
  });

  const subscribers = Array.isArray(query.data) ? query.data : [];
  const counts = useMemo(() => {
    const c: Record<Segment, number> = { Active: 0, Paused: 0, Cancelled: 0, All: subscribers.length };
    for (const sub of subscribers) {
      if (STATUS_GROUPS.Active.includes(sub.status)) c.Active++;
      else if (STATUS_GROUPS.Paused.includes(sub.status)) c.Paused++;
      else if (STATUS_GROUPS.Cancelled.includes(sub.status)) c.Cancelled++;
    }
    return c;
  }, [subscribers]);

  const rows = useMemo(() => {
    if (segment === 'All') return subscribers;
    return subscribers.filter((sub: any) => STATUS_GROUPS[segment].includes(sub.status));
  }, [subscribers, segment]);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#0F766E" />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
          <ArrowLeft size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>SUBSCRIPTION MANAGEMENT</Text>
          <Text style={styles.title}>Subscribers</Text>
        </View>
        <View style={styles.countBadge}>
          <Users size={18} color="#FFFFFF" />
          <Text style={styles.countText}>{subscribers.length}</Text>
        </View>
      </View>

      <View style={styles.segmentRow}>
        {SEGMENTS.map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.segment, segment === s && styles.segmentActive]}
            onPress={() => setSegment(s)}
          >
            <Text style={[styles.segmentText, segment === s && styles.segmentTextActive]}>{s}</Text>
            <View style={[styles.segmentCount, segment === s && styles.segmentCountActive]}>
              <Text style={[styles.segmentCountText, segment === s && styles.segmentCountTextActive]}>{counts[s]}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={styles.addOfflineBtn}
        onPress={() => navigation.navigate('StoreOfflineCustomer' as never)}
        activeOpacity={0.8}
      >
        <UserPlus size={16} color="#FFFFFF" />
        <Text style={styles.addOfflineText}>Add Offline Customer</Text>
      </TouchableOpacity>

      {query.isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#0F766E" /><Text style={styles.muted}>Loading subscribers…</Text></View>
      ) : query.isError ? (
        <View style={styles.center}><Text style={styles.errorTitle}>Couldn't load subscribers</Text><Text style={styles.muted}>Pull down to retry.</Text></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item: any) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Users size={40} color="#94A3B8" />
              <Text style={styles.emptyTitle}>No {segment.toLowerCase()} subscribers</Text>
              <Text style={styles.emptyText}>Subscribers will appear here when customers sign up.</Text>
            </View>
          }
          renderItem={({ item }: { item: any }) => (
            <TouchableOpacity style={styles.card} activeOpacity={0.85}>
              <View style={styles.cardTop}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{(item.customer?.name || 'C').slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.name}>{item.customer?.name || 'Customer'}</Text>
                  <Text style={styles.plan}>{item.plan?.name || 'Subscription'}</Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: item.status === 'ACTIVE' ? '#D1FAE5' : item.status === 'PAUSED' ? '#FEF3C7' : '#FEE2E2' }]}>
                  <Text style={[styles.statusText, { color: item.status === 'ACTIVE' ? '#047857' : item.status === 'PAUSED' ? '#B45309' : '#B91C1C' }]}>{item.status?.replaceAll('_', ' ')}</Text>
                </View>
              </View>
              <View style={styles.cardMeta}>
                <View style={styles.metaItem}>
                  <CalendarDays size={14} color="#64748B" />
                  <Text style={styles.metaText}>Next: {date(item.nextDeliveryDate)}</Text>
                </View>
                <View style={styles.metaItem}>
                  <IndianRupee size={14} color="#64748B" />
                  <Text style={styles.metaText}>Due: {money(item.amountDuePaise)}</Text>
                </View>
                <View style={styles.metaItem}>
                  <Pause size={14} color="#64748B" />
                  <Text style={styles.metaText}>Funded: {item.remainingFundedDeliveries}</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  flex: { flex: 1 },
  header: { backgroundColor: '#0F766E', paddingHorizontal: 18, paddingBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: '#A7F3D0', fontSize: 9, fontWeight: '600', letterSpacing: 1 },
  title: { color: '#FFFFFF', fontSize: 24, fontWeight: '600', marginTop: 2 },
  countBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  countText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  segmentRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, gap: 8, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  segment: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 12, borderRadius: 12, backgroundColor: '#F1F5F9' },
  segmentActive: { backgroundColor: '#CCFBF1' },
  segmentText: { fontSize: 11, fontWeight: '600', color: '#64748B' },
  segmentTextActive: { color: '#0F766E' },
  segmentCount: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  segmentCountActive: { backgroundColor: '#0F766E' },
  segmentCountText: { fontSize: 10, fontWeight: '600', color: '#64748B' },
  segmentCountTextActive: { color: '#FFFFFF' },
  list: { padding: 16, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  muted: { color: '#64748B', fontSize: 13 },
  errorTitle: { color: '#0F172A', fontSize: 18, fontWeight: '600' },
  empty: { alignItems: 'center', padding: 40, gap: 8 },
  emptyTitle: { color: '#0F172A', fontSize: 16, fontWeight: '600' },
  emptyText: { color: '#64748B', fontSize: 13, textAlign: 'center' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#CCFBF1', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#0F766E', fontSize: 20, fontWeight: '600' },
  name: { color: '#0F172A', fontSize: 16, fontWeight: '600' },
  plan: { color: '#64748B', fontSize: 12, marginTop: 2 },
  statusPill: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 },
  statusText: { fontSize: 10, fontWeight: '600' },
  cardMeta: { flexDirection: 'row', marginTop: 12, gap: 16 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { color: '#475569', fontSize: 11 },
  addOfflineBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#0F766E', marginHorizontal: 16, marginVertical: 8, paddingVertical: 12, borderRadius: 14 },
  addOfflineText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
});
