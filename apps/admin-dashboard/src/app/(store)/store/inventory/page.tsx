'use client';

import React, { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { apiClient } from '@aagam/utils';
import { Package, RefreshCw, AlertTriangle, Save, Minus, Plus, Eye, EyeOff } from 'lucide-react';

type InventoryItem = {
  id: string;
  quantity: number;
  isListed: boolean;
  autoHideWhenOutOfStock: boolean;
  sellingPricePaise?: number | null;
  product: { id: string; name: string; price: number; image?: string | null; category?: { name: string } };
  store: { id: string; name: string };
};

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, number>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchAllProducts = async (): Promise<any[]> => {
    const PAGE_SIZE = 50;
    const MAX_PAGES = 100;
    const allProducts: any[] = [];
    const seenIds = new Set<string>();

    for (let page = 1; page <= MAX_PAGES; page++) {
      const { data } = await apiClient.get('/products', {
        params: { pageSize: PAGE_SIZE, page },
      });
      const payload = data;
      const items: any[] = Array.isArray(payload)
        ? payload
        : payload?.items || payload?.products || [];

      for (const product of items) {
        if (!seenIds.has(product.id)) {
          seenIds.add(product.id);
          allProducts.push(product);
        }
      }

      if (Array.isArray(payload) || !payload?.totalPages) break;
      if (page >= payload.totalPages) break;
    }
    return allProducts;
  };

  const fetchInventory = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const [storeResult, products] = await Promise.all([
        apiClient.get('/stores/my-stores'),
        fetchAllProducts(),
      ]);
      const stores = storeResult.data || [];
      setSelectedStoreId((current) => current || stores[0]?.id || '');
      const allInventory: InventoryItem[] = [];
      for (const store of stores) {
        const inventoryByProduct = new Map((store.inventory || []).map((row: any) => [row.productId, row]));
        for (const product of products) {
          const existing: any = inventoryByProduct.get(product.id);
          allInventory.push({
            id: existing?.id || `${store.id}:${product.id}`,
            quantity: existing?.quantity ?? 0,
            isListed: existing?.isListed ?? true,
            autoHideWhenOutOfStock: existing?.autoHideWhenOutOfStock ?? true,
            sellingPricePaise: existing?.sellingPricePaise ?? null,
            product,
            store: { id: store.id, name: store.name },
          });
        }
      }
      setItems(allInventory);
      setDrafts(Object.fromEntries(allInventory.map((item) => [item.id, item.quantity])));
      setPriceDrafts(Object.fromEntries(allInventory.map((item) => [item.id, item.sellingPricePaise == null ? '' : String(item.sellingPricePaise / 100)])));
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchInventory(); }, []);

  const lowStock = items.filter((i) => i.quantity < 10);
  const changedCount = useMemo(() => items.filter((item) => drafts[item.id] !== undefined && drafts[item.id] !== item.quantity).length, [items, drafts]);

  const setDraftQuantity = (itemId: string, next: number) => {
    setDrafts((current) => ({ ...current, [itemId]: Math.max(0, Number.isFinite(next) ? Math.floor(next) : 0) }));
  };

  const saveInventory = async (item: InventoryItem) => {
    const quantity = drafts[item.id];
    if (quantity === undefined) return;
    setSavingId(item.id);
    setError(null);
    setSuccess(null);
    try {
      const { data: saved } = await apiClient.patch(`/stores/${item.store.id}/inventory`, {
        productId: item.product.id,
        quantity,
        isListed: item.isListed,
        autoHideWhenOutOfStock: item.autoHideWhenOutOfStock,
        sellingPrice: priceDrafts[item.id] === '' ? null : Number(priceDrafts[item.id]),
      });
      setItems((current) => current.map((row) => row.id === item.id ? {
        ...row,
        id: saved?.id ?? row.id,
        quantity: saved?.quantity ?? quantity,
        isListed: saved?.isListed ?? row.isListed,
        autoHideWhenOutOfStock: saved?.autoHideWhenOutOfStock ?? row.autoHideWhenOutOfStock,
        sellingPricePaise: saved?.sellingPricePaise ?? row.sellingPricePaise,
      } : row));
      setSuccess(`${item.product.name} stock updated to ${saved?.quantity ?? quantity} units`);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to update inventory');
    } finally {
      setSavingId(null);
    }
  };

  const visibleItems = selectedStoreId ? items.filter((item) => item.store.id === selectedStoreId) : items;
  const updatePolicy = (itemId: string, policy: Partial<Pick<InventoryItem, 'isListed' | 'autoHideWhenOutOfStock'>>) => {
    setItems((current) => current.map((item) => item.id === itemId ? { ...item, ...policy } : item));
  };

  return (
    <DashboardLayout allowedRole="STORE_OWNER">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="enterprise-kicker">Stock management</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">Inventory</h1>
          <p className="mt-2 text-sm font-semibold text-slate-500">Adjust stock for products in stores you own. Changes are written to inventory ledger.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {changedCount > 0 && <span className="rounded-full bg-amber-100 px-3 py-2 text-xs font-black text-amber-800">{changedCount} unsaved change{changedCount > 1 ? 's' : ''}</span>}
          {Array.from(new Map(items.map((item) => [item.store.id, item.store])).values()).length > 1 ? <select value={selectedStoreId} onChange={(event) => setSelectedStoreId(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold">{Array.from(new Map(items.map((item) => [item.store.id, item.store])).values()).map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select> : null}
          <button onClick={fetchInventory} disabled={loading} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}
      {success && <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{success}</div>}

      {lowStock.length > 0 && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <div className="flex items-center gap-2 text-sm font-black text-amber-700"><AlertTriangle className="h-4 w-4" /> Low stock alert: {lowStock.length} item{lowStock.length > 1 ? 's' : ''} below 10 units</div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">{[1, 2, 3, 4].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-100" />)}</div>
      ) : visibleItems.length === 0 ? (
        <div className="rounded-[2rem] border border-dashed border-slate-200 p-16 text-center"><Package className="mx-auto h-16 w-16 text-slate-300" /><p className="mt-6 text-2xl font-black text-slate-950">No inventory yet</p><p className="mt-2 text-sm text-slate-500">Products will appear here once added to your stores.</p></div>
      ) : (
        <div className="enterprise-panel overflow-hidden p-0">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-slate-100 bg-slate-50/80"><th className="px-5 py-3 font-black text-slate-600">Product</th><th className="px-5 py-3 font-black text-slate-600">Store</th><th className="px-5 py-3 font-black text-slate-600">Store price</th><th className="px-5 py-3 font-black text-slate-600">Stock</th><th className="px-5 py-3 font-black text-slate-600">Listing policy</th><th className="px-5 py-3 font-black text-slate-600">Adjust</th></tr></thead>
            <tbody>
              {visibleItems.map((item) => {
                const draft = drafts[item.id] ?? item.quantity;
                const changed = draft !== item.quantity;
                return (
                  <tr key={item.id} className="border-b border-slate-50 transition hover:bg-slate-50/50">
                    <td className="px-5 py-3 font-bold text-slate-950">{item.product.name}</td>
                    <td className="px-5 py-3 text-slate-600">{item.store.name}</td>
                    <td className="px-5 py-3"><input type="number" min={0} step="0.01" value={priceDrafts[item.id] ?? ''} onChange={(event) => setPriceDrafts((current) => ({ ...current, [item.id]: event.target.value }))} placeholder={`Admin ₹${Number(item.product.price).toLocaleString('en-IN')}`} className="w-28 rounded-xl border border-slate-200 px-3 py-2 text-sm font-black" /><p className="mt-1 text-[10px] font-bold text-slate-400">Blank uses Admin price</p></td>
                    <td className="px-5 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-black ${item.quantity < 10 ? 'bg-red-100 text-red-700' : item.quantity < 30 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{item.quantity} units</span></td>
                    <td className="px-5 py-3">
                      <div className="flex flex-col gap-2">
                        <button onClick={() => updatePolicy(item.id, { isListed: !item.isListed })} className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black ${item.isListed ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{item.isListed ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}{item.isListed ? 'Listed' : 'Hidden'}</button>
                        <button onClick={() => updatePolicy(item.id, { autoHideWhenOutOfStock: !item.autoHideWhenOutOfStock })} className={`rounded-xl px-3 py-2 text-left text-xs font-black ${item.autoHideWhenOutOfStock ? 'bg-teal-50 text-teal-700' : 'bg-amber-50 text-amber-700'}`}>Auto-hide at zero: {item.autoHideWhenOutOfStock ? 'On' : 'Off'}</button>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setDraftQuantity(item.id, draft - 1)} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"><Minus className="h-4 w-4" /></button>
                        <input type="number" min={0} value={draft} onChange={(e) => setDraftQuantity(item.id, Number(e.target.value))} className="w-24 rounded-xl border border-slate-200 px-3 py-2 text-center font-black text-slate-900" />
                        <button onClick={() => setDraftQuantity(item.id, draft + 1)} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"><Plus className="h-4 w-4" /></button>
                        <button onClick={() => saveInventory(item)} disabled={savingId === item.id} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40"><Save className="h-3.5 w-3.5" /> {savingId === item.id ? 'Saving' : 'Save'}</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </DashboardLayout>
  );
}
