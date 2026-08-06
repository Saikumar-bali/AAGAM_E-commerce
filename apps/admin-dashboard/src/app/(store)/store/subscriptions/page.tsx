'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { getToastErrorMessage, useToast } from '@/components/ToastProvider';
import { apiClient } from '@aagam/utils';
import {
  AlertTriangle,
  Banknote,
  Box,
  CheckCircle2,
  ClipboardCheck,
  PackageCheck,
  RefreshCw,
  Route,
  ScanLine,
  Truck,
  X,
} from 'lucide-react';

type RunStatus = 'PLANNED' | 'READY_FOR_PICKUP' | 'PICKED_UP' | 'IN_PROGRESS' | 'RETURNING' | 'AWAITING_SETTLEMENT' | 'COMPLETED' | 'CANCELLED';
type Stop = {
  id: string;
  sequenceNumber: number;
  status: string;
  expectedParcelCount: number;
  cashDuePaise: number;
  failureReason?: string | null;
  subscriptionDelivery: {
    order?: { customer?: { name?: string | null }; items: Array<{ id: string; quantity: number; product: { name: string } }> } | null;
  };
};
type Run = {
  id: string;
  routeCode: string;
  status: RunStatus;
  version: number;
  totalStopCount: number;
  expectedBagCount?: number;
  packedBagCount?: number;
  expectedCashPaise: number;
  rider?: { user?: { name?: string | null; phone?: string | null } | null } | null;
  stops: Stop[];
};
type DemandRow = { storeId: string; serviceDate: string; stopCount: number; productTotals: Array<{ productId: string; name: string; quantity: number }> };
type CashBatch = { id: string; reference: string; status: string; expectedAmountPaise: number; submittedAmountPaise: number; verifiedAmountPaise: number; variancePaise: number; version: number; rider?: { user?: { name?: string | null } | null } | null };
type ExceptionRow = Stop & { deliveryRun: { routeCode: string } };
type Tab = 'runs' | 'forecast' | 'cash' | 'exceptions';

function money(paise: number) { return `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`; }
function title(value: string) { return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()); }

