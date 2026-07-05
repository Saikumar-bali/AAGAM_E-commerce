'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { apiClient } from '@aagam/utils';
import { formatINR } from '@/lib/currency';
import EmptyState from '@/components/customer/EmptyState';
import {
  Calendar, ChevronRight, Package, RefreshCw, Store, Clock,
  CheckCircle2, XCircle, Truck, ShoppingBag, Filter, Bike,
} from 'lucide-react';

type OrderStatus = 'PENDING' | 'PAYMENT_PENDING' | 'PAYMENT_FAILED' | 'CONFIRMED' | 'PICKING' | 'PACKED' | 'RIDER_ASSIGNED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED';

type Order = {
  id: string;
  status: OrderStatus;
  currency: string;
  totalAmount: number;
  grandTotal?: number;
  createdAt: string;
  store?: { name: string | null } | null;
  payment?: { method: 'ONLINE' | 'COD'; status: string } | null;
  items?: Array<{ id: string; quantity: number; product?: { name?: string | null; image?: string | null } | null }>;
  rider?: { user?: { name?: string | null } | null } | null;
};

const statusConfig: Record<OrderStatus, { label: string; message: string; cls: string; icon: any; step: number }> = {
  PENDING: { label: 'Pending', message: 'Waiting for store confirmation.', cls: 'bg-amber-50 text-amber-700 border-amber-200', icon: Clock, step: 1 },
  PAYMENT_PENDING: { label: 'Payment Pending', message: 'Waiting for payment confirmation.', cls: 'bg-amber-50 text-amber-700 border-amber-200', icon: Clock, step: 1 },
  PAYMENT_FAILED: { label: 'Payment Failed', message: 'Payment failed. Please retry checkout.', cls: 'bg-red-50 text-red-700 border-red-200', icon: XCircle, step: 0 },
  CONFIRMED: { label: 'Confirmed', message: 'Store accepted your order.', cls: 'bg-blue-50 text-blue-700 border-blue-200', icon: CheckCircle2, step: 2 },
  PICKING: { label: 'Preparing', message: 'Store is picking your items.', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200', icon: Package, step: 3 },
  PACKED: { label: 'Ready for Rider', message: 'Packed and waiting for rider pickup.', cls: 'bg-violet-50 text-violet-700 border-violet-200', icon: Package, step: 4 },
  RIDER_ASSIGNED: { label: 'Rider Assigned', message: 'Rider assigned and heading to the store.', cls: 'bg-purple-50 text-purple-700 border-purple-200', icon: Bike, step: 5 },
  OUT_FOR_DELIVERY: { label: 'Out for Delivery', message: 'Your order is on the way.', cls: 'bg-cyan-50 text-cyan-700 border-cyan-200', icon: Truck, step: 6 },
  DELIVERED: { label: 'Delivered', message: 'Delivered successfully.', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2, step: 7 },
  CANCELLED: { label: 'Cancelled', message: 'This order was cancelled.', cls: 'bg-red-50 text-red-700 border-red-200', icon: XCircle, step: -1 },
};

const filters = [
  { label: 'All', value: 'All' },
  { label: 'Active', value: 'Active' },
  { label: 'Delivered', value: 'DELIVERED' },
  { label: 'Cancelled', value: 'CANCELLED' },
];

const activeStatuses: OrderStatus[] = ['PENDING', 'PAYMENT_PENDING', 'CONFIRMED', 'PICKING', 'PACKED', 'RIDER_ASSIGNED', 'OUT_FOR_DELIVERY'];

export default function CustomerOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('All');
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const fetchOrders = async () => {
    setLoading(true); setError(null);
    try { const res = await apiClient.get('/orders/my'); setOrders(Array.isArray(res.data) ? (res.data as Order[]) : []); }
    catch (e: any) { setError(e?.response?.data?.message || 'Failed to load orders'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchOrders(); }, []);

  const cancelOrder = async (orderId: string) => {
    setCancellingId(orderId);
    try { await apiClient.patch(`/orders/my/${orderId}/cancel`); await fetchOrders(); }
    catch (e: any) { setError(e?.response?.data?.message || 'Failed to cancel order'); }
    setCancellingId(null);
  };

  const filteredOrders = useMemo(() => {
    if (statusFilter === 'All') return orders;
    if (statusFilter === 'Active') return orders.filter(o => activeStatuses.includes(o.status));
    return orders.filter(o => o.status === statusFilter);
  }, [orders, statusFilter]);

  const stats = useMemo(() => ({
    total: orders.length,
    totalSpent: orders.reduce((sum, o) => sum + (Number(o.grandTotal ?? o.totalAmount) || 0), 0),
    delivered: orders.filter(o => o.status === 'DELIVERED').length,
    active: orders.filter(o => activeStatuses.includes(o.status)).length,
  }), [orders]);

  return (
    <DashboardLayout allowedRole="CUSTOMER">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-black text-slate-950 tracking-tight">My Orders</h1>
            <p className="text-sm font-semibold text-slate-500 mt-1">Track rider assignment, pickup, live delivery and delivered proof.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => router.push('/shop')} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-black text-slate-700 hover:bg-slate-50 transition-colors">
              <ShoppingBag className="h-4 w-4" /> Shop
            </button>
            <button onClick={fetchOrders} disabled={loading} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-950 text-sm font-black text-white hover:bg-teal-700 transition-colors disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </div>

        {error && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800 flex items-center gap-2"><XCircle className="h-4 w-4" /> {error}</div>}

        {!loading && orders.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Total Orders', value: stats.total, icon: Package, color: 'bg-teal-100 text-teal-700' },
              { label: 'Total Spent', value: formatINR(stats.totalSpent), icon: Store, color: 'bg-amber-100 text-amber-700' },
              { label: 'Delivered', value: stats.delivered, icon: CheckCircle2, color: 'bg-emerald-100 text-emerald-700' },
              { label: 'Active', value: stats.active, icon: Truck, color: 'bg-violet-100 text-violet-700' },
            ].map((stat) => <div key={stat.label} className="rounded-2xl border border-slate-100 bg-white p-4"><div className="flex items-center justify-between"><div><p className="text-xs font-bold text-slate-500">{stat.label}</p><p className="mt-1 text-xl font-black text-slate-950">{stat.value}</p></div><div className={`grid h-10 w-10 place-items-center rounded-xl ${stat.color}`}><stat.icon className="h-5 w-5" /></div></div></div>)}
          </div>
        )}

        {!loading && orders.length > 0 && (
          <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1"><Filter className="h-4 w-4 text-slate-400 shrink-0" />{filters.map((f) => <button key={f.value} onClick={() => setStatusFilter(f.value)} className={`shrink-0 px-3.5 py-2 rounded-xl text-xs font-black transition-colors ${statusFilter === f.value ? 'bg-slate-950 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{f.label}</button>)}</div>
        )}

        {loading && <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[1, 2, 3, 4].map((i) => <div key={i} className="animate-pulse rounded-2xl border border-slate-100 bg-white p-5"><div className="flex justify-between"><div className="h-5 bg-slate-100 rounded w-32" /><div className="h-6 bg-slate-100 rounded w-20" /></div><div className="mt-4 h-4 bg-slate-100 rounded w-48" /><div className="mt-6 h-12 bg-slate-100 rounded w-full" /></div>)}</div>}
        {!loading && orders.length === 0 && <EmptyState icon={ShoppingBag} title="No orders yet" description="Start shopping to see your orders here." action={{ label: 'Start Shopping', onClick: () => router.push('/shop') }} />}
        {!loading && filteredOrders.length === 0 && orders.length > 0 && <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center"><Package className="h-10 w-10 text-slate-300 mx-auto mb-3" /><p className="text-sm font-bold text-slate-500">No orders match this filter</p></div>}

        {!loading && filteredOrders.length > 0 && (
          <div className="space-y-3">
            {filteredOrders.map((order) => {
              const config = statusConfig[order.status] || statusConfig.PENDING;
              const amount = Number(order.grandTotal ?? order.totalAmount) || 0;
              const Icon = config.icon;
              const isActive = activeStatuses.includes(order.status);
              return (
                <div key={order.id} className="rounded-2xl border border-slate-100 bg-white overflow-hidden hover:shadow-md transition-all cursor-pointer" onClick={() => router.push(`/shop/orders/${order.id}`)}>
                  <div className={`h-1 ${config.cls.split(' ')[0]}`} />
                  <div className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2.5 mb-2"><span className="font-mono text-sm font-black text-slate-950">#{order.id.slice(-8).toUpperCase()}</span><span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-black border ${config.cls}`}><Icon className="h-3 w-3" /> {config.label}</span></div>
                        <p className="mb-2 text-xs font-bold text-slate-600">{config.message}</p>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 font-semibold"><span className="flex items-center gap-1"><Store className="h-3.5 w-3.5" />{order.store?.name || 'Store'}</span><span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span><span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${order.payment?.method === 'COD' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{order.payment?.method === 'COD' ? 'COD' : 'PREPAID'}</span></div>
                      </div>
                      <div className="flex items-center gap-3"><div className="text-right"><div className="text-lg font-black text-slate-950">{formatINR(amount)}</div>{order.items && <div className="text-[11px] font-bold text-slate-400">{order.items.length} item{order.items.length !== 1 ? 's' : ''}</div>}</div><div className={`grid h-8 w-8 place-items-center rounded-xl ${isActive ? 'bg-teal-100 text-teal-600' : 'bg-slate-100 text-slate-400'}`}><ChevronRight className="h-4 w-4" /></div></div>
                    </div>
                    {isActive && <div className="mt-3 pt-3 border-t border-slate-100"><div className="flex gap-1.5">{[1, 2, 3, 4, 5, 6, 7].map((step) => <div key={step} className={`h-1.5 flex-1 rounded-full ${step <= config.step ? 'bg-teal-500' : 'bg-slate-100'}`} />)}</div></div>}
                    {order.items && order.items.length > 0 && <div className="mt-3 flex items-center gap-2 overflow-x-auto">{order.items.slice(0, 5).map((it) => <div key={it.id} className="shrink-0 flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-2.5 py-1.5">{it.product?.image ? <img src={it.product.image} alt="" className="h-7 w-7 rounded-lg object-cover" /> : <div className="h-7 w-7 rounded-lg bg-slate-200" />}<div className="text-[11px]"><div className="font-black text-slate-900 truncate max-w-[100px]">{it.product?.name || 'Item'}</div><div className="text-slate-400">Qty {it.quantity}</div></div></div>)}</div>}
                    {['PENDING', 'PAYMENT_PENDING', 'CONFIRMED'].includes(order.status) && <div className="mt-3"><button onClick={(e) => { e.stopPropagation(); cancelOrder(order.id); }} disabled={cancellingId === order.id} className="rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-black text-red-700 hover:bg-red-100 disabled:opacity-60">{cancellingId === order.id ? 'Cancelling...' : 'Cancel order'}</button></div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
