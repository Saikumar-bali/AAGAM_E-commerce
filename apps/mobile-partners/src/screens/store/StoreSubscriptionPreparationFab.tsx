import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Box, CalendarClock, CheckCircle2, MapPin, Phone, RefreshCw, Route, X } from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { apiClient } from '../../api/client';

const PREPARATION_KEY = ['store', 'subscription-preparation'] as const;

type PreparationRow = {
  id: string;
  serviceDate: string;
  deliveryStatus: string;
  generatedAt?: string | null;
  plan: { name: string; orderGenerationHoursBefore: number };
  customer: { name?: string | null; deliveryPhone?: string | null };
  address: { recipientName?: string | null; phone?: string | null; formattedAddress?: string | null };
  items: Array<{ productId: string; name: string; quantity: number }>;
  run?: { routeCode: string; status: string; rider?: { user?: { name?: string | null } | null } | null } | null;
  readiness: { status: 'PENDING' | 'READY' | 'SHORTAGE'; note?: string | null };
  inventoryReservation: 'FORECAST_ONLY' | 'RESERVED_BY_ORDER';
  packingAvailableNow: boolean;
};

function errorMessage(error: unknown) {
  const candidate = error as { response?: { data?: { message?: string | string[] } }; message?: string };
  const value = candidate?.response?.data?.message;
  return Array.isArray(value) ? value.join(', ') : value || candidate?.message || 'The operation could not be completed.';
}