export default function StoreSubscriptionOperationsPage() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('runs');
  const [runs, setRuns] = useState<Run[]>([]);
  const [demand, setDemand] = useState<DemandRow[]>([]);
  const [cash, setCash] = useState<CashBatch[]>([]);
  const [exceptions, setExceptions] = useState<ExceptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState('');
  const [packingRun, setPackingRun] = useState<Run | null>(null);
  const [packedBags, setPackedBags] = useState('');
  const [crateCode, setCrateCode] = useState('');
  const [packingNote, setPackingNote] = useState('');
  const [verifyBatch, setVerifyBatch] = useState<CashBatch | null>(null);
  const [verifiedAmount, setVerifiedAmount] = useState('');
  const [settlementReference, setSettlementReference] = useState('');
  const [varianceReason, setVarianceReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [runsResponse, demandResponse, cashResponse, exceptionsResponse] = await Promise.all([
        apiClient.get('/store/subscription-operations/runs'),
        apiClient.get('/store/subscription-operations/demand', { params: { days: 14 } }),
        apiClient.get('/store/subscription-operations/cash-batches'),
        apiClient.get('/store/subscription-operations/exceptions'),
      ]);
      setRuns(Array.isArray(runsResponse.data) ? runsResponse.data : []);
      setDemand(Array.isArray(demandResponse.data) ? demandResponse.data : []);
      setCash(Array.isArray(cashResponse.data) ? cashResponse.data : []);
      setExceptions(Array.isArray(exceptionsResponse.data) ? exceptionsResponse.data : []);
    } catch (error) { toast.error(getToastErrorMessage(error, 'Subscription operations could not be loaded.')); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const act = async (key: string, request: () => Promise<unknown>, success: string) => {
    setWorking(key);
    try { await request(); toast.success(success); await load(); }
    catch (error) { toast.error(getToastErrorMessage(error, 'The store operation failed.')); }
    finally { setWorking(''); }
  };

  const confirmPacking = () => act('packing', async () => {
    if (!packingRun) throw new Error('Choose a route to pack.');
    const expected = Number(packingRun.expectedBagCount || packingRun.totalStopCount || packingRun.stops.length);
    const packed = Number(packedBags);
    if (!Number.isInteger(packed) || packed < 1) throw new Error('Enter a valid packed bag count.');
    if (packed !== expected && packingNote.trim().length < 5) throw new Error('Explain the bag-count exception.');
    await apiClient.post(`/store/subscription-operations/runs/${packingRun.id}/packing`, {
      version: packingRun.version, expectedBagCount: expected, packedBagCount: packed,
      crateCode: crateCode.trim() || undefined, exceptionNote: packingNote.trim() || undefined,
    });
    setPackingRun(null); setPackedBags(''); setCrateCode(''); setPackingNote('');
  }, 'Route bags verified and packing confirmed.');

  const confirmPickup = (run: Run) => act(`pickup-${run.id}`, () => apiClient.post(`/store/subscription-operations/runs/${run.id}/pickup`, { version: run.version }), 'Store handoff confirmed. The rider must independently verify the bags before starting.');

  const verifyCash = () => act('cash-verify', async () => {
    if (!verifyBatch) throw new Error('Choose a submitted cash batch.');
    const paise = Math.round(Number(verifiedAmount) * 100);
    if (!Number.isFinite(paise) || paise < 0) throw new Error('Enter the independently counted amount.');
    if (settlementReference.trim().length < 3) throw new Error('Enter a settlement reference.');
    if (paise !== verifyBatch.expectedAmountPaise && varianceReason.trim().length < 3) throw new Error('A variance reason is required.');
    await apiClient.post(`/store/subscription-operations/cash-batches/${verifyBatch.id}/verify`, {
      version: verifyBatch.version, verifiedAmountPaise: paise,
      settlementReference: settlementReference.trim(), varianceReason: varianceReason.trim() || undefined,
    }, { headers: { 'Idempotency-Key': `web-store-cash:${verifyBatch.id}:v${verifyBatch.version}` } });
    setVerifyBatch(null); setVerifiedAmount(''); setSettlementReference(''); setVarianceReason('');
  }, 'Physical cash verification recorded against individual COD ledgers.');

  const totalStops = runs.reduce((sum, run) => sum + Number(run.totalStopCount || run.stops.length), 0);
  const forecastItems = demand.reduce((sum, row) => sum + row.productTotals.reduce((itemSum, item) => itemSum + item.quantity, 0), 0);
  const submittedCash = cash.filter((batch) => batch.status === 'SUBMITTED').reduce((sum, batch) => sum + Number(batch.submittedAmountPaise || 0), 0);
  const pendingCashCount = cash.filter((batch) => batch.status === 'SUBMITTED').length;
  const tabCounts = useMemo<Record<Tab, number>>(() => ({ runs: runs.length, forecast: forecastItems, cash: pendingCashCount, exceptions: exceptions.length }), [runs.length, forecastItems, pendingCashCount, exceptions.length]);

  return <DashboardLayout allowedRole="STORE_OWNER"><div className="space-y-6">
    <header className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-700 p-6 text-white shadow-xl"><div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-black uppercase tracking-[.24em] text-emerald-200">Subscription fulfilment</p><h1 className="mt-2 text-3xl font-black">Morning Runs & Cash Control</h1><p className="mt-2 max-w-3xl text-sm text-emerald-100">Forecast future demand without upfront reservation, pack by route, verify the rider handoff, and settle physical cash without replacing individual COD ledgers.</p></div><button onClick={() => void load()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white/15 px-4 text-sm font-black hover:bg-white/25"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button></div><div className="mt-6 grid gap-3 sm:grid-cols-4"><HeroMetric label="Routes today" value={String(runs.length)} /><HeroMetric label="Customer bags" value={String(totalStops)} /><HeroMetric label="14-day items" value={String(forecastItems)} /><HeroMetric label="Cash to count" value={money(submittedCash)} /></div></header>

    <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">{([['runs', 'Preparation runs'], ['forecast', 'Demand forecast'], ['cash', 'Cash batches'], ['exceptions', 'Exceptions']] as Array<[Tab, string]>).map(([value, label]) => <button key={value} onClick={() => setTab(value)} className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-black ${tab === value ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{label}{tabCounts[value] > 0 && <span className={`rounded-full px-2 py-0.5 text-[10px] ${tab === value ? 'bg-white/20' : 'bg-slate-100'}`}>{tabCounts[value] > 999 ? '999+' : tabCounts[value]}</span>}</button>)}</nav>

    {loading ? <State icon={RefreshCw} title="Loading subscription operations" text="Fetching route, demand, exception, and cash data…" spin /> : <>
      {tab === 'runs' && <section className="grid gap-4 xl:grid-cols-2">{runs.length ? runs.map((run) => <article key={run.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start gap-3"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-emerald-700"><Route className="h-6 w-6" /></span><div className="min-w-0 flex-1"><p className="font-black text-slate-950">{run.routeCode}</p><p className="mt-1 text-xs text-slate-500">{run.rider?.user?.name ? `Rider: ${run.rider.user.name}` : 'Rider not assigned'}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black text-slate-600">{title(run.status)}</span></div><div className="mt-4 grid grid-cols-3 gap-2"><Metric label="Stops" value={String(run.totalStopCount || run.stops.length)} /><Metric label="Bags" value={String(run.expectedBagCount || run.totalStopCount || run.stops.length)} /><Metric label="Cash due" value={money(run.expectedCashPaise)} /></div><div className="mt-4 rounded-2xl bg-slate-50 p-3"><p className="text-xs font-black uppercase tracking-wide text-slate-500">Customer-wise bags</p><div className="mt-2 space-y-2">{run.stops.slice(0, 5).map((stop) => <div key={stop.id} className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xs last:border-0 last:pb-0"><span className="grid h-6 w-6 place-items-center rounded-full bg-white font-black text-slate-600">{stop.sequenceNumber}</span><span className="min-w-0 flex-1 truncate font-bold text-slate-700">{stop.subscriptionDelivery.order?.customer?.name || 'Customer'} · {stop.expectedParcelCount} bag</span><span className={`font-black ${stop.cashDuePaise > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{stop.cashDuePaise > 0 ? money(stop.cashDuePaise) : '₹0 funded'}</span></div>)}{run.stops.length > 5 && <p className="text-xs font-bold text-slate-500">+ {run.stops.length - 5} more stops</p>}</div></div>{run.status === 'PLANNED' && <button onClick={() => { setPackingRun(run); setPackedBags(String(run.expectedBagCount || run.totalStopCount || run.stops.length)); }} className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 font-black text-white hover:bg-emerald-800"><PackageCheck className="h-5 w-5" />Verify route packing</button>}{run.status === 'READY_FOR_PICKUP' && <button disabled={working === `pickup-${run.id}`} onClick={() => confirmPickup(run)} className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 font-black text-white hover:bg-teal-800 disabled:opacity-60"><Truck className="h-5 w-5" />{working === `pickup-${run.id}` ? 'Confirming…' : 'Confirm store handoff'}</button>}</article>) : <State icon={Route} title="No preparation runs today" text="Generated subscription orders will be grouped here by service date, store, slot, and cluster." />}</section>}

      {tab === 'forecast' && <section className="grid gap-4 lg:grid-cols-2">{demand.length ? demand.map((row) => <article key={`${row.storeId}:${row.serviceDate}`} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-lg font-black text-slate-950">{new Date(`${row.serviceDate}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}</p><p className="mt-1 text-xs text-slate-500">{row.stopCount} future customer bag{row.stopCount === 1 ? '' : 's'}</p></div><span className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-800"><Box className="h-4 w-4" />{row.productTotals.reduce((sum, item) => sum + item.quantity, 0)} items</span></div><div className="mt-4 divide-y rounded-2xl bg-slate-50 px-4">{row.productTotals.map((item) => <div key={item.productId} className="flex items-center justify-between py-3"><span className="font-bold text-slate-700">{item.name}</span><span className="font-black text-slate-950">× {item.quantity}</span></div>)}</div><p className="mt-3 text-xs text-slate-500">Forecast only. Inventory is reserved when each actual delivery order is generated.</p></article>) : <State icon={Box} title="No forecast demand" text="Future active subscription occurrences will appear here." />}</section>}

      {tab === 'cash' && <section className="grid gap-4 xl:grid-cols-2">{cash.length ? cash.map((batch) => <article key={batch.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-100 text-amber-700"><Banknote className="h-6 w-6" /></span><div className="min-w-0 flex-1"><p className="font-black text-slate-950">{batch.reference}</p><p className="mt-1 text-xs text-slate-500">Rider: {batch.rider?.user?.name || 'Assigned rider'} · {title(batch.status)}</p></div><p className="text-xl font-black text-amber-800">{money(batch.status === 'SUBMITTED' ? batch.submittedAmountPaise : batch.expectedAmountPaise)}</p></div><div className="mt-4 grid grid-cols-4 gap-2"><Metric label="Expected" value={money(batch.expectedAmountPaise)} /><Metric label="Submitted" value={money(batch.submittedAmountPaise)} /><Metric label="Verified" value={money(batch.verifiedAmountPaise)} /><Metric label="Variance" value={money(batch.variancePaise)} danger={batch.variancePaise !== 0} /></div>{batch.status === 'SUBMITTED' && <button onClick={() => { setVerifyBatch(batch); setVerifiedAmount(String(batch.submittedAmountPaise / 100)); setSettlementReference(`STORE-${batch.reference}`); }} className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-amber-700 font-black text-white hover:bg-amber-800"><ClipboardCheck className="h-5 w-5" />Independently count and verify</button>}</article>) : <State icon={Banknote} title="No rider cash batches" text="Submitted batches will appear here for independent store verification." />}</section>}

      {tab === 'exceptions' && <section className="space-y-3">{exceptions.length ? exceptions.map((row) => <article key={row.id} className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" /><div><p className="font-black text-red-950">{row.deliveryRun.routeCode} · Stop {row.sequenceNumber} · {title(row.status)}</p><p className="mt-1 text-sm text-red-800">{row.failureReason || 'Operational follow-up required.'}</p></div></article>) : <State icon={CheckCircle2} title="No open exceptions" text="Failed, retry-pending, and return-required stops will appear here." />}</section>}
    </>}

    {packingRun && <Modal title={`Pack route ${packingRun.routeCode}`} onClose={() => setPackingRun(null)}><div className="rounded-2xl bg-emerald-50 p-4"><p className="text-xs font-black uppercase tracking-wide text-emerald-700">Expected bags</p><p className="mt-1 text-3xl font-black text-emerald-950">{packingRun.expectedBagCount || packingRun.totalStopCount || packingRun.stops.length}</p></div><Field label="Packed bag count"><input value={packedBags} onChange={(event) => setPackedBags(event.target.value.replace(/\D/g, ''))} inputMode="numeric" className="h-12 w-full rounded-xl border border-slate-300 px-4 text-lg font-black outline-none focus:border-emerald-500" /></Field><Field label="Route crate QR / code"><div className="flex h-12 items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4"><ScanLine className="h-5 w-5 text-emerald-700" /><input value={crateCode} onChange={(event) => setCrateCode(event.target.value)} placeholder="Scan or enter crate code" className="min-w-0 flex-1 bg-transparent outline-none" /></div></Field><Field label="Exception note"><textarea value={packingNote} onChange={(event) => setPackingNote(event.target.value)} rows={3} placeholder="Required only when packed and expected counts differ" className="w-full rounded-xl border border-slate-300 p-3 outline-none focus:border-emerald-500" /></Field><button disabled={working === 'packing'} onClick={confirmPacking} className="min-h-12 w-full rounded-xl bg-emerald-700 font-black text-white disabled:opacity-60">{working === 'packing' ? 'Confirming…' : 'Confirm route packing'}</button></Modal>}

    {verifyBatch && <Modal title={`Verify ${verifyBatch.reference}`} onClose={() => setVerifyBatch(null)}><div className="grid grid-cols-2 gap-3"><Metric label="Server expected" value={money(verifyBatch.expectedAmountPaise)} /><Metric label="Rider submitted" value={money(verifyBatch.submittedAmountPaise)} /></div><Field label="Physical amount independently counted"><input value={verifiedAmount} onChange={(event) => setVerifiedAmount(event.target.value)} inputMode="decimal" className="h-12 w-full rounded-xl border border-slate-300 px-4 text-lg font-black outline-none focus:border-amber-500" /></Field><Field label="Settlement reference"><input value={settlementReference} onChange={(event) => setSettlementReference(event.target.value)} className="h-12 w-full rounded-xl border border-slate-300 px-4 font-bold outline-none focus:border-amber-500" /></Field><Field label="Variance reason (required when different)"><textarea value={varianceReason} onChange={(event) => setVarianceReason(event.target.value)} rows={3} className="w-full rounded-xl border border-slate-300 p-3 outline-none focus:border-amber-500" /></Field><p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">Verification creates immutable deposit entries on every included COD ledger. A difference becomes VARIANCE_REVIEW and cannot be silently written off.</p><button disabled={working === 'cash-verify'} onClick={verifyCash} className="min-h-12 w-full rounded-xl bg-amber-700 font-black text-white disabled:opacity-60">{working === 'cash-verify' ? 'Verifying…' : 'Verify physical cash batch'}</button></Modal>}
  </div></DashboardLayout>;
}

function HeroMetric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl bg-white/10 p-4"><p className="text-xs font-bold text-emerald-100">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></div>; }
function Metric({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) { return <div className="rounded-xl bg-slate-50 p-3 text-center"><p className={`text-base font-black ${danger ? 'text-red-700' : 'text-slate-950'}`}>{value}</p><p className="mt-1 text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</p></div>; }
function State({ icon: Icon, title, text, spin = false }: { icon: React.ComponentType<{ className?: string }>; title: string; text: string; spin?: boolean }) { return <div className="col-span-full grid min-h-64 place-items-center rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center"><div><Icon className={`mx-auto h-12 w-12 text-slate-300 ${spin ? 'animate-spin' : ''}`} /><h2 className="mt-4 text-xl font-black text-slate-900">{title}</h2><p className="mt-2 text-sm text-slate-500">{text}</p></div></div>; }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 sm:items-center sm:p-5"><div className="max-h-[94vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl"><div className="flex items-center justify-between"><h2 className="text-xl font-black text-slate-950">{title}</h2><button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100"><X className="h-5 w-5" /></button></div><div className="mt-5 space-y-4">{children}</div></div></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-xs font-black uppercase tracking-wide text-slate-500">{label}<div className="mt-2 normal-case tracking-normal">{children}</div></label>; }
