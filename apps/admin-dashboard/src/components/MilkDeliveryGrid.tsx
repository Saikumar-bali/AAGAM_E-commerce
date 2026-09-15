'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { apiClient } from '@aagam/utils';
import {
  Check,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Milk,
  Moon,
  Phone,
  RefreshCw,
  Search,
  Share2,
  Sun,
  Truck,
  X,
  Zap,
  Smartphone,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  Send,
  Copy,
  ArrowUpDown,
  Sparkles,
  CheckCheck,
} from 'lucide-react';
import { useToast } from '@/components/ToastProvider';

interface GridCell {
  deliveryId: string;
  sequenceNumber: number;
  status: string;
  deliverySlot: string;
  baseQuantity: string;
  extraMilk: string | null;
  cashCollectedPaise: number;
  cashDuePaise: number;
  paymentMode: 'CASH' | 'PHONE_PE' | 'DUE' | null;
  note: string | null;
}

interface GridRow {
  subscriptionId: string;
  customer: {
    id: string;
    name: string;
    phone: string;
    address: string;
  };
  plan: {
    id: string;
    name: string;
    code: string;
    dailyQuantity: string;
  };
  slot: string;
  days: Record<number, GridCell | null>;
  totalDeliveredDays: number;
  totalExtraLiters: number;
  totalLiters: number;
  totalCollectedPaise: number;
  totalDuePaise: number;
}

interface GridData {
  year: number;
  month: number;
  daysInMonth: number;
  totalSubscribers: number;
  rows: GridRow[];
  dailyTotals: Record<number, { deliveredCount: number; scheduledCount: number; totalLiters: number; cashCollectedPaise: number }>;
}

