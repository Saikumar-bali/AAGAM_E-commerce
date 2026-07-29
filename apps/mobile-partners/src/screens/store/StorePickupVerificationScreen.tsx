import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  KeyRound,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
  User,
} from 'lucide-react-native';
import { deliveryOperationsService } from '../../api/deliveryOperationsService';
import { pickupOperationsService } from '../../api/pickupOperationsService';
import { normalizeParcelCount, pickupReadinessLabel } from '../../domain/pickupOperations';

const QUEUE_KEY = ['store', 'pickup-verification'] as const;

type IssuedPin = {
  code: string;
  expiresAt: string;
  parcelCount: number;
};

function errorMessage(error: any) {
  const value = error?.response?.data?.message;
  if (Array.isArray(value)) return value.join(', ');
  return value || error?.message || 'The pickup operation could not be completed.';
}

function shortId(value?: string | null) {
  return value ? value.slice(-8).toUpperCase() : 'UNKNOWN';
}

function minutesUntil(value: string) {
  return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 60_000));
}

export const StorePickupVerificationScreen = () => {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [parcelCounts, setParcelCounts] = useState<Record<string, string>>({});
  const [issuedPins, setIssuedPins] = useState<Record<string, IssuedPin>>({});

  const queueQuery = useQuery({
    queryKey: QUEUE_KEY,
    queryFn: async () => {
      const queue = await deliveryOperationsService.getQueue();
      const jobs = queue.filter((job: any) => job.status === 'RIDER_AT_STORE');
      return Promise.all(
        jobs.map(async (job: any) => ({
          ...job,
          pickupReadiness: await pickupOperationsService.getReadiness(job.id),
        })),
      );
    },
    refetchInterval: 8_000,
    retry: 1,
  });

  const jobs = queueQuery.data || [];

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: QUEUE_KEY });
    await queueQuery.refetch();
  };

  const perform = async (
    key: string,
    task: () => Promise<any>,
    title: string,
    body: string,
  ) => {
    if (busy) return null;
    setBusy(key);
    try {
      const result = await task();
      await refresh();
      Alert.alert(title, body);
      return result;
    } catch (error: any) {
      Alert.alert('Operation failed', errorMessage(error));
      return null;
    } finally {
      setBusy(null);
    }
  };

  const parcelCount = (jobId: string) => normalizeParcelCount(parcelCounts[jobId] || '1');

  const issuePin = async (job: any) => {
    if (!job.pickupReadiness?.ready) {
      Alert.alert(
        'Rider checklist pending',
        'The rider must verify every item quantity before a pickup PIN can be issued.',
      );
      return;
    }
    const result = await perform(
      `pin:${job.id}`,
      () => deliveryOperationsService.issuePickupChallenge(job.id, {
        method: 'STORE_PICKUP_PIN',
        parcelCount: parcelCount(job.id),
      }),
      'Pickup PIN issued',
      'Show this six-digit PIN only to the assigned rider at the store.',
    );
    if (result) {
      setIssuedPins((current) => ({
        ...current,
        [job.id]: {
          code: result.code,
          expiresAt: result.expiresAt,
          parcelCount: result.parcelCount,
        },
      }));
    }
  };

  const confirmHandoff = (job: any) => {
    if (!job.pickupReadiness?.ready) {
      Alert.alert(
        'Rider checklist pending',
        'The rider must verify every item quantity before direct handoff can be confirmed.',
      );
      return;
    }
    const count = parcelCount(job.id);
    Alert.alert(
      'Confirm physical handoff?',
      `Confirm that ${count} parcel(s) were handed to the assigned rider.`,
      [
        { text: 'Back', style: 'cancel' },
        {
          text: 'Confirm handoff',
          onPress: () => void perform(
            `handoff:${job.id}`,
            () => deliveryOperationsService.confirmStoreHandoff(job.id, { parcelCount: count }),
            'Pickup confirmed',
            'The rider can now start customer delivery.',
          ),
        },
      ],
    );
  };

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={queueQuery.isRefetching} onRefresh={() => void refresh()} />}
    >
      <View style={styles.hero}>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>STORE PICKUP</Text>
          <Text style={styles.title}>Rider handoff</Text>
          <Text style={styles.subtitle}>Release parcels only after the rider verifies every item.</Text>
        </View>
        <TouchableOpacity testID="store_pickup_refresh" style={styles.refreshButton} onPress={() => void refresh()}>
          <RefreshCw size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {queueQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0F766E" />
          <Text style={styles.muted}>Loading rider arrivals…</Text>
        </View>
      ) : queueQuery.error ? (
        <View style={styles.errorCard}>
          <AlertTriangle size={36} color="#B91C1C" />
          <Text style={styles.errorTitle}>Pickup queue unavailable</Text>
          <Text style={styles.errorText}>{errorMessage(queueQuery.error)}</Text>
        </View>
      ) : jobs.length === 0 ? (
        <View style={styles.emptyCard}>
          <PackageCheck size={48} color="#94A3B8" />
          <Text style={styles.emptyTitle}>No riders waiting</Text>
          <Text style={styles.emptyText}>An order appears here after its assigned rider marks arrival.</Text>
        </View>
      ) : (
        jobs.map((job: any) => {
          const order = job.order || {};
          const readiness = job.pickupReadiness;
          const ready = Boolean(readiness?.ready);
          const problem = readiness?.task?.status === 'PROBLEM_REPORTED';
          const rider = job.currentRider?.user || {};
          const items = order.items || [];
          const pin = issuedPins[job.id];

          return (
            <View key={job.id} style={styles.jobCard}>
              <View style={styles.jobHeader}>
                <View style={styles.flex}>
                  <Text style={styles.orderCode}>ORDER #{shortId(order.id)}</Text>
                  <Text style={styles.jobTitle}>Rider at store</Text>
                  <Text style={styles.storeMeta}>{order.store?.name || 'Store pickup'}</Text>
                </View>
                <View style={styles.riderBadge}>
                  <User size={14} color="#0F766E" />
                  <Text style={styles.riderName}>{rider.name || 'Assigned rider'}</Text>
                </View>
              </View>

              <View style={[
                styles.readinessCard,
                ready ? styles.readinessReady : problem ? styles.readinessProblem : styles.readinessWaiting,
              ]}>
                {ready ? (
                  <CheckCircle2 size={20} color="#15803D" />
                ) : problem ? (
                  <AlertTriangle size={20} color="#B91C1C" />
                ) : (
                  <ClipboardCheck size={20} color="#B45309" />
                )}
                <View style={styles.flex}>
                  <Text style={styles.readinessTitle}>{pickupReadinessLabel(readiness?.task?.status)}</Text>
                  {readiness?.task?.problemNote ? (
                    <Text style={styles.problemNote}>{readiness.task.problemType}: {readiness.task.problemNote}</Text>
                  ) : (
                    <Text style={styles.readinessCopy}>
                      {ready ? 'Pickup proof controls are unlocked.' : 'Ask the rider to verify the checklist in Operations.'}
                    </Text>
                  )}
                </View>
              </View>

              <View style={styles.itemsBox}>
                <Text style={styles.itemsHeading}>PACKED ITEMS ({items.length})</Text>
                {items.map((item: any) => (
                  <Text key={item.id} style={styles.itemLine}>{item.product?.name || 'Item'} × {item.quantity}</Text>
                ))}
              </View>

              <View style={styles.parcelRow}>
                <View style={styles.flex}>
                  <Text style={styles.fieldLabel}>PARCEL COUNT</Text>
                  <Text style={styles.fieldHelp}>The rider must enter the same count.</Text>
                </View>
                <TextInput
                  testID={`store_pickup_parcel_count_${job.id}`}
                  value={parcelCounts[job.id] || ''}
                  onChangeText={(value) => setParcelCounts((current) => ({
                    ...current,
                    [job.id]: value.replace(/\D/g, '').slice(0, 3),
                  }))}
                  placeholder="1"
                  keyboardType="number-pad"
                  placeholderTextColor="#94A3B8"
                  style={styles.parcelInput}
                />
              </View>

              {pin ? (
                <View style={styles.pinCard}>
                  <KeyRound size={22} color="#B45309" />
                  <View style={styles.flex}>
                    <Text style={styles.pinLabel}>PICKUP PIN</Text>
                    <Text selectable style={styles.pinCode}>{pin.code}</Text>
                    <Text style={styles.pinMeta}>{pin.parcelCount} parcel(s) · expires in {minutesUntil(pin.expiresAt)} min</Text>
                  </View>
                </View>
              ) : null}

              <TouchableOpacity
                testID={`store_pickup_issue_pin_${job.id}`}
                style={[styles.primaryButton, (!ready || busy) && styles.disabled]}
                disabled={!ready || Boolean(busy)}
                onPress={() => void issuePin(job)}
              >
                {busy === `pin:${job.id}` ? <ActivityIndicator color="#FFFFFF" /> : <KeyRound size={18} color="#FFFFFF" />}
                <Text style={styles.buttonText}>Issue six-digit rider PIN</Text>
              </TouchableOpacity>

              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR</Text>
                <View style={styles.dividerLine} />
              </View>

              <TouchableOpacity
                testID={`store_pickup_confirm_handoff_${job.id}`}
                style={[styles.confirmButton, (!ready || busy) && styles.disabled]}
                disabled={!ready || Boolean(busy)}
                onPress={() => confirmHandoff(job)}
              >
                {busy === `handoff:${job.id}` ? <ActivityIndicator color="#FFFFFF" /> : <ShieldCheck size={18} color="#FFFFFF" />}
                <Text style={styles.buttonText}>Confirm physical handoff</Text>
              </TouchableOpacity>
            </View>
          );
        })
      )}
      <View style={{ height: 110 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F5F3EE' },
  content: { paddingBottom: 20 },
  flex: { flex: 1 },
  hero: { backgroundColor: '#0F172A', paddingTop: 56, paddingHorizontal: 20, paddingBottom: 24, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, flexDirection: 'row', alignItems: 'center' },
  eyebrow: { color: '#5EEAD4', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: '#FFFFFF', fontSize: 28, fontWeight: '900', marginTop: 5 },
  subtitle: { color: '#CBD5E1', fontSize: 12, marginTop: 5 },
  refreshButton: { width: 44, height: 44, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  center: { minHeight: 280, alignItems: 'center', justifyContent: 'center', gap: 12 },
  muted: { color: '#64748B' },
  emptyCard: { margin: 20, minHeight: 250, borderRadius: 26, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E7E5E4', alignItems: 'center', justifyContent: 'center', padding: 28 },
  emptyTitle: { marginTop: 14, color: '#0F172A', fontSize: 19, fontWeight: '900' },
  emptyText: { marginTop: 7, color: '#64748B', textAlign: 'center' },
  errorCard: { margin: 20, borderRadius: 24, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2', padding: 24, alignItems: 'center' },
  errorTitle: { color: '#991B1B', fontSize: 18, fontWeight: '900', marginTop: 10 },
  errorText: { color: '#B91C1C', textAlign: 'center', marginTop: 7 },
  jobCard: { marginHorizontal: 18, marginTop: 16, borderRadius: 26, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E7E5E4', padding: 18 },
  jobHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  orderCode: { color: '#0F766E', fontSize: 10, fontWeight: '900' },
  jobTitle: { color: '#0F172A', fontSize: 19, fontWeight: '900', marginTop: 5 },
  storeMeta: { color: '#64748B', fontSize: 11, marginTop: 4 },
  riderBadge: { maxWidth: 150, borderRadius: 999, backgroundColor: '#F0FDFA', paddingHorizontal: 10, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 6 },
  riderName: { color: '#0F766E', fontSize: 10, fontWeight: '900', flexShrink: 1 },
  readinessCard: { marginTop: 14, borderRadius: 17, borderWidth: 1, padding: 13, flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  readinessReady: { borderColor: '#BBF7D0', backgroundColor: '#F0FDF4' },
  readinessWaiting: { borderColor: '#FDE68A', backgroundColor: '#FFFBEB' },
  readinessProblem: { borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
  readinessTitle: { color: '#0F172A', fontSize: 13, fontWeight: '900' },
  readinessCopy: { marginTop: 3, color: '#64748B', fontSize: 10, fontWeight: '700' },
  problemNote: { marginTop: 4, color: '#B91C1C', fontSize: 10, fontWeight: '700' },
  itemsBox: { marginTop: 14, borderRadius: 16, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', padding: 13 },
  itemsHeading: { color: '#0F766E', fontSize: 10, fontWeight: '900', marginBottom: 8 },
  itemLine: { color: '#334155', fontSize: 12, fontWeight: '700', marginTop: 4 },
  parcelRow: { marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  fieldLabel: { color: '#475569', fontSize: 10, fontWeight: '900' },
  fieldHelp: { color: '#94A3B8', fontSize: 9, marginTop: 3 },
  parcelInput: { width: 76, height: 48, borderRadius: 14, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', color: '#0F172A', textAlign: 'center', fontWeight: '900' },
  pinCard: { marginTop: 14, borderRadius: 17, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  pinLabel: { color: '#B45309', fontSize: 9, fontWeight: '900' },
  pinCode: { marginTop: 5, color: '#0F172A', fontSize: 28, letterSpacing: 4, fontWeight: '900' },
  pinMeta: { marginTop: 5, color: '#92400E', fontSize: 10, fontWeight: '700' },
  primaryButton: { minHeight: 50, borderRadius: 15, backgroundColor: '#0F766E', marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  confirmButton: { minHeight: 50, borderRadius: 15, backgroundColor: '#0F172A', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  disabled: { opacity: 0.42 },
  divider: { marginVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 9 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
  dividerText: { color: '#94A3B8', fontSize: 9, fontWeight: '900' },
});
