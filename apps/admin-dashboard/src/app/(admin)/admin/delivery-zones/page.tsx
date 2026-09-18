'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, MapPinned, Plus, Power, Pencil, X, Check } from 'lucide-react';
import { apiClient } from '@aagam/utils';
import DashboardLayout from '@/components/DashboardLayout';
import { DataTable } from '@/components/DataTable';

type Zone = {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  centerLatitude: number | null;
  centerLongitude: number | null;
  fallbackRadiusKm: number | null;
  timezone: string | null;
};

export default function DeliveryZonesPage() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    centerLatitude: string;
    centerLongitude: string;
    fallbackRadiusKm: string;
    timezone: string;
  }>({ centerLatitude: '', centerLongitude: '', fallbackRadiusKm: '', timezone: '' });
  const [savingEdit, setSavingEdit] = useState(false);

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

  const startEdit = (zone: Zone) => {
    setEditingId(zone.id);
    setEditForm({
      centerLatitude: zone.centerLatitude?.toString() ?? '',
      centerLongitude: zone.centerLongitude?.toString() ?? '',
      fallbackRadiusKm: zone.fallbackRadiusKm?.toString() ?? '',
      timezone: zone.timezone ?? '',
    });
    setError(''); setMessage('');
  };

  const saveEdit = async (id: string) => {
    setSavingEdit(true); setError(''); setMessage('');
    try {
      const payload: Record<string, unknown> = {};
      if (editForm.centerLatitude) payload.centerLatitude = parseFloat(editForm.centerLatitude);
      else payload.centerLatitude = null;
      if (editForm.centerLongitude) payload.centerLongitude = parseFloat(editForm.centerLongitude);
      else payload.centerLongitude = null;
      if (editForm.fallbackRadiusKm) payload.fallbackRadiusKm = parseFloat(editForm.fallbackRadiusKm);
      else payload.fallbackRadiusKm = null;
      if (editForm.timezone.trim()) payload.timezone = editForm.timezone.trim();
      else payload.timezone = null;
      await apiClient.patch(`/stores/delivery-zones/${id}`, payload);
      setMessage('Zone coordinates updated.');
      setEditingId(null);
      await load();
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || 'Could not update zone.');
    } finally {
      setSavingEdit(false);
    }
  };

  const zoneColumns = [
    { key: 'order', header: '#', align: 'center' as const, width: '50px', render: (row: Zone, index: number) => <span className="grid h-8 w-8 place-items-center rounded-lg bg-teal-50 font-black text-teal-700">{index + 1}</span> },
    { key: 'name', header: 'Zone Name', align: 'left' as const, render: (row: Zone) => <span className="font-black">{row.name}</span> },
    {
      key: 'coords', header: 'Coordinates', align: 'left' as const,
      render: (row: Zone) => {
        if (editingId === row.id) {
          return (
            <div className="flex flex-col gap-1.5">
              <div className="flex gap-1.5">
                <input
                  type="number"
                  step="any"
                  placeholder="Latitude"
                  value={editForm.centerLatitude}
                  onChange={(e) => setEditForm((p) => ({ ...p, centerLatitude: e.target.value }))}
                  className="w-28 rounded-lg border px-2 py-1 text-xs font-semibold"
                />
                <input
                  type="number"
                  step="any"
                  placeholder="Longitude"
                  value={editForm.centerLongitude}
                  onChange={(e) => setEditForm((p) => ({ ...p, centerLongitude: e.target.value }))}
                  className="w-28 rounded-lg border px-2 py-1 text-xs font-semibold"
                />
              </div>
              <div className="flex gap-1.5">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="Radius (km)"
                  value={editForm.fallbackRadiusKm}
                  onChange={(e) => setEditForm((p) => ({ ...p, fallbackRadiusKm: e.target.value }))}
                  className="w-28 rounded-lg border px-2 py-1 text-xs font-semibold"
                />
                <input
                  type="text"
                  placeholder="Timezone"
                  value={editForm.timezone}
                  onChange={(e) => setEditForm((p) => ({ ...p, timezone: e.target.value }))}
                  className="flex-1 rounded-lg border px-2 py-1 text-xs font-semibold"
                />
              </div>
            </div>
          );
        }
        const hasCoords = row.centerLatitude != null && row.centerLongitude != null;
        if (!hasCoords) return <span className="text-xs text-slate-400 italic">No coordinates set</span>;
        return (
          <div className="text-xs">
            <span className="font-mono font-semibold">{row.centerLatitude}, {row.centerLongitude}</span>
            {row.fallbackRadiusKm ? <span className="ml-1.5 text-teal-600 font-black">{'\u00B1'}{row.fallbackRadiusKm}km</span> : null}
          </div>
        );
      }
    },
    { key: 'status', header: 'Status', align: 'center' as const, render: (row: Zone) => row.isActive ? <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">Active</span> : <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">Hidden</span> },
    { key: 'actions', header: 'Actions', align: 'center' as const, render: (row: Zone, index: number) => {
      if (editingId === row.id) {
        return (
          <div className="flex items-center justify-center gap-1">
            <button onClick={() => void saveEdit(row.id)} disabled={savingEdit} className="rounded-xl bg-emerald-600 p-2 text-white disabled:opacity-50" title="Save">
              {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </button>
            <button onClick={() => setEditingId(null)} className="rounded-xl border p-2" title="Cancel"><X className="h-4 w-4" /></button>
          </div>
        );
      }
      return (
        <div className="flex items-center justify-center gap-1">
          <button onClick={() => void move(index, -1)} type="button" disabled={index === 0} className="rounded-xl border p-2 disabled:opacity-25" title="Move up"><ChevronUp className="h-4 w-4" /></button>
          <button onClick={() => void move(index, 1)} type="button" disabled={index === zones.length - 1} className="rounded-xl border p-2 disabled:opacity-25" title="Move down"><ChevronDown className="h-4 w-4" /></button>
          <button onClick={() => startEdit(row)} type="button" className="rounded-xl border p-2 text-slate-600 hover:bg-slate-50" title="Edit coordinates"><Pencil className="h-3.5 w-3.5" /></button>
          <button onClick={() => void toggle(row)} type="button" className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-black ${row.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`} title={row.isActive ? 'Hide' : 'Show'}><Power className="h-3.5 w-3.5" />{row.isActive ? 'Active' : 'Inactive'}</button>
        </div>
      );
    } },
  ];

  return (
    <DashboardLayout allowedRole="ADMIN">
      <div className="mx-auto max-w-5xl space-y-6 pb-12">
        <header>
          <p className="text-xs font-black uppercase tracking-[.2em] text-teal-700">Service-area controls</p>
          <h1 className="mt-2 text-3xl font-black">Delivery Zones</h1>
          <p className="mt-2 text-sm font-semibold text-slate-500">
            Create zones, set center coordinates + radius for serviceability checks. Click the{' '}
            <Pencil className="inline h-3.5 w-3.5" /> icon to edit coordinates.
          </p>
        </header>
        {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{String(error)}</div> : null}
        {message ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">{message}</div> : null}
        <form onSubmit={create} className="flex gap-3 rounded-3xl border bg-white p-5 shadow-sm">
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="New service area, e.g. Rushikonda" className="min-w-0 flex-1 rounded-xl border px-4 py-3 font-semibold" required minLength={2} />
          <button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-3 font-black text-white disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add zone
          </button>
        </form>
        <div className="rounded-3xl border bg-white shadow-sm">
          <DataTable<Zone>
            columns={zoneColumns}
            data={zones}
            keyExtractor={(row) => row.id}
            emptyText="No delivery zones configured"
            loading={loading}
            title="Delivery Zones"
            searchPlaceholder="Search zones..."
          />
        </div>
      </div>
    </DashboardLayout>
  );
}