function label(value: string) {
  return String(value || '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dateLabel(value: string) {
  return new Date(value).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

function idempotencyKey(row: PreparationRow, decision: string) {
  return `partners-store-preparation:${row.id}:${decision}:${Date.now()}`;
}

export function StoreSubscriptionPreparationFab() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const query = useQuery({
    queryKey: PREPARATION_KEY,
    queryFn: async (): Promise<PreparationRow[]> => {
      const response = await apiClient.get('/store/subscription-preparation', { params: { days: 3 } });
      return Array.isArray(response.data) ? response.data : [];
    },
    refetchInterval: 30_000,
    retry: 1,
  });

  const rows = query.data || [];
  const pending = useMemo(() => rows.filter((row) => row.readiness.status === 'PENDING').length, [rows]);
  const shortages = useMemo(() => rows.filter((row) => row.readiness.status === 'SHORTAGE').length, [rows]);

  const mutation = useMutation({
    mutationFn: async ({ row, decision }: { row: PreparationRow; decision: 'READY' | 'SHORTAGE' }) => {
      const note = notes[row.id]?.trim();
      if (decision === 'SHORTAGE' && (!note || note.length < 5)) throw new Error('Describe the shortage so Admin can resolve it.');
      const response = await apiClient.post(
        `/store/subscription-preparation/deliveries/${encodeURIComponent(row.id)}/readiness`,
        { decision, note: decision === 'SHORTAGE' ? note : undefined },
        { headers: { 'Idempotency-Key': idempotencyKey(row, decision) } },
      );
      return { response: response.data, decision };
    },
    onSuccess: async ({ decision }) => {
      await queryClient.invalidateQueries({ queryKey: PREPARATION_KEY });
      Toast.show({
        type: decision === 'READY' ? 'success' : 'info',
        text1: decision === 'READY' ? 'Stock readiness confirmed' : 'Shortage reported',
        text2: decision === 'READY'
          ? 'This acknowledgement did not deduct inventory. The real order reserves stock later.'
          : 'Admin has been alerted for intervention.',
      });
    },
    onError: (error) => Toast.show({ type: 'error', text1: 'Preparation update failed', text2: errorMessage(error) }),
  });

  return (
    <>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Open tomorrow subscription preparation"
        onPress={() => setOpen(true)}
        style={styles.fab}
      >
        <CalendarClock size={17} color="#FFFFFF" />
        <Text style={styles.fabText}>Tomorrow</Text>
        {shortages > 0 ? <View style={[styles.badge, styles.badgeDanger]}><Text style={styles.badgeText}>{shortages}</Text></View>
          : pending > 0 ? <View style={styles.badge}><Text style={styles.badgeTextDark}>{pending}</Text></View>
            : <CheckCircle2 size={15} color="#B7F7D7" />}
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setOpen(false)}>
        <View style={styles.screen}>
          <View style={styles.header}>
            <View style={styles.headerCopy}><Text style={styles.eyebrow}>D-1 STOCK READINESS</Text><Text style={styles.title}>Tomorrow preparation</Text><Text style={styles.subtitle}>Confirm stock before delivery day. Forecast confirmation never deducts inventory.</Text></View>
            <TouchableOpacity accessibilityLabel="Close preparation" onPress={() => setOpen(false)} style={styles.closeButton}><X size={22} color="#FFFFFF" /></TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.content}
            refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor="#087B5A" />}
          >
            {query.isLoading ? <View style={styles.state}><ActivityIndicator size="large" color="#087B5A" /><Text style={styles.stateText}>Loading upcoming subscription work…</Text></View>
              : query.error ? <View style={styles.state}><AlertTriangle size={38} color="#B42318" /><Text style={styles.stateTitle}>Preparation unavailable</Text><Text style={styles.stateText}>{errorMessage(query.error)}</Text><TouchableOpacity style={styles.retry} onPress={() => void query.refetch()}><RefreshCw size={18} color="#FFFFFF" /><Text style={styles.retryText}>Retry</Text></TouchableOpacity></View>
                : rows.length === 0 ? <View style={styles.state}><CheckCircle2 size={42} color="#087B5A" /><Text style={styles.stateTitle}>No upcoming preparation</Text><Text style={styles.stateText}>New subscription demand appears here immediately, before real order reservation.</Text></View>
                  : rows.map((row) => (
                    <View key={row.id} style={[styles.card, row.readiness.status === 'SHORTAGE' && styles.cardDanger]}>
                      <View style={styles.cardTop}><View style={{ flex: 1 }}><Text style={styles.date}>{dateLabel(row.serviceDate)}</Text><Text style={styles.plan}>{row.plan.name}</Text><Text style={styles.meta}>{label(row.deliveryStatus)} · {row.inventoryReservation === 'RESERVED_BY_ORDER' ? 'Inventory reserved' : 'Forecast only'}</Text></View><View style={[styles.status, row.readiness.status === 'READY' ? styles.statusReady : row.readiness.status === 'SHORTAGE' ? styles.statusDanger : styles.statusPending]}><Text style={styles.statusText}>{label(row.readiness.status)}</Text></View></View>

                      <View style={styles.infoBlock}><View style={styles.infoTitle}><Box size={15} color="#5D6570" /><Text style={styles.infoLabel}>REQUIRED ITEMS</Text></View><View style={styles.chips}>{row.items.map((item) => <View key={item.productId} style={styles.chip}><Text style={styles.chipText}>{item.quantity}× {item.name}</Text></View>)}</View></View>

                      <View style={styles.twoCol}><View style={styles.smallCard}><View style={styles.infoTitle}><Phone size={14} color="#5D6570" /><Text style={styles.infoLabel}>RECIPIENT</Text></View><Text style={styles.smallStrong}>{row.address.recipientName || row.customer.name || 'Customer'}</Text><Text style={styles.smallText}>{row.customer.deliveryPhone || row.address.phone || 'Phone unavailable'}</Text></View><View style={styles.smallCard}><View style={styles.infoTitle}><MapPin size={14} color="#5D6570" /><Text style={styles.infoLabel}>DELIVERY</Text></View><Text style={styles.smallText}>{row.address.formattedAddress || 'Address unavailable'}</Text></View></View>

                      <View style={styles.routeBox}><Route size={18} color="#69D6A6" /><View style={{ flex: 1 }}><Text style={styles.routeLabel}>ROUTE / RIDER</Text><Text style={styles.routeText}>{row.run?.routeCode || (row.generatedAt ? 'Route planning pending' : 'Order generation pending')}</Text><Text style={styles.routeSub}>{row.run?.rider?.user?.name ? `Final rider: ${row.run.rider.user.name}` : 'Rider is finalized close to the slot after live eligibility checks.'}</Text></View></View>

                      {row.readiness.status === 'SHORTAGE' ? <View style={styles.shortage}><AlertTriangle size={16} color="#B42318" /><Text style={styles.shortageText}>{row.readiness.note || 'Shortage reported'}</Text></View> : null}

                      <TextInput
                        value={notes[row.id] || ''}
                        onChangeText={(value) => setNotes((current) => ({ ...current, [row.id]: value }))}
                        placeholder="Shortage note only if stock is unavailable"
                        multiline
                        style={styles.input}
                      />
                      <View style={styles.actions}><TouchableOpacity disabled={mutation.isPending} style={styles.readyButton} onPress={() => mutation.mutate({ row, decision: 'READY' })}><CheckCircle2 size={17} color="#FFFFFF" /><Text style={styles.actionText}>Stock ready</Text></TouchableOpacity><TouchableOpacity disabled={mutation.isPending} style={styles.shortageButton} onPress={() => mutation.mutate({ row, decision: 'SHORTAGE' })}><AlertTriangle size={17} color="#B42318" /><Text style={styles.shortageActionText}>Shortage</Text></TouchableOpacity></View>
                      <Text style={styles.footnote}>{row.packingAvailableNow ? 'Delivery day is active: use Morning Runs for packing and custody handoff.' : 'Packing/handoff remains a delivery-day custody action.'}</Text>
                    </View>
                  ))}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: { position: 'absolute', top: 54, right: 12, zIndex: 50, elevation: 18, minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#056B49', paddingHorizontal: 12, borderRadius: 18, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  fabText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  badge: { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FDE68A', paddingHorizontal: 5 },
  badgeDanger: { backgroundColor: '#E1262F' },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  badgeTextDark: { color: '#1F2937', fontSize: 10, fontWeight: '900' },
  screen: { flex: 1, backgroundColor: '#F4F7F5' },
  header: { backgroundColor: '#055A42', paddingTop: 52, paddingHorizontal: 20, paddingBottom: 20, flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  headerCopy: { flex: 1 }, eyebrow: { color: '#A7F3D0', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 }, title: { color: '#FFFFFF', fontSize: 25, fontWeight: '900', marginTop: 5 }, subtitle: { color: '#D1FAE5', fontSize: 12, fontWeight: '600', lineHeight: 18, marginTop: 6 },
  closeButton: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  content: { padding: 16, paddingBottom: 40, gap: 14 }, state: { minHeight: 260, borderRadius: 24, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', padding: 24 }, stateTitle: { marginTop: 10, color: '#14221D', fontSize: 17, fontWeight: '900' }, stateText: { marginTop: 7, color: '#69746F', textAlign: 'center', lineHeight: 19, fontWeight: '600' }, retry: { marginTop: 14, minHeight: 44, paddingHorizontal: 18, borderRadius: 14, backgroundColor: '#087B5A', flexDirection: 'row', alignItems: 'center', gap: 8 }, retryText: { color: '#FFFFFF', fontWeight: '900' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 24, borderWidth: 1, borderColor: '#DFE7E2', padding: 16, shadowColor: '#163A2D', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 }, cardDanger: { borderColor: '#FCA5A5' }, cardTop: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' }, date: { color: '#087B5A', fontSize: 10, fontWeight: '900', letterSpacing: 0.7 }, plan: { color: '#17221E', fontSize: 18, fontWeight: '900', marginTop: 4 }, meta: { color: '#75807B', fontSize: 11, fontWeight: '700', marginTop: 4 },
  status: { borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6 }, statusReady: { backgroundColor: '#D9F8E8' }, statusPending: { backgroundColor: '#FEF3C7' }, statusDanger: { backgroundColor: '#FEE2E2' }, statusText: { color: '#34423C', fontSize: 9, fontWeight: '900' },
  infoBlock: { marginTop: 13, backgroundColor: '#F7F9F8', borderRadius: 16, padding: 12 }, infoTitle: { flexDirection: 'row', gap: 6, alignItems: 'center' }, infoLabel: { color: '#6B7671', fontSize: 9, fontWeight: '900', letterSpacing: 0.7 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 9 }, chip: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E7E4', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6 }, chipText: { color: '#27342F', fontSize: 11, fontWeight: '800' },
  twoCol: { flexDirection: 'row', gap: 9, marginTop: 9 }, smallCard: { flex: 1, borderWidth: 1, borderColor: '#E2E7E4', borderRadius: 16, padding: 11 }, smallStrong: { color: '#27342F', fontSize: 12, fontWeight: '900', marginTop: 7 }, smallText: { color: '#65716C', fontSize: 11, fontWeight: '700', lineHeight: 16, marginTop: 4 },
  routeBox: { marginTop: 9, borderRadius: 16, backgroundColor: '#122B22', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }, routeLabel: { color: '#91A79E', fontSize: 8, fontWeight: '900', letterSpacing: 0.7 }, routeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900', marginTop: 3 }, routeSub: { color: '#B9C8C2', fontSize: 10, fontWeight: '600', marginTop: 3, lineHeight: 15 },
  shortage: { marginTop: 9, borderRadius: 14, backgroundColor: '#FFF1F2', padding: 10, flexDirection: 'row', gap: 8, alignItems: 'flex-start' }, shortageText: { flex: 1, color: '#B42318', fontSize: 11, fontWeight: '800', lineHeight: 16 }, input: { minHeight: 70, marginTop: 10, borderWidth: 1, borderColor: '#D9E2DD', backgroundColor: '#FFFFFF', borderRadius: 14, paddingHorizontal: 11, paddingVertical: 9, textAlignVertical: 'top', color: '#26342E', fontSize: 12, fontWeight: '600' }, actions: { flexDirection: 'row', gap: 9, marginTop: 10 }, readyButton: { flex: 1, minHeight: 44, borderRadius: 14, backgroundColor: '#087B5A', flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' }, shortageButton: { flex: 1, minHeight: 44, borderRadius: 14, backgroundColor: '#FFF1F2', flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' }, actionText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' }, shortageActionText: { color: '#B42318', fontSize: 12, fontWeight: '900' }, footnote: { marginTop: 9, color: '#7A8580', fontSize: 10, fontWeight: '600', lineHeight: 15 },
});
