'use client';

import React, { useMemo, useState } from 'react';
import { apiClient } from '@aagam/utils';
import { getToastErrorMessage, useToast } from '@/components/ToastProvider';
import {
  Check,
  CircleDollarSign,
  Edit3,
  Loader2,
  MapPinned,
  Plus,
  Save,
  Settings2,
  Store,
  UsersRound,
  X,
} from 'lucide-react';

type Zone = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  isActive?: boolean;
  priority?: number;
  polygon?: unknown;
  centerLatitude?: number | null;
  centerLongitude?: number | null;
  fallbackRadiusKm?: number | null;
  maximumDailySubscriptionCapacity?: number;
  maximumStopsPerRun?: number;
  maximumRouteDistanceKm?: number;
  maximumEstimatedDurationMinutes?: number;
  maximumParcelCount?: number;
  maximumWeightKg?: number | null;
  cashRiskLimitPaise?: number;
  slotEndBufferMinutes?: number;
  allowedVehicleTypes?: string[];
  neighbouringZoneIds?: string[];
  storeLinks?: Array<{ storeId: string }>;
  preferredRiderLinks?: Array<{ riderProfileId: string }>;
};

type StoreOption = { id: string; name: string; address?: string | null };
type RiderOption = { id: string; status?: string; user: { name?: string | null } };
type Point = { latitude: number; longitude: number };

type FormState = {
  name: string;
  code: string;
  description: string;
  isActive: boolean;
  priority: string;
  polygonText: string;
  centerLatitude: string;
  centerLongitude: string;
  fallbackRadiusKm: string;
  maximumDailySubscriptionCapacity: string;
  maximumStopsPerRun: string;
  maximumRouteDistanceKm: string;
  maximumEstimatedDurationMinutes: string;
  maximumParcelCount: string;
  maximumWeightKg: string;
  cashRiskRupees: string;
  slotEndBufferMinutes: string;
  allowedVehicleTypes: string;
  neighbouringZoneIds: string[];
  storeIds: string[];
  preferredRiderIds: string[];
};

const blank: FormState = {
  name: '', code: '', description: '', isActive: true, priority: '0', polygonText: '',
  centerLatitude: '', centerLongitude: '', fallbackRadiusKm: '',
  maximumDailySubscriptionCapacity: '200', maximumStopsPerRun: '15',
  maximumRouteDistanceKm: '30', maximumEstimatedDurationMinutes: '120',
  maximumParcelCount: '50', maximumWeightKg: '', cashRiskRupees: '10000',
  slotEndBufferMinutes: '15', allowedVehicleTypes: '', neighbouringZoneIds: [],
  storeIds: [], preferredRiderIds: [],
};

function polygonPoints(value: unknown): Point[] {
  const source = (() => {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      const candidate = value as Record<string, unknown>;
      if (candidate.type === 'Polygon' && Array.isArray(candidate.coordinates)) {
        return Array.isArray(candidate.coordinates[0]) ? candidate.coordinates[0] as unknown[] : [];
      }
      if (Array.isArray(candidate.points)) return candidate.points;
    }
    return [];
  })();
  return source.flatMap((raw) => {
    if (Array.isArray(raw) && raw.length >= 2) {
      const longitude = Number(raw[0]); const latitude = Number(raw[1]);
      return Number.isFinite(latitude) && Number.isFinite(longitude) ? [{ latitude, longitude }] : [];
    }
    if (!raw || typeof raw !== 'object') return [];
    const item = raw as Record<string, unknown>;
    const latitude = Number(item.latitude ?? item.lat); const longitude = Number(item.longitude ?? item.lng ?? item.lon);
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? [{ latitude, longitude }] : [];
  });
}

function polygonText(value: unknown) {
  return polygonPoints(value).map((point) => `${point.latitude}, ${point.longitude}`).join('\n');
}

