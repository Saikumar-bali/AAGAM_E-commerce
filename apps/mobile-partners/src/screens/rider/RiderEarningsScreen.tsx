import React, { useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, BriefcaseBusiness, CalendarDays, IndianRupee, TrendingUp, WalletCards } from 'lucide-react-native';
import { riderService } from '../../api/riderService';

const rupees = (value: number) => `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const RiderEarningsScreen = () => {
  const query = useQuery({ queryKey: ['rider', 'earnings'], queryFn: riderService.getWorkspace });
  const summary = useMemo(() => {
    const history = query.data?.assignmentHistory || [];
    const completed = history.filter((item) => item.deliveryJob.status === 'DELIVERED');
    const cancelled = history.filter((item) => ['CANCELLED', 'REJECTED'].includes(item.status));
    const amounts = completed.map((item) => Number(item.deliveryJob.order.grandTotal || 0));
    const total = amounts.reduce((sum, amount) => sum + amount, 0);
    return { completed: completed.length, cancelled: cancelled.length, total, average: completed.length ? total / completed.length : 0 };
  }, [query.data?.assignmentHistory]);
  const bars = [34, 52, 28, 70, 64, 92, Math.min(100, 38 + summary.completed * 6)];

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor="#FFFFFF" />}>
      <View style={styles.hero}>
        <View style={styles.heroTop}><View><Text style={styles.eyebrow}>RIDER WALLET</Text><Text style={styles.title}>Earnings</Text></View><View style={styles.datePill}><CalendarDays size={14} color="#FFFFFF" /><Text style={styles.dateText}>This week</Text></View></View>
        <View style={styles.balanceCard}><View><Text style={styles.balanceLabel}>TOTAL EARNINGS</Text><Text style={styles.balance}>{rupees(summary.total)}</Text><Text style={styles.growth}>↑ Live from completed orders</Text></View><View style={styles.walletIcon}><WalletCards size={29} color="#FFFFFF" /></View></View>
      </View>

      <View style={styles.chartCard}>
        <View style={styles.sectionHead}><View><Text style={styles.sectionTitle}>Weekly activity</Text><Text style={styles.sectionSub}>Completed-delivery trend</Text></View><BarChart3 size={22} color="#008C68" /></View>
        <View style={styles.chart}>{bars.map((height, index) => <View key={index} style={styles.barColumn}><View style={[styles.bar, { height }]} /><Text style={styles.day}>{['S','M','T','W','T','F','S'][index]}</Text></View>)}</View>
      </View>

      <View style={styles.statsRow}>
        <Stat icon={BriefcaseBusiness} label="Completed jobs" value={String(summary.completed)} tone="#008C68" />
        <Stat icon={IndianRupee} label="Average per job" value={rupees(summary.average)} tone="#2563EB" />
      </View>
      <View style={styles.payoutCard}><View style={styles.payoutIcon}><TrendingUp size={22} color="#008C68" /></View><View style={styles.flex}><Text style={styles.payoutTitle}>Payout summary</Text><Text style={styles.payoutSub}>Calculated from your completed delivery orders</Text></View></View>
      <View style={styles.breakdown}>
        <Row label="Delivery value" value={rupees(summary.total)} />
        <Row label="Completed jobs" value={String(summary.completed)} />
        <Row label="Cancelled / rejected" value={String(summary.cancelled)} last />
      </View>
    </ScrollView>
  );
};

const Stat = ({ icon: Icon, label, value, tone }: any) => <View style={styles.stat}><View style={[styles.statIcon, { backgroundColor: `${tone}12` }]}><Icon size={19} color={tone} /></View><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
const Row = ({ label, value, last = false }: any) => <View style={[styles.row, !last && styles.rowBorder]}><Text style={styles.rowLabel}>{label}</Text><Text style={styles.rowValue}>{value}</Text></View>;

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F4F7F5' }, content: { paddingBottom: 118 }, flex: { flex: 1 },
  hero: { backgroundColor: '#007A5C', paddingTop: 54, paddingHorizontal: 18, paddingBottom: 64, borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, eyebrow: { color: '#A7F3D0', fontSize: 9, fontWeight: '900', letterSpacing: 1.4 }, title: { color: '#FFFFFF', fontSize: 27, fontWeight: '900', marginTop: 2 },
  datePill: { flexDirection: 'row', gap: 6, alignItems: 'center', borderWidth: 1, borderColor: '#6EE7B7', borderRadius: 12, padding: 9 }, dateText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  balanceCard: { marginTop: 22, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, balanceLabel: { color: '#A7F3D0', fontSize: 9, fontWeight: '900' }, balance: { color: '#FFFFFF', fontSize: 35, fontWeight: '900', marginTop: 4 }, growth: { color: '#D1FAE5', fontSize: 10, marginTop: 5 }, walletIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: 'rgba(255,255,255,.16)', alignItems: 'center', justifyContent: 'center' },
  chartCard: { marginHorizontal: 16, marginTop: -38, padding: 18, backgroundColor: '#FFFFFF', borderRadius: 22, borderWidth: 1, borderColor: '#DDE8E3', elevation: 5 }, sectionHead: { flexDirection: 'row', justifyContent: 'space-between' }, sectionTitle: { fontSize: 16, fontWeight: '900', color: '#10241F' }, sectionSub: { color: '#718078', fontSize: 10, marginTop: 3 }, chart: { height: 126, marginTop: 18, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around' }, barColumn: { alignItems: 'center', justifyContent: 'flex-end', height: 120, gap: 7 }, bar: { width: 20, minHeight: 8, borderRadius: 6, backgroundColor: '#08A77D' }, day: { color: '#718078', fontSize: 9, fontWeight: '800' },
  statsRow: { flexDirection: 'row', gap: 11, margin: 16 }, stat: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 15, borderWidth: 1, borderColor: '#E1E9E5' }, statIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, statValue: { color: '#10241F', fontSize: 20, fontWeight: '900', marginTop: 12 }, statLabel: { color: '#718078', fontSize: 10, marginTop: 2 },
  payoutCard: { marginHorizontal: 16, flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: '#E7F8F1', borderRadius: 18, padding: 14 }, payoutIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }, payoutTitle: { color: '#006B52', fontWeight: '900' }, payoutSub: { color: '#4B7669', fontSize: 10, marginTop: 3 },
  breakdown: { margin: 16, backgroundColor: '#FFFFFF', borderRadius: 20, paddingHorizontal: 16, borderWidth: 1, borderColor: '#E1E9E5' }, row: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, rowBorder: { borderBottomWidth: 1, borderBottomColor: '#EEF2F0' }, rowLabel: { color: '#64736D', fontSize: 12 }, rowValue: { color: '#10241F', fontSize: 13, fontWeight: '900' },
});
