import React, { useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ArrowLeft, CalendarDays, IndianRupee, RefreshCw, Truck } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { subscriptionOperationsService } from '../../api/subscriptionOperationsService';
import { GradientSurface } from '../../components/GradientSurface';
import { palette, radius, spacing } from '../../design/tokens';

type Range = 'next14' | 'past14' | 'all';
const RANGES: { key: Range; label: string }[] = [
  { key: 'next14', label: 'Next 14 days' },
  { key: 'past14', label: 'Past 14 days' },
  { key: 'all', label: 'All' },
];

const STATUS_TONE: Record<string, { bg: string; fg: string; label: string }> = {
  DELIVERED: { bg: palette.green100, fg: palette.green700, label: 'Delivered' },
  SCHEDULED: { bg: palette.blue100, fg: palette.blue700, label: 'Scheduled' },
  SKIPPED: { bg: palette.amber100, fg: palette.amber700, label: 'Skipped' },
  CANCELLED: { bg: palette.rose100, fg: palette.rose700, label: 'Cancelled' },
  FAILED: { bg: palette.rose100, fg: palette.rose700, label: 'Failed' },
};

function tone(status?: string) {
  return STATUS_TONE[String(status || '').toUpperCase()] || { bg: palette.slate100, fg: palette.slate600, label: String(status || '—').replaceAll('_', ' ') };
}
function money(paise: number) {
  return `₹${(Number(paise || 0) / 100).toLocaleString('en-IN')}`;
}
function longDate(value?: string) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}
function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const StoreCalendarScreen = ({ navigation }: { navigation: any }) => {
  const insets = useSafeAreaInsets();
  const [range, setRange] = useState<Range>('next14');

  const scope = useMemo(() => {
    const now = new Date();
    if (range === 'next14') return { from: iso(now), to: iso(new Date(now.getTime() + 13 * 864e5)) };
    if (range === 'past14') return { from: iso(new Date(now.getTime() - 13 * 864e5)), to: iso(now) };
    return {};
  }, [range]);

  const query = useQuery({
    queryKey: ['store-calendar', range],
    queryFn: () => subscriptionOperationsService.getCalendar((scope as any).from, (scope as any).to),
    retry: 1,
  });

  const deliveries = Array.isArray(query.data) ? query.data : [];
  const scheduled = deliveries.filter((d: any) => String(d.status).toUpperCase() === 'SCHEDULED').length;
  const cashDue = deliveries.reduce((sum: number, d: any) => sum + Number(d.cashDuePaise || 0), 0);

  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const d of [...deliveries].sort((a: any, b: any) => String(a.serviceDate).localeCompare(String(b.serviceDate)))) {
      const key = String(d.serviceDate || '').slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    }
    return Array.from(map.entries());
  }, [deliveries]);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={palette.teal700} />
      <GradientSurface preset="teal" style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()} accessibilityLabel="Go back">
          <ArrowLeft size={21} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>SCHEDULE</Text>
          <Text style={styles.title}>Delivery calendar</Text>
        </View>
        <TouchableOpacity style={styles.back} onPress={() => void query.refetch()} accessibilityLabel="Refresh">
          <RefreshCw size={19} color="#FFFFFF" />
        </TouchableOpacity>
      </GradientSurface>

      <View style={styles.rangeRow}>
        {RANGES.map((r) => (
          <TouchableOpacity key={r.key} style={[styles.rangeChip, range === r.key && styles.rangeChipActive]} onPress={() => setRange(r.key)}>
            <Text style={[styles.rangeText, range === r.key && styles.rangeTextActive]}>{r.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.kpiRow}>
        <View style={styles.kpi}>
          <CalendarDays size={15} color={palette.teal700} />
          <Text style={styles.kpiValue}>{deliveries.length}</Text>
          <Text style={styles.kpiLabel}>Deliveries</Text>
        </View>
        <View style={styles.kpiDiv} />
        <View style={styles.kpi}>
          <Truck size={15} color={palette.blue700} />
          <Text style={styles.kpiValue}>{scheduled}</Text>
          <Text style={styles.kpiLabel}>Scheduled</Text>
        </View>
        <View style={styles.kpiDiv} />
        <View style={styles.kpi}>
          <IndianRupee size={15} color={palette.amber700} />
          <Text style={styles.kpiValue}>{money(cashDue)}</Text>
          <Text style={styles.kpiLabel}>Cash due</Text>
        </View>
      </View>

      {query.isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={palette.teal700} /><Text style={styles.muted}>Loading calendar…</Text></View>
      ) : query.isError ? (
        <View style={styles.center}><Text style={styles.errorTitle}>Couldn't load calendar</Text><Text style={styles.muted}>Pull down to retry.</Text></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
        >
          {grouped.length === 0 ? (
            <View style={styles.center}>
              <CalendarDays size={40} color={palette.slate400} />
              <Text style={styles.emptyTitle}>No deliveries in range</Text>
              <Text style={styles.emptyText}>Adjust the calendar range to see scheduled deliveries.</Text>
            </View>
          ) : (
            grouped.map(([day, rows]) => (
              <View key={day} style={styles.group}>
                <Text style={styles.groupDate}>{longDate(day)} · {rows.length} deliveries</Text>
                <View style={styles.groupCard}>
                  {rows.map((d: any, i: number) => {
                    const t = tone(d.status);
                    return (
                      <View key={d.id || i} style={[styles.row, i < rows.length - 1 && styles.rowDivider]}>
                        <View style={styles.flex}>
                          <Text style={styles.rowName} numberOfLines={1}>{d.customer?.name || d.customerName || 'Customer'}</Text>
                          <Text style={styles.rowMeta} numberOfLines={1}>
                            {d.plan?.name || d.planName || 'Subscription'}{d.sequenceNumber ? ` · #${d.sequenceNumber}` : ''}{d.routeCode ? ` · ${d.routeCode}` : ''}
                          </Text>
                        </View>
                        <View style={[styles.pill, { backgroundColor: t.bg }]}>
                          <Text style={[styles.pillText, { color: t.fg }]}>{t.label}</Text>
                        </View>
                        <Text style={styles.rowCash}>{money(d.cashDuePaise)}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            ))
          )}
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
  rangeRow: { flexDirection: 'row', gap: spacing.sm, padding: spacing.lg, paddingBottom: spacing.sm },
  rangeChip: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: palette.slate100 },
  rangeChipActive: { backgroundColor: palette.teal700 },
  rangeText: { fontSize: 12, fontWeight: '600', color: palette.slate600 },
  rangeTextActive: { color: '#FFFFFF' },
  kpiRow: { flexDirection: 'row', backgroundColor: palette.white, marginHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: palette.slate200, paddingVertical: spacing.md },
  kpi: { flex: 1, alignItems: 'center', gap: 2 },
  kpiDiv: { width: 1, backgroundColor: palette.slate200, marginVertical: spacing.xs },
  kpiValue: { fontSize: 15, fontWeight: '700', color: palette.slate900 },
  kpiLabel: { fontSize: 9.5, color: palette.slate500 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxxl, gap: spacing.sm },
  muted: { color: palette.slate500, fontSize: 13 },
  errorTitle: { color: palette.slate900, fontSize: 18, fontWeight: '600' },
  emptyTitle: { color: palette.slate900, fontSize: 16, fontWeight: '600' },
  emptyText: { color: palette.slate500, fontSize: 13, textAlign: 'center' },
  list: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 60 },
  group: { gap: spacing.sm },
  groupDate: { ...({ fontSize: 11, fontWeight: '700', letterSpacing: 0.6 } as any), color: palette.slate500, textTransform: 'uppercase' },
  groupCard: { backgroundColor: palette.white, borderRadius: radius.md, borderWidth: 1, borderColor: palette.slate200, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: palette.slate100 },
  rowName: { color: palette.slate900, fontSize: 14, fontWeight: '600' },
  rowMeta: { color: palette.slate500, fontSize: 11, marginTop: 2 },
  pill: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill },
  pillText: { fontSize: 9.5, fontWeight: '700' },
  rowCash: { color: palette.slate700, fontSize: 12.5, fontWeight: '700', minWidth: 52, textAlign: 'right' },
});