function parsePolygon(value: string): Point[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try { return polygonPoints(JSON.parse(trimmed)); }
    catch { throw new Error('Polygon JSON is invalid. Use one latitude, longitude pair per line instead.'); }
  }
  const points = trimmed.split(/\r?\n/).filter(Boolean).map((line, index) => {
    const [latitudeRaw, longitudeRaw] = line.split(',').map((item) => item.trim());
    const latitude = Number(latitudeRaw); const longitude = Number(longitudeRaw);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error(`Polygon line ${index + 1} must be latitude, longitude.`);
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) throw new Error(`Polygon line ${index + 1} is outside valid coordinate ranges.`);
    return { latitude, longitude };
  });
  return points;
}

function fromZone(zone: Zone): FormState {
  return {
    name: zone.name,
    code: zone.code,
    description: zone.description || '',
    isActive: zone.isActive ?? true,
    priority: String(zone.priority ?? 0),
    polygonText: polygonText(zone.polygon),
    centerLatitude: zone.centerLatitude == null ? '' : String(zone.centerLatitude),
    centerLongitude: zone.centerLongitude == null ? '' : String(zone.centerLongitude),
    fallbackRadiusKm: zone.fallbackRadiusKm == null ? '' : String(zone.fallbackRadiusKm),
    maximumDailySubscriptionCapacity: String(zone.maximumDailySubscriptionCapacity ?? 200),
    maximumStopsPerRun: String(zone.maximumStopsPerRun ?? 15),
    maximumRouteDistanceKm: String(zone.maximumRouteDistanceKm ?? 30),
    maximumEstimatedDurationMinutes: String(zone.maximumEstimatedDurationMinutes ?? 120),
    maximumParcelCount: String(zone.maximumParcelCount ?? 50),
    maximumWeightKg: zone.maximumWeightKg == null ? '' : String(zone.maximumWeightKg),
    cashRiskRupees: String(Number(zone.cashRiskLimitPaise ?? 1_000_000) / 100),
    slotEndBufferMinutes: String(zone.slotEndBufferMinutes ?? 15),
    allowedVehicleTypes: (zone.allowedVehicleTypes ?? []).join(', '),
    neighbouringZoneIds: zone.neighbouringZoneIds ?? [],
    storeIds: zone.storeLinks?.map((link) => link.storeId) ?? [],
    preferredRiderIds: zone.preferredRiderLinks?.map((link) => link.riderProfileId) ?? [],
  };
}

function integer(value: string, label: string, minimum: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) throw new Error(`${label} must be a whole number of at least ${minimum}.`);
  return parsed;
}

function decimal(value: string, label: string, minimum: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum) throw new Error(`${label} must be at least ${minimum}.`);
  return parsed;
}

