'use client';

import Link from 'next/link';
import { CalendarDays } from 'lucide-react';

export const formatPaise = (paise: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(paise || 0) / 100);
export const formatDate = (value?: string | null) => value ? new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export default function SubscriptionPlanCard({ plan, compact = false }: { plan: any; compact?: boolean }) {
  const savings = Math.max(0, Number(plan.mrpPaise || 0) - Number(plan.pricePaise || 0));
  return <article className="group overflow-hidden rounded-[26px] border border-emerald-100 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
    <div className="relative min-h-44 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-5">
      <div className="absolute right-4 top-4 rounded-full bg-emerald-700 px-3 py-1 text-[10px] font-black tracking-wide text-white">{plan.totalDeliveries} DELIVERIES</div>
      <div className="flex items-start gap-4 pr-20">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-3xl bg-white shadow-sm">
          {plan.imageUrl || plan.mobileImageUrl ? <img src={plan.imageUrl || plan.mobileImageUrl} alt="" className="h-full w-full object-contain" /> : <CalendarDays className="h-10 w-10 text-emerald-700" />}
        </div>
        <div><p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Subscribe & Save</p><h3 className="mt-2 text-xl font-black text-slate-900">{plan.name}</h3><p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{plan.description || 'Recurring essentials delivered on a reliable schedule.'}</p></div>
      </div>
    </div>
    <div className="p-5">
      <div className="flex flex-wrap gap-2">{(plan.items || []).slice(0, compact ? 2 : 4).map((item: any) => <span key={item.productId} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700">{item.quantityPerDelivery}× {item.product?.name || item.name}</span>)}</div>
      <div className="mt-5 flex flex-wrap items-baseline gap-3"><span className="text-2xl font-black text-slate-900">{formatPaise(plan.pricePaise)}</span>{Number(plan.mrpPaise) > Number(plan.pricePaise) ? <span className="font-bold text-slate-400 line-through">{formatPaise(plan.mrpPaise)}</span> : null}{savings > 0 ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-black text-amber-700">Save {formatPaise(savings)}</span> : null}</div>
      <Link href={`/shop/subscribe/${encodeURIComponent(plan.id)}`} className="mt-5 flex min-h-12 items-center justify-center rounded-2xl bg-emerald-700 px-5 font-black text-white transition hover:bg-emerald-800 focus:outline-none focus:ring-4 focus:ring-emerald-200">Choose plan</Link>
    </div>
  </article>;
}
