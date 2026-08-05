import { useAuthStore } from '@aagam/mobile-shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, FileCheck2, RefreshCw } from 'lucide-react-native';
import React, { useEffect } from 'react';
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
  return String(value || 'NOT RECORDED').replaceAll('_', ' ');
}

function date(value: unknown) {
  return value ? new Date(String(value)).toLocaleString('en-IN') : 'Not recorded';
}

export const RiderReceiptScreen = ({ route, navigation }: { route: any; navigation: any }) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const deliveryJobId = String(route.params?.deliveryJobId || '');
  const query = useQuery({
    queryKey: ['rider', 'receipt', deliveryJobId],
    queryFn: () => riderService.getReceipt(deliveryJobId),
    enabled: Boolean(deliveryJobId),
    retry: 1,
  });
  const receipt: any = query.data;

  useEffect(() => {
    if (!receipt?.deliveryJobId || !user?.id) return;
    void riderService.cacheLastCompletedJob(user.id, receipt.deliveryJobId);
  }, [receipt?.deliveryJobId, receipt?.orderId, user?.id]);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#067B5C" />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to delivery detail" style={styles.headerButton} onPress={() => navigation.goBack()}>
          <ArrowLeft size={23} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>SERVER-RESTORED RECEIPT</Text>
          <Text style={styles.title}>Delivery receipt</Text>
        </View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Refresh receipt" style={styles.headerButton} onPress={() => void query.refetch()}>
          <RefreshCw size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
      >
        {query.isLoading ? (
          <View style={styles.state}><ActivityIndicator size="large" color="#0F766E" /><Text style={styles.stateText}>Restoring receipt from Aagaam…</Text></View>
        ) : query.isError || !receipt ? (
          <View style={styles.state}><Text style={styles.stateTitle}>Receipt unavailable</Text><Text style={styles.stateText}>{(query.error as Error)?.message || 'The authoritative receipt could not be loaded.'}</Text></View>
        ) : (
          <>
            <View style={styles.heroCard}>
              <View style={styles.check}><CheckCircle2 size={34} color="#FFFFFF" /></View>
              <Text style={styles.status}>{label(receipt.status)}</Text>
              <Text selectable style={styles.receiptId}>{receipt.receiptId}</Text>
              <Text style={styles.issued}>Issued {date(receipt.issuedAt)}</Text>
            </View>

            <Card title="Order">
              <Fact label="Order ID" value={receipt.orderId} />
              <Fact label="Delivery job" value={receipt.deliveryJobId} />
              <Fact label="Store" value={receipt.order?.store?.name || 'Unavailable'} />
              <Fact label="Items" value={`${receipt.order?.itemCount || 0} unit(s) · ${receipt.order?.items?.length || 0} line(s)`} />
              <Fact label="Order amount" value={money(receipt.order?.amountPaise)} strong />
            </Card>

            <Card title="Proof of handoff">
              <Fact label="Pickup method" value={label(receipt.proof?.pickup?.verificationMethod)} />
              <Fact label="Pickup verified" value={date(receipt.proof?.pickup?.verifiedAt)} />
              <Fact label="Parcel count" value={String(receipt.proof?.pickup?.parcelCount ?? 'Not recorded')} />
              <Fact label="Delivery method" value={label(receipt.proof?.delivery?.verificationMethod)} />
              <Fact label="Delivery verified" value={date(receipt.proof?.delivery?.verifiedAt)} />
              <Fact label="Rider confirmation" value={date(receipt.proof?.delivery?.riderConfirmedAt)} />
            </Card>

            <Card title="COD settlement">
              {receipt.cod ? (
                <>
                  <Fact label="Expected" value={money(receipt.cod.expectedAmountPaise)} />
                  <Fact label="Collected" value={money(receipt.cod.collectedAmountPaise)} />
                  <Fact label="Deposited" value={money(receipt.cod.depositedAmountPaise)} />
                  <Fact label="Rider holding" value={money(receipt.cod.riderHoldingBalancePaise)} />
                  <Fact label="Settlement status" value={label(receipt.cod.status)} />
                  <Fact label="Settlement reference" value={receipt.cod.settlementReference || 'Not settled'} />
                  <Fact label="Variance" value={money(receipt.cod.variancePaise)} />
                </>
              ) : <Text style={styles.emptyText}>This was not a COD delivery.</Text>}
            </Card>

            <Card title="Rider earnings">
              <Fact label="Authoritative total" value={money(receipt.earnings?.totalPaise)} strong />
              {(receipt.earnings?.records || []).map((record: any) => (
                <Fact
                  key={record.id}
                  label={label(record.type)}
                  value={`${money(record.type === 'PENALTY' ? -Math.abs(record.amountPaise) : record.amountPaise)} · ${label(record.status)}`}
                />
              ))}
            </Card>

            <Card title="Receipt audit trail">
              {(receipt.timeline || []).map((event: any) => (
                <View key={`${event.source}-${event.id}`} style={styles.timelineRow}>
                  <FileCheck2 size={17} color="#0F766E" />
                  <View style={styles.flex}><Text style={styles.timelineTitle}>{label(event.type)}</Text><Text style={styles.timelineMeta}>{label(event.status)} · {date(event.createdAt)}</Text></View>
                </View>
              ))}
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
};

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.card}><Text style={styles.cardTitle}>{title}</Text>{children}</View>;
}

function Fact({ label: factLabel, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <View style={styles.fact}><Text style={styles.factLabel}>{factLabel}</Text><Text selectable style={[styles.factValue, strong && styles.factStrong]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' }, flex: { flex: 1 },
  header: { backgroundColor: '#067B5C', paddingHorizontal: 16, paddingBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: '#A7F3D0', fontSize: 10, fontWeight: '900', letterSpacing: 1 }, title: { color: '#FFFFFF', fontSize: 24, fontWeight: '900' },
  content: { padding: 14 },
  heroCard: { borderRadius: 22, backgroundColor: '#0F172A', alignItems: 'center', padding: 22 },
  check: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#059669', alignItems: 'center', justifyContent: 'center' },
  status: { color: '#A7F3D0', fontSize: 12, fontWeight: '900', marginTop: 12 }, receiptId: { color: '#FFFFFF', fontSize: 17, fontWeight: '900', marginTop: 5 }, issued: { color: '#CBD5E1', fontSize: 11, marginTop: 5 },
  card: { marginTop: 12, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 15 },
  cardTitle: { color: '#0F172A', fontSize: 16, fontWeight: '900', marginBottom: 5 },
  fact: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' },
  factLabel: { color: '#64748B', fontSize: 10, fontWeight: '800' }, factValue: { color: '#0F172A', fontSize: 13, fontWeight: '700', lineHeight: 19, marginTop: 3 }, factStrong: { color: '#067B5C', fontSize: 17, fontWeight: '900' },
  emptyText: { color: '#64748B', fontSize: 12, paddingVertical: 10 },
  timelineRow: { flexDirection: 'row', gap: 10, paddingVertical: 9, alignItems: 'flex-start' }, timelineTitle: { color: '#0F172A', fontSize: 12, fontWeight: '800' }, timelineMeta: { color: '#64748B', fontSize: 10, marginTop: 2 },
  state: { minHeight: 440, alignItems: 'center', justifyContent: 'center', padding: 28 }, stateTitle: { color: '#0F172A', fontSize: 19, fontWeight: '900' }, stateText: { color: '#64748B', textAlign: 'center', marginTop: 7 },
});
