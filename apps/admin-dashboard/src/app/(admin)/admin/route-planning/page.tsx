'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { getToastErrorMessage, useToast } from '@/components/ToastProvider';
import { apiClient } from '@aagam/utils';
import {
  AlertTriangle,
  ArrowDownUp,
  Bike,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  GitMerge,
  GitPullRequestArrow,
  Loader2,
  Map,
  MapPin,
  PackageCheck,
  Play,
  RefreshCw,
  Route,
  Scissors,
  ShieldAlert,
  Store,
  UsersRound,
  X,
} from 'lucide-react';

type Point = { latitude: number; longitude: number };
type Rider = {
  id: string;
  status: string;
  homeZoneId?: string | null;
  maximumParcelCapacity?: number;
  maximumCashHoldingPaise?: number;
  latitude?: number | null;
  longitude?: number | null;
  availabilityLocation?: Point | null;
  user: { id: string; name?: string | null };
  homeZone?: { id: string; code: string; name: string } | null;
};
type Stop = {
  id: string;
  sequenceNumber: number;
  status: string;
  version: number;
  cashDuePaise: number;
  expectedParcelCount: number;
  deliveryLatitude?: number | null;
  deliveryLongitude?: number | null;
  deliveryJob: { order: { customer?: { name?: string | null } | null } };
};
type Run = {
  id: string;
  routeCode: string;
  version: number;
  status: string;
  serviceDate: string;
  slotStart: string;
  slotEnd: string;
  totalStopCount: number;
  expectedCashPaise: number;
  collectedCashPaise: number;
  depositedCashPaise: number;
  expectedParcelCount: number;
  estimatedDistanceKm: number;
  estimatedDurationMinutes: number;
  assignmentReasonSummary?: string | null;
  deliveryZoneId?: string | null;
  deliveryZone?: Zone | null;
  store: { id: string; name: string; address: string; latitude: number; longitude: number };
  rider?: { id: string; user: { id: string; name?: string | null }; availabilityLocation?: Point | null } | null;
  stops: Stop[];
};
type Zone = {
  id: string;
  code: string;
  name: string;
  polygon?: unknown;
  centerLatitude?: number | null;
  centerLongitude?: number | null;
  fallbackRadiusKm?: number | null;
  maximumStopsPerRun: number;
  maximumRouteDistanceKm: number;
  maximumEstimatedDurationMinutes: number;
  maximumParcelCount: number;
  cashRiskLimitPaise: number;
  deliveryCount?: number;
  availableRiderCount?: number;
  estimatedDurationMinutes?: number;
  expectedCashPaise?: number;
  status?: string;
};
type Dashboard = {
  date: string;
  zones: Zone[];
  runs: Run[];
  unassigned: Array<{ id: string; deliveryZone?: Zone | null; order?: { id: string } | null }>;
  riders: Rider[];
  recentEvents: Array<{ id: string; eventType: string; createdAt: string; payload: Record<string, unknown> }>;
  totals: {
    deliveries: number;
    runs: number;
    unassigned: number;
    ridersNeeded: number;
    expectedCashPaise: number;
    collectedCashPaise: number;
    heldCashPaise: number;
  };
};

type SplitPreview = {
  sourceRun: { id: string; routeCode: string; version: number; stopCount: number };
  method: string;
  resultingRuns: Array<{
    index: number;
    stopIds: string[];
    stopCount: number;
    parcelCount: number;
    expectedCashPaise: number;
    estimatedDistanceKm: number;
    estimatedDurationMinutes: number;
  }>;
};

const money = (paise: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(paise || 0) / 100);
const title = (value: string) => value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
const editable = (run: Run) => ['PLANNED', 'RIDER_NEEDED'].includes(run.status);

