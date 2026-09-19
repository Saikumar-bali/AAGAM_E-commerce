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
    { name: 'Active orders', value: summary.activeOrders ?? 0, icon: Package, href: '/admin/orders', description: 'Open active orders', primary: true },
    { name: '30-day revenue', value: `₹${Number(summary.revenue || 0).toLocaleString('en-IN')}`, icon: TrendingUp, href: '/admin/analytics', description: 'Open business analytics' },
    { name: 'Active stores', value: summary.activeStores ?? 0, icon: Store, href: '/admin/stores', description: 'Open store directory' },
    { name: 'Provisioned riders', value: summary.riders ?? 0, icon: Truck, href: '/admin/riders', description: 'Open rider operations' },
  ];

  const fulfillment = summary.totalOrders ? Math.round((Number(summary.deliveredOrders || 0) / summary.totalOrders) * 1000) / 10 : 0;

  const trendColumns = [
    { key: 'date', header: 'Date', align: 'left' as const, render: (row: TrendRow) => <span className="font-semibold">{row.date}</span> },
    { key: 'orders', header: 'Orders', align: 'right' as const, render: (row: TrendRow) => <span className="font-bold">{row.orders}</span> },
    { key: 'revenue', header: 'Revenue', align: 'right' as const, render: (row: TrendRow) => <span className="font-semibold text-teal-700">₹{(Number(row.revenuePaise || 0) / 100).toLocaleString('en-IN')}</span> },
  ];

  return (
    <DashboardLayout allowedRole="ADMIN">
      <section className="mb-5 overflow-hidden rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div><p className="enterprise-kicker">Live overview</p><h1 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-slate-950 sm:text-xl">Operations dashboard</h1><p className="mt-0.5 text-xs text-slate-500">Last 30 days</p></div>
          <button onClick={() => void load()} disabled={loading} className="enterprise-button"><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
        </div>
      </section>
      {error ? <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div> : null}
      <div className="mb-5 grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-2.5">
        {stats.map((stat) => <button type="button" key={stat.name} onClick={() => router.push(stat.href)} aria-label={stat.description} className={`enterprise-card group min-h-[44px] text-left transition hover:border-teal-300 ${stat.primary ? 'col-span-2 row-span-1 border-teal-200 bg-teal-50/30 p-4 sm:p-5 lg:col-span-1 lg:row-span-2' : 'p-3 sm:p-3.5'}`}><div className="flex items-start justify-between gap-2"><span className={`grid place-items-center rounded-md ${stat.primary ? 'h-7 w-7 bg-teal-100 text-teal-700' : 'h-7 w-7 bg-slate-50 text-slate-400'}`}><stat.icon className="h-3.5 w-3.5" /></span><ArrowUpRight className={`transition group-hover:text-teal-700 ${stat.primary ? 'h-3.5 w-3.5 text-teal-400' : 'h-3 w-3 text-slate-300'}`} /></div><h3 className={`mt-2 text-[10px] font-semibold uppercase tracking-wider ${stat.primary ? 'text-teal-700' : 'text-slate-400'}`}>{stat.name}</h3><p className={`mt-0.5 break-words font-semibold text-slate-950 ${stat.primary ? 'text-2xl sm:text-3xl' : 'text-lg sm:text-xl'}`}>{loading ? '…' : stat.value}</p></button>)}
      </div>
      <div className="grid gap-2.5 lg:grid-cols-[1fr_0.8fr] lg:gap-3">
        <div className="enterprise-panel p-4 text-left sm:p-5">
            <div className="flex items-center justify-between"><div><p className="enterprise-kicker">Order trend</p><h2 className="mt-2 text-base font-semibold">Last seven days</h2></div></div>
          <div className="mt-3">
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
        <div className="enterprise-panel p-4 text-left sm:p-5">
          <div className="flex items-center justify-between"><p className="enterprise-kicker">Fulfillment</p></div>
          <div className="mt-3 flex items-center justify-between"><div><p className="text-2xl font-semibold tabular-nums">{fulfillment}%</p><p className="mt-0.5 text-[11px] text-slate-500">Delivered / recorded</p></div><Activity className="h-7 w-7 text-teal-600" /></div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-slate-100 p-2.5"><p className="text-base font-semibold tabular-nums">{summary.newUsers ?? 0}</p><p className="mt-0.5 text-[10px] text-slate-500">New users</p></div>
            <div className="rounded-lg border border-slate-100 p-2.5"><p className="text-base font-semibold tabular-nums">{summary.cancelledOrders ?? 0}</p><p className="mt-0.5 text-[10px] text-slate-500">Cancelled</p></div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
