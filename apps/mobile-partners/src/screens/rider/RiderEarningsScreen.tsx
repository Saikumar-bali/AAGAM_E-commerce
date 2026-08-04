import { useQuery } from '@tanstack/react-query';
import { Banknote, CircleDollarSign, RefreshCw, ShieldCheck, WalletCards } from 'lucide-react-native';
import React, { useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { riderService } from '../../api/riderService';

const money = (paise = 0) => `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const title = (value = '') => value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());

export const RiderEarningsScreen = () => {
  const [tab, setTab] = useState<'EARNINGS' | 'COD'>('EARNINGS');
  const earnings = useQuery({ queryKey: ['rider', 'persisted-earnings'], queryFn: () => riderService.getEarnings(), staleTime: 20_000 });
  const cod = useQuery({ queryKey: ['rider', 'persisted-cod'], queryFn: riderService.getCodLedger, staleTime: 20_000 });
  const active = tab === 'EARNINGS' ? earnings : cod;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.flex}><Text style={styles.heading}>Earnings & cash</Text><Text style={styles.subtitle}>Persisted accounting only—no estimated dashboard values</Text></View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Refresh earnings and cash" style={styles.refresh} onPress={() => { earnings.refetch(); cod.refetch(); }}><RefreshCw size={19} color="#087B5B" /></TouchableOpacity>
      </View>
      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, tab === 'EARNINGS' && styles.tabActive]} onPress={() => setTab('EARNINGS')}><WalletCards size={17} color={tab === 'EARNINGS' ? '#FFFFFF' : '#475569'} /><Text style={[styles.tabText, tab === 'EARNINGS' && styles.tabTextActive]}>Earnings</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === 'COD' && styles.tabActive]} onPress={() => setTab('COD')}><Banknote size={17} color={tab === 'COD' ? '#FFFFFF' : '#475569'} /><Text style={[styles.tabText, tab === 'COD' && styles.tabTextActive]}>COD ledger</Text></TouchableOpacity>
      </View>

      {active.isLoading ? <View style={styles.state}><ActivityIndicator color="#087B5B" /><Text style={styles.muted}>Loading persisted ledger…</Text></View> : null}
      {active.isError ? <View style={styles.state}><Text style={styles.error}>Accounting unavailable</Text><Text style={styles.muted}>Pull to retry. The app will not invent payout or cash values.</Text></View> : null}

      {tab === 'EARNINGS' && earnings.data ? (
        <ScrollView refreshControl={<RefreshControl refreshing={earnings.isRefetching} onRefresh={() => earnings.refetch()} />} contentContainerStyle={styles.content}>
          <View style={styles.grid}>
            {[['Today', earnings.data.summary?.dailyPaise], ['This week', earnings.data.summary?.weeklyPaise], ['This month', earnings.data.summary?.monthlyPaise], ['Pending payout', earnings.data.summary?.pendingPaise]].map(([label, value]) => (
              <View key={String(label)} style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{money(Number(value || 0))}</Text></View>
            ))}
          </View>
          <View style={styles.notice}><ShieldCheck size={19} color="#087B5B" /><Text style={styles.noticeText}>Final earnings come from RiderEarning. Paid and pending statuses remain authoritative.</Text></View>
          <Text style={styles.section}>Ledger entries</Text>
          {(earnings.data.records || []).map((entry: any) => (
            <View key={entry.id} style={styles.card}>
              <View style={styles.row}><View style={styles.flex}><Text style={styles.cardTitle}>{title(entry.type)}</Text><Text style={styles.meta}>{entry.reference || `Job ${String(entry.deliveryJobId || '').slice(-8)}`}</Text></View><Text style={[styles.amount, Number(entry.signedAmountPaise) < 0 && styles.negative]}>{money(entry.signedAmountPaise)}</Text></View>
              <View style={styles.row}><Text style={styles.meta}>{entry.earnedAt ? new Date(entry.earnedAt).toLocaleString() : 'Date unavailable'}</Text><Text style={styles.status}>{title(entry.status)}</Text></View>
            </View>
          ))}
          {!earnings.data.records?.length ? <View style={styles.state}><CircleDollarSign size={34} color="#94A3B8" /><Text style={styles.error}>No persisted earnings yet</Text></View> : null}
        </ScrollView>
      ) : null}

      {tab === 'COD' && cod.data ? (
        <FlatList
          data={cod.data.ledgers || []}
          keyExtractor={(item: any) => item.id}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={cod.isRefetching} onRefresh={() => cod.refetch()} />}
          ListHeaderComponent={
            <>
              <View style={styles.grid}>
                <View style={styles.metric}><Text style={styles.metricLabel}>Cash held</Text><Text style={styles.metricValue}>{money(cod.data.cashHeldPaise)}</Text></View>
                <View style={styles.metric}><Text style={styles.metricLabel}>Deposited</Text><Text style={styles.metricValue}>{money(cod.data.depositedPaise)}</Text></View>
                <View style={styles.metric}><Text style={styles.metricLabel}>Variance</Text><Text style={[styles.metricValue, Number(cod.data.variancePaise) !== 0 && styles.negative]}>{money(cod.data.variancePaise)}</Text></View>
              </View>
              <View style={styles.notice}><ShieldCheck size={19} color="#087B5B" /><Text style={styles.noticeText}>Riders cannot self-settle COD. Store/Admin confirmation and immutable entries determine settlement.</Text></View>
              <Text style={styles.section}>COD receipts & handovers</Text>
            </>
          }
          ListEmptyComponent={<View style={styles.state}><Banknote size={34} color="#94A3B8" /><Text style={styles.error}>No COD ledger entries</Text></View>}
          renderItem={({ item }: { item: any }) => (
            <View style={styles.card}>
              <View style={styles.row}><View style={styles.flex}><Text style={styles.cardTitle}>Order #{String(item.orderId).slice(-8)}</Text><Text style={styles.meta}>Expected {money(item.expectedAmountPaise)} · Collected {money(item.collectedAmountPaise)}</Text></View><Text style={styles.status}>{title(item.status)}</Text></View>
              <Text style={styles.meta}>Held {money(item.riderHoldingBalancePaise)} · Deposited {money(item.depositedAmountPaise)} · Variance {money(item.variancePaise)}</Text>
              {item.settlementReference ? <Text style={styles.reference}>Receipt: {item.settlementReference}</Text> : null}
            </View>
          )}
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F7F6' }, header: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' }, flex: { flex: 1 }, heading: { color: '#0F172A', fontSize: 22, fontWeight: '900' }, subtitle: { color: '#64748B', fontSize: 12, marginTop: 3 }, refresh: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#E6F6F1', alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: '#FFFFFF' }, tab: { flex: 1, minHeight: 44, borderRadius: 14, backgroundColor: '#F1F5F9', flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' }, tabActive: { backgroundColor: '#087B5B' }, tabText: { color: '#475569', fontWeight: '900' }, tabTextActive: { color: '#FFFFFF' },
  content: { padding: 16, gap: 12, paddingBottom: 30 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, metric: { flexGrow: 1, minWidth: '46%', backgroundColor: '#FFFFFF', borderRadius: 17, padding: 15, borderWidth: 1, borderColor: '#E2E8F0' }, metricLabel: { color: '#64748B', fontSize: 11, fontWeight: '800' }, metricValue: { color: '#0F172A', fontSize: 20, fontWeight: '900', marginTop: 5 }, notice: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: '#E6F6F1', borderRadius: 16, padding: 14 }, noticeText: { flex: 1, color: '#075E47', fontSize: 12, lineHeight: 18, fontWeight: '700' }, section: { color: '#0F172A', fontSize: 16, fontWeight: '900', marginTop: 4 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 17, padding: 15, borderWidth: 1, borderColor: '#E2E8F0', gap: 8 }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }, cardTitle: { color: '#0F172A', fontWeight: '900' }, meta: { color: '#64748B', fontSize: 12, marginTop: 3 }, amount: { color: '#047857', fontSize: 17, fontWeight: '900' }, negative: { color: '#B91C1C' }, status: { color: '#087B5B', fontSize: 11, fontWeight: '900' }, reference: { color: '#334155', fontSize: 12, fontWeight: '800' }, state: { minHeight: 260, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10 }, error: { color: '#0F172A', fontSize: 18, fontWeight: '900', textAlign: 'center' }, muted: { color: '#64748B', textAlign: 'center' },
});
