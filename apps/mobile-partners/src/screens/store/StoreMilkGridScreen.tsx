import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardTypeOptions,
  Modal,
  RefreshControl,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ArrowLeft,
  Ban,
  Bell,
  CalendarDays,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Droplet,
  FileSpreadsheet,
  IndianRupee,
  Minus,
  Package,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Sun,
  Moon,
  Share2,
  Truck,
  Undo2,
  Users,
  X,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { subscriptionOperationsService } from '../../api/subscriptionOperationsService';
import { GradientSurface } from '../../components/GradientSurface';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const CELL_WIDTH = 44;
const NAME_WIDTH = 150;
const PAGE = '#0F766E';

type Tab = 'status' | 'addon' | 'payment';

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

type StatusVisual = { icon: any; fg: string; bg: string; label: string };
function statusVisual(status?: string | null): StatusVisual {
  const s = String(status || '').toUpperCase();
  if (s === 'DELIVERED') return { icon: Check, fg: '#0F766E', bg: '#D1FAE5', label: 'Delivered' };
  if (s === 'SKIPPED') return { icon: Minus, fg: '#B45309', bg: '#FEF3C7', label: 'Skipped' };
  if (s === 'FAILED') return { icon: X, fg: '#B91C1C', bg: '#FEE2E2', label: 'Failed' };
  if (s === 'CANCELLED') return { icon: Ban, fg: '#475569', bg: '#E2E8F0', label: 'Cancelled' };
  if (s === 'RETURNED' || s === 'RETURN_REQUIRED' || s === 'RETRY_PENDING') {
    return { icon: RotateCcw, fg: '#C2410C', bg: '#FFEDD5', label: 'Return' };
  }
  if (!s) return { icon: Clock, fg: '#94A3B8', bg: '#F1F5F9', label: 'No delivery' };
  return { icon: Clock, fg: '#1D4ED8', bg: '#DBEAFE', label: 'Scheduled' };
}

function cellOf(row: any, day: number): any {
  return row?.days?.[day] ?? row?.cells?.[day - 1] ?? null;
}

function litreLabel(cell: any): string {
  if (!cell) return '';
  const base = String(cell.baseQuantity || '').trim();
  const extra = cell.extraMilk ? String(cell.extraMilk).trim() : '';
  const joined = base && extra ? `${base}+${extra}` : base || extra || '';
  return joined.replace(/\s*L\b/gi, '').replace(/\s*BM\b/gi, '').replace(/\s*CM\b/gi, '').trim();
}

function toLiters(value: any): number {
  const m = String(value || '').match(/([0-9]+(?:\.[0-9]+)?)/);
  return m ? Number(m[1]) : 0;
}

function money(paise: number) {
  return `₹${(Number(paise || 0) / 100).toLocaleString('en-IN')}`;
}

function rowName(row: any): string {
  return row?.customer?.name || row?.customerName || row?.name || 'Customer';
}

// A tiny statement section header used inside the bill modal.
function StatementRow({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <View style={styles.sRow}>
      <Text style={styles.sLabel}>{label}</Text>
      <Text style={[styles.sValue, danger && { color: '#B91C1C' }]}>{value}</Text>
    </View>
  );
}

// The add-on presets mirror the web grid's four unit modes.
const ADDON_PRESETS: Record<string, { label: string; qty: string }[]> = {
  weight: [
    { label: '250g (0.25 kg)', qty: '250g' },
    { label: '500g (0.5 kg)', qty: '500g' },
    { label: '1 kg (Standard)', qty: '1kg' },
    { label: '1.5 kg', qty: '1.5kg' },
    { label: '2 kg (2x)', qty: '2kg' },
  ],
  count: [
    { label: '1 Bowl', qty: '1 Bowl' },
    { label: '2 Bowls', qty: '2 Bowls' },
    { label: '3 Bowls', qty: '3 Bowls' },
    { label: '4 Bowls', qty: '4 Bowls' },
  ],
  volume: [
    { label: '0.25 Liter (250 ml)', qty: '250ml' },
    { label: '0.5 Liter (500 ml)', qty: '500ml' },
    { label: '1 Liter (1x)', qty: '1L' },
    { label: '1.5 Liters (1.5x)', qty: '1.5L' },
    { label: '2 Liters (2x)', qty: '2L' },
  ],
  custom: [],
};

const DURATIONS = [
  { label: '1 Day (Single)', value: 1 },
  { label: '2 Days', value: 2 },
  { label: '3 Days', value: 3 },
  { label: '4 Days', value: 4 },
  { label: '5 Days', value: 5 },
  { label: '7 Days (1 Wk)', value: 7 },
  { label: '10 Days', value: 10 },
  { label: '15 Days', value: 15 },
  { label: '30 Days (Full)', value: 30 },
];

