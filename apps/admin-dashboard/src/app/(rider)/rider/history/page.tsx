'use client';

import React, { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { apiClient } from '@aagam/utils';
import { Truck, CheckCircle, Clock, Package, ArrowLeft, MapPin, Calendar } from 'lucide-react';
import Link from 'next/link';
import { formatINR } from '@/lib/currency';

type OrderStatus = 'PENDING' | 'CONFIRMED' | 'PICKING' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED';

type Order = {
  id: string;
  status: OrderStatus;
  grandTotal: number;
  createdAt: string;
  deliveredAt?: string | null;
  customer?: { name: string; phone: string } | null;
  store?: { name: string; address: string } | null;
  items?: Array<{ id: string; quantity: number; product?: { name: string } | null }>;
};

const statusConfig: Record<OrderStatus, { label: string; cls: string; icon: React.ElementType }> = {
  PENDING: { label: 'Pending', cls: 'bg-amber-100 text-amber-700', icon: Clock },
  CONFIRMED: { label: 'Confirmed', cls: 'bg-blue-100 text-blue-700', icon: Package },
  PICKING: { label: 'Picking', cls: 'bg-indigo-100 text-indigo-700', icon: Package },
  OUT_FOR_DELIVERY: { label: 'On Way', cls: 'bg-cyan-100 text-cyan-700', icon: Truck },
  DELIVERED: { label: 'Delivered', cls: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  CANCELLED: { label: 'Cancelled', cls: 'bg-red-100 text-red-700', icon: Clock },
};

export default function RiderHistoryPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'delivered' | 'cancelled'>('all');

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await apiClient.get('/orders/rider');
        setOrders(Array.isArray(res.data) ? res.data : []);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, []);

  const filtered = orders.filter((o) => {
    if (filter === 'delivered') return o.status === 'DELIVERED';
    if (filter === 'cancelled') return o.status === 'CANCELLED';
    return true;
  });

  const totalEarnings = orders
    .filter((o) => o.status === 'DELIVERED')
    .reduce((sum, o) => sum + (Number(o.grandTotal) || 0), 0);

  const deliveredCount = orders.filter((o) => o.status === 'DELIVERED').length;

  return (
    <DashboardLayout allowedRole="RIDER">
      <div className="min-h-screen">
        <div className="mb-6">
          <Link href="/rider" className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-800 mb-4">
            <ArrowLeft className="h-4 w-4" />
            Back to Queue
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Delivery History</h1>
          <p className="text-gray-500">All your past deliveries and earnings</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white p-4 rounded-2xl border border-gray-100">
            <p className="text-xs text-gray-500 font-medium">Total Orders</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{orders.length}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-gray-100">
            <p className="text-xs text-gray-500 font-medium">Delivered</p>
            <p className="text-xl font-bold text-emerald-600 mt-1">{deliveredCount}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-gray-100">
            <p className="text-xs text-gray-500 font-medium">Earnings</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{formatINR(totalEarnings)}</p>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6">
          {(['all', 'delivered', 'cancelled'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-sm font-bold capitalize transition ${
                filter === f ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Orders */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 animate-pulse">
                <div className="h-5 bg-gray-100 rounded w-32 mb-3" />
                <div className="h-4 bg-gray-100 rounded w-48" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-12 text-center">
            <Truck className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-lg font-bold text-gray-900">No orders found</p>
            <p className="text-sm text-gray-500 mt-1">
              {filter === 'all' ? 'You haven\'t delivered any orders yet' : `No ${filter} orders`}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((order) => {
              const config = statusConfig[order.status];
              const Icon = config.icon;
              return (
                <div key={order.id} className="bg-white rounded-2xl border border-gray-100 p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl ${order.status === 'DELIVERED' ? 'bg-emerald-100' : order.status === 'CANCELLED' ? 'bg-red-100' : 'bg-gray-100'}`}>
                        <Icon className={`h-5 w-5 ${order.status === 'DELIVERED' ? 'text-emerald-600' : order.status === 'CANCELLED' ? 'text-red-600' : 'text-gray-500'}`} />
                      </div>
                      <div>
                        <p className="font-bold text-gray-900">#{order.id.slice(-8).toUpperCase()}</p>
                        <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                          <Calendar className="h-3 w-3" />
                          {new Date(order.createdAt).toLocaleString('en-IN')}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-gray-900">{formatINR(order.grandTotal)}</p>
                      <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${config.cls}`}>
                        {config.label}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    {order.store?.name && (
                      <div className="flex items-center gap-1">
                        <Package className="h-3.5 w-3.5" />
                        <span>{order.store.name}</span>
                      </div>
                    )}
                    {order.customer?.name && (
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        <span>{order.customer.name}</span>
                      </div>
                    )}
                    {order.items && (
                      <span>{order.items.length} item{order.items.length !== 1 ? 's' : ''}</span>
                    )}
                  </div>

                  {order.deliveredAt && (
                    <p className="mt-2 text-xs text-emerald-600 font-medium">
                      Delivered at {new Date(order.deliveredAt).toLocaleString('en-IN')}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
