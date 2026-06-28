'use client';

import React, { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { apiClient } from '@aagam/utils';
import { Package, RefreshCw, AlertTriangle } from 'lucide-react';

type InventoryItem = {
  id: string;
  quantity: number;
  product: { id: string; name: string; price: number; image?: string | null };
  store: { id: string; name: string };
};

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInventory = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/stores/my-stores');
      const stores = res.data;
      const allInventory: InventoryItem[] = [];
      for (const store of stores) {
        if (store.inventory) {
          for (const inv of store.inventory) {
            allInventory.push({ ...inv, store: { id: store.id, name: store.name } });
          }
        }
      }
      setItems(allInventory);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, []);

  const lowStock = items.filter((i) => i.quantity < 10);

  return (
    <DashboardLayout allowedRole="STORE_OWNER">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="enterprise-kicker">Stock management</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">Inventory</h1>
        </div>
        <button onClick={fetchInventory} disabled={loading} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}

      {lowStock.length > 0 && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <div className="flex items-center gap-2 text-sm font-black text-amber-700">
            <AlertTriangle className="h-4 w-4" />
            Low stock alert: {lowStock.length} item{lowStock.length > 1 ? 's' : ''} below 10 units
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-[2rem] border border-dashed border-slate-200 p-16 text-center">
          <Package className="mx-auto h-16 w-16 text-slate-300" />
          <p className="mt-6 text-2xl font-black text-slate-950">No inventory yet</p>
          <p className="mt-2 text-sm text-slate-500">Products will appear here once added to your stores.</p>
        </div>
      ) : (
        <div className="enterprise-panel overflow-hidden p-0">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80">
                <th className="px-5 py-3 font-black text-slate-600">Product</th>
                <th className="px-5 py-3 font-black text-slate-600">Store</th>
                <th className="px-5 py-3 font-black text-slate-600">Price</th>
                <th className="px-5 py-3 font-black text-slate-600">Stock</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-slate-50 transition hover:bg-slate-50/50">
                  <td className="px-5 py-3 font-bold text-slate-950">{item.product.name}</td>
                  <td className="px-5 py-3 text-slate-600">{item.store.name}</td>
                  <td className="px-5 py-3 text-slate-600">₹{Number(item.product.price).toLocaleString('en-IN')}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-black ${item.quantity < 10 ? 'bg-red-100 text-red-700' : item.quantity < 30 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {item.quantity} units
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardLayout>
  );
}
