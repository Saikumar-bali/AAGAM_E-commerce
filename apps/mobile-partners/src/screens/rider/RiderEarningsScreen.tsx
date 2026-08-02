import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  IndianRupee,
  TrendingUp,
  WalletCards,
} from 'lucide-react-native';
import { riderService } from '../../api/riderService';
import {
  RiderAssignmentOffer,
  RiderWorkspace,
} from '../../domain/riderWorkspace';

const HISTORY_QUERY_KEY = ['rider', 'earnings'] as const;
const WEEK_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function earningsHistoryFrom() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - date.getDay());
  return date.toISOString();
}

const rupees = (value: number) => '₹' + value.toLocaleString('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function nextWeekDelay(weekStart: string) {
  const nextWeek = new Date(weekStart);
  nextWeek.setDate(nextWeek.getDate() + 7);
  return Math.max(1_000, nextWeek.getTime() - Date.now() + 1_000);
}

function startOfWeek(value: Date) {
  const result = new Date(value);
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() - result.getDay());
  return result;
}

function assignmentTime(assignment: RiderAssignmentOffer) {
  const isResponse = ['CANCELLED', 'REJECTED'].includes(assignment.status);
  const value = isResponse
    ? assignment.respondedAt
      || assignment.updatedAt
      || assignment.deliveryJob.updatedAt
      || assignment.createdAt
    : assignment.deliveryJob.order.deliveredAt
      || assignment.deliveryJob.completedAt
      || assignment.deliveryJob.updatedAt
      || assignment.respondedAt
      || assignment.offeredAt
      || assignment.createdAt;
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function payoutAmount(assignment: RiderAssignmentOffer) {
  const values = [
    assignment.riderPayoutAmount,
    assignment.payoutAmount,
    assignment.deliveryJob.riderPayoutAmount,
  ];
  const value = values.find((item) => typeof item === 'number' && Number.isFinite(item) && item >= 0);
  return value == null ? null : value;
}

function summarize(history: RiderAssignmentOffer[], now = new Date()) {
  const weekStart = startOfWeek(now).getTime();
  const nowTime = now.getTime();
  const inThisWeek = (assignment: RiderAssignmentOffer) => {
    const time = assignmentTime(assignment);
    return time != null && time >= weekStart && time <= nowTime;
  };
  const completed = history.filter(
    (assignment) => assignment.status === 'ACCEPTED'
      && assignment.deliveryJob.status === 'DELIVERED'
      && inThisWeek(assignment),
  );
  const cancelled = history.filter(
    (assignment) => (
      ['CANCELLED', 'REJECTED'].includes(assignment.status)
      || (assignment.status === 'ACCEPTED' && assignment.deliveryJob.status === 'CANCELLED')
    ) && inThisWeek(assignment),
  );
  const dailyCounts = WEEK_LABELS.map(() => 0);
  completed.forEach((assignment) => {
    const time = assignmentTime(assignment);
    if (time == null) return;
    const day = new Date(time).getDay();
    dailyCounts[day] += 1;
  });
  const payouts = completed.map(payoutAmount);
  const payoutTotal = completed.length === 0
    ? 0
    : payouts.every((value): value is number => value != null)
      ? payouts.reduce((sum, value) => sum + value, 0)
      : null;
  return {
    completed: completed.length,
    cancelled: cancelled.length,
    payoutTotal,
    average: payoutTotal == null || completed.length === 0 ? null : payoutTotal / completed.length,
    dailyCounts,
  };
}

const StatusScreen = ({
  title,
  message,
  loading = false,
  onRetry,
}: {
  title: string;
  message: string;
  loading?: boolean;
  onRetry?: () => void;
}) => (
  <View style={styles.stateScreen}>
    {loading ? <ActivityIndicator size="large" color="#0F766E" /> : <WalletCards size={42} color="#B91C1C" />}
    <Text style={styles.stateTitle}>{title}</Text>
    <Text style={styles.stateText}>{message}</Text>
    {onRetry ? (
      <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
        <Text style={styles.retryText}>Try again</Text>
      </TouchableOpacity>
    ) : null}
  </View>
);

export const RiderEarningsScreen = () => {
  const [weekStart, setWeekStart] = useState(() => earningsHistoryFrom());

  useEffect(() => {
    const rollover = setTimeout(() => setWeekStart(earningsHistoryFrom()), nextWeekDelay(weekStart));
    return () => clearTimeout(rollover);
  }, [weekStart]);

  const query = useQuery<RiderWorkspace>({
    queryKey: [...HISTORY_QUERY_KEY, weekStart],
    queryFn: () => riderService.getWorkspaceSince(weekStart),
  });
  const summary = useMemo(
    () => summarize(query.data?.assignmentHistory || []),
    [query.data?.assignmentHistory, weekStart],
  );

  if (query.isLoading && !query.data) {
    return <StatusScreen title="Loading earnings" message="Fetching your completed rider activity…" loading />;
  }
  if (query.isError && !query.data) {
    return (
      <StatusScreen
        title="Earnings unavailable"
        message={(query.error as any)?.response?.data?.message || (query.error as Error)?.message || 'Pull down to try again.'}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const payoutLabel = summary.payoutTotal == null ? 'Not available' : rupees(summary.payoutTotal);
  const averageLabel = summary.average == null ? 'Not available' : rupees(summary.average);
  const maxDailyCount = Math.max(...summary.dailyCounts, 0);
  const bars = summary.dailyCounts.map((count) => (
    count === 0 ? 0 : Math.max(14, Math.round((count / Math.max(maxDailyCount, 1)) * 88))
  ));

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => void query.refetch()}
          tintColor="#FFFFFF"
        />
      }
    >
      {query.isError ? (
        <View style={styles.warningBanner}>
          <Text style={styles.warningTitle}>Showing the last available earnings data</Text>
          <Text style={styles.warningText}>Refresh when your connection is restored.</Text>
        </View>
      ) : null}

      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View>
            <Text style={styles.eyebrow}>RIDER WALLET</Text>
            <Text style={styles.title}>Earnings</Text>
          </View>
          <View style={styles.datePill}>
            <CalendarDays size={14} color="#FFFFFF" />
            <Text style={styles.dateText}>This week</Text>
          </View>
        </View>
        <View style={styles.balanceCard}>
          <View>
            <Text style={styles.balanceLabel}>RIDER PAYOUT</Text>
            <Text style={styles.balance}>{payoutLabel}</Text>
            <Text style={styles.growth}>
              {summary.payoutTotal == null
                ? 'Payout data is not provided by dispatch'
                : 'From completed rider payout records'}
            </Text>
          </View>
          <View style={styles.walletIcon}>
            <WalletCards size={29} color="#FFFFFF" />
          </View>
        </View>
      </View>

      <View style={styles.chartCard}>
        <View style={styles.sectionHead}>
          <View>
            <Text style={styles.sectionTitle}>Weekly activity</Text>
            <Text style={styles.sectionSub}>Completed jobs by day</Text>
          </View>
          <BarChart3 size={22} color="#008C68" />
        </View>
        <View style={styles.chart}>
          {bars.map((height, index) => (
            <View key={WEEK_LABELS[index] + index} style={styles.barColumn}>
              <View style={styles.barTrack}>
                <View style={[styles.bar, { height }]} />
              </View>
              <Text style={styles.barCount}>{summary.dailyCounts[index]}</Text>
              <Text style={styles.day}>{WEEK_LABELS[index]}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.statsRow}>
        <Stat icon={BriefcaseBusiness} label="Completed jobs" value={String(summary.completed)} tone="#008C68" />
        <Stat icon={IndianRupee} label="Average payout" value={averageLabel} tone="#2563EB" />
      </View>
      <View style={styles.payoutCard}>
        <View style={styles.payoutIcon}><TrendingUp size={22} color="#008C68" /></View>
        <View style={styles.flex}>
          <Text style={styles.payoutTitle}>Payout summary</Text>
          <Text style={styles.payoutSub}>
            {summary.payoutTotal == null
              ? 'Payout amounts will appear when the dispatch service supplies them.'
              : 'Calculated only from accepted deliveries completed this week.'}
          </Text>
        </View>
      </View>
      <View style={styles.breakdown}>
        <Row label="Rider payout" value={payoutLabel} />
        <Row label="Completed jobs" value={String(summary.completed)} />
        <Row label="Cancelled / rejected" value={String(summary.cancelled)} last />
      </View>
    </ScrollView>
  );
};

const Stat = ({ icon: Icon, label, value, tone }: any) => (
  <View style={styles.stat}>
    <View style={[styles.statIcon, { backgroundColor: tone + '12' }]}>
      <Icon size={19} color={tone} />
    </View>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const Row = ({ label, value, last = false }: any) => (
  <View style={[styles.row, !last && styles.rowBorder]}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text style={styles.rowValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F4F7F5' },
  content: { paddingBottom: 118 },
  flex: { flex: 1 },
  stateScreen: { flex: 1, backgroundColor: '#F4F7F5', alignItems: 'center', justifyContent: 'center', padding: 28 },
  stateTitle: { color: '#10241F', fontSize: 20, fontWeight: '900', marginTop: 16, textAlign: 'center' },
  stateText: { color: '#64736D', fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 6 },
  retryButton: { marginTop: 18, borderRadius: 12, backgroundColor: '#007A5C', paddingHorizontal: 18, paddingVertical: 11 },
  retryText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  warningBanner: { margin: 16, marginBottom: 0, borderRadius: 14, backgroundColor: '#FFF7ED', padding: 12 },
  warningTitle: { color: '#9A3412', fontSize: 12, fontWeight: '900' },
  warningText: { color: '#C2410C', fontSize: 11, marginTop: 3 },
  hero: { backgroundColor: '#007A5C', paddingTop: 54, paddingHorizontal: 18, paddingBottom: 64, borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { color: '#A7F3D0', fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  title: { color: '#FFFFFF', fontSize: 27, fontWeight: '900', marginTop: 2 },
  datePill: { flexDirection: 'row', gap: 6, alignItems: 'center', borderWidth: 1, borderColor: '#6EE7B7', borderRadius: 12, padding: 9 },
  dateText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  balanceCard: { marginTop: 22, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  balanceLabel: { color: '#A7F3D0', fontSize: 9, fontWeight: '900' },
  balance: { color: '#FFFFFF', fontSize: 35, fontWeight: '900', marginTop: 4 },
  growth: { color: '#D1FAE5', fontSize: 10, marginTop: 5 },
  walletIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: 'rgba(255,255,255,.16)', alignItems: 'center', justifyContent: 'center' },
  chartCard: { marginHorizontal: 16, marginTop: -38, padding: 18, backgroundColor: '#FFFFFF', borderRadius: 22, borderWidth: 1, borderColor: '#DDE8E3', elevation: 5 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: '#10241F' },
  sectionSub: { color: '#718078', fontSize: 10, marginTop: 3 },
  chart: { height: 150, marginTop: 18, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around' },
  barColumn: { alignItems: 'center', justifyContent: 'flex-end', height: 142, gap: 4 },
  barTrack: { height: 100, justifyContent: 'flex-end' },
  bar: { width: 20, borderRadius: 6, backgroundColor: '#08A77D' },
  barCount: { color: '#006B52', fontSize: 9, fontWeight: '900' },
  day: { color: '#718078', fontSize: 9, fontWeight: '800' },
  statsRow: { flexDirection: 'row', gap: 11, margin: 16 },
  stat: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 15, borderWidth: 1, borderColor: '#E1E9E5' },
  statIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  statValue: { color: '#10241F', fontSize: 20, fontWeight: '900', marginTop: 12 },
  statLabel: { color: '#718078', fontSize: 10, marginTop: 2 },
  payoutCard: { marginHorizontal: 16, flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: '#E7F8F1', borderRadius: 18, padding: 14 },
  payoutIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  payoutTitle: { color: '#006B52', fontWeight: '900' },
  payoutSub: { color: '#4B7669', fontSize: 10, marginTop: 3 },
  breakdown: { margin: 16, backgroundColor: '#FFFFFF', borderRadius: 20, paddingHorizontal: 16, borderWidth: 1, borderColor: '#E1E9E5' },
  row: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#EEF2F0' },
  rowLabel: { color: '#64736D', fontSize: 12 },
  rowValue: { color: '#10241F', fontSize: 13, fontWeight: '900' },
});
