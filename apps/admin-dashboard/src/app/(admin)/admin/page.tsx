'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { DataTable } from '@/components/DataTable';
import { apiClient } from '@aagam/utils';
import { Activity, ArrowUpRight, Package, RefreshCw, Store, TrendingUp, Truck, Users } from 'lucide-react';

interface TrendRow {
  date: string;
  orders: number;
  revenuePaise: number;
}

interface Summary {
  activeStores?: number;
  riders?: number;
  activeOrders?: number;
  revenue?: number;
  totalOrders?: number;
  deliveredOrders?: number;
  newUsers?: number;
  cancelledOrders?: number;
}

interface DashboardData {
  summary: Summary;
  trend: TrendRow[];
}

export default function AdminDashboard() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError('');
    try { setData((await apiClient.get('/analytics/business?days=30')).data); }
    catch (reason: any) { setError(reason?.response?.data?.message || 'Could not load live operational data.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const summary = data?.summary || {};
  const stats = [
    { name: 'Active stores', value: summary.activeStores ?? 0, icon: Store, href: '/admin/stores', description: 'Open store directory' },
    { name: 'Provisioned riders', value: summary.riders ?? 0, icon: Truck, href: '/admin/riders', description: 'Open rider operations' },
    { name: 'Active orders', value: summary.activeOrders ?? 0, icon: Package, href: '/admin/orders', description: 'Open active orders' },
    { name: '30-day revenue', value: `₹${Number(summary.revenue || 0).toLocaleString('en-IN')}`, icon: TrendingUp, href: '/admin/analytics', description: 'Open business analytics' },
  ];

  const fulfillment = summary.totalOrders ? Math.round((Number(summary.deliveredOrders || 0) / summary.totalOrders) * 1000) / 10 : 0;

  const trendColumns = [
    { key: 'date', header: 'Date', align: 'left' as const, render: (row: TrendRow) => <span className="font-black">{row.date}</span> },
    { key: 'orders', header: 'Orders', align: 'right' as const, render: (row: TrendRow) => <span className="font-bold">{row.orders}</span> },
    { key: 'revenue', header: 'Revenue', align: 'right' as const, render: (row: TrendRow) => <span className="font-black text-teal-700">₹{(Number(row.revenuePaise || 0) / 100).toLocaleString('en-IN')}</span> },
  ];

  return (
    <DashboardLayout allowedRole="ADMIN">
      <section className="mb-6 overflow-hidden rounded-[2rem] bg-slate-950 p-6 text-white shadow-[0_30px_90px_rgba(15,23,42,0.22)] sm:p-8">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
          <div><p className="inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-[0.22em] text-teal-200">Live overview</p><h1 className="mt-5 max-w-3xl text-3xl font-black tracking-[-0.05em] sm:text-4xl">Everything needed to run Aagaam operations.</h1><p className="mt-3 text-sm font-semibold text-slate-300">Production records from the last 30 days.</p></div>
          <button onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center rounded-2xl bg-white px-5 py-3 font-black text-slate-950 disabled:opacity-60"><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh data</button>
        </div>
      </section>
      {error ? <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 font-bold text-red-700">{error}</div> : null}
      <div className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5">
        {stats.map((stat) => <button type="button" key={stat.name} onClick={() => router.push(stat.href)} aria-label={stat.description} className="enterprise-card group p-4 text-left transition hover:-translate-y-1 hover:border-teal-200 hover:shadow-xl sm:p-5"><div className="flex items-start justify-between gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-teal-50 text-teal-700"><stat.icon className="h-6 w-6" /></span><ArrowUpRight className="h-4 w-4 text-slate-300 transition group-hover:text-teal-700" /></div><h3 className="mt-4 text-xs font-black text-slate-500 sm:text-sm">{stat.name}</h3><p className="mt-1 break-words text-2xl font-black text-slate-950 sm:text-3xl">{loading ? '…' : stat.value}</p></button>)}
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_0.8fr] lg:gap-6">
        <div className="enterprise-panel p-5 text-left">
          <div className="flex items-center justify-between"><div><p className="enterprise-kicker">Order trend</p><h2 className="mt-3 text-2xl font-black">Last seven days</h2></div></div>
          <div className="mt-6">
            <DataTable<TrendRow>
              columns={trendColumns}
              data={data?.trend || []}
              keyExtractor={(row) => row.date}
              emptyText="No orders in this period."
              compact
              searchPlaceholder="Search trends..."
            />
          </div>
        </div>
        <div className="enterprise-panel p-5 text-left">
          <div className="flex items-center justify-between"><p className="enterprise-kicker">Fulfillment</p></div>
          <div className="mt-4 flex items-center justify-between"><div><p className="text-5xl font-black">{fulfillment}%</p><p className="mt-2 font-semibold text-slate-500">Delivered / recorded orders</p></div><Activity className="h-12 w-12 text-teal-600" /></div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-slate-50 p-4"><Users className="h-5 w-5" /><p className="mt-3 text-2xl font-black">{summary.newUsers ?? 0}</p><p className="text-xs font-bold text-slate-500">New users</p></div>
            <div className="rounded-2xl bg-slate-50 p-4"><Package className="h-5 w-5" /><p className="mt-3 text-2xl font-black">{summary.cancelledOrders ?? 0}</p><p className="text-xs font-bold text-slate-500">Cancelled</p></div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
