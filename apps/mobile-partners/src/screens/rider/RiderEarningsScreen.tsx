import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  BriefcaseBusiness,
  ChevronDown,
  Gift,
  SlidersHorizontal,
  WalletCards,
} from 'lucide-react-native';
import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
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
  startOfLocalWeek,
  summarizeRiderWeek,
  weekRangeLabel,
} from '../../domain/riderReferenceUi';

const EARNINGS_KEY = ['rider', 'earnings'] as const;

function earningsHistoryFrom() {
  const value = startOfLocalWeek(new Date());
  value.setDate(value.getDate() - 7);
  return value.toISOString();
}

function money(value: number | null) {
  return value == null
    ? '—'
    : `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function comparisonPercent(current: number | null, previous: number | null) {
  if (current == null || previous == null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export const RiderEarningsScreen = () => {
  const query = useQuery({
    queryKey: [...EARNINGS_KEY, earningsHistoryFrom()],
    queryFn: () => riderService.getWorkspaceSince(earningsHistoryFrom()),
  });
  const history = query.data?.assignmentHistory || [];
  const summary = useMemo(() => summarizeRiderWeek(history), [history]);
  const previousDate = useMemo(() => {
    const value = new Date();
    value.setDate(value.getDate() - 7);
    return value;
  }, []);
  const previous = useMemo(() => summarizeRiderWeek(history, previousDate), [history, previousDate]);
  const percent = comparisonPercent(summary.total, previous.total);
  const maxAmount = Math.max(...summary.daily.map((item) => item.amount), 1);
  const chartMaximum = Math.max(500, Math.ceil(maxAmount / 500) * 500);

  if (query.isLoading && !query.data) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#087B5B" />
        <Text style={styles.loadingText}>Loading earnings…</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#067B5C" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={(
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            tintColor="#FFFFFF"
          />
        )}
      >
        <View style={styles.hero}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Earnings</Text>
            <View style={styles.rangePill}>
              <Text style={styles.rangePillText}>{weekRangeLabel()}</Text>
              <ChevronDown size={17} color="#FFFFFF" />
            </View>
          </View>
        </View>

        {query.isError ? (
          <View style={styles.warningCard}>
            <Text style={styles.warningTitle}>Showing the last available earnings data</Text>
            <Text style={styles.warningText}>{(query.error as Error)?.message || 'Pull down to try again.'}</Text>
          </View>
        ) : null}

        <View style={styles.totalCard}>
          <View style={styles.totalHeader}>
            <View>
              <Text style={styles.totalLabel}>Total Earnings</Text>
              <Text style={styles.totalValue}>{money(summary.total)}</Text>
              <Text style={styles.growthText}>
                {percent == null ? 'Based on completed rider payouts' : `${percent >= 0 ? '▲' : '▼'} ${Math.abs(percent)}% vs last week`}
              </Text>
            </View>
            <View style={styles.walletIcon}><WalletCards size={37} color="#FFFFFF" /></View>
          </View>

          <View style={styles.chartArea}>
            <View style={styles.axisLabels}>
              <Text style={styles.axisText}>{money(chartMaximum).replace('.00', '')}</Text>
              <Text style={styles.axisText}>{money(chartMaximum / 2).replace('.00', '')}</Text>
              <Text style={styles.axisText}>₹0</Text>
            </View>
            <View style={styles.chartBody}>
              <View style={[styles.gridLine, { top: 0 }]} />
              <View style={[styles.gridLine, { top: 66 }]} />
              <View style={[styles.gridLine, { bottom: 24 }]} />
              {summary.daily.map((day) => {
                const height = day.amount === 0 ? 0 : Math.max(12, Math.round((day.amount / chartMaximum) * 112));
                return (
                  <View key={day.date.toISOString()} style={styles.barColumn}>
                    <View style={styles.barTrack}>
                      <View style={[styles.bar, { height }]} />
                    </View>
                    <Text style={styles.dayName}>{day.date.toLocaleDateString('en-IN', { weekday: 'short' })}</Text>
                    <Text style={styles.dayNumber}>{day.date.getDate()}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        </View>

        <View style={styles.statsRow}>
          <MetricCard
            icon={BriefcaseBusiness}
            title="Completed Jobs"
            value={String(summary.completed)}
            caption={previous.completed ? `${summary.completed - previous.completed >= 0 ? '▲' : '▼'} ${Math.abs(summary.completed - previous.completed)} vs last week` : 'This week'}
          />
          <MetricCard
            icon={BarChart3}
            title="Average per Job"
            value={money(summary.average)}
            caption={percent == null ? 'Completed payouts' : `${percent >= 0 ? '▲' : '▼'} ${Math.abs(percent)}% vs last week`}
          />
        </View>

        <View style={styles.payoutCard}>
          <Text style={styles.sectionTitle}>Payout Summary</Text>
          <PayoutRow icon={WalletCards} color="#0A9D6B" background="#E4F7EF" label="Total Payouts" value={money(summary.payouts)} />
          <PayoutRow icon={Gift} color="#2582F3" background="#EAF3FF" label="Total Incentives" value={money(summary.incentives)} />
          <PayoutRow icon={SlidersHorizontal} color="#A13FEB" background="#F4EAFE" label="Adjustments" value={money(summary.adjustments)} last />
        </View>

        <View style={styles.nextPayoutCard}>
          <View style={styles.nextPayoutRow}>
            <View style={styles.nextPayoutCopy}>
              <Text style={styles.nextPayoutTitle}>Next Payout</Text>
              <Text style={styles.nextPayoutSub}>Schedule is managed by Aagaam operations</Text>
            </View>
            <Text style={styles.nextPayoutAmount}>{money(summary.total)}</Text>
          </View>
          <TouchableOpacity
            style={styles.historyButton}
            onPress={() => Alert.alert('Payout history', 'Detailed settlement history will appear when payout settlements are enabled for your account.')}
          >
            <Text style={styles.historyButtonText}>View Payout History</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

function MetricCard({ icon: Icon, title, value, caption }: any) {
  return (
    <View style={styles.metricCard}>
      <View style={styles.metricTitleRow}>
        <Text style={styles.metricTitle}>{title}</Text>
        <Icon size={18} color="#0A8D65" />
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricCaption}>{caption}</Text>
    </View>
  );
}

function PayoutRow({ icon: Icon, color, background, label, value, last = false }: any) {
  return (
    <View style={[styles.payoutRow, !last && styles.payoutRowBorder]}>
      <View style={[styles.payoutIcon, { backgroundColor: background }]}><Icon size={17} color={color} /></View>
      <Text style={styles.payoutLabel}>{label}</Text>
      <Text style={styles.payoutValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F8F7' },
  scroll: { flex: 1 },
  content: { paddingBottom: 112 },
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F8F7' },
  loadingText: { color: '#68716D', marginTop: 12, fontWeight: '700' },
  hero: { height: 310, backgroundColor: '#067B5C', paddingTop: 54, paddingHorizontal: 18 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#FFFFFF', fontSize: 29, fontWeight: '900' },
  rangePill: { height: 43, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,0.40)', paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 8 },
  rangePillText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  warningCard: { marginHorizontal: 16, marginTop: -205, marginBottom: 210, borderRadius: 13, backgroundColor: '#FFF4E7', padding: 12 },
  warningTitle: { color: '#9A3412', fontWeight: '900' },
  warningText: { color: '#C2410C', fontSize: 11, marginTop: 3 },
  totalCard: { marginHorizontal: 14, marginTop: -207, borderRadius: 18, backgroundColor: '#FFFFFF', padding: 17, elevation: 4, borderWidth: 1, borderColor: '#E1E4E3' },
  totalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { color: '#555D63', fontSize: 14, fontWeight: '700' },
  totalValue: { color: '#080A09', fontSize: 31, fontWeight: '900', marginTop: 9 },
  growthText: { color: '#07955F', fontSize: 12, fontWeight: '700', marginTop: 9 },
  walletIcon: { width: 58, height: 58, borderRadius: 15, backgroundColor: '#078D63', alignItems: 'center', justifyContent: 'center' },
  chartArea: { height: 191, flexDirection: 'row', marginTop: 15 },
  axisLabels: { width: 47, justifyContent: 'space-between', paddingTop: 4, paddingBottom: 25 },
  axisText: { color: '#5D646A', fontSize: 10 },
  chartBody: { flex: 1, flexDirection: 'row', justifyContent: 'space-around', position: 'relative' },
  gridLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: '#E5E7E6' },
  barColumn: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', zIndex: 2 },
  barTrack: { height: 120, justifyContent: 'flex-end' },
  bar: { width: 22, borderTopLeftRadius: 4, borderTopRightRadius: 4, backgroundColor: '#079F69' },
  dayName: { color: '#3F464A', fontSize: 10, marginTop: 7 },
  dayNumber: { color: '#555D63', fontSize: 10, marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: 10, marginHorizontal: 14, marginTop: 12 },
  metricCard: { flex: 1, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E4E3', padding: 15 },
  metricTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metricTitle: { color: '#555D63', fontSize: 13, fontWeight: '700' },
  metricValue: { color: '#090B0A', fontSize: 27, fontWeight: '900', marginTop: 13 },
  metricCaption: { color: '#07955F', fontSize: 11, marginTop: 8, fontWeight: '700' },
  payoutCard: { marginHorizontal: 14, marginTop: 12, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E4E3', paddingHorizontal: 15, paddingTop: 15 },
  sectionTitle: { color: '#111111', fontSize: 16, fontWeight: '900', marginBottom: 5 },
  payoutRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center' },
  payoutRowBorder: { borderBottomWidth: 1, borderBottomColor: '#ECEEED' },
  payoutIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  payoutLabel: { flex: 1, color: '#5A6268', fontSize: 13, marginLeft: 11 },
  payoutValue: { color: '#111111', fontSize: 14, fontWeight: '900' },
  nextPayoutCard: { margin: 14, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E4E3', padding: 14 },
  nextPayoutRow: { flexDirection: 'row', alignItems: 'center' },
  nextPayoutCopy: { flex: 1 },
  nextPayoutTitle: { color: '#111111', fontSize: 15, fontWeight: '900' },
  nextPayoutSub: { color: '#687077', fontSize: 11, marginTop: 4 },
  nextPayoutAmount: { color: '#111111', fontSize: 17, fontWeight: '900' },
  historyButton: { height: 48, borderRadius: 11, backgroundColor: '#067B5C', alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  historyButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