export const StoreMilkGridScreen = ({ navigation }: { navigation: any }) => {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [search, setSearch] = useState('');
  const [slotFilter, setSlotFilter] = useState<'ALL' | 'AM' | 'PM'>('ALL');
  const [dueOnly, setDueOnly] = useState(false);
  const [channel, setChannel] = useState<'ALL' | 'online' | 'offline'>('ALL');

  const [selected, setSelected] = useState<{ row: any; day: number; cell: any } | null>(null);
  const [tab, setTab] = useState<Tab>('status');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'PHONE_PE'>('CASH');
  const [addonMode, setAddonMode] = useState<keyof typeof ADDON_PRESETS>('volume');
  const [addonQty, setAddonQty] = useState('1L');
  const [addonCustom, setAddonCustom] = useState('');
  const [addonPricePaise, setAddonPricePaise] = useState<number | null>(null);
  const [addonDays, setAddonDays] = useState(4);
  const [addonSlot, setAddonSlot] = useState<'AM' | 'PM'>('PM');

  const [statement, setStatement] = useState<any | null>(null);
  const [dispatchSummary, setDispatchSummary] = useState<any | null>(null);
  const [proof, setProof] = useState<{ url: string | null; cell: any } | null>(null);

  const gridQuery = useQuery({
    queryKey: ['store-milk-grid', year, month],
    queryFn: () => subscriptionOperationsService.getGrid(year, month),
    retry: 1,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['store-milk-grid', year, month] });

  const quickAction = useMutation({
    mutationFn: (vars: { id: string; type: any; options?: any }) =>
      subscriptionOperationsService.quickAction(vars.id, vars.type, vars.options),
    onSuccess: (_data, vars) => {
      const t = vars.type;
      Toast.show({
        type: 'success',
        text1:
          t === 'TOGGLE_DELIVERED' ? 'Delivery updated' :
          t === 'SKIP' ? 'Marked skipped' :
          t === 'TOGGLE_SLOT' ? 'Shift toggled' :
          t === 'RECORD_PAYMENT' ? 'Payment recorded' :
          t === 'VOID_PAYMENT' ? 'Payment voided' :
          t === 'EXTRA_MILK' ? 'Extra milk added' : 'Add-on attached',
      });
      setSelected(null);
      void invalidate();
    },
    onError: (e: any) =>
      Toast.show({ type: 'error', text1: 'Action failed', text2: e?.response?.data?.message || 'Try again.' }),
  });

  const autoDispatch = useMutation({
    mutationFn: () => subscriptionOperationsService.autoDispatchDefaultRiders(),
    onSuccess: (data: any) => {
      Toast.show({ type: 'success', text1: 'Auto-dispatch complete', text2: data?.message || 'Riders assigned to routes.' });
      void invalidate();
    },
    onError: () => Toast.show({ type: 'error', text1: 'Auto-dispatch failed', text2: 'Try again.' }),
  });

  const exportCsv = useMutation({
    mutationFn: () => subscriptionOperationsService.exportGridCsv(year, month),
    onSuccess: async (csv: string) => {
      try {
        await Share.share({ message: csv, title: `Aagam_Milk_Delivery_${year}_${month + 1}.csv` });
      } catch {
        Toast.show({ type: 'error', text1: 'Sharing cancelled' });
      }
    },
    onError: () => Toast.show({ type: 'error', text1: 'Export failed', text2: 'Could not build the CSV.' }),
  });

  const daysInMonth = getDaysInMonth(year, month);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const rawRows = (gridQuery.data?.rows || gridQuery.data?.grid || []) as any[];
  const todayDate = today.getDate();
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rawRows.filter((row) => {
      if (slotFilter !== 'ALL') {
        const slot = String(row.slot || '').toUpperCase();
        if (slotFilter === 'AM' && slot !== 'AM' && slot !== 'AM+PM') return false;
        if (slotFilter === 'PM' && slot !== 'PM' && slot !== 'AM+PM') return false;
      }
      if (channel !== 'ALL' && String(row.customer?.customerType || 'online') !== channel) return false;
      if (dueOnly && Number(row.totalDuePaise || 0) <= 0) return false;
      if (needle) {
        const hay = `${rowName(row)} ${row.customer?.phone || ''} ${row.customer?.address || ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rawRows, search, slotFilter, dueOnly, channel]);

  const totals = useMemo(() => {
    let liters = 0, delivered = 0, collected = 0, due = 0;
    for (const row of rows) {
      liters += Number(row.totalLiters || 0);
      delivered += Number(row.totalDeliveredDays || 0);
      collected += Number(row.totalCollectedPaise || 0);
      due += Number(row.totalDuePaise || 0);
    }
    return { liters: Math.round(liters * 100) / 100, delivered, collected, due };
  }, [rows]);

  const goToPrevMonth = () => { if (month === 0) { setYear(year - 1); setMonth(11); } else { setMonth(month - 1); } };
  const goToNextMonth = () => { if (month === 11) { setYear(year + 1); setMonth(0); } else { setMonth(month + 1); } };

  const openCell = (row: any, day: number) => {
    const cell = cellOf(row, day);
    if (!cell) {
      Toast.show({ type: 'info', text1: 'No scheduled delivery', text2: 'Nothing is scheduled for this date.' });
      return;
    }
    setTab('status');
    setPaymentAmount('');
    setPaymentMode('CASH');
    setAddonPricePaise(null);
    setSelected({ row, day, cell });
  };

  const runAction = (type: any, options?: any) => {
    if (!selected?.cell?.deliveryId) return;
    quickAction.mutate({ id: selected.cell.deliveryId, type, options });
  };

  const openStatement = async (row: any) => {
    try {
      const data = await subscriptionOperationsService.getCustomerStatement(row.subscriptionId);
      setStatement(data);
    } catch {
      Toast.show({ type: 'error', text1: 'Could not load statement' });
    }
  };

  const openDispatchSummary = async () => {
    try {
      const data = await subscriptionOperationsService.getDispatchSummary();
      setDispatchSummary(data);
    } catch {
      Toast.show({ type: 'error', text1: 'Could not load pack summary' });
    }
  };

  const openProof = async (cell: any) => {
    const key = cell?.photoProof?.storageKey;
    if (!key) return;
    try {
      const url = await subscriptionOperationsService.getEvidenceUrl(key);
      if (!url) {
        Toast.show({ type: 'error', text1: 'Photo unavailable' });
        return;
      }
      setProof({ url, cell });
    } catch {
      Toast.show({ type: 'error', text1: 'Photo unavailable' });
    }
  };

  const confirmSkip = () => {
    Alert.alert('Mark skipped?', 'This day will be recorded as not taken and will not count as delivered milk.', [
      { text: 'Back', style: 'cancel' },
      { text: 'Mark skipped', style: 'destructive', onPress: () => runAction('SKIP', { note: 'Customer requested skip / not taken' }) },
    ]);
  };

  const confirmVoid = () => {
    const onThisDay = money(selected?.cell?.cashCollectedPaise);
    Alert.alert('Void recorded payment?', `${onThisDay} will be returned to the customer's Due balance.`, [
      { text: 'Back', style: 'cancel' },
      { text: 'Void payment', style: 'destructive', onPress: () => runAction('VOID_PAYMENT', { amountPaise: selected?.cell?.cashCollectedPaise }) },
    ]);
  };

  const confirmRenew = () => {
    if (!selected) return;
    Alert.alert('Renew 30 days?', `Extend 30 daily deliveries on the same plan for ${rowName(selected.row)}.`, [
      { text: 'Back', style: 'cancel' },
      {
        text: 'Renew',
        onPress: async () => {
          try {
            await subscriptionOperationsService.renewThirtyDays(selected.row.subscriptionId);
            Toast.show({ type: 'success', text1: 'Plan renewed', text2: `${rowName(selected.row)} extended by 30 days.` });
            setSelected(null);
            void invalidate();
          } catch {
            Toast.show({ type: 'error', text1: 'Renewal failed' });
          }
        },
      },
    ]);
  };

  const submitPayment = () => {
    const rupees = Number(paymentAmount);
    if (!rupees || rupees <= 0) {
      Toast.show({ type: 'error', text1: 'Enter an amount' });
      return;
    }
    runAction('RECORD_PAYMENT', { amountPaise: Math.round(rupees * 100), paymentMode });
  };

  const submitAddon = (attach: boolean) => {
    const qty = addonMode === 'custom' ? (addonCustom.trim() || '1 Unit') : addonQty;
    const perDayPaise = addonPricePaise && addonPricePaise > 0 ? addonPricePaise : undefined;
    if (attach) {
      runAction('ATTACH_EVENING_MILK', {
        extraQuantity: qty,
        extraPaise: perDayPaise,
        consecutiveDays: addonDays,
        targetSlot: addonSlot,
        note: `Add-on ${qty} x${addonDays} days`,
      });
    } else {
      runAction('EXTRA_MILK', {
        extraQuantity: qty,
        extraPaise: perDayPaise,
        amountPaise: perDayPaise,
        note: `One-time extra ${qty}`,
      });
    }
  };

  const dueBadge = Number(selected?.row?.totalDuePaise || 0);
  const canActOnCell = !!selected?.cell?.deliveryId;
  const isDelivered = String(selected?.cell?.status || '').toUpperCase() === 'DELIVERED';
  const isSkipped = String(selected?.cell?.status || '').toUpperCase() === 'SKIPPED';

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={PAGE} />
      <GradientSurface preset="teal" style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()} accessibilityLabel="Go back">
          <ArrowLeft size={21} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>MILK GRID</Text>
          <Text style={styles.title}>Delivery sheet</Text>
        </View>
        <TouchableOpacity style={styles.headerBtn} onPress={() => exportCsv.mutate()} accessibilityLabel="Export sheets">
          {exportCsv.isPending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <FileSpreadsheet size={19} color="#FFFFFF" />}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.headerBtn, autoDispatch.isPending && styles.disabled]}
          onPress={() => autoDispatch.mutate()}
          disabled={autoDispatch.isPending}
          accessibilityLabel="Auto-dispatch default riders"
        >
          <Truck size={19} color="#FFFFFF" />
        </TouchableOpacity>
      </GradientSurface>

      <View style={styles.monthNav}>
        <TouchableOpacity onPress={goToPrevMonth} style={styles.navBtn} accessibilityLabel="Previous month">
          <ChevronLeft size={20} color={PAGE} />
        </TouchableOpacity>
        <TouchableOpacity onPress={openDispatchSummary} style={styles.monthCenter}>
          <Text style={styles.monthLabel}>{MONTH_NAMES[month]} {year}</Text>
          <Text style={styles.monthHint}>Pack summary</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={goToNextMonth} style={styles.navBtn} accessibilityLabel="Next month">
          <ChevronRight size={20} color={PAGE} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchRow}>
        <Search size={16} color="#94A3B8" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search customer, phone, locality…"
          placeholderTextColor="#94A3B8"
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')} accessibilityLabel="Clear search">
            <X size={16} color="#94A3B8" />
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
        <Chip active={slotFilter === 'ALL'} onPress={() => setSlotFilter('ALL')} label="All slots" />
        <Chip active={slotFilter === 'AM'} onPress={() => setSlotFilter('AM')} label="AM" icon={Sun} />
        <Chip active={slotFilter === 'PM'} onPress={() => setSlotFilter('PM')} label="PM" icon={Moon} />
        <View style={styles.chipDivider} />
        <Chip active={dueOnly} onPress={() => setDueOnly(!dueOnly)} label="Only dues" />
        <View style={styles.chipDivider} />
        <Chip active={channel === 'ALL'} onPress={() => setChannel('ALL')} label="All" />
        <Chip active={channel === 'online'} onPress={() => setChannel('online')} label="Online" />
        <Chip active={channel === 'offline'} onPress={() => setChannel('offline')} label="Offline" />
      </ScrollView>

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
          const v = statusVisual(s);
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
        <View style={styles.center}><ActivityIndicator size="large" color={PAGE} /><Text style={styles.muted}>Loading delivery grid…</Text></View>
      ) : gridQuery.isError ? (
        <View style={styles.center}><Text style={styles.errorTitle}>Couldn't load grid</Text><Text style={styles.muted}>Pull down to retry.</Text></View>
      ) : rows.length === 0 ? (
        <View style={styles.center}>
          <CalendarDays size={40} color="#94A3B8" />
          <Text style={styles.emptyTitle}>No subscribers for this month</Text>
          <Text style={styles.emptyText}>The delivery grid appears when subscribers are assigned, or adjust your filters.</Text>
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
              contentContainerStyle={{ paddingBottom: 110 }}
              refreshControl={<RefreshControl refreshing={gridQuery.isRefetching} onRefresh={() => void gridQuery.refetch()} />}
            >
              {rows.map((row: any, rowIndex: number) => (
                <View key={row.subscriptionId || rowIndex} style={[styles.gridRow, rowIndex % 2 === 0 && styles.gridRowEven]}>
                  <View style={styles.nameCell}>
                    <Text style={styles.customerName} numberOfLines={1}>{rowName(row)}</Text>
                    <Text style={styles.riderLabel} numberOfLines={1}>
                      {row.plan?.name || row.slot || ''}{row.slot ? ` · ${row.slot}` : ''}
                    </Text>
                    {Number(row.totalDuePaise || 0) > 0 ? (
                      <Text style={styles.dueLabel}>Due {money(row.totalDuePaise)}</Text>
                    ) : null}
                  </View>
                  {days.map((day) => {
                    const cell = cellOf(row, day);
                    const visual = statusVisual(cell?.status);
                    const litres = litreLabel(cell);
                    return (
                      <TouchableOpacity
                        key={day}
                        activeOpacity={cell ? 0.7 : 1}
                        accessibilityLabel={cell ? `${rowName(row)} day ${day}: ${visual.label}${litres ? `, ${litres}` : ''}` : undefined}
                        onPress={() => openCell(row, day)}
                        style={[styles.dayCell, cell && { backgroundColor: visual.bg }, isCurrentMonth && day === todayDate && styles.todayCell]}
                      >
                        {cell ? (
                          <>
                            <visual.icon size={14} color={visual.fg} strokeWidth={2.6} />
                            {litres ? <Text style={[styles.cellLitres, { color: visual.fg }]} numberOfLines={1}>{litres}</Text> : null}
                          </>
                        ) : null}
                      </TouchableOpacity>
                    );
                  })}
                  <TouchableOpacity style={styles.billCell} onPress={() => openStatement(row)} accessibilityLabel={`Statement for ${rowName(row)}`}>
                    <Share2 size={15} color={PAGE} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        </ScrollView>
      )}

      {/* ---- Cell quick-action sheet (the operational core) ---- */}
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + 18 }]}>
            {selected ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.modalTop}>
                  <View style={[styles.modalGlyph, { backgroundColor: statusVisual(selected.cell.status).bg }]}>
                    {React.createElement(statusVisual(selected.cell.status).icon, { size: 20, color: statusVisual(selected.cell.status).fg, strokeWidth: 2.6 })}
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.modalName} numberOfLines={1}>{rowName(selected.row)}</Text>
                    <Text style={styles.modalSub}>
                      {selected.day} {MONTH_NAMES[month]} · {String(selected.cell.deliverySlot || selected.row.slot || '—')} · {statusVisual(selected.cell.status).label}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelected(null)} style={styles.modalClose} accessibilityLabel="Close details">
                    <X size={18} color="#64748B" />
                  </TouchableOpacity>
                </View>

                <View style={styles.tabRow}>
                  <TabBtn active={tab === 'status'} onPress={() => setTab('status')} label="Quick status" />
                  <TabBtn active={tab === 'addon'} onPress={() => setTab('addon')} label="Add-on" />
                  <TabBtn active={tab === 'payment'} onPress={() => setTab('payment')} label={dueBadge > 0 ? `Pay · ${money(dueBadge)}` : 'Payment'} />
                </View>

                {tab === 'status' ? (
                  <View style={styles.tabBody}>
                    <View style={styles.metricRow}>
                      <ModalMetric icon={Droplet} label="Base" value={selected.cell.baseQuantity || '—'} />
                      <ModalMetric icon={Droplet} label="Extra" value={selected.cell.extraMilk || '—'} />
                      <ModalMetric icon={IndianRupee} label="Collected" value={money(selected.cell.cashCollectedPaise)} />
                    </View>

                    <StatementRow
                      label="Total milk"
                      value={`${Math.round((toLiters(selected.cell.baseQuantity) + toLiters(selected.cell.extraMilk)) * 100) / 100}L`}
                    />

                    <ActionBtn
                      icon={isDelivered ? Undo2 : Check}
                      tone={isDelivered ? 'neutral' : 'success'}
                      label={isDelivered ? 'Undo delivery' : 'Mark delivered'}
                      onPress={() => runAction('TOGGLE_DELIVERED')}
                      disabled={quickAction.isPending}
                    />
                    <ActionBtn
                      icon={Moon}
                      tone="neutral"
                      label={String(selected.cell.deliverySlot || '').toUpperCase() === 'PM' ? 'Shift to AM' : 'Shift to PM'}
                      onPress={() => runAction('TOGGLE_SLOT')}
                      disabled={quickAction.isPending}
                    />
                    <ActionBtn icon={Minus} tone="warn" label="Mark skipped" onPress={confirmSkip} disabled={quickAction.isPending || isSkipped} />

                    {selected.row.defaultRider?.name ? (
                      <Text style={styles.hintLine}>Default rider: {selected.row.defaultRider.name}</Text>
                    ) : null}
                    {selected.cell.assignedRider?.name ? (
                      <Text style={styles.hintLine}>Assigned rider: {selected.cell.assignedRider.name}</Text>
                    ) : null}

                    {selected.cell.photoProof?.storageKey ? (
                      <ActionBtn icon={Camera} tone="neutral" label="View delivery proof" onPress={() => openProof(selected.cell)} />
                    ) : null}

                    <View style={styles.ledgerBox}>
                      <StatementRow label="Paid in month" value={money(selected.row.totalCollectedPaise)} />
                      <StatementRow label="Outstanding due" value={money(selected.row.totalDuePaise)} danger={Number(selected.row.totalDuePaise || 0) > 0} />
                    </View>
                  </View>
                ) : null}

                {tab === 'addon' ? (
                  <View style={styles.tabBody}>
                    <Text style={styles.sectionLabel}>Unit mode</Text>
                    <View style={styles.modeRow}>
                      {(['weight', 'count', 'volume', 'custom'] as const).map((m) => (
                        <TouchableOpacity
                          key={m}
                          style={[styles.modeBtn, addonMode === m && styles.modeBtnActive]}
                          onPress={() => {
                            setAddonMode(m);
                            const preset = ADDON_PRESETS[m][0];
                            if (preset) setAddonQty(preset.qty);
                          }}
                        >
                          <Text style={[styles.modeText, addonMode === m && styles.modeTextActive]}>
                            {m === 'weight' ? 'Grams/Kg' : m === 'count' ? 'Bowls/Pk' : m === 'volume' ? 'Liters/ml' : 'Custom'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {addonMode === 'custom' ? (
                      <TextInput style={styles.input} placeholder="e.g. Mixed Fruit Bowl" placeholderTextColor="#94A3B8" value={addonCustom} onChangeText={setAddonCustom} />
                    ) : (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
                        {ADDON_PRESETS[addonMode].map((p) => (
                          <Chip key={p.qty} active={addonQty === p.qty} onPress={() => setAddonQty(p.qty)} label={p.label} />
                        ))}
                      </ScrollView>
                    )}

                    <Text style={styles.sectionLabel}>Unit price (₹) · optional</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Leave blank to use the store default"
                      placeholderTextColor="#94A3B8"
                      keyboardType="decimal-pad"
                      value={addonPricePaise != null ? String(addonPricePaise / 100) : ''}
                      onChangeText={(t) => setAddonPricePaise(t ? Math.round(Number(t) * 100) : null)}
                    />

                    <Text style={styles.sectionLabel}>Consecutive days</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
                      {DURATIONS.map((d) => (
                        <Chip key={d.value} active={addonDays === d.value} onPress={() => setAddonDays(d.value)} label={d.label} />
                      ))}
                    </ScrollView>

                    <Text style={styles.sectionLabel}>Shift target</Text>
                    <View style={styles.modeRow}>
                      <TouchableOpacity style={[styles.modeBtn, addonSlot === 'PM' && styles.modeBtnActive]} onPress={() => setAddonSlot('PM')}>
                        <Text style={[styles.modeText, addonSlot === 'PM' && styles.modeTextActive]}>PM (Evening)</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.modeBtn, addonSlot === 'AM' && styles.modeBtnActive]} onPress={() => setAddonSlot('AM')}>
                        <Text style={[styles.modeText, addonSlot === 'AM' && styles.modeTextActive]}>AM (Morning)</Text>
                      </TouchableOpacity>
                    </View>

                    <ActionBtn icon={Package} tone="primary" label={`Attach ${addonDays} day(s) ${addonSlot} delivery`} onPress={() => submitAddon(true)} disabled={quickAction.isPending} />
                    <ActionBtn icon={Plus} tone="neutral" label="Add as single-day extra (today)" onPress={() => submitAddon(false)} disabled={quickAction.isPending} />
                  </View>
                ) : null}

                {tab === 'payment' ? (
                  <View style={styles.tabBody}>
                    <StatementRow label="Collected this day" value={money(selected.cell.cashCollectedPaise)} />
                    <StatementRow label="Outstanding due" value={money(selected.row.totalDuePaise)} danger={dueBadge > 0} />

                    <Text style={styles.sectionLabel}>Record subscriber payment</Text>
                    <View style={styles.presetRow}>
                      {[8000, 16000, 50000, 100000].map((p) => (
                        <Chip key={p} active={false} onPress={() => setPaymentAmount(String(p / 100))} label={money(p)} />
                      ))}
                    </View>
                    <TextInput
                      style={styles.input}
                      placeholder="Amount ₹"
                      placeholderTextColor="#94A3B8"
                      keyboardType={'decimal-pad' as KeyboardTypeOptions}
                      value={paymentAmount}
                      onChangeText={setPaymentAmount}
                    />
                    <View style={styles.modeRow}>
                      <TouchableOpacity style={[styles.modeBtn, paymentMode === 'CASH' && styles.modeBtnActive]} onPress={() => setPaymentMode('CASH')}>
                        <Text style={[styles.modeText, paymentMode === 'CASH' && styles.modeTextActive]}>Cash in hand</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.modeBtn, paymentMode === 'PHONE_PE' && styles.modeBtnActive]} onPress={() => setPaymentMode('PHONE_PE')}>
                        <Text style={[styles.modeText, paymentMode === 'PHONE_PE' && styles.modeTextActive]}>PhonePe / UPI</Text>
                      </TouchableOpacity>
                    </View>
                    <ActionBtn icon={IndianRupee} tone="primary" label="Record payment" onPress={submitPayment} disabled={quickAction.isPending} />

                    {Number(selected.cell.cashCollectedPaise || 0) > 0 ? (
                      <ActionBtn icon={Ban} tone="danger" label="Void this day's payment" onPress={confirmVoid} disabled={quickAction.isPending} />
                    ) : null}

                    <View style={styles.ledgerBox}>
                      <Text style={styles.sectionLabel}>Next cycle</Text>
                      <Text style={styles.hintLine}>Extend 30 daily deliveries on the same plan.</Text>
                      <ActionBtn icon={RotateCcw} tone="neutral" label="Renew 30 days" onPress={confirmRenew} disabled={quickAction.isPending} />
                    </View>
                  </View>
                ) : null}

                {!canActOnCell ? <Text style={styles.hintLine}>No scheduled delivery record for this date.</Text> : null}
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* ---- Monthly bill / statement ---- */}
      <Modal visible={!!statement} transparent animationType="slide" onRequestClose={() => setStatement(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + 18 }]}>
            <View style={styles.modalTop}>
              <Share2 size={20} color={PAGE} />
              <Text style={[styles.modalName, styles.flex]}>Monthly bill</Text>
              <TouchableOpacity onPress={() => setStatement(null)} style={styles.modalClose} accessibilityLabel="Close statement">
                <X size={18} color="#64748B" />
              </TouchableOpacity>
            </View>
            {statement ? (
              <>
                <StatementRow label="Customer" value={statement.customerName || '—'} />
                <StatementRow label="Plan" value={statement.planName || '—'} />
                <StatementRow label="Deliveries" value={`${statement.completedCount} delivered · ${statement.skippedCount} skipped`} />
                {statement.extraLiters > 0 ? <StatementRow label="Extra milk" value={`${statement.extraLiters} L`} /> : null}
                <StatementRow label="Total paid" value={`₹${Number(statement.totalPaidRupees || 0).toFixed(2)}`} />
                <StatementRow label="Balance due" value={`₹${Number(statement.totalDueRupees || 0).toFixed(2)}`} danger={Number(statement.totalDueRupees || 0) > 0} />
                <View style={styles.whatsappBox}>
                  <Text style={styles.whatsappText}>{statement.whatsappText}</Text>
                </View>
                <View style={styles.statementActions}>
                  <ActionBtn
                    icon={Copy}
                    tone="neutral"
                    label="Copy text"
                    onPress={async () => {
                      await Share.share({ message: statement.whatsappText });
                    }}
                  />
                  {statement.whatsappUrl ? (
                    <ActionBtn
                      icon={Send}
                      tone="success"
                      label="Send on WhatsApp"
                      onPress={async () => {
                        await Share.share({ message: statement.whatsappText, url: statement.whatsappUrl });
                      }}
                    />
                  ) : null}
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* ---- Morning pack summary ---- */}
      <Modal visible={!!dispatchSummary} transparent animationType="slide" onRequestClose={() => setDispatchSummary(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + 18 }]}>
            <View style={styles.modalTop}>
              <Truck size={20} color="#B45309" />
              <Text style={[styles.modalName, styles.flex]}>Morning packing & dispatch</Text>
              <TouchableOpacity onPress={() => setDispatchSummary(null)} style={styles.modalClose} accessibilityLabel="Close pack summary">
                <X size={18} color="#64748B" />
              </TouchableOpacity>
            </View>
            {dispatchSummary?.summary ? (
              <>
                <View style={styles.metricRow}>
                  <ModalMetric icon={Droplet} label="Buffalo (BM)" value={`${dispatchSummary.summary.totalBuffaloMilkLiters}L`} />
                  <ModalMetric icon={Droplet} label="Cow (CM)" value={`${dispatchSummary.summary.totalCowMilkLiters}L`} />
                  <ModalMetric icon={Package} label="Total" value={`${dispatchSummary.summary.totalMilkLiters}L`} />
                </View>
                <Text style={styles.sectionLabel}>
                  Route stops ({dispatchSummary.summary.totalStops}) · completed {dispatchSummary.summary.completedStops}
                </Text>
                <ScrollView style={{ maxHeight: 320 }}>
                  {(dispatchSummary.stops || []).map((s: any) => (
                    <View key={s.deliveryId} style={styles.packRow}>
                      <Text style={styles.packStop}>#{s.stopNumber} · {s.customerName}</Text>
                      <Text style={styles.packMeta}>{s.product}{s.extra ? ` ${s.extra}` : ''} · {s.slot} · {statusVisual(s.status).label}</Text>
                    </View>
                  ))}
                </ScrollView>
              </>
            ) : (
              <ActivityIndicator color={PAGE} />
            )}
          </View>
        </View>
      </Modal>

      {/* ---- Delivery proof ---- */}
      <Modal visible={!!proof} transparent animationType="slide" onRequestClose={() => setProof(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + 18 }]}>
            <View style={styles.modalTop}>
              <Camera size={20} color={PAGE} />
              <Text style={[styles.modalName, styles.flex]}>Proof of delivery</Text>
              <TouchableOpacity onPress={() => setProof(null)} style={styles.modalClose} accessibilityLabel="Close proof">
                <X size={18} color="#64748B" />
              </TouchableOpacity>
            </View>
            {proof?.url ? <Image source={{ uri: proof.url }} style={styles.proofImage} resizeMode="cover" /> : null}
            {proof?.cell?.photoProof?.capturedAt ? (
              <StatementRow label="Captured" value={new Date(proof.cell.photoProof.capturedAt).toLocaleString('en-IN')} />
            ) : null}
            {proof?.cell?.photoProof?.gpsLat != null ? (
              <StatementRow label="GPS" value={`${Number(proof.cell.photoProof.gpsLat).toFixed(5)}, ${Number(proof.cell.photoProof.gpsLng).toFixed(5)}`} />
            ) : null}
            {proof?.cell?.photoProof?.accuracyMetres != null ? (
              <StatementRow label="Accuracy" value={`±${proof.cell.photoProof.accuracyMetres} m`} />
            ) : null}
            <StatementRow label="Cash collected" value={money(proof?.cell?.cashCollectedPaise)} />
          </View>
        </View>
      </Modal>
    </View>
  );
};

