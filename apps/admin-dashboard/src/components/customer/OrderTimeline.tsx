'use client';

import React from 'react';
import { CheckCircle2, Clock, Package, Truck, Store, ShoppingBag } from 'lucide-react';

type TimelineStep = {
  status: string;
  label: string;
  icon: React.ElementType;
  completed: boolean;
  current: boolean;
};

type OrderTimelineProps = {
  currentStatus: string;
  timeline?: Array<{ toStatus: string; createdAt: string; note?: string }>;
};

const STATUS_FLOW = [
  { status: 'PLACED', label: 'Order Placed', icon: ShoppingBag },
  { status: 'CONFIRMED', label: 'Confirmed', icon: CheckCircle2 },
  { status: 'PICKING', label: 'Picking', icon: Package },
  { status: 'PACKED', label: 'Packed', icon: Package },
  { status: 'RIDER_ASSIGNED', label: 'Rider Assigned', icon: Truck },
  { status: 'OUT_FOR_DELIVERY', label: 'Out for Delivery', icon: Truck },
  { status: 'DELIVERED', label: 'Delivered', icon: CheckCircle2 },
];

const STATUS_MAP: Record<string, number> = {
  PENDING: 0,
  PAYMENT_PENDING: 0,
  CONFIRMED: 1,
  PICKING: 2,
  PACKED: 3,
  RIDER_ASSIGNED: 4,
  OUT_FOR_DELIVERY: 5,
  DELIVERED: 6,
  CANCELLED: -1,
};

export default function OrderTimeline({ currentStatus, timeline }: OrderTimelineProps) {
  const currentStep = STATUS_MAP[currentStatus] ?? 0;
  const isCancelled = currentStatus === 'CANCELLED';

  if (isCancelled) {
    return (
      <div className="rounded-2xl border border-red-100 bg-red-50 p-5">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-red-100 text-red-600">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-black text-red-900">Order Cancelled</div>
            <div className="text-xs text-red-600">This order has been cancelled.</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5">
      <div className="text-sm font-black text-slate-950 mb-4">Order Progress</div>
      <div className="space-y-0">
        {STATUS_FLOW.map((step, i) => {
          const completed = i <= currentStep;
          const current = i === currentStep;
          const Icon = step.icon;
          return (
            <div key={step.status} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className={`grid h-8 w-8 place-items-center rounded-full transition-all ${
                  completed
                    ? 'bg-teal-600 text-white shadow-md shadow-teal-600/20'
                    : 'bg-slate-100 text-slate-400'
                } ${current ? 'ring-4 ring-teal-100' : ''}`}>
                  <Icon className="h-4 w-4" />
                </div>
                {i < STATUS_FLOW.length - 1 && (
                  <div className={`w-0.5 h-6 ${completed ? 'bg-teal-600' : 'bg-slate-200'}`} />
                )}
              </div>
              <div className="pb-4">
                <div className={`text-sm font-bold ${completed ? 'text-slate-950' : 'text-slate-400'}`}>
                  {step.label}
                  {current && <span className="ml-2 text-xs font-black text-teal-600">Current</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {timeline && timeline.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <div className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">Activity Log</div>
          <div className="space-y-2.5 max-h-48 overflow-y-auto">
            {timeline.slice().reverse().map((event, i) => (
              <div key={i} className="flex gap-2 text-xs">
                <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />
                <div>
                  <span className="font-bold text-slate-800">{String(event.toStatus).replace(/_/g, ' ')}</span>
                  <span className="ml-2 text-slate-400">{new Date(event.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  {event.note && <div className="text-slate-500 mt-0.5">{event.note}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
