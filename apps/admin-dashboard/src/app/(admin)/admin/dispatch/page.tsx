'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { apiClient } from '@aagam/utils';
import { Bike, ClipboardList, RefreshCw, Store, Truck, User } from 'lucide-react';

type Rider = { id: string; userId: string; status: string; available?: boolean; activeOrderCount?: number; user?: { name?: string | null; phone?: string | null; email?: string | null } };
type Order = { id: string; status: string; grandTotal?: number; createdAt: string; customer?: { name?: string | null; phone?: string | null }; store?: { name?: string | null; address?: string | null }; rider?: { user?: { name?: string | null } }; items?: Array<{ id: string; quantity: number; product?: { name?: string | null } }> };
type Board = { waitingForRider: Order[]; activeDeliveries: Order[]; riders: Rider[] };

export default function AdminDispatchPage() {
  const [board, setBoard] = useState<Board>({ waitingForRider: [], activeDeliveries: [], riders: [] });
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [selectedRiders, setSelectedRiders] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const fetchBoard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/orders/dispatch/board');
      setBoard(res.data);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load dispatch board');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBoard(); }, [fetchBoard]);

  const availableRiders = useMemo(() => board.riders.filter((rider) => rider.available), [board.riders]);

  const assignRider = async (orderId: string) => {
    const riderUserId = selectedRiders[orderId];
    if (!riderUserId) return;
    setAssigning(orderId);
    setError(null);
    try {
      await apiClient.post(`/orders/dispatch/${orderId}/assign`, { riderUserId });
      setSelectedRiders((prev) => ({ ...prev, [orderId]: '' }));
      await fetchBoard();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Rider assignment failed');
    } finally {
      setAssigning(null);
    }
  };

  return (
    <DashboardLayout allowedRole="ADMIN">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="enterprise-kicker">Delivery operations</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">Rider Dispatch Board</h1>
          <p className="mt-2 text-sm text-slate-500">Assign ready-for-pickup orders to available riders and monitor active deliveries.</p>
        </div>
        <button onClick={fetchBoard} className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-xs font-black uppercase text-slate-400">Waiting for rider</p><p className="mt-2 text-3xl font-black">{board.waitingForRider.length}</p></div>
        <div className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-xs font-black uppercase text-slate-400">Available riders</p><p className="mt-2 text-3xl font-black text-emerald-700">{availableRiders.length}</p></div>
        <div className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-xs font-black uppercase text-slate-400">Active deliveries</p><p className="mt-2 text-3xl font-black text-indigo-700">{board.activeDeliveries.length}</p></div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <section className="rounded-[2rem] border bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2"><ClipboardList className="h-5 w-5 text-slate-500" /><h2 className="text-lg font-black">Ready for pickup</h2></div>
          <div className="space-y-3">
            {board.waitingForRider.length === 0 && <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm font-bold text-slate-500">No packed orders waiting for rider.</p>}
            {board.waitingForRider.map((order) => (
              <div key={order.id} className="rounded-2xl border border-slate-100 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm font-black">#{order.id.slice(0, 8).toUpperCase()}</p>
                    <p className="mt-1 text-sm font-bold text-slate-700"><User className="mr-1 inline h-4 w-4" />{order.customer?.name || 'Customer'} · {order.customer?.phone || 'No phone'}</p>
                    <p className="mt-1 text-xs text-slate-500"><Store className="mr-1 inline h-3 w-3" />{order.store?.name || 'Store'} · {order.store?.address || 'No address'}</p>
                  </div>
                  <p className="text-lg font-black">₹{Number(order.grandTotal || 0).toLocaleString('en-IN')}</p>
                </div>
                <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                  {(order.items || []).map((item) => <span key={item.id} className="mr-3 font-bold">{item.product?.name || 'Item'} x{item.quantity}</span>)}
                </div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <select value={selectedRiders[order.id] || ''} onChange={(e) => setSelectedRiders((prev) => ({ ...prev, [order.id]: e.target.value }))} className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold">
                    <option value="">Select available rider</option>
                    {availableRiders.map((rider) => <option key={rider.userId} value={rider.userId}>{rider.user?.name || rider.user?.email || rider.userId.slice(0, 8)}</option>)}
                  </select>
                  <button onClick={() => assignRider(order.id)} disabled={!selectedRiders[order.id] || assigning === order.id} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-black text-white disabled:opacity-40">
                    {assigning === order.id ? 'Assigning...' : 'Assign Rider'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[2rem] border bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2"><Bike className="h-5 w-5 text-slate-500" /><h2 className="text-lg font-black">Riders</h2></div>
          <div className="space-y-2">
            {board.riders.map((rider) => (
              <div key={rider.id} className="flex items-center justify-between rounded-2xl border border-slate-100 px-4 py-3">
                <div><p className="text-sm font-black">{rider.user?.name || rider.user?.email || 'Rider'}</p><p className="text-xs text-slate-500">{rider.user?.phone || 'No phone'} · {rider.activeOrderCount || 0} active</p></div>
                <span className={`rounded-full px-2 py-1 text-[10px] font-black ${rider.available ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{rider.status}</span>
              </div>
            ))}
          </div>
          <div className="mt-6 rounded-2xl bg-indigo-50 p-4">
            <div className="flex items-center gap-2 text-sm font-black text-indigo-800"><Truck className="h-4 w-4" /> Active deliveries</div>
            <div className="mt-3 space-y-2">
              {board.activeDeliveries.length === 0 && <p className="text-xs font-bold text-indigo-700">No active deliveries.</p>}
              {board.activeDeliveries.map((order) => <p key={order.id} className="text-xs font-bold text-indigo-900">#{order.id.slice(0, 8).toUpperCase()} · {order.status} · {order.rider?.user?.name || 'Rider'}</p>)}
            </div>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
