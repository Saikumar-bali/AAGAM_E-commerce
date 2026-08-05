import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  CheckCircle2,
  Clock3,
  IndianRupee,
  MapPin,
  Package,
  Route,
  ShieldAlert,
  XCircle,
} from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { riderService, RIDER_WORKSPACE_QUERY_KEY } from '../../api/riderService';

function errorMessage(error: any) {
  const value = error?.response?.data?.message;
  return Array.isArray(value) ? value.join(', ') : value || error?.message || 'The offer could not be updated.';
}

function money(value: unknown) {
  if (value == null) return 'Not published';
  return `₹${(Number(value) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function label(value: unknown) {
  return String(value || 'UNKNOWN').replaceAll('_', ' ');
}

function remainingSeconds(expiresAt: string | null | undefined, now: number) {
  if (!expiresAt) return null;
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000));
}

export const RiderOfferDetailScreen = ({ route, navigation }: { route: any; navigation: any }) => {
  const insets = useSafeAreaInsets();
  const assignmentId = String(route.params?.assignmentId || '');
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [otherReason, setOtherReason] = useState('');
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);
  const query = useQuery({
    queryKey: ['rider', 'offer-detail', assignmentId],
    queryFn: () => riderService.getOfferDetail(assignmentId),
    enabled: Boolean(assignmentId),
    refetchInterval: 5_000,
    retry: 1,
  });
  const detail: any = query.data?.offer;
  const assignment: any = query.data?.assignment;
  const remaining = remainingSeconds(detail?.expiresAt, now);
  const actionable = detail?.status === 'OFFERED' && (remaining == null || remaining > 0);
  const rejectionReasons: string[] = Array.isArray(detail?.rejectionReasons) ? detail.rejectionReasons : [];
  const chosenReason = reason === 'OTHER' ? otherReason.trim() : reason;
  const payoutPublished = detail?.payout?.authoritative === true && detail?.payout?.totalPaise != null;

  const accept = useMutation({
    mutationFn: () => riderService.acceptOffer(assignmentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RIDER_WORKSPACE_QUERY_KEY });
      Toast.show({ type: 'success', text1: 'Offer accepted', text2: 'The canonical Rider assignment is now active.' });
      navigation.replace('RiderActiveJob', { deliveryJobId: detail?.deliveryJobId || assignment?.deliveryJobId || 'current' });
    },
    onError: (error: any) => Toast.show({ type: 'error', text1: 'Could not accept offer', text2: errorMessage(error) }),
  });
  const reject = useMutation({
    mutationFn: () => {
      if (!chosenReason) throw new Error('Select a structured rejection reason.');
      return riderService.rejectOffer(assignmentId, chosenReason);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RIDER_WORKSPACE_QUERY_KEY });
      Toast.show({ type: 'success', text1: 'Offer declined', text2: 'The exact reason was recorded.' });
      navigation.popToTop();
    },
    onError: (error: any) => Toast.show({ type: 'error', text1: 'Could not decline offer', text2: errorMessage(error) }),
  });

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#067B5C" />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to Rider offers" style={styles.back} onPress={() => navigation.goBack()}><ArrowLeft size={22} color="#FFFFFF" /></TouchableOpacity>
        <View style={styles.flex}><Text style={styles.eyebrow}>CANONICAL DELIVERY OFFER</Text><Text style={styles.title}>Review assignment</Text></View>
        <Text style={styles.timer}>{remaining == null ? 'Open' : `${remaining}s`}</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
      >
        {query.isLoading ? (
          <State loading title="Loading offer" text="Reading the Rider-owned assignment from the server." />
        ) : query.isError || !detail ? (
          <State title="Offer unavailable" text={(query.error as Error)?.message || 'The assignment could not be found.'} />
        ) : !actionable ? (
          <State title="This offer is no longer active" text="It expired, was reassigned, accepted, or rejected." />
        ) : (
          <>
            <View style={styles.orderCard}><Package size={24} color="#0F766E" /><View style={styles.flex}><Text style={styles.smallLabel}>ORDER</Text><Text style={styles.orderValue}>#{String(detail.orderId).slice(-8).toUpperCase()}</Text></View><Text style={styles.itemCount}>{detail.itemCount} item{detail.itemCount === 1 ? '' : 's'}</Text></View>

            <View style={styles.routeCard}>
              <RouteRow label="Pickup" value={detail.pickup?.name || 'Pickup store'} detail={detail.pickup?.address || 'Store address unavailable'} />
              <View style={styles.divider} />
              <RouteRow label="Delivery" value={detail.delivery?.customerName || 'Customer'} detail={[detail.delivery?.addressSnapshot?.line1, detail.delivery?.addressSnapshot?.landmark, detail.delivery?.addressSnapshot?.city].filter(Boolean).join(', ') || 'Customer address unavailable'} />
            </View>

            <View style={styles.metricsRow}>
              <Metric icon={<Route size={19} color="#0F766E" />} label="Distance" value={detail.distanceKm == null ? 'Unavailable' : `${detail.distanceKm} km`} />
              <Metric icon={<Clock3 size={19} color="#0F766E" />} label="ETA" value={detail.etaMinutes == null ? 'Unavailable' : `~${detail.etaMinutes} min`} />
              <Metric icon={<Package size={19} color="#0F766E" />} label="Parcels" value={detail.parcelCount == null ? `${detail.lineCount} lines` : String(detail.parcelCount)} />
            </View>

            <View style={[styles.card, !payoutPublished && styles.warningCard]}>
              <View style={styles.sectionHeader}><Banknote size={21} color={payoutPublished ? '#0F766E' : '#B45309'} /><Text style={styles.sectionTitle}>Rider payout</Text></View>
              <Text style={[styles.payoutAmount, !payoutPublished && styles.warningText]}>{money(detail.payout?.totalPaise)}</Text>
              {(detail.payout?.breakdown || []).map((entry: any, index: number) => <Fact key={`${entry.reference}-${index}`} label={label(entry.type)} value={`${money(entry.amountPaise)} · ${label(entry.status)}`} />)}
              {!payoutPublished ? <View style={styles.warningNote}><AlertTriangle size={18} color="#B45309" /><Text style={styles.warningNoteText}>A persisted payout has not been published for this offer. The app does not substitute the customer delivery fee or invent an earning amount.</Text></View> : null}
            </View>

            <View style={styles.card}>
              <View style={styles.sectionHeader}><IndianRupee size={21} color="#0F766E" /><Text style={styles.sectionTitle}>COD responsibility</Text></View>
              <Fact label="Cash required" value={detail.cod?.required ? 'Yes' : 'No'} />
              <Fact label="Amount" value={money(detail.cod?.amountPaise)} />
              <Fact label="Responsibility" value={detail.cod?.responsibility || 'Not provided'} />
            </View>

            <View style={styles.card}>
              <View style={styles.sectionHeader}><ShieldAlert size={21} color="#0F766E" /><Text style={styles.sectionTitle}>Operational checks</Text></View>
              <Fact label="Special handling" value={detail.specialHandling || 'None'} />
              <Fact label="Shift conflict" value={detail.shiftConflict ? 'Conflict detected' : 'No configured conflict'} danger={detail.shiftConflict} />
              <Fact label="Offer expires" value={detail.expiresAt ? new Date(detail.expiresAt).toLocaleString('en-IN') : 'No expiry'} />
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Decline reason</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reasonRail}>
                {rejectionReasons.map((value) => <TouchableOpacity key={value} accessibilityRole="button" accessibilityState={{ selected: reason === value }} style={[styles.reasonChip, reason === value && styles.reasonChipActive]} onPress={() => setReason(value)}><Text style={[styles.reasonText, reason === value && styles.reasonTextActive]}>{label(value)}</Text></TouchableOpacity>)}
              </ScrollView>
              {reason === 'OTHER' ? <TextInput value={otherReason} onChangeText={setOtherReason} placeholder="Enter the exact reason" placeholderTextColor="#94A3B8" maxLength={160} style={styles.input} /> : null}
            </View>

            <View style={styles.actions}>
              <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: reject.isPending || accept.isPending || !chosenReason }} disabled={reject.isPending || accept.isPending || !chosenReason} style={[styles.rejectButton, !chosenReason && styles.disabled]} onPress={() => reject.mutate()}>{reject.isPending ? <ActivityIndicator color="#B91C1C" /> : <XCircle size={20} color="#B91C1C" />}<Text style={styles.rejectText}>Decline</Text></TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: reject.isPending || accept.isPending }} disabled={reject.isPending || accept.isPending} style={styles.acceptButton} onPress={() => accept.mutate()}>{accept.isPending ? <ActivityIndicator color="#FFFFFF" /> : <CheckCircle2 size={20} color="#FFFFFF" />}<Text style={styles.acceptText}>Accept offer</Text></TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
};

function RouteRow({ label: rowLabel, value, detail }: { label: string; value: string; detail: string }) {
  return <View style={styles.routeRow}><View style={styles.pin}><MapPin size={19} color="#0F766E" /></View><View style={styles.flex}><Text style={styles.smallLabel}>{rowLabel}</Text><Text style={styles.routeValue}>{value}</Text><Text style={styles.routeDetail}>{detail}</Text></View></View>;
}

function Metric({ icon, label: metricLabel, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <View style={styles.metric}>{icon}<Text style={styles.metricLabel}>{metricLabel}</Text><Text style={styles.metricValue}>{value}</Text></View>;
}

function Fact({ label: factLabel, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return <View style={styles.fact}><Text style={styles.factLabel}>{factLabel}</Text><Text selectable style={[styles.factValue, danger && styles.danger]}>{value}</Text></View>;
}

function State({ loading = false, title, text }: { loading?: boolean; title: string; text: string }) {
  return <View style={styles.state}>{loading ? <ActivityIndicator size="large" color="#0F766E" /> : <Clock3 size={44} color="#94A3B8" />}<Text style={styles.stateTitle}>{title}</Text><Text style={styles.stateText}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' }, flex: { flex: 1 }, header: { backgroundColor: '#067B5C', paddingHorizontal: 16, paddingBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 12 }, back: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' }, eyebrow: { color: '#A7F3D0', fontSize: 9, fontWeight: '900', letterSpacing: 1 }, title: { color: '#FFFFFF', fontSize: 22, fontWeight: '900' }, timer: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' }, content: { padding: 14 },
  orderCard: { minHeight: 72, borderRadius: 17, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 11 }, smallLabel: { color: '#0F766E', fontSize: 9, fontWeight: '900' }, orderValue: { color: '#0F172A', fontSize: 16, fontWeight: '900', marginTop: 2 }, itemCount: { color: '#475569', fontSize: 11, fontWeight: '800' },
  routeCard: { marginTop: 10, borderRadius: 17, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 14 }, routeRow: { flexDirection: 'row', gap: 11 }, pin: { width: 41, height: 41, borderRadius: 13, backgroundColor: '#CCFBF1', alignItems: 'center', justifyContent: 'center' }, routeValue: { color: '#0F172A', fontSize: 14, fontWeight: '900', marginTop: 2 }, routeDetail: { color: '#64748B', fontSize: 10, lineHeight: 16, marginTop: 3 }, divider: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 14 },
  metricsRow: { flexDirection: 'row', gap: 8, marginTop: 10 }, metric: { flex: 1, minHeight: 92, borderRadius: 15, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center', padding: 8 }, metricLabel: { color: '#64748B', fontSize: 9, fontWeight: '800', marginTop: 5 }, metricValue: { color: '#0F172A', fontSize: 11, fontWeight: '900', marginTop: 3, textAlign: 'center' },
  card: { marginTop: 10, borderRadius: 17, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 14 }, warningCard: { backgroundColor: '#FFFBEB', borderColor: '#FCD34D' }, sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 }, sectionTitle: { color: '#0F172A', fontSize: 15, fontWeight: '900' }, payoutAmount: { color: '#067B5C', fontSize: 25, fontWeight: '900', marginTop: 11 }, warningText: { color: '#B45309' }, warningNote: { borderRadius: 12, backgroundColor: '#FEF3C7', padding: 10, marginTop: 10, flexDirection: 'row', gap: 7 }, warningNoteText: { flex: 1, color: '#92400E', fontSize: 10, lineHeight: 15 },
  fact: { paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' }, factLabel: { color: '#64748B', fontSize: 9, fontWeight: '800' }, factValue: { color: '#0F172A', fontSize: 11, lineHeight: 17, fontWeight: '700', marginTop: 3 }, danger: { color: '#B91C1C' },
  reasonRail: { gap: 7, paddingVertical: 11 }, reasonChip: { minHeight: 37, borderRadius: 11, backgroundColor: '#F1F5F9', paddingHorizontal: 11, justifyContent: 'center' }, reasonChipActive: { backgroundColor: '#0F766E' }, reasonText: { color: '#475569', fontSize: 9, fontWeight: '800' }, reasonTextActive: { color: '#FFFFFF' }, input: { minHeight: 49, borderRadius: 12, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC', paddingHorizontal: 12, color: '#0F172A' },
  actions: { flexDirection: 'row', gap: 9, marginTop: 11 }, rejectButton: { flex: 1, minHeight: 51, borderRadius: 14, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, rejectText: { color: '#B91C1C', fontWeight: '900' }, acceptButton: { flex: 1.35, minHeight: 51, borderRadius: 14, backgroundColor: '#067B5C', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, acceptText: { color: '#FFFFFF', fontWeight: '900' }, disabled: { opacity: 0.45 },
  state: { minHeight: 520, alignItems: 'center', justifyContent: 'center', padding: 28 }, stateTitle: { color: '#0F172A', fontSize: 20, fontWeight: '900', marginTop: 12, textAlign: 'center' }, stateText: { color: '#64748B', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 7 },
});
