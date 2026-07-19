'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, MapPinned, Plus, Power } from 'lucide-react';
import { apiClient } from '@aagam/utils';
import DashboardLayout from '@/components/DashboardLayout';

type Zone = { id: string; name: string; isActive: boolean; sortOrder: number };

export default function DeliveryZonesPage() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try { setZones((await apiClient.get('/stores/delivery-zones/admin')).data || []); }
    catch (requestError: any) { setError(requestError?.response?.data?.message || 'Could not load delivery zones.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const create = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError(''); setMessage('');
    try { await apiClient.post('/stores/delivery-zones', { name: name.trim() }); setName(''); setMessage('Delivery zone created.'); await load(); }
    catch (requestError: any) { setError(requestError?.response?.data?.message || 'Could not create delivery zone.'); }
    finally { setSaving(false); }
  };
  const toggle = async (zone: Zone) => { await apiClient.patch(`/stores/delivery-zones/${zone.id}`, { isActive: !zone.isActive }); await load(); };
  const move = async (index: number, delta: number) => {
    const target = index + delta; if (target < 0 || target >= zones.length) return;
    const next = [...zones]; [next[index], next[target]] = [next[target], next[index]]; setZones(next);
    try { setZones((await apiClient.patch('/stores/delivery-zones/reorder', { ids: next.map((zone) => zone.id) })).data || next); setMessage('Customer and Rider zone order updated.'); }
    catch (requestError: any) { setError(requestError?.response?.data?.message || 'Could not reorder zones.'); await load(); }
  };

  return <DashboardLayout allowedRole="ADMIN"><div className="mx-auto max-w-5xl space-y-6 pb-12"><header><p className="text-xs font-black uppercase tracking-[.2em] text-teal-700">Service-area controls</p><h1 className="mt-2 text-3xl font-black">Delivery Zones</h1><p className="mt-2 text-sm font-semibold text-slate-500">Only active zones appear during Rider onboarding. Their order is controlled here.</p></header>{error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{String(error)}</div> : null}{message ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">{message}</div> : null}<form onSubmit={create} className="flex gap-3 rounded-3xl border bg-white p-5 shadow-sm"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="New service area, e.g. Rushikonda" className="min-w-0 flex-1 rounded-xl border px-4 py-3 font-semibold" required minLength={2} /><button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-3 font-black text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add zone</button></form><section className="overflow-hidden rounded-3xl border bg-white shadow-sm">{loading ? <div className="grid min-h-56 place-items-center"><Loader2 className="h-7 w-7 animate-spin text-teal-700" /></div> : zones.length === 0 ? <div className="p-12 text-center"><MapPinned className="mx-auto h-10 w-10 text-slate-300" /><p className="mt-3 font-black">No delivery zones configured</p></div> : <div className="divide-y">{zones.map((zone, index) => <div key={zone.id} className="flex items-center gap-4 p-4"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-teal-50 font-black text-teal-800">{index + 1}</div><div className="min-w-0 flex-1"><p className="truncate font-black">{zone.name}</p><p className={`text-xs font-bold ${zone.isActive ? 'text-emerald-600' : 'text-slate-400'}`}>{zone.isActive ? 'Shown to applicants' : 'Hidden'}</p></div><button onClick={() => void move(index, -1)} type="button" disabled={index === 0} className="rounded-xl border p-2 disabled:opacity-25"><ChevronUp className="h-4 w-4" /></button><button onClick={() => void move(index, 1)} type="button" disabled={index === zones.length - 1} className="rounded-xl border p-2 disabled:opacity-25"><ChevronDown className="h-4 w-4" /></button><button onClick={() => void toggle(zone)} type="button" className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black ${zone.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}><Power className="h-4 w-4" />{zone.isActive ? 'Active' : 'Inactive'}</button></div>)}</div>}</section></div></DashboardLayout>;
}
