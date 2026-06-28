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
      <section className="mb-8 overflow-hidden rounded-[2.25rem] bg-slate-950 p-8 text-white shadow-[0_30px_90px_rgba(15,23,42,0.22)]">
        <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div>
            <p className="inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-[0.22em] text-teal-200">Store owner overview</p>
            <h1 className="mt-5 max-w-2xl text-4xl font-black tracking-[-0.06em] md:text-5xl">Manage your stores, inventory, and orders from one place.</h1>
            <p className="mt-4 max-w-xl text-sm font-semibold leading-6 text-slate-300">Track stock levels, review incoming orders, and keep your stores running smoothly.</p>
          </div>
          <div className="rounded-[1.75rem] border border-white/10 bg-white/8 p-5 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-300">Store health</p>
                <p className="mt-2 text-5xl font-black tracking-tight">{stores.length > 0 ? `${stores.filter((s) => s.isActive).length}/${stores.length}` : '—'}</p>
              </div>
              <Store className="h-12 w-12 text-teal-300" />
            </div>
            <p className="mt-3 text-sm font-semibold text-slate-400">stores active</p>
          </div>
        </div>
      </section>

      <div className="mb-8 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.name} className="enterprise-card p-5 transition hover:-translate-y-1">
            <div className="mb-5 flex items-center justify-between">
              <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${stat.tone} text-white shadow-lg`}>
                <stat.icon className="h-6 w-6" />
              </div>
              <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                <ArrowUpRight className="h-3 w-3" /> Live
              </span>
            </div>
            <h3 className="text-sm font-black text-slate-500">{stat.name}</h3>
            <p className="mt-1 text-3xl font-black tracking-tight text-slate-950">{stat.value}</p>
            <p className="mt-2 text-xs font-bold text-slate-400">{stat.detail}</p>
          </div>
        ))}
      </div>

      <div className="enterprise-panel p-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="enterprise-kicker">Your stores</p>
            <h2 className="mt-3 text-2xl font-black tracking-tight">Store list</h2>
          </div>
          <button onClick={fetchStores} disabled={loading} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {error && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : stores.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 p-12 text-center">
            <Store className="mx-auto h-12 w-12 text-slate-300" />
            <p className="mt-4 text-lg font-black text-slate-950">No stores found</p>
            <p className="mt-1 text-sm text-slate-500">Contact admin to create your first store.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {stores.map((store) => (
              <div key={store.id} className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white/70 p-5 transition hover:border-teal-200 hover:bg-white">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
                  <Store className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-black text-slate-950">{store.name}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${store.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {store.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-1 text-xs text-slate-500">
                    <MapPin className="h-3 w-3" />
                    {store.address}
                  </div>
                </div>
                <div className="hidden text-right sm:block">
                  <p className="text-xs text-slate-500">Inventory</p>
                  <p className="text-lg font-black text-slate-950">{store.inventory?.length || 0}</p>
                </div>
                <div className="hidden text-right sm:block">
                  <p className="text-xs text-slate-500">Orders</p>
                  <p className="text-lg font-black text-slate-950">{store.orders?.length || 0}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
