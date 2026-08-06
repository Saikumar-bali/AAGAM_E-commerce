import { useQuery } from '@tanstack/react-query';
import { Banknote, CalendarDays, ChevronRight, IndianRupee, RefreshCw, WalletCards } from 'lucide-react-native';
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
import { PartnerTabBrand } from '../../components/PartnerTabBrand';

type RangePreset = 7 | 30 | 90 | 'ALL';

function money(value: unknown) {
  return `₹${(Number(value || 0) / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function rangeParams(range: RangePreset) {
  if (range === 'ALL') return {};
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - (range - 1));
  return { from: from.toISOString(), to: new Date().toISOString() };
}

function signedAmount(record: any) {
  return record.type === 'PENALTY' ? -Math.abs(Number(record.amountPaise || 0)) : Number(record.amountPaise || 0);
}

function label(value: unknown) {
  return String(value || 'UNKNOWN').replaceAll('_', ' ');
}

export const RiderEarningsScreen = ({ navigation }: { navigation: any }) => {
  const insets = useSafeAreaInsets();
  const [range, setRange] = useState<RangePreset>(30);
  const params = useMemo(() => rangeParams(range), [range]);
  const query = useQuery({
    queryKey: ['rider', 'earnings-ledger', params],
    queryFn: () => riderService.getEarnings(params),
    retry: 1,
  });
  const data: any = query.data || {};
  const records: any[] = Array.isArray(data.records) ? data.records : [];
  const pending = records.filter((record) => record.status === 'PENDING');
  const paid = records.filter((record) => record.status === 'PAID');

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#067B5C" />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <PartnerTabBrand inverse caption="RIDER PARTNER" style={styles.brandRow} />
        <View style={styles.headerMain}>
          <View style={styles.flex}>
            <Text style={styles.eyebrow}>PERSISTED RIDER LEDGER</Text>
            <Text style={styles.title}>Earnings</Text>
          </View>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Refresh earnings ledger" style={styles.headerButton} onPress={() => void query.refetch()}>
            <RefreshCw size={21} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
      >
        <View style={styles.pendingCard}>
          <View style={styles.iconBox}><WalletCards size={27} color="#FFFFFF" /></View>
          <View style={styles.flex}>
            <Text style={styles.pendingLabel}>Pending payout</Text>
            <Text style={styles.pendingAmount}>{money(data.summary?.pendingPaise)}</Text>
            <Text style={styles.pendingMeta}>{pending.length} ledger entr{pending.length === 1 ? 'y' : 'ies'} awaiting payout</Text>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <Summary label="Today" value={money(data.summary?.dailyPaise)} />
          <Summary label="This week" value={money(data.summary?.weeklyPaise)} />
          <Summary label="Paid" value={money(data.summary?.paidPaise)} />
        </View>

        <View style={styles.rangeCard}>
          <CalendarDays size={19} color="#0F766E" />
          {([7, 30, 90, 'ALL'] as RangePreset[]).map((value) => (
            <TouchableOpacity
              key={String(value)}
              accessibilityRole="button"
              accessibilityState={{ selected: range === value }}
              style={[styles.rangeButton, range === value && styles.rangeButtonActive]}
              onPress={() => setRange(value)}
            >
              <Text style={[styles.rangeText, range === value && styles.rangeTextActive]}>{value === 'ALL' ? 'All' : `${value}d`}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity accessibilityRole="button" style={styles.payoutButton} onPress={() => navigation.navigate('RiderPayoutHistory')}>
          <Banknote size={21} color="#0F766E" />
          <View style={styles.flex}><Text style={styles.payoutTitle}>Payout history</Text><Text style={styles.payoutText}>{paid.length} paid ledger entr{paid.length === 1 ? 'y' : 'ies'} in this range</Text></View>
          <ChevronRight size={21} color="#0F766E" />
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Ledger entries</Text>
        {query.isLoading ? (
          <View style={styles.state}><ActivityIndicator size="large" color="#0F766E" /><Text style={styles.stateText}>Loading Rider earnings ledger…</Text></View>
        ) : query.isError ? (
          <View style={styles.state}><Text style={styles.stateTitle}>Earnings unavailable</Text><Text style={styles.stateText}>{(query.error as Error)?.message || 'Pull down to retry.'}</Text></View>
        ) : records.length === 0 ? (
          <View style={styles.state}><IndianRupee size={42} color="#94A3B8" /><Text style={styles.stateTitle}>No ledger entries</Text><Text style={styles.stateText}>Earnings appear only after the backend posts a Rider earning record.</Text></View>
        ) : records.map((record) => {
          const amount = signedAmount(record);
          return (
            <View key={record.id} style={styles.entryCard}>
              <View style={[styles.entryIcon, amount < 0 && styles.penaltyIcon]}><IndianRupee size={19} color={amount < 0 ? '#B91C1C' : '#0F766E'} /></View>
              <View style={styles.flex}>
                <Text style={styles.entryTitle}>{label(record.type)}</Text>
                <Text selectable style={styles.entryReference}>{record.reference}</Text>
                <Text style={styles.entryDate}>{new Date(record.earnedAt).toLocaleString('en-IN')} · {label(record.status)}</Text>
              </View>
              <Text style={[styles.entryAmount, amount < 0 && styles.penaltyAmount]}>{money(amount)}</Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

function Summary({ label: summaryLabel, value }: { label: string; value: string }) {
  return <View style={styles.summaryCard}><Text style={styles.summaryLabel}>{summaryLabel}</Text><Text style={styles.summaryValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' }, flex: { flex: 1 },
  header: { backgroundColor: '#067B5C', paddingHorizontal: 18, paddingBottom: 20 }, brandRow: { marginBottom: 15 }, headerMain: { flexDirection: 'row', alignItems: 'center' },
  eyebrow: { color: '#A7F3D0', fontSize: 10, fontWeight: '900', letterSpacing: 1 }, title: { color: '#FFFFFF', fontSize: 27, fontWeight: '900', marginTop: 2 },
  headerButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  content: { padding: 14 },
  pendingCard: { borderRadius: 20, backgroundColor: '#0F172A', padding: 18, flexDirection: 'row', alignItems: 'center', gap: 13 },
  iconBox: { width: 52, height: 52, borderRadius: 16, backgroundColor: '#059669', alignItems: 'center', justifyContent: 'center' },
  pendingLabel: { color: '#A7F3D0', fontSize: 11, fontWeight: '900' }, pendingAmount: { color: '#FFFFFF', fontSize: 27, fontWeight: '900', marginTop: 3 }, pendingMeta: { color: '#CBD5E1', fontSize: 10, marginTop: 3 },
  summaryRow: { flexDirection: 'row', gap: 8, marginTop: 10 }, summaryCard: { flex: 1, borderRadius: 15, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 12 },
  summaryLabel: { color: '#64748B', fontSize: 10, fontWeight: '800' }, summaryValue: { color: '#0F172A', fontSize: 15, fontWeight: '900', marginTop: 5 },
  rangeCard: { marginTop: 10, borderRadius: 15, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 10, flexDirection: 'row', alignItems: 'center', gap: 7 },
  rangeButton: { flex: 1, minHeight: 36, borderRadius: 10, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' }, rangeButtonActive: { backgroundColor: '#CCFBF1' }, rangeText: { color: '#64748B', fontWeight: '800', fontSize: 11 }, rangeTextActive: { color: '#0F766E' },
  payoutButton: { marginTop: 10, minHeight: 70, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#99D8C8', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 11 },
  payoutTitle: { color: '#0F172A', fontSize: 14, fontWeight: '900' }, payoutText: { color: '#64748B', fontSize: 10, marginTop: 3 },
  sectionTitle: { color: '#0F172A', fontSize: 17, fontWeight: '900', marginTop: 18, marginBottom: 9 },
  entryCard: { borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 13, marginBottom: 9, flexDirection: 'row', alignItems: 'center', gap: 11 },
  entryIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#CCFBF1', alignItems: 'center', justifyContent: 'center' }, penaltyIcon: { backgroundColor: '#FEE2E2' },
  entryTitle: { color: '#0F172A', fontSize: 12, fontWeight: '900' }, entryReference: { color: '#475569', fontSize: 10, marginTop: 3 }, entryDate: { color: '#94A3B8', fontSize: 9, marginTop: 3 },
  entryAmount: { color: '#067B5C', fontSize: 15, fontWeight: '900' }, penaltyAmount: { color: '#B91C1C' },
  state: { minHeight: 250, alignItems: 'center', justifyContent: 'center', padding: 26 }, stateTitle: { color: '#0F172A', fontSize: 18, fontWeight: '900', marginTop: 10 }, stateText: { color: '#64748B', fontSize: 12, textAlign: 'center', lineHeight: 18, marginTop: 6 },
});
