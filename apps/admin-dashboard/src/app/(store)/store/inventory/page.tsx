'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { apiClient } from '@aagam/utils';
import {
  AlertTriangle,
  Check,
  Eye,
  EyeOff,
  Minus,
  Package,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShoppingBag,
} from 'lucide-react';

type StoreSummary = { id: string; name: string; address?: string };
type Product = {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  pricePaise?: number;
  mrpPaise?: number;
  image?: string | null;
  category?: { id: string; name: string } | null;
};
type InventoryItem = {
  id: string;
  storeId: string;
  productId: string;
  quantity: number;
  isListed: boolean;
  autoHideWhenOutOfStock: boolean;
  sellingPricePaise?: number | null;
  product: Product;
};
type Draft = { quantity: string; sellingPrice: string };

const money = (paise?: number | null, fallbackRupees = 0) =>
  `₹${((paise == null ? fallbackRupees * 100 : paise) / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;

const parseWholeQuantity = (value: string): number | null => {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed <= 1_000_000 ? parsed : null;
};

const parseOptionalPrice = (value: string) => {
  const normalized = value.trim();
  if (normalized === '') return { valid: true as const, value: null };
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return { valid: false as const, value: null };
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return { valid: false as const, value: null };
  return { valid: true as const, value: parsed };
};

export default function InventoryPage() {
  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [tab, setTab] = useState<'mine' | 'catalogue'>('mine');
  const [assortment, setAssortment] = useState<InventoryItem[]>([]);
  const [catalogue, setCatalogue] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [addDrafts, setAddDrafts] = useState<Record<string, Draft>>({});
  const [editDrafts, setEditDrafts] = useState<Record<string, Draft>>({});
  const inventoryRequestIdRef = useRef(0);
  const selectedStoreIdRef = useRef(selectedStoreId);
  selectedStoreIdRef.current = selectedStoreId;

  const loadStores = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    const { data } = await apiClient.get('/stores/my-stores');
    const nextStores: StoreSummary[] = Array.isArray(data) ? data : [];
    setStores(nextStores);

    if (nextStores.length === 0) {
      inventoryRequestIdRef.current += 1;
      setSelectedStoreId('');
      setAssortment([]);
      setCatalogue([]);
      setLoading(false);
      return;
    }

    setSelectedStoreId((current) =>
      nextStores.some((store) => store.id === current) ? current : nextStores[0].id,
    );
  }, []);

  const loadInventory = useCallback(async (storeId: string, query = search) => {
    if (!storeId) return;
    const requestId = ++inventoryRequestIdRef.current;
    setLoading(true);
    setMessage(null);
    try {
      const [assortmentResult, catalogueResult] = await Promise.all([
        apiClient.get(`/stores/${storeId}/assortment`),
        apiClient.get(`/stores/${storeId}/catalog`, {
          params: { page: 1, pageSize: 50, search: query || undefined },
        }),
      ]);
      if (requestId !== inventoryRequestIdRef.current || selectedStoreIdRef.current !== storeId) return;
      const nextAssortment: InventoryItem[] = Array.isArray(assortmentResult.data)
        ? assortmentResult.data
        : [];
      const nextCatalogue: Product[] = catalogueResult.data?.items || [];
      setAssortment(nextAssortment);
      setCatalogue(nextCatalogue);
      setEditDrafts(Object.fromEntries(nextAssortment.map((item) => [
        item.id,
        {
          quantity: String(item.quantity),
          sellingPrice: item.sellingPricePaise == null ? '' : String(item.sellingPricePaise / 100),
        },
      ])));
      setAddDrafts((current) => {
        const next = { ...current };
        nextCatalogue.forEach((product) => {
          next[product.id] ||= { quantity: '0', sellingPrice: '' };
        });
        return next;
      });
    } catch (error: any) {
      if (requestId === inventoryRequestIdRef.current && selectedStoreIdRef.current === storeId) {
        setMessage({ tone: 'error', text: error?.response?.data?.message || 'Failed to load store products' });
      }
    } finally {
      if (requestId === inventoryRequestIdRef.current && selectedStoreIdRef.current === storeId) {
        setLoading(false);
      }
    }
  }, [search]);

  useEffect(() => {
    loadStores().catch((error: any) => {
      setLoading(false);
      setMessage({ tone: 'error', text: error?.response?.data?.message || 'Failed to load stores' });
    });
  }, [loadStores]);

  useEffect(() => {
    if (selectedStoreId) {
      void loadInventory(selectedStoreId, '');
      return;
    }
    inventoryRequestIdRef.current += 1;
    setLoading(false);
  }, [selectedStoreId]);

  const lowStockCount = useMemo(
    () => assortment.filter((item) => item.quantity > 0 && item.quantity < 10).length,
    [assortment],
  );

  const setAddDraft = (productId: string, field: keyof Draft, value: string) => {
    setAddDrafts((current) => ({
      ...current,
      [productId]: { ...(current[productId] || { quantity: '0', sellingPrice: '' }), [field]: value },
    }));
  };

  const setEditDraft = (inventoryId: string, field: keyof Draft, value: string) => {
    setEditDrafts((current) => ({
      ...current,
      [inventoryId]: { ...(current[inventoryId] || { quantity: '0', sellingPrice: '' }), [field]: value },
    }));
  };

  const addProduct = async (product: Product) => {
    const storeId = selectedStoreId;
    if (!storeId) return;
    const draft = addDrafts[product.id] || { quantity: '0', sellingPrice: '' };
    const openingQuantity = parseWholeQuantity(draft.quantity);
    const parsedPrice = parseOptionalPrice(draft.sellingPrice);
    if (openingQuantity === null) {
      setMessage({ tone: 'error', text: 'Opening stock must be a whole number between 0 and 1,000,000.' });
      return;
    }
    if (!parsedPrice.valid) {
      setMessage({ tone: 'error', text: 'Store price must be a valid non-negative amount.' });
      return;
    }
    const sellingPrice = parsedPrice.value;
    setSavingId(product.id);
    setMessage(null);
    try {
      const { data } = await apiClient.post(`/stores/${storeId}/assortment`, {
        productId: product.id,
        openingQuantity,
        sellingPrice,
        isListed: true,
        autoHideWhenOutOfStock: true,
      });
      if (selectedStoreIdRef.current !== storeId) return;
      setAssortment((current) => [...current, data].sort((a, b) => a.product.name.localeCompare(b.product.name)));
      setCatalogue((current) => current.filter((item) => item.id !== product.id));
      setEditDrafts((current) => ({
        ...current,
        [data.id]: {
          quantity: String(data.quantity),
          sellingPrice: data.sellingPricePaise == null ? '' : String(data.sellingPricePaise / 100),
        },
      }));
      setMessage({ tone: 'success', text: `${product.name} added to this store with ${openingQuantity} opening units.` });
      setTab('mine');
    } catch (error: any) {
      setMessage({ tone: 'error', text: error?.response?.data?.message || 'Failed to add product to store' });
    } finally {
      setSavingId(null);
    }
  };

  const saveItem = async (item: InventoryItem, patch?: Partial<Pick<InventoryItem, 'isListed' | 'autoHideWhenOutOfStock'>>) => {
    const storeId = selectedStoreId;
    if (!storeId) return;
    const draft = editDrafts[item.id] || {
      quantity: String(item.quantity),
      sellingPrice: item.sellingPricePaise == null ? '' : String(item.sellingPricePaise / 100),
    };
    const quantity = parseWholeQuantity(draft.quantity);
    const parsedPrice = parseOptionalPrice(draft.sellingPrice);
    if (quantity === null) {
      setMessage({ tone: 'error', text: 'Stock must be a whole number between 0 and 1,000,000.' });
      return;
    }
    if (!parsedPrice.valid) {
      setMessage({ tone: 'error', text: 'Store price must be a valid non-negative amount.' });
      return;
    }
    const sellingPrice = parsedPrice.value;
    setSavingId(item.id);
    setMessage(null);
    try {
      const { data } = await apiClient.patch(`/stores/${storeId}/inventory`, {
        productId: item.productId,
        quantity,
        sellingPrice,
        isListed: patch?.isListed ?? item.isListed,
        autoHideWhenOutOfStock: patch?.autoHideWhenOutOfStock ?? item.autoHideWhenOutOfStock,
      });
      if (selectedStoreIdRef.current !== storeId) return;
      setAssortment((current) => current.map((row) => row.id === item.id ? { ...row, ...data } : row));
      setEditDrafts((current) => ({
        ...current,
        [item.id]: {
          quantity: String(data.quantity ?? quantity),
          sellingPrice: data.sellingPricePaise == null ? '' : String(data.sellingPricePaise / 100),
        },
      }));
      setMessage({ tone: 'success', text: `${item.product.name} inventory updated.` });
    } catch (error: any) {
      setMessage({ tone: 'error', text: error?.response?.data?.message || 'Failed to update inventory' });
    } finally {
      setSavingId(null);
    }
  };

  const selectedStore = stores.find((store) => store.id === selectedStoreId);

  return (
    <DashboardLayout allowedRole="STORE_OWNER">
      <div className="space-y-6 pb-28 lg:pb-8">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="enterprise-kicker">Store assortment</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Products & inventory</h1>
            <p className="mt-2 max-w-2xl text-sm font-semibold text-slate-500">
              Admin maintains the product catalogue. You choose what this store carries, set opening stock, and manage daily quantities.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {stores.length > 1 ? (
              <select
                aria-label="Select store"
                value={selectedStoreId}
                onChange={(event) => setSelectedStoreId(event.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold"
              >
                {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
              </select>
            ) : null}
            <button
              type="button"
              onClick={() => selectedStoreId ? void loadInventory(selectedStoreId) : void loadStores()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-600 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </header>

        {selectedStore ? (
          <div className="rounded-2xl border border-teal-100 bg-teal-50 px-4 py-3 text-sm font-bold text-teal-900">
            Managing <strong>{selectedStore.name}</strong>{selectedStore.address ? ` · ${selectedStore.address}` : ''}
          </div>
        ) : null}

        {message ? (
          <div className={`rounded-2xl border px-4 py-3 text-sm font-bold ${message.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
            {message.text}
          </div>
        ) : null}

        {!loading && stores.length === 0 ? (
          <div data-testid="no-assigned-stores" className="rounded-[2rem] border border-dashed border-amber-200 bg-amber-50 p-10 text-center">
            <Package className="mx-auto h-14 w-14 text-amber-500" />
            <h2 className="mt-5 text-xl font-black text-slate-950">No stores are assigned to this account</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm font-semibold text-slate-600">Contact an administrator to assign a store before managing products and inventory.</p>
            <button type="button" onClick={() => void loadStores()} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white">
              <RefreshCw className="h-4 w-4" /> Check again
            </button>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="enterprise-panel p-5"><p className="text-xs font-black uppercase tracking-wider text-slate-400">My products</p><p className="mt-2 text-3xl font-black text-slate-950">{assortment.length}</p></div>
          <div className="enterprise-panel p-5"><p className="text-xs font-black uppercase tracking-wider text-slate-400">Available to add</p><p className="mt-2 text-3xl font-black text-slate-950">{catalogue.length}</p></div>
          <div className="enterprise-panel p-5"><p className="text-xs font-black uppercase tracking-wider text-slate-400">Low stock</p><p className="mt-2 text-3xl font-black text-amber-600">{lowStockCount}</p></div>
        </div>

        <div className="flex rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm" role="tablist" aria-label="Inventory sections">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'mine'}
            data-testid="my-products-tab"
            onClick={() => setTab('mine')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black ${tab === 'mine' ? 'bg-slate-950 text-white' : 'text-slate-500'}`}
          >
            <ShoppingBag className="h-4 w-4" /> My products
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'catalogue'}
            data-testid="add-products-tab"
            onClick={() => setTab('catalogue')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black ${tab === 'catalogue' ? 'bg-slate-950 text-white' : 'text-slate-500'}`}
          >
            <Plus className="h-4 w-4" /> Add products
          </button>
        </div>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[1, 2, 3, 4, 5, 6].map((key) => <div key={key} className="h-56 animate-pulse rounded-3xl bg-slate-100" />)}</div>
        ) : tab === 'mine' ? (
          assortment.length === 0 ? (
            <div className="rounded-[2rem] border border-dashed border-slate-200 bg-white p-12 text-center">
              <Package className="mx-auto h-14 w-14 text-slate-300" />
              <h2 className="mt-5 text-xl font-black text-slate-950">This store has no products yet</h2>
              <p className="mt-2 text-sm font-semibold text-slate-500">Open Add products and choose items from the Admin catalogue.</p>
              <button type="button" onClick={() => setTab('catalogue')} className="mt-5 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white">Browse catalogue</button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="my-products-grid">
              {assortment.map((item) => {
                const draft = editDrafts[item.id] || { quantity: String(item.quantity), sellingPrice: '' };
                const quantity = parseWholeQuantity(draft.quantity) ?? item.quantity;
                return (
                  <article key={item.id} className="enterprise-panel flex flex-col gap-4 p-5">
                    <div className="flex items-start gap-4">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-100">
                        {item.product.image ? <img src={item.product.image} alt="" className="h-full w-full object-cover" /> : <Package className="h-6 w-6 text-slate-400" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-black uppercase tracking-wider text-teal-700">{item.product.category?.name || 'Catalogue'}</p>
                        <h2 className="truncate text-base font-black text-slate-950">{item.product.name}</h2>
                        <p className="mt-1 text-xs font-bold text-slate-400">Admin MRP {money(item.product.mrpPaise, item.product.price)}</p>
                      </div>
                    </div>

                    {item.quantity < 10 ? <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-black text-amber-700"><AlertTriangle className="h-4 w-4" /> {item.quantity === 0 ? 'Out of stock' : 'Low stock'}</div> : null}

                    <div className="grid grid-cols-2 gap-3">
                      <label className="text-xs font-black text-slate-500">Store price
                        <input aria-label={`${item.product.name} store price`} type="number" min={0} step="0.01" value={draft.sellingPrice} onChange={(event) => setEditDraft(item.id, 'sellingPrice', event.target.value)} placeholder={String(item.product.price)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-black text-slate-950" />
                      </label>
                      <label className="text-xs font-black text-slate-500">Current stock
                        <input aria-label={`${item.product.name} stock`} type="number" min={0} step={1} value={draft.quantity} onChange={(event) => setEditDraft(item.id, 'quantity', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-black text-slate-950" />
                      </label>
                    </div>

                    <div className="flex items-center gap-2">
                      <button type="button" aria-label={`Decrease ${item.product.name} stock`} onClick={() => setEditDraft(item.id, 'quantity', String(Math.max(0, quantity - 1)))} className="rounded-xl border border-slate-200 p-2.5"><Minus className="h-4 w-4" /></button>
                      <button type="button" aria-label={`Increase ${item.product.name} stock`} onClick={() => setEditDraft(item.id, 'quantity', String(quantity + 1))} className="rounded-xl border border-slate-200 p-2.5"><Plus className="h-4 w-4" /></button>
                      <button type="button" onClick={() => void saveItem(item)} disabled={savingId === item.id} className="ml-auto inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"><Save className="h-4 w-4" /> Save</button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => void saveItem(item, { isListed: !item.isListed })} className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-black ${item.isListed ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{item.isListed ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}{item.isListed ? 'Listed' : 'Hidden'}</button>
                      <button type="button" onClick={() => void saveItem(item, { autoHideWhenOutOfStock: !item.autoHideWhenOutOfStock })} className="rounded-xl bg-teal-50 px-3 py-2.5 text-xs font-black text-teal-700">Auto-hide: {item.autoHideWhenOutOfStock ? 'On' : 'Off'}</button>
                    </div>
                  </article>
                );
              })}
            </div>
          )
        ) : (
          <div className="space-y-4">
            <form onSubmit={(event) => { event.preventDefault(); void loadInventory(selectedStoreId, search); }} className="flex gap-2">
              <label className="relative flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input aria-label="Search Admin catalogue" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product name or description" className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm font-bold" />
              </label>
              <button type="submit" className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white">Search</button>
            </form>

            {catalogue.length === 0 ? (
              <div className="rounded-[2rem] border border-dashed border-slate-200 bg-white p-12 text-center">
                <Check className="mx-auto h-14 w-14 text-emerald-500" />
                <h2 className="mt-5 text-xl font-black text-slate-950">No more catalogue products</h2>
                <p className="mt-2 text-sm font-semibold text-slate-500">Every matching Admin product is already carried by this store.</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="catalogue-grid">
                {catalogue.map((product) => {
                  const draft = addDrafts[product.id] || { quantity: '0', sellingPrice: '' };
                  return (
                    <article key={product.id} className="enterprise-panel flex flex-col gap-4 p-5">
                      <div className="flex items-start gap-4">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-100">
                          {product.image ? <img src={product.image} alt="" className="h-full w-full object-cover" /> : <Package className="h-6 w-6 text-slate-400" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-black uppercase tracking-wider text-teal-700">{product.category?.name || 'Catalogue'}</p>
                          <h2 className="truncate text-base font-black text-slate-950">{product.name}</h2>
                          <p className="mt-1 text-xs font-bold text-slate-400">MRP {money(product.mrpPaise, product.price)}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <label className="text-xs font-black text-slate-500">Opening stock
                          <input aria-label={`${product.name} opening stock`} type="number" min={0} step={1} value={draft.quantity} onChange={(event) => setAddDraft(product.id, 'quantity', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-black" />
                        </label>
                        <label className="text-xs font-black text-slate-500">Store price
                          <input aria-label={`${product.name} new store price`} type="number" min={0} step="0.01" value={draft.sellingPrice} onChange={(event) => setAddDraft(product.id, 'sellingPrice', event.target.value)} placeholder={String(product.price)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-black" />
                        </label>
                      </div>
                      <button type="button" onClick={() => void addProduct(product)} disabled={savingId === product.id} className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-3 text-sm font-black text-white disabled:opacity-50"><Plus className="h-4 w-4" /> {savingId === product.id ? 'Adding…' : 'Add to store'}</button>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
