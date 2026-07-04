'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { apiClient } from '@aagam/utils';
import { ShoppingCart, RefreshCw, Clock, CheckCircle, XCircle, Package, User, ClipboardList } from 'lucide-react';

type OrderItem = { id: string; quantity: number; product?: { name: string; image: string | null } | null };
type Payment = { id: string; status: string; method: string };
type RiderInfo = { id: string; user: { name: string } };
type ProductOption = { id: string; name: string; price: number; availability?: { availableQty?: number } };
type Order = { id: string; status: string; grandTotal: number; createdAt: string; customer?: { name: string; email: string; phone?: string } | null; items?: OrderItem[]; payment?: Payment | null; rider?: RiderInfo | null };

const statusConfig: Record<string, { label: string; cls: string; icon: React.ElementType; lane: string }> = {
  PENDING: { label: 'New order', cls: 'bg-amber-100 text-amber-700', icon: Clock, lane: 'New' },
  PAYMENT_PENDING: { label: 'Payment Pending', cls: 'bg-orange-100 text-orange-700', icon: Clock, lane: 'New' },
  CONFIRMED: { label: 'Accepted', cls: 'bg-blue-100 text-blue-700', icon: CheckCircle, lane: 'Accepted' },
  PICKING: { label: 'Preparing', cls: 'bg-indigo-100 text-indigo-700', icon: Package, lane: 'Preparing' },
  PACKED: { label: 'Ready for Pickup', cls: 'bg-violet-100 text-violet-700', icon: Package, lane: 'Ready' },
  RIDER_ASSIGNED: { label: 'Rider Assigned', cls: 'bg-purple-100 text-purple-700', icon: User, lane: 'Rider' },
  OUT_FOR_DELIVERY: { label: 'Out for Delivery', cls: 'bg-cyan-100 text-cyan-700', icon: ShoppingCart, lane: 'Rider' },
  DELIVERED: { label: 'Delivered', cls: 'bg-emerald-100 text-emerald-700', icon: CheckCircle, lane: 'Done' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-red-100 text-red-700', icon: XCircle, lane: 'Done' },
};

type StoreAction = { status: string; label: string };
const STORE_ACTIONS: Record<string, StoreAction[]> = {
  PENDING: [{ status: 'CONFIRMED', label: 'Accept Order' }, { status: 'CANCELLED', label: 'Reject' }],
  PAYMENT_PENDING: [{ status: 'CONFIRMED', label: 'Accept Order' }, { status: 'CANCELLED', label: 'Reject' }],
  CONFIRMED: [{ status: 'PICKING', label: 'Start Preparing' }, { status: 'PACKED', label: 'Ready for Pickup' }, { status: 'CANCELLED', label: 'Cancel' }],
  PICKING: [{ status: 'PACKED', label: 'Ready for Pickup' }, { status: 'CANCELLED', label: 'Cancel' }],
  PACKED: [],
};

const lanes = ['New', 'Accepted', 'Preparing', 'Ready', 'Rider', 'Done'];
const editableItemStates = ['PENDING', 'PAYMENT_PENDING', 'CONFIRMED', 'PICKING'];

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const [substitutes, setSubstitutes] = useState<Record<string, ProductOption[]>>({});

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    setActionErrors({});
    try {
      const res = await apiClient.get('/orders/store');
      setOrders(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, []);

  const updateStatus = async (orderId: string, status: string) => {
    setActionLoading(`${orderId}-${status}`);
    setActionErrors((prev) => ({ ...prev, [orderId]: '' }));
    try {
      if (status === 'PACKED') {
        await apiClient.patch(`/orders/store/${orderId}/ready`);
      } else {
        await apiClient.patch(`/orders/${orderId}/status`, { status });
      }
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status } : o)));
    } catch (e: any) {
      setActionErrors((prev) => ({ ...prev, [orderId]: e?.response?.data?.message || `Failed to update status to ${status}` }));
    } finally {
      setActionLoading(null);
    }
  };

  const markUnavailable = async (orderId: string, itemId: string) => {
    setActionLoading(`${itemId}-unavailable`);
    try {
      await apiClient.patch(`/orders/store/${orderId}/items/${itemId}/unavailable`, { reason: 'Store marked item unavailable' });
      await fetchOrders();
    } catch (e: any) {
      setActionErrors((prev) => ({ ...prev, [orderId]: e?.response?.data?.message || 'Could not mark item unavailable' }));
    } finally {
      setActionLoading(null);
    }
  };

  const loadSubstitutes = async (orderId: string, itemId: string) => {
    setActionLoading(`${itemId}-substitutes`);
    try {
      const res = await apiClient.get(`/orders/store/${orderId}/items/${itemId}/substitutes`);
      setSubstitutes((prev) => ({ ...prev, [itemId]: Array.isArray(res.data) ? res.data : [] }));
    } catch (e: any) {
      setActionErrors((prev) => ({ ...prev, [orderId]: e?.response?.data?.message || 'Could not load substitutes' }));
    } finally {
      setActionLoading(null);
    }
  };

  const applySubstitute = async (orderId: string, itemId: string, productId: string) => {
    setActionLoading(`${itemId}-${productId}`);
    try {
      await apiClient.patch(`/orders/store/${orderId}/items/${itemId}/substitute`, { productId });
      setSubstitutes((prev) => ({ ...prev, [itemId]: [] }));
      await fetchOrders();
    } catch (e: any) {
      setActionErrors((prev) => ({ ...prev, [orderId]: e?.response?.data?.message || 'Could not apply substitute' }));
    } finally {
      setActionLoading(null);
    }
  };

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const actions = (status: string) => STORE_ACTIONS[status] || [];
  const laneCounts = useMemo(() => {
    const counts: Record<string, number> = Object.fromEntries(lanes.map((lane) => [lane, 0]));
    for (const order of orders) {
      const lane = statusConfig[order.status]?.lane || 'New';
      counts[lane] = (counts[lane] || 0) + 1;
    }
    return counts;
  }, [orders]);

  return (
    <DashboardLayout allowedRole="STORE_OWNER">
      <div className="mb-6 flex items-center justify-between"><div><p className="enterprise-kicker">Store fulfillment</p><h1 className="mt-2 text-3xl font-black tracking-tight">Order Queue</h1><p className="mt-2 text-sm text-slate-500">Accept, prepare, handle missing items, and mark orders ready for rider pickup.</p></div><button onClick={fetchOrders} disabled={loading} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button></div>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-6">{lanes.map((lane) => <div key={lane} className="rounded-2xl border bg-white p-4 shadow-sm"><p className="text-xs font-black uppercase text-slate-400">{lane}</p><p className="mt-1 text-2xl font-black text-slate-950">{laneCounts[lane] || 0}</p></div>)}</div>
      {error && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}
      {loading ? <div className="space-y-3">{[1, 2, 3, 4].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />)}</div> : orders.length === 0 ? <div className="rounded-[2rem] border border-dashed border-slate-200 p-16 text-center"><ShoppingCart className="mx-auto h-16 w-16 text-slate-300" /><p className="mt-6 text-2xl font-black text-slate-950">No orders yet</p><p className="mt-2 text-sm text-slate-500">Orders will appear here once customers start ordering.</p></div> : (
        <div className="space-y-4">{orders.map((order) => { const config = statusConfig[order.status] || statusConfig.PENDING; const Icon = config.icon; const orderActions = actions(order.status); const actionErr = actionErrors[order.id]; return <div key={order.id} className="enterprise-card p-5 transition hover:-translate-y-0.5"><div className="flex items-center gap-4"><div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${config.cls.split(' ')[0]}`}><Icon className={`h-5 w-5 ${config.cls.split(' ')[1]}`} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-black text-slate-950">#{order.id.slice(-8).toUpperCase()}</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${config.cls}`}>{config.label}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600">{config.lane}</span></div><p className="mt-1 text-xs text-slate-500">{order.customer?.name || 'Customer'} · {order.customer?.phone || order.customer?.email || 'No contact'} · {new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>{order.rider && <p className="mt-0.5 text-xs text-purple-600">Rider: {order.rider.user.name}</p>}</div><div className="text-right"><p className="text-lg font-black text-slate-950">₹{Number(order.grandTotal).toLocaleString('en-IN')}</p><p className="text-xs text-slate-500">{order.items?.length || 0} line item{(order.items?.length || 0) > 1 ? 's' : ''}</p>{order.payment && <p className={`mt-0.5 text-[10px] font-bold ${order.payment.status === 'COMPLETED' ? 'text-emerald-600' : 'text-amber-600'}`}>{order.payment.method} · {order.payment.status}</p>}</div></div><div className="mt-4 rounded-2xl bg-slate-50 p-4"><div className="mb-2 flex items-center gap-2 text-xs font-black uppercase text-slate-500"><ClipboardList className="h-4 w-4" /> Picking list</div><div className="grid gap-2 md:grid-cols-2">{(order.items || []).map((item) => <div key={item.id} className="rounded-xl bg-white px-3 py-2 text-sm"><div className="flex items-center justify-between"><span className="font-bold text-slate-700">{item.product?.name || 'Product'}</span><span className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-black text-white">x{item.quantity}</span></div>{editableItemStates.includes(order.status) && <div className="mt-2 flex flex-wrap gap-2"><button onClick={() => markUnavailable(order.id, item.id)} disabled={actionLoading === `${item.id}-unavailable`} className="rounded-lg border border-amber-200 px-2 py-1 text-[11px] font-black text-amber-700">Unavailable</button><button onClick={() => loadSubstitutes(order.id, item.id)} disabled={actionLoading === `${item.id}-substitutes`} className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-700">Substitutes</button></div>}{(substitutes[item.id]?.length || 0) > 0 && <div className="mt-2 space-y-1">{(substitutes[item.id] || []).map((product) => <button key={product.id} onClick={() => applySubstitute(order.id, item.id, product.id)} className="block w-full rounded-lg bg-teal-50 px-2 py-1 text-left text-[11px] font-bold text-teal-800">Replace with {product.name} · stock {product.availability?.availableQty ?? '-'}</button>)}</div>}</div>)}</div></div>{order.status === 'PACKED' && <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-black text-violet-700">Ready for rider pickup. Store work is complete.</div>}{orderActions.length > 0 && <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">{orderActions.map((action) => <button key={action.status} onClick={() => updateStatus(order.id, action.status)} disabled={actionLoading === `${order.id}-${action.status}`} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition disabled:opacity-50 ${action.status === 'CANCELLED' ? 'border border-red-200 text-red-600 hover:bg-red-50' : 'bg-slate-900 text-white hover:bg-slate-700'}`}>{actionLoading === `${order.id}-${action.status}` ? '...' : action.label}</button>)}{actionErr && <p className="ml-2 text-[11px] font-medium text-red-600">{actionErr}</p>}</div>}</div>; })}</div>
      )}
    </DashboardLayout>
  );
}
