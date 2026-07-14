'use client';

import CustomerDeliveryOtpCard from '@/components/customer/CustomerDeliveryOtpCard';
import DashboardLayout from '@/components/DashboardLayout';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import React from 'react';

export default function CustomerDeliveryCodePage() {
  const router = useRouter();
  const params = useParams<{ deliveryJobId: string }>();
  const deliveryJobId = params?.deliveryJobId;

  return (
    <DashboardLayout allowedRole="CUSTOMER">
      <div className="mx-auto max-w-2xl space-y-5">
        <button
          onClick={() => router.push('/shop/orders')}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" /> Back to my orders
        </button>

        <header className="rounded-[2rem] border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950 p-6 text-white shadow-xl">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15">
              <ShieldCheck className="h-6 w-6 text-violet-200" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-300">Secure handoff</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight">Delivery verification</h1>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">
                Check your parcel first. Then read the active 6-digit code to the assigned rider. Never share it before the parcel reaches you.
              </p>
            </div>
          </div>
        </header>

        <CustomerDeliveryOtpCard deliveryJobId={deliveryJobId} active={Boolean(deliveryJobId)} />

        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-900">
          The code is short-lived and tied only to this delivery job. AAGAM staff should never ask for it over a phone call or chat before handoff.
        </section>
      </div>
    </DashboardLayout>
  );
}
