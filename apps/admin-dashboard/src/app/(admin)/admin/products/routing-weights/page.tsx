'use client';

import React, { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { apiClient } from '@aagam/utils';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Scale, Search } from 'lucide-react';

type Product = {
  id: string;
  name: string;
  description?: string | null;
  image?: string | null;
  weightGrams?: number | null;
  details?: Record<string, unknown> | null;
  isActive?: boolean;
  category?: { name?: string | null } | null;
};

type Filter = 'missing' | 'all' | 'ready';

function displayPackWeight(product: Product) {
  const value = product.details && typeof product.details === 'object' ? product.details.weight : null;
  return typeof value === 'string' && value.trim() ? value.trim() : 'Not provided';
}

export default function ProductRoutingWeightsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('missing');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiClient.get('/admin/products');
      const rows = Array.isArray(response.data) ? response.data as Product[] : [];
      setProducts(rows);
      setDrafts(rows.reduce<Record<string, string>>((acc, product) => {
        acc[product.id] = product.weightGrams && product.weightGrams > 0 ? String(product.weightGrams) : '';
        return acc;
      }, {}));
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load product routing weights.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const stats = useMemo(() => {
    const missing = products.filter((product) => !Number.isInteger(product.weightGrams) || Number(product.weightGrams) < 1).length;
    return { total: products.length, missing, ready: products.length - missing };
  }, [products]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return [...products]
      .filter((product) => {
        const hasWeight = Number.isInteger(product.weightGrams) && Number(product.weightGrams) > 0;
        if (filter === 'missing' && hasWeight) return false;
        if (filter === 'ready' && !hasWeight) return false;
        if (!term) return true;
        return product.name.toLowerCase().includes(term)
          || String(product.category?.name || '').toLowerCase().includes(term)
          || String(product.id).toLowerCase().includes(term);
      })
      .sort((left, right) => {
        const leftMissing = !Number.isInteger(left.weightGrams) || Number(left.weightGrams) < 1;
        const rightMissing = !Number.isInteger(right.weightGrams) || Number(right.weightGrams) < 1;
        if (leftMissing !== rightMissing) return leftMissing ? -1 : 1;
        return left.name.localeCompare(right.name);
      });
  }, [products, search, filter]);

  const saveWeight = async (product: Product) => {
    const value = Number(drafts[product.id]);
    if (!Number.isInteger(value) || value < 1) {
      setError(`Enter a positive whole-number routing weight in grams for ${product.name}.`);
      return;
    }
    setSaving((current) => ({ ...current, [product.id]: true }));
    setSaved((current) => ({ ...current, [product.id]: false }));
    setError('');
    try {
      const response = await apiClient.patch(`/admin/products/${product.id}/weight`, { weightGrams: value });
      const updated = response.data as Product;
      setProducts((current) => current.map((row) => row.id === product.id ? { ...row, ...updated, weightGrams: value } : row));
      setDrafts((current) => ({ ...current, [product.id]: String(value) }));
      setSaved((current) => ({ ...current, [product.id]: true }));
    } catch (err: any) {
      setError(err?.response?.data?.message || `Failed to save routing weight for ${product.name}.`);
    } finally {
      setSaving((current) => ({ ...current, [product.id]: false }));
    }
  };

  return (
    <DashboardLayout allowedRole="ADMIN">
      <div className="space-y-6 pb-24 lg:pb-10">
        <header className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-emerald-800"><Scale className="h-3.5 w-3.5" /> Routing data</p>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Product routing weights</h1>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
                Maintain the authoritative per-unit package weight used by subscription serviceability, route capacity, rider eligibility and regional planning. This is separate from the customer-facing free-text Weight field.
              </p>
            </div>
            <button onClick={() => void load()} disabled={loading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:border-emerald-300 hover:text-emerald-800 disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-3">
          <Metric label="Products" value={stats.total} tone="slate" />
          <Metric label="Routing-ready" value={stats.ready} tone="emerald" />
          <Metric label="Missing weight" value={stats.missing} tone={stats.missing ? 'amber' : 'emerald'} />
        </section>

        {stats.missing > 0 ? (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-black">Subscriptions remain blocked for products without routing weight.</p>
              <p className="mt-1 text-sm font-semibold text-amber-900/80">Enter the real packaged unit weight in grams. Do not copy volume text such as “500 ml” unless the actual packaged weight is known.</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 font-bold text-emerald-900"><CheckCircle2 className="h-5 w-5" /> Every catalog product has an authoritative routing weight.</div>
        )}

        <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center">
            <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input aria-label="Search products" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product, category or ID" className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4 text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500" /></div>
            <select aria-label="Routing weight filter" value={filter} onChange={(event) => setFilter(event.target.value as Filter)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700"><option value="missing">Missing weight first</option><option value="all">All products</option><option value="ready">Routing-ready</option></select>
          </div>

          {error ? <div className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm font-bold text-red-700">{error}</div> : null}

          <div className="divide-y divide-slate-100">
            {loading ? <div className="flex items-center justify-center gap-2 p-12 font-bold text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading products…</div> : visible.length === 0 ? <div className="p-12 text-center text-sm font-bold text-slate-500">No products match this view.</div> : visible.map((product) => {
              const hasWeight = Number.isInteger(product.weightGrams) && Number(product.weightGrams) > 0;
              return (
                <article key={product.id} data-testid={`routing-weight-${product.id}`} className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_220px_290px] lg:items-center">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">{product.image ? <img src={product.image} alt="" className="h-full w-full object-cover" /> : <Scale className="h-5 w-5 text-slate-400" />}</div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><h2 className="truncate font-black text-slate-950">{product.name}</h2><span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${hasWeight ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{hasWeight ? 'Routing-ready' : 'Weight required'}</span>{product.isActive === false ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600">Inactive</span> : null}</div>
                      <p className="mt-1 truncate text-xs font-semibold text-slate-500">{product.category?.name || 'Uncategorized'} · {product.id}</p>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-slate-50 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">Customer display weight</p>
                    <p className="mt-1 font-black text-slate-900">{displayPackWeight(product)}</p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-500">Informational only; not used by routing.</p>
                  </div>

                  <div className="flex items-end gap-2">
                    <label className="min-w-0 flex-1 text-xs font-black uppercase tracking-wide text-slate-500">Routing unit weight (grams)<input aria-label={`Routing weight for ${product.name}`} inputMode="numeric" type="number" min={1} step={1} value={drafts[product.id] ?? ''} onChange={(event) => setDrafts((current) => ({ ...current, [product.id]: event.target.value.replace(/[^0-9]/g, '') }))} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-base font-black normal-case tracking-normal text-slate-950 focus:ring-2 focus:ring-emerald-500" /></label>
                    <button onClick={() => void saveWeight(product)} disabled={saving[product.id]} className="inline-flex min-h-11 min-w-24 items-center justify-center rounded-xl bg-emerald-700 px-4 text-sm font-black text-white hover:bg-emerald-800 disabled:opacity-50">{saving[product.id] ? <Loader2 className="h-4 w-4 animate-spin" /> : saved[product.id] ? 'Saved' : 'Save'}</button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: 'slate' | 'emerald' | 'amber' }) {
  const classes = tone === 'emerald' ? 'border-emerald-200 bg-emerald-50 text-emerald-950' : tone === 'amber' ? 'border-amber-200 bg-amber-50 text-amber-950' : 'border-slate-200 bg-white text-slate-950';
  return <div className={`rounded-2xl border p-5 shadow-sm ${classes}`}><p className="text-xs font-black uppercase tracking-[0.14em] opacity-65">{label}</p><p className="mt-2 text-3xl font-black">{value}</p></div>;
}
