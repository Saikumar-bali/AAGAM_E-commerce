'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { apiClient } from '@aagam/utils';
import DashboardLayout from '@/components/DashboardLayout';
import { formatINR } from '@/lib/currency';

type Address = { id: string; label?: string | null; line1: string; city: string; isDefault: boolean };
type Product = { id: string; name: string; price: number; category?: { name: string }; availability?: { storeId?: string | null; availableQty?: number | null; inStock?: boolean } };
type CartLine = { product: Product; quantity: number };

export default function Phase6Page() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressId, setAddressId] = useState('');
  const [serviceability, setServiceability] = useState<any>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [quote, setQuote] = useState<any>(null);
  const [placing, setPlacing] = useState(false);
  const [substitutes, setSubstitutes] = useState<Record<string, Product[]>>({});
  const [message, setMessage] = useState('');

  const lines = Object.values(cart);
  const cartCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const payload = useMemo(() => lines.map((line) => ({ productId: line.product.id, quantity: line.quantity })), [cart]);

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

  useEffect(() => {
    if (!addressId || payload.length === 0) { setQuote(null); return; }
    apiClient.post('/checkout/quote', { addressId, items: payload }).then((res) => setQuote(res.data)).catch((error) => {
      setQuote(null);
      setMessage(error?.response?.data?.message || 'Could not calculate quote');
    });
  }, [addressId, payload]);

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
    setCart((prev) => {
      const existing = prev[product.id];
      const available = product.availability?.availableQty;
      const nextQty = existing ? existing.quantity + 1 : 1;
      if (available != null && nextQty > available) return prev;
      return { ...prev, [product.id]: { product, quantity: nextQty } };
    });
  };

  const updateQty = (id: string, next: number) => setCart((prev) => {
    const current = prev[id];
    if (!current) return prev;
    if (next <= 0) { const copy = { ...prev }; delete copy[id]; return copy; }
    const available = current.product.availability?.availableQty;
    if (available != null && next > available) return prev;
    return { ...prev, [id]: { ...current, quantity: next } };
  });

  const placeOrder = async () => {
    if (!addressId || payload.length === 0) return;
    setPlacing(true);
    setMessage('');
    try {
      const res = await apiClient.post('/checkout/place-order', { addressId, items: payload, paymentMethod: 'COD' }, { headers: { 'Idempotency-Key': `phase6-${Date.now()}` } });
      setCart({});
      setQuote(null);
      setMessage(`Order created: ${(res.data?.id || '').slice(0, 8).toUpperCase()}`);
    } catch (error: any) {
      setMessage(error?.response?.data?.message || 'Could not place order');
    } finally {
      setPlacing(false);
    }
  };

  return (
    <DashboardLayout allowedRole="CUSTOMER">
      <div className="mx-auto max-w-7xl space-y-5 p-4 pb-24">
        <section className="rounded-3xl bg-slate-950 p-6 text-white"><div className="text-xs font-black uppercase text-teal-300">Phase 6 Shopping UX</div><h1 className="mt-2 text-3xl font-black">Serviceability, search, stock, cart and quote</h1></section>
        <section className="grid gap-3 rounded-2xl border bg-white p-4 md:grid-cols-3"><select value={addressId} onChange={(e) => setAddressId(e.target.value)} className="rounded-xl border px-3 py-3 text-sm font-bold"><option value="">Select address</option>{addresses.map((a) => <option key={a.id} value={a.id}>{a.label || 'Address'} - {a.line1}, {a.city}</option>)}</select><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products" className="rounded-xl border px-3 py-3 text-sm font-bold" /><select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="rounded-xl border px-3 py-3 text-sm font-bold"><option value="">All categories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></section>
        {serviceability && <div className={`rounded-2xl border px-4 py-3 text-sm font-black ${serviceability.serviceable ? 'border-teal-200 bg-teal-50 text-teal-900' : 'border-red-200 bg-red-50 text-red-900'}`}>{serviceability.serviceable ? 'Serviceable' : 'Not serviceable'} • {serviceability.store?.name || 'Store'} • {serviceability.distanceKm?.toFixed?.(1)} km • ETA {serviceability.etaMinutes || 10} min • Fee {formatINR(serviceability.deliveryFee || 0)}</div>}
        {message && <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-black text-amber-900">{message}</div>}
        <section className="grid gap-4 lg:grid-cols-[1fr_360px]"><div><div className="mb-3 text-sm font-black text-slate-700">{products.length} products</div><div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">{products.map((p) => <div key={p.id} className="rounded-2xl border bg-white p-3 shadow-sm"><div className="aspect-[4/3] rounded-xl bg-slate-100" /><h3 className="mt-3 text-sm font-black text-slate-950">{p.name}</h3><p className="mt-1 text-xs font-bold text-slate-500">{p.category?.name || 'General'}</p><div className="mt-2 flex items-center justify-between"><span className="font-black">{formatINR(Number(p.price) || 0)}</span><span className={p.availability?.inStock === false ? 'text-xs font-black text-red-600' : 'text-xs font-black text-teal-700'}>{p.availability?.inStock === false ? 'Out' : `${p.availability?.availableQty ?? 'In'} stock`}</span></div><button onClick={() => add(p)} disabled={serviceability?.serviceable === false} className="mt-3 w-full rounded-xl bg-teal-700 py-2 text-xs font-black text-white disabled:bg-slate-300">{p.availability?.inStock === false ? 'Substitutes' : 'Add'}</button>{substitutes[p.id]?.map((s) => <button key={s.id} onClick={() => add(s)} className="mt-2 block w-full rounded bg-amber-50 px-2 py-1 text-left text-xs font-bold">Replace with {s.name}</button>)}</div>)}</div></div><aside className="h-fit rounded-2xl border bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><div className="text-lg font-black text-slate-950">Cart</div><div className="rounded-xl bg-slate-950 px-3 py-1 text-xs font-black text-white">{cartCount} items</div></div>{lines.length === 0 && <p className="mt-4 text-sm font-bold text-slate-500">Add products to calculate quote.</p>}{lines.map((line) => <div key={line.product.id} className="mt-3 rounded-xl bg-slate-50 p-3"><div className="text-sm font-black">{line.product.name}</div><div className="mt-2 flex items-center justify-between"><span className="text-xs font-bold text-slate-500">{formatINR(line.product.price)}</span><div className="flex items-center gap-2"><button onClick={() => updateQty(line.product.id, line.quantity - 1)} className="rounded bg-white px-2 font-black">-</button><span className="text-sm font-black">{line.quantity}</span><button onClick={() => updateQty(line.product.id, line.quantity + 1)} className="rounded bg-white px-2 font-black">+</button></div></div></div>)}{quote && <div className="mt-4 rounded-xl bg-teal-50 p-3 text-sm font-bold text-teal-900">{quote.store?.name || 'Store'} • {quote.distanceKm?.toFixed?.(1)} km • ETA {quote.etaMinutes || 10} min<br />Subtotal {formatINR(quote.invoice.subtotal)}<br />Delivery {formatINR(quote.invoice.deliveryFee)}<br /><span className="text-lg font-black">Total {formatINR(quote.invoice.grandTotal)}</span></div>}<button onClick={placeOrder} disabled={placing || lines.length === 0 || quote?.serviceable === false} className="mt-4 w-full rounded-2xl bg-slate-950 py-3 text-sm font-black text-white disabled:bg-slate-300">{placing ? 'Placing...' : 'Place COD order'}</button></aside></section>
      </div>
    </DashboardLayout>
  );
}
