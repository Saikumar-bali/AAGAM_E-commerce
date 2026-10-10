import React, { useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ArrowLeft, CheckCircle2, IndianRupee, Navigation, RefreshCw, Search, Sun, Moon, X, XCircle } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { subscriptionOperationsService } from '../../api/subscriptionOperationsService';
import { storeService } from '../../api/storeService';
import { GradientSurface } from '../../components/GradientSurface';
import { palette, radius, spacing } from '../../design/tokens';
import { Button, Field, Sheet, TextField, money } from '../../components/StoreKit';

const STARTABLE = ['SCHEDULED', 'ORDER_GENERATED', 'PREPARING', 'PACKED'];
type StatusGroup = 'all' | 'pending' | 'delivering' | 'delivered' | 'failed';
const GROUPS: { key: StatusGroup; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'delivering', label: 'Out for delivery' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'failed', label: 'Failed' },
];

const STATUS_META: Record<string, { label: string; bg: string; fg: string; group: StatusGroup }> = {
  SCHEDULED: { label: 'Scheduled', bg: palette.slate100, fg: palette.slate600, group: 'pending' },
  ORDER_GENERATED: { label: 'Order ready', bg: palette.slate100, fg: palette.slate600, group: 'pending' },
  PREPARING: { label: 'Preparing', bg: palette.blue100, fg: palette.blue700, group: 'pending' },
  PACKED: { label: 'Packed', bg: palette.blue100, fg: palette.blue700, group: 'pending' },
  STORE_DELIVERING: { label: 'Out for delivery', bg: palette.amber100, fg: palette.amber700, group: 'delivering' },
  DELIVERED: { label: 'Delivered', bg: palette.green100, fg: palette.green700, group: 'delivered' },
  FAILED: { label: 'Failed', bg: palette.rose100, fg: palette.rose700, group: 'failed' },
};
function meta(status?: string) {
  return STATUS_META[String(status || '').toUpperCase()] || { label: String(status || '—').replaceAll('_', ' '), bg: palette.slate100, fg: palette.slate600, group: 'pending' as StatusGroup };
}

