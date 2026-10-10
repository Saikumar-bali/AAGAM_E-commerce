import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ArrowLeft, CalendarDays, ChevronRight, IndianRupee, Layers, Search, Settings2, Truck, UserPlus, Users, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { subscriptionOperationsService } from '../../api/subscriptionOperationsService';
import { isOfflineSubscription } from '@aagam/utils';
import { GradientSurface } from '../../components/GradientSurface';
import { elevation, palette, radius, spacing } from '../../design/tokens';
import { ManageSubscriberSheet } from './ManageSubscriberSheet';

type Segment = 'Active' | 'Paused' | 'Cancelled' | 'All';
type Source = 'All' | 'Online' | 'Offline';

const SEGMENTS: Segment[] = ['Active', 'Paused', 'Cancelled', 'All'];
const SOURCES: Source[] = ['All', 'Online', 'Offline'];
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

function statusTone(status?: string) {
  const s = String(status || '').toUpperCase();
  if (s === 'ACTIVE') return { bg: palette.green100, fg: palette.green700 };
  if (s === 'PAUSED' || s === 'GRACE_PERIOD') return { bg: palette.amber100, fg: palette.amber700 };
  if (s === 'PENDING_CASH_COLLECTION' || s === 'PAYMENT_DUE') return { bg: palette.blue100, fg: palette.blue700 };
  return { bg: palette.rose100, fg: palette.rose700 };
}

