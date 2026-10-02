'use client';

import { useCallback, useEffect, useMemo, useState, type ElementType } from 'react';
import { apiClient } from '@aagam/utils';
import DashboardLayout from '@/components/DashboardLayout';
import { getToastErrorMessage, useToast } from '@/components/ToastProvider';
import {
  CheckCircle2,
  Clock,
  Edit3,
  MapPin,
  Package,
  Phone,
  Route,
  Truck,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import OpsModal, { OpsField } from '@/components/store/OpsModal';
import { DateRail, EmptyState, ResultsNote, SearchField, SegmentedControl } from '@/components/store/OpsControls';
import { KpiStrip, PageHeader, RefreshButton } from '@/components/store/OpsSummary';

type DeliveryItem = {
  id: string;
  sequenceNumber: number;
  deliverySlot: string;
  status: string;
  serviceDate: string;
  window: string;
  customer: { id: string; name: string; phone: string };
  address: { line1: string; line2: string; city: string; pincode: string; latitude: number; longitude: number; landmark: string };
  order: { id: string; status: string; grandTotalPaise: number; items: Array<{ name: string; quantity: number; pricePaise: number }> } | null;
  expectedAmountPaise: number;
  cashCollectedPaise?: number;
  deliveryJobId: string | null;
  deliveryJobStatus: string | null;
  subscription: { storeDelivery: boolean } | null;
};

type StatusGroup = 'all' | 'pending' | 'delivering' | 'delivered' | 'failed';
type SlotFilter = 'all' | 'AM' | 'PM';

const PENDING_STATUSES = ['SCHEDULED', 'ORDER_GENERATED', 'PREPARING', 'PACKED'];
const STARTABLE_STATUSES = ['SCHEDULED', 'ORDER_GENERATED', 'PREPARING', 'PACKED'];
/** How far ahead the rail reaches: today + this many days. */
const RANGE_DAYS = 13;

const STATUS_META: Record<string, { color: string; icon: ElementType; label: string }> = {
  SCHEDULED: { color: 'bg-slate-100 text-slate-700', icon: Clock, label: 'Scheduled' },
  ORDER_GENERATED: { color: 'bg-blue-100 text-blue-800', icon: Clock, label: 'Ready' },
  PREPARING: { color: 'bg-amber-100 text-amber-800', icon: Clock, label: 'Preparing' },
  PACKED: { color: 'bg-emerald-100 text-emerald-800', icon: Package, label: 'Packed' },
  STORE_DELIVERING: { color: 'bg-orange-100 text-orange-800', icon: Truck, label: 'Out for delivery' },
  DELIVERED: { color: 'bg-emerald-100 text-emerald-800', icon: CheckCircle2, label: 'Delivered' },
  FAILED: { color: 'bg-red-100 text-red-700', icon: XCircle, label: 'Failed' },
};

function money(paise: number) {
  return `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/** YYYY-MM-DD of an instant in the store's timezone (Asia/Kolkata). */
function dayKeyOf(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function shiftDay(key: string, days: number) {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dayLabel(key: string, todayKey: string) {
  if (key === todayKey) return 'Today';
  if (key === shiftDay(todayKey, 1)) return 'Tomorrow';
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-IN', {
    weekday: 'short',
    timeZone: 'UTC',
  });
}

function daySublabel(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

function statusBadge(status: string) {
  const cfg = STATUS_META[status] || { color: 'bg-slate-100 text-slate-700', icon: Clock, label: status };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-semibold ${cfg.color}`}>
      <Icon className="h-3 w-3" aria-hidden="true" /> {cfg.label}
    </span>
  );
}

function groupOf(status: string): StatusGroup {
  if (status === 'STORE_DELIVERING') return 'delivering';
  if (status === 'DELIVERED') return 'delivered';
  if (status === 'FAILED') return 'failed';
  if (PENDING_STATUSES.includes(status)) return 'pending';
  return 'pending';
}

