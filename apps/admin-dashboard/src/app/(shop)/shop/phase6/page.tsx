'use client';

import React, { useEffect, useState } from 'react';
import { apiClient } from '@aagam/utils';
import DashboardLayout from '@/components/DashboardLayout';
import { formatINR } from '@/lib/currency';

type Address = { id: string; label?: string | null; line1: string; city: string; isDefault: boolean };
type Product = { id: string; name: string; price: number; category?: { name: string }; availability?: { storeId?: string | null; availableQty?: number | null; inStock?: boolean } };

export default function Phase6Page() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressId, setAddressId] = useState('');
  const [serviceability, setServiceability] = useState<any>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [substitutes, setSubstitutes] = useState<Record<string, Product[]>>({});
  const [message, setMessage] = useState('');

  useEffect(() => {
    apiClient.get('/customer/addresses').then((res) => {
      const list = Array.isArray(res.data) ? res.data : [];
      setAddresses(list);
      const selected = list.find((a: Address) => a.isDefault) || list[0];
      if (selected) setAddressId(selected.id);
    }).catch(() => setMessage('Could not load addresses'));
  }, []);

  useEffect(() => {
    if (!addressId) return;
    apiClient.get('/checkout/serviceability', { params: { addressId } }).then((res) => setServiceability(res.data)).catch(() => setMessage('Could not check serviceability'));
  }, [addressId]);

  useEffect(() => {
    Promise.all([
      apiClient.get('/products', { params: { search: query || undefined, categoryId: categoryId || undefined, addressId: addressId || undefined, includeAvailability: true } }),
      apiClient.get('/products/categories'),
    ]).then(([productRes, categoryRes]) => {
      setProducts(Array.isArray(productRes.data) ? productRes.data : productRes.data?.items || []);
      setCategories(Array.isArray(categoryRes.data) ? categoryRes.data : []);
    }).catch(() => setMessage('Could not load catalog'));
  }, [query, categoryId, addressId]);

  const add = async (product: Product) => {
    if (serviceability?.serviceable === false) { setMessage('Address is not serviceable'); return; }
    if (product.availability?.inStock === false) {
      const storeId = product.availability?.storeId || serviceability?.store?.id;
      if (storeId) {
        const res = await apiClient.get(`/products/${product.id}/substitutes`, { params: { storeId } });
        setSubstitutes((prev) => ({ ...prev, [product.id]: Array.isArray(res.data) ? res.data : [] }));
      }
      setMessage('Out of stock. Showing substitutes.');
      return;
    }
    setCart((prev) => ({ ...prev, [product.id]: (prev[product.id] || 0) + 1 }));
  };

  const cartCount = Object.values(cart).reduce((sum, qty) => sum + qty, 0);

  return (
    <DashboardLayout allowedRole="CUSTOMER">
      <div className="mx-auto max-w-7xl space-y-5 p-4 pb-24">
        <section className="rounded-3xl bg-slate-950 p-6 text-white"><div className="text-xs font-black uppercase text-teal-300">Phase 6 Shopping UX</div><h1 className="mt-2 text-3xl font-black">Serviceability, search, stock and substitutes</h1></section>
        <section className="grid gap-3 rounded-2xl border bg-white p-4 md:grid-cols-3"><select value={addressId} onChange={(e) => setAddressId(e.target.value)} className="rounded-xl border px-3 py-3 text-sm font-bold"><option value="">Select address</option>{addresses.map((a) => <option key={a.id} value={a.id}>{a.label || 'Address'} - {a.line1}, {a.city}</option>)}</select><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products" className="rounded-xl border px-3 py-3 text-sm font-bold" /><select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="rounded-xl border px-3 py-3 text-sm font-bold"><option value="">All categories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></section>
        {serviceability && <div className={`rounded-2xl border px-4 py-3 text-sm font-black ${serviceability.serviceable ? 'border-teal-200 bg-teal-50 text-teal-900' : 'border-red-200 bg-red-50 text-red-900'}`}>{serviceability.serviceable ? 'Serviceable' : 'Not serviceable'} • {serviceability.store?.name || 'Store'} • {serviceability.distanceKm?.toFixed?.(1)} km • ETA {serviceability.etaMinutes || 10} min</div>}
        {message && <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-black text-amber-900">{message}</div>}
        <div className="flex items-center justify-between"><div className="text-sm font-black text-slate-700">{products.length} products</div><div className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white">Cart {cartCount}</div></div>
        <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">{products.map((p) => <div key={p.id} className="rounded-2xl border bg-white p-3 shadow-sm"><div className="aspect-[4/3] rounded-xl bg-slate-100" /><h3 className="mt-3 text-sm font-black text-slate-950">{p.name}</h3><p className="mt-1 text-xs font-bold text-slate-500">{p.category?.name || 'General'}</p><div className="mt-2 flex items-center justify-between"><span className="font-black">{formatINR(Number(p.price) || 0)}</span><span className={p.availability?.inStock === false ? 'text-xs font-black text-red-600' : 'text-xs font-black text-teal-700'}>{p.availability?.inStock === false ? 'Out' : `${p.availability?.availableQty ?? 'In'} stock`}</span></div><button onClick={() => add(p)} disabled={serviceability?.serviceable === false} className="mt-3 w-full rounded-xl bg-teal-700 py-2 text-xs font-black text-white disabled:bg-slate-300">{p.availability?.inStock === false ? 'Substitutes' : 'Add'}</button>{substitutes[p.id]?.map((s) => <button key={s.id} onClick={() => add(s)} className="mt-2 block w-full rounded bg-amber-50 px-2 py-1 text-left text-xs font-bold">Replace with {s.name}</button>)}</div>)}</section>
      </div>
    </DashboardLayout>
  );
}
