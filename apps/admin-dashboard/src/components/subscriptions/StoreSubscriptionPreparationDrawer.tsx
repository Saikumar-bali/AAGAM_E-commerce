'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '@aagam/utils';
import { AlertTriangle, Box, CalendarClock, CheckCircle2, MapPin, PackageCheck, Phone, RefreshCw, Route, X } from 'lucide-react';
import { getToastErrorMessage, useToast } from '@/components/ToastProvider';

type PreparationRow = {
  id: string;
  serviceDate: string;
  deliveryStatus: string;
  generatedAt?: string | null;
  plan: { name: string; orderGenerationHoursBefore: number };
  customer: { name?: string | null; deliveryPhone?: string | null };
  address: { recipientName?: string | null; phone?: string | null; formattedAddress?: string | null; instructions?: string | null };
  items: Array<{ productId: string; name: string; quantity: number }>;
  order?: { id: string; status: string } | null;
  run?: { id: string; routeCode: string; status: string; rider?: { user?: { name?: string | null } | null } | null } | null;
  readiness: { status: 'PENDING' | 'READY' | 'SHORTAGE'; note?: string | null };
  inventoryReservation: 'FORECAST_ONLY' | 'RESERVED_BY_ORDER';
  packingAvailableNow: boolean;
};

function dateLabel(value: string) {
  return new Date(value).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

function humanize(value: string) {
  return String(value || '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function idempotencyKey(deliveryId: string, decision: string) {
  const nonce = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return `store-preparation:${deliveryId}:${decision}:${nonce}`;
}

export default function StoreSubscriptionPreparationDrawer() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<PreparationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState('');
  const [shortageNotes, setShortageNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/store/subscription-preparation', { params: { days: 3 } });
      setRows(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      toast.error(getToastErrorMessage(error, 'Subscription preparation could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const pending = useMemo(() => rows.filter((row) => row.readiness.status === 'PENDING').length, [rows]);
  const shortages = useMemo(() => rows.filter((row) => row.readiness.status === 'SHORTAGE').length, [rows]);

  const decide = async (row: PreparationRow, decision: 'READY' | 'SHORTAGE') => {
    const note = shortageNotes[row.id]?.trim();
    if (decision === 'SHORTAGE' && (!note || note.length < 5)) {
      toast.warning('Describe the shortage so Admin can resolve it before generation or packing.');
      return;
    }
    setWorking(`${row.id}:${decision}`);
    try {
      await apiClient.post(
        `/store/subscription-preparation/deliveries/${encodeURIComponent(row.id)}/readiness`,
        { decision, note: decision === 'SHORTAGE' ? note : undefined },
        { headers: { 'Idempotency-Key': idempotencyKey(row.id, decision) } },
      );
      toast.success(decision === 'READY' ? 'Stock readiness confirmed. No inventory was deducted by this acknowledgement.' : 'Shortage reported to Admin.');
      await load();
    } catch (error) {
      toast.error(getToastErrorMessage(error, 'Stock readiness could not be recorded.'));
    } finally {
      setWorking('');
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 inline-flex min-h-12 items-center gap-2 rounded-2xl bg-emerald-800 px-4 font-black text-white shadow-2xl hover:bg-emerald-900"
        aria-label="Open tomorrow subscription preparation"
      >
        <CalendarClock className="h-5 w-5" /> Tomorrow prep
        {shortages ? <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs">{shortages}</span> : pending ? <span className="rounded-full bg-amber-300 px-2 py-0.5 text-xs text-slate-950">{pending}</span> : <CheckCircle2 className="h-4 w-4 text-emerald-200" />}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[80] bg-slate-950/50 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Tomorrow subscription preparation">
          <div className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col bg-slate-50 shadow-2xl">
            <header className="border-b border-slate-200 bg-emerald-950 p-5 text-white">
              <div className="flex items-start justify-between gap-4">
                <div><p className="text-xs font-black uppercase tracking-[.2em] text-emerald-300">D-1 stock readiness</p><h2 className="mt-2 text-2xl font-black">Prepare before delivery day</h2><p className="mt-2 text-sm font-semibold text-emerald-100">Confirm forecast stock now. Inventory is deducted only when the real subscription order is generated.</p></div>
                <div className="flex gap-2"><button onClick={() => void load()} className="rounded-xl bg-white/10 p-3" aria-label="Refresh"><RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} /></button><button onClick={() => setOpen(false)} className="rounded-xl bg-white/10 p-3" aria-label="Close"><X className="h-5 w-5" /></button></div>
              </div>
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {rows.length ? rows.map((row) => (
                <article key={row.id} className={`rounded-3xl border bg-white p-5 shadow-sm ${row.readiness.status === 'SHORTAGE' ? 'border-red-300' : 'border-slate-200'}`}>
                  <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wide text-emerald-700">{dateLabel(row.serviceDate)}</p><h3 className="mt-1 text-lg font-black text-slate-950">{row.plan.name}</h3><p className="mt-1 text-xs font-bold text-slate-500">{humanize(row.deliveryStatus)} · {row.inventoryReservation === 'RESERVED_BY_ORDER' ? 'Inventory reserved' : 'Forecast only'}</p></div><span className={`rounded-full px-3 py-1 text-xs font-black ${row.readiness.status === 'READY' ? 'bg-emerald-100 text-emerald-800' : row.readiness.status === 'SHORTAGE' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{humanize(row.readiness.status)}</span></div>

                  <div className="mt-4 rounded-2xl bg-slate-50 p-4"><p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500"><Box className="h-4 w-4" /> Required items</p><div className="mt-2 flex flex-wrap gap-2">{row.items.map((item) => <span key={item.productId} className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-800 ring-1 ring-slate-200">{item.quantity}× {item.name}</span>)}</div></div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2"><div className="rounded-2xl border border-slate-200 p-3"><p className="flex items-center gap-2 text-xs font-black text-slate-500"><Phone className="h-4 w-4" /> RECIPIENT</p><p className="mt-2 font-black text-slate-900">{row.address.recipientName || row.customer.name || 'Customer'}</p><p className="mt-1 text-sm font-bold text-slate-600">{row.customer.deliveryPhone || row.address.phone || 'Phone unavailable'}</p></div><div className="rounded-2xl border border-slate-200 p-3"><p className="flex items-center gap-2 text-xs font-black text-slate-500"><MapPin className="h-4 w-4" /> DELIVERY</p><p className="mt-2 text-sm font-bold leading-5 text-slate-700">{row.address.formattedAddress || 'Address unavailable'}</p></div></div>

                  <div className="mt-3 flex items-center gap-3 rounded-2xl bg-slate-950 p-3 text-white"><Route className="h-5 w-5 text-emerald-300" /><div className="min-w-0 flex-1"><p className="text-xs font-black uppercase tracking-wide text-slate-400">Operational state</p><p className="mt-1 truncate text-sm font-black">{row.run?.routeCode || (row.generatedAt ? 'Route planning pending' : 'Order generation pending')}</p><p className="mt-1 text-xs text-slate-300">{row.run?.rider?.user?.name ? `Final rider: ${row.run.rider.user.name}` : 'Rider is finalized close to the delivery slot after live eligibility checks.'}</p></div></div>

                  {row.readiness.status === 'SHORTAGE' ? <div className="mt-3 flex items-start gap-2 rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {row.readiness.note || 'Shortage reported'}</div> : null}

                  <div className="mt-4 space-y-2">
                    <textarea value={shortageNotes[row.id] || ''} onChange={(event) => setShortageNotes((current) => ({ ...current, [row.id]: event.target.value }))} placeholder="Shortage note only if stock is not available" className="min-h-20 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:border-emerald-500" />
                    <div className="grid grid-cols-2 gap-2"><button disabled={working.startsWith(row.id)} onClick={() => void decide(row, 'READY')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 text-sm font-black text-white disabled:opacity-50"><PackageCheck className="h-4 w-4" /> Stock ready</button><button disabled={working.startsWith(row.id)} onClick={() => void decide(row, 'SHORTAGE')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-50 text-sm font-black text-red-700 disabled:opacity-50"><AlertTriangle className="h-4 w-4" /> Report shortage</button></div>
                  </div>

                  <p className="mt-3 text-xs font-semibold leading-5 text-slate-500">{row.packingAvailableNow ? 'The delivery day has started; use Preparation runs for bag packing and custody handoff.' : 'Packing/handoff stays locked to the delivery-day run. This screen only confirms stock readiness early.'}</p>
                </article>
              )) : <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center"><CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" /><p className="mt-3 font-black text-slate-900">No upcoming subscription preparation</p><p className="mt-1 text-sm font-semibold text-slate-500">New subscription demand will appear here immediately and remain forecast-only until its real order is generated.</p></div>}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