function polygonPoints(value: unknown): Point[] {
  const source = (() => {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if (record.type === 'Polygon' && Array.isArray(record.coordinates)) return Array.isArray(record.coordinates[0]) ? record.coordinates[0] as unknown[] : [];
      if (Array.isArray(record.points)) return record.points;
    }
    return [];
  })();
  return source.flatMap((item) => {
    if (Array.isArray(item) && item.length >= 2) {
      const longitude = Number(item[0]); const latitude = Number(item[1]);
      return Number.isFinite(latitude) && Number.isFinite(longitude) ? [{ latitude, longitude }] : [];
    }
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const latitude = Number(row.latitude ?? row.lat); const longitude = Number(row.longitude ?? row.lng ?? row.lon);
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? [{ latitude, longitude }] : [];
  });
}

export default function RegionalRoutePlanningPage() {
  const toast = useToast();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState('');
  const [selectedRunId, setSelectedRunId] = useState('');
  const [selectedStopId, setSelectedStopId] = useState('');
  const [destinationRunId, setDestinationRunId] = useState('');
  const [selectedMergeIds, setSelectedMergeIds] = useState<string[]>([]);
  const [reason, setReason] = useState('Operational balancing');
  const [riderId, setRiderId] = useState('');
  const [splitMethod, setSplitMethod] = useState('AUTOMATIC_GEOGRAPHIC');
  const [maximumStops, setMaximumStops] = useState('15');
  const [selectedStopIds, setSelectedStopIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<SplitPreview | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/admin/subscriptions/regional-routing/dashboard', { params: { date } });
      setData(response.data);
      setSelectedRunId((current) => response.data.runs.some((run: Run) => run.id === current) ? current : response.data.runs[0]?.id || '');
    } catch (error) {
      toast.error(getToastErrorMessage(error, 'Regional route planning could not be loaded.'));
    } finally { setLoading(false); }
  }, [date, toast]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    let cancelled = false;
    const refreshEvents = async () => {
      try {
        const response = await apiClient.get('/admin/subscriptions/regional-routing/events', {
          params: { after: new Date(Date.now() - 30_000).toISOString() },
        });
        if (!cancelled && Array.isArray(response.data) && response.data.length) await load();
      } catch { /* polling is best-effort; the main refresh remains available */ }
    };
    const timer = window.setInterval(() => void refreshEvents(), 12_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [load]);

  const selectedRun = data?.runs.find((run) => run.id === selectedRunId) || null;
  const compatibleRuns = useMemo(() => (data?.runs || []).filter((run) => selectedRun && run.id !== selectedRun.id
    && run.store.id === selectedRun.store.id
    && run.serviceDate === selectedRun.serviceDate
    && run.slotStart === selectedRun.slotStart
    && run.slotEnd === selectedRun.slotEnd
    && run.deliveryZoneId === selectedRun.deliveryZoneId
    && editable(run)), [data?.runs, selectedRun]);

  useEffect(() => {
    setSelectedStopIds([]); setSelectedStopId(''); setDestinationRunId(''); setSelectedMergeIds([]); setPreview(null);
    setRiderId(selectedRun?.rider?.id || '');
  }, [selectedRunId]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (key: string, request: () => Promise<unknown>, success: string) => {
    setWorking(key);
    try { await request(); toast.success(success); setPreview(null); setDrawerOpen(false); await load(); }
    catch (error) { toast.error(getToastErrorMessage(error, 'The route operation failed.')); }
    finally { setWorking(''); }
  };

  const plan = () => act('plan', () => apiClient.post('/admin/subscriptions/regional-routing/plan', { serviceDate: date, limit: 5000, assignRiders: true }), 'Regional planning completed.');
  const previewSplit = async () => {
    if (!selectedRun) return;
    setWorking('preview');
    try {
      const response = await apiClient.post(`/admin/subscriptions/regional-routing/runs/${selectedRun.id}/split-preview`, {
        version: selectedRun.version,
        method: splitMethod,
        selectedStopIds: splitMethod === 'SELECTED_STOPS' ? selectedStopIds : undefined,
        maximumStops: splitMethod === 'MAX_STOPS' ? Number(maximumStops) : undefined,
      });
      setPreview(response.data);
    } catch (error) { toast.error(getToastErrorMessage(error, 'Split preview could not be prepared.')); }
    finally { setWorking(''); }
  };
  const applySplit = () => selectedRun && act('split', () => apiClient.post(`/admin/subscriptions/regional-routing/runs/${selectedRun.id}/split`, {
    version: selectedRun.version,
    method: splitMethod,
    selectedStopIds: splitMethod === 'SELECTED_STOPS' ? selectedStopIds : undefined,
    maximumStops: splitMethod === 'MAX_STOPS' ? Number(maximumStops) : undefined,
    riderIds: riderId ? [riderId] : undefined,
    reason,
  }), 'Route split recorded and affected assignments refreshed.');
  const merge = () => selectedRun && act('merge', () => apiClient.post(`/admin/subscriptions/regional-routing/runs/${selectedRun.id}/merge`, {
    targetVersion: selectedRun.version,
    sourceRunIds: selectedMergeIds,
    sourceVersions: Object.fromEntries(compatibleRuns.filter((run) => selectedMergeIds.includes(run.id)).map((run) => [run.id, run.version])),
    reason,
  }), 'Compatible routes merged.');
  const moveStop = () => selectedRun && selectedStopId && destinationRunId && act('move', () => {
    const stop = selectedRun.stops.find((item) => item.id === selectedStopId)!;
    const destination = compatibleRuns.find((run) => run.id === destinationRunId)!;
    return apiClient.post(`/admin/subscriptions/regional-routing/runs/${selectedRun.id}/stops/${stop.id}/move`, {
      destinationRunId: destination.id,
      sourceRunVersion: selectedRun.version,
      destinationRunVersion: destination.version,
      stopVersion: stop.version,
      reason,
    });
  }, 'Pending stop moved with capacity and cash safeguards.');
  const reassign = () => selectedRun && riderId && act('reassign', () => apiClient.post(`/admin/subscriptions/regional-routing/runs/${selectedRun.id}/reassign`, { version: selectedRun.version, riderId, reason }), 'Eligible rider assignment updated.');
  const reorder = () => selectedRun && act('reorder', () => apiClient.post(`/admin/subscriptions/regional-routing/runs/${selectedRun.id}/reorder`, {
    version: selectedRun.version,
    orderedStopIds: [...selectedRun.stops].reverse().map((stop) => stop.id),
    reason,
  }), 'Pending stop sequence updated.');
  const cancel = () => selectedRun && act('cancel', () => apiClient.post(`/admin/subscriptions/regional-routing/runs/${selectedRun.id}/cancel`, { version: selectedRun.version, reason }), 'Unstarted route cancelled and stops released for replanning.');
  const interrupt = () => selectedRun && act('interrupt', () => apiClient.post(`/admin/subscriptions/regional-routing/runs/${selectedRun.id}/interrupt`, { version: selectedRun.version, reason, recoveryRiderId: riderId || undefined }), 'Route interrupted and a recovery run created for pending stops only.');

  if (loading && !data) return <DashboardLayout allowedRole="ADMIN"><div className="grid min-h-[65vh] place-items-center"><Loader2 className="h-9 w-9 animate-spin text-emerald-700" /></div></DashboardLayout>;

  return <DashboardLayout allowedRole="ADMIN"><div className="space-y-6">
    <header className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-700 p-6 text-white shadow-xl">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between"><div><p className="text-xs font-black uppercase tracking-[.24em] text-emerald-200">Live regional operations</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">Region & Route Planning</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-emerald-100">Resolve geographic zones, split by operational feasibility, assign eligible nearby riders, and preserve one audited owner for every stop and cash ledger.</p></div><div className="flex flex-wrap gap-2"><input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="min-h-11 rounded-xl border border-white/20 bg-white/10 px-3 font-bold text-white [color-scheme:dark]"/><button onClick={() => void load()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/15 px-4 font-black"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}/>Refresh</button><button disabled={working === 'plan'} onClick={plan} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 font-black text-emerald-800 disabled:opacity-60"><Play className="h-4 w-4"/>{working === 'plan' ? 'Planning…' : 'Run planner'}</button></div></div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6"><HeroMetric label="Deliveries" value={String(data?.totals.deliveries || 0)} icon={<PackageCheck/>}/><HeroMetric label="Runs" value={String(data?.totals.runs || 0)} icon={<Route/>}/><HeroMetric label="Unassigned" value={String(data?.totals.unassigned || 0)} icon={<AlertTriangle/>}/><HeroMetric label="Riders needed" value={String(data?.totals.ridersNeeded || 0)} icon={<UsersRound/>}/><HeroMetric label="Expected cash" value={money(data?.totals.expectedCashPaise || 0)} icon={<CircleDollarSign/>}/><HeroMetric label="Cash held" value={money(data?.totals.heldCashPaise || 0)} icon={<ShieldAlert/>}/></div>
    </header>

    <section><div className="mb-3 flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-wider text-emerald-700">Regional readiness</p><h2 className="mt-1 text-2xl font-black text-slate-950">Zone summaries</h2></div></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data?.zones.length ? data.zones.map((zone) => <ZoneCard key={zone.id} zone={zone}/>) : <Empty title="No geographic zones" text="Create active polygon or radius zones before planning subscription routes."/>}</div></section>

    <section className="grid gap-5 2xl:grid-cols-[minmax(0,1.35fr)_minmax(420px,.65fr)]">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5"><div><p className="text-xs font-black uppercase tracking-wider text-emerald-700">Map and list split view</p><h2 className="mt-1 text-xl font-black text-slate-950">Zones, stores, riders & route stops</h2></div><div className="flex gap-3 text-[11px] font-bold text-slate-500"><Legend label="Store" className="bg-slate-950"/><Legend label="Rider" className="bg-blue-600"/><Legend label="Stop" className="bg-emerald-600"/></div></div><RegionalMap data={data}/></div>
      <div className="space-y-3"><div className="flex items-center justify-between"><h2 className="text-xl font-black text-slate-950">Planned delivery runs</h2><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{data?.runs.length || 0}</span></div>{data?.runs.length ? data.runs.map((run) => <button key={run.id} onClick={() => { setSelectedRunId(run.id); setDrawerOpen(true); }} className={`w-full rounded-3xl border bg-white p-5 text-left shadow-sm transition ${selectedRunId === run.id ? 'border-emerald-400 ring-2 ring-emerald-100' : 'border-slate-200 hover:border-emerald-200'}`}><div className="flex items-start gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-100 text-emerald-700"><Route className="h-5 w-5"/></span><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><strong className="text-slate-950">{run.routeCode}</strong><StatusChip status={run.status}/></span><span className="mt-1 block truncate text-xs text-slate-500">{run.deliveryZone?.name || 'Zone unresolved'} · {run.store.name}</span></span><ChevronRight className="h-5 w-5 text-slate-400"/></div><div className="mt-4 grid grid-cols-4 gap-2"><Metric label="Stops" value={String(run.totalStopCount)}/><Metric label="Distance" value={`${Number(run.estimatedDistanceKm || 0).toFixed(1)} km`}/><Metric label="ETA" value={`${run.estimatedDurationMinutes || 0} min`}/><Metric label="Cash" value={money(run.expectedCashPaise)}/></div><p className="mt-3 truncate text-xs font-bold text-slate-500">{run.rider?.user.name ? `Rider: ${run.rider.user.name}` : 'Rider needed'}{run.assignmentReasonSummary ? ` · ${run.assignmentReasonSummary}` : ''}</p></button>) : <Empty title="No planned routes" text="Run the regional planner after subscription orders are generated."/>}</div>
    </section>

    <section className="grid gap-5 xl:grid-cols-2"><div className="rounded-3xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-black text-slate-950">Unassigned delivery orders</h2><p className="mt-1 text-sm text-slate-500">Orders remain visible instead of silently overloading the first available rider.</p><div className="mt-4 space-y-2">{data?.unassigned.length ? data.unassigned.map((item) => <div key={item.id} className="flex items-center gap-3 rounded-2xl bg-amber-50 p-3"><AlertTriangle className="h-5 w-5 text-amber-700"/><div className="min-w-0"><p className="truncate text-sm font-black text-amber-950">{item.order?.id || item.id}</p><p className="text-xs text-amber-800">{item.deliveryZone?.name || 'Zone unresolved'}</p></div></div>) : <div className="rounded-2xl bg-emerald-50 p-5 text-center text-sm font-bold text-emerald-800">All generated deliveries have one route owner.</div>}</div></div><div className="rounded-3xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-black text-slate-950">Recent route events</h2><div className="mt-4 max-h-80 space-y-2 overflow-y-auto">{data?.recentEvents.length ? data.recentEvents.slice(0, 20).map((event) => <div key={event.id} className="flex gap-3 rounded-2xl bg-slate-50 p-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700"/><div><p className="text-xs font-black text-slate-800">{title(event.eventType)}</p><p className="mt-1 text-[11px] text-slate-500">{new Date(event.createdAt).toLocaleString('en-IN')}</p></div></div>) : <p className="rounded-2xl bg-slate-50 p-5 text-center text-sm text-slate-500">No route changes in the past 24 hours.</p>}</div></div></section>

    {drawerOpen && selectedRun ? <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/55"><button aria-label="Close route drawer" onClick={() => setDrawerOpen(false)} className="absolute inset-0"/><aside className="relative h-full w-full max-w-2xl overflow-y-auto bg-slate-50 p-5 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-xs font-black uppercase tracking-wider text-emerald-700">Controlled route management</p><h2 className="mt-1 text-2xl font-black text-slate-950">{selectedRun.routeCode}</h2><p className="mt-1 text-sm text-slate-500">{selectedRun.deliveryZone?.name || 'Zone unresolved'} · version {selectedRun.version}</p></div><button onClick={() => setDrawerOpen(false)} className="grid h-11 w-11 place-items-center rounded-xl bg-white"><X className="h-5 w-5"/></button></div>
      <div className="mt-5 grid grid-cols-4 gap-2"><Metric label="Stops" value={String(selectedRun.totalStopCount)}/><Metric label="Distance" value={`${selectedRun.estimatedDistanceKm.toFixed(1)} km`}/><Metric label="Duration" value={`${selectedRun.estimatedDurationMinutes} min`}/><Metric label="Cash" value={money(selectedRun.expectedCashPaise)}/></div>
      <label className="mt-5 block text-xs font-black uppercase tracking-wide text-slate-500">Required operational reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm normal-case tracking-normal text-slate-800"/></label>
      <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-2"><Scissors className="h-5 w-5 text-emerald-700"/><h3 className="font-black text-slate-950">Split run</h3></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><select value={splitMethod} onChange={(event) => { setSplitMethod(event.target.value); setPreview(null); }} className="min-h-12 rounded-xl border border-slate-200 px-3 font-bold"><option value="AUTOMATIC_GEOGRAPHIC">Automatic geographic split</option><option value="SELECTED_STOPS">Selected stops</option><option value="MAX_STOPS">Maximum-stop split</option><option value="TIME_CAPACITY">Time-capacity split</option></select>{splitMethod === 'MAX_STOPS' ? <input value={maximumStops} onChange={(event) => setMaximumStops(event.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="Maximum stops" className="min-h-12 rounded-xl border border-slate-200 px-3"/> : null}</div>{splitMethod === 'SELECTED_STOPS' ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{selectedRun.stops.map((stop) => <label key={stop.id} className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm font-bold"><input type="checkbox" checked={selectedStopIds.includes(stop.id)} onChange={(event) => setSelectedStopIds((current) => event.target.checked ? [...current, stop.id] : current.filter((id) => id !== stop.id))}/>Stop {stop.sequenceNumber} · {stop.deliveryJob.order.customer?.name || 'Customer'}</label>)}</div> : null}<div className="mt-3 flex gap-2"><button disabled={!editable(selectedRun) || working === 'preview'} onClick={() => void previewSplit()} className="min-h-11 flex-1 rounded-xl border border-emerald-300 bg-emerald-50 font-black text-emerald-800 disabled:opacity-50">{working === 'preview' ? 'Calculating…' : 'Preview split'}</button>{preview ? <button disabled={working === 'split'} onClick={applySplit} className="min-h-11 flex-1 rounded-xl bg-emerald-700 font-black text-white">Confirm split</button> : null}</div>{preview ? <div className="mt-4 grid gap-2 sm:grid-cols-2">{preview.resultingRuns.map((run) => <div key={run.index} className="rounded-2xl bg-emerald-50 p-3"><p className="font-black text-emerald-900">Proposed run {run.index}</p><p className="mt-1 text-xs text-emerald-800">{run.stopCount} stops · {run.estimatedDistanceKm.toFixed(1)} km · {run.estimatedDurationMinutes} min · {money(run.expectedCashPaise)}</p></div>)}</div> : null}</section>
      <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-2"><Bike className="h-5 w-5 text-blue-700"/><h3 className="font-black text-slate-950">Assign or reassign rider</h3></div><select value={riderId} onChange={(event) => setRiderId(event.target.value)} className="mt-3 min-h-12 w-full rounded-xl border border-slate-200 px-3 font-bold"><option value="">Select eligible rider</option>{data?.riders.map((rider) => <option key={rider.id} value={rider.id}>{rider.user.name || rider.id} · {rider.status}{rider.homeZone?.name ? ` · ${rider.homeZone.name}` : ''}</option>)}</select><button disabled={!editable(selectedRun) || !riderId || working === 'reassign'} onClick={reassign} className="mt-3 min-h-11 w-full rounded-xl bg-blue-700 font-black text-white disabled:opacity-50">Validate eligibility & assign</button></section>
      <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-2"><GitMerge className="h-5 w-5 text-violet-700"/><h3 className="font-black text-slate-950">Merge compatible runs</h3></div><div className="mt-3 space-y-2">{compatibleRuns.length ? compatibleRuns.map((run) => <label key={run.id} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 text-sm font-bold"><input type="checkbox" checked={selectedMergeIds.includes(run.id)} onChange={(event) => setSelectedMergeIds((current) => event.target.checked ? [...current, run.id] : current.filter((id) => id !== run.id))}/><span>{run.routeCode} · {run.totalStopCount} stops · {money(run.expectedCashPaise)}</span></label>) : <p className="text-sm text-slate-500">No compatible unstarted runs.</p>}</div><button disabled={!selectedMergeIds.length || working === 'merge'} onClick={merge} className="mt-3 min-h-11 w-full rounded-xl bg-violet-700 font-black text-white disabled:opacity-50">Merge selected routes</button></section>
      <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-2"><GitPullRequestArrow className="h-5 w-5 text-amber-700"/><h3 className="font-black text-slate-950">Move one pending stop</h3></div><div className="mt-3 grid gap-2 sm:grid-cols-2"><select value={selectedStopId} onChange={(event) => setSelectedStopId(event.target.value)} className="min-h-12 rounded-xl border border-slate-200 px-3 font-bold"><option value="">Select pending stop</option>{selectedRun.stops.filter((stop) => ['PLANNED','READY','RETRY_PENDING'].includes(stop.status)).map((stop) => <option key={stop.id} value={stop.id}>Stop {stop.sequenceNumber} · {stop.deliveryJob.order.customer?.name || 'Customer'}</option>)}</select><select value={destinationRunId} onChange={(event) => setDestinationRunId(event.target.value)} className="min-h-12 rounded-xl border border-slate-200 px-3 font-bold"><option value="">Destination run</option>{compatibleRuns.map((run) => <option key={run.id} value={run.id}>{run.routeCode}</option>)}</select></div><button disabled={!selectedStopId || !destinationRunId || working === 'move'} onClick={moveStop} className="mt-3 min-h-11 w-full rounded-xl bg-amber-700 font-black text-white disabled:opacity-50">Review capacity & move stop</button></section>
      <section className="mt-4 grid gap-3 sm:grid-cols-2"><button disabled={!editable(selectedRun) || working === 'reorder'} onClick={reorder} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white font-black text-slate-800 disabled:opacity-50"><ArrowDownUp className="h-5 w-5"/>Reorder pending stops</button>{['READY_FOR_PICKUP','PICKED_UP','IN_PROGRESS'].includes(selectedRun.status) ? <button disabled={working === 'interrupt'} onClick={interrupt} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-red-700 font-black text-white"><ShieldAlert className="h-5 w-5"/>Interrupt & recover</button> : <button disabled={!editable(selectedRun) || working === 'cancel'} onClick={cancel} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-red-700 font-black text-white disabled:opacity-50"><X className="h-5 w-5"/>Cancel unstarted run</button>}</section>
    </aside></div> : null}
  </div></DashboardLayout>;
}

