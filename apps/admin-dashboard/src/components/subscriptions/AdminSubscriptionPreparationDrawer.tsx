'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '@aagam/utils';
import { AlertTriangle, CalendarClock, CheckCircle2, MapPin, Phone, RefreshCw, Route, Save, Store, X } from 'lucide-react';
import { getToastErrorMessage, useToast } from '@/components/ToastProvider';

type PreparationRow = {
  id: string;
  serviceDate: string;
  deliveryStatus: string;
  generatedAt?: string | null;
  store?: { id: string; name: string } | null;
  plan: { id: string; name: string; orderGenerationHoursBefore: number };
  customer: { name?: string | null; email?: string | null; accountPhone?: string | null; deliveryPhone?: string | null };
  address: { recipientName?: string | null; phone?: string | null; alternatePhone?: string | null; formattedAddress?: string | null; instructions?: string | null };
  items: Array<{ productId: string; name: string; quantity: number }>;
  order?: { id: string; status: string } | null;
  run?: { id: string; routeCode: string; status: string; rider?: { user?: { name?: string | null } | null } | null } | null;
  readiness: { status: 'PENDING' | 'READY' | 'SHORTAGE'; note?: string | null; updatedAt?: string | null };
  inventoryReservation: 'FORECAST_ONLY' | 'RESERVED_BY_ORDER';
};

type PlanPolicy = { id: string; code: string; name: string; status: string; orderGenerationHoursBefore: number };
type Overview = {
  minimumPreparationHours: number;
  finalAssignmentHoursBefore: number;
  rows: PreparationRow[];
  plans: PlanPolicy[];
};

function dayLabel(value: string) {
  return new Date(value).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });
}

