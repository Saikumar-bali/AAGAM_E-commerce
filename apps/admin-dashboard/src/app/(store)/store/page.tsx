'use client';

import React, { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { apiClient } from '@aagam/utils';
import { Store, Package, ShoppingCart, TrendingUp, ArrowUpRight, MapPin, RefreshCw } from 'lucide-react';

type StoreData = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  isActive: boolean;
  inventory?: Array<{ id: string; quantity: number; product: { id: string; name: string; price: number; image?: string | null } }>;
  orders?: Array<{ id: string; status: string; grandTotal: number; createdAt: string }>;
};

export default function StoreOwnerDashboard() {
  const [stores, setStores] = useState<StoreData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStores = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/stores/my-stores');
      setStores(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load stores');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStores();
  }, []);

  const totalProducts = stores.reduce((sum, s) => sum + (s.inventory?.length || 0), 0);
  const lowStockItems = stores.reduce(
    (sum, s) => sum + (s.inventory?.filter((i) => i.quantity < 10).length || 0),
    0
  );
  const totalOrders = stores.reduce((sum, s) => sum + (s.orders?.length || 0), 0);
  const totalRevenue = stores.reduce(
    (sum, s) => sum + (s.orders?.reduce((oSum, o) => oSum + (Number(o.grandTotal) || 0), 0) || 0),
    0
  );

  const stats = [
    { name: 'My Stores', value: stores.length, icon: Store, tone: 'from-teal-500 to-emerald-400', detail: stores.filter((s) => s.isActive).length + ' active' },
    { name: 'Products', value: totalProducts, icon: Package, tone: 'from-sky-500 to-cyan-400', detail: lowStockItems > 0 ? `${lowStockItems} low stock` : 'Stock healthy' },
    { name: 'Orders', value: totalOrders, icon: ShoppingCart, tone: 'from-amber-500 to-orange-400', detail: 'All stores combined' },
    { name: 'Revenue', value: `₹${totalRevenue.toLocaleString('en-IN')}`, icon: TrendingUp, tone: 'from-slate-900 to-slate-700', detail: 'Lifetime total' },
  ];

  return (
    <DashboardLayout allowedRole="STORE_OWNER">

      <div className="mb-5 grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.name} className="enterprise-card p-3 transition hover:border-teal-300 sm:p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-teal-50 text-teal-700">
                <stat.icon className="h-4 w-4" />
              </div>
              <span className="flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                Live
              </span>
            </div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{stat.name}</h3>
            <p className="mt-0.5 text-xl font-semibold tabular-nums text-slate-950">{stat.value}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">{stat.detail}</p>
          </div>
        ))}
      </div>

      <div className="enterprise-panel p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="enterprise-kicker">Your stores</p>
            <h2 className="mt-2 text-lg font-semibold">Store list</h2>
          </div>
          <button onClick={fetchStores} disabled={loading} className="enterprise-button">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>}

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        ) : stores.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 p-10 text-center">
            <Store className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-base font-semibold text-slate-950">No stores found</p>
            <p className="mt-1 text-sm text-slate-500">Contact admin to create your first store.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {stores.map((store) => (
              <div key={store.id} className="flex items-center gap-3 rounded-lg border border-slate-100 bg-white p-3 transition hover:border-teal-200 sm:p-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-950 text-white">
                  <Store className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-950">{store.name}</p>
                    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${store.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {store.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5 text-[11px] text-slate-500">
                    <MapPin className="h-3 w-3" />
                    {store.address}
                  </div>
                </div>
                <div className="hidden text-right sm:block">
                  <p className="text-[10px] text-slate-400">Inventory</p>
                  <p className="text-sm font-semibold tabular-nums text-slate-950">{store.inventory?.length || 0}</p>
                </div>
                <div className="hidden text-right sm:block">
                  <p className="text-[10px] text-slate-400">Orders</p>
                  <p className="text-sm font-semibold tabular-nums text-slate-950">{store.orders?.length || 0}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
