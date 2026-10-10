import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Droplet,
  IndianRupee,
  Minus,
  RotateCcw,
  Truck,
  Users,
  X,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { subscriptionOperationsService } from '../../api/subscriptionOperationsService';
import { GradientSurface } from '../../components/GradientSurface';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const CELL_WIDTH = 46;
const NAME_WIDTH = 132;

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

// Every status gets a glyph and a tone, so a cell reads at a glance instead of
// asking the store to decode a coloured dot.
type StatusVisual = { icon: any; fg: string; bg: string; label: string };
function statusVisual(status?: string | null): StatusVisual | null {
  if (!status) return null;
  const s = status.toUpperCase();
  if (s === 'DELIVERED') return { icon: Check, fg: '#0F766E', bg: '#D1FAE5', label: 'Delivered' };
  if (s === 'SKIPPED') return { icon: Minus, fg: '#B45309', bg: '#FEF3C7', label: 'Skipped' };
  if (s === 'FAILED' || s === 'CANCELLED') return { icon: X, fg: '#B91C1C', bg: '#FEE2E2', label: s === 'FAILED' ? 'Failed' : 'Cancelled' };
  if (s === 'RETURNED' || s === 'RETURN_REQUIRED' || s === 'RETRY_PENDING') return { icon: RotateCcw, fg: '#C2410C', bg: '#FFEDD5', label: 'Return' };
  if (s === 'SCHEDULED' || s === 'ORDER_GENERATED' || s === 'PREPARING' || s === 'PACKED' || s === 'PLANNED' || s === 'READY') {
    return { icon: Clock, fg: '#1D4ED8', bg: '#DBEAFE', label: 'Scheduled' };
  }
  return { icon: Clock, fg: '#64748B', bg: '#F1F5F9', label: s };
}

// A short litre string for the cell: the ordered base volume, plus any extra
// litres logged that day, e.g. "1L" or "0.5L+0.5L".
function litreLabel(cell: any): string {
  if (!cell) return '';
  const base = String(cell.baseQuantity || '').trim();
  const extra = cell.extraMilk ? String(cell.extraMilk).trim() : '';
  if (base && extra) return `${base}+${extra}`;
  return base || extra || '';
}

function toLiters(value: any): number {
  const m = String(value || '').match(/([0-9]+(?:\.[0-9]+)?)/);
  return m ? Number(m[1]) : 0;
}

function money(paise: number) {
  return `₹${(Number(paise || 0) / 100).toLocaleString('en-IN')}`;
}