function SummaryStat({ icon: Icon, label, value, tone }: { icon: any; label: string; value: string; tone?: string }) {
  return (
    <View style={styles.summaryStat}>
      <Icon size={13} color={tone || PAGE} />
      <Text style={[styles.summaryValue, tone && { color: tone }]} numberOfLines={1}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function ModalMetric({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={styles.modalMetric}>
      <Icon size={14} color={PAGE} />
      <Text style={styles.modalMetricValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.modalMetricLabel}>{label}</Text>
    </View>
  );
}

function Chip({ active, onPress, label, icon: Icon }: { active: boolean; onPress: () => void; label: string; icon?: any }) {
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      {Icon ? <Icon size={12} color={active ? '#FFFFFF' : '#475569'} /> : null}
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function TabBtn({ active, onPress, label }: { active: boolean; onPress: () => void; label: string }) {
  return (
    <TouchableOpacity style={[styles.tabBtn, active && styles.tabBtnActive]} onPress={onPress}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ActionBtn({ icon: Icon, label, onPress, tone, disabled }: { icon: any; label: string; onPress: () => void; tone: 'primary' | 'success' | 'warn' | 'danger' | 'neutral'; disabled?: boolean }) {
  const tones: Record<string, { bg: string; fg: string }> = {
    primary: { bg: '#0F766E', fg: '#FFFFFF' },
    success: { bg: '#D1FAE5', fg: '#065F46' },
    warn: { bg: '#FEF3C7', fg: '#92400E' },
    danger: { bg: '#FEE2E2', fg: '#991B1B' },
    neutral: { bg: '#F1F5F9', fg: '#334155' },
  };
  const t = tones[tone];
  return (
    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: t.bg }, disabled && styles.disabled]} onPress={onPress} disabled={disabled}>
      <Icon size={16} color={t.fg} />
      <Text style={[styles.actionText, { color: t.fg }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  flex: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: '#A7F3D0', fontSize: 9, fontWeight: '600', letterSpacing: 1 },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '600', marginTop: 2 },
  disabled: { opacity: 0.5 },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  navBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#F0FDFA', alignItems: 'center', justifyContent: 'center' },
  monthCenter: { alignItems: 'center' },
  monthLabel: { fontSize: 16, fontWeight: '600', color: '#0F172A' },
  monthHint: { fontSize: 10, color: PAGE, marginTop: 1 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFFFF', marginHorizontal: 16, marginTop: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  searchInput: { flex: 1, paddingVertical: 9, color: '#0F172A', fontSize: 13 },
  chipScroll: { gap: 8, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F1F5F9' },
  chipActive: { backgroundColor: PAGE },
  chipText: { fontSize: 12, color: '#475569', fontWeight: '500' },
  chipTextActive: { color: '#FFFFFF' },
  chipDivider: { width: 1, height: 20, backgroundColor: '#E2E8F0' },
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
  billCell: { width: 40, height: 46, alignItems: 'center', justifyContent: 'center' },
  todayHeader: { backgroundColor: '#CCFBF1' },
  todayText: { color: PAGE, fontWeight: '600' },
  dayText: { fontSize: 11, fontWeight: '500', color: '#64748B' },
  cellLitres: { fontSize: 8, fontWeight: '600', marginTop: 1 },
  gridBody: { flex: 1 },
  gridRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  gridRowEven: { backgroundColor: '#FAFBFC' },
  customerName: { color: '#0F172A', fontSize: 11, fontWeight: '600' },
  riderLabel: { color: PAGE, fontSize: 9, marginTop: 2 },
  dueLabel: { color: '#B91C1C', fontSize: 9, marginTop: 1 },
  todayCell: { borderLeftWidth: 2, borderLeftColor: PAGE, borderRightWidth: 2, borderRightColor: PAGE },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 12, maxHeight: '92%' },
  modalTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  modalGlyph: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  modalName: { color: '#0F172A', fontSize: 17, fontWeight: '700' },
  modalSub: { color: '#64748B', fontSize: 12, marginTop: 2 },
  modalClose: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  tabRow: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 12, padding: 4, gap: 4 },
  tabBtn: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  tabBtnActive: { backgroundColor: '#FFFFFF' },
  tabText: { fontSize: 11, color: '#64748B', fontWeight: '600' },
  tabTextActive: { color: PAGE },
  tabBody: { gap: 10, paddingTop: 4 },
  metricRow: { flexDirection: 'row', gap: 8 },
  modalMetric: { flex: 1, alignItems: 'center', backgroundColor: '#F0FDFA', borderRadius: 12, paddingVertical: 9, gap: 2 },
  modalMetricValue: { color: '#0F172A', fontSize: 12, fontWeight: '700' },
  modalMetricLabel: { color: '#64748B', fontSize: 9 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12 },
  actionText: { fontSize: 13, fontWeight: '600' },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#334155', marginTop: 4 },
  hintLine: { fontSize: 11, color: '#64748B' },
  ledgerBox: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, gap: 4 },
  sRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  sLabel: { color: '#64748B', fontSize: 12 },
  sValue: { color: '#0F172A', fontSize: 13, fontWeight: '600' },
  modeRow: { flexDirection: 'row', gap: 8 },
  modeBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: '#F1F5F9', alignItems: 'center' },
  modeBtnActive: { backgroundColor: '#CCFBF1' },
  modeText: { fontSize: 12, color: '#475569', fontWeight: '600' },
  modeTextActive: { color: PAGE },
  input: { backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: '#0F172A' },
  presetRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  whatsappBox: { backgroundColor: '#F0FDF4', borderRadius: 12, padding: 12, marginTop: 4 },
  whatsappText: { fontSize: 11, color: '#166534', lineHeight: 17 },
  statementActions: { gap: 8, marginTop: 4 },
  packRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  packStop: { color: '#0F172A', fontSize: 13, fontWeight: '600' },
  packMeta: { color: '#64748B', fontSize: 11, marginTop: 2 },
  proofImage: { width: '100%', height: 220, borderRadius: 14, backgroundColor: '#E2E8F0' },
});