export default function StoreDeliveriesPage() {
  const toast = useToast();
  const todayKey = dayKeyOf(new Date());

  const [deliveries, setDeliveries] = useState<DeliveryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [working, setWorking] = useState('');
  const [stores, setStores] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedStoreId, setSelectedStoreId] = useState('');

  const [search, setSearch] = useState('');
  const [statusGroup, setStatusGroup] = useState<StatusGroup>('all');
  const [slot, setSlot] = useState<SlotFilter>('all');
  const [selectedDay, setSelectedDay] = useState(todayKey);

  const [verifyModal, setVerifyModal] = useState<DeliveryItem | null>(null);
  const [verifyName, setVerifyName] = useState('');
  const [verifyPhone, setVerifyPhone] = useState('');
  const [verifyNotes, setVerifyNotes] = useState('');
  const [verifyCash, setVerifyCash] = useState('');
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifyCashError, setVerifyCashError] = useState<string | null>(null);
  const [verifyFormError, setVerifyFormError] = useState<string | null>(null);

  const [editModal, setEditModal] = useState<DeliveryItem | null>(null);
  const [editStatus, setEditStatus] = useState<'DELIVERED' | 'FAILED'>('DELIVERED');
  const [editCash, setEditCash] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  const [failModal, setFailModal] = useState<DeliveryItem | null>(null);
  const [failReason, setFailReason] = useState('');
  const [failError, setFailError] = useState<string | null>(null);

  const loadStores = useCallback(async () => {
    try {
      const res = await apiClient.get('/stores/mine');
      const storeList = Array.isArray(res.data) ? res.data : res.data?.items || [];
      setStores(storeList.map((s: any) => ({ id: s.id, name: s.name })));
      if (storeList.length === 1) setSelectedStoreId(storeList[0].id);
    } catch (err) {
      toast.error(getToastErrorMessage(err, 'Failed to load stores'));
    }
  }, [toast]);

  const loadDeliveries = useCallback(
    async (storeId: string, mode: 'initial' | 'refresh' = 'initial', abortSignal?: AbortSignal) => {
      if (!storeId) return;
      if (mode === 'refresh') setRefreshing(true);
      else setLoading(true);
      try {
        const res = await apiClient.get(`/store-self-delivery/queue/${storeId}`, {
          params: { from: todayKey, to: shiftDay(todayKey, RANGE_DAYS) },
          signal: abortSignal,
        });
        if (!abortSignal?.aborted) setDeliveries(Array.isArray(res.data) ? res.data : []);
      } catch (err: any) {
        if (err.name === 'AbortError' || err.name === 'CanceledError') return;
        toast.error(getToastErrorMessage(err, 'Failed to load deliveries'));
      } finally {
        if (!abortSignal?.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [todayKey, toast]
  );

  useEffect(() => {
    void loadStores();
  }, [loadStores]);

  useEffect(() => {
    if (!selectedStoreId) return;
    const controller = new AbortController();
    void loadDeliveries(selectedStoreId, 'initial', controller.signal);
    return () => controller.abort();
  }, [selectedStoreId, loadDeliveries]);

  const startDelivery = async (deliveryId: string) => {
    setWorking(deliveryId);
    try {
      await apiClient.post(`/store-self-delivery/start/${deliveryId}`);
      toast.success('Delivery started. Verify the customer on arrival.');
      if (selectedStoreId) await loadDeliveries(selectedStoreId, 'refresh');
    } catch (err) {
      toast.error(getToastErrorMessage(err, 'Failed to start delivery'));
    } finally {
      setWorking('');
    }
  };

  const openVerify = (delivery: DeliveryItem) => {
    setVerifyError(null);
    setVerifyCashError(null);
    setVerifyFormError(null);
    setVerifyModal(delivery);
    setVerifyName(delivery.customer.name || '');
    setVerifyPhone(delivery.customer.phone || '');
    setVerifyNotes('');
    setVerifyCash(String((delivery.cashCollectedPaise || delivery.expectedAmountPaise) / 100));
  };

  const completeDelivery = async () => {
    if (!verifyModal) return;
    const cashNum = verifyCash ? Math.round(parseFloat(verifyCash) * 100) : 0;
    if (verifyCash && (!Number.isFinite(cashNum) || cashNum < 0)) {
      setVerifyCashError('Enter a valid cash amount, for example 150 or 150.50.');
      return;
    }
    if (!verifyName.trim()) {
      setVerifyError('Enter the customer name used for verification.');
      return;
    }
    setWorking(verifyModal.id);
    try {
      await apiClient.post(`/store-self-delivery/complete/${verifyModal.id}`, {
        verifiedCustomerName: verifyName.trim(),
        verifiedCustomerPhone: verifyPhone.trim(),
        notes: verifyNotes.trim() || undefined,
        cashCollectedPaise: cashNum,
      });
      toast.success('Delivery completed and verified.');
      setVerifyModal(null);
      if (selectedStoreId) await loadDeliveries(selectedStoreId, 'refresh');
    } catch (err) {
      setVerifyFormError(getToastErrorMessage(err, 'Failed to complete delivery'));
    } finally {
      setWorking('');
    }
  };

  const openFail = (delivery: DeliveryItem) => {
    setFailError(null);
    setFailReason('');
    setFailModal(delivery);
  };

  const submitFailure = async () => {
    if (!failModal) return;
    if (!failReason.trim()) {
      setFailError('A failure reason is required so the admin can follow up.');
      return;
    }
    setWorking(failModal.id);
    try {
      await apiClient.post(`/store-self-delivery/fail/${failModal.id}`, { reason: failReason.trim() });
      toast.success('Delivery marked as failed.');
      setFailModal(null);
      if (selectedStoreId) await loadDeliveries(selectedStoreId, 'refresh');
    } catch (err) {
      setFailError(getToastErrorMessage(err, 'Failed to record failure'));
    } finally {
      setWorking('');
    }
  };

  const openEdit = (delivery: DeliveryItem) => {
    setEditError(null);
    setEditModal(delivery);
    setEditStatus(delivery.status === 'FAILED' ? 'FAILED' : 'DELIVERED');
    setEditCash(String((delivery.cashCollectedPaise || delivery.expectedAmountPaise) / 100));
    setEditNotes('');
  };

  const submitEdit = async () => {
    if (!editModal) return;
    const cashNum = editCash ? Math.round(parseFloat(editCash) * 100) : 0;
    if (editCash && (!Number.isFinite(cashNum) || cashNum < 0)) {
      setEditError('Enter a valid cash amount, for example 150 or 150.50.');
      return;
    }
    if (editStatus === 'FAILED' && !editNotes.trim()) {
      setEditError('A failure reason is required.');
      return;
    }
    setWorking(editModal.id);
    try {
      await apiClient.patch(`/store-self-delivery/update/${editModal.id}`, {
        status: editStatus,
        cashCollectedPaise: cashNum,
        notes: editNotes.trim() || undefined,
        failureReason: editStatus === 'FAILED' ? editNotes.trim() || 'Delivery failed' : undefined,
      });
      toast.success(`Delivery marked as ${editStatus.toLowerCase()}.`);
      setEditModal(null);
      await loadDeliveries(selectedStoreId, 'refresh');
    } catch (err) {
      setEditError(getToastErrorMessage(err, 'Failed to update delivery'));
    } finally {
      setWorking('');
    }
  };

  const days = useMemo(() => {
    return Array.from({ length: RANGE_DAYS + 1 }, (_, index) => shiftDay(todayKey, index));
  }, [todayKey]);

  // After midnight the stored day can fall out of the rail; fall back to today
  // without an effect so the rail, filter and label stay consistent.
  const activeDay = days.includes(selectedDay) ? selectedDay : todayKey;

  const searched = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return deliveries;
    return deliveries.filter((d) =>
      [String(d.sequenceNumber), d.customer.name, d.customer.phone, d.address.line1, d.address.city]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    );
  }, [deliveries, search]);

  const slotFiltered = useMemo(
    () => (slot === 'all' ? searched : searched.filter((d) => d.deliverySlot === slot)),
    [searched, slot]
  );

  const dayItems = useMemo(
    () => slotFiltered.filter((d) => dayKeyOf(d.serviceDate) === activeDay),
    [slotFiltered, activeDay]
  );

  const countsByDay = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of slotFiltered) {
      const key = dayKeyOf(d.serviceDate);
      map[key] = (map[key] || 0) + 1;
    }
    return map;
  }, [slotFiltered]);

  const counts = useMemo(() => {
    const base = { all: dayItems.length, pending: 0, delivering: 0, delivered: 0, failed: 0 };
    for (const d of dayItems) base[groupOf(d.status)] += 1;
    return base;
  }, [dayItems]);

  const cash = useMemo(() => {
    let outstanding = 0;
    let recorded = 0;
    for (const d of dayItems) {
      if (d.status === 'DELIVERED' || d.status === 'FAILED') {
        recorded += d.cashCollectedPaise || 0;
      } else {
        outstanding += d.expectedAmountPaise || 0;
      }
    }
    return { outstanding, recorded };
  }, [dayItems]);

  const filtered = useMemo(
    () => (statusGroup === 'all' ? dayItems : dayItems.filter((d) => groupOf(d.status) === statusGroup)),
    [dayItems, statusGroup]
  );

  const dateRailDays = days.map((key) => ({
    key,
    label: dayLabel(key, todayKey),
    sublabel: daySublabel(key),
    count: countsByDay[key] || 0,
    isToday: key === todayKey,
  }));

  const activeFilterCount = (search.trim() ? 1 : 0) + (slot === 'all' ? 0 : 1) + (statusGroup === 'all' ? 0 : 1);
  const clearFilters = () => {
    setSearch('');
    setSlot('all');
    setStatusGroup('all');
  };

  const selectedDayLabel =
    activeDay === todayKey
      ? 'today'
      : activeDay === shiftDay(todayKey, 1)
        ? 'tomorrow'
        : `on ${daySublabel(activeDay)}`;

  return (
    <DashboardLayout allowedRole="STORE_OWNER">
      <div className="space-y-5">
        <PageHeader
          kicker="Store deliveries"
          title="Subscription deliveries"
          description="Every row is a subscription day for this store. Use the date rail to see what is due today and what is coming."
          actions={
            <>
              {stores.length > 1 && (
                <>
                  <label htmlFor="delivery-store" className="sr-only">
                    Select store
                  </label>
                  <select
                    id="delivery-store"
                    value={selectedStoreId}
                    onChange={(event) => setSelectedStoreId(event.target.value)}
                    className="enterprise-input min-h-[42px] w-auto py-2 text-sm"
                  >
                    <option value="">Select store</option>
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </>
              )}
              <RefreshButton
                onClick={() => selectedStoreId && void loadDeliveries(selectedStoreId, 'refresh')}
                busy={refreshing}
              />
            </>
          }
        />

        <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
          <div className="min-w-0 flex-1">
            <DateRail
              label="Choose a service date"
              days={dateRailDays}
              value={activeDay}
              onChange={setSelectedDay}
            />
          </div>
          <div className="flex shrink-0 items-center gap-5 rounded-xl border border-slate-200 bg-white px-4 py-2.5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">To collect</p>
              <p className="text-lg font-semibold tabular-nums text-amber-700">{money(cash.outstanding)}</p>
            </div>
            <div className="border-l border-slate-100 pl-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">Recorded</p>
              <p className="text-lg font-semibold tabular-nums text-emerald-700">{money(cash.recorded)}</p>
            </div>
          </div>
        </div>

        <KpiStrip
          label="Filter deliveries by status"
          onSelect={(id) => setStatusGroup((current) => (current === id ? 'all' : (id as StatusGroup)))}
          tiles={[
            { id: 'all', label: 'All', value: counts.all, active: statusGroup === 'all' },
            { id: 'pending', label: 'Pending', value: counts.pending, tone: 'blue', active: statusGroup === 'pending' },
            {
              id: 'delivering',
              label: 'Out for delivery',
              value: counts.delivering,
              tone: 'amber',
              active: statusGroup === 'delivering',
            },
            {
              id: 'delivered',
              label: 'Delivered',
              value: counts.delivered,
              tone: 'emerald',
              active: statusGroup === 'delivered',
            },
            { id: 'failed', label: 'Failed', value: counts.failed, tone: 'red', active: statusGroup === 'failed' },
          ]}
        />

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <SearchField
            id="deliveries-search"
            value={search}
            onChange={setSearch}
            placeholder="Search customer, phone or sequence"
          />
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl<SlotFilter>
              label="Delivery slot"
              value={slot}
              onChange={setSlot}
              options={[
                { value: 'all', label: 'All slots', count: searched.length },
                { value: 'AM', label: 'Morning' },
                { value: 'PM', label: 'Evening' },
              ]}
            />
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
              >
                Clear {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
              </button>
            )}
          </div>
        </div>

        <ResultsNote
          message={`${filtered.length} of ${counts.all} deliveries shown ${selectedDayLabel}.`}
        />

        {!selectedStoreId ? (
          <EmptyState
            icon={<Truck className="h-10 w-10" aria-hidden="true" />}
            title="Select a store to view deliveries"
            description="Deliveries are grouped by store. Pick one above to load its queue."
          />
        ) : loading ? (
          <div className="space-y-3" aria-busy="true">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="h-10 w-10" aria-hidden="true" />}
            title={activeFilterCount > 0 ? 'No deliveries match these filters' : `Nothing scheduled ${selectedDayLabel}`}
            description={
              activeFilterCount > 0
                ? 'Clear a filter or search another customer to see the rest of this day.'
                : counts.all > 0
                  ? `${counts.all} deliveries exist for this day but none match the current view.`
                  : 'Subscription days appear here once the plan generates them.'
            }
            action={
              activeFilterCount > 0 ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="enterprise-button min-h-[40px] px-4 py-2 text-sm"
                >
                  Clear filters
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-3" aria-busy={refreshing}>
            {filtered.map((d) => {
              const canStart = STARTABLE_STATUSES.includes(d.status) && dayKeyOf(d.serviceDate) <= todayKey;
              return (
                <article key={d.id} className="enterprise-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-800" aria-hidden="true">
                        <Route className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-950">
                          #{d.sequenceNumber} · {d.customer.name || 'Customer'}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-600">
                          <Phone className="h-3 w-3 shrink-0" aria-hidden="true" />
                          {d.customer.phone || 'No phone'}
                        </p>
                        <p className="mt-0.5 flex items-start gap-1.5 text-xs text-slate-600">
                          <MapPin className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                          <span className="min-w-0 truncate">
                            {d.address.line1}, {d.address.city} {d.address.pincode}
                          </span>
                        </p>
                        {d.order && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {d.order.items.slice(0, 3).map((item, idx) => (
                              <span
                                key={idx}
                                className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700"
                              >
                                {item.quantity}× {item.name}
                              </span>
                            ))}
                            {d.order.items.length > 3 && (
                              <span className="text-[11px] text-slate-500">
                                +{d.order.items.length - 3} more
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {statusBadge(d.status)}
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${
                            d.deliverySlot === 'AM' ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-800'
                          }`}
                        >
                          {d.deliverySlot}
                        </span>
                        <span className="text-xs tabular-nums text-slate-600">{d.window}</span>
                      </div>
                      {d.status === 'DELIVERED' && d.cashCollectedPaise ? (
                        <div className="text-right">
                          <p className="text-sm font-semibold tabular-nums text-emerald-700">
                            {money(d.cashCollectedPaise)}
                          </p>
                          {d.cashCollectedPaise !== d.expectedAmountPaise && (
                            <p className="text-[11px] text-slate-500">Expected {money(d.expectedAmountPaise)}</p>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm font-semibold tabular-nums text-slate-950">
                          {money(d.expectedAmountPaise)}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {canStart && (
                      <button
                        type="button"
                        disabled={working === d.id}
                        onClick={() => void startDelivery(d.id)}
                        className="inline-flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-950 px-3 text-xs font-semibold text-white transition hover:bg-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1 disabled:opacity-50 sm:flex-none"
                      >
                        <Truck className="h-3.5 w-3.5" aria-hidden="true" /> Start delivery
                      </button>
                    )}
                    {d.status === 'STORE_DELIVERING' && (
                      <>
                        <button
                          type="button"
                          disabled={working === d.id}
                          onClick={() => openVerify(d)}
                          className="inline-flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-3 text-xs font-semibold text-white transition hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 disabled:opacity-50 sm:flex-none"
                        >
                          <Package className="h-3.5 w-3.5" aria-hidden="true" /> Complete &amp; collect cash
                        </button>
                        <button
                          type="button"
                          disabled={working === d.id}
                          onClick={() => openFail(d)}
                          className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 text-xs font-semibold text-red-600 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-1 disabled:opacity-50"
                        >
                          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> Mark failed
                        </button>
                      </>
                    )}
                    {d.status === 'DELIVERED' && (
                      <span className="inline-flex min-h-[38px] items-center gap-1 text-xs font-semibold text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Delivered
                      </span>
                    )}
                    {d.status === 'FAILED' && (
                      <span className="inline-flex min-h-[38px] items-center gap-1 text-xs font-semibold text-red-600">
                        <XCircle className="h-3.5 w-3.5" aria-hidden="true" /> Failed
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => openEdit(d)}
                      className="ml-auto inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1"
                    >
                      <Edit3 className="h-3.5 w-3.5" aria-hidden="true" /> Edit
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <OpsModal
          open={Boolean(verifyModal)}
          title="Complete & collect cash"
          description={verifyModal ? `#${verifyModal.sequenceNumber} · ${verifyModal.customer.name}` : undefined}
          onClose={() => setVerifyModal(null)}
          initialFocus="#verify-cash"
          footer={
            <>
              <button
                type="button"
                disabled={working === verifyModal?.id}
                onClick={() => void completeDelivery()}
                className="enterprise-button min-h-[42px] px-4 py-2 text-sm"
              >
                Complete delivery
              </button>
              <button
                type="button"
                onClick={() => setVerifyModal(null)}
                className="min-h-[42px] rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
              >
                Cancel
              </button>
            </>
          }
        >
          {verifyFormError && (
            <div
              role="alert"
              className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-700"
            >
              {verifyFormError}
            </div>
          )}

          <div className="mb-3 rounded-xl bg-emerald-50 px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Order total</p>
            <p className="mt-0.5 text-2xl font-semibold tabular-nums text-emerald-900">
              {verifyModal ? money(verifyModal.expectedAmountPaise) : '—'}
            </p>
          </div>

          <OpsField label="Customer name (for verification)" htmlFor="verify-name" error={verifyError ?? undefined}>
            <input
              id="verify-name"
              value={verifyName}
              onChange={(event) => {
                setVerifyName(event.target.value);
                if (verifyError) setVerifyError(null);
              }}
              autoComplete="name"
              aria-invalid={Boolean(verifyError)}
              aria-describedby={verifyError ? 'verify-name-error' : undefined}
              className="enterprise-input"
            />
          </OpsField>

          <OpsField label="Customer phone (for verification)" htmlFor="verify-phone">
            <input
              id="verify-phone"
              value={verifyPhone}
              onChange={(event) => setVerifyPhone(event.target.value)}
              autoComplete="tel"
              inputMode="tel"
              className="enterprise-input"
            />
          </OpsField>

          <OpsField label="Cash collected (₹)" htmlFor="verify-cash" error={verifyCashError ?? undefined}>
            <input
              id="verify-cash"
              value={verifyCash}
              onChange={(event) => {
                setVerifyCash(event.target.value);
                if (verifyCashError) setVerifyCashError(null);
              }}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              aria-invalid={Boolean(verifyCashError)}
              aria-describedby={verifyCashError ? 'verify-cash-error' : undefined}
              className="enterprise-input"
            />
          </OpsField>

          <OpsField label="Notes (optional)" htmlFor="verify-notes">
            <textarea
              id="verify-notes"
              value={verifyNotes}
              onChange={(event) => setVerifyNotes(event.target.value)}
              rows={2}
              className="enterprise-input"
            />
          </OpsField>
        </OpsModal>

        <OpsModal
          open={Boolean(failModal)}
          title="Mark delivery as failed"
          description={failModal ? `#${failModal.sequenceNumber} · ${failModal.customer.name}` : undefined}
          onClose={() => setFailModal(null)}
          initialFocus="#fail-reason"
          footer={
            <>
              <button
                type="button"
                disabled={working === failModal?.id}
                onClick={() => void submitFailure()}
                className="min-h-[42px] rounded-xl bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:opacity-50"
              >
                Mark as failed
              </button>
              <button
                type="button"
                onClick={() => setFailModal(null)}
                className="min-h-[42px] rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
              >
                Cancel
              </button>
            </>
          }
        >
          <OpsField
            label="Why did this delivery fail?"
            htmlFor="fail-reason"
            hint="Recorded against the subscription so the admin can re-attempt or credit the day."
            error={failError ?? undefined}
          >
            <textarea
              id="fail-reason"
              value={failReason}
              onChange={(event) => setFailReason(event.target.value)}
              rows={3}
              aria-invalid={Boolean(failError)}
              aria-describedby={failError ? 'fail-reason-error' : undefined}
              className="enterprise-input"
            />
          </OpsField>
        </OpsModal>

        <OpsModal
          open={Boolean(editModal)}
          title="Edit delivery record"
          description={editModal ? `#${editModal.sequenceNumber} · ${editModal.customer.name}` : undefined}
          onClose={() => setEditModal(null)}
          initialFocus="#edit-status"
          footer={
            <>
              <button
                type="button"
                disabled={working === editModal?.id}
                onClick={() => void submitEdit()}
                className={`min-h-[42px] rounded-xl px-4 text-sm font-semibold text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 ${
                  editStatus === 'FAILED'
                    ? 'bg-red-600 hover:bg-red-700 focus-visible:ring-red-500'
                    : 'bg-emerald-700 hover:bg-emerald-800 focus-visible:ring-emerald-500'
                }`}
              >
                Save changes
              </button>
              <button
                type="button"
                onClick={() => setEditModal(null)}
                className="min-h-[42px] rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
              >
                Cancel
              </button>
            </>
          }
        >
          <div className="mb-3 rounded-xl bg-slate-50 px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Current status</p>
            <p className="mt-1">{editModal ? statusBadge(editModal.status) : null}</p>
          </div>

          <OpsField label="Update status" htmlFor="edit-status" error={editError ?? undefined}>
            <select
              id="edit-status"
              value={editStatus}
              onChange={(event) => setEditStatus(event.target.value as 'DELIVERED' | 'FAILED')}
              className="enterprise-input"
            >
              <option value="DELIVERED">Delivered</option>
              <option value="FAILED">Failed</option>
            </select>
          </OpsField>

          <OpsField label="Cash collected (₹)" htmlFor="edit-cash">
            <input
              id="edit-cash"
              value={editCash}
              onChange={(event) => setEditCash(event.target.value)}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              className="enterprise-input"
            />
          </OpsField>

          <OpsField
            label={editStatus === 'FAILED' ? 'Failure reason (required)' : 'Notes (optional)'}
            htmlFor="edit-notes"
          >
            <textarea
              id="edit-notes"
              value={editNotes}
              onChange={(event) => setEditNotes(event.target.value)}
              rows={2}
              className="enterprise-input"
            />
          </OpsField>
        </OpsModal>
      </div>
    </DashboardLayout>
  );
}
