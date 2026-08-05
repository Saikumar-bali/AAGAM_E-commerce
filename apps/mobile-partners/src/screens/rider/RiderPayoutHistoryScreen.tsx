import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Banknote, CalendarDays, RefreshCw } from 'lucide-react-native';
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

type RangePreset = 30 | 90 | 365 | 'ALL';

function money(value: unknown) {
  return `₹${(Number(value || 0) / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function label(value: unknown) {
  return String(value || 'UNKNOWN').replaceAll('_', ' ');
}

function rangeParams(range: RangePreset) {
  if (range === 'ALL') return {};
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - (range - 1));
  return { from: from.toISOString(), to: new Date().toISOString() };
}

export const RiderPayoutHistoryScreen = ({ navigation }: { navigation: any }) => {
  const insets = useSafeAreaInsets();
  const [range, setRange] = useState<RangePreset>(90);
  const params = useMemo(() => rangeParams(range), [range]);
  const query = useQuery({
    queryKey: ['rider', 'payout-history', params],
    queryFn: () => riderService.getEarnings(params),
    retry: 1,
  });
  const paid = useMemo(() => {
    const records: any[] = Array.isArray(query.data?.records) ? query.data.records : [];
    return records.filter((record) => record.status === 'PAID');
  }, [query.data?.records]);
  const total = paid.reduce((sum, record) => sum + (record.type === 'PENALTY' ? -Math.abs(record.amountPaise) : record.amountPaise), 0);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#067B5C" />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to Rider earnings" style={styles.headerButton} onPress={() => navigation.goBack()}><ArrowLeft size={23} color="#FFFFFF" /></TouchableOpacity>
        <View style={styles.flex}><Text style={styles.eyebrow}>PAID RIDER LEDGER</Text><Text style={styles.title}>Payout history</Text></View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Refresh payout history" style={styles.headerButton} onPress={() => void query.refetch()}><RefreshCw size={20} color="#FFFFFF" /></TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroIcon}><Banknote size={29} color="#FFFFFF" /></View>
          <View style={styles.flex}><Text style={styles.heroLabel}>PAID IN SELECTED RANGE</Text><Text style={styles.heroAmount}>{money(total)}</Text><Text style={styles.heroMeta}>{paid.length} paid ledger entr{paid.length === 1 ? 'y' : 'ies'}</Text></View>
        </View>

        <View style={styles.rangeCard}>
          <CalendarDays size={19} color="#0F766E" />
          {([30, 90, 365, 'ALL'] as RangePreset[]).map((value) => (
            <TouchableOpacity key={String(value)} accessibilityRole="button" accessibilityState={{ selected: range === value }} style={[styles.rangeButton, range === value && styles.rangeButtonActive]} onPress={() => setRange(value)}>
              <Text style={[styles.rangeText, range === value && styles.rangeTextActive]}>{value === 'ALL' ? 'All' : value === 365 ? '1 year' : `${value}d`}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {query.isLoading ? (
          <View style={styles.state}><ActivityIndicator size="large" color="#0F766E" /><Text style={styles.stateText}>Loading paid earnings…</Text></View>
        ) : query.isError ? (
          <View style={styles.state}><Text style={styles.stateTitle}>Payout history unavailable</Text><Text style={styles.stateText}>{(query.error as Error)?.message || 'Pull down to retry.'}</Text></View>
        ) : paid.length === 0 ? (
          <View style={styles.state}><Banknote size={44} color="#94A3B8" /><Text style={styles.stateTitle}>No paid entries</Text><Text style={styles.stateText}>Only earnings marked PAID by Aagaam operations appear here.</Text></View>
        ) : paid.map((record) => {
          const amount = record.type === 'PENALTY' ? -Math.abs(record.amountPaise) : record.amountPaise;
          return (
            <View key={record.id} style={styles.card}>
              <View style={styles.cardHeader}><View style={styles.flex}><Text style={styles.type}>{label(record.type)}</Text><Text selectable style={styles.reference}>{record.reference}</Text></View><Text style={[styles.amount, amount < 0 && styles.negative]}>{money(amount)}</Text></View>
              <Fact label="Earned" value={new Date(record.earnedAt).toLocaleString('en-IN')} />
              <Fact label="Paid" value={record.paidAt ? new Date(record.paidAt).toLocaleString('en-IN') : 'Paid timestamp unavailable'} />
              <Fact label="Delivery job" value={record.deliveryJobId || 'Not linked'} />
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

function Fact({ label: factLabel, value }: { label: string; value: string }) {
  return <View style={styles.fact}><Text style={styles.factLabel}>{factLabel}</Text><Text selectable style={styles.factValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' }, flex: { flex: 1 }, header: { backgroundColor: '#067B5C', paddingHorizontal: 16, paddingBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 12 }, headerButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' }, eyebrow: { color: '#A7F3D0', fontSize: 9, fontWeight: '900', letterSpacing: 1 }, title: { color: '#FFFFFF', fontSize: 24, fontWeight: '900' },
  content: { padding: 14 }, heroCard: { borderRadius: 20, backgroundColor: '#0F172A', padding: 18, flexDirection: 'row', alignItems: 'center', gap: 13 }, heroIcon: { width: 54, height: 54, borderRadius: 17, backgroundColor: '#059669', alignItems: 'center', justifyContent: 'center' }, heroLabel: { color: '#A7F3D0', fontSize: 10, fontWeight: '900' }, heroAmount: { color: '#FFFFFF', fontSize: 27, fontWeight: '900', marginTop: 3 }, heroMeta: { color: '#CBD5E1', fontSize: 10, marginTop: 3 },
  rangeCard: { marginTop: 10, marginBottom: 11, borderRadius: 15, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 10, flexDirection: 'row', alignItems: 'center', gap: 7 }, rangeButton: { flex: 1, minHeight: 36, borderRadius: 10, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' }, rangeButtonActive: { backgroundColor: '#CCFBF1' }, rangeText: { color: '#64748B', fontSize: 10, fontWeight: '800' }, rangeTextActive: { color: '#0F766E' },
  card: { borderRadius: 17, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 14, marginBottom: 9 }, cardHeader: { flexDirection: 'row', alignItems: 'center' }, type: { color: '#0F172A', fontSize: 13, fontWeight: '900' }, reference: { color: '#64748B', fontSize: 10, marginTop: 3 }, amount: { color: '#067B5C', fontSize: 17, fontWeight: '900' }, negative: { color: '#B91C1C' }, fact: { paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E2E8F0', marginTop: 8 }, factLabel: { color: '#64748B', fontSize: 9, fontWeight: '800' }, factValue: { color: '#0F172A', fontSize: 11, fontWeight: '700', marginTop: 3 },
  state: { minHeight: 300, alignItems: 'center', justifyContent: 'center', padding: 28 }, stateTitle: { color: '#0F172A', fontSize: 18, fontWeight: '900', marginTop: 10 }, stateText: { color: '#64748B', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 6 },
});
