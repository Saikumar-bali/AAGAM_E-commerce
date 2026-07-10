'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { apiClient } from '@aagam/utils';
import {
  AlertCircle,
  Bike,
  CheckCircle2,
  Clock3,
  PackageCheck,
  RefreshCw,
  Send,
  Store,
  Truck,
  UserRound,
} from 'lucide-react';

type Rider = {
  id: string;
  userId: string;
  status: string;
  available?: boolean;
  activeJobCount?: number;
  user?: { name?: string | null; phone?: string | null; email?: string | null };
};

type Assignment = {
  id: string;
  status: string;
  expiresAt?: string | null;
  riderProfile?: Rider;
};

type Job = {
  id: string;
  orderId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  currentRider?: Rider | null;
  assignments?: Assignment[];
  order: {
    id: string;
    status: string;
    grandTotal?: number;
    createdAt: string;
    customer?: { name?: string | null; phone?: string | null };
    store?: { name?: string | null; address?: string | null };
    items?: Array<{ id: string; quantity: number; product?: { name?: string | null } }>;
  };
};

type Board = {
  waitingJobs: Job[];
  activeJobs: Job[];
  completedJobs: Job[];
  riders: Rider[];
};

const emptyBoard: Board = { waitingJobs: [], activeJobs: [], completedJobs: [], riders: [] };

