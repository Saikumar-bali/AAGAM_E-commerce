'use client';

import React, { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { DataTable } from '@/components/DataTable';
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

  const trendColumns = [
    { key: 'date', header: 'Date', align: 'left' as const, render: (row: any) => <span className="font-semibold">{row.date}</span> },
    { key: 'orders', header: 'Orders', align: 'right' as const, render: (row: any) => <span className="font-bold">{row.orders}</span> },
    { key: 'delivered', header: 'Delivered', align: 'right' as const, render: (row: any) => <span className="font-bold text-emerald-700">{row.delivered}</span> },
    { key: 'revenue', header: 'Revenue', align: 'right' as const, render: (row: any) => <span className="font-semibold text-teal-700">{moneyPaise(row.revenuePaise)}</span> },
  ];

  const statusColumns = [
    { key: 'status', header: 'Status', align: 'left' as const, render: (row: any) => <span className="font-semibold">{row.status.replace(/_/g, ' ')}</span> },
    { key: 'count', header: 'Count', align: 'right' as const, render: (row: any) => <span className="font-semibold">{row.count}</span> },
  ];

  const storeColumns = [
    { key: 'name', header: 'Store', align: 'left' as const, render: (row: any) => <span className="font-semibold">{row.storeName}</span> },
    { key: 'orders', header: 'Orders', align: 'right' as const, render: (row: any) => <span className="font-bold">{row.orders}</span> },
    { key: 'delivered', header: 'Delivered', align: 'right' as const, render: (row: any) => <span className="font-bold text-emerald-700">{row.delivered}</span> },
    { key: 'cancelled', header: 'Cancelled', align: 'right' as const, render: (row: any) => <span className="font-bold text-red-700">{row.cancelled}</span> },
    { key: 'revenue', header: 'Revenue', align: 'right' as const, render: (row: any) => <span className="font-semibold text-emerald-700">{money(row.revenue)}</span> },
  ];

  const riderColumns = [
    { key: 'name', header: 'Rider', align: 'left' as const, render: (row: any) => <span className="font-semibold">{row.riderName}</span> },
    { key: 'assigned', header: 'Assigned', align: 'right' as const, render: (row: any) => <span className="font-bold">{row.assigned}</span> },
    { key: 'delivered', header: 'Delivered', align: 'right' as const, render: (row: any) => <span className="font-bold text-emerald-700">{row.delivered}</span> },
    { key: 'active', header: 'Active', align: 'right' as const, render: (row: any) => <span className="font-bold">{row.active}</span> },
  ];

  const supportCategoryColumns = [
    { key: 'category', header: 'Category', align: 'left' as const, render: (row: any) => <span className="font-semibold">{row.category}</span> },
    { key: 'count', header: 'Tickets', align: 'right' as const, render: (row: any) => <span className="font-semibold">{row.count}</span> },
  ];

  return (
    <DashboardLayout allowedRole="ADMIN">
      <main className="space-y-5 p-4 pb-24">
        <section className="flex flex-col gap-4 rounded-xl bg-slate-950 p-6 text-white md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-teal-300">Business intelligence</p>
            <h1 className="mt-2 text-3xl font-semibold">Operational Analytics</h1>
            <p className="mt-2 text-sm text-slate-300">Revenue, order status, store performance, rider delivery and support health.</p>
          </div>
          <div className="flex items-center gap-2">
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-950">
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <button onClick={fetchAnalytics} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-950"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
          </div>
        </section>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}
        {loading && <div className="rounded-xl bg-slate-100 p-8 text-center text-sm font-bold text-slate-500">Loading analytics...</div>}

        {data && !loading && (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {summaryCards.map((card) => <article key={card.label} className="rounded-xl border bg-white p-5 "><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase text-slate-400">{card.label}</p><p className="mt-2 text-2xl font-semibold text-slate-950">{card.value}</p></div><div className={`grid h-12 w-12 place-items-center rounded-xl ${card.tone}`}><card.icon className="h-5 w-5" /></div></div></article>)}
            </section>

            <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
              <article className="rounded-xl border bg-white p-5 ">
                <h2 className="text-lg font-semibold">Order Status Mix</h2>
                <div className="mt-4">
                  <DataTable
                    columns={statusColumns}
                    data={Object.entries(data.statusCounts).map(([status, count]) => ({ status, count }))}
                    keyExtractor={(row) => row.status}
                    emptyText="No status data available."
                    compact
                    bordered={false}
                  />
                </div>
              </article>

              <article className="rounded-xl border bg-white p-5 ">
                <h2 className="text-lg font-semibold">Trend</h2>
                <div className="mt-4">
                  <DataTable
                    columns={trendColumns}
                    data={data.trend}
                    keyExtractor={(row) => row.date}
                    emptyText="No trend data in this period."
                    compact
                    bordered={false}
                  />
                </div>
              </article>
            </section>

            <section className="grid gap-5 xl:grid-cols-2">
              <article className="rounded-xl border bg-white p-5 ">
                <div className="mb-4 flex items-center gap-2"><Store className="h-5 w-5 text-teal-600" /><h2 className="text-lg font-semibold">Store Performance</h2></div>
                <div className="mt-2">
                  <DataTable
                    columns={storeColumns}
                    data={data.storePerformance}
                    keyExtractor={(row) => row.storeId}
                    emptyText="No store data in this range."
                    compact
                  />
                </div>
              </article>

              <article className="rounded-xl border bg-white p-5 ">
                <div className="mb-4 flex items-center gap-2"><Bike className="h-5 w-5 text-indigo-600" /><h2 className="text-lg font-semibold">Rider Performance</h2></div>
                <div className="mt-2">
                  <DataTable
                    columns={riderColumns}
                    data={data.riderPerformance}
                    keyExtractor={(row) => row.riderProfileId}
                    emptyText="No rider data in this range."
                    compact
                  />
                </div>
              </article>
            </section>

            <section className="rounded-xl border bg-white p-5 ">
              <div className="mb-4 flex items-center gap-2"><Headphones className="h-5 w-5 text-red-600" /><h2 className="text-lg font-semibold">Support Analytics</h2></div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl bg-red-50 p-4"><p className="text-xs font-semibold uppercase text-red-400">Total tickets</p><p className="mt-2 text-2xl font-semibold text-red-700">{data.support.total}</p></div>
                <div className="rounded-xl bg-yellow-50 p-4"><p className="text-xs font-semibold uppercase text-yellow-600">Rating count</p><p className="mt-2 text-2xl font-semibold text-yellow-800">{data.ratings.count}</p></div>
              </div>
              <div className="mt-4">
                <DataTable
                  columns={supportCategoryColumns}
                  data={Object.entries(data.support.byCategory).map(([category, count]) => ({ category, count }))}
                  keyExtractor={(row) => row.category}
                  emptyText="No support category data."
                  compact
                  bordered={false}
                />
              </div>
            </section>
          </>
        )}
      </main>
    </DashboardLayout>
  );
}
