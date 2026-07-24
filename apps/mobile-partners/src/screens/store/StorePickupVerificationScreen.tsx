import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  KeyRound,
  MapPin,
  PackageCheck,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Truck,
  User,
} from 'lucide-react-native';
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
import { deliveryOperationsService } from '../../api/deliveryOperationsService';
import { operationCompleted } from '../../domain/deliveryOperations';

const QUEUE_KEY = ['store', 'delivery-operations'] as const;

function errorMessage(error: any) {
  const message = error?.response?.data?.message;
  if (Array.isArray(message)) return message.join(', ');
  return message || error?.message || 'The operation could not be completed.';
}

function shortId(value?: string | null) {
  return value ? value.slice(-8).toUpperCase() : 'UNKNOWN';
}

function minutesUntil(dateIso: string) {
  const ms = new Date(dateIso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 60_000));
}

export const StorePickupVerificationScreen = () => {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [parcelCounts, setParcelCounts] = useState<Record<string, string>>({});
  const [issuedChallenges, setIssuedChallenges] = useState<Record<string, {
    code: string;
    method: string;
    expiresAt: string;
  }>>({});

  const queueQuery = useQuery({
    queryKey: QUEUE_KEY,
    queryFn: deliveryOperationsService.getQueue,
    refetchInterval: 15_000,
  });

  const jobs = (queueQuery.data || []).filter(
    (job: any) => job.status === 'RIDER_AT_STORE',
  );

  const perform = async (
    key: string,
    task: () => Promise<any>,
    successTitle: string,
    successMessage: string,
  ) => {
    if (busy) return;
    setBusy(key);
    try {
      const result = await task();
      await queryClient.invalidateQueries({ queryKey: QUEUE_KEY });
      Alert.alert(successTitle, successMessage);
      return result;
    } catch (error: any) {
      Alert.alert('Operation failed', errorMessage(error));
      return null;
    } finally {
      setBusy(null);
    }
  };

  const getParcelCount = (jobId: string) => {
    const raw = parcelCounts[jobId];
    const num = raw ? parseInt(raw, 10) : 1;
    return Number.isFinite(num) && num >= 1 ? num : 1;
  };

  const issueChallenge = async (job: any, method: 'STORE_PICKUP_PIN' | 'QR_CODE') => {
    const parcelCount = getParcelCount(job.id);
    const label = method === 'STORE_PICKUP_PIN' ? 'PIN' : 'QR code';
    const result = await perform(
      `challenge:${method}:${job.id}`,
      () => deliveryOperationsService.issuePickupChallenge(job.id, { method, parcelCount }),
      `${label} issued`,
      `Share the ${label} with the rider to verify parcel pickup.`,
    );
    if (result) {
      setIssuedChallenges((current) => ({
        ...current,
        [job.id]: {
          code: result.code,
          method: result.method,
          expiresAt: result.expiresAt,
        },
      }));
    }
  };

  const confirmHandoff = (job: any) => {
    const parcelCount = getParcelCount(job.id);
    Alert.alert(
      'Confirm physical handoff?',
      `You are confirming that ${parcelCount} parcel(s) have been handed to the rider.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm handoff',
          onPress: () => void perform(
            `confirm:${job.id}`,
            () => deliveryOperationsService.confirmStoreHandoff(job.id, { parcelCount }),
            'Pickup confirmed',
            'The rider can now start the customer delivery.',
          ),
        },
      ],
    );
  };

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={queueQuery.isRefetching} onRefresh={() => void queueQuery.refetch()} />}
    >
      <View style={styles.hero}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>PICKUP VERIFICATION</Text>
          <Text style={styles.title}>Rider Pickup</Text>
          <Text style={styles.subtitle}>Verify parcel handoff when a rider arrives at your store</Text>
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={() => void queueQuery.refetch()}>
          <RefreshCw size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {queueQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0F766E" />
          <Text style={styles.muted}>Loading pickup queue…</Text>
        </View>
      ) : queueQuery.error ? (
        <View style={styles.errorCard}>
          <ShieldCheck size={36} color="#B91C1C" />
          <Text style={styles.errorTitle}>Queue unavailable</Text>
          <Text style={styles.errorText}>{errorMessage(queueQuery.error)}</Text>
        </View>
      ) : jobs.length === 0 ? (
        <View style={styles.emptyCard}>
          <PackageCheck size={48} color="#94A3B8" />
          <Text style={styles.emptyTitle}>No riders waiting</Text>
          <Text style={styles.emptyText}>When a rider arrives at your store and marks "I arrived", the job will appear here for pickup verification.</Text>
        </View>
      ) : (
        jobs.map((job: any) => {
          const order = job.order || {};
          const rider = job.currentRider?.user || {};
          const pickupDone = operationCompleted(job as any, 'PICKUP_VERIFIED');
          const challenge = issuedChallenges[job.id];

          return (
            <View key={job.id} style={styles.jobCard}>
              <View style={styles.jobHeader}>
                <View style={styles.jobHeaderLeft}>
                  <Text style={styles.orderEyebrow}>ORDER #{shortId(order.id)}</Text>
                  <Text style={styles.jobTitle}>Rider at store</Text>
                </View>
                <View style={styles.riderBadge}>
                  <User size={14} color="#0F766E" />
                  <Text style={styles.riderName}>{rider.name || 'Rider'}</Text>
                </View>
              </View>

              <View style={styles.infoRow}>
                <Truck size={15} color="#64748B" />
                <Text style={styles.infoText}>Rider is waiting for you to verify the parcel handoff</Text>
              </View>

              {order.items?.length ? (
                <View style={styles.itemsBox}>
                  <Text style={styles.itemsHeading}>ITEMS ({order.items.length})</Text>
                  {order.items.map((item: any) => (
                    <Text key={item.id} style={styles.itemLine}>
                      {item.product?.name || 'Item'} × {item.quantity}
                    </Text>
                  ))}
                </View>
              ) : null}

              {pickupDone ? (
                <View style={styles.completedBanner}>
                  <CheckCircle2 size={18} color="#15803D" />
                  <Text style={styles.completedText}>Pickup already verified</Text>
                </View>
              ) : (
                <>
                  <View style={styles.parcelSection}>
                    <Text style={styles.parcelLabel}>PARCEL COUNT</Text>
                    <TextInput
                      value={parcelCounts[job.id] || ''}
                      onChangeText={(value) => {
                        const clean = value.replace(/\D/g, '');
                        setParcelCounts((current) => ({ ...current, [job.id]: clean }));
                      }}
                      keyboardType="number-pad"
                      placeholder="1"
                      style={styles.parcelInput}
                      placeholderTextColor="#94A3B8"
                    />
                  </View>

                  {challenge ? (
                    <View style={styles.challengeBox}>
                      <KeyRound size={20} color="#B45309" />
                      <View style={styles.challengeContent}>
                        <Text style={styles.challengeLabel}>
                          {challenge.method === 'STORE_PICKUP_PIN' ? 'PICKUP PIN' : 'QR CODE'}
                        </Text>
                        <Text style={styles.challengeCode}>{challenge.code}</Text>
                        <Text style={styles.challengeExpiry}>
                          Expires in {minutesUntil(challenge.expiresAt)} min — share with rider
                        </Text>
                      </View>
                    </View>
                  ) : null}

                  <View style={styles.actionsSection}>
                    <Text style={styles.actionsHeading}>VERIFY PICKUP</Text>

                    <TouchableOpacity
                      style={[styles.pinButton, busy && styles.disabled]}
                      disabled={Boolean(busy)}
                      onPress={() => void issueChallenge(job, 'STORE_PICKUP_PIN')}
                    >
                      {busy === `challenge:STORE_PICKUP_PIN:${job.id}` ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <KeyRound size={18} color="#FFFFFF" />
                      )}
                      <Text style={styles.buttonText}>Issue PIN to rider</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.qrButton, busy && styles.disabled]}
                      disabled={Boolean(busy)}
                      onPress={() => void issueChallenge(job, 'QR_CODE')}
                    >
                      {busy === `challenge:QR_CODE:${job.id}` ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <QrCode size={18} color="#FFFFFF" />
                      )}
                      <Text style={styles.buttonText}>Issue QR code</Text>
                    </TouchableOpacity>

                    <View style={styles.divider}>
                      <View style={styles.dividerLine} />
                      <Text style={styles.dividerText}>OR</Text>
                      <View style={styles.dividerLine} />
                    </View>

                    <TouchableOpacity
                      style={[styles.confirmButton, busy && styles.disabled]}
                      disabled={Boolean(busy)}
                      onPress={() => confirmHandoff(job)}
                    >
                      {busy === `confirm:${job.id}` ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <CheckCircle2 size={18} color="#FFFFFF" />
                      )}
                      <Text style={styles.buttonText}>Confirm physical handoff</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              <View style={styles.auditSection}>
                <Text style={styles.auditHeading}>OPERATION AUDIT</Text>
                {(job.operations || []).slice(0, 5).map((op: any) => (
                  <View key={op.id} style={styles.auditRow}>
                    <Text style={styles.auditType}>{String(op.type || '').replaceAll('_', ' ')}</Text>
                    <Text style={styles.auditMeta}>{op.actorRole || 'SYSTEM'} · {new Date(op.createdAt).toLocaleString()}</Text>
                  </View>
                ))}
              </View>
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
  hero: {
    backgroundColor: '#0F172A',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 24,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    flexDirection: 'row',
    alignItems: 'center',
  },
  eyebrow: { color: '#5EEAD4', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: '#FFFFFF', fontSize: 28, fontWeight: '900', marginTop: 5 },
  subtitle: { color: '#CBD5E1', fontSize: 12, lineHeight: 18, marginTop: 5, maxWidth: 280 },
  refreshButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { minHeight: 280, alignItems: 'center', justifyContent: 'center', gap: 12 },
  muted: { color: '#64748B' },
  emptyCard: {
    margin: 20,
    minHeight: 250,
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7E5E4',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  emptyTitle: { marginTop: 14, color: '#0F172A', fontSize: 19, fontWeight: '900' },
  emptyText: { marginTop: 7, color: '#64748B', textAlign: 'center', lineHeight: 20 },
  errorCard: {
    margin: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    padding: 24,
    alignItems: 'center',
  },
  errorTitle: { color: '#991B1B', fontSize: 18, fontWeight: '900', marginTop: 10 },
  errorText: { color: '#B91C1C', textAlign: 'center', marginTop: 7 },
  jobCard: {
    marginHorizontal: 18,
    marginTop: 16,
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7E5E4',
    padding: 18,
  },
  jobHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  jobHeaderLeft: { flex: 1 },
  orderEyebrow: { color: '#0F766E', fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  jobTitle: { color: '#0F172A', fontSize: 20, fontWeight: '900', marginTop: 4 },
  riderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F0FDFA',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  riderName: { color: '#0F766E', fontSize: 12, fontWeight: '900' },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    backgroundColor: '#FFFBEB',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  infoText: { flex: 1, color: '#92400E', fontSize: 12, fontWeight: '800', lineHeight: 18 },
  itemsBox: {
    marginTop: 14,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
  },
  itemsHeading: { color: '#475569', fontSize: 10, fontWeight: '900', letterSpacing: 1, marginBottom: 8 },
  itemLine: { color: '#334155', fontSize: 13, fontWeight: '800', paddingVertical: 3 },
  parcelSection: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  parcelLabel: { color: '#475569', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  parcelInput: {
    width: 72,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    textAlign: 'center',
    fontWeight: '900',
    fontSize: 16,
    color: '#0F172A',
  },
  challengeBox: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFBEB',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: 14,
  },
  challengeContent: { flex: 1 },
  challengeLabel: { color: '#B45309', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  challengeCode: {
    color: '#0F172A',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 6,
    marginTop: 4,
    fontFamily: 'monospace',
  },
  challengeExpiry: { color: '#92400E', fontSize: 11, fontWeight: '800', marginTop: 4 },
  actionsSection: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 16,
  },
  actionsHeading: { color: '#475569', fontSize: 10, fontWeight: '900', letterSpacing: 1, marginBottom: 12 },
  pinButton: {
    minHeight: 49,
    borderRadius: 15,
    backgroundColor: '#0F766E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  qrButton: {
    minHeight: 49,
    borderRadius: 15,
    backgroundColor: '#1E40AF',
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  confirmButton: {
    minHeight: 49,
    borderRadius: 15,
    backgroundColor: '#15803D',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: { color: '#FFFFFF', fontWeight: '900', fontSize: 13 },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 14,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
  dividerText: { color: '#94A3B8', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  completedBanner: {
    marginTop: 13,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    backgroundColor: '#F0FDF4',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  completedText: { color: '#166534', fontSize: 12, fontWeight: '900' },
  auditSection: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 14,
  },
  auditHeading: { color: '#475569', fontSize: 10, fontWeight: '900', letterSpacing: 1, marginBottom: 8 },
  auditRow: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  auditType: { color: '#334155', fontSize: 11, fontWeight: '900' },
  auditMeta: { color: '#94A3B8', fontSize: 9, marginTop: 2 },
  disabled: { opacity: 0.5 },
});