function ageLabel(date: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60000));
  if (minutes < 1) return 'Just packed';
  if (minutes < 60) return `${minutes} min waiting`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m waiting`;
}

function statusClass(status: string) {
  if (status === 'WAITING_FOR_DISPATCH') return 'bg-amber-50 text-amber-800 ring-amber-200';
  if (status === 'DELIVERED') return 'bg-emerald-50 text-emerald-800 ring-emerald-200';
  if (status === 'DELIVERY_FAILED') return 'bg-red-50 text-red-800 ring-red-200';
  return 'bg-indigo-50 text-indigo-800 ring-indigo-200';
}

export default function AdminDispatchPage() {
  const [board, setBoard] = useState<Board>(emptyBoard);
  const [loading, setLoading] = useState(true);
  const [offering, setOffering] = useState<string | null>(null);
  const [selectedRiders, setSelectedRiders] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const fetchBoard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get('/orders/dispatch/board');
      setBoard({ ...emptyBoard, ...(response.data || {}) });
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load dispatch operations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBoard();
    const interval = window.setInterval(fetchBoard, 20000);
    return () => window.clearInterval(interval);
  }, [fetchBoard]);

  const availableRiders = useMemo(
    () => board.riders.filter((rider) => rider.available),
    [board.riders],
  );

  const offeredCount = useMemo(
    () => board.waitingJobs.filter((job) =>
      job.assignments?.some((assignment) => assignment.status === 'OFFERED'),
    ).length,
    [board.waitingJobs],
  );

  const offerJob = async (job: Job) => {
    const riderUserId = selectedRiders[job.id];
    if (!riderUserId) return;
    setOffering(job.id);
    setError(null);
    setMessage(null);
    try {
      await apiClient.post(`/orders/dispatch/jobs/${job.id}/offers`, {
        riderUserId,
        expiresInSeconds: 60,
      });
      setSelectedRiders((current) => ({ ...current, [job.id]: '' }));
      setMessage(`Offer sent for order #${job.orderId.slice(0, 8).toUpperCase()}.`);
      await fetchBoard();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not create rider offer');
    } finally {
      setOffering(null);
    }
  };

  return (
    <DashboardLayout allowedRole="ADMIN">
      <div className="space-y-6">
        <header className="flex flex-col gap-4 rounded-[2rem] border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-6 text-white shadow-xl sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-indigo-300">Delivery command centre</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">Dispatch Operations</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              Offer packed orders to one available rider at a time. Riders must accept before the delivery becomes active.
            </p>
          </div>
          <button
            onClick={fetchBoard}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-slate-900 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh board
          </button>
        </header>

        {error && (
          <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">
            <AlertCircle className="h-4 w-4" /> {error}
          </div>
        )}
        {message && (
          <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
            <CheckCircle2 className="h-4 w-4" /> {message}
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Waiting jobs', value: board.waitingJobs.length, icon: PackageCheck, cls: 'text-amber-700 bg-amber-50' },
            { label: 'Offers pending', value: offeredCount, icon: Send, cls: 'text-violet-700 bg-violet-50' },
            { label: 'Available riders', value: availableRiders.length, icon: Bike, cls: 'text-emerald-700 bg-emerald-50' },
            { label: 'Active deliveries', value: board.activeJobs.length, icon: Truck, cls: 'text-indigo-700 bg-indigo-50' },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className={`inline-flex rounded-xl p-2.5 ${item.cls}`}><item.icon className="h-5 w-5" /></div>
              <p className="mt-4 text-xs font-black uppercase tracking-wider text-slate-400">{item.label}</p>
              <p className="mt-1 text-3xl font-black text-slate-950">{item.value}</p>
            </div>
          ))}
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.45fr_0.8fr]">
          <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-950">Ready for dispatch</h2>
                <p className="mt-1 text-sm text-slate-500">Only packed orders appear here.</p>
              </div>
              <Clock3 className="h-5 w-5 text-slate-400" />
            </div>

            <div className="space-y-4">
              {!loading && board.waitingJobs.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
                  <PackageCheck className="mx-auto h-8 w-8 text-slate-400" />
                  <p className="mt-3 font-black text-slate-700">No packed orders are waiting.</p>
                  <p className="mt-1 text-sm text-slate-500">New delivery jobs appear when a store marks an order ready for pickup.</p>
                </div>
              )}

              {board.waitingJobs.map((job) => {
                const openOffer = job.assignments?.find((assignment) => assignment.status === 'OFFERED');
                return (
                  <article key={job.id} className="rounded-2xl border border-slate-200 p-4 transition hover:border-indigo-200 hover:shadow-md">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-mono text-sm font-black text-slate-950">#{job.orderId.slice(0, 8).toUpperCase()}</p>
                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ring-1 ${statusClass(job.status)}`}>{job.status.replaceAll('_', ' ')}</span>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600">{ageLabel(job.createdAt)}</span>
                        </div>
                        <p className="mt-3 flex items-center gap-2 text-sm font-bold text-slate-800"><UserRound className="h-4 w-4 text-slate-400" />{job.order.customer?.name || 'Customer'} · {job.order.customer?.phone || 'No phone'}</p>
                        <p className="mt-1 flex items-center gap-2 text-xs text-slate-500"><Store className="h-4 w-4" />{job.order.store?.name || 'Store'} · {job.order.store?.address || 'Address unavailable'}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {(job.order.items || []).map((item) => (
                            <span key={item.id} className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-600">
                              {item.product?.name || 'Item'} × {item.quantity}
                            </span>
                          ))}
                        </div>
                      </div>
                      <p className="whitespace-nowrap text-xl font-black text-slate-950">₹{Number(job.order.grandTotal || 0).toLocaleString('en-IN')}</p>
                    </div>

                    {openOffer ? (
                      <div className="mt-4 flex items-center justify-between rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
                        <div>
                          <p className="text-xs font-black uppercase tracking-wide text-violet-700">Awaiting rider response</p>
                          <p className="mt-1 text-sm font-bold text-violet-950">{openOffer.riderProfile?.user?.name || openOffer.riderProfile?.user?.email || 'Selected rider'}</p>
                        </div>
                        <Clock3 className="h-5 w-5 text-violet-500" />
                      </div>
                    ) : (
                      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                        <select
                          value={selectedRiders[job.id] || ''}
                          onChange={(event) => setSelectedRiders((current) => ({ ...current, [job.id]: event.target.value }))}
                          className="min-h-11 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:border-indigo-500"
                        >
                          <option value="">Select an available rider</option>
                          {availableRiders.map((rider) => (
                            <option key={rider.userId} value={rider.userId}>
                              {rider.user?.name || rider.user?.email || rider.userId.slice(0, 8)} {rider.user?.phone ? `· ${rider.user.phone}` : ''}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => offerJob(job)}
                          disabled={!selectedRiders[job.id] || offering === job.id}
                          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Send className="h-4 w-4" /> {offering === job.id ? 'Sending...' : 'Send offer'}
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>

          <div className="space-y-6">
            <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-black text-slate-950">Rider availability</h2>
              <div className="mt-4 space-y-2">
                {board.riders.map((rider) => (
                  <div key={rider.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-900">{rider.user?.name || rider.user?.email || 'Rider'}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{rider.user?.phone || 'No phone'} · {rider.activeJobCount || 0} active</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${rider.available ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                      {rider.available ? 'AVAILABLE' : rider.status}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-black text-slate-950">Active delivery state</h2>
              <div className="mt-4 space-y-3">
                {board.activeJobs.length === 0 && <p className="rounded-xl bg-slate-50 p-4 text-sm font-bold text-slate-500">No active deliveries.</p>}
                {board.activeJobs.map((job) => (
                  <div key={job.id} className="rounded-xl border border-slate-100 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-mono text-xs font-black">#{job.orderId.slice(0, 8).toUpperCase()}</p>
                      <span className={`rounded-full px-2 py-1 text-[9px] font-black ring-1 ${statusClass(job.status)}`}>{job.status.replaceAll('_', ' ')}</span>
                    </div>
                    <p className="mt-2 text-sm font-bold text-slate-800">{job.currentRider?.user?.name || 'Assigned rider'}</p>
                    <p className="mt-1 text-xs text-slate-500">{job.order.store?.name || 'Store'} → {job.order.customer?.name || 'Customer'}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
