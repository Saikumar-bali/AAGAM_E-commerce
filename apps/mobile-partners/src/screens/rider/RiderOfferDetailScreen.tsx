import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Clock3, MapPin, Package, XCircle } from 'lucide-react-native';
import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { riderService, RIDER_WORKSPACE_QUERY_KEY } from '../../api/riderService';
import { isOfferActionable, offerSecondsRemaining } from '../../domain/riderWorkspace';

function errorMessage(error: any) {
  const value = error?.response?.data?.message;
  return Array.isArray(value) ? value.join(', ') : value || error?.message || 'The offer could not be updated.';
}

export const RiderOfferDetailScreen = ({ route, navigation }: { route: any; navigation: any }) => {
  const assignmentId = String(route.params?.assignmentId || '');
  const queryClient = useQueryClient();
  const workspaceQuery = useQuery({
    queryKey: RIDER_WORKSPACE_QUERY_KEY,
    queryFn: riderService.getWorkspace,
    refetchInterval: 8_000,
    retry: 1,
  });
  const offer = useMemo(
    () => workspaceQuery.data?.pendingOffers.find((entry) => entry.id === assignmentId) || null,
    [assignmentId, workspaceQuery.data?.pendingOffers],
  );
  const remaining = offerSecondsRemaining(offer?.expiresAt);

  const accept = useMutation({
    mutationFn: () => riderService.acceptOffer(assignmentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RIDER_WORKSPACE_QUERY_KEY });
      Toast.show({ type: 'success', text1: 'Offer accepted' });
      navigation.replace('RiderActiveJob', { deliveryJobId: offer?.deliveryJobId || 'current' });
    },
    onError: (error: any) => Toast.show({ type: 'error', text1: 'Could not accept offer', text2: errorMessage(error) }),
  });
  const reject = useMutation({
    mutationFn: () => riderService.rejectOffer(assignmentId, 'RIDER_DECLINED'),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RIDER_WORKSPACE_QUERY_KEY });
      Toast.show({ type: 'success', text1: 'Offer declined' });
      navigation.popToTop();
    },
    onError: (error: any) => Toast.show({ type: 'error', text1: 'Could not decline offer', text2: errorMessage(error) }),
  });

  if (workspaceQuery.isLoading) {
    return <View style={styles.state}><ActivityIndicator size="large" color="#0F766E" /><Text style={styles.hint}>Loading offer…</Text></View>;
  }
  if (!offer || !isOfferActionable(offer)) {
    return (
      <View style={styles.state}>
        <Clock3 size={44} color="#94A3B8" />
        <Text style={styles.stateTitle}>This offer is no longer active</Text>
        <Text style={styles.hint}>It may have expired, been reassigned, or already been accepted.</Text>
        <TouchableOpacity style={styles.primary} onPress={() => navigation.popToTop()}><Text style={styles.primaryText}>Refresh jobs</Text></TouchableOpacity>
      </View>
    );
  }

  const job = offer.deliveryJob;
  const store = job.order.store;
  const customerAddress = [job.order.addressSnapshot?.line1, job.order.addressSnapshot?.city]
    .filter(Boolean).join(', ') || 'Customer address unavailable';

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}><ArrowLeft size={22} color="#FFFFFF" /></TouchableOpacity>
        <View style={styles.flex}><Text style={styles.eyebrow}>DELIVERY OFFER</Text><Text style={styles.title}>Review assignment</Text></View>
        <Text style={styles.timer}>{remaining == null ? 'Open' : `${remaining}s`}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Package size={24} color="#0F766E" />
          <View style={styles.flex}><Text style={styles.label}>Order</Text><Text style={styles.value}>#{job.orderId.slice(-8).toUpperCase()}</Text></View>
        </View>
        <View style={styles.routeCard}>
          <RouteRow label="Pickup" value={store?.name || 'Pickup store'} detail={store?.address || 'Store address unavailable'} />
          <View style={styles.divider} />
          <RouteRow label="Delivery" value={job.order.customer?.name || job.order.addressSnapshot?.recipientName || 'Customer'} detail={customerAddress} />
        </View>
        <View style={styles.actions}>
          <TouchableOpacity disabled={accept.isPending || reject.isPending} style={styles.reject} onPress={() => reject.mutate()}>
            {reject.isPending ? <ActivityIndicator color="#B91C1C" /> : <XCircle size={20} color="#B91C1C" />}
            <Text style={styles.rejectText}>Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity disabled={accept.isPending || reject.isPending} style={styles.accept} onPress={() => accept.mutate()}>
            {accept.isPending ? <ActivityIndicator color="#FFFFFF" /> : <CheckCircle2 size={20} color="#FFFFFF" />}
            <Text style={styles.acceptText}>Accept offer</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

function RouteRow({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <View style={styles.routeRow}><View style={styles.pin}><MapPin size={19} color="#0F766E" /></View><View style={styles.flex}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text><Text style={styles.detail}>{detail}</Text></View></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F4F7FB' }, flex: { flex: 1 },
  header: { minHeight: 116, paddingTop: 48, paddingHorizontal: 18, paddingBottom: 18, backgroundColor: '#067B5C', flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { width: 40, height: 40, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: '#A7F3D0', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 }, title: { color: '#FFFFFF', fontSize: 22, fontWeight: '900' },
  timer: { color: '#FFFFFF', fontWeight: '900', fontSize: 15 }, content: { padding: 16, paddingBottom: 110 },
  card: { minHeight: 72, borderRadius: 18, backgroundColor: '#FFFFFF', padding: 15, borderWidth: 1, borderColor: '#E2E8F0', flexDirection: 'row', alignItems: 'center', gap: 12 },
  routeCard: { marginTop: 12, borderRadius: 18, backgroundColor: '#FFFFFF', padding: 15, borderWidth: 1, borderColor: '#E2E8F0' },
  routeRow: { flexDirection: 'row', gap: 12 }, pin: { width: 40, height: 40, borderRadius: 14, backgroundColor: '#CCFBF1', alignItems: 'center', justifyContent: 'center' },
  label: { color: '#0F766E', fontSize: 10, fontWeight: '900' }, value: { color: '#0F172A', fontSize: 15, fontWeight: '900', marginTop: 2 }, detail: { color: '#64748B', fontSize: 11, lineHeight: 17, marginTop: 3 },
  divider: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 15 }, actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  reject: { flex: 1, minHeight: 50, borderRadius: 15, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, rejectText: { color: '#B91C1C', fontWeight: '900' },
  accept: { flex: 1.4, minHeight: 50, borderRadius: 15, backgroundColor: '#067B5C', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, acceptText: { color: '#FFFFFF', fontWeight: '900' },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: '#F4F7FB' }, stateTitle: { color: '#0F172A', fontSize: 20, fontWeight: '900', marginTop: 12, textAlign: 'center' }, hint: { color: '#64748B', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 7 }, primary: { marginTop: 18, minHeight: 48, borderRadius: 14, backgroundColor: '#067B5C', paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center' }, primaryText: { color: '#FFFFFF', fontWeight: '900' },
});
