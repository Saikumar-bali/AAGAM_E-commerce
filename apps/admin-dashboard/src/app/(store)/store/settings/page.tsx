'use client';

import React, { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { apiClient } from '@aagam/utils';
import { Clock, Loader2, Save, Store as StoreIcon } from 'lucide-react';

type OwnedStore = {
  id: string;
  name: string;
  address: string;
  isActive: boolean;
};

type OperatingWindow = { openMinute: number; closeMinute: number };
type OperatingDay = { dayOfWeek: number; windows: OperatingWindow[] };
type HoursResponse = {
  operatingHours: OperatingDay[];
  timezone: string;
  openNow: boolean;
  nextOpenAt: string | null;
};

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TIMEZONE_OPTIONS = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Karachi', 'Asia/Kathmandu', 'Asia/Dhaka', 'UTC'];

function minutesToTime(minute: number): string {
  const h = Math.floor(minute / 60) % 24;
  const m = minute % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function timeToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function minutesToLabel(minute: number): string {
  const h = Math.floor(minute / 60) % 24;
  const m = minute % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour12} ${period}` : `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

export default function StoreSettingsPage() {
  const [stores, setStores] = useState<OwnedStore[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [hours, setHours] = useState<HoursResponse | null>(null);
  const [draft, setDraft] = useState<OperatingDay[]>([]);
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const fetchStores = async () => {
    try {
      const response = await apiClient.get('/store-owner/stores');
      const list = Array.isArray(response.data) ? (response.data as OwnedStore[]) : [];
      setStores(list);
      if (list.length > 0) setSelectedStoreId((current) => current && list.some((s) => s.id === current) ? current : list[0].id);
    } catch (cause: any) {
      setError(cause?.response?.data?.message || cause?.message || 'Failed to load stores.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchStores();
  }, []);

  useEffect(() => {
    if (!selectedStoreId) return;
    let active = true;
    setLoading(true);
    setError(null);
    apiClient.get(`/store-owner/stores/${selectedStoreId}/operating-hours`)
      .then((response) => {
        if (!active) return;
        const data = response.data as HoursResponse;
        setHours(data);
        setTimezone(data.timezone || 'Asia/Kolkata');
        setDraft((data.operatingHours || []).map((day) => ({
          dayOfWeek: day.dayOfWeek,
          windows: day.windows.map((window) => ({ openMinute: window.openMinute, closeMinute: window.closeMinute })),
        })));
      })
      .catch((cause: any) => active && setError(cause?.response?.data?.message || 'Failed to load operating hours.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [selectedStoreId]);

  const draftByDay = useMemo(() => {
    const map = new Map<number, OperatingWindow[]>();
    for (const day of draft) map.set(day.dayOfWeek, day.windows);
    return map;
  }, [draft]);

  const summary = useMemo(() => {
    if (!hours) return null;
    if (hours.operatingHours.length === 0) {
      return { tone: 'open', text: 'Open 24×7 — no operating hours set' };
    }
    if (hours.openNow) {
      return { tone: 'open', text: 'Open now' };
    }
    return {
      tone: 'closed',
      text: hours.nextOpenAt
        ? `Closed · Opens ${new Date(hours.nextOpenAt).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: hours.timezone })}`
        : 'Closed',
    };
  }, [hours]);

  const setDayOpen = (dayOfWeek: number, open: boolean) => {
    setDraft((current) => {
      const exists = current.some((day) => day.dayOfWeek === dayOfWeek);
      if (open && !exists) {
        return [...current, { dayOfWeek, windows: [{ openMinute: 6 * 60, closeMinute: 21 * 60 }] }].sort((a, b) => a.dayOfWeek - b.dayOfWeek);
      }
      if (!open) {
        return current.filter((day) => day.dayOfWeek !== dayOfWeek);
      }
      return current;
    });
  };

  const setWindow = (dayOfWeek: number, index: number, patch: Partial<OperatingWindow>) => {
    setDraft((current) => current.map((day) => day.dayOfWeek !== dayOfWeek ? day : {
      ...day,
      windows: day.windows.map((window, i) => i === index ? { ...window, ...patch } : window),
    }));
  };

  const addWindow = (dayOfWeek: number) => {
    setDraft((current) => current.map((day) => day.dayOfWeek !== dayOfWeek || day.windows.length >= 2 ? day : {
      ...day,
      windows: [...day.windows, { openMinute: 16 * 60, closeMinute: 20 * 60 }],
    }));
  };

  const removeWindow = (dayOfWeek: number, index: number) => {
    setDraft((current) => current.map((day) => day.dayOfWeek !== dayOfWeek || day.windows.length <= 1 ? day : {
      ...day,
      windows: day.windows.filter((_, i) => i !== index),
    }));
  };

  const save = async () => {
    if (!selectedStoreId) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const response = await apiClient.put(`/store-owner/stores/${selectedStoreId}/operating-hours`, {
        operatingHours: draft,
        timezone,
      });
      setHours(response.data as HoursResponse);
      setSaved(true);
    } catch (cause: any) {
      setError(cause?.response?.data?.message || cause?.message || 'Failed to save operating hours.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout allowedRole="STORE_OWNER">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="enterprise-kicker">Store settings</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">Operating hours</h1>
        </div>
        {summary ? (
          <span className={`rounded-full px-4 py-2 text-xs font-black ${summary.tone === 'open' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
            {summary.text}
          </span>
        ) : null}
      </div>

      {error ? <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}
      {saved ? <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">Operating hours saved. Changes apply to new orders immediately.</div> : null}

      {stores.length > 1 ? (
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <StoreIcon className="h-4 w-4 text-slate-400" />
          <select value={selectedStoreId || ''} onChange={(event) => setSelectedStoreId(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-teal-500">
            {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
          </select>
        </div>
      ) : null}

      {loading ? (
        <div className="grid h-48 place-items-center rounded-[2rem] bg-slate-50"><Loader2 className="h-6 w-6 animate-spin text-teal-700" /></div>
      ) : !selectedStoreId ? (
        <div className="rounded-[2rem] border border-dashed border-slate-200 p-16 text-center">
          <StoreIcon className="mx-auto h-16 w-16 text-slate-300" />
          <p className="mt-6 text-2xl font-black text-slate-950">No stores yet</p>
          <p className="mt-2 text-sm text-slate-500">Contact the admin to create your first store.</p>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="enterprise-card">
            <div className="mb-5 flex items-start gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-100 text-teal-700"><Clock className="h-5 w-5" /></span>
              <div>
                <h2 className="text-lg font-black text-slate-950">Weekly schedule</h2>
                <p className="mt-1 text-sm text-slate-500">
                  When the store is closed, customers cannot order instantly — they see a &quot;store closed&quot; notice and can pre-order for the next open window. Days without hours stay closed; clearing all days makes the store open 24×7.
                </p>
              </div>
            </div>
            <div className="grid gap-2.5">
              {DAY_LABELS.map((label, dayOfWeek) => {
                const windows = draftByDay.get(dayOfWeek) || [];
                const open = windows.length > 0;
                return (
                  <div key={dayOfWeek} className={`rounded-2xl border p-4 ${open ? 'border-teal-200 bg-teal-50/40' : 'border-slate-200 bg-slate-50/60'}`}>
                    <div className="flex items-center justify-between gap-3">
                      <label className="flex cursor-pointer items-center gap-3">
                        <input type="checkbox" checked={open} onChange={(event) => setDayOpen(dayOfWeek, event.target.checked)} className="h-4 w-4 accent-teal-700" />
                        <span className={`text-sm font-black ${open ? 'text-slate-950' : 'text-slate-400'}`}>{label}</span>
                        {open ? <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-black text-teal-700">Open</span> : <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-black text-slate-500">Closed</span>}
                      </label>
                      {open && windows.length < 2 ? (
                        <button onClick={() => addWindow(dayOfWeek)} className="rounded-lg border border-teal-200 bg-white px-2.5 py-1.5 text-[11px] font-black text-teal-700 hover:bg-teal-50">+ Add window</button>
                      ) : null}
                    </div>
                    {open ? (
                      <div className="mt-3 grid gap-2">
                        {windows.map((window, index) => (
                          <div key={index} className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-3">
                            <input type="time" value={minutesToTime(window.openMinute)} onChange={(event) => setWindow(dayOfWeek, index, { openMinute: timeToMinutes(event.target.value) })} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm font-bold text-slate-900 outline-none focus:border-teal-500" />
                            <span className="text-xs font-black text-slate-400">to</span>
                            <input type="time" value={minutesToTime(window.closeMinute)} onChange={(event) => setWindow(dayOfWeek, index, { closeMinute: timeToMinutes(event.target.value) })} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm font-bold text-slate-900 outline-none focus:border-teal-500" />
                            <span className="text-xs font-semibold text-slate-500">{minutesToLabel(window.openMinute)} – {minutesToLabel(window.closeMinute)}{window.closeMinute <= window.openMinute ? ' · crosses midnight' : ''}</span>
                            <button onClick={() => removeWindow(dayOfWeek, index)} className="ml-auto rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] font-black text-red-700 hover:bg-red-100">Remove</button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="enterprise-card">
            <h2 className="text-lg font-black text-slate-950">Timezone</h2>
            <p className="mt-1 text-sm text-slate-500">Hours above are interpreted in this zone. Times shown to customers match it.</p>
            <select value={timezone} onChange={(event) => setTimezone(event.target.value)} className="mt-3 w-full max-w-xs rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-teal-500">
              {TIMEZONE_OPTIONS.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
            </select>
          </div>

          <button onClick={() => void save()} disabled={saving} className="flex items-center gap-2 rounded-xl bg-slate-950 px-6 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Saving…' : 'Save operating hours'}
          </button>
        </div>
      )}
    </DashboardLayout>
  );
}