import React, { useMemo } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ArrowLeft, Banknote, ClipboardCheck, Package, RefreshCw, Repeat, Truck, Users } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { subscriptionOperationsService } from '../../api/subscriptionOperationsService';
import { GradientSurface } from '../../components/GradientSurface';
import { palette, radius, spacing } from '../../design/tokens';

function money(paise: number) {
  return `₹${(Number(paise || 0) / 100).toLocaleString('en-IN')}`;
}
function humanize(s: string) {
  return String(s || '').toLowerCase().replaceAll('_', ' ').replace(/^\w/, (c) => c.toUpperCase());
}

function Card({ icon: Icon, label, value, tone }: { icon: any; label: string; value: string; tone?: string }) {
  return (
    <View style={styles.card}>
      <View style={[styles.cardIcon, { backgroundColor: (tone || palette.teal700) + '1A' }]}>
        <Icon size={17} color={tone || palette.teal700} />
      </View>
      <Text style={styles.cardValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.cardLabel}>{label}</Text>
    </View>
  );
}

function Table({ title, rows }: { title: string; rows: Array<{ status: string; count: number }> }) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  return (
    <View style={styles.table}>
      <Text style={styles.tableTitle}>{title}</Text>
      {rows.length === 0 ? (
        <Text style={styles.tableEmpty}>No data</Text>
      ) : (
        rows.map((r, i) => (
          <View key={r.status} style={[styles.tableRow, i < rows.length - 1 && styles.tableRowDivider]}>
            <Text style={styles.tableStatus}>{humanize(r.status)}</Text>
            <View style={styles.tableBarWrap}>
              <View style={[styles.tableBar, { width: `${total ? Math.round((r.count / total) * 100) : 0}%` }]} />
            </View>
            <Text style={styles.tableCount}>{r.count}</Text>
          </View>
        ))
      )}
    </View>
  );
}

export const StoreAnalyticsScreen = ({ navigation }: { navigation: any }) => {
  const insets = useSafeAreaInsets();
  const query = useQuery({
    queryKey: ['store-analytics'],
    queryFn: subscriptionOperationsService.getAnalytics,
    retry: 1,
  });

  const data = query.data || {};
  const subscriptions: any[] = Array.isArray(data.subscriptions) ? data.subscriptions : [];
  const deliveries: any[] = Array.isArray(data.deliveries) ? data.deliveries : [];
  const cash: any[] = Array.isArray(data.cash) ? data.cash : [];

  const stats = useMemo(() => {
    const activeSubs = subscriptions.filter((s) => String(s.status).toUpperCase() === 'ACTIVE').reduce((a, s) => a + (s._count?._all || 0), 0);
    const totalSubs = subscriptions.reduce((a, s) => a + (s._count?._all || 0), 0);
    const collected = subscriptions.reduce((a, s) => a + (s._sum?.amountCollectedPaise || 0), 0);
    const due = subscriptions.reduce((a, s) => a + (s._sum?.amountDuePaise || 0), 0);
    const planned = deliveries.reduce((a, d) => a + (d._count?._all || 0), 0);
    const batchesPending = cash.filter((c) => String(c.status).toUpperCase() === 'SUBMITTED').reduce((a, c) => a + (c._count?._all || 0), 0);
    return { activeSubs, totalSubs, collected, due, planned, batchesPending, upcoming: data.upcomingSevenDayDemand || 0 };
  }, [subscriptions, deliveries, cash, data.upcomingSevenDayDemand]);

  const subRows = subscriptions.map((s) => ({ status: String(s.status), count: s._count?._all || 0 }));
  const delRows = deliveries.map((d) => ({ status: String(d.status), count: d._count?._all || 0 }));
  const cashRows = cash.map((c) => ({ status: String(c.status), count: c._count?._all || 0 }));

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={palette.teal700} />
      <GradientSurface preset="teal" style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()} accessibilityLabel="Go back">
          <ArrowLeft size={21} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>STORE ANALYTICS</Text>
          <Text style={styles.title}>Performance</Text>
        </View>
        <TouchableOpacity style={styles.back} onPress={() => void query.refetch()} accessibilityLabel="Refresh">
          <RefreshCw size={19} color="#FFFFFF" />
        </TouchableOpacity>
      </GradientSurface>

      {query.isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={palette.teal700} /><Text style={styles.muted}>Loading analytics…</Text></View>
      ) : query.isError ? (
        <View style={styles.center}><Text style={styles.errorTitle}>Analytics unavailable</Text><Text style={styles.muted}>Aggregated store analytics will appear here.</Text></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
        >
          <View style={styles.grid}>
            <Card icon={Users} label="Active subscribers" value={String(stats.activeSubs)} tone={palette.green700} />
            <Card icon={Banknote} label="Cash collected" value={money(stats.collected)} tone={palette.green700} />
            <Card icon={Banknote} label="Cash due" value={money(stats.due)} tone={palette.amber700} />
            <Card icon={Truck} label="7-day demand" value={String(stats.upcoming)} tone={palette.slate700} />
            <Card icon={ClipboardCheck} label="Batches to verify" value={String(stats.batchesPending)} tone={palette.amber700} />
            <Card icon={Users} label="Total subscribers" value={String(stats.totalSubs)} tone={palette.slate700} />
            <Card icon={Package} label="Planned deliveries" value={String(stats.planned)} tone={palette.slate700} />
            <Card icon={Repeat} label="Statuses tracked" value={String(subRows.length)} tone={palette.teal700} />
          </View>

          <Table title="Subscriptions by status" rows={subRows} />
          <Table title="Deliveries by status" rows={delRows} />
          <Table title="Cash batches by status" rows={cashRows} />

          {data.generatedAt ? (
            <Text style={styles.updated}>Updated {new Date(data.generatedAt).toLocaleString('en-IN')}</Text>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.slate050 },
  flex: { flex: 1, minWidth: 0 },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  back: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: '#A7F3D0', fontSize: 9, fontWeight: '700', letterSpacing: 1.2 },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '600', marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxxl, gap: spacing.sm },
  muted: { color: palette.slate500, fontSize: 13 },
  errorTitle: { color: palette.slate900, fontSize: 18, fontWeight: '600' },
  list: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 60 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  card: { width: '47.5%', backgroundColor: palette.white, borderRadius: radius.md, borderWidth: 1, borderColor: palette.slate200, padding: spacing.md, gap: 4 },
  cardIcon: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  cardValue: { fontSize: 19, fontWeight: '700', color: palette.slate900 },
  cardLabel: { fontSize: 10.5, color: palette.slate500, fontWeight: '500' },
  table: { backgroundColor: palette.white, borderRadius: radius.md, borderWidth: 1, borderColor: palette.slate200, padding: spacing.lg, gap: spacing.sm },
  tableTitle: { fontSize: 13, fontWeight: '700', color: palette.slate900 },
  tableEmpty: { color: palette.slate400, fontSize: 12 },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  tableRowDivider: { borderBottomWidth: 1, borderBottomColor: palette.slate100 },
  tableStatus: { color: palette.slate600, fontSize: 12, width: 110 },
  tableBarWrap: { flex: 1, height: 6, borderRadius: 3, backgroundColor: palette.slate100, overflow: 'hidden' },
  tableBar: { height: 6, borderRadius: 3, backgroundColor: palette.teal700 },
  tableCount: { color: palette.slate900, fontSize: 12.5, fontWeight: '700', minWidth: 28, textAlign: 'right' },
  updated: { color: palette.slate400, fontSize: 11, textAlign: 'center' },
});
