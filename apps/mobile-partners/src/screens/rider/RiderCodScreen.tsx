import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  FileCheck2,
  LifeBuoy,
  RefreshCw,
  WalletCards,
} from 'lucide-react-native';
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

function money(value: unknown) {
  return `₹${(Number(value || 0) / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function label(value: unknown) {
  return String(value || 'UNKNOWN').replaceAll('_', ' ');
}

function date(value: unknown) {
  return value ? new Date(String(value)).toLocaleString('en-IN') : 'Not recorded';
}

type CodFilter = 'ALL' | 'HELD' | 'PARTIAL' | 'SETTLED' | 'VARIANCE';

export const RiderCodScreen = ({ navigation }: { navigation: any }) => {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<CodFilter>('ALL');
  const query = useQuery({
    queryKey: ['rider', 'cod-ledger'],
    queryFn: riderService.getCodLedger,
    retry: 1,
  });
  const data: any = query.data || {};
  const ledgers: any[] = Array.isArray(data.ledgers) ? data.ledgers : [];
  const visible = useMemo(() => ledgers.filter((ledger) => {
    if (filter === 'ALL') return true;
    if (filter === 'HELD') return ledger.status === 'HELD_BY_RIDER';
    if (filter === 'PARTIAL') return ledger.status === 'PARTIALLY_DEPOSITED';
    if (filter === 'SETTLED') return ledger.status === 'SETTLED';
    return ledger.status === 'VARIANCE_REVIEW';
  }), [filter, ledgers]);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#067B5C" />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to Rider profile" style={styles.headerButton} onPress={() => navigation.goBack()}>
          <ArrowLeft size={23} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>RIDER CASH ACCOUNTABILITY</Text>
          <Text style={styles.title}>COD ledger</Text>
        </View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Refresh COD ledger" style={styles.headerButton} onPress={() => void query.refetch()}>
          <RefreshCw size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroIcon}><WalletCards size={29} color="#FFFFFF" /></View>
          <View style={styles.flex}>
            <Text style={styles.heroLabel}>CASH CURRENTLY HELD</Text>
            <Text style={styles.heroAmount}>{money(data.cashHeldPaise)}</Text>
            <Text style={styles.heroText}>Deposit only against a recorded settlement reference.</Text>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <Summary label="Collected" value={money(data.collectedPaise)} />
          <Summary label="Deposited" value={money(data.depositedPaise)} />
          <Summary label="Variance" value={money(data.variancePaise)} warning={Number(data.variancePaise || 0) !== 0} />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {(['ALL', 'HELD', 'PARTIAL', 'SETTLED', 'VARIANCE'] as CodFilter[]).map((value) => (
            <TouchableOpacity
              key={value}
              accessibilityRole="button"
              accessibilityState={{ selected: filter === value }}
              style={[styles.filter, filter === value && styles.filterActive]}
              onPress={() => setFilter(value)}
            >
              <Text style={[styles.filterText, filter === value && styles.filterTextActive]}>{label(value)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.sectionTitle}>{visible.length} ledger{visible.length === 1 ? '' : 's'}</Text>
        {query.isLoading ? (
          <View style={styles.state}><ActivityIndicator size="large" color="#0F766E" /><Text style={styles.stateText}>Loading COD account…</Text></View>
        ) : query.isError ? (
          <View style={styles.state}><Text style={styles.stateTitle}>COD ledger unavailable</Text><Text style={styles.stateText}>{(query.error as Error)?.message || 'Pull down to retry.'}</Text></View>
        ) : visible.length === 0 ? (
          <View style={styles.state}><Banknote size={44} color="#94A3B8" /><Text style={styles.stateTitle}>No matching COD entries</Text><Text style={styles.stateText}>Change the status filter to review other settlements.</Text></View>
        ) : visible.map((ledger) => {
          const variance = Number(ledger.variancePaise || 0);
          const needsAction = Number(ledger.riderHoldingBalancePaise || 0) > 0 || ledger.status === 'VARIANCE_REVIEW';
          return (
            <View key={ledger.id} style={[styles.ledgerCard, needsAction && styles.ledgerAttention]}>
              <View style={styles.ledgerHeader}>
                <View style={styles.flex}>
                  <Text style={styles.orderCode}>ORDER #{String(ledger.orderId).slice(-8).toUpperCase()}</Text>
                  <Text style={styles.ledgerStatus}>{label(ledger.status)}</Text>
                </View>
                {needsAction ? <AlertTriangle size={23} color="#B45309" /> : <FileCheck2 size={23} color="#15803D" />}
              </View>

              <View style={styles.amountGrid}>
                <Amount label="Expected" value={money(ledger.expectedAmountPaise)} />
                <Amount label="Collected" value={money(ledger.collectedAmountPaise)} />
                <Amount label="Deposited" value={money(ledger.depositedAmountPaise)} />
                <Amount label="Holding" value={money(ledger.riderHoldingBalancePaise)} strong={Number(ledger.riderHoldingBalancePaise || 0) > 0} />
              </View>

              <Fact label="Settlement reference" value={ledger.settlementReference || 'Not assigned'} />
              <Fact label="Collection time" value={date(ledger.collectionTimestamp)} />
              <Fact label="Variance" value={`${money(variance)}${ledger.varianceReason ? ` · ${ledger.varianceReason}` : ''}`} danger={variance !== 0} />

              <Text style={styles.auditTitle}>Deposit and settlement history</Text>
              {(ledger.entries || []).map((entry: any) => (
                <View key={entry.id} style={styles.auditRow}>
                  <View style={styles.auditDot} />
                  <View style={styles.flex}>
                    <Text style={styles.auditType}>{label(entry.type)}</Text>
                    <Text style={styles.auditMeta}>{money(entry.amountPaise)} · {date(entry.createdAt)}</Text>
                    <Text selectable style={styles.auditMeta}>Reference: {entry.reference || 'Not recorded'}</Text>
                    <Text style={styles.auditMeta}>Holding after: {money(entry.holdingAfterPaise)} · deposited after: {money(entry.depositedAfterPaise)}</Text>
                  </View>
                </View>
              ))}

              <View style={styles.actions}>
                <TouchableOpacity
                  accessibilityRole="button"
                  style={styles.secondaryAction}
                  onPress={() => navigation.navigate('Operations', {
                    screen: 'RiderReceipt',
                    params: { deliveryJobId: ledger.deliveryJobId },
                  })}
                >
                  <FileCheck2 size={18} color="#0F766E" /><Text style={styles.secondaryText}>Receipt</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  style={styles.secondaryAction}
                  onPress={() => navigation.navigate('RiderSupport', { deliveryJobId: ledger.deliveryJobId })}
                >
                  <LifeBuoy size={18} color="#0F766E" /><Text style={styles.secondaryText}>{ledger.status === 'VARIANCE_REVIEW' ? 'Dispute variance' : 'Job support'}</Text>
                </TouchableOpacity>
              </View>
              {needsAction ? <View style={styles.actionNote}><Text style={styles.actionNoteText}>Cash settlement is completed by the store or admin. Keep the physical deposit receipt and use Support if the reference, partial amount, or variance is incorrect.</Text></View> : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

function Summary({ label: summaryLabel, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return <View style={styles.summaryCard}><Text style={styles.summaryLabel}>{summaryLabel}</Text><Text style={[styles.summaryValue, warning && styles.danger]}>{value}</Text></View>;
}

function Amount({ label: amountLabel, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <View style={styles.amountCell}><Text style={styles.amountLabel}>{amountLabel}</Text><Text style={[styles.amountValue, strong && styles.strongAmount]}>{value}</Text></View>;
}

function Fact({ label: factLabel, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return <View style={styles.fact}><Text style={styles.factLabel}>{factLabel}</Text><Text selectable style={[styles.factValue, danger && styles.danger]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' }, flex: { flex: 1 },
  header: { backgroundColor: '#067B5C', paddingHorizontal: 16, paddingBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: '#A7F3D0', fontSize: 9, fontWeight: '900', letterSpacing: 1 }, title: { color: '#FFFFFF', fontSize: 24, fontWeight: '900' },
  content: { padding: 14 },
  heroCard: { borderRadius: 20, backgroundColor: '#0F172A', padding: 18, flexDirection: 'row', alignItems: 'center', gap: 13 },
  heroIcon: { width: 54, height: 54, borderRadius: 17, backgroundColor: '#059669', alignItems: 'center', justifyContent: 'center' }, heroLabel: { color: '#A7F3D0', fontSize: 10, fontWeight: '900' }, heroAmount: { color: '#FFFFFF', fontSize: 27, fontWeight: '900', marginTop: 2 }, heroText: { color: '#CBD5E1', fontSize: 10, lineHeight: 15, marginTop: 3 },
  summaryRow: { flexDirection: 'row', gap: 8, marginTop: 10 }, summaryCard: { flex: 1, borderRadius: 15, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 11 }, summaryLabel: { color: '#64748B', fontSize: 9, fontWeight: '800' }, summaryValue: { color: '#0F172A', fontSize: 13, fontWeight: '900', marginTop: 4 },
  filters: { gap: 7, paddingVertical: 12 }, filter: { minHeight: 38, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1', paddingHorizontal: 12, justifyContent: 'center' }, filterActive: { backgroundColor: '#0F766E', borderColor: '#0F766E' }, filterText: { color: '#475569', fontSize: 10, fontWeight: '800' }, filterTextActive: { color: '#FFFFFF' },
  sectionTitle: { color: '#0F172A', fontSize: 16, fontWeight: '900', marginBottom: 9 },
  ledgerCard: { borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 15, marginBottom: 11 }, ledgerAttention: { borderColor: '#FCD34D', backgroundColor: '#FFFBEB' }, ledgerHeader: { flexDirection: 'row', alignItems: 'center' }, orderCode: { color: '#0F172A', fontSize: 13, fontWeight: '900' }, ledgerStatus: { color: '#0F766E', fontSize: 10, fontWeight: '900', marginTop: 3 },
  amountGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }, amountCell: { width: '47%', borderRadius: 12, backgroundColor: '#F8FAFC', padding: 11 }, amountLabel: { color: '#64748B', fontSize: 9, fontWeight: '800' }, amountValue: { color: '#0F172A', fontSize: 14, fontWeight: '900', marginTop: 4 }, strongAmount: { color: '#B45309' },
  fact: { paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' }, factLabel: { color: '#64748B', fontSize: 9, fontWeight: '800' }, factValue: { color: '#0F172A', fontSize: 12, lineHeight: 18, fontWeight: '700', marginTop: 3 }, danger: { color: '#B91C1C' },
  auditTitle: { color: '#0F172A', fontSize: 13, fontWeight: '900', marginTop: 13 }, auditRow: { flexDirection: 'row', gap: 9, paddingVertical: 9 }, auditDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#0F766E', marginTop: 4 }, auditType: { color: '#0F172A', fontSize: 11, fontWeight: '900' }, auditMeta: { color: '#64748B', fontSize: 9, lineHeight: 14, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 11 }, secondaryAction: { flex: 1, minHeight: 45, borderRadius: 12, borderWidth: 1, borderColor: '#99D8C8', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, secondaryText: { color: '#0F766E', fontSize: 11, fontWeight: '900' },
  actionNote: { borderRadius: 12, backgroundColor: '#FEF3C7', padding: 11, marginTop: 9, flexDirection: 'row', alignItems: 'center', gap: 7 }, actionNoteText: { flex: 1, color: '#92400E', fontSize: 10, lineHeight: 15 },
  state: { minHeight: 260, alignItems: 'center', justifyContent: 'center', padding: 28 }, stateTitle: { color: '#0F172A', fontSize: 18, fontWeight: '900', marginTop: 10 }, stateText: { color: '#64748B', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 6 },
});
