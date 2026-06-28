'use client';

import React, { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { apiClient } from '@aagam/utils';
import { ShoppingCart, RefreshCw, Clock, CheckCircle, XCircle, Package } from 'lucide-react';

type Order = {
  id: string;
  status: string;
  grandTotal: number;
  createdAt: string;
  customer?: { name: string; email: string } | null;
  items?: Array<{ id: string; quantity: number; product?: { name: string } | null }>;
};

const statusConfig: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  PENDING: { label: 'Pending', cls: 'bg-amber-100 text-amber-700', icon: Clock },
  CONFIRMED: { label: 'Confirmed', cls: 'bg-blue-100 text-blue-700', icon: CheckCircle },
  PICKING: { label: 'Picking', cls: 'bg-indigo-100 text-indigo-700', icon: Package },
  OUT_FOR_DELIVERY: { label: 'Out for Delivery', cls: 'bg-cyan-100 text-cyan-700', icon: ShoppingCart },
  DELIVERED: { label: 'Delivered', cls: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  CANCELLED: { label: 'Cancelled', cls: 'bg-red-100 text-red-700', icon: XCircle },
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/stores/my-stores');
      const stores = res.data;
      const allOrders: Order[] = [];
      for (const store of stores) {
        if (store.orders) {
          allOrders.push(...store.orders);
        }
      }
      allOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setOrders(allOrders);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  return (
    <DashboardLayout allowedRole="STORE_OWNER">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="enterprise-kicker">Order management</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">Orders</h1>
        </div>
        <button onClick={fetchOrders} disabled={loading} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-[2rem] border border-dashed border-slate-200 p-16 text-center">
          <ShoppingCart className="mx-auto h-16 w-16 text-slate-300" />
          <p className="mt-6 text-2xl font-black text-slate-950">No orders yet</p>
          <p className="mt-2 text-sm text-slate-500">Orders will appear here once customers start ordering.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const config = statusConfig[order.status] || statusConfig.PENDING;
            const Icon = config.icon;
            return (
              <div key={order.id} className="enterprise-card flex items-center gap-4 p-5 transition hover:-translate-y-0.5">
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${config.cls.split(' ')[0]}`}>
                  <Icon className={`h-5 w-5 ${config.cls.split(' ')[1]}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-black text-slate-950">#{order.id.slice(-8).toUpperCase()}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${config.cls}`}>
                      {config.label}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {order.customer?.name || 'Customer'} · {new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-black text-slate-950">₹{Number(order.grandTotal).toLocaleString('en-IN')}</p>
                  <p className="text-xs text-slate-500">{order.items?.length || 0} item{(order.items?.length || 0) > 1 ? 's' : ''}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
}