function RegionalMap({ data }: { data: Dashboard | null }) {
  const points = useMemo(() => {
    const rows: Array<Point & { id: string; kind: 'store'|'rider'|'stop'; label: string; routeId?: string }> = [];
    data?.runs.forEach((run) => {
      rows.push({ id: `store-${run.store.id}`, kind: 'store', latitude: run.store.latitude, longitude: run.store.longitude, label: run.store.name, routeId: run.id });
      if (run.rider?.availabilityLocation) rows.push({ id: `rider-${run.rider.id}`, kind: 'rider', ...run.rider.availabilityLocation, label: run.rider.user.name || 'Rider', routeId: run.id });
      run.stops.forEach((stop) => {
        const latitude = Number(stop.deliveryLatitude); const longitude = Number(stop.deliveryLongitude);
        if (Number.isFinite(latitude) && Number.isFinite(longitude)) rows.push({ id: stop.id, kind: 'stop', latitude, longitude, label: `${run.routeCode} · Stop ${stop.sequenceNumber}`, routeId: run.id });
      });
    });
    data?.riders.forEach((rider) => {
      const location = rider.availabilityLocation || (Number.isFinite(Number(rider.latitude)) && Number.isFinite(Number(rider.longitude)) ? { latitude: Number(rider.latitude), longitude: Number(rider.longitude) } : null);
      if (location && !rows.some((row) => row.id === `rider-${rider.id}`)) rows.push({ id: `rider-${rider.id}`, kind: 'rider', ...location, label: rider.user.name || 'Rider' });
    });
    return rows;
  }, [data]);
  const polygons = useMemo(() => (data?.zones || []).map((zone) => ({ zone, points: polygonPoints(zone.polygon) })).filter((item) => item.points.length >= 3), [data?.zones]);
  const all = [...points, ...polygons.flatMap((item) => item.points.map((point, index) => ({ ...point, id: `${item.zone.id}-${index}`, kind: 'stop' as const, label: item.zone.name })))];
  const latitudes = all.map((point) => point.latitude); const longitudes = all.map((point) => point.longitude);
  const minLat = Math.min(...latitudes, 0); const maxLat = Math.max(...latitudes, 1); const minLng = Math.min(...longitudes, 0); const maxLng = Math.max(...longitudes, 1);
  const x = (longitude: number) => 55 + ((longitude - minLng) / Math.max(maxLng - minLng, 0.001)) * 890;
  const y = (latitude: number) => 465 - ((latitude - minLat) / Math.max(maxLat - minLat, 0.001)) * 410;
  if (!points.length && !polygons.length) return <div className="grid min-h-[430px] place-items-center bg-slate-50 p-8 text-center"><div><Map className="mx-auto h-12 w-12 text-slate-300"/><p className="mt-3 font-black text-slate-800">No geographic route data</p><p className="mt-1 text-sm text-slate-500">Resolved zones and generated routes will appear here.</p></div></div>;
  return <div className="overflow-x-auto bg-slate-50 p-3"><svg viewBox="0 0 1000 520" className="min-h-[430px] min-w-[720px] rounded-2xl bg-[linear-gradient(135deg,#f8fafc,#ecfdf5)]" role="img" aria-label="Regional delivery routes map">
    <defs><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="#cbd5e1" strokeWidth="0.6"/></pattern></defs><rect width="1000" height="520" fill="url(#grid)"/>
    {polygons.map(({ zone, points: rows }) => <g key={zone.id}><polygon points={rows.map((point) => `${x(point.longitude)},${y(point.latitude)}`).join(' ')} fill="#10b981" fillOpacity="0.08" stroke="#059669" strokeWidth="2" strokeDasharray="8 5"/><text x={x(rows[0].longitude)} y={y(rows[0].latitude)-10} fontSize="13" fontWeight="800" fill="#047857">{zone.name}</text></g>)}
    {data?.runs.map((run) => { const routePoints = [{ latitude: run.store.latitude, longitude: run.store.longitude }, ...run.stops.flatMap((stop) => Number.isFinite(Number(stop.deliveryLatitude)) && Number.isFinite(Number(stop.deliveryLongitude)) ? [{ latitude: Number(stop.deliveryLatitude), longitude: Number(stop.deliveryLongitude) }] : [])]; return routePoints.length > 1 ? <polyline key={run.id} points={routePoints.map((point) => `${x(point.longitude)},${y(point.latitude)}`).join(' ')} fill="none" stroke="#0f766e" strokeWidth="3" strokeOpacity="0.7"/> : null; })}
    {points.map((point) => <g key={point.id}><circle cx={x(point.longitude)} cy={y(point.latitude)} r={point.kind === 'store' ? 10 : point.kind === 'rider' ? 8 : 6} fill={point.kind === 'store' ? '#0f172a' : point.kind === 'rider' ? '#2563eb' : '#059669'} stroke="#fff" strokeWidth="3"><title>{point.label}</title></circle>{point.kind !== 'stop' ? <text x={x(point.longitude)+12} y={y(point.latitude)+4} fontSize="11" fontWeight="800" fill="#334155">{point.label}</text> : null}</g>)}
  </svg></div>;
}

