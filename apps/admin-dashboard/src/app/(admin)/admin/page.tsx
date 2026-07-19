'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { apiClient } from '@aagam/utils';
import { Activity, Package, RefreshCw, Store, TrendingUp, Truck, Users } from 'lucide-react';

export default function AdminDashboard() {
  const [data, setData] = useState<any>(null);
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
    { name: 'Active stores', value: summary.activeStores ?? 0, icon: Store },
    { name: 'Provisioned riders', value: summary.riders ?? 0, icon: Truck },
    { name: 'Active orders', value: summary.activeOrders ?? 0, icon: Package },
    { name: '30-day revenue', value: `₹${Number(summary.revenue || 0).toLocaleString('en-IN')}`, icon: TrendingUp },
  ];
  const fulfillment = summary.totalOrders ? Math.round((Number(summary.deliveredOrders || 0) / summary.totalOrders) * 1000) / 10 : 0;
  return (
    <DashboardLayout allowedRole="ADMIN">
      <section className="mb-8 overflow-hidden rounded-[2.25rem] bg-slate-950 p-8 text-white shadow-[0_30px_90px_rgba(15,23,42,0.22)]">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
          <div><p className="inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-[0.22em] text-teal-200">Live admin overview</p><h1 className="mt-5 text-4xl font-black tracking-[-0.06em]">Real commerce operations, directly from production records.</h1><p className="mt-4 text-sm font-semibold text-slate-300">Last 30 days · refreshed on demand</p></div>
          <button onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center rounded-2xl bg-white px-5 py-3 font-black text-slate-950 disabled:opacity-60"><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh data</button>
        </div>
      </section>
      {error ? <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 font-bold text-red-700">{error}</div> : null}
      <div className="mb-8 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => <div key={stat.name} className="enterprise-card p-5"><stat.icon className="h-7 w-7 text-teal-700" /><h3 className="mt-5 text-sm font-black text-slate-500">{stat.name}</h3><p className="mt-1 text-3xl font-black text-slate-950">{loading ? '…' : stat.value}</p></div>)}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
        <div className="enterprise-panel p-6"><p className="enterprise-kicker">Actual order trend</p><h2 className="mt-3 text-2xl font-black">Last seven days</h2><div className="mt-6 space-y-3">{(data?.trend || []).map((day: any) => <div key={day.date} className="grid grid-cols-[1fr_auto_auto] gap-4 rounded-2xl bg-slate-50 p-4"><span className="font-black">{day.date}</span><span className="font-bold text-slate-600">{day.orders} orders</span><span className="font-black text-teal-700">₹{(Number(day.revenuePaise || 0) / 100).toLocaleString('en-IN')}</span></div>)}{!loading && !data?.trend?.length ? <p className="text-slate-500">No orders in this period.</p> : null}</div></div>
        <div className="enterprise-panel p-6"><p className="enterprise-kicker">Fulfillment</p><div className="mt-4 flex items-center justify-between"><div><p className="text-5xl font-black">{fulfillment}%</p><p className="mt-2 font-semibold text-slate-500">Delivered / recorded orders</p></div><Activity className="h-12 w-12 text-teal-600" /></div><div className="mt-6 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-slate-50 p-4"><Users className="h-5 w-5" /><p className="mt-3 text-2xl font-black">{summary.newUsers ?? 0}</p><p className="text-xs font-bold text-slate-500">New users</p></div><div className="rounded-2xl bg-slate-50 p-4"><Package className="h-5 w-5" /><p className="mt-3 text-2xl font-black">{summary.cancelledOrders ?? 0}</p><p className="text-xs font-bold text-slate-500">Cancelled</p></div></div></div>
      </div>
    </DashboardLayout>
  );
}