function humanize(value: string) {
  return String(value || '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function AdminSubscriptionPreparationDrawer() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState<Overview>({ minimumPreparationHours: 24, finalAssignmentHoursBefore: 2, rows: [], plans: [] });
  const [workingPlan, setWorkingPlan] = useState('');
  const [planHours, setPlanHours] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/admin/subscriptions/preparation', { params: { days: 3 } });
      const next: Overview = response.data || { minimumPreparationHours: 24, finalAssignmentHoursBefore: 2, rows: [], plans: [] };
      setOverview(next);
      setPlanHours((current) => {
        const merged = { ...current };
        next.plans.forEach((plan) => {
          if (merged[plan.id] == null) merged[plan.id] = String(plan.orderGenerationHoursBefore);
        });
        return merged;
      });
    } catch (error) {
      toast.error(getToastErrorMessage(error, 'Tomorrow subscription operations could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const warnings = useMemo(() => overview.rows.filter((row) => row.readiness.status === 'SHORTAGE' || (!row.generatedAt && new Date(row.serviceDate).getTime() - Date.now() < 30 * 60 * 60 * 1000)).length, [overview.rows]);
  const pending = overview.rows.filter((row) => row.readiness.status === 'PENDING').length;
  const belowPolicy = overview.plans.filter((plan) => plan.orderGenerationHoursBefore < overview.minimumPreparationHours);

  const savePolicy = async (plan: PlanPolicy) => {
    const hours = Number(planHours[plan.id] ?? plan.orderGenerationHoursBefore);
    if (!Number.isInteger(hours) || hours < overview.minimumPreparationHours || hours > 72) {
      toast.warning(`Choose a whole-number preparation lead from ${overview.minimumPreparationHours} to 72 hours.`);
      return;
    }
    setWorkingPlan(plan.id);
    try {
      await apiClient.patch(`/admin/subscriptions/preparation/plans/${encodeURIComponent(plan.id)}/policy`, {
        orderGenerationHoursBefore: hours,
        reason: `Admin set operational order-generation lead to ${hours} hours`,
      });
      toast.success(`${plan.name} will materialize each real order ${hours} hours before its delivery window.`);
      setPlanHours((current) => ({ ...current, [plan.id]: String(hours) }));
      await load();
    } catch (error) {
      toast.error(getToastErrorMessage(error, 'Preparation policy could not be updated.'));
    } finally {
      setWorkingPlan('');
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 inline-flex min-h-12 items-center gap-2 rounded-2xl bg-slate-950 px-4 font-black text-white shadow-2xl ring-1 ring-white/10 hover:bg-emerald-900"
        aria-label="Open tomorrow subscription operations"
      >
        <CalendarClock className="h-5 w-5" />
        Tomorrow operations
        {(warnings || pending) ? <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs text-slate-950">{warnings + pending}</span> : <CheckCircle2 className="h-4 w-4 text-emerald-300" />}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[80] bg-slate-950/50 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Tomorrow subscription operations">
          <div className="absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col bg-slate-50 shadow-2xl">
            <header className="border-b border-slate-200 bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[.2em] text-emerald-700">D-1 operational control</p>
                  <h2 className="mt-2 text-2xl font-black text-slate-950">Tomorrow subscriptions</h2>
                  <p className="mt-1 text-sm font-semibold text-slate-500">Orders materialize at least {overview.minimumPreparationHours}h before the slot. Rider live assignment happens about {overview.finalAssignmentHoursBefore}h before the slot.</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => void load()} className="rounded-xl bg-slate-100 p-3" aria-label="Refresh"><RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} /></button>
                  <button onClick={() => setOpen(false)} className="rounded-xl bg-slate-100 p-3" aria-label="Close"><X className="h-5 w-5" /></button>
                </div>
              </div>
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <section className={`rounded-2xl border p-4 ${belowPolicy.length ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
                <div className="flex items-start gap-3">
                  {belowPolicy.length ? <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" /> : <CalendarClock className="mt-0.5 h-5 w-5 text-emerald-700" />}
                  <div className="flex-1">
                    <p className={`font-black ${belowPolicy.length ? 'text-amber-950' : 'text-slate-950'}`}>Order materialization lead</p>
                    <p className={`mt-1 text-sm font-semibold ${belowPolicy.length ? 'text-amber-800' : 'text-slate-500'}`}>Configure each plan from {overview.minimumPreparationHours}–72 hours. This controls when one real occurrence reserves inventory; it never bulk-reserves the full subscription.</p>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {overview.plans.map((plan) => (
                    <div key={plan.id} className="grid gap-3 rounded-xl bg-white p-3 ring-1 ring-slate-200 sm:grid-cols-[1fr_100px_auto] sm:items-center">
                      <div><p className="font-black text-slate-900">{plan.name}</p><p className="text-xs font-semibold text-slate-500">Current {plan.orderGenerationHoursBefore}h · {humanize(plan.status)}</p></div>
                      <label className="text-xs font-black text-slate-600">Hours<input aria-label={`${plan.name} order generation lead hours`} type="number" min={overview.minimumPreparationHours} max={72} step={1} value={planHours[plan.id] ?? String(plan.orderGenerationHoursBefore)} onChange={(event) => setPlanHours((current) => ({ ...current, [plan.id]: event.target.value }))} className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-black text-slate-900" /></label>
                      <button disabled={workingPlan === plan.id || Number(planHours[plan.id] ?? plan.orderGenerationHoursBefore) === plan.orderGenerationHoursBefore} onClick={() => void savePolicy(plan)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"><Save className="h-4 w-4" /> Save</button>
                    </div>
                  ))}
                  {!overview.plans.length ? <p className="rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-500">No active subscription plan policies to configure.</p> : null}
                </div>
              </section>

              {overview.rows.length ? overview.rows.map((row) => (
                <article key={row.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div><p className="text-xs font-black uppercase tracking-wider text-emerald-700">{dayLabel(row.serviceDate)}</p><h3 className="mt-1 text-lg font-black text-slate-950">{row.plan.name}</h3><p className="mt-1 text-sm font-semibold text-slate-500">{row.store?.name || 'Store unresolved'} · {humanize(row.deliveryStatus)}</p></div>
                    <span className={`rounded-full px-3 py-1 text-xs font-black ${row.readiness.status === 'READY' ? 'bg-emerald-100 text-emerald-800' : row.readiness.status === 'SHORTAGE' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{humanize(row.readiness.status)}</span>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-slate-50 p-4"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500"><Phone className="h-4 w-4" /> Delivery contact</div><p className="mt-2 font-black text-slate-900">{row.address.recipientName || row.customer.name || 'Customer'}</p><p className="mt-1 text-sm font-bold text-slate-700">{row.customer.deliveryPhone || row.address.phone || 'No delivery phone'}</p>{row.address.alternatePhone ? <p className="mt-1 text-xs text-slate-500">Alternate: {row.address.alternatePhone}</p> : null}</div>
                    <div className="rounded-2xl bg-slate-50 p-4"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500"><MapPin className="h-4 w-4" /> Delivery address</div><p className="mt-2 text-sm font-bold leading-6 text-slate-800">{row.address.formattedAddress || 'Address unavailable'}</p></div>
                  </div>

                  <div className="mt-3 rounded-2xl border border-slate-200 p-4"><div className="flex items-center justify-between"><span className="inline-flex items-center gap-2 text-sm font-black text-slate-800"><Store className="h-4 w-4 text-emerald-700" /> Preparation</span><span className="text-xs font-black text-slate-500">{row.inventoryReservation === 'RESERVED_BY_ORDER' ? 'Inventory reserved' : 'Forecast only'}</span></div><div className="mt-2 flex flex-wrap gap-2">{row.items.map((item) => <span key={item.productId} className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-800">{item.quantity}× {item.name}</span>)}</div>{row.readiness.note ? <p className="mt-2 text-xs font-semibold text-slate-500">Store note: {row.readiness.note}</p> : null}</div>

                  <div className="mt-3 flex items-center gap-3 rounded-2xl bg-slate-950 p-4 text-white"><Route className="h-5 w-5 text-emerald-300" /><div className="min-w-0 flex-1"><p className="text-xs font-black uppercase tracking-wide text-slate-400">Route / rider</p><p className="mt-1 truncate font-black">{row.run?.routeCode || (row.generatedAt ? 'Route planning pending' : 'Order generation pending')}</p><p className="mt-1 text-xs text-slate-300">{row.run?.rider?.user?.name ? `Final rider: ${row.run.rider.user.name}` : `Live rider assignment waits until ~${overview.finalAssignmentHoursBefore}h before the slot.`}</p></div></div>
                </article>
              )) : <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center"><CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" /><p className="mt-3 font-black text-slate-900">No D-1 subscription work</p><p className="mt-1 text-sm font-semibold text-slate-500">Upcoming subscription deliveries will appear here with contact, stock-readiness and route state.</p></div>}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
