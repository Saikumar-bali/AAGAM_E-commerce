'use client';

import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Check, GripVertical, Loader2 } from 'lucide-react';
import { apiClient } from '@aagam/utils';
import { getToastErrorMessage, useToast } from '@/components/ToastProvider';

type Stop = {
  id: string;
  sequenceNumber: number;
  cashDuePaise: number;
  deliveryJob: { order: { customer?: { name?: string | null } | null } };
};

type Run = {
  id: string;
  routeCode: string;
  version: number;
  stops: Stop[];
};

export default function RunStopOrderEditor({
  run,
  reason,
  disabled,
  onSaved,
}: {
  run: Run;
  reason: string;
  disabled?: boolean;
  onSaved: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [ordered, setOrdered] = useState<Stop[]>(run.stops);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setOrdered(run.stops); }, [run.id, run.version, run.stops]);

  const move = (index: number, direction: -1 | 1) => {
    const destination = index + direction;
    if (destination < 0 || destination >= ordered.length) return;
    setOrdered((current) => {
      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
  };

  const changed = ordered.some((stop, index) => run.stops[index]?.id !== stop.id);
  const save = async () => {
    if (!reason.trim() || reason.trim().length < 3) {
      toast.warning('Enter an operational reason before reordering stops.');
      return;
    }
    setSaving(true);
    try {
      await apiClient.post(`/admin/subscriptions/regional-routing/runs/${run.id}/reorder`, {
        version: run.version,
        orderedStopIds: ordered.map((stop) => stop.id),
        reason: reason.trim(),
      });
      toast.success('Pending route order updated and audited.');
      await onSaved();
    } catch (error) {
      toast.error(getToastErrorMessage(error, 'Route order could not be updated.'));
    } finally { setSaving(false); }
  };

  return <section className="rounded-3xl border border-slate-200 bg-white p-5">
    <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wider text-emerald-700">Keyboard and touch safe</p><h3 className="mt-1 font-black text-slate-950">Reorder pending stops</h3><p className="mt-1 text-xs text-slate-500">Use the arrow buttons to move each stop. The current active stop is protected server-side.</p></div><GripVertical className="h-5 w-5 text-slate-400"/></div>
    <ol className="mt-4 space-y-2">{ordered.map((stop, index) => <li key={stop.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-sm font-black text-slate-700">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-slate-900">{stop.deliveryJob.order.customer?.name || 'Customer'}</p><p className="mt-1 text-xs text-slate-500">Current stop {stop.sequenceNumber}{stop.cashDuePaise > 0 ? ` · cash ₹${(stop.cashDuePaise / 100).toLocaleString('en-IN')}` : ' · ₹0 funded'}</p></div><button type="button" aria-label={`Move stop ${index + 1} earlier`} disabled={disabled || index === 0} onClick={() => move(index, -1)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 disabled:opacity-35"><ArrowUp className="h-4 w-4"/></button><button type="button" aria-label={`Move stop ${index + 1} later`} disabled={disabled || index === ordered.length - 1} onClick={() => move(index, 1)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 disabled:opacity-35"><ArrowDown className="h-4 w-4"/></button></li>)}</ol>
    <button disabled={disabled || !changed || saving} onClick={() => void save()} className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 font-black text-white disabled:opacity-45">{saving ? <Loader2 className="h-5 w-5 animate-spin"/> : <Check className="h-5 w-5"/>}Save audited stop order</button>
  </section>;
}
