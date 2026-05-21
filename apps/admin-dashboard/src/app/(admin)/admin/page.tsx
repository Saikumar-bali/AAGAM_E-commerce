'use client';

import DashboardLayout from '@/components/DashboardLayout';
import { Activity, ArrowUpRight, Bike, Package, Store, TrendingUp, Truck, Users } from 'lucide-react';

export default function AdminDashboard() {
  const stats = [
    { name: 'Active Stores', value: '12', icon: Store, tone: 'from-teal-500 to-emerald-400', detail: '4 zones ready' },
    { name: 'Online Riders', value: '45', icon: Truck, tone: 'from-sky-500 to-cyan-400', detail: 'Live GPS enabled' },
    { name: 'Pending Orders', value: '128', icon: Package, tone: 'from-amber-500 to-orange-400', detail: '18 need action' },
    { name: 'Daily Revenue', value: '₹12,450', icon: TrendingUp, tone: 'from-slate-900 to-slate-700', detail: '+12% vs yesterday' },
  ];

  const activity = [
    ['New rider application', 'Central zone onboarding is ready for review', '2 mins ago'],
    ['Inventory health alert', 'Milk and bakery items are below reorder threshold', '9 mins ago'],
    ['Order SLA recovered', 'Koramangala delivery moved back under 10 minutes', '18 mins ago'],
  ];

  return (
    <DashboardLayout allowedRole="ADMIN">
      <section className="mb-8 overflow-hidden rounded-[2.25rem] bg-slate-950 p-8 text-white shadow-[0_30px_90px_rgba(15,23,42,0.22)]">
        <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div>
            <p className="inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-[0.22em] text-teal-200">Admin overview</p>
            <h1 className="mt-5 max-w-2xl text-4xl font-black tracking-[-0.06em] md:text-5xl">Operate stores, riders, orders, and revenue from one command center.</h1>
            <p className="mt-4 max-w-xl text-sm font-semibold leading-6 text-slate-300">Monitor fulfillment pressure, rider capacity, stock risk, and customer demand before they become production incidents.</p>
          </div>
          <div className="rounded-[1.75rem] border border-white/10 bg-white/8 p-5 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-300">Fulfillment health</p>
                <p className="mt-2 text-5xl font-black tracking-tight">98.4%</p>
              </div>
              <Activity className="h-12 w-12 text-teal-300" />
            </div>
            <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-[98%] rounded-full bg-gradient-to-r from-teal-300 to-amber-300" />
            </div>
          </div>
        </div>
      </section>

      <div className="mb-8 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.name} className="enterprise-card p-5 transition hover:-translate-y-1">
            <div className="mb-5 flex items-center justify-between">
              <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${stat.tone} text-white shadow-lg`}>
                <stat.icon className="h-6 w-6" />
              </div>
              <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                <ArrowUpRight className="h-3 w-3" /> Live
              </span>
            </div>
            <h3 className="text-sm font-black text-slate-500">{stat.name}</h3>
            <p className="mt-1 text-3xl font-black tracking-tight text-slate-950">{stat.value}</p>
            <p className="mt-2 text-xs font-bold text-slate-400">{stat.detail}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
        <div className="enterprise-panel p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="enterprise-kicker">Operations feed</p>
              <h2 className="mt-3 text-2xl font-black tracking-tight">Recent activity</h2>
            </div>
          </div>
          <div className="space-y-3">
            {activity.map(([title, description, time]) => (
              <div key={title} className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white/70 p-4 transition hover:border-teal-200 hover:bg-white">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white">
                  <Users className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-black text-slate-950">{title}</p>
                  <p className="text-xs font-semibold text-slate-500">{description}</p>
                </div>
                <span className="text-xs font-bold text-slate-400">{time}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="enterprise-panel p-6">
          <p className="enterprise-kicker">Dispatch readiness</p>
          <h2 className="mt-3 text-2xl font-black tracking-tight">Live fleet shape</h2>
          <div className="mt-6 space-y-4">
            {['North', 'Central', 'South'].map((zone, index) => (
              <div key={zone} className="rounded-2xl bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-black">{zone} zone</span>
                  <span className="flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-black text-teal-700">
                    <Bike className="h-3 w-3" /> {12 + index * 3} riders
                  </span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-amber-400" style={{ width: `${76 + index * 7}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
