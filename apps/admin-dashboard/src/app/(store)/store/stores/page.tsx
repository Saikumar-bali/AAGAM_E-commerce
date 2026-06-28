'use client';

import React, { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { apiClient } from '@aagam/utils';
import { Store, MapPin, RefreshCw, Package } from 'lucide-react';

type StoreData = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  isActive: boolean;
  inventory?: Array<{ id: string; quantity: number; product: { id: string; name: string; price: number; image?: string | null } }>;
};

export default function MyStoresPage() {
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

  return (
    <DashboardLayout allowedRole="STORE_OWNER">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="enterprise-kicker">Store management</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">My Stores</h1>
        </div>
        <button onClick={fetchStores} disabled={loading} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}

      {loading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 animate-pulse rounded-[2rem] bg-slate-100" />
          ))}
        </div>
      ) : stores.length === 0 ? (
        <div className="rounded-[2rem] border border-dashed border-slate-200 p-16 text-center">
          <Store className="mx-auto h-16 w-16 text-slate-300" />
          <p className="mt-6 text-2xl font-black text-slate-950">No stores yet</p>
          <p className="mt-2 text-sm text-slate-500">Contact the admin to create your first store.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {stores.map((store) => (
            <div key={store.id} className="enterprise-card overflow-hidden p-0 transition hover:-translate-y-1">
              <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-6 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
                      <Store className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black">{store.name}</h3>
                      <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-black ${store.isActive ? 'bg-emerald-400/20 text-emerald-300' : 'bg-white/10 text-slate-400'}`}>
                        {store.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-6">
                <div className="flex items-start gap-2 text-sm text-slate-600">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <span>{store.address}</span>
                </div>
                <div className="mt-4 flex items-center gap-4 border-t border-slate-100 pt-4">
                  <div className="flex items-center gap-2 text-sm">
                    <Package className="h-4 w-4 text-slate-400" />
                    <span className="font-bold text-slate-950">{store.inventory?.length || 0}</span>
                    <span className="text-slate-500">products</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
