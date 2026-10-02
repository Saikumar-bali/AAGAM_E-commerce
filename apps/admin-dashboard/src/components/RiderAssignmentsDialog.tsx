'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '@aagam/utils';
import {
  AlertTriangle,
  Bike,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  IndianRupee,
  Loader2,
  MapPin,
  Phone,
  RefreshCw,
  Route,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';

type RiderStop = {
  stopId: string | null;
  sequenceNumber: number;
  stopStatus: string | null;
  deliveryId: string;
  deliveryStatus: string;
  proofMode: string | null;
  slot: string;
  customer: { id: string; name: string; phone: string };
  address: string;
  product: string;
  liters: number;
  cashDuePaise: number;
  cashCollectedPaise: number;
  orderId: string | null;
  orderStatus: string | null;
};

type RiderRun = {
  id: string;
  routeCode: string;
  slot: string;
  status: string;
  totalStopCount: number;
  expectedCashPaise: number;
  cashToCollectPaise: number;
  timings: {
    slotStart: string;
    slotEnd: string;
    startedAt: string | null;
    pickupConfirmedAt: string | null;
    completedAt: string | null;
  };
  stops: RiderStop[];
};

type RiderGroup = {
  id: string;
  name: string;
  phone: string;
  profileStatus: string;
  vehicleType: string | null;
  vehicleNumber: string | null;
  runs: RiderRun[];
};

type RiderAssignments = {
  date: string;
  slots: { AM: { start: string; end: string }; PM: { start: string; end: string } };
  totals: {
    stops: number;
    assigned: number;
    unassigned: number;
    riders: number;
    slotCounts: Record<string, number>;
    totalLiters: number;
    cashToCollectPaise: number;
    cashCollectedPaise: number;
  };
  riders: RiderGroup[];
  unassigned: RiderStop[];
};

function money(paise: number) {
  return `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function time(value?: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}

function dayLabel(dateStr: string) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

function shiftDay(dateStr: string, delta: number) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const runStatusStyle: Record<string, string> = {
  PLANNED: 'bg-slate-100 text-slate-600',
  RIDER_NEEDED: 'bg-red-100 text-red-700',
  READY_FOR_PICKUP: 'bg-amber-100 text-amber-800',
  PICKED_UP: 'bg-sky-100 text-sky-700',
  IN_PROGRESS: 'bg-emerald-100 text-emerald-800',
  COMPLETED: 'bg-emerald-100 text-emerald-800',
  CANCELLED: 'bg-slate-200 text-slate-500',
};

export default function RiderAssignmentsDialog({ onClose }: { onClose: () => void }) {
  const [date, setDate] = useState(todayIso());
  const [slotFilter, setSlotFilter] = useState<'ALL' | 'AM' | 'PM'>('ALL');
  const [data, setData] = useState<RiderAssignments | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/store/subscriptions/rider-assignments', { params: { date } });
      setData(res.data);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not load rider assignments');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  const matchesSlot = useCallback(
    (slot: string) => slotFilter === 'ALL' || slot === slotFilter,
    [slotFilter],
  );

  const riders = useMemo(() => {
    if (!data) return [];
    return data.riders
      .map((rider) => ({
        ...rider,
        runs: rider.runs
          .map((run) => ({ ...run, stops: run.stops.filter((s) => matchesSlot(s.slot)) }))
          .filter((run) => run.stops.length > 0),
      }))
      .filter((rider) => rider.runs.length > 0);
  }, [data, matchesSlot]);

  const unassigned = useMemo(
    () => (data ? data.unassigned.filter((s) => matchesSlot(s.slot)) : []),
    [data, matchesSlot],
  );

  const visibleAssigned = riders.reduce(
    (sum, rider) => sum + rider.runs.reduce((s, run) => s + run.stops.length, 0),
    0,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-5">
      <div className="flex max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl bg-slate-50 sm:rounded-2xl">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-100 text-violet-700">
              <Bike className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Rider Assignments</h2>
              <p className="text-xs text-slate-500">
                Who is delivering what, the timings, and who is still unassigned.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void load()}
              className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200"
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Date + slot controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDate((d) => shiftDay(d, -1))}
              className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-slate-100 px-3 text-xs font-semibold text-slate-700">
              <CalendarDays className="h-3.5 w-3.5" />
              {data ? dayLabel(data.date) : dayLabel(date)}
            </span>
            <button
              onClick={() => setDate((d) => shiftDay(d, 1))}
              className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => setDate(todayIso())}
              className={`min-h-8 rounded-lg px-3 text-xs font-semibold ${
                date === todayIso() ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setDate(shiftDay(todayIso(), 1))}
              className={`min-h-8 rounded-lg px-3 text-xs font-semibold ${
                date === shiftDay(todayIso(), 1) ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Tomorrow
            </button>
          </div>

          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
            {(['ALL', 'AM', 'PM'] as const).map((slot) => (
              <button
                key={slot}
                onClick={() => setSlotFilter(slot)}
                className={`min-h-7 rounded-lg px-3 text-xs font-semibold ${
                  slotFilter === slot ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {slot === 'ALL' ? 'All slots' : slot}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {loading && !data ? (
            <div className="grid place-items-center py-20 text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-center text-sm text-red-700">
              <AlertTriangle className="mx-auto mb-2 h-5 w-5" />
              {error}
            </div>
          ) : data ? (
            <>
              {/* Summary */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <SummaryCard
                  icon={<Route className="h-3.5 w-3.5" />}
                  label="Stops today"
                  value={String(data.totals.stops)}
                  hint={`AM ${data.totals.slotCounts.AM || 0} · PM ${data.totals.slotCounts.PM || 0}`}
                />
                <SummaryCard
                  icon={<UserCheck className="h-3.5 w-3.5" />}
                  label="Assigned"
                  value={String(visibleAssigned)}
                  hint={`${data.totals.riders} rider(s)`}
                  tone="emerald"
                />
                <SummaryCard
                  icon={<UserX className="h-3.5 w-3.5" />}
                  label="Unassigned"
                  value={String(unassigned.length)}
                  hint={unassigned.length ? 'Needs a rider' : 'All covered'}
                  tone={unassigned.length ? 'red' : 'slate'}
                />
                <SummaryCard
                  icon={<IndianRupee className="h-3.5 w-3.5" />}
                  label="Cash to collect"
                  value={money(data.totals.cashToCollectPaise)}
                  hint={`${money(data.totals.cashCollectedPaise)} collected`}
                />
              </div>

              {unassigned.length > 0 && (
                <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {unassigned.length} of {data.totals.stops} stops are not assigned to any rider for{' '}
                  {slotFilter === 'ALL' ? 'this day' : `the ${slotFilter} slot`}.
                </div>
              )}

              {/* Per-rider cards */}
              {riders.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center">
                  <Bike className="mx-auto mb-2 h-6 w-6 text-slate-300" />
                  <p className="text-sm font-semibold text-slate-700">No riders assigned yet</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Dispatch stops from the Milk Grid, then they will appear here grouped by rider.
                  </p>
                </div>
              ) : (
                riders.map((rider) => <RiderCard key={rider.id} rider={rider} />)
              )}

              {/* Unassigned bucket */}
              {unassigned.length > 0 && (
                <section className="rounded-xl border border-red-200 bg-white">
                  <header className="flex items-center justify-between gap-2 border-b border-red-100 bg-red-50 px-4 py-2.5">
                    <div className="flex items-center gap-2 text-red-700">
                      <UserX className="h-4 w-4" />
                      <span className="text-sm font-semibold">Unassigned ({unassigned.length})</span>
                    </div>
                    <span className="text-[11px] font-semibold text-red-600">
                      {money(unassigned.reduce((s, x) => s + x.cashDuePaise, 0))} cash due
                    </span>
                  </header>
                  <ul className="divide-y divide-slate-100">
                    {unassigned.map((stop) => (
                      <li key={stop.deliveryId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-slate-900">
                            {stop.customer.name}
                            <span className="ml-2 font-normal text-slate-500">{stop.customer.phone}</span>
                          </p>
                          <p className="truncate text-[11px] text-slate-500">
                            <MapPin className="mr-1 inline h-3 w-3" />
                            {stop.address} · {stop.product} · {stop.liters}L
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <SlotBadge slot={stop.slot} />
                          <span className="text-xs font-semibold text-amber-700">{money(stop.cashDuePaise)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  hint,
  tone = 'slate',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: 'slate' | 'emerald' | 'red';
}) {
  const toneClass =
    tone === 'emerald' ? 'text-emerald-700' : tone === 'red' ? 'text-red-700' : 'text-slate-900';
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-slate-400">
        {icon}
        <p className="text-[10px] font-semibold uppercase tracking-wide">{label}</p>
      </div>
      <p className={`mt-1 text-xl font-semibold ${toneClass}`}>{value}</p>
      {hint && <p className="text-[10px] text-slate-400">{hint}</p>}
    </div>
  );
}

function SlotBadge({ slot }: { slot: string }) {
  const style = slot === 'PM' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-800';
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${style}`}>{slot}</span>;
}

function RiderCard({ rider }: { rider: RiderGroup }) {
  const stopCount = rider.runs.reduce((s, run) => s + run.stops.length, 0);
  const cashDue = rider.runs.reduce((s, run) => s + run.cashToCollectPaise, 0);

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-violet-100 text-violet-700">
            <Bike className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {rider.name}
              {rider.phone && (
                <a href={`tel:${rider.phone}`} className="ml-2 inline-flex items-center gap-1 text-[11px] font-normal text-slate-500 hover:text-violet-700">
                  <Phone className="h-3 w-3" />
                  {rider.phone}
                </a>
              )}
            </p>
            <p className="text-[11px] text-slate-500">
              {rider.vehicleType ? `${rider.vehicleType}${rider.vehicleNumber ? ` · ${rider.vehicleNumber}` : ''}` : 'Vehicle not set'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${rider.profileStatus === 'BUSY' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
            {rider.profileStatus}
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
            {stopCount} stop{stopCount === 1 ? '' : 's'}
          </span>
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
            {money(cashDue)} due
          </span>
        </div>
      </header>

      <div className="divide-y divide-slate-100">
        {rider.runs.map((run) => (
          <div key={run.id} className="px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <SlotBadge slot={run.slot} />
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                  <Clock className="h-3 w-3" />
                  {time(run.timings.slotStart)}–{time(run.timings.slotEnd)}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                  {run.routeCode}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${runStatusStyle[run.status] || 'bg-slate-100 text-slate-600'}`}>
                  {run.status.replaceAll('_', ' ')}
                </span>
              </div>
              <span className="text-[11px] text-slate-500">
                {run.stops.length} stop{run.stops.length === 1 ? '' : 's'} · {money(run.cashToCollectPaise)} cash
              </span>
            </div>

            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-400">
              {run.timings.pickupConfirmedAt && <span>Picked up {time(run.timings.pickupConfirmedAt)}</span>}
              {run.timings.startedAt && <span>Started {time(run.timings.startedAt)}</span>}
              {run.timings.completedAt && <span>Completed {time(run.timings.completedAt)}</span>}
            </div>

            <ul className="mt-2 space-y-1.5">
              {run.stops.map((stop) => (
                <li key={stop.deliveryId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white text-[10px] font-bold text-slate-500">
                      {stop.sequenceNumber}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-900">
                        {stop.customer.name}
                        <span className="ml-2 font-normal text-slate-500">{stop.customer.phone}</span>
                      </p>
                      <p className="truncate text-[11px] text-slate-500">
                        <MapPin className="mr-1 inline h-3 w-3" />
                        {stop.address} · {stop.product} · {stop.liters}L
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {stop.orderStatus && (
                      <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                        {stop.orderStatus.replaceAll('_', ' ')}
                      </span>
                    )}
                    <span className="text-xs font-semibold text-amber-700">{money(stop.cashDuePaise)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
