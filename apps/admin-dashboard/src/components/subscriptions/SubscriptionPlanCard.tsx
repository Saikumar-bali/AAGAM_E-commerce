'use client';

import Link from 'next/link';
import { CalendarDays } from 'lucide-react';

export const formatPaise = (paise: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(paise || 0) / 100);
export const formatDate = (value?: string | null) => value ? new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export default function SubscriptionPlanCard({ plan, compact = false }: { plan: any; compact?: boolean }) {
  const savings = Math.max(0, Number(plan.mrpPaise || 0) - Number(plan.pricePaise || 0));
  // A plan with no store or zone binding cannot resolve an eligible store, so the
  // subscribe attempt is guaranteed to fail. Say so here rather than at the last step.
  const unavailable = plan.isAvailable === false;
  return <article className="group flex flex-col overflow-hidden rounded-xl border border-emerald-100 bg-white transition hover:border-emerald-200">
    <div className="relative min-h-[120px] bg-emerald-50/30 p-4">
      <div className="absolute right-3 top-3 rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-emerald-700">{plan.totalDeliveries} DELIVERIES</div>
      <div className="flex items-start gap-3 pr-16">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white">
          {plan.imageUrl || plan.mobileImageUrl ? <img src={plan.imageUrl || plan.mobileImageUrl} alt="" className="h-full w-full object-contain" /> : <CalendarDays className="h-6 w-6 text-emerald-700" />}
        </div>
        <div className="min-w-0"><p className="enterprise-kicker">Subscribe & Save</p><h3 className="mt-1.5 truncate text-base font-semibold text-slate-900">{plan.name}</h3><p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-600">{plan.description || 'Recurring essentials delivered on a reliable schedule.'}</p></div>
      </div>
    </div>
    <div className="flex flex-1 flex-col p-4">
      <div className="flex flex-wrap gap-1.5">{(plan.items || []).slice(0, compact ? 2 : 4).map((item: any) => <span key={item.productId} className="rounded-md bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700">{item.quantityPerDelivery}× {item.product?.name || item.name}</span>)}</div>
      <div className="mt-auto pt-4">
        <div className="flex flex-wrap items-baseline gap-2"><span className="text-lg font-semibold tabular-nums text-slate-900">{formatPaise(plan.pricePaise)}</span>{Number(plan.mrpPaise) > Number(plan.pricePaise) ? <span className="text-xs font-medium text-slate-400 line-through">{formatPaise(plan.mrpPaise)}</span> : null}{savings > 0 ? <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">Save {formatPaise(savings)}</span> : null}</div>
        <Link href={`/shop/subscribe/${encodeURIComponent(plan.id)}`} className="mt-3 flex min-h-[40px] items-center justify-center rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2">Choose plan</Link>
        {unavailable ? <p role="status" className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-800">Not available yet — no store assigned to this plan.</p> : null}
      </div>
    </div>
  </article>;
}
