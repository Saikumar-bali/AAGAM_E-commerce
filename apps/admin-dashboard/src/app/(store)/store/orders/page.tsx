'use client';

import React, { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { apiClient } from '@aagam/utils';
import { ShoppingCart, RefreshCw, Clock, CheckCircle, XCircle, Package, User } from 'lucide-react';

type OrderItem = {
  id: string;
  quantity: number;
  product?: { name: string; image: string | null } | null;
};

type Payment = {
  id: string;
  status: string;
  method: string;
};

type RiderInfo = {
  id: string;
  user: { name: string };
};

type Order = {
  id: string;
  status: string;
  grandTotal: number;
  createdAt: string;
  customer?: { name: string; email: string; phone?: string } | null;
  items?: OrderItem[];
  payment?: Payment | null;
  rider?: RiderInfo | null;
};

const statusConfig: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  PENDING: { label: 'Pending', cls: 'bg-amber-100 text-amber-700', icon: Clock },
  PAYMENT_PENDING: { label: 'Payment Pending', cls: 'bg-orange-100 text-orange-700', icon: Clock },
  CONFIRMED: { label: 'Confirmed', cls: 'bg-blue-100 text-blue-700', icon: CheckCircle },
  PICKING: { label: 'Picking', cls: 'bg-indigo-100 text-indigo-700', icon: Package },
  PACKED: { label: 'Packed', cls: 'bg-violet-100 text-violet-700', icon: Package },
  RIDER_ASSIGNED: { label: 'Rider Assigned', cls: 'bg-purple-100 text-purple-700', icon: User },
  OUT_FOR_DELIVERY: { label: 'Out for Delivery', cls: 'bg-cyan-100 text-cyan-700', icon: ShoppingCart },
  DELIVERED: { label: 'Delivered', cls: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  CANCELLED: { label: 'Cancelled', cls: 'bg-red-100 text-red-700', icon: XCircle },
};

type StoreAction = { status: string; label: string };
const STORE_ACTIONS: Record<string, StoreAction[]> = {
  PENDING: [
    { status: 'CONFIRMED', label: 'Confirm' },
    { status: 'CANCELLED', label: 'Cancel' },
  ],
  PAYMENT_PENDING: [
    { status: 'CONFIRMED', label: 'Confirm' },
    { status: 'CANCELLED', label: 'Cancel' },
  ],
  CONFIRMED: [
    { status: 'PICKING', label: 'Start Picking' },
    { status: 'PACKED', label: 'Mark Packed' },
    { status: 'CANCELLED', label: 'Cancel' },
  ],
  PICKING: [
    { status: 'PACKED', label: 'Mark Packed' },
    { status: 'CANCELLED', label: 'Cancel' },
  ],
  PACKED: [
    { status: 'CANCELLED', label: 'Cancel' },
  ],
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});

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
      await apiClient.patch(`/orders/${orderId}/status`, { status });
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status } : o))
      );
    } catch (e: any) {
      setActionErrors((prev) => ({
        ...prev,
        [orderId]: e?.response?.data?.message || `Failed to update status to ${status}`,
      }));
    } finally {
      setActionLoading(null);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const actions = (status: string) => STORE_ACTIONS[status] || [];

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
            const orderActions = actions(order.status);
            const actionErr = actionErrors[order.id];
            return (
              <div key={order.id} className="enterprise-card p-5 transition hover:-translate-y-0.5">
                <div className="flex items-center gap-4">
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
                    {order.rider && (
                      <p className="mt-0.5 text-xs text-purple-600">Rider: {order.rider.user.name}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-slate-950">₹{Number(order.grandTotal).toLocaleString('en-IN')}</p>
                    <p className="text-xs text-slate-500">{order.items?.length || 0} item{(order.items?.length || 0) > 1 ? 's' : ''}</p>
                    {order.payment && (
                      <p className={`mt-0.5 text-[10px] font-bold ${order.payment.status === 'COMPLETED' ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {order.payment.method} · {order.payment.status}
                      </p>
                    )}
                  </div>
                </div>
                {orderActions.length > 0 && (
                  <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3">
                    {orderActions.map((action) => (
                      <button
                        key={action.status}
                        onClick={() => updateStatus(order.id, action.status)}
                        disabled={actionLoading === `${order.id}-${action.status}`}
                        className={`rounded-lg px-3 py-1.5 text-xs font-bold transition disabled:opacity-50 ${
                          action.status === 'CANCELLED'
                            ? 'border border-red-200 text-red-600 hover:bg-red-50'
                            : 'bg-slate-900 text-white hover:bg-slate-700'
                        }`}
                      >
                        {actionLoading === `${order.id}-${action.status}` ? '...' : action.label}
                      </button>
                    ))}
                    {actionErr && (
                      <p className="ml-2 text-[11px] font-medium text-red-600">{actionErr}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
}
