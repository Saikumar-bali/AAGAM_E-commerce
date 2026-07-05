'use client';

import React, { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { apiClient } from '@aagam/utils';
import { BarChart3, Bike, Headphones, IndianRupee, PackageCheck, RefreshCw, Store, Star, TrendingUp, Users } from 'lucide-react';

type AnalyticsPayload = {
  range: { days: number; from: string; to: string };
  summary: Record<string, any>;
  statusCounts: Record<string, number>;
  storePerformance: Array<any>;
  riderPerformance: Array<any>;
  support: { total: number; byCategory: Record<string, number>; recent: Array<any> };
  ratings: { count: number; average: number | null };
  trend: Array<{ date: string; orders: number; delivered: number; revenuePaise: number }>;
};

function moneyPaise(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format((Number(value) || 0) / 100);
}

function money(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value) || 0);
}

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAnalytics = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.get('/analytics/business', { params: { days } });
      setData(res.data);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not load analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAnalytics(); }, [days]);

  const summaryCards = useMemo(() => {
    const s = data?.summary || {};
    return [
      { label: 'Revenue', value: moneyPaise(s.revenuePaise), icon: IndianRupee, tone: 'bg-emerald-50 text-emerald-700' },
      { label: 'Orders', value: s.totalOrders || 0, icon: PackageCheck, tone: 'bg-blue-50 text-blue-700' },
      { label: 'Active Orders', value: s.activeOrders || 0, icon: TrendingUp, tone: 'bg-violet-50 text-violet-700' },
      { label: 'Delivered', value: s.deliveredOrders || 0, icon: PackageCheck, tone: 'bg-teal-50 text-teal-700' },
      { label: 'Avg Order', value: moneyPaise(s.averageOrderValuePaise), icon: BarChart3, tone: 'bg-amber-50 text-amber-700' },
      { label: 'Support Tickets', value: s.supportTickets || 0, icon: Headphones, tone: 'bg-red-50 text-red-700' },
      { label: 'Avg Rating', value: s.averageRating ?? '—', icon: Star, tone: 'bg-yellow-50 text-yellow-700' },
      { label: 'New Users', value: s.newUsers || 0, icon: Users, tone: 'bg-slate-100 text-slate-700' },
    ];
  }, [data]);

  return (
    <DashboardLayout allowedRole="ADMIN">
      <main className="space-y-5 p-4 pb-24">
        <section className="flex flex-col gap-4 rounded-3xl bg-slate-950 p-6 text-white md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black uppercase text-teal-300">Business intelligence</p>
            <h1 className="mt-2 text-3xl font-black">Operational Analytics</h1>
            <p className="mt-2 text-sm text-slate-300">Revenue, order status, store performance, rider delivery and support health.</p>
          </div>
          <div className="flex items-center gap-2">
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-2xl bg-white px-3 py-2 text-sm font-black text-slate-950">
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <button onClick={fetchAnalytics} className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-black text-slate-950"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
          </div>
        </section>

        {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-black text-red-700">{error}</div>}
        {loading && <div className="rounded-2xl bg-slate-100 p-8 text-center text-sm font-bold text-slate-500">Loading analytics...</div>}

        {data && !loading && (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {summaryCards.map((card) => <article key={card.label} className="rounded-3xl border bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase text-slate-400">{card.label}</p><p className="mt-2 text-2xl font-black text-slate-950">{card.value}</p></div><div className={`grid h-12 w-12 place-items-center rounded-2xl ${card.tone}`}><card.icon className="h-5 w-5" /></div></div></article>)}
            </section>

            <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
              <article className="rounded-3xl border bg-white p-5 shadow-sm">
                <h2 className="text-lg font-black">Order Status Mix</h2>
                <div className="mt-4 space-y-2">{Object.entries(data.statusCounts).map(([status, count]) => <div key={status} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3"><span className="text-xs font-black text-slate-600">{status.replace(/_/g, ' ')}</span><span className="text-sm font-black text-slate-950">{count}</span></div>)}</div>
              </article>

              <article className="rounded-3xl border bg-white p-5 shadow-sm">
                <h2 className="text-lg font-black">7-Day Trend</h2>
                <div className="mt-4 space-y-2">{data.trend.map((row) => <div key={row.date} className="rounded-2xl bg-slate-50 p-3"><div className="flex items-center justify-between text-xs font-black text-slate-600"><span>{row.date}</span><span>{row.orders} orders · {moneyPaise(row.revenuePaise)}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-teal-600" style={{ width: `${Math.min(100, row.orders * 12)}%` }} /></div></div>)}</div>
              </article>
            </section>

            <section className="grid gap-5 xl:grid-cols-2">
              <article className="rounded-3xl border bg-white p-5 shadow-sm"><div className="mb-4 flex items-center gap-2"><Store className="h-5 w-5 text-teal-600" /><h2 className="text-lg font-black">Store Performance</h2></div><div className="space-y-3">{data.storePerformance.length === 0 && <p className="text-sm font-bold text-slate-500">No store data in this range.</p>}{data.storePerformance.map((store) => <div key={store.storeId} className="rounded-2xl border border-slate-100 p-4"><div className="flex items-center justify-between"><div><p className="text-sm font-black text-slate-950">{store.storeName}</p><p className="text-xs font-bold text-slate-500">{store.orders} orders · {store.delivered} delivered · {store.cancelled} cancelled</p></div><p className="text-sm font-black text-emerald-700">{money(store.revenue)}</p></div></div>)}</div></article>

              <article className="rounded-3xl border bg-white p-5 shadow-sm"><div className="mb-4 flex items-center gap-2"><Bike className="h-5 w-5 text-indigo-600" /><h2 className="text-lg font-black">Rider Performance</h2></div><div className="space-y-3">{data.riderPerformance.length === 0 && <p className="text-sm font-bold text-slate-500">No rider data in this range.</p>}{data.riderPerformance.map((rider) => <div key={rider.riderProfileId} className="rounded-2xl border border-slate-100 p-4"><div className="flex items-center justify-between"><div><p className="text-sm font-black text-slate-950">{rider.riderName}</p><p className="text-xs font-bold text-slate-500">{rider.assigned} assigned · {rider.delivered} delivered · {rider.active} active</p></div><span className="rounded-full bg-indigo-50 px-2 py-1 text-[11px] font-black text-indigo-700">Delivery</span></div></div>)}</div></article>
            </section>

            <section className="rounded-3xl border bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2"><Headphones className="h-5 w-5 text-red-600" /><h2 className="text-lg font-black">Support Analytics</h2></div>
              <div className="grid gap-4 md:grid-cols-2"><div className="rounded-2xl bg-red-50 p-4"><p className="text-xs font-black uppercase text-red-400">Total tickets</p><p className="mt-2 text-2xl font-black text-red-700">{data.support.total}</p></div><div className="rounded-2xl bg-yellow-50 p-4"><p className="text-xs font-black uppercase text-yellow-600">Rating count</p><p className="mt-2 text-2xl font-black text-yellow-800">{data.ratings.count}</p></div></div>
              <div className="mt-4 grid gap-2 md:grid-cols-3">{Object.entries(data.support.byCategory).map(([category, count]) => <div key={category} className="rounded-2xl bg-slate-50 px-4 py-3"><p className="text-xs font-black text-slate-500">{category}</p><p className="text-lg font-black text-slate-950">{count}</p></div>)}</div>
            </section>
          </>
        )}
      </main>
    </DashboardLayout>
  );
}