export const StoreMilkGridScreen = ({ navigation }: { navigation: any }) => {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selected, setSelected] = useState<{ row: any; day: number; cell: any } | null>(null);

  const gridQuery = useQuery({
    queryKey: ['store-milk-grid', year, month],
    queryFn: () => subscriptionOperationsService.getGrid(year, month),
    retry: 1,
  });

  const autoDispatch = useMutation({
    mutationFn: () => subscriptionOperationsService.autoDispatchDefaultRiders(),
    onSuccess: (data: any) => {
      Toast.show({ type: 'success', text1: 'Auto-dispatch complete', text2: data?.message || 'Riders assigned to routes.' });
      void queryClient.invalidateQueries({ queryKey: ['store-milk-grid', year, month] });
    },
    onError: () => Toast.show({ type: 'error', text1: 'Auto-dispatch failed', text2: 'Try again.' }),
  });

  const daysInMonth = getDaysInMonth(year, month);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const grid = (gridQuery.data?.rows || gridQuery.data?.grid || []) as any[];
  const todayDate = today.getDate();
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();

  const totals = useMemo(() => {
    let liters = 0, delivered = 0, collected = 0, due = 0;
    for (const row of grid) {
      liters += Number(row.totalLiters || 0);
      delivered += Number(row.totalDeliveredDays || 0);
      collected += Number(row.totalCollectedPaise || 0);
      due += Number(row.totalDuePaise || 0);
    }
    return { liters: Math.round(liters * 100) / 100, delivered, collected, due };
  }, [grid]);

  const goToPrevMonth = () => { if (month === 0) { setYear(year - 1); setMonth(11); } else { setMonth(month - 1); } };
  const goToNextMonth = () => { if (month === 11) { setYear(year + 1); setMonth(0); } else { setMonth(month + 1); } };

  const openCell = (row: any, day: number) => {
    const cell = row.days?.[day] || row.cells?.[day - 1] || null;
    if (!cell) return;
    setSelected({ row, day, cell });
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#0F766E" />
      <GradientSurface preset="teal" style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()} accessibilityLabel="Go back">
          <ArrowLeft size={21} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>DELIVERY GRID</Text>
          <Text style={styles.title}>Milk calendar</Text>
        </View>
        <TouchableOpacity
          style={[styles.dispatchBtn, autoDispatch.isPending && styles.disabled]}
          onPress={() => autoDispatch.mutate()}
          disabled={autoDispatch.isPending}
        >
          <Truck size={16} color="#FFFFFF" />
          <Text style={styles.dispatchText}>Dispatch</Text>
        </TouchableOpacity>
      </GradientSurface>

      <View style={styles.monthNav}>
        <TouchableOpacity onPress={goToPrevMonth} style={styles.navBtn} accessibilityLabel="Previous month">
          <ChevronLeft size={20} color="#0F766E" />
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{MONTH_NAMES[month]} {year}</Text>
        <TouchableOpacity onPress={goToNextMonth} style={styles.navBtn} accessibilityLabel="Next month">
          <ChevronRight size={20} color="#0F766E" />
        </TouchableOpacity>
      </View>

      <View style={styles.summaryStrip}>
        <SummaryStat icon={Droplet} label="Litres" value={`${totals.liters}L`} />
        <View style={styles.summaryDivider} />
        <SummaryStat icon={Check} label="Delivered" value={String(totals.delivered)} />
        <View style={styles.summaryDivider} />
        <SummaryStat icon={IndianRupee} label="Collected" value={money(totals.collected)} />
        <View style={styles.summaryDivider} />
        <SummaryStat icon={IndianRupee} label="Due" value={money(totals.due)} tone={totals.due > 0 ? '#B91C1C' : undefined} />
      </View>

      <View style={styles.legendRow}>
        {['DELIVERED', 'SCHEDULED', 'SKIPPED', 'FAILED'].map((s) => {
          const v = statusVisual(s)!;
          const Icon = v.icon;
          return (
            <View key={s} style={styles.legendItem}>
              <View style={[styles.legendGlyph, { backgroundColor: v.bg }]}><Icon size={11} color={v.fg} strokeWidth={2.6} /></View>
              <Text style={styles.legendText}>{v.label}</Text>
            </View>
          );
        })}
      </View>

      {gridQuery.isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#0F766E" /><Text style={styles.muted}>Loading delivery grid…</Text></View>
      ) : gridQuery.isError ? (
        <View style={styles.center}><Text style={styles.errorTitle}>Couldn't load grid</Text><Text style={styles.muted}>Pull down to retry.</Text></View>
      ) : grid.length === 0 ? (
        <View style={styles.center}>
          <CalendarDays size={40} color="#94A3B8" />
          <Text style={styles.emptyTitle}>No subscribers for this month</Text>
          <Text style={styles.emptyText}>The delivery grid will appear when subscribers are assigned to your store.</Text>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gridScroll}>
          <View>
            <View style={styles.gridHeader}>
              <View style={[styles.nameCell, styles.headerCell]}>
                <Users size={14} color="#64748B" />
                <Text style={styles.headerText}>Customer</Text>
              </View>
              {days.map((day) => (
                <View key={day} style={[styles.dayCell, styles.headerCell, isCurrentMonth && day === todayDate && styles.todayHeader]}>
                  <Text style={[styles.dayText, isCurrentMonth && day === todayDate && styles.todayText]}>{day}</Text>
                </View>
              ))}
            </View>
            <ScrollView
              style={styles.gridBody}
              contentContainerStyle={{ paddingBottom: 100 }}
              refreshControl={<RefreshControl refreshing={gridQuery.isRefetching} onRefresh={() => void gridQuery.refetch()} />}
            >
              {grid.map((row: any, rowIndex: number) => (
                <View key={row.subscriptionId || rowIndex} style={[styles.gridRow, rowIndex % 2 === 0 && styles.gridRowEven]}>
                  <View style={styles.nameCell}>
                    <Text style={styles.customerName} numberOfLines={1}>{row.customerName || row.name || `Customer ${rowIndex + 1}`}</Text>
                    {row.plan?.dailyQuantity ? (
                      <Text style={styles.riderLabel} numberOfLines={1}>{row.plan.dailyQuantity}</Text>
                    ) : row.defaultRider ? (
                      <Text style={styles.riderLabel} numberOfLines={1}>{row.defaultRider.name || 'Rider assigned'}</Text>
                    ) : null}
                  </View>
                  {days.map((day) => {
                    const cell = row.days?.[day] || row.cells?.[day - 1] || null;
                    const visual = statusVisual(cell?.status);
                    const litres = litreLabel(cell);
                    return (
                      <TouchableOpacity
                        key={day}
                        activeOpacity={0.7}
                        accessibilityLabel={visual ? `${row.customerName || 'Customer'} day ${day}: ${visual.label}${litres ? `, ${litres}` : ''}` : undefined}
                        onPress={() => openCell(row, day)}
                        style={[styles.dayCell, cell && { backgroundColor: visual?.bg }, isCurrentMonth && day === todayDate && styles.todayCell]}
                      >
                        {visual ? (
                          <>
                            <visual.icon size={15} color={visual.fg} strokeWidth={2.6} />
                            {litres ? <Text style={[styles.cellLitres, { color: visual.fg }]} numberOfLines={1}>{litres}</Text> : null}
                          </>
                        ) : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          </View>
        </ScrollView>
      )}

      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + 18 }]}>
            {selected ? (() => {
              const { row, day, cell } = selected;
              const visual = statusVisual(cell.status);
              const Icon = visual?.icon || Clock;
              const base = toLiters(cell.baseQuantity);
              const extra = toLiters(cell.extraMilk);
              return (
                <>
                  <View style={styles.modalTop}>
                    <View style={[styles.modalGlyph, { backgroundColor: visual?.bg || '#F1F5F9' }]}>
                      <Icon size={22} color={visual?.fg || '#64748B'} strokeWidth={2.6} />
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.modalName} numberOfLines={1}>{row.customerName || row.name || 'Customer'}</Text>
                      <Text style={styles.modalSub}>{day} {MONTH_NAMES[month]} {year} · {visual?.label || 'No status'}</Text>
                    </View>
                    <TouchableOpacity onPress={() => setSelected(null)} style={styles.modalClose} accessibilityLabel="Close details">
                      <X size={18} color="#64748B" />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.modalMetrics}>
                    <ModalMetric icon={Droplet} label="Base" value={cell.baseQuantity || '—'} />
                    <ModalMetric icon={Droplet} label="Extra" value={cell.extraMilk || '—'} />
                    <ModalMetric icon={Clock} label="Slot" value={cell.deliverySlot || row.slot || '—'} />
                  </View>

                  <View style={styles.modalRow}>
                    <Text style={styles.modalRowLabel}>Total milk</Text>
                    <Text style={styles.modalRowValue}>{Math.round((base + extra) * 100) / 100}L</Text>
                  </View>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalRowLabel}>Cash collected</Text>
                    <Text style={styles.modalRowValue}>{money(cell.cashCollectedPaise)}</Text>
                  </View>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalRowLabel}>Cash due</Text>
                    <Text style={[styles.modalRowValue, cell.cashDuePaise > 0 && styles.dueValue]}>{money(cell.cashDuePaise)}</Text>
                  </View>
                  {cell.paymentMode ? (
                    <View style={styles.modalRow}>
                      <Text style={styles.modalRowLabel}>Payment</Text>
                      <Text style={styles.modalRowValue}>{cell.paymentMode}</Text>
                    </View>
                  ) : null}
                  {cell.assignedRider?.name ? (
                    <View style={styles.modalRow}>
                      <Text style={styles.modalRowLabel}>Rider</Text>
                      <Text style={styles.modalRowValue}>{cell.assignedRider.name}</Text>
                    </View>
                  ) : null}
                  {cell.photoProof?.storageKey ? (
                    <View style={styles.modalRow}>
                      <Text style={styles.modalRowLabel}>Proof</Text>
                      <Text style={styles.modalRowValue}>Photo captured{cell.photoProof.riderName ? ` by ${cell.photoProof.riderName}` : ''}</Text>
                    </View>
                  ) : null}
                  {cell.note ? <Text style={styles.modalNote}>{cell.note}</Text> : null}
                </>
              );
            })() : null}
          </View>
        </View>
      </Modal>
    </View>
  );
};