export const StoreSubscribersScreen = ({ navigation }: { navigation: any }) => {
  const insets = useSafeAreaInsets();
  const [segment, setSegment] = useState<Segment>('Active');
  const [source, setSource] = useState<Source>('All');
  const [search, setSearch] = useState('');
  const [managing, setManaging] = useState<any | null>(null);

  const query = useQuery({
    queryKey: ['store-subscribers'],
    queryFn: subscriptionOperationsService.getSubscriberSnapshot,
    retry: 1,
  });
  // Cancelled contracts are only returned when `?status=cancelled` is passed;
  // fetch them lazily so the Cancelled segment can actually match rows.
  const cancelledQuery = useQuery({
    queryKey: ['store-subscribers-cancelled'],
    queryFn: () => subscriptionOperationsService.getSubscribers('cancelled'),
    retry: 1,
    enabled: segment === 'Cancelled',
  });
  const plansQuery = useQuery({
    queryKey: ['store-subscription-plans'],
    queryFn: subscriptionOperationsService.getPlans,
    retry: 1,
  });

  const liveSubscribers = Array.isArray(query.data?.subscribers) ? query.data!.subscribers : [];
  const subscribers = segment === 'Cancelled'
    ? (Array.isArray(cancelledQuery.data) ? cancelledQuery.data : [])
    : liveSubscribers;
  const activeQuery = segment === 'Cancelled' ? cancelledQuery : query;
  const plans = Array.isArray(plansQuery.data) ? plansQuery.data : [];

  const counts = useMemo(() => {
    const server = query.data?.counts || {};
    return {
      Active: Number(server.active ?? 0),
      Paused: Number(server.paused ?? 0),
      Cancelled: Number(server.cancelled ?? 0),
      All: Number(server.total ?? liveSubscribers.length),
    } as Record<Segment, number>;
  }, [query.data, liveSubscribers.length]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return subscribers.filter((sub: any) => {
      if (segment !== 'All' && !STATUS_GROUPS[segment].includes(sub.status)) return false;
      if (source !== 'All') {
        const offline = isOfflineSubscription(sub);
        if (offline !== (source === 'Offline')) return false;
      }
      if (needle) {
        const hay = `${sub.customer?.name || ''} ${sub.customer?.phone || ''} ${sub.plan?.name || ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [subscribers, segment, source, search]);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={palette.teal700} />
      <GradientSurface preset="teal" style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()} accessibilityLabel="Go back">
          <ArrowLeft size={21} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>SUBSCRIPTION MANAGEMENT</Text>
          <Text style={styles.title}>Subscribers</Text>
        </View>
        <View style={styles.countBadge}>
          <Users size={17} color="#FFFFFF" />
          <Text style={styles.countText}>{subscribers.length}</Text>
        </View>
      </GradientSurface>

      <View style={styles.searchRow}>
        <Search size={16} color={palette.slate400} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search name, phone or plan…"
          placeholderTextColor={palette.slate400}
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')} accessibilityLabel="Clear search">
            <X size={16} color={palette.slate400} />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.segmentRow}>
        {SEGMENTS.map((s) => (
          <TouchableOpacity key={s} style={[styles.segment, segment === s && styles.segmentActive]} onPress={() => setSegment(s)}>
            <Text style={[styles.segmentText, segment === s && styles.segmentTextActive]}>{s}</Text>
            <View style={[styles.segmentCount, segment === s && styles.segmentCountActive]}>
              <Text style={[styles.segmentCountText, segment === s && styles.segmentCountTextActive]}>{counts[s]}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sourceRow}>
        {SOURCES.map((s) => (
          <TouchableOpacity key={s} style={[styles.sourceChip, source === s && styles.sourceChipActive]} onPress={() => setSource(s)}>
            <Text style={[styles.sourceText, source === s && styles.sourceTextActive]}>{s}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.addOfflineBtn} onPress={() => navigation.navigate('StoreOfflineCustomer' as never)} activeOpacity={0.85}>
          <UserPlus size={15} color="#FFFFFF" />
          <Text style={styles.addOfflineText}>Add Offline Customer</Text>
        </TouchableOpacity>
      </ScrollView>

      {activeQuery.isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={palette.teal700} /><Text style={styles.muted}>Loading subscribers…</Text></View>
      ) : activeQuery.isError ? (
        <View style={styles.center}><Text style={styles.errorTitle}>Couldn't load subscribers</Text><Text style={styles.muted}>Pull down to retry.</Text></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item: any) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={activeQuery.isRefetching} onRefresh={() => void activeQuery.refetch()} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Users size={40} color={palette.slate400} />
              <Text style={styles.emptyTitle}>No {segment.toLowerCase()} subscribers</Text>
              <Text style={styles.emptyText}>Subscribers appear here when customers sign up, or adjust your filters.</Text>
            </View>
          }
          renderItem={({ item }: { item: any }) => {
            const tone = statusTone(item.status);
            const plan = item.plan?.name || 'Subscription';
            const slot = String(item.slot || item.planVersion?.deliverySlot || '').trim();
            const due = Number(item.amountDuePaise || 0);
            const funded = item.fundedDeliveryCount || item.planVersion?.totalDeliveries || item.remainingFundedDeliveries || 0;
            const completed = item.completedDeliveries || 0;
            const storeDelivery = item.storeDelivery ?? item.deliveryMode === 'STORE';
            return (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{(item.customer?.name || 'C').slice(0, 1).toUpperCase()}</Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.name}>{item.customer?.name || 'Customer'}</Text>
                    <Text style={styles.plan}>{plan}{slot ? ` · ${slot}` : ''}</Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
                    <Text style={[styles.statusText, { color: tone.fg }]}>{String(item.status || '').replaceAll('_', ' ')}</Text>
                  </View>
                </View>

                <View style={styles.cardMeta}>
                  <View style={styles.metaItem}>
                    <CalendarDays size={13} color={palette.slate500} />
                    <Text style={styles.metaText}>Next {date(item.nextDeliveryDate)}</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Layers size={13} color={palette.slate500} />
                    <Text style={styles.metaText}>{completed}/{funded || '—'}</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Truck size={13} color={palette.slate500} />
                    <Text style={styles.metaText}>{storeDelivery ? 'Store' : 'Rider'}</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <IndianRupee size={13} color={due > 0 ? palette.rose700 : palette.slate500} />
                    <Text style={[styles.metaText, due > 0 && { color: palette.rose700, fontWeight: '600' }]}>Due {money(due)}</Text>
                  </View>
                </View>

                <View style={styles.cardActions}>
                  <TouchableOpacity style={styles.ghostBtn} onPress={() => navigation.navigate('StoreMilkGrid' as never)}>
                    <CalendarDays size={15} color={palette.teal700} />
                    <Text style={styles.ghostText}>Track</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.primaryBtn} onPress={() => setManaging(item)}>
                    <Settings2 size={15} color="#FFFFFF" />
                    <Text style={styles.primaryText}>Manage</Text>
                    <ChevronRight size={15} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}

      <ManageSubscriberSheet
        key={managing?.id || 'closed'}
        sub={managing}
        plans={plans}
        onClose={() => setManaging(null)}
        onChanged={() => { void query.refetch(); void cancelledQuery.refetch(); }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.slate050 },
  flex: { flex: 1, minWidth: 0 },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  back: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: '#A7F3D0', fontSize: 9, fontWeight: '700', letterSpacing: 1.2 },
  title: { color: '#FFFFFF', fontSize: 24, fontWeight: '600', marginTop: 2 },
  countBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.16)', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.sm },
  countText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: palette.white, marginHorizontal: spacing.lg, marginTop: spacing.md, paddingHorizontal: spacing.md, borderRadius: radius.sm, borderWidth: 1, borderColor: palette.slate200 },
  searchInput: { flex: 1, paddingVertical: spacing.md, color: palette.slate900, fontSize: 13.5 },
  segmentRow: { flexDirection: 'row', paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
  segment: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: spacing.sm, borderRadius: radius.sm, backgroundColor: palette.slate100 },
  segmentActive: { backgroundColor: palette.teal100 },
  segmentText: { fontSize: 11, fontWeight: '600', color: palette.slate500 },
  segmentTextActive: { color: palette.teal700 },
  segmentCount: { minWidth: 20, height: 18, borderRadius: 9, backgroundColor: palette.slate200, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  segmentCountActive: { backgroundColor: palette.teal700 },
  segmentCountText: { fontSize: 10, fontWeight: '600', color: palette.slate500 },
  segmentCountTextActive: { color: '#FFFFFF' },
  sourceRow: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, alignItems: 'center' },
  sourceChip: { paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: palette.white, borderWidth: 1, borderColor: palette.slate200 },
  sourceChipActive: { backgroundColor: palette.teal700, borderColor: palette.teal700 },
  sourceText: { fontSize: 12, fontWeight: '600', color: palette.slate600 },
  sourceTextActive: { color: '#FFFFFF' },
  addOfflineBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: palette.teal700, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill },
  addOfflineText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  list: { padding: spacing.lg, gap: spacing.md, paddingBottom: 60 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.sm },
  muted: { color: palette.slate500, fontSize: 13 },
  errorTitle: { color: palette.slate900, fontSize: 18, fontWeight: '600' },
  empty: { alignItems: 'center', padding: spacing.xxxl, gap: spacing.sm },
  emptyTitle: { color: palette.slate900, fontSize: 16, fontWeight: '600' },
  emptyText: { color: palette.slate500, fontSize: 13, textAlign: 'center' },
  card: { backgroundColor: palette.white, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: palette.slate200, ...elevation.card },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: palette.teal100, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: palette.teal700, fontSize: 20, fontWeight: '700' },
  name: { color: palette.slate900, fontSize: 16, fontWeight: '600' },
  plan: { color: palette.slate500, fontSize: 12, marginTop: 2 },
  statusPill: { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill },
  statusText: { fontSize: 9.5, fontWeight: '700', letterSpacing: 0.3 },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.md, gap: spacing.md },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { color: palette.slate600, fontSize: 11.5 },
  cardActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  ghostBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.sm, borderWidth: 1, borderColor: palette.teal700, flex: 1 },
  ghostText: { color: palette.teal700, fontSize: 12.5, fontWeight: '700' },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.sm, backgroundColor: palette.teal700, flex: 1.4 },
  primaryText: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '700' },
});