export default function ZoneManagementPanel({
  zones,
  stores,
  riders,
  onSaved,
}: {
  zones: Zone[];
  stores: StoreOption[];
  riders: RiderOption[];
  onSaved: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(blank);
  const [saving, setSaving] = useState(false);
  const selected = useMemo(() => zones.find((zone) => zone.id === selectedId) || null, [selectedId, zones]);

  const edit = (zone: Zone) => { setSelectedId(zone.id); setForm(fromZone(zone)); };
  const create = () => { setSelectedId(null); setForm(blank); };
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const toggle = (key: 'storeIds' | 'preferredRiderIds' | 'neighbouringZoneIds', id: string) => {
    set(key, form[key].includes(id) ? form[key].filter((value) => value !== id) : [...form[key], id]);
  };

  const save = async () => {
    setSaving(true);
    try {
      const polygon = parsePolygon(form.polygonText);
      const hasRadius = form.centerLatitude.trim() && form.centerLongitude.trim() && form.fallbackRadiusKm.trim();
      if (polygon.length > 0 && polygon.length < 3) throw new Error('A polygon requires at least three coordinate points.');
      if (!polygon.length && !hasRadius) throw new Error('Add a polygon or a centre latitude, longitude and fallback radius.');
      const payload = {
        name: form.name.trim(),
        code: form.code.trim(),
        description: form.description.trim() || undefined,
        isActive: form.isActive,
        priority: integer(form.priority, 'Priority', -1000),
        polygon: polygon.length ? polygon : undefined,
        centerLatitude: hasRadius ? decimal(form.centerLatitude, 'Centre latitude', -90) : undefined,
        centerLongitude: hasRadius ? decimal(form.centerLongitude, 'Centre longitude', -180) : undefined,
        fallbackRadiusKm: hasRadius ? decimal(form.fallbackRadiusKm, 'Fallback radius', 0.1) : undefined,
        maximumDailySubscriptionCapacity: integer(form.maximumDailySubscriptionCapacity, 'Daily subscription capacity', 1),
        maximumStopsPerRun: integer(form.maximumStopsPerRun, 'Maximum stops', 1),
        maximumRouteDistanceKm: decimal(form.maximumRouteDistanceKm, 'Maximum route distance', 0.1),
        maximumEstimatedDurationMinutes: integer(form.maximumEstimatedDurationMinutes, 'Maximum duration', 1),
        maximumParcelCount: integer(form.maximumParcelCount, 'Maximum parcel count', 1),
        maximumWeightKg: form.maximumWeightKg.trim() ? decimal(form.maximumWeightKg, 'Maximum weight', 0.1) : undefined,
        cashRiskLimitPaise: Math.round(decimal(form.cashRiskRupees, 'Cash-risk limit', 0) * 100),
        slotEndBufferMinutes: integer(form.slotEndBufferMinutes, 'Slot-end buffer', 0),
        allowedVehicleTypes: form.allowedVehicleTypes.split(',').map((value) => value.trim()).filter(Boolean),
        neighbouringZoneIds: form.neighbouringZoneIds,
        storeIds: form.storeIds,
        preferredRiderIds: form.preferredRiderIds,
      };
      if (!payload.name || payload.name.length < 2 || !payload.code || payload.code.length < 2) throw new Error('Zone name and code must each contain at least two characters.');
      if (selectedId) await apiClient.patch(`/admin/subscriptions/regional-routing/zones/${selectedId}`, payload);
      else await apiClient.post('/admin/subscriptions/regional-routing/zones', payload);
      toast.success(selectedId ? 'Geographic delivery zone updated.' : 'Geographic delivery zone created.');
      await onSaved();
      setOpen(false);
    } catch (error) { toast.error(getToastErrorMessage(error, error instanceof Error ? error.message : 'Zone could not be saved.')); }
    finally { setSaving(false); }
  };

  return <>
    <button onClick={() => { setOpen(true); if (!selected) create(); }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 font-black text-emerald-800 shadow-sm hover:bg-emerald-50"><Settings2 className="h-4 w-4"/>Manage geographic zones</button>
    {open ? <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/60 p-0 sm:items-center sm:p-5"><div className="max-h-[96vh] w-full max-w-7xl overflow-hidden rounded-t-3xl bg-slate-50 shadow-2xl sm:rounded-3xl"><header className="flex items-center justify-between border-b border-slate-200 bg-white p-5"><div><p className="text-xs font-black uppercase tracking-wider text-emerald-700">Geographic service policy</p><h2 className="mt-1 text-2xl font-black text-slate-950">Delivery zones</h2><p className="mt-1 text-sm text-slate-500">Polygon first, radius fallback. Historical order snapshots remain unchanged.</p></div><button onClick={() => setOpen(false)} className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100"><X className="h-5 w-5"/></button></header>
      <div className="grid max-h-[calc(96vh-96px)] overflow-y-auto lg:grid-cols-[320px_1fr]"><aside className="border-b border-slate-200 bg-white p-4 lg:border-b-0 lg:border-r"><button onClick={create} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 font-black text-white"><Plus className="h-5 w-5"/>New zone</button><div className="mt-4 space-y-2">{zones.map((zone) => <button key={zone.id} onClick={() => edit(zone)} className={`w-full rounded-2xl border p-4 text-left ${selectedId === zone.id ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white'}`}><div className="flex items-start gap-3"><MapPinned className="mt-0.5 h-5 w-5 text-emerald-700"/><div className="min-w-0 flex-1"><p className="truncate font-black text-slate-900">{zone.name}</p><p className="mt-1 text-xs font-bold text-emerald-700">{zone.code}</p><p className="mt-1 text-xs text-slate-500">{zone.maximumStopsPerRun ?? 15} stops · ₹{Number(zone.cashRiskLimitPaise ?? 0).toLocaleString('en-IN') / 100}</p></div><Edit3 className="h-4 w-4 text-slate-400"/></div></button>)}</div></aside>
        <main className="space-y-5 p-4 sm:p-6"><section className="rounded-3xl border border-slate-200 bg-white p-5"><div className="grid gap-4 sm:grid-cols-2"><Field label="Zone name"><input value={form.name} onChange={(event) => set('name', event.target.value)} placeholder="PM Palem" className="input"/></Field><Field label="Stable code"><input value={form.code} onChange={(event) => set('code', event.target.value.toUpperCase())} placeholder="PMP" className="input uppercase"/></Field></div><Field label="Description"><textarea value={form.description} onChange={(event) => set('description', event.target.value)} rows={2} placeholder="Morning subscription service area" className="input min-h-20 p-3"/></Field><div className="mt-4 flex flex-wrap gap-4"><label className="flex items-center gap-2 text-sm font-bold text-slate-700"><input type="checkbox" checked={form.isActive} onChange={(event) => set('isActive', event.target.checked)}/>Active</label><Field label="Priority"><input value={form.priority} onChange={(event) => set('priority', event.target.value)} inputMode="numeric" className="input w-28"/></Field></div></section>
          <section className="rounded-3xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-2"><MapPinned className="h-5 w-5 text-emerald-700"/><h3 className="font-black text-slate-950">Authoritative boundary</h3></div><p className="mt-1 text-xs text-slate-500">Enter latitude, longitude per line. Polygon containment takes priority over fallback radius.</p><textarea value={form.polygonText} onChange={(event) => set('polygonText', event.target.value)} rows={6} placeholder={'17.735, 83.305\n17.735, 83.345\n17.775, 83.345\n17.775, 83.305'} className="input mt-3 min-h-36 font-mono text-xs"/><div className="mt-4 grid gap-3 sm:grid-cols-3"><Field label="Centre latitude"><input value={form.centerLatitude} onChange={(event) => set('centerLatitude', event.target.value)} inputMode="decimal" className="input"/></Field><Field label="Centre longitude"><input value={form.centerLongitude} onChange={(event) => set('centerLongitude', event.target.value)} inputMode="decimal" className="input"/></Field><Field label="Fallback radius (km)"><input value={form.fallbackRadiusKm} onChange={(event) => set('fallbackRadiusKm', event.target.value)} inputMode="decimal" className="input"/></Field></div></section>
          <section className="rounded-3xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-2"><CircleDollarSign className="h-5 w-5 text-amber-700"/><h3 className="font-black text-slate-950">Operational limits</h3></div><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><NumberField label="Daily capacity" value={form.maximumDailySubscriptionCapacity} onChange={(value) => set('maximumDailySubscriptionCapacity', value)}/><NumberField label="Stops per run" value={form.maximumStopsPerRun} onChange={(value) => set('maximumStopsPerRun', value)}/><NumberField label="Distance (km)" value={form.maximumRouteDistanceKm} onChange={(value) => set('maximumRouteDistanceKm', value)}/><NumberField label="Duration (minutes)" value={form.maximumEstimatedDurationMinutes} onChange={(value) => set('maximumEstimatedDurationMinutes', value)}/><NumberField label="Parcel count" value={form.maximumParcelCount} onChange={(value) => set('maximumParcelCount', value)}/><NumberField label="Weight (kg, optional)" value={form.maximumWeightKg} onChange={(value) => set('maximumWeightKg', value)}/><NumberField label="Cash-risk limit (₹)" value={form.cashRiskRupees} onChange={(value) => set('cashRiskRupees', value)}/><NumberField label="Slot buffer (minutes)" value={form.slotEndBufferMinutes} onChange={(value) => set('slotEndBufferMinutes', value)}/></div><Field label="Allowed vehicle types, comma separated"><input value={form.allowedVehicleTypes} onChange={(event) => set('allowedVehicleTypes', event.target.value)} placeholder="BIKE, EV_BIKE" className="input"/></Field></section>
          <section className="grid gap-5 xl:grid-cols-2"><ChoiceSection icon={<Store/>} title="Eligible pickup stores" rows={stores.map((store) => ({ id: store.id, title: store.name, copy: store.address || '' }))} selected={form.storeIds} onToggle={(id) => toggle('storeIds', id)}/><ChoiceSection icon={<UsersRound/>} title="Preferred riders" rows={riders.map((rider) => ({ id: rider.id, title: rider.user.name || 'Rider', copy: rider.status || '' }))} selected={form.preferredRiderIds} onToggle={(id) => toggle('preferredRiderIds', id)}/></section>
          <section className="rounded-3xl border border-slate-200 bg-white p-5"><h3 className="font-black text-slate-950">Neighbouring zones</h3><div className="mt-3 flex flex-wrap gap-2">{zones.filter((zone) => zone.id !== selectedId).map((zone) => <button key={zone.id} type="button" onClick={() => toggle('neighbouringZoneIds', zone.id)} className={`rounded-full border px-3 py-2 text-xs font-black ${form.neighbouringZoneIds.includes(zone.id) ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-600'}`}>{form.neighbouringZoneIds.includes(zone.id) ? '✓ ' : ''}{zone.name}</button>)}</div></section>
          <button disabled={saving} onClick={() => void save()} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 font-black text-white disabled:opacity-60">{saving ? <Loader2 className="h-5 w-5 animate-spin"/> : <Save className="h-5 w-5"/>}{selectedId ? 'Save zone policy' : 'Create geographic zone'}</button>
        </main></div></div></div> : null}
    <style jsx global>{`.input{min-height:48px;width:100%;border:1px solid #cbd5e1;border-radius:12px;padding:0 12px;color:#0f172a;background:#fff;outline:none}.input:focus{border-color:#059669;box-shadow:0 0 0 3px rgba(16,185,129,.13)}`}</style>
  </>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="mt-3 block text-xs font-black uppercase tracking-wide text-slate-500">{label}<div className="mt-2 normal-case tracking-normal">{children}</div></label>; }
function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <Field label={label}><input value={value} onChange={(event) => onChange(event.target.value)} inputMode="decimal" className="input"/></Field>; }
function ChoiceSection({ icon, title, rows, selected, onToggle }: { icon: React.ReactNode; title: string; rows: Array<{ id: string; title: string; copy: string }>; selected: string[]; onToggle: (id: string) => void }) { return <section className="rounded-3xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-2 text-slate-950 [&>svg]:h-5 [&>svg]:w-5">{icon}<h3 className="font-black">{title}</h3></div><div className="mt-3 max-h-56 space-y-2 overflow-y-auto">{rows.length ? rows.map((row) => <button key={row.id} type="button" onClick={() => onToggle(row.id)} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left ${selected.includes(row.id) ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200'}`}><span className={`grid h-6 w-6 place-items-center rounded-lg ${selected.includes(row.id) ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-400'}`}>{selected.includes(row.id) ? <Check className="h-4 w-4"/> : null}</span><span className="min-w-0"><strong className="block truncate text-sm text-slate-900">{row.title}</strong><small className="block truncate text-slate-500">{row.copy}</small></span></button>) : <p className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500">No available options.</p>}</div></section>; }