function SummaryStat({ icon: Icon, label, value, tone }: { icon: any; label: string; value: string; tone?: string }) {
  return (
    <View style={styles.summaryStat}>
      <Icon size={13} color={tone || '#0F766E'} />
      <Text style={[styles.summaryValue, tone && { color: tone }]} numberOfLines={1}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function ModalMetric({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={styles.modalMetric}>
      <Icon size={14} color="#0F766E" />
      <Text style={styles.modalMetricValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.modalMetricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  flex: { flex: 1 },
  header: { paddingHorizontal: 18, paddingBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: '#A7F3D0', fontSize: 9, fontWeight: '600', letterSpacing: 1 },
  title: { color: '#FFFFFF', fontSize: 24, fontWeight: '600', marginTop: 2 },
  dispatchBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  dispatchText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  navBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#F0FDFA', alignItems: 'center', justifyContent: 'center' },
  monthLabel: { fontSize: 16, fontWeight: '600', color: '#0F172A' },
  summaryStrip: { flexDirection: 'row', backgroundColor: '#FFFFFF', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  summaryStat: { flex: 1, alignItems: 'center', gap: 2 },
  summaryDivider: { width: 1, backgroundColor: '#E2E8F0', marginVertical: 4 },
  summaryValue: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  summaryLabel: { fontSize: 9, color: '#64748B', fontWeight: '500' },
  legendRow: { flexDirection: 'row', justifyContent: 'center', gap: 14, paddingVertical: 8, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendGlyph: { width: 18, height: 18, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  legendText: { fontSize: 10, color: '#64748B' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  muted: { color: '#64748B', fontSize: 13 },
  errorTitle: { color: '#0F172A', fontSize: 18, fontWeight: '600' },
  emptyTitle: { color: '#0F172A', fontSize: 16, fontWeight: '600' },
  emptyText: { color: '#64748B', fontSize: 13, textAlign: 'center' },
  gridScroll: { paddingHorizontal: 8 },
  gridHeader: { flexDirection: 'row', backgroundColor: '#F8FAFC', borderBottomWidth: 2, borderBottomColor: '#E2E8F0' },
  headerCell: { justifyContent: 'center', alignItems: 'center', paddingVertical: 8 },
  headerText: { fontSize: 9, fontWeight: '600', color: '#64748B', marginLeft: 4 },
  nameCell: { width: NAME_WIDTH, justifyContent: 'center', paddingHorizontal: 8 },
  dayCell: { width: CELL_WIDTH, height: 46, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: '#F1F5F9' },
  todayHeader: { backgroundColor: '#CCFBF1' },
  todayText: { color: '#0F766E', fontWeight: '600' },
  dayText: { fontSize: 11, fontWeight: '500', color: '#64748B' },
  cellLitres: { fontSize: 8, fontWeight: '600', marginTop: 1 },
  gridBody: { flex: 1 },
  gridRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  gridRowEven: { backgroundColor: '#FAFBFC' },
  customerName: { color: '#0F172A', fontSize: 11, fontWeight: '600' },
  riderLabel: { color: '#0F766E', fontSize: 9, marginTop: 2 },
  todayCell: { borderLeftWidth: 2, borderLeftColor: '#0F766E', borderRightWidth: 2, borderRightColor: '#0F766E' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 14 },
  modalTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  modalGlyph: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  modalName: { color: '#0F172A', fontSize: 17, fontWeight: '700' },
  modalSub: { color: '#64748B', fontSize: 12, marginTop: 2 },
  modalClose: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  modalMetrics: { flexDirection: 'row', gap: 10 },
  modalMetric: { flex: 1, alignItems: 'center', backgroundColor: '#F0FDFA', borderRadius: 14, paddingVertical: 10, gap: 2 },
  modalMetricValue: { color: '#0F172A', fontSize: 13, fontWeight: '700' },
  modalMetricLabel: { color: '#64748B', fontSize: 9 },
  modalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  modalRowLabel: { color: '#64748B', fontSize: 12 },
  modalRowValue: { color: '#0F172A', fontSize: 13, fontWeight: '600' },
  dueValue: { color: '#B91C1C' },
  modalNote: { color: '#92400E', fontSize: 11, backgroundColor: '#FFFBEB', borderRadius: 10, padding: 10, lineHeight: 16 },
});
