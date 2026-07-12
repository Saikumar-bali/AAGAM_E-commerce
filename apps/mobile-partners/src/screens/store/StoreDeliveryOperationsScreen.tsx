import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Banknote,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  RefreshCw,
  RotateCcw,
  Store,
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
import { buildInspectionLines, operationCompleted } from '../../domain/deliveryOperations';

type QuantityState = Record<string, Record<string, {
  sellable: string;
  damaged: string;
  missing: string;
}>>;

const QUEUE_KEY = ['store', 'delivery-operations'] as const;

function errorMessage(error: any) {
  const message = error?.response?.data?.message;
  if (Array.isArray(message)) return message.join(', ');
  return message || error?.message || 'The operation could not be completed.';
}

function label(value?: string | null) {
  return String(value || 'UNKNOWN').replaceAll('_', ' ');
}

function shortId(value?: string | null) {
  return value ? value.slice(-8).toUpperCase() : 'UNKNOWN';
}

export const StoreDeliveryOperationsScreen = () => {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<QuantityState>({});
  const [inspectionNotes, setInspectionNotes] = useState<Record<string, string>>({});
  const [settlementRefs, setSettlementRefs] = useState<Record<string, string>>({});

  const queueQuery = useQuery({
    queryKey: QUEUE_KEY,
    queryFn: deliveryOperationsService.getQueue,
    refetchInterval: 15_000,
  });
  const jobs = queueQuery.data || [];

  const perform = async (
    key: string,
    task: () => Promise<any>,
    successTitle: string,
    successMessage: string,
  ) => {
    if (busy) return;
    setBusy(key);
    try {
      await task();
      await queryClient.invalidateQueries({ queryKey: QUEUE_KEY });
      Alert.alert(successTitle, successMessage);
    } catch (error: any) {
      Alert.alert('Operation failed', errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const changeQuantity = (
    jobId: string,
    itemId: string,
    field: 'sellable' | 'damaged' | 'missing',
    value: string,
  ) => {
    const numeric = value.replace(/\D/g, '');
    setQuantities((current) => ({
      ...current,
      [jobId]: {
        ...(current[jobId] || {}),
        [itemId]: {
          sellable: current[jobId]?.[itemId]?.sellable || '',
          damaged: current[jobId]?.[itemId]?.damaged || '',
          missing: current[jobId]?.[itemId]?.missing || '',
          [field]: numeric,
        },
      },
    }));
  };

  const submitInspection = (job: any) => {
    try {
      const items = (job.order?.items || []).map((item: any) => ({
        id: item.id,
        quantity: Number(item.quantity || 0),
      }));
      const lines = buildInspectionLines(items, quantities[job.id] || {});
      Alert.alert(
        'Complete return inspection?',
        'Only quantities explicitly marked SELLABLE will return to available inventory.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Complete inspection',
            onPress: () => void perform(
              `inspect:${job.id}`,
              () => deliveryOperationsService.inspectReturn(job.id, {
                lines,
                note: inspectionNotes[job.id]?.trim() || undefined,
              }),
              'Inspection completed',
              'Sellable units were restored and every stock change was added to the inventory ledger.',
            ),
          },
        ],
      );
    } catch (error: any) {
      Alert.alert('Check inspection quantities', error.message);
    }
  };

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={queueQuery.isRefetching} onRefresh={() => void queueQuery.refetch()} />}
    >
      <View style={styles.hero}>
        <View>
          <Text style={styles.eyebrow}>STORE OPERATIONS</Text>
          <Text style={styles.title}>Returns & COD</Text>
          <Text style={styles.subtitle}>Confirm physical returns, inspect stock, and settle rider cash</Text>
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={() => void queueQuery.refetch()}>
          <RefreshCw size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {queueQuery.isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#0F766E" /><Text style={styles.muted}>Loading operations queue…</Text></View>
      ) : queueQuery.error ? (
        <View style={styles.errorCard}>
          <AlertTriangle size={36} color="#B91C1C" />
          <Text style={styles.errorTitle}>Queue unavailable</Text>
          <Text style={styles.errorText}>{errorMessage(queueQuery.error)}</Text>
        </View>
      ) : jobs.length === 0 ? (
        <View style={styles.emptyCard}>
          <CheckCircle2 size={48} color="#94A3B8" />
          <Text style={styles.emptyTitle}>No exception work</Text>
          <Text style={styles.emptyText}>Returned parcels and unsettled COD collections will appear here.</Text>
        </View>
      ) : (
        jobs.map((job: any) => {
          const order = job.order || {};
          const payment = order.payment || {};
          const inspectionDone = operationCompleted(job as any, 'RETURN_INSPECTION_COMPLETED');
          const codCollected = operationCompleted(job as any, 'COD_COLLECTED');
          const codSettled = operationCompleted(job as any, 'COD_SETTLED');
          const canConfirmReturn = job.status === 'RETURNING_TO_STORE';
          const canInspect = job.status === 'RETURNED_TO_STORE' && !inspectionDone;
          const canSettle = payment.method === 'COD' && codCollected && !codSettled;

          return (
            <View key={job.id} style={styles.jobCard}>
              <View style={styles.jobTop}>
                <View>
                  <Text style={styles.orderId}>ORDER #{shortId(order.id)}</Text>
                  <Text style={styles.status}>{label(job.status)}</Text>
                  <Text style={styles.meta}>{order.store?.name || 'Store'} · {order.customer?.name || 'Customer'}</Text>
                </View>
                <View style={styles.totalBox}>
                  <Text style={styles.totalLabel}>{payment.method || 'ORDER'}</Text>
                  <Text style={styles.total}>₹{Number(order.grandTotal || order.totalAmount || 0).toFixed(2)}</Text>
                </View>
              </View>

              {canConfirmReturn ? (
                <View style={styles.actionSection}>
                  <View style={styles.sectionHeader}>
                    <RotateCcw size={21} color="#B45309" />
                    <View style={styles.sectionCopy}>
                      <Text style={styles.sectionTitle}>Parcel returning to store</Text>
                      <Text style={styles.sectionText}>Confirm only after physically receiving the parcel from the assigned rider.</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[styles.warningButton, busy && styles.disabled]}
                    disabled={Boolean(busy)}
                    onPress={() => Alert.alert('Confirm physical receipt?', 'This releases the rider and opens item inspection.', [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Parcel received',
                        onPress: () => void perform(
                          `return:${job.id}`,
                          () => deliveryOperationsService.confirmReturn(job.id),
                          'Return confirmed',
                          'The rider is released. Inspect every returned item before restoring inventory.',
                        ),
                      },
                    ])}
                  >
                    {busy === `return:${job.id}` ? <ActivityIndicator color="#FFFFFF" /> : <Store size={18} color="#FFFFFF" />}
                    <Text style={styles.buttonText}>Confirm parcel received</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {canInspect ? (
                <View style={styles.actionSection}>
                  <View style={styles.sectionHeader}>
                    <ClipboardCheck size={21} color="#0F766E" />
                    <View style={styles.sectionCopy}>
                      <Text style={styles.sectionTitle}>Returned-item inspection</Text>
                      <Text style={styles.sectionText}>Account for every unit. Only SELLABLE quantity is restored.</Text>
                    </View>
                  </View>
                  {(order.items || []).map((item: any) => {
                    const values = quantities[job.id]?.[item.id] || { sellable: '', damaged: '', missing: '' };
                    return (
                      <View key={item.id} style={styles.itemCard}>
                        <Text style={styles.itemName}>{item.product?.name || 'Item'} × {item.quantity}</Text>
                        <View style={styles.quantityRow}>
                          {([
                            ['sellable', 'Sellable'],
                            ['damaged', 'Damaged'],
                            ['missing', 'Missing'],
                          ] as const).map(([field, text]) => (
                            <View key={field} style={styles.quantityField}>
                              <Text style={styles.quantityLabel}>{text}</Text>
                              <TextInput
                                value={values[field]}
                                onChangeText={(value) => changeQuantity(job.id, item.id, field, value)}
                                keyboardType="number-pad"
                                placeholder="0"
                                style={styles.quantityInput}
                                placeholderTextColor="#94A3B8"
                              />
                            </View>
                          ))}
                        </View>
                      </View>
                    );
                  })}
                  <TextInput
                    value={inspectionNotes[job.id] || ''}
                    onChangeText={(value) => setInspectionNotes((current) => ({ ...current, [job.id]: value }))}
                    placeholder="Inspection note"
                    multiline
                    maxLength={500}
                    style={styles.noteInput}
                    placeholderTextColor="#94A3B8"
                  />
                  <TouchableOpacity
                    style={[styles.primaryButton, busy && styles.disabled]}
                    disabled={Boolean(busy)}
                    onPress={() => submitInspection(job)}
                  >
                    {busy === `inspect:${job.id}` ? <ActivityIndicator color="#FFFFFF" /> : <Boxes size={18} color="#FFFFFF" />}
                    <Text style={styles.buttonText}>Complete inspection</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {inspectionDone ? (
                <View style={styles.completedBanner}>
                  <CheckCircle2 size={18} color="#15803D" />
                  <Text style={styles.completedText}>Return inspection completed</Text>
                </View>
              ) : null}

              {canSettle ? (
                <View style={styles.actionSection}>
                  <View style={styles.sectionHeader}>
                    <Banknote size={21} color="#7C3AED" />
                    <View style={styles.sectionCopy}>
                      <Text style={styles.sectionTitle}>COD settlement</Text>
                      <Text style={styles.sectionText}>Verify the exact rider cash handover and record a traceable reference.</Text>
                    </View>
                  </View>
                  <TextInput
                    value={settlementRefs[job.id] || ''}
                    onChangeText={(value) => setSettlementRefs((current) => ({ ...current, [job.id]: value }))}
                    placeholder="Settlement reference"
                    maxLength={120}
                    style={styles.referenceInput}
                    placeholderTextColor="#94A3B8"
                  />
                  <TouchableOpacity
                    style={[styles.purpleButton, busy && styles.disabled]}
                    disabled={Boolean(busy)}
                    onPress={() => {
                      const reference = settlementRefs[job.id]?.trim();
                      if (!reference || reference.length < 3) {
                        Alert.alert('Settlement reference required', 'Enter at least 3 characters from your cash handover record.');
                        return;
                      }
                      Alert.alert('Record COD settlement?', `Confirm receipt of ₹${(Number(payment.amountPaise || 0) / 100).toFixed(2)}.`, [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Record settlement',
                          onPress: () => void perform(
                            `settle:${job.id}`,
                            () => deliveryOperationsService.settleCod(job.id, {
                              amountPaise: Number(payment.amountPaise || 0),
                              settlementReference: reference,
                            }),
                            'COD settled',
                            'The collection and settlement now have separate audit records.',
                          ),
                        },
                      ]);
                    }}
                  >
                    {busy === `settle:${job.id}` ? <ActivityIndicator color="#FFFFFF" /> : <Banknote size={18} color="#FFFFFF" />}
                    <Text style={styles.buttonText}>Record exact settlement</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {payment.method === 'COD' && !codCollected ? (
                <View style={styles.pendingBanner}>
                  <Banknote size={17} color="#92400E" />
                  <Text style={styles.pendingText}>Waiting for the rider to record exact COD collection.</Text>
                </View>
              ) : null}
              {codSettled ? (
                <View style={styles.completedBanner}>
                  <CheckCircle2 size={18} color="#15803D" />
                  <Text style={styles.completedText}>COD settlement completed</Text>
                </View>
              ) : null}

              <View style={styles.auditSection}>
                <Text style={styles.auditHeading}>Operation audit</Text>
                {(job.operations || []).slice(0, 6).map((operation: any) => (
                  <View key={operation.id} style={styles.auditRow}>
                    <Text style={styles.auditType}>{label(operation.type)}</Text>
                    <Text style={styles.auditMeta}>{operation.actorRole || 'SYSTEM'} · {new Date(operation.createdAt).toLocaleString()}</Text>
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
  hero: { backgroundColor: '#0F172A', paddingTop: 56, paddingHorizontal: 20, paddingBottom: 24, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: '#5EEAD4', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: '#FFFFFF', fontSize: 28, fontWeight: '900', marginTop: 5 },
  subtitle: { color: '#CBD5E1', fontSize: 12, lineHeight: 18, marginTop: 5, maxWidth: 280 },
  refreshButton: { width: 44, height: 44, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  center: { minHeight: 280, alignItems: 'center', justifyContent: 'center', gap: 12 },
  muted: { color: '#64748B' },
  emptyCard: { margin: 20, minHeight: 250, borderRadius: 26, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E7E5E4', alignItems: 'center', justifyContent: 'center', padding: 28 },
  emptyTitle: { marginTop: 14, color: '#0F172A', fontSize: 19, fontWeight: '900' },
  emptyText: { marginTop: 7, color: '#64748B', textAlign: 'center', lineHeight: 20 },
  errorCard: { margin: 20, borderRadius: 24, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2', padding: 24, alignItems: 'center' },
  errorTitle: { color: '#991B1B', fontSize: 18, fontWeight: '900', marginTop: 10 },
  errorText: { color: '#B91C1C', textAlign: 'center', marginTop: 7 },
  jobCard: { marginHorizontal: 18, marginTop: 16, borderRadius: 26, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E7E5E4', padding: 18 },
  jobTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  orderId: { color: '#0F766E', fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  status: { color: '#0F172A', fontSize: 18, fontWeight: '900', marginTop: 5 },
  meta: { color: '#64748B', fontSize: 12, marginTop: 4, maxWidth: 220 },
  totalBox: { alignItems: 'flex-end' },
  totalLabel: { color: '#B45309', fontSize: 10, fontWeight: '900' },
  total: { color: '#0F172A', fontSize: 17, fontWeight: '900', marginTop: 3 },
  actionSection: { marginTop: 16, borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionCopy: { flex: 1 },
  sectionTitle: { color: '#0F172A', fontSize: 15, fontWeight: '900' },
  sectionText: { color: '#64748B', fontSize: 11, lineHeight: 17, marginTop: 3 },
  warningButton: { minHeight: 49, borderRadius: 15, backgroundColor: '#B45309', marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryButton: { minHeight: 49, borderRadius: 15, backgroundColor: '#0F766E', marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  purpleButton: { minHeight: 49, borderRadius: 15, backgroundColor: '#7C3AED', marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonText: { color: '#FFFFFF', fontWeight: '900', fontSize: 13 },
  itemCard: { marginTop: 12, borderRadius: 16, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', padding: 12 },
  itemName: { color: '#334155', fontSize: 13, fontWeight: '900' },
  quantityRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  quantityField: { flex: 1 },
  quantityLabel: { color: '#64748B', fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },
  quantityInput: { height: 42, borderRadius: 11, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', color: '#0F172A', textAlign: 'center', fontWeight: '900', marginTop: 5 },
  noteInput: { minHeight: 70, borderRadius: 14, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC', marginTop: 12, padding: 12, textAlignVertical: 'top', color: '#0F172A' },
  referenceInput: { height: 50, borderRadius: 14, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC', marginTop: 12, paddingHorizontal: 13, color: '#0F172A', fontWeight: '800' },
  completedBanner: { marginTop: 13, borderRadius: 14, borderWidth: 1, borderColor: '#BBF7D0', backgroundColor: '#F0FDF4', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  completedText: { color: '#166534', fontSize: 12, fontWeight: '900' },
  pendingBanner: { marginTop: 13, borderRadius: 14, borderWidth: 1, borderColor: '#FDE68A', backgroundColor: '#FFFBEB', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  pendingText: { flex: 1, color: '#92400E', fontSize: 11, fontWeight: '800' },
  auditSection: { marginTop: 16, borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 14 },
  auditHeading: { color: '#475569', fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  auditRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  auditType: { color: '#334155', fontSize: 11, fontWeight: '900' },
  auditMeta: { color: '#94A3B8', fontSize: 9, marginTop: 2 },
  disabled: { opacity: 0.5 },
});
