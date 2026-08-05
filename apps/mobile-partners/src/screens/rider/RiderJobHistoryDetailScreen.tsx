import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Banknote, FileText, LifeBuoy, MapPin, PackageCheck, RefreshCw } from 'lucide-react-native';
import React from 'react';
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

function date(value: unknown) {
  if (!value) return 'Not recorded';
  return new Date(String(value)).toLocaleString('en-IN');
}

function label(value: unknown) {
  return String(value || 'UNKNOWN').replaceAll('_', ' ');
}

export const RiderJobHistoryDetailScreen = ({ route, navigation }: { route: any; navigation: any }) => {
  const insets = useSafeAreaInsets();
  const deliveryJobId = String(route.params?.deliveryJobId || '');
  const query = useQuery({
    queryKey: ['rider', 'history-detail', deliveryJobId],
    queryFn: () => riderService.getHistoryDetail(deliveryJobId),
    enabled: Boolean(deliveryJobId),
    retry: 1,
  });
  const data: any = query.data;
  const job = data?.job;
  const earnings: any[] = Array.isArray(data?.earnings) ? data.earnings : [];
  const operations: any[] = Array.isArray(data?.operations) ? data.operations : [];
  const address = job?.order?.addressSnapshot || {};

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#067B5C" />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to delivery history" style={styles.headerButton} onPress={() => navigation.goBack()}>
          <ArrowLeft size={23} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>RIDER JOB DETAIL</Text>
          <Text style={styles.title}>{job ? `#${String(job.orderId).slice(-8).toUpperCase()}` : 'Delivery detail'}</Text>
        </View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Refresh delivery detail" style={styles.headerButton} onPress={() => void query.refetch()}>
          <RefreshCw size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
      >
        {query.isLoading ? (
          <View style={styles.state}><ActivityIndicator size="large" color="#0F766E" /><Text style={styles.stateText}>Loading authoritative detail…</Text></View>
        ) : query.isError || !job ? (
          <View style={styles.state}><Text style={styles.stateTitle}>Delivery detail unavailable</Text><Text style={styles.stateText}>{(query.error as Error)?.message || 'The Rider-owned job could not be found.'}</Text></View>
        ) : (
          <>
            <View style={styles.summaryCard}>
              <Text style={styles.status}>{label(job.status)}</Text>
              <Text style={styles.store}>{job.order?.store?.name || 'Pickup store'}</Text>
              <Text style={styles.meta}>Last updated {date(job.updatedAt)}</Text>
              <Text style={styles.amount}>{money(job.order?.grandTotalPaise)}</Text>
            </View>

            <Section icon={<MapPin size={20} color="#0F766E" />} title="Route">
              <Fact label="Pickup" value={job.order?.store?.address || 'Unavailable'} />
              <Fact label="Delivery" value={[address.line1, address.landmark, address.city].filter(Boolean).join(', ') || 'Unavailable'} />
            </Section>

            <Section icon={<PackageCheck size={20} color="#0F766E" />} title="Verification proof">
              <Fact label="Pickup method" value={label(job.pickupProof?.verificationMethod)} />
              <Fact label="Pickup verified" value={date(job.pickupProof?.verifiedAt)} />
              <Fact label="Parcel count" value={String(job.pickupProof?.parcelCount ?? 'Not recorded')} />
              <Fact label="Delivery method" value={label(job.deliveryProof?.verificationMethod)} />
              <Fact label="Delivery verified" value={date(job.deliveryProof?.verifiedAt)} />
              <Fact label="Rider note" value={job.deliveryProof?.note || 'No note'} />
            </Section>

            <Section icon={<Banknote size={20} color="#0F766E" />} title="COD and Rider earnings">
              <Fact label="COD status" value={job.codLedger ? label(job.codLedger.status) : 'Not a COD ledger'} />
              <Fact label="Collected" value={job.codLedger ? money(job.codLedger.collectedAmountPaise) : '—'} />
              <Fact label="Deposited" value={job.codLedger ? money(job.codLedger.depositedAmountPaise) : '—'} />
              <Fact label="Rider holding" value={job.codLedger ? money(job.codLedger.riderHoldingBalancePaise) : '—'} />
              <Fact label="Settlement reference" value={job.codLedger?.settlementReference || 'Not settled'} />
              {earnings.map((earning) => (
                <Fact key={earning.id} label={label(earning.type)} value={`${money(earning.type === 'PENALTY' ? -Math.abs(earning.amountPaise) : earning.amountPaise)} · ${label(earning.status)}`} />
              ))}
            </Section>

            <Section icon={<FileText size={20} color="#0F766E" />} title="Audit timeline">
              {job.events.map((event: any) => (
                <View key={event.id} style={styles.timelineRow}>
                  <View style={styles.timelineDot} />
                  <View style={styles.flex}><Text style={styles.timelineTitle}>{label(event.eventType)}</Text><Text style={styles.timelineMeta}>{date(event.createdAt)}</Text></View>
                </View>
              ))}
              {operations.map((operation) => (
                <View key={operation.id} style={styles.timelineRow}>
                  <View style={styles.timelineDot} />
                  <View style={styles.flex}><Text style={styles.timelineTitle}>{label(operation.type)}</Text><Text style={styles.timelineMeta}>{label(operation.status)} · {date(operation.createdAt)}</Text></View>
                </View>
              ))}
            </Section>

            {data.receiptAvailable ? (
              <TouchableOpacity accessibilityRole="button" style={styles.primary} onPress={() => navigation.navigate('RiderReceipt', { deliveryJobId })}>
                <FileText size={19} color="#FFFFFF" /><Text style={styles.primaryText}>Open authoritative receipt</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              accessibilityRole="button"
              style={styles.secondary}
              onPress={() => navigation.getParent()?.navigate('RiderSupport', { deliveryJobId })}
            >
              <LifeBuoy size={19} color="#0F766E" /><Text style={styles.secondaryText}>Get support for this job</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
};

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return <View style={styles.card}><View style={styles.sectionHeader}>{icon}<Text style={styles.sectionTitle}>{title}</Text></View>{children}</View>;
}

function Fact({ label: factLabel, value }: { label: string; value: string }) {
  return <View style={styles.fact}><Text style={styles.factLabel}>{factLabel}</Text><Text selectable style={styles.factValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' }, flex: { flex: 1 },
  header: { backgroundColor: '#067B5C', paddingHorizontal: 16, paddingBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: '#A7F3D0', fontSize: 10, fontWeight: '900', letterSpacing: 1 }, title: { color: '#FFFFFF', fontSize: 24, fontWeight: '900', marginTop: 2 },
  content: { padding: 14 },
  summaryCard: { borderRadius: 19, padding: 18, backgroundColor: '#0F172A' },
  status: { color: '#A7F3D0', fontSize: 11, fontWeight: '900' }, store: { color: '#FFFFFF', fontSize: 21, fontWeight: '900', marginTop: 8 },
  meta: { color: '#CBD5E1', fontSize: 11, marginTop: 5 }, amount: { color: '#FFFFFF', fontSize: 26, fontWeight: '900', marginTop: 16 },
  card: { marginTop: 12, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 15 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 8 }, sectionTitle: { color: '#0F172A', fontSize: 16, fontWeight: '900' },
  fact: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' },
  factLabel: { color: '#64748B', fontSize: 10, fontWeight: '800' }, factValue: { color: '#0F172A', fontSize: 13, fontWeight: '700', lineHeight: 19, marginTop: 3 },
  timelineRow: { flexDirection: 'row', gap: 10, paddingVertical: 9 }, timelineDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#0F766E', marginTop: 4 },
  timelineTitle: { color: '#0F172A', fontSize: 12, fontWeight: '800' }, timelineMeta: { color: '#64748B', fontSize: 10, marginTop: 2 },
  primary: { minHeight: 52, borderRadius: 15, backgroundColor: '#067B5C', marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, primaryText: { color: '#FFFFFF', fontWeight: '900' },
  secondary: { minHeight: 52, borderRadius: 15, borderWidth: 1, borderColor: '#99D8C8', marginTop: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, secondaryText: { color: '#0F766E', fontWeight: '900' },
  state: { minHeight: 420, alignItems: 'center', justifyContent: 'center', padding: 28 }, stateTitle: { color: '#0F172A', fontSize: 19, fontWeight: '900' }, stateText: { color: '#64748B', textAlign: 'center', marginTop: 7 },
});