export const StoreDeliveriesScreen = ({ navigation }: { navigation: any }) => {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const storesQuery = useQuery({ queryKey: ['my-stores'], queryFn: storeService.getMyStores, retry: 1 });
  const stores = Array.isArray(storesQuery.data) ? storesQuery.data : [];
  const [storeId, setStoreId] = useState<string | undefined>(undefined);
  const activeStoreId = storeId || stores[0]?.id;

  const [group, setGroup] = useState<StatusGroup>('all');
  const [slotFilter, setSlotFilter] = useState<'ALL' | 'AM' | 'PM'>('ALL');
  const [search, setSearch] = useState('');
  const [verify, setVerify] = useState<any | null>(null);
  const [fail, setFail] = useState<any | null>(null);
  const [edit, setEdit] = useState<any | null>(null);

  const [vName, setVName] = useState('');
  const [vPhone, setVPhone] = useState('');
  const [vCash, setVCash] = useState('');
  const [vNotes, setVNotes] = useState('');
  const [failReason, setFailReason] = useState('');
  const [editStatus, setEditStatus] = useState('DELIVERED');
  const [editCash, setEditCash] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const queue = useQuery({
    queryKey: ['store-self-delivery', activeStoreId],
    queryFn: () => subscriptionOperationsService.getSelfDeliveryQueue(activeStoreId as string),
    enabled: !!activeStoreId,
    retry: 1,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['store-self-delivery', activeStoreId] });

  const start = useMutation({
    mutationFn: (id: string) => subscriptionOperationsService.startSelfDelivery(id),
    onSuccess: () => { Toast.show({ type: 'success', text1: 'Delivery started', text2: 'Verify the customer on arrival.' }); void invalidate(); },
    onError: () => Toast.show({ type: 'error', text1: 'Could not start', text2: 'Please retry.' }),
  });

  const complete = useMutation({
    mutationFn: ({ id }: { id: string }) =>
      subscriptionOperationsService.completeSelfDelivery(id, {
        verifiedCustomerName: vName,
        verifiedCustomerPhone: vPhone,
        cashCollectedPaise: Math.round(Number(vCash || 0) * 100),
        notes: vNotes || undefined,
      }),
    onSuccess: () => { Toast.show({ type: 'success', text1: 'Delivery completed and verified.' }); setVerify(null); void invalidate(); },
    onError: () => Toast.show({ type: 'error', text1: 'Could not complete', text2: 'Please retry.' }),
  });

  const recordFail = useMutation({
    mutationFn: ({ id }: { id: string }) => subscriptionOperationsService.failSelfDelivery(id, failReason),
    onSuccess: () => { Toast.show({ type: 'success', text1: 'Delivery marked as failed.' }); setFail(null); void invalidate(); },
    onError: () => Toast.show({ type: 'error', text1: 'Could not record failure', text2: 'Please retry.' }),
  });

  const saveEdit = useMutation({
    mutationFn: ({ id }: { id: string }) =>
      subscriptionOperationsService.updateSelfDelivery(id, {
        status: editStatus,
        cashCollectedPaise: Math.round(Number(editCash || 0) * 100),
        notes: editNotes || undefined,
        failureReason: editStatus === 'FAILED' ? editNotes || 'Marked failed by store' : undefined,
      }),
    onSuccess: () => { Toast.show({ type: 'success', text1: `Delivery marked as ${editStatus.toLowerCase()}.` }); setEdit(null); void invalidate(); },
    onError: () => Toast.show({ type: 'error', text1: 'Could not update', text2: 'Please retry.' }),
  });

  const deliveries = Array.isArray(queue.data) ? queue.data : [];
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return deliveries.filter((d: any) => {
      const m = meta(d.status);
      if (group !== 'all' && m.group !== group) return false;
      if (slotFilter !== 'ALL' && String(d.deliverySlot || d.slot || '').toUpperCase() !== slotFilter) return false;
      if (needle) {
        const hay = `${d.customer?.name || d.customerName || ''} ${d.customer?.phone || d.phone || ''} ${d.sequenceNumber || ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [deliveries, group, slotFilter, search]);

  const counts = useMemo(() => {
    const c: Record<StatusGroup, number> = { all: deliveries.length, pending: 0, delivering: 0, delivered: 0, failed: 0 };
    for (const d of deliveries) c[meta(d.status).group]++;
    return c;
  }, [deliveries]);

  const cashToCollect = rows.reduce((s: number, d: any) => s + Number(d.cashDuePaise || 0), 0);
  const cashRecorded = rows.reduce((s: number, d: any) => s + Number(d.cashCollectedPaise || 0), 0);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={palette.teal700} />
      <GradientSurface preset="teal" style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()} accessibilityLabel="Go back">
          <ArrowLeft size={21} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>STORE DELIVERIES</Text>
          <Text style={styles.title}>Deliver at store</Text>
        </View>
        <TouchableOpacity style={styles.back} onPress={() => void queue.refetch()} accessibilityLabel="Refresh">
          <RefreshCw size={19} color="#FFFFFF" />
        </TouchableOpacity>
      </GradientSurface>

      {stores.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.groupRow}>
          {stores.map((s: any) => (
            <TouchableOpacity key={s.id} style={[styles.groupChip, activeStoreId === s.id && styles.groupChipActive]} onPress={() => setStoreId(s.id)}>
              <Text style={[styles.groupText, activeStoreId === s.id && styles.groupTextActive]}>{s.name || 'Store'}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.groupRow}>
        {GROUPS.map((g) => (
          <TouchableOpacity key={g.key} style={[styles.groupChip, group === g.key && styles.groupChipActive]} onPress={() => setGroup(g.key)}>
            <Text style={[styles.groupText, group === g.key && styles.groupTextActive]}>{g.label}</Text>
            <View style={[styles.groupCount, group === g.key && styles.groupCountActive]}>
              <Text style={[styles.groupCountText, group === g.key && styles.groupCountTextActive]}>{counts[g.key]}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.searchRow}>
        <Search size={16} color={palette.slate400} />
        <TextInput style={styles.searchInput} placeholder="Search customer, phone or sequence" placeholderTextColor={palette.slate400} value={search} onChangeText={setSearch} />
        {search ? <TouchableOpacity onPress={() => setSearch('')} accessibilityLabel="Clear search"><X size={16} color={palette.slate400} /></TouchableOpacity> : null}
      </View>

      <View style={styles.slotRow}>
        <TouchableOpacity style={[styles.slotChip, slotFilter === 'ALL' && styles.slotChipActive]} onPress={() => setSlotFilter('ALL')}><Text style={[styles.slotText, slotFilter === 'ALL' && styles.slotTextActive]}>All slots</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.slotChip, slotFilter === 'AM' && styles.slotChipActive]} onPress={() => setSlotFilter('AM')}><Sun size={12} color={slotFilter === 'AM' ? '#FFF' : palette.slate600} /><Text style={[styles.slotText, slotFilter === 'AM' && styles.slotTextActive]}>Morning</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.slotChip, slotFilter === 'PM' && styles.slotChipActive]} onPress={() => setSlotFilter('PM')}><Moon size={12} color={slotFilter === 'PM' ? '#FFF' : palette.slate600} /><Text style={[styles.slotText, slotFilter === 'PM' && styles.slotTextActive]}>Evening</Text></TouchableOpacity>
      </View>

      <View style={styles.cashRow}>
        <View style={styles.cashBox}><Text style={styles.cashLabel}>To collect</Text><Text style={styles.cashValue}>{money(cashToCollect)}</Text></View>
        <View style={styles.cashBox}><Text style={styles.cashLabel}>Recorded</Text><Text style={[styles.cashValue, { color: palette.green700 }]}>{money(cashRecorded)}</Text></View>
      </View>

      {storesQuery.isLoading || queue.isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={palette.teal700} /><Text style={styles.muted}>Loading deliveries…</Text></View>
      ) : !activeStoreId ? (
        <View style={styles.center}><Text style={styles.errorTitle}>No store</Text><Text style={styles.muted}>An admin must assign a store first.</Text></View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={queue.isRefetching} onRefresh={() => void queue.refetch()} />}>
          {rows.length === 0 ? (
            <View style={styles.center}>
              <CheckCircle2 size={40} color={palette.slate400} />
              <Text style={styles.emptyTitle}>Nothing to deliver</Text>
              <Text style={styles.emptyText}>Store self-deliveries appear here when scheduled.</Text>
            </View>
          ) : (
            rows.map((d: any) => {
              const m = meta(d.status);
              const s = String(d.status || '').toUpperCase();
              const canStart = STARTABLE.includes(s);
              const inProgress = s === 'STORE_DELIVERING';
              return (
                <View key={d.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <View style={styles.flex}>
                      <Text style={styles.name} numberOfLines={1}>{d.customer?.name || d.customerName || 'Customer'}</Text>
                      <Text style={styles.meta} numberOfLines={1}>
                        #{d.sequenceNumber || '—'} · {String(d.deliverySlot || d.slot || 'AM')} · {d.customer?.phone || d.phone || 'No phone'}
                      </Text>
                    </View>
                    <View style={[styles.pill, { backgroundColor: m.bg }]}><Text style={[styles.pillText, { color: m.fg }]}>{m.label}</Text></View>
                  </View>
                  <View style={styles.cardBody}>
                    <View style={styles.metaItem}><IndianRupee size={13} color={palette.slate500} /><Text style={styles.metaText}>Due {money(d.cashDuePaise)}</Text></View>
                    {d.address ? <Text style={styles.addr} numberOfLines={2}>{typeof d.address === 'string' ? d.address : d.address.line1}</Text> : null}
                  </View>
                  <View style={styles.actions}>
                    {d.latitude || d.gpsLat ? (
                      <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('Web' as never, { url: `https://www.google.com/maps/dir/?api=1&destination=${d.latitude || d.gpsLat},${d.longitude || d.gpsLng}` } as never)}>
                        <Navigation size={15} color={palette.teal700} />
                      </TouchableOpacity>
                    ) : null}
                    {canStart ? (
                      <Button label="Start delivery" tone="primary" onPress={() => start.mutate(d.id)} loading={start.isPending && start.variables === d.id} />
                    ) : inProgress ? (
                      <>
                        <TouchableOpacity style={styles.failBtn} onPress={() => { setFailReason(''); setFail(d); }}><XCircle size={15} color={palette.rose700} /><Text style={styles.failText}>Fail</Text></TouchableOpacity>
                        <View style={styles.flex}>
                          <Button label="Complete & collect cash" tone="success" icon={CheckCircle2} onPress={() => { setVName(d.customer?.name || ''); setVPhone(d.customer?.phone || ''); setVCash(String(Number(d.cashDuePaise || 0) / 100)); setVNotes(''); setVerify(d); }} />
                        </View>
                      </>
                    ) : (
                      <TouchableOpacity style={styles.editBtn} onPress={() => { setEditStatus(s === 'FAILED' ? 'FAILED' : 'DELIVERED'); setEditCash(String(Number(d.cashCollectedPaise || 0) / 100)); setEditNotes(d.failureReason || d.notes || ''); setEdit(d); }}>
                        <Text style={styles.editText}>Edit record</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Complete & collect cash */}
      <Sheet visible={!!verify} onClose={() => setVerify(null)} title="Complete & collect cash" subtitle={verify ? `#${verify.sequenceNumber || ''} · ${verify.customer?.name || ''}` : ''} insetBottom={insets.bottom}>
        <Field label="Customer name (verification)"><TextField value={vName} onChangeText={setVName} placeholder="Confirm name" /></Field>
        <Field label="Customer phone (verification)"><TextField value={vPhone} onChangeText={setVPhone} placeholder="Confirm phone" keyboardType="phone-pad" /></Field>
        <Field label="Cash collected (₹)"><TextField value={vCash} onChangeText={setVCash} placeholder="0" keyboardType="decimal-pad" /></Field>
        <Field label="Notes (optional)"><TextField value={vNotes} onChangeText={setVNotes} placeholder="Delivery notes" multiline /></Field>
        <Button label="Complete delivery" icon={CheckCircle2} tone="primary" onPress={() => {
          if (!vName.trim() || !vPhone.trim()) return Toast.show({ type: 'error', text1: 'Enter name and phone' });
          complete.mutate({ id: verify.id });
        }} loading={complete.isPending} />
      </Sheet>

      {/* Mark failed */}
      <Sheet visible={!!fail} onClose={() => setFail(null)} title="Mark delivery as failed" insetBottom={insets.bottom}>
        <Field label="Why did this delivery fail?" hint="Recorded against the subscription so the admin can re-attempt or credit the day.">
          <TextField value={failReason} onChangeText={setFailReason} placeholder="Reason" multiline />
        </Field>
        <Button label="Mark as failed" tone="danger" icon={XCircle} onPress={() => {
          if (!failReason.trim()) return Toast.show({ type: 'error', text1: 'A reason is required' });
          recordFail.mutate({ id: fail.id });
        }} loading={recordFail.isPending} />
      </Sheet>

      {/* Edit record */}
      <Sheet visible={!!edit} onClose={() => setEdit(null)} title="Edit delivery record" insetBottom={insets.bottom}>
        <Field label="Update status">
          <View style={styles.statusRow}>
            {['DELIVERED', 'FAILED'].map((s) => (
              <TouchableOpacity key={s} style={[styles.statusChip, editStatus === s && styles.statusChipActive]} onPress={() => setEditStatus(s)}>
                <Text style={[styles.statusChipText, editStatus === s && styles.statusChipTextActive]}>{s === 'DELIVERED' ? 'Delivered' : 'Failed'}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Field>
        <Field label="Cash collected (₹)"><TextField value={editCash} onChangeText={setEditCash} keyboardType="decimal-pad" placeholder="0" /></Field>
        <Field label={editStatus === 'FAILED' ? 'Failure reason (required)' : 'Notes (optional)'}>
          <TextField value={editNotes} onChangeText={setEditNotes} multiline placeholder={editStatus === 'FAILED' ? 'Why did it fail?' : 'Notes'} />
        </Field>
        <Button label="Save changes" icon={CheckCircle2} tone={editStatus === 'FAILED' ? 'danger' : 'primary'} onPress={() => {
          if (editStatus === 'FAILED' && !editNotes.trim()) return Toast.show({ type: 'error', text1: 'A failure reason is required' });
          saveEdit.mutate({ id: edit.id });
        }} loading={saveEdit.isPending} />
      </Sheet>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.slate050 },
  flex: { flex: 1, minWidth: 0 },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  back: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: '#A7F3D0', fontSize: 9, fontWeight: '700', letterSpacing: 1.2 },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '600', marginTop: 2 },
  groupRow: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, alignItems: 'center' },
  groupChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: palette.white, borderWidth: 1, borderColor: palette.slate200 },
  groupChipActive: { backgroundColor: palette.teal700, borderColor: palette.teal700 },
  groupText: { fontSize: 12, fontWeight: '600', color: palette.slate600 },
  groupTextActive: { color: '#FFFFFF' },
  groupCount: { minWidth: 20, height: 18, borderRadius: 9, backgroundColor: palette.slate200, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  groupCountActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  groupCountText: { fontSize: 10, fontWeight: '700', color: palette.slate500 },
  groupCountTextActive: { color: '#FFFFFF' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: palette.white, marginHorizontal: spacing.lg, paddingHorizontal: spacing.md, borderRadius: radius.sm, borderWidth: 1, borderColor: palette.slate200 },
  searchInput: { flex: 1, paddingVertical: spacing.md, color: palette.slate900, fontSize: 13.5 },
  slotRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  slotChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: palette.white, borderWidth: 1, borderColor: palette.slate200 },
  slotChipActive: { backgroundColor: palette.teal700, borderColor: palette.teal700 },
  slotText: { fontSize: 12, fontWeight: '600', color: palette.slate600 },
  slotTextActive: { color: '#FFFFFF' },
  cashRow: { flexDirection: 'row', gap: spacing.md, padding: spacing.lg },
  cashBox: { flex: 1, backgroundColor: palette.white, borderRadius: radius.md, borderWidth: 1, borderColor: palette.slate200, padding: spacing.md },
  cashLabel: { color: palette.slate500, fontSize: 10.5, fontWeight: '600' },
  cashValue: { color: palette.slate900, fontSize: 17, fontWeight: '700', marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxxl, gap: spacing.sm },
  muted: { color: palette.slate500, fontSize: 13 },
  errorTitle: { color: palette.slate900, fontSize: 18, fontWeight: '600' },
  emptyTitle: { color: palette.slate900, fontSize: 16, fontWeight: '600' },
  emptyText: { color: palette.slate500, fontSize: 13, textAlign: 'center' },
  list: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: 60 },
  card: { backgroundColor: palette.white, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: palette.slate200 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { color: palette.slate900, fontSize: 15, fontWeight: '600' },
  meta: { color: palette.slate500, fontSize: 11.5, marginTop: 2 },
  pill: { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill },
  pillText: { fontSize: 9.5, fontWeight: '700' },
  cardBody: { marginTop: spacing.sm, gap: 4 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { color: palette.slate600, fontSize: 12 },
  addr: { color: palette.slate500, fontSize: 11.5 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, alignItems: 'center' },
  iconBtn: { width: 44, height: 44, borderRadius: radius.md, borderWidth: 1, borderColor: palette.teal700, alignItems: 'center', justifyContent: 'center' },
  failBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: palette.rose100 },
  failText: { color: palette.rose700, fontSize: 12.5, fontWeight: '700' },
  editBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: palette.slate100 },
  editText: { color: palette.slate700, fontSize: 12.5, fontWeight: '700' },
  statusRow: { flexDirection: 'row', gap: spacing.sm },
  statusChip: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.sm, backgroundColor: palette.slate100 },
  statusChipActive: { backgroundColor: palette.teal700 },
  statusChipText: { color: palette.slate600, fontSize: 12.5, fontWeight: '700' },
  statusChipTextActive: { color: '#FFFFFF' },
});
