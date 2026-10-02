import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  IndianRupee,
  Route,
  Truck,
  UserCheck,
  Users,
  X,
} from 'lucide-react-native';
import { subscriptionOperationsService } from '../../api/subscriptionOperationsService';
import { palette, radius, spacing, toneTokens, typography } from '../../design/tokens';
import { Card, StatusPill } from '../../components/ui/primitives';

const ASSIGNMENTS_KEY = ['store', 'rider-assignments'] as const;

function dayLabel(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

function shiftDay(value: string, delta: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function money(paise?: number | null) {
  return `₹ ${((paise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function errorMessage(error: any) {
  const value = error?.response?.data?.message;
  return Array.isArray(value) ? value.join(', ') : value || error?.message || 'The operation could not be completed.';
}

function riderStatusTone(status?: string | null) {
  const value = String(status || '').toUpperCase();
  if (value === 'ONLINE') return toneTokens.success;
  if (value === 'BUSY') return toneTokens.warning;
  return toneTokens.neutral;
}

export const StoreRiderAssignmentsScreen = ({ navigation }: { navigation: any }) => {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [pickerOpen, setPickerOpen] = useState(false);

  const boardQuery = useQuery({
    queryKey: [...ASSIGNMENTS_KEY, date],
    queryFn: () => subscriptionOperationsService.getRiderAssignments(date),
    refetchInterval: 30_000,
    retry: 1,
  });

  const ridersQuery = useQuery({
    queryKey: ['store', 'available-riders'],
    queryFn: subscriptionOperationsService.getAvailableRiders,
    enabled: pickerOpen,
    staleTime: 30_000,
  });

  const board = boardQuery.data || {};
  const totals = board.totals || {};
  const riders = Array.isArray(board.riders) ? board.riders : [];
  const unassigned = Array.isArray(board.unassigned) ? board.unassigned : [];
  const selectedIds = useMemo(
    () => Object.keys(selected).filter((id) => selected[id]),
    [selected],
  );

  const dispatch = useMutation({
    mutationFn: (riderProfileId: string) =>
      subscriptionOperationsService.dispatchToRider({ deliveryIds: selectedIds, riderProfileId }),
    onSuccess: async (result: any) => {
      await queryClient.invalidateQueries({ queryKey: ASSIGNMENTS_KEY });
      setSelected({});
      setPickerOpen(false);
      Toast.show({
        type: 'success',
        text1: 'Dispatched to rider',
        text2: `${result?.dispatchedCount || selectedIds.length} stop(s) sent to ${result?.riderName || 'the rider'}.`,
      });
    },
    onError: (error) => Toast.show({ type: 'error', text1: 'Dispatch failed', text2: errorMessage(error) }),
  });

  const toggle = (deliveryId: string) => setSelected((current) => ({ ...current, [deliveryId]: !current[deliveryId] }));

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={palette.teal700} />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + spacing.sm }]}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back" style={styles.back} onPress={() => navigation.goBack()}>
          <ArrowLeft size={22} color={palette.white} />
        </TouchableOpacity>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>DISPATCH BOARD</Text>
          <Text style={styles.title}>Rider assignments</Text>
        </View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Refresh" style={styles.back} onPress={() => void boardQuery.refetch()}>
          <Truck size={20} color={palette.white} />
        </TouchableOpacity>
      </View>

      <View style={styles.dayNav}>
        <TouchableOpacity style={styles.navBtn} onPress={() => setDate((current) => shiftDay(current, -1))}>
          <ChevronLeft size={20} color={palette.teal700} />
        </TouchableOpacity>
        <Text style={styles.dayLabel}>{dayLabel(date)}</Text>
        <TouchableOpacity style={styles.navBtn} onPress={() => setDate((current) => shiftDay(current, 1))}>
          <ChevronRight size={20} color={palette.teal700} />
        </TouchableOpacity>
      </View>

      {boardQuery.isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={palette.teal700} /><Text style={styles.muted}>Loading dispatch board…</Text></View>
      ) : boardQuery.isError ? (
        <View style={styles.center}><Text style={styles.stateTitle}>Dispatch board unavailable</Text><Text style={styles.muted}>{errorMessage(boardQuery.error)}</Text></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 120, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={boardQuery.isRefetching} onRefresh={() => void boardQuery.refetch()} tintColor={palette.teal700} />}
        >
          <View style={styles.metricsRow}>
            <Metric icon={<UserCheck size={18} color={palette.green700} />} value={String(totals.assignedCount ?? 0)} label="Assigned" />
            <Metric icon={<CircleDashed size={18} color={palette.amber700} />} value={String(totals.unassignedCount ?? 0)} label="Unassigned" />
            <Metric icon={<Users size={18} color={palette.blue700} />} value={String(riders.length)} label="Riders" />
            <Metric icon={<IndianRupee size={18} color={palette.slate700} />} value={money(totals.cashToCollectPaise)} label="Cash" compact />
          </View>

          {riders.length === 0 && unassigned.length === 0 ? (
            <View style={styles.center}><Route size={40} color={palette.slate400} /><Text style={styles.stateTitle}>No deliveries this day</Text><Text style={styles.muted}>Subscription deliveries appear here once generated for the selected date.</Text></View>
          ) : null}

          {riders.map((rider: any) => (
            <Card key={rider.id} style={styles.riderCard}>
              <View style={styles.riderTop}>
                <View style={styles.riderAvatar}><Text style={styles.riderInitial}>{(rider.name || 'R').slice(0, 1).toUpperCase()}</Text></View>
                <View style={styles.flex}>
                  <Text style={styles.riderName}>{rider.name}</Text>
                  <Text style={styles.riderMeta}>{rider.phone || 'Phone unavailable'} · {rider.vehicleNumber || rider.vehicleType || 'Vehicle pending'}</Text>
                </View>
                <StatusPill label={rider.profileStatus || 'OFFLINE'} tone={riderStatusTone(rider.profileStatus) === toneTokens.success ? 'success' : riderStatusTone(rider.profileStatus) === toneTokens.warning ? 'warning' : 'neutral'} />
              </View>
              {(rider.runs || []).map((run: any) => (
                <View key={run.id} style={styles.runBlock}>
                  <View style={styles.runTop}>
                    <Text style={styles.runCode}>{run.routeCode}</Text>
                    <Text style={styles.runMeta}>{run.slot} · {run.totalStopCount} stops · {money(run.cashToCollectPaise)}</Text>
                  </View>
                  {(run.stops || []).map((stop: any) => (
                    <View key={stop.deliveryId} style={styles.stopRow}>
                      <Text style={styles.stopSeq}>{stop.sequenceNumber}</Text>
                      <Text style={styles.stopName} numberOfLines={1}>{stop.customer?.name || 'Customer'}</Text>
                      <Text style={styles.stopProduct}>{stop.product}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </Card>
          ))}

          {unassigned.length > 0 ? (
            <Card style={styles.unassignedCard}>
              <View style={styles.unassignedHead}>
                <CircleDashed size={19} color={palette.amber700} />
                <Text style={styles.unassignedTitle}>Unassigned ({unassigned.length})</Text>
                <View style={styles.flex} />
                <TouchableOpacity onPress={() => setSelected(Object.fromEntries(unassigned.map((s: any) => [s.deliveryId, true])))}>
                  <Text style={styles.selectAll}>Select all</Text>
                </TouchableOpacity>
              </View>
              {unassigned.map((stop: any) => {
                const checked = Boolean(selected[stop.deliveryId]);
                return (
                  <TouchableOpacity key={stop.deliveryId} style={styles.unassignedRow} onPress={() => toggle(stop.deliveryId)}>
                    <View style={[styles.checkbox, checked && styles.checkboxOn]}>{checked ? <CheckCircle2 size={16} color={palette.white} /> : null}</View>
                    <View style={styles.flex}>
                      <Text style={styles.stopName} numberOfLines={1}>{stop.customer?.name || 'Customer'}</Text>
                      <Text style={styles.riderMeta}>{stop.address} · {stop.slot} · {stop.product}</Text>
                    </View>
                    <Text style={styles.stopCash}>{money(stop.cashDuePaise)}</Text>
                  </TouchableOpacity>
                );
              })}
            </Card>
          ) : null}
        </ScrollView>
      )}

      {selectedIds.length > 0 ? (
        <View style={[styles.dispatchBar, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <TouchableOpacity style={styles.dispatchButton} onPress={() => setPickerOpen(true)}>
            <Truck size={18} color={palette.white} />
            <Text style={styles.dispatchText}>Dispatch {selectedIds.length} stop(s)</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Choose a rider</Text>
              <TouchableOpacity onPress={() => setPickerOpen(false)} style={styles.modalClose}><X size={20} color={palette.slate600} /></TouchableOpacity>
            </View>
            {ridersQuery.isLoading ? (
              <ActivityIndicator color={palette.teal700} style={{ marginVertical: spacing.xl }} />
            ) : (ridersQuery.data || []).length === 0 ? (
              <Text style={styles.muted}>No approved riders available.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 380 }}>
                {(ridersQuery.data || []).map((rider: any) => (
                  <TouchableOpacity
                    key={rider.id}
                    style={styles.pickerRow}
                    disabled={dispatch.isPending}
                    onPress={() => dispatch.mutate(rider.id)}
                  >
                    <View style={styles.riderAvatar}><Text style={styles.riderInitial}>{(rider.name || 'R').slice(0, 1).toUpperCase()}</Text></View>
                    <View style={styles.flex}>
                      <Text style={styles.riderName}>{rider.name}</Text>
                      <Text style={styles.riderMeta}>{rider.phone || 'Phone unavailable'} · {rider.pendingRunCount || 0} active run(s)</Text>
                    </View>
                    <StatusPill label={rider.status || 'OFFLINE'} tone={riderStatusTone(rider.status) === toneTokens.success ? 'success' : riderStatusTone(rider.status) === toneTokens.warning ? 'warning' : 'neutral'} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

function Metric({ icon, value, label, compact }: { icon: React.ReactNode; value: string; label: string; compact?: boolean }) {
  return (
    <View style={styles.metric}>
      {icon}
      <Text style={[styles.metricValue, compact && styles.metricValueCompact]} numberOfLines={1}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.slate050 },
  flex: { flex: 1 },
  header: { backgroundColor: palette.teal700, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
  back: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { ...typography.eyebrow, color: palette.teal100 },
  title: { ...typography.title, color: palette.white, marginTop: spacing.xxs },
  dayNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: palette.white, borderBottomWidth: 1, borderBottomColor: palette.slate200 },
  navBtn: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: palette.teal050, alignItems: 'center', justifyContent: 'center' },
  dayLabel: { ...typography.heading, color: palette.slate900 },
  center: { alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.sm },
  muted: { color: palette.slate500, fontSize: 13, textAlign: 'center' },
  stateTitle: { color: palette.slate900, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  metricsRow: { flexDirection: 'row', gap: spacing.sm },
  metric: { flex: 1, backgroundColor: palette.white, borderRadius: radius.md, borderWidth: 1, borderColor: palette.slate200, paddingVertical: spacing.md, alignItems: 'center', gap: 4 },
  metricValue: { ...typography.heading, color: palette.slate900 },
  metricValueCompact: { fontSize: 13 },
  metricLabel: { color: palette.slate500, fontSize: 9, fontWeight: '600' },
  riderCard: { gap: spacing.sm },
  riderTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  riderAvatar: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: palette.teal050, alignItems: 'center', justifyContent: 'center' },
  riderInitial: { color: palette.teal700, fontSize: 17, fontWeight: '700' },
  riderName: { color: palette.slate900, fontSize: 15, fontWeight: '700' },
  riderMeta: { color: palette.slate500, fontSize: 11, fontWeight: '500', marginTop: 2 },
  runBlock: { backgroundColor: palette.slate050, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm },
  runTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  runCode: { color: palette.teal800, fontSize: 12, fontWeight: '700' },
  runMeta: { color: palette.slate500, fontSize: 10, fontWeight: '600' },
  stopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.slate200, marginTop: 4 },
  stopSeq: { width: 22, color: palette.slate400, fontSize: 10, fontWeight: '700' },
  stopName: { flex: 1, color: palette.slate900, fontSize: 12, fontWeight: '600' },
  stopProduct: { color: palette.teal700, fontSize: 11, fontWeight: '600' },
  unassignedCard: { borderColor: palette.amber100, backgroundColor: palette.amber050 },
  unassignedHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  unassignedTitle: { color: palette.amber700, fontSize: 15, fontWeight: '700' },
  selectAll: { color: palette.teal700, fontSize: 12, fontWeight: '700' },
  unassignedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.amber100 },
  checkbox: { width: 24, height: 24, borderRadius: 8, borderWidth: 1.5, borderColor: palette.slate300, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.white },
  checkboxOn: { backgroundColor: palette.teal700, borderColor: palette.teal700 },
  stopCash: { color: palette.slate700, fontSize: 11, fontWeight: '700' },
  dispatchBar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: palette.white, borderTopWidth: 1, borderTopColor: palette.slate200 },
  dispatchButton: { minHeight: 52, borderRadius: radius.md, backgroundColor: palette.teal700, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  dispatchText: { color: palette.white, fontSize: 15, fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(11,59,54,0.45)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: palette.white, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  modalTitle: { ...typography.title, color: palette.slate900 },
  modalClose: { width: 38, height: 38, borderRadius: radius.sm, backgroundColor: palette.slate100, alignItems: 'center', justifyContent: 'center' },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.slate200 },
});