function HeroMetric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) { return <div className="rounded-2xl bg-white/10 p-4"><div className="flex items-center gap-2 text-emerald-100 [&>svg]:h-4 [&>svg]:w-4">{icon}<p className="text-xs font-bold">{label}</p></div><p className="mt-2 truncate text-xl font-black">{value}</p></div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-slate-50 p-2 text-center"><p className="truncate text-sm font-black text-slate-900">{value}</p><p className="mt-1 text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</p></div>; }
function Legend({ label, className }: { label: string; className: string }) { return <span className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${className}`}/>{label}</span>; }
function StatusChip({ status }: { status: string }) { const risk = ['RIDER_NEEDED','RECOVERY_REQUIRED','INTERRUPTED'].includes(status); return <span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${risk ? 'bg-amber-100 text-amber-800' : status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{title(status)}</span>; }
function ZoneCard({ zone }: { zone: Zone }) { const warning = ['RIDER_NEEDED','CASH_LIMIT_RISK','CAPACITY_RISK','SLOT_RISK'].includes(zone.status || ''); return <article className={`rounded-3xl border bg-white p-5 shadow-sm ${warning ? 'border-amber-300' : 'border-slate-200'}`}><div className="flex items-start gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-100 text-emerald-700"><MapPin className="h-5 w-5"/></span><div className="min-w-0 flex-1"><p className="text-xs font-black uppercase tracking-wider text-emerald-700">{zone.code}</p><h3 className="mt-1 text-lg font-black text-slate-950">{zone.name}</h3></div><StatusChip status={zone.status || 'READY'}/></div><div className="mt-4 grid grid-cols-4 gap-2"><Metric label="Deliveries" value={String(zone.deliveryCount || 0)}/><Metric label="Riders" value={String(zone.availableRiderCount || 0)}/><Metric label="Duration" value={`${zone.estimatedDurationMinutes || 0} min`}/><Metric label="Cash" value={money(zone.expectedCashPaise || 0)}/></div><p className="mt-3 text-xs text-slate-500">Limits: {zone.maximumStopsPerRun} stops · {zone.maximumRouteDistanceKm} km · {zone.maximumEstimatedDurationMinutes} min · {money(zone.cashRiskLimitPaise)}</p></article>; }
function Empty({ title: heading, text }: { title: string; text: string }) { return <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center"><Route className="mx-auto h-10 w-10 text-slate-300"/><p className="mt-3 font-black text-slate-900">{heading}</p><p className="mt-1 text-sm text-slate-500">{text}</p></div>; }
