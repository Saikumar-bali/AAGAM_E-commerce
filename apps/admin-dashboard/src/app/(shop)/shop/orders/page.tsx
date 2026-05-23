'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { apiClient } from '@aagam/utils';
import { formatINR } from '@/lib/currency';
import { 
  Calendar, 
  ChevronRight, 
  Package, 
  RefreshCw, 
  Store, 
  Clock,
  CheckCircle2,
  XCircle,
  Truck,
  ShoppingBag,
  ArrowRight,
  Filter
} from 'lucide-react';

type OrderStatus =
  | 'PENDING'
  | 'PAYMENT_PENDING'
  | 'PAYMENT_FAILED'
  | 'CONFIRMED'
  | 'PICKING'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED';

type Order = {
  id: string;
  status: OrderStatus;
  currency: string;
  totalAmount: number;
  grandTotal?: number;
  createdAt: string;
  store?: { name: string | null } | null;
  payment?: { method: 'ONLINE' | 'COD'; status: string } | null;
  items?: Array<{
    id: string;
    quantity: number;
    product?: { name?: string | null; image?: string | null } | null;
  }>;
};

const statusConfig: Record<OrderStatus, { label: string; cls: string; icon: any; step: number }> = {
  PENDING: { label: 'Pending', cls: 'bg-amber-50 text-amber-700 border-amber-200', icon: Clock, step: 1 },
  PAYMENT_PENDING: { label: 'Payment Pending', cls: 'bg-amber-50 text-amber-700 border-amber-200', icon: Clock, step: 1 },
  PAYMENT_FAILED: { label: 'Payment Failed', cls: 'bg-red-50 text-red-700 border-red-200', icon: XCircle, step: 0 },
  CONFIRMED: { label: 'Confirmed', cls: 'bg-blue-50 text-blue-700 border-blue-200', icon: CheckCircle2, step: 2 },
  PICKING: { label: 'Picking', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200', icon: Package, step: 3 },
  OUT_FOR_DELIVERY: { label: 'Out for Delivery', cls: 'bg-cyan-50 text-cyan-700 border-cyan-200', icon: Truck, step: 4 },
  DELIVERED: { label: 'Delivered', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2, step: 5 },
  CANCELLED: { label: 'Cancelled', cls: 'bg-red-50 text-red-700 border-red-200', icon: XCircle, step: -1 },
};

const filters = [
  { label: 'All', value: 'All' },
  { label: 'Active', value: 'Active' },
  { label: 'Delivered', value: 'DELIVERED' },
  { label: 'Cancelled', value: 'CANCELLED' },
];

export default function CustomerOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('All');
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const fetchOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/orders/my');
      setOrders(Array.isArray(res.data) ? (res.data as Order[]) : []);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const cancelOrder = async (orderId: string) => {
    setCancellingId(orderId);
    try {
      await apiClient.patch(`/orders/my/${orderId}/cancel`);
      await fetchOrders();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to cancel order');
    } finally {
      setCancellingId(null);
    }
  };

  const filteredOrders = useMemo(() => {
    if (statusFilter === 'All') return orders;
    if (statusFilter === 'Active') {
      return orders.filter(o => !['DELIVERED', 'CANCELLED'].includes(o.status));
    }
    return orders.filter(o => o.status === statusFilter);
  }, [orders, statusFilter]);

  const stats = useMemo(() => ({
    total: orders.length,
    totalSpent: orders.reduce((sum, o) => sum + (Number(o.grandTotal ?? o.totalAmount) || 0), 0),
    delivered: orders.filter(o => o.status === 'DELIVERED').length,
    pending: orders.filter(o => ['PENDING', 'CONFIRMED', 'PICKING', 'OUT_FOR_DELIVERY'].includes(o.status)).length,
  }), [orders]);

  return (
    <DashboardLayout allowedRole="CUSTOMER">
      <div className="min-h-screen">
        {/* Header */}
        <div className="relative mb-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">My Orders</h1>
              <p className="mt-1 text-gray-600">Track and manage your grocery orders</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/shop')}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-emerald-200 bg-white text-emerald-700 font-semibold hover:bg-emerald-50 transition-colors"
              >
                <ShoppingBag className="h-4 w-4" />
                Continue Shopping
              </button>
              <button
                onClick={fetchOrders}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 flex items-center gap-3">
            <XCircle className="h-5 w-5" />
            {error}
          </div>
        )}

        {/* Stats Cards */}
        {!loading && orders.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 font-medium">Total Orders</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</p>
                </div>
                <div className="p-3 rounded-xl bg-emerald-100">
                  <Package className="h-6 w-6 text-emerald-600" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 font-medium">Total Spent</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{formatINR(stats.totalSpent)}</p>
                </div>
                <div className="p-3 rounded-xl bg-amber-100">
                  <Store className="h-6 w-6 text-amber-600" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 font-medium">Delivered</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{stats.delivered}</p>
                </div>
                <div className="p-3 rounded-xl bg-blue-100">
                  <CheckCircle2 className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 font-medium">Active</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{stats.pending}</p>
                </div>
                <div className="p-3 rounded-xl bg-indigo-100">
                  <Clock className="h-6 w-6 text-indigo-600" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filter Tabs */}
        {!loading && orders.length > 0 && (
          <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
            <Filter className="h-4 w-4 text-gray-400 mr-2" />
            {filters.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${
                  statusFilter === f.value
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="animate-pulse rounded-2xl border border-gray-100 bg-white p-5">
                <div className="flex items-center justify-between">
                  <div className="h-5 bg-gray-100 rounded w-32" />
                  <div className="h-6 bg-gray-100 rounded w-20" />
                </div>
                <div className="mt-4 h-4 bg-gray-100 rounded w-48" />
                <div className="mt-3 h-4 bg-gray-100 rounded w-40" />
                <div className="mt-6 h-12 bg-gray-100 rounded w-full" />
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && orders.length === 0 && (
          <div className="bg-white rounded-3xl border border-dashed border-gray-200 p-12 text-center">
            <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <ShoppingBag className="h-10 w-10 text-emerald-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-900">No orders yet</h3>
            <p className="mt-2 text-gray-500 max-w-sm mx-auto">
              Start shopping to see your orders here. We&apos;ll track your deliveries and keep you updated.
            </p>
            <button
              onClick={() => router.push('/shop')}
              className="mt-6 inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors"
            >
              <ShoppingBag className="h-5 w-5" />
              Start Shopping
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* Orders List */}
        {!loading && filteredOrders.length === 0 && orders.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
            <Package className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No orders match this filter</p>
          </div>
        )}

        {!loading && filteredOrders.length > 0 && (
          <div className="space-y-4">
            {filteredOrders.map((order) => {
              const config = statusConfig[order.status] || statusConfig.PENDING;
              const amount = Number(order.grandTotal ?? order.totalAmount) || 0;
              const Icon = config.icon;
              const isActive = !['DELIVERED', 'CANCELLED'].includes(order.status);
              
              return (
                <div
                  key={order.id}
                  className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
                  onClick={() => router.push(`/shop/orders/${order.id}`)}
                >
                  {/* Status Bar */}
                  <div className={`h-1.5 ${config.cls.split(' ')[0].replace('bg-', 'bg-').replace('text-', '')}`} />
                  
                  <div className="p-5">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                      {/* Left Side - Order Info */}
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <span className="font-mono text-sm font-bold text-gray-900">#{order.id.slice(-8).toUpperCase()}</span>
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${config.cls}`}>
                            <Icon className="h-3.5 w-3.5" />
                            {config.label}
                          </span>
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                          <div className="flex items-center gap-1.5">
                            <Store className="h-4 w-4" />
                            {order.store?.name || 'Assigned Store'}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-4 w-4" />
                            {new Date(order.createdAt).toLocaleDateString('en-IN', { 
                              day: 'numeric', 
                              month: 'short', 
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </div>
                          <div className="flex items-center gap-1.5">
                            {order.payment?.method === 'COD' ? (
                              <span className="px-2 py-0.5 bg-amber-50 text-amber-700 text-xs font-semibold rounded">COD</span>
                            ) : (
                              <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-semibold rounded">PREPAID</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right Side - Amount & Action */}
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="text-2xl font-bold text-gray-900">{formatINR(amount)}</div>
                          {order.items && order.items.length > 0 && (
                            <div className="text-xs text-gray-500">{order.items.length} item{order.items.length !== 1 ? 's' : ''}</div>
                          )}
                        </div>
                        <div className={`p-3 rounded-xl ${isActive ? 'bg-emerald-100' : 'bg-gray-100'}`}>
                          <ChevronRight className={`h-5 w-5 ${isActive ? 'text-emerald-600' : 'text-gray-400'}`} />
                        </div>
                      </div>
                    </div>

                    {/* Progress indicator for active orders */}
                    {isActive && (
                      <div className="mt-5 pt-4 border-t border-gray-100">
                        <div className="flex items-center gap-2">
                          {[1, 2, 3, 4, 5].map((step) => (
                            <React.Fragment key={step}>
                              <div 
                                className={`h-2 flex-1 rounded-full ${
                                  step <= config.step ? 'bg-emerald-500' : 'bg-gray-200'
                                }`}
                              />
                            </React.Fragment>
                          ))}
                        </div>
                        <div className="flex justify-between mt-2 text-xs text-gray-400">
                          <span>Ordered</span>
                          <span>Confirmed</span>
                          <span>Packing</span>
                          <span>On Way</span>
                          <span>Delivered</span>
                        </div>
                      </div>
                    )}

                    {order.items && order.items.length > 0 && (
                      <div className="mt-4 flex items-center gap-2 overflow-x-auto">
                        {order.items.slice(0, 4).map((it) => (
                          <div key={it.id} className="flex min-w-[160px] items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-2 py-1.5">
                            {it.product?.image ? <img src={it.product.image} alt={it.product?.name || 'item'} className="h-8 w-8 rounded object-cover" /> : <div className="h-8 w-8 rounded bg-gray-200" />}
                            <div className="truncate text-xs">
                              <div className="truncate font-bold text-gray-900">{it.product?.name || 'Item'}</div>
                              <div className="text-gray-500">Qty {it.quantity}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {['PENDING', 'PAYMENT_PENDING', 'CONFIRMED'].includes(order.status) && (
                      <div className="mt-4">
                        <button
                          onClick={(e) => { e.stopPropagation(); cancelOrder(order.id); }}
                          disabled={cancellingId === order.id}
                          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-60"
                        >
                          {cancellingId === order.id ? 'Cancelling...' : 'Cancel order'}
                        </button>
                      </div>
                    )}
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