export default function MilkDeliveryGrid({ onReload }: { onReload?: () => void }) {
  const toast = useToast();
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth()); // 0-indexed
  const [gridData, setGridData] = useState<GridData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [slotFilter, setSlotFilter] = useState<'ALL' | 'AM' | 'PM'>('ALL');
  const [dueFilter, setDueFilter] = useState<'ALL' | 'DUE'>('ALL');
  const [viewMode, setViewMode] = useState<'grid' | 'cards'>('grid');
  const [mobileSortMode, setMobileSortMode] = useState<'pending-first' | 'sequence'>('pending-first');
  const [hideCompletedOnMobile, setHideCompletedOnMobile] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Modal / Popover States
  const [selectedCell, setSelectedCell] = useState<{ row: GridRow; day: number; cell: GridCell | null } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [dispatchModalOpen, setDispatchModalOpen] = useState(false);
  const [dispatchData, setDispatchData] = useState<any>(null);
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [statementModalOpen, setStatementModalOpen] = useState(false);
  const [statementData, setStatementData] = useState<any>(null);
  const [statementLoading, setStatementLoading] = useState(false);

  // Custom action inputs
  const [extraQuantity, setExtraQuantity] = useState('+1L BM');
  const [consecutiveDays, setConsecutiveDays] = useState(4);
  const [paymentAmount, setPaymentAmount] = useState('80');
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'PHONE_PE'>('CASH');

  const isCurrentMonth = today.getFullYear() === currentYear && today.getMonth() === currentMonth;
  const currentDayNum = today.getDate();

  // Detect mobile screen on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setViewMode('cards');
    }
  }, []);

  const loadGrid = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/store/subscriptions/grid', {
        params: { year: currentYear, month: currentMonth },
      });
      setGridData(res.data);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to load milk grid data');
    } finally {
      setLoading(false);
    }
  }, [currentYear, currentMonth, toast]);

  useEffect(() => {
    void loadGrid();
  }, [loadGrid]);

  // Jump / auto-scroll to today's date column
  const jumpToToday = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const todayCol = document.getElementById('grid-col-today');
    if (todayCol) {
      const container = scrollContainerRef.current;
      const colLeft = todayCol.offsetLeft;
      const frozenOffset = 296; // width of frozen columns
      const targetScroll = colLeft - frozenOffset - (container.clientWidth - frozenOffset) / 3;
      container.scrollTo({
        left: Math.max(0, targetScroll),
        behavior: 'smooth',
      });
    }
  }, []);

  // Automatically scroll to today once grid finishes loading
  useEffect(() => {
    if (!loading && gridData && isCurrentMonth && viewMode === 'grid') {
      const timer = setTimeout(jumpToToday, 300);
      return () => clearTimeout(timer);
    }
  }, [loading, gridData, isCurrentMonth, viewMode, jumpToToday]);

  const changeMonth = (delta: number) => {
    let nextMonth = currentMonth + delta;
    let nextYear = currentYear;
    if (nextMonth < 0) {
      nextMonth = 11;
      nextYear--;
    } else if (nextMonth > 11) {
      nextMonth = 0;
      nextYear++;
    }
    setCurrentMonth(nextMonth);
    setCurrentYear(nextYear);
  };

  // Cell quick action
  const handleQuickAction = async (
    deliveryId: string,
    actionType: 'TOGGLE_DELIVERED' | 'SKIP' | 'EXTRA_MILK' | 'TOGGLE_SLOT' | 'RECORD_PAYMENT' | 'ATTACH_EVENING_MILK',
    options?: { extraQuantity?: string; amountPaise?: number; extraPaise?: number; paymentMode?: 'CASH' | 'PHONE_PE'; note?: string; consecutiveDays?: number; targetSlot?: 'AM' | 'PM' },
  ) => {
    setActionLoading(true);
    try {
      const res = await apiClient.post(`/store/subscriptions/deliveries/${deliveryId}/quick-action`, {
        type: actionType,
        ...options,
      });
      toast.success(
        actionType === 'ATTACH_EVENING_MILK'
          ? (res.data?.message || 'Attached evening buffalo milk successfully!')
          : actionType === 'TOGGLE_DELIVERED'
          ? 'Delivery status updated!'
          : actionType === 'EXTRA_MILK'
          ? 'Extra milk added!'
          : actionType === 'SKIP'
          ? 'Delivery marked as skipped!'
          : actionType === 'TOGGLE_SLOT'
          ? 'Shift toggled!'
          : 'Payment recorded!',
      );
      setSelectedCell(null);
      await loadGrid();
      if (onReload) onReload();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Quick action failed');
    } finally {
      setActionLoading(false);
    }
  };

  // Export to Google Sheets CSV
  const handleExportCsv = async () => {
    try {
      toast.info('Downloading Google Sheets compatible CSV...');
      const res = await apiClient.get('/store/subscriptions/grid/export-csv', {
        params: { year: currentYear, month: currentMonth },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Aagam_Milk_Delivery_Bowluwada_${currentYear}_${currentMonth + 1}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('CSV downloaded! You can open directly in Google Sheets or Excel.');
    } catch (err) {
      toast.error('Failed to export CSV');
    }
  };

  // Open Dispatch Summary
  const openDispatchSummary = async () => {
    setDispatchModalOpen(true);
    setDispatchLoading(true);
    try {
      const res = await apiClient.get('/store/subscriptions/dispatch-summary');
      setDispatchData(res.data);
    } catch {
      toast.error('Could not load dispatch summary');
    } finally {
      setDispatchLoading(false);
    }
  };

  // Open Customer Statement
  const openStatement = async (subscriptionId: string) => {
    setStatementModalOpen(true);
    setStatementLoading(true);
    try {
      const res = await apiClient.get(`/store/subscriptions/customer/${subscriptionId}/statement`);
      setStatementData(res.data);
    } catch {
      toast.error('Could not load statement');
    } finally {
      setStatementLoading(false);
    }
  };

  // Filtered rows
  const filteredRows = useMemo(() => {
    if (!gridData?.rows) return [];
    return gridData.rows.filter((r) => {
      const matchesSearch =
        search === '' ||
        r.customer.name.toLowerCase().includes(search.toLowerCase()) ||
        r.customer.phone.includes(search) ||
        r.customer.address.toLowerCase().includes(search.toLowerCase()) ||
        r.plan.name.toLowerCase().includes(search.toLowerCase());
      const matchesSlot = slotFilter === 'ALL' || r.slot === slotFilter;
      const matchesDue = dueFilter === 'ALL' || r.totalDuePaise > 0;
      return matchesSearch && matchesSlot && matchesDue;
    });
  }, [gridData, search, slotFilter, dueFilter]);

  const monthLabel = new Date(currentYear, currentMonth, 1).toLocaleString('en-IN', {
    month: 'long',
    year: 'numeric',
  });

  // Calculate stats for today's route
  const todayStats = useMemo(() => {
    if (!gridData?.rows) return { totalStops: 0, deliveredStops: 0, pendingStops: 0, totalLiters: 0, cashCollected: 0 };
    let delivered = 0;
    let pending = 0;
    let liters = 0;
    let cash = 0;
    let stops = 0;

    gridData.rows.forEach((r) => {
      const c = r.days[currentDayNum];
      if (c) {
        stops++;
        if (c.status === 'DELIVERED') delivered++;
        else if (c.status === 'SCHEDULED') pending++;
        cash += c.cashCollectedPaise;
        const qty = parseFloat(c.extraMilk || c.baseQuantity) || 1;
        liters += qty;
      }
    });

    return { totalStops: stops, deliveredStops: delivered, pendingStops: pending, totalLiters: liters, cashCollected: cash };
  }, [gridData, currentDayNum]);

  // Split into pending deliveries (active route) and completed deliveries (done today)
  const mobileRouteData = useMemo(() => {
    const pending: Array<{ row: GridRow; originalIndex: number }> = [];
    const completed: Array<{ row: GridRow; originalIndex: number }> = [];

    filteredRows.forEach((row, idx) => {
      const cell = row.days[currentDayNum];
      const isDelivered = cell?.status === 'DELIVERED';
      const isSkipped = cell?.status === 'SKIPPED';

      if (isDelivered || isSkipped) {
        completed.push({ row, originalIndex: idx });
      } else {
        pending.push({ row, originalIndex: idx });
      }
    });

    return {
      pending,
      completed,
    };
  }, [filteredRows, currentDayNum]);

  // Render individual delivery card
  const renderDeliveryCard = (row: GridRow, displayIndex: number, originalIndex: number, isPending: boolean) => {
    const cell = row.days[currentDayNum];
    const isDelivered = cell?.status === 'DELIVERED';
    const isSkipped = cell?.status === 'SKIPPED';
    const hasExtra = !!cell?.extraMilk;
    const hasCash = cell && cell.cashCollectedPaise > 0;

    return (
      <div
        key={row.subscriptionId}
        className={`rounded-2xl border p-4 transition-all shadow-xs ${
          isDelivered
            ? 'border-emerald-200 bg-emerald-50/40 text-slate-700'
            : isSkipped
            ? 'border-red-200 bg-red-50/40 opacity-75'
            : 'border-slate-200 bg-white hover:border-emerald-400 hover:shadow-sm ring-1 ring-slate-100'
        }`}
      >
        {/* Card Top: Stop Index, Customer, Plan, Slot */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`flex h-5.5 min-w-5.5 px-1.5 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${
                  isDelivered
                    ? 'bg-emerald-100 text-emerald-800'
                    : isPending
                    ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-300'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {isDelivered ? '✓' : `#${displayIndex + 1}`}
              </span>
              <h4 className="font-black text-slate-900 text-sm">{row.customer.name}</h4>
              {isPending && mobileSortMode === 'pending-first' && (
                <span className="rounded bg-slate-100 px-1 py-0.5 text-[9px] font-bold text-slate-500">
                  Seq #{originalIndex + 1}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">{row.customer.address}</p>
          </div>

          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="inline-block rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-800">
              {row.plan.dailyQuantity}
            </span>
            <span
              className={`inline-flex items-center justify-center h-4.5 px-1.5 rounded text-[9px] font-black ${
                row.slot === 'AM' ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-800'
              }`}
            >
              {row.slot}
            </span>
          </div>
        </div>

        {/* Phone with 1-tap call button */}
        <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
          <a
            href={`tel:${row.customer.phone}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 font-bold text-slate-700 hover:bg-slate-200 transition-colors"
          >
            <Phone className="h-3 w-3 text-emerald-600" />
            <span>{row.customer.phone}</span>
          </a>

          {/* Delivery Status Badge */}
          <div>
            {isDelivered ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-0.5 text-[11px] font-black text-white shadow-2xs">
                <Check className="h-3 w-3 stroke-[3]" />
                Delivered {hasExtra ? `(${cell?.extraMilk})` : ''}
              </span>
            ) : isSkipped ? (
              <span className="rounded-md bg-red-100 px-2 py-0.5 text-[11px] font-black text-red-700 line-through">
                Skipped
              </span>
            ) : (
              <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-black text-amber-800">
                Pending Next
              </span>
            )}
          </div>
        </div>

        {/* Payment Info */}
        {hasCash && (
          <div className="mt-2 rounded-lg bg-emerald-100/60 px-2.5 py-1 text-[11px] font-bold text-emerald-800 flex justify-between items-center">
            <span>Collected Today:</span>
            <span className="font-black">₹{cell!.cashCollectedPaise / 100} ({cell!.paymentMode || 'CASH'})</span>
          </div>
        )}

        {/* 1-Tap Fast Delivery Actions */}
        {cell && (
          <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-2.5">
            {!isDelivered ? (
              <button
                disabled={actionLoading}
                onClick={() => handleQuickAction(cell.deliveryId, 'TOGGLE_DELIVERED')}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2 text-xs font-black text-white hover:bg-emerald-700 active:scale-98 transition-all shadow-xs"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>Mark Delivered</span>
              </button>
            ) : (
              <button
                disabled={actionLoading}
                onClick={() => handleQuickAction(cell.deliveryId, 'TOGGLE_DELIVERED')}
                className="flex-1 rounded-xl bg-slate-100 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors"
              >
                Undo
              </button>
            )}

            <button
              onClick={() => setSelectedCell({ row, day: currentDayNum, cell })}
              className="rounded-xl border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs font-black text-amber-900 hover:bg-amber-100 transition-colors"
              title="Add extra milk, change shift or record payment"
            >
              + Extra / Pay
            </button>

            <button
              onClick={() => openStatement(row.subscriptionId)}
              className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-100 transition-colors"
              title="Monthly Bill WhatsApp"
            >
              <Share2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4 font-sans">
      {/* Control & Navigation Bar */}
      <div className="flex flex-col gap-2.5 rounded-2xl border border-slate-200 bg-white p-3 md:p-4 shadow-xs">
        {/* Row 1: View Switcher, Month Navigation & Quick Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Left Controls: View Mode & Month Navigation */}
          <div className="flex flex-wrap items-center gap-1.5">
            {/* View Mode Switcher */}
            <div className="flex rounded-xl border border-slate-200 p-0.5 bg-slate-50 text-xs font-black shrink-0">
              <button
                onClick={() => setViewMode('cards')}
                className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-all ${
                  viewMode === 'cards'
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Smartphone className="h-3 w-3" />
                <span>Today&apos;s Route</span>
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-all ${
                  viewMode === 'grid'
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <LayoutGrid className="h-3 w-3" />
                <span>31-Day Matrix</span>
              </button>
            </div>

            {/* Month Switcher */}
            <div className="flex items-center gap-0.5 rounded-xl border border-slate-200 bg-slate-50 p-0.5 shrink-0">
              <button
                onClick={() => changeMonth(-1)}
                className="rounded-lg p-1 font-bold text-slate-600 hover:bg-white hover:shadow-xs transition-colors"
                title="Previous Month"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-24 text-center text-xs font-black text-slate-800">{monthLabel}</span>
              <button
                onClick={() => changeMonth(1)}
                className="rounded-lg p-1 font-bold text-slate-600 hover:bg-white hover:shadow-xs transition-colors"
                title="Next Month"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Jump to Today Button */}
            {isCurrentMonth && viewMode === 'grid' && (
              <button
                onClick={jumpToToday}
                className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-2 py-1 text-xs font-black text-white shadow-xs hover:bg-emerald-700 active:scale-95 transition-all shrink-0"
                title="Scroll instantly to today's date column"
              >
                <Zap className="h-3 w-3 fill-amber-300 text-amber-300" />
                <span>Today ({currentDayNum})</span>
              </button>
            )}
          </div>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={openDispatchSummary}
              className="inline-flex items-center gap-1 rounded-xl bg-amber-400 px-2.5 py-1 text-xs font-black text-slate-900 shadow-xs hover:bg-amber-300 transition-all"
            >
              <Truck className="h-3.5 w-3.5" />
              <span>Pack Summary</span>
            </button>

            <button
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1 rounded-xl bg-emerald-700 px-2.5 py-1 text-xs font-black text-white shadow-xs hover:bg-emerald-800 transition-all"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span>Export Sheets</span>
            </button>

            <button
              onClick={() => void loadGrid()}
              className="inline-flex items-center rounded-xl border border-slate-200 bg-white p-1 text-slate-600 hover:bg-slate-50 transition-colors"
              title="Refresh Grid"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
            </button>
          </div>
        </div>

        {/* Row 2: Search, Filters & Route Sort Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
          <div className="flex flex-1 flex-wrap items-center gap-2 min-w-48">
            {/* Search Box */}
            <div className="relative min-w-48 flex-1 md:max-w-xs">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search customer, phone, locality..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8.5 w-full rounded-xl border border-slate-200 pl-8.5 pr-3 text-xs outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            {/* Route Slot Filter */}
            <div className="flex rounded-xl border border-slate-200 p-0.5 bg-slate-50 text-[11px] font-bold">
              <button
                onClick={() => setSlotFilter('ALL')}
                className={`rounded-lg px-2 py-1 ${slotFilter === 'ALL' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-500'}`}
              >
                All
              </button>
              <button
                onClick={() => setSlotFilter('AM')}
                className={`flex items-center gap-1 rounded-lg px-2 py-1 ${slotFilter === 'AM' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-500'}`}
              >
                <Sun className="h-3 w-3 text-amber-500" /> AM
              </button>
              <button
                onClick={() => setSlotFilter('PM')}
                className={`flex items-center gap-1 rounded-lg px-2 py-1 ${slotFilter === 'PM' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-500'}`}
              >
                <Moon className="h-3 w-3 text-indigo-500" /> PM
              </button>
            </div>

            {/* Due Filter */}
            <button
              onClick={() => setDueFilter(dueFilter === 'ALL' ? 'DUE' : 'ALL')}
              className={`rounded-xl px-2.5 py-1 text-xs font-bold transition-all border ${
                dueFilter === 'DUE' ? 'border-red-300 bg-red-50 text-red-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {dueFilter === 'DUE' ? '⚠️ Only Dues' : 'Filter Dues'}
            </button>
          </div>

          {/* Route Card Sorting Controls (only visible in cards view) */}
          {viewMode === 'cards' && (
            <div className="flex items-center gap-1.5 text-xs font-bold">
              <div className="flex rounded-xl border border-slate-200 p-0.5 bg-slate-50 text-[11px]">
                <button
                  onClick={() => setMobileSortMode('pending-first')}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1 ${
                    mobileSortMode === 'pending-first' ? 'bg-white text-emerald-800 shadow-xs font-black' : 'text-slate-500'
                  }`}
                  title="Next deliveries on top, completed pushed to bottom"
                >
                  <Zap className="h-3 w-3 text-amber-500" />
                  <span>Pending First</span>
                </button>
                <button
                  onClick={() => setMobileSortMode('sequence')}
                  className={`rounded-lg px-2.5 py-1 ${
                    mobileSortMode === 'sequence' ? 'bg-white text-emerald-800 shadow-xs font-black' : 'text-slate-500'
                  }`}
                  title="Keep stops in original sequence 1..N"
                >
                  # Sequence
                </button>
              </div>

              {todayStats.deliveredStops > 0 && (
                <button
                  onClick={() => setHideCompletedOnMobile(!hideCompletedOnMobile)}
                  className={`rounded-xl px-2.5 py-1 text-[11px] font-bold border transition-colors ${
                    hideCompletedOnMobile
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {hideCompletedOnMobile ? 'Show Done' : `Hide Done (${todayStats.deliveredStops})`}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          <p className="mt-3 text-sm font-bold text-slate-700">Loading milk delivery data...</p>
          <p className="text-xs text-slate-400">Reconciling Bowluwada deliveries, extra liters, and cash flow</p>
        </div>
      ) : !gridData || filteredRows.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
          <Milk className="h-10 w-10 text-slate-300" />
          <h3 className="mt-2 text-base font-black text-slate-800">No subscriber records found</h3>
          <p className="text-xs text-slate-500">No active deliveries matched your current month or search filters.</p>
        </div>
      ) : viewMode === 'cards' ? (
        /* MOBILE-FIRST ROUTE CARDS VIEW WITH DYNAMIC PENDING-FIRST SORTING */
        <div className="space-y-4 pb-28">
          {/* Today's Route Progress Bar */}
          <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-500 to-teal-600 p-4 text-white shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-100">Today&apos;s Route Checklist</p>
                <h3 className="text-base font-black">
                  Day {currentDayNum} · {monthLabel}
                </h3>
              </div>
              <div className="flex items-center gap-3 text-right">
                <div>
                  <p className="text-[10px] font-bold uppercase text-emerald-100">Completed</p>
                  <p className="text-lg font-black">{todayStats.deliveredStops} / {todayStats.totalStops}</p>
                </div>
                <div className="border-l border-emerald-400/60 pl-3">
                  <p className="text-[10px] font-bold uppercase text-emerald-100">Total Pack</p>
                  <p className="text-lg font-black">{todayStats.totalLiters} L</p>
                </div>
              </div>
            </div>
            {/* Progress line */}
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-emerald-700/50">
              <div
                className="h-full bg-white transition-all duration-500 rounded-full"
                style={{
                  width: `${todayStats.totalStops > 0 ? (todayStats.deliveredStops / todayStats.totalStops) * 100 : 0}%`,
                }}
              />
            </div>
          </div>

          {/* Pending Deliveries Section (Next Stops) */}
          {mobileSortMode === 'pending-first' ? (
            <>
              {/* 1. Upcoming Pending Stops */}
              {mobileRouteData.pending.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <Truck className="h-4 w-4 text-amber-500" />
                      <span>Upcoming Deliveries ({mobileRouteData.pending.length} Stops Remaining)</span>
                    </h4>
                    <span className="text-[10px] font-bold text-slate-400">Next stop on top</span>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {mobileRouteData.pending.map((item, idx) =>
                      renderDeliveryCard(item.row, idx, item.originalIndex, true)
                    )}
                  </div>
                </div>
              )}

              {/* All Completed Celebration */}
              {mobileRouteData.pending.length === 0 && mobileRouteData.completed.length > 0 && (
                <div className="rounded-2xl border border-emerald-300 bg-emerald-50/90 p-5 text-center text-emerald-950 shadow-xs">
                  <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
                  <h4 className="mt-2 text-base font-black">All Deliveries Completed for Today!</h4>
                  <p className="text-xs text-emerald-800 mt-1">
                    Total {todayStats.deliveredStops} stops delivered · {todayStats.totalLiters}L milk distributed · ₹{todayStats.cashCollected / 100} cash collected.
                  </p>
                </div>
              )}

              {/* 2. Completed Stops (Sunk to Bottom) */}
              {mobileRouteData.completed.length > 0 && !hideCompletedOnMobile && (
                <div className="space-y-2 pt-2 border-t border-slate-200/80">
                  <div className="flex items-center justify-between px-1">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <CheckCheck className="h-4 w-4 text-emerald-600" />
                      <span>Delivered Today ({mobileRouteData.completed.length} Completed)</span>
                    </h4>
                    <button
                      onClick={() => setHideCompletedOnMobile(true)}
                      className="text-[10px] font-bold text-slate-400 hover:text-slate-600"
                    >
                      Hide Completed
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {mobileRouteData.completed.map((item, idx) =>
                      renderDeliveryCard(item.row, idx, item.originalIndex, false)
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Sequence Mode: All in original order */
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {filteredRows.map((row, index) => renderDeliveryCard(row, index, index, false))}
            </div>
          )}
        </div>
      ) : (
        /* FULL 31-DAY SPREADSHEET MATRIX VIEW */
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div ref={scrollContainerRef} className="overflow-x-auto max-h-[750px] scroll-smooth">
            <table className="w-full border-collapse text-left text-xs">
              {/* Table Header */}
              <thead className="sticky top-0 z-20 bg-slate-100 text-[11px] font-black text-slate-700 shadow-xs">
                <tr>
                  {/* Clean Frozen Column 1: Index */}
                  <th className="sticky left-0 z-30 min-w-10 max-w-10 w-10 bg-slate-100 px-1 py-3 text-center border-r border-b border-slate-200">
                    #
                  </th>

                  {/* Clean Frozen Column 2: Customer, Plan & Slot Combined */}
                  <th className="sticky left-10 z-30 min-w-64 max-w-64 w-64 bg-slate-100 px-3 py-3 border-r-2 border-b border-slate-300 shadow-xs text-left">
                    Customer, Plan & Slot
                  </th>

                  {/* Days 1 to 31 */}
                  {Array.from({ length: gridData.daysInMonth }, (_, i) => i + 1).map((day) => {
                    const dateObj = new Date(currentYear, currentMonth, day);
                    const dayName = dateObj.toLocaleDateString('en-IN', { weekday: 'narrow' });
                    const isToday = isCurrentMonth && day === currentDayNum;

                    return (
                      <th
                        key={day}
                        id={isToday ? 'grid-col-today' : undefined}
                        className={`min-w-[58px] max-w-[58px] px-1 py-2 text-center border-r border-b transition-all ${
                          isToday
                            ? 'bg-emerald-600 text-white ring-2 ring-emerald-500 border-emerald-500 shadow-sm z-20'
                            : 'border-slate-200 text-slate-700'
                        }`}
                      >
                        <span
                          className={`block text-[9px] uppercase tracking-wider font-extrabold ${
                            isToday ? 'text-emerald-100 font-black' : 'text-slate-400'
                          }`}
                        >
                          {isToday ? 'TODAY' : dayName}
                        </span>
                        <span className={`block font-black ${isToday ? 'text-sm text-white' : 'text-xs text-slate-800'}`}>
                          {day}
                        </span>
                      </th>
                    );
                  })}

                  {/* Summary Columns */}
                  <th className="min-w-20 bg-slate-100 px-2 py-3 text-center border-r border-b border-slate-200">Total L</th>
                  <th className="min-w-24 bg-slate-100 px-2 py-3 text-right border-r border-b border-slate-200">Paid</th>
                  <th className="min-w-24 bg-slate-100 px-2 py-3 text-right border-r border-b border-slate-200">Due</th>
                  <th className="min-w-16 bg-slate-100 px-2 py-3 text-center border-b border-slate-200">Bill</th>
                </tr>
              </thead>

              {/* Table Body */}
              <tbody className="divide-y divide-slate-200 text-xs">
                {filteredRows.map((row, rowIndex) => (
                  <tr key={row.subscriptionId} className="hover:bg-slate-50/80 transition-colors group">
                    {/* # Index Column */}
                    <td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50/90 px-1 py-2 text-center font-bold text-slate-400 border-r border-slate-200 min-w-10 max-w-10">
                      {rowIndex + 1}
                    </td>

                    {/* Customer Info, Plan & Slot Combined */}
                    <td className="sticky left-10 z-10 bg-white group-hover:bg-slate-50/90 px-3 py-2 border-r-2 border-slate-300 shadow-xs min-w-64 max-w-64">
                      <div className="flex items-center justify-between gap-1">
                        <div className="font-black text-slate-900 truncate max-w-[150px]">{row.customer.name}</div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="inline-block rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-black text-emerald-800 border border-emerald-200">
                            {row.plan.dailyQuantity}
                          </span>
                          <span
                            className={`inline-flex items-center justify-center h-4.5 px-1.5 rounded text-[9px] font-black ${
                              row.slot === 'AM' ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-800'
                            }`}
                          >
                            {row.slot}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-0.5">
                        <Phone className="h-2.5 w-2.5 text-slate-400 shrink-0" />
                        <span>{row.customer.phone}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 truncate max-w-[220px]">{row.customer.address}</div>
                    </td>

                    {/* Day Cells (1 to 31) */}
                    {Array.from({ length: gridData.daysInMonth }, (_, i) => i + 1).map((day) => {
                      const cell = row.days[day];
                      const isToday = isCurrentMonth && day === currentDayNum;

                      if (!cell) {
                        return (
                          <td
                            key={day}
                            className={`px-1 py-1 text-center border-r select-none ${
                              isToday
                                ? 'bg-emerald-50/50 border-x-2 border-emerald-400 text-slate-300'
                                : 'border-slate-200 text-slate-300'
                            }`}
                          >
                            —
                          </td>
                        );
                      }

                      const isDelivered = cell.status === 'DELIVERED';
                      const isSkipped = cell.status === 'SKIPPED';
                      const hasExtra = !!cell.extraMilk;
                      const hasCash = cell.cashCollectedPaise > 0;

                      return (
                        <td
                          key={day}
                          onClick={() => setSelectedCell({ row, day, cell })}
                          className={`min-w-[58px] max-w-[58px] px-1 py-1 text-center border-r cursor-pointer transition-all hover:ring-2 hover:ring-emerald-400 select-none ${
                            isToday
                              ? 'border-x-2 border-emerald-500/80 bg-emerald-50/90 hover:bg-emerald-100/90 ring-1 ring-inset ring-emerald-300'
                              : isDelivered
                              ? 'bg-emerald-50/40 hover:bg-emerald-100/60 border-slate-200'
                              : isSkipped
                              ? 'bg-red-50/40 hover:bg-red-100/50 border-slate-200'
                              : 'border-slate-200 hover:bg-slate-100'
                          }`}
                          title={`Day ${day}: ${cell.status}${hasExtra ? ` (${cell.extraMilk})` : ''}\nClick to change or add extra milk`}
                        >
                          <div className="flex flex-col items-center justify-center min-h-[38px] leading-tight">
                            {/* Delivery Status Badge */}
                            {isDelivered ? (
                              <span className="inline-flex items-center justify-center gap-0.5 rounded-md bg-emerald-600 px-1 py-0.5 text-[10px] font-black text-white shadow-2xs">
                                <Check className="h-3 w-3 stroke-[3]" />
                                {hasExtra ? cell.extraMilk : cell.baseQuantity}
                              </span>
                            ) : isSkipped ? (
                              <span className="text-[9px] font-black text-red-600 uppercase bg-red-100/80 px-1 rounded line-through">
                                Skip
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-slate-500">
                                {hasExtra ? <span className="text-amber-700 font-black">{cell.extraMilk}</span> : cell.baseQuantity}
                              </span>
                            )}

                            {/* Payment or Extra Badge */}
                            {hasCash ? (
                              <span
                                className={`mt-0.5 text-[8px] font-black rounded px-1 ${
                                  cell.paymentMode === 'PHONE_PE' ? 'bg-purple-100 text-purple-800' : 'bg-emerald-100 text-emerald-800'
                                }`}
                              >
                                ₹{(cell.cashCollectedPaise / 100).toFixed(0)}
                              </span>
                            ) : cell.cashDuePaise > 0 ? (
                              <span className="mt-0.5 text-[8px] font-black text-red-600 bg-red-50 rounded px-1">
                                Due
                              </span>
                            ) : null}
                          </div>
                        </td>
                      );
                    })}

                    {/* Totals Columns */}
                    <td className="px-2 py-2 text-center font-black text-slate-800 border-r border-slate-200">
                      {row.totalLiters}L
                    </td>
                    <td className="px-2 py-2 text-right font-black text-emerald-700 border-r border-slate-200">
                      ₹{(row.totalCollectedPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-2 py-2 text-right font-black text-red-600 border-r border-slate-200">
                      {row.totalDuePaise > 0 ? `₹${(row.totalDuePaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '₹0.00'}
                    </td>

                    {/* WhatsApp Statement Action */}
                    <td className="px-2 py-2 text-center">
                      <button
                        onClick={() => openStatement(row.subscriptionId)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        title="Generate Monthly Bill Statement"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>

              {/* Daily Totals Footer */}
              <tfoot className="sticky bottom-0 z-20 bg-slate-900 text-white font-black text-xs shadow-lg">
                <tr>
                  <td className="sticky left-0 z-30 bg-slate-900 px-1 py-2.5 text-center border-r border-slate-800">Σ</td>
                  <td className="sticky left-10 z-30 bg-slate-900 px-3 py-2.5 uppercase tracking-wide text-[10px] font-black text-white border-r-2 border-slate-700 shadow-xs">
                    Daily Total Liters
                  </td>

                  {Array.from({ length: gridData.daysInMonth }, (_, i) => i + 1).map((day) => {
                    const dt = gridData.dailyTotals[day];
                    const isToday = isCurrentMonth && day === currentDayNum;

                    return (
                      <td
                        key={day}
                        className={`px-1 py-2 text-center border-r ${
                          isToday
                            ? 'bg-emerald-600 text-white font-black ring-2 ring-inset ring-emerald-400 text-xs shadow-md'
                            : 'border-slate-800 text-slate-200 font-bold text-[10px] font-mono'
                        }`}
                      >
                        {dt && dt.totalLiters > 0 ? `${dt.totalLiters}L` : '—'}
                      </td>
                    );
                  })}

                  <td className="px-2 py-2.5 text-center border-r border-slate-800 text-amber-300">
                    {filteredRows.reduce((sum, r) => sum + r.totalLiters, 0)}L
                  </td>
                  <td className="px-2 py-2.5 text-right border-r border-slate-800 text-emerald-400">
                    ₹{(filteredRows.reduce((sum, r) => sum + r.totalCollectedPaise, 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-2 py-2.5 text-right border-r border-slate-800 text-red-400">
                    ₹{(filteredRows.reduce((sum, r) => sum + r.totalDuePaise, 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Cell Quick-Action Popover / Modal */}
      {selectedCell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="inline-block rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-800">
                  Day {selectedCell.day} · {monthLabel}
                </span>
                <h3 className="mt-1 text-base font-black text-slate-900">{selectedCell.row.customer.name}</h3>
                <p className="text-xs text-slate-500">{selectedCell.row.customer.address} · {selectedCell.row.plan.name}</p>
              </div>
              <button
                onClick={() => setSelectedCell(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {selectedCell.cell ? (
              <div className="space-y-3">
                {/* 1. Toggle Delivered / Undo */}
                <div className="rounded-xl border border-slate-200 p-3 bg-slate-50/70">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-black text-slate-800">Delivery Status</p>
                      <p className="text-[11px] text-slate-500">
                        Current:{' '}
                        <span className="font-bold text-emerald-700">{selectedCell.cell.status}</span>
                      </p>
                    </div>
                    <button
                      disabled={actionLoading}
                      onClick={() =>
                        handleQuickAction(selectedCell.cell!.deliveryId, 'TOGGLE_DELIVERED')
                      }
                      className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-black text-white shadow-xs ${
                        selectedCell.cell.status === 'DELIVERED'
                          ? 'bg-amber-600 hover:bg-amber-700'
                          : 'bg-emerald-700 hover:bg-emerald-800'
                      }`}
                    >
                      {selectedCell.cell.status === 'DELIVERED' ? 'Mark Scheduled (Undo)' : 'Mark Delivered ✓'}
                    </button>
                  </div>
                </div>

                {/* 2. Attach Evening Buffalo Milk (Consecutive Days) */}
                <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-black text-xs text-indigo-950">
                      <Moon className="h-4 w-4 text-indigo-600" />
                      <span>Attach Evening Buffalo Milk</span>
                    </div>
                    <span className="rounded-md bg-indigo-200/80 px-2 py-0.5 text-[10px] font-black text-indigo-900">PM Shift</span>
                  </div>
                  <p className="text-[11px] text-indigo-700 leading-tight">
                    Schedule consecutive days of evening buffalo milk starting from Day {selectedCell.day}.
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <label className="block text-[10px] font-bold text-slate-600">Product & Qty</label>
                      <select
                        value={extraQuantity}
                        onChange={(e) => setExtraQuantity(e.target.value)}
                        className="mt-0.5 h-8 w-full rounded-lg border border-indigo-300 bg-white px-2 text-xs font-bold text-indigo-950"
                      >
                        <option value="+1L BM">+1L Buffalo Milk (₹80/day)</option>
                        <option value="+0.5L BM">+0.5L Buffalo Milk (₹40/day)</option>
                        <option value="+2L BM">+2L Buffalo Milk (₹160/day)</option>
                      </select>
                    </div>
                    <div className="w-24">
                      <label className="block text-[10px] font-bold text-slate-600">Duration</label>
                      <select
                        value={consecutiveDays}
                        onChange={(e) => setConsecutiveDays(Number(e.target.value))}
                        className="mt-0.5 h-8 w-full rounded-lg border border-indigo-300 bg-white px-2 text-xs font-black text-indigo-950"
                      >
                        <option value={1}>1 Day</option>
                        <option value={2}>2 Days</option>
                        <option value={3}>3 Days</option>
                        <option value={4}>4 Days</option>
                        <option value={5}>5 Days</option>
                        <option value={7}>7 Days (1 Wk)</option>
                      </select>
                    </div>
                  </div>
                  <button
                    disabled={actionLoading}
                    onClick={() => {
                      const pricePaise = extraQuantity === '+0.5L BM' ? 4000 : extraQuantity === '+2L BM' ? 16000 : 8000;
                      handleQuickAction(selectedCell.cell!.deliveryId, 'ATTACH_EVENING_MILK', {
                        extraQuantity,
                        extraPaise: pricePaise,
                        consecutiveDays,
                        note: `Customer requested ${consecutiveDays} days evening buffalo milk`,
                      });
                    }}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-700 py-2.5 text-xs font-black text-white shadow-sm hover:bg-indigo-800 transition active:scale-[0.98]"
                  >
                    <Zap className="h-3.5 w-3.5" />
                    Attach {consecutiveDays} Days Evening Delivery (₹{((extraQuantity === '+0.5L BM' ? 40 : extraQuantity === '+2L BM' ? 160 : 80) * consecutiveDays)})
                  </button>
                </div>

                {/* 3. Extra Milk Ad-hoc Request */}
                <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-black text-amber-900">Add Extra Milk Today</p>
                      <p className="text-[11px] text-amber-700">Ad-hoc single day extra milk without altering shift</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={extraQuantity}
                      onChange={(e) => setExtraQuantity(e.target.value)}
                      className="flex-1 rounded-xl border border-amber-300 bg-white px-2 py-1.5 text-xs font-bold outline-none"
                    >
                      <option value="+0.5L BM">+0.5L Buffalo Milk (₹40)</option>
                      <option value="+1L BM">+1L Buffalo Milk (₹80)</option>
                      <option value="+0.5L CM">+0.5L Cow Milk (₹35)</option>
                      <option value="+1L CM">+1L Cow Milk (₹70)</option>
                      <option value="+2L BM">+2L Buffalo Milk (₹160)</option>
                    </select>
                    <button
                      disabled={actionLoading}
                      onClick={() => {
                        const pricePaise =
                          extraQuantity === '+0.5L CM' ? 3500 :
                          extraQuantity === '+1L CM' ? 7000 :
                          extraQuantity === '+0.5L BM' ? 4000 :
                          extraQuantity === '+2L BM' ? 16000 : 8000;
                        handleQuickAction(selectedCell.cell!.deliveryId, 'EXTRA_MILK', {
                          extraQuantity,
                          extraPaise: pricePaise,
                          amountPaise: pricePaise,
                        });
                      }}
                      className="rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-black text-white hover:bg-amber-700"
                    >
                      Add Extra
                    </button>
                  </div>
                </div>

                {/* 4. Slot Toggle & Skip Actions */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    disabled={actionLoading}
                    onClick={() => handleQuickAction(selectedCell.cell!.deliveryId, 'TOGGLE_SLOT')}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
                  >
                    {selectedCell.cell.deliverySlot === 'AM' ? (
                      <>
                        <Moon className="h-3.5 w-3.5 text-indigo-600" /> Shift to PM
                      </>
                    ) : (
                      <>
                        <Sun className="h-3.5 w-3.5 text-amber-600" /> Shift to AM
                      </>
                    )}
                  </button>

                  <button
                    disabled={actionLoading}
                    onClick={() =>
                      handleQuickAction(selectedCell.cell!.deliveryId, 'SKIP', {
                        note: 'Customer requested pause / not taken',
                      })
                    }
                    className="rounded-xl border border-red-200 bg-red-50/70 py-2 text-xs font-black text-red-700 hover:bg-red-100"
                  >
                    Mark Skipped (Not Taken)
                  </button>
                </div>

                {/* 4. Record Payment */}
                <div className="rounded-xl border border-slate-200 p-3 bg-white space-y-2">
                  <p className="text-xs font-black text-slate-800">Record Daily Payment</p>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      placeholder="Amount ₹"
                      className="w-24 rounded-xl border border-slate-200 px-2 py-1 text-xs font-bold outline-none focus:border-emerald-500"
                    />
                    <select
                      value={paymentMode}
                      onChange={(e) => setPaymentMode(e.target.value as any)}
                      className="flex-1 rounded-xl border border-slate-200 bg-white px-2 py-1 text-xs font-bold outline-none"
                    >
                      <option value="CASH">Cash in Hand</option>
                      <option value="PHONE_PE">PhonePe / UPI</option>
                    </select>
                    <button
                      disabled={actionLoading}
                      onClick={() =>
                        handleQuickAction(selectedCell.cell!.deliveryId, 'RECORD_PAYMENT', {
                          amountPaise: Math.round(Number(paymentAmount || 0) * 100),
                          paymentMode,
                        })
                      }
                      className="rounded-xl bg-slate-900 px-3 py-1 text-xs font-black text-white hover:bg-slate-800"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 py-4 text-center">No scheduled delivery record for this date.</p>
            )}

            <div className="pt-2 flex gap-2">
              <button
                onClick={() => setSelectedCell(null)}
                className="flex-1 rounded-xl border border-slate-200 py-2 text-xs font-black text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
              <button
                disabled={actionLoading}
                onClick={async () => {
                  try {
                    setActionLoading(true);
                    await apiClient.post(`/store/subscriptions/subscribers/${selectedCell.row.subscriptionId}/renew`, {
                      isSamePlan: true,
                      totalDeliveries: 30,
                    });
                    toast.success(`Plan renewed for ${selectedCell.row.customer.name}!`);
                    setSelectedCell(null);
                    void loadGrid();
                  } catch (err: any) {
                    toast.error(err.response?.data?.message || 'Renewal failed');
                  } finally {
                    setActionLoading(false);
                  }
                }}
                className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl bg-emerald-700 py-2 text-xs font-black text-white hover:bg-emerald-800"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Renew Next Cycle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Morning Pack Summary Modal */}
      {dispatchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-amber-600" />
                <h3 className="text-base font-black text-slate-900">Morning Packing & Dispatch Sheet</h3>
              </div>
              <button onClick={() => setDispatchModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {dispatchLoading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
                <p className="mt-2 text-xs font-bold text-slate-600">Calculating today's milk procurement demand...</p>
              </div>
            ) : dispatchData ? (
              <div className="space-y-4 overflow-y-auto pr-1">
                {/* Metric Cards */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                    <p className="text-[10px] font-black uppercase text-slate-500">Buffalo Milk (BM)</p>
                    <p className="text-2xl font-black text-slate-900">{dispatchData.summary.totalBuffaloMilkLiters} L</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                    <p className="text-[10px] font-black uppercase text-slate-500">Cow Milk (CM)</p>
                    <p className="text-2xl font-black text-slate-900">{dispatchData.summary.totalCowMilkLiters} L</p>
                  </div>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center">
                    <p className="text-[10px] font-black uppercase text-emerald-700">Total Pack Liters</p>
                    <p className="text-2xl font-black text-emerald-800">{dispatchData.summary.totalMilkLiters} L</p>
                  </div>
                </div>

                {/* Stops Checklist */}
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="bg-slate-100 px-3 py-2 text-[11px] font-black text-slate-700 flex justify-between">
                    <span>Route Delivery Stops ({dispatchData.summary.totalStops})</span>
                    <span>Completed: {dispatchData.summary.completedStops}</span>
                  </div>
                  <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
                    {dispatchData.stops.map((stop: any) => (
                      <div key={stop.deliveryId} className="flex items-center justify-between p-2.5 text-xs hover:bg-slate-50">
                        <div>
                          <p className="font-black text-slate-900">
                            #{stop.stopNumber} · {stop.customerName}
                          </p>
                          <p className="text-[10px] text-slate-500">{stop.address} · {stop.phone}</p>
                        </div>
                        <div className="text-right">
                          <span className="inline-block rounded bg-emerald-50 px-2 py-0.5 font-black text-emerald-800">
                            {stop.product} {stop.extra ? `(${stop.extra})` : ''}
                          </span>
                          <p className="text-[10px] font-bold text-slate-400 mt-0.5">{stop.status}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setDispatchModalOpen(false)}
                className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white hover:bg-slate-800"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customer WhatsApp Statement Modal */}
      {statementModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Share2 className="h-5 w-5 text-emerald-600" />
                <h3 className="text-base font-black text-slate-900">Monthly Bill Statement</h3>
              </div>
              <button onClick={() => setStatementModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {statementLoading ? (
              <div className="flex flex-col items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
                <p className="mt-2 text-xs text-slate-500">Generating itemized customer bill...</p>
              </div>
            ) : statementData ? (
              <div className="space-y-3">
                <div className="rounded-xl bg-slate-50 p-3 space-y-1 text-xs">
                  <p><span className="font-bold text-slate-500">Customer:</span> <span className="font-black text-slate-900">{statementData.customerName}</span></p>
                  <p><span className="font-bold text-slate-500">Plan:</span> <span className="font-bold text-slate-700">{statementData.planName}</span></p>
                  <p><span className="font-bold text-slate-500">Deliveries:</span> <span className="font-bold text-emerald-700">{statementData.completedCount} Delivered</span> · {statementData.skippedCount} Skipped</p>
                  {statementData.extraLiters > 0 && (
                    <p><span className="font-bold text-slate-500">Extra Milk:</span> <span className="font-black text-amber-700">{statementData.extraLiters} Liters</span></p>
                  )}
                  <div className="border-t border-slate-200 pt-2 mt-2 flex justify-between text-sm">
                    <span className="font-bold text-slate-600">Total Paid: ₹{statementData.totalPaidRupees}</span>
                    <span className="font-black text-red-600">Balance Due: ₹{statementData.totalDueRupees}</span>
                  </div>
                </div>

                {/* Pre-formatted WhatsApp Message Box */}
                <div className="rounded-xl border border-slate-200 bg-slate-100 p-3">
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-500 mb-1">WhatsApp Preview</p>
                  <pre className="text-[11px] text-slate-700 font-mono whitespace-pre-wrap leading-relaxed max-h-36 overflow-y-auto">
                    {statementData.whatsappText}
                  </pre>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(statementData.whatsappText);
                      toast.success('Statement copied to clipboard!');
                    }}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-black text-slate-700 hover:bg-slate-50"
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy Text
                  </button>

                  {statementData.whatsappUrl && (
                    <a
                      href={statementData.whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-xs font-black text-white hover:bg-emerald-700"
                    >
                      <Send className="h-3.5 w-3.5" /> Send on WhatsApp
                    </a>
                  )}
                </div>
              </div>
            ) : null}

            <button
              onClick={() => setStatementModalOpen(false)}
              className="w-full rounded-xl border border-slate-200 py-2 text-xs font-black text-slate-600 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
