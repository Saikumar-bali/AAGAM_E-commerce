'use client';

import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { Tag, Sparkles, ArrowLeft, Percent, Truck, Gift } from 'lucide-react';

const FEATURED_DEALS = [
  { title: '10% off first order', code: 'WELCOME10', description: 'Get 10% off on your first order. Min cart ₹199.', icon: Percent, color: 'from-emerald-500 to-teal-600', expiry: 'Limited time' },
  { title: 'Free delivery', code: 'FREEDEL', description: 'Free delivery on all orders above ₹299.', icon: Truck, color: 'from-blue-500 to-indigo-600', expiry: 'Ongoing' },
  { title: '₹50 off essentials', code: 'ESSENTIALS50', description: 'Flat ₹50 off on grocery essentials. Min cart ₹499.', icon: Gift, color: 'from-amber-500 to-orange-600', expiry: 'Ends soon' },
];

export default function DealsPage() {
  const router = useRouter();
  return (
    <DashboardLayout allowedRole="CUSTOMER">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.push('/shop')} className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-xl font-black text-slate-950 tracking-tight">Deals & Offers</h1>
            <p className="text-xs font-semibold text-slate-500">Coupons and promotions</p>
          </div>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 mb-6 flex items-center gap-3">
          <Sparkles className="h-5 w-5 text-amber-600 shrink-0" />
          <p className="text-sm font-bold text-amber-800">Backend coupon engine is not fully implemented yet. These are sample deal formats.</p>
        </div>

        <div className="space-y-4">
          {FEATURED_DEALS.map((deal) => (
            <div key={deal.code} className="rounded-2xl border border-slate-100 bg-white overflow-hidden hover:shadow-md transition-all">
              <div className={`h-1.5 bg-gradient-to-r ${deal.color}`} />
              <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className={`grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br ${deal.color} text-white shrink-0`}>
                      <deal.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-slate-950">{deal.title}</h3>
                      <p className="mt-1 text-xs font-semibold text-slate-500">{deal.description}</p>
                      <span className="mt-2 inline-block rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600 uppercase tracking-wider">{deal.expiry}</span>
                    </div>
                  </div>
                  <div className="shrink-0 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-center">
                    <div className="text-[10px] font-bold text-slate-400 uppercase">Code</div>
                    <div className="mt-0.5 font-mono text-sm font-black text-slate-950">{deal.code}</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
