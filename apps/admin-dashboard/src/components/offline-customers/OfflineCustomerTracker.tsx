'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@aagam/utils';
import { getToastErrorMessage, useToast } from '@/components/ToastProvider';
import { CheckCircle2, Clock, Loader2, XCircle, AlertTriangle, SkipForward } from 'lucide-react';

type DeliveryRow = {
  id: string;
  date: string;
  sequenceNumber: number;
  deliverySlot: string;
  status: string;
  cashDuePaise: number;
  cashCollectedPaise: number;
  cashCollectedAt: string | null;
  deliveredAt: string | null;
  failureReason: string | null;
  skipReason: string | null;
  deliveredByStoreUserId: string | null;
  amStatus: string | null;
  pmStatus: string | null;
  order: {
    id: string;
    status: string;
    grandTotalPaise: number;
    items: Array<{ name: string; quantity: number; pricePaise: number }>;
  } | null;
  storeDeliveryProof: any;
};

type TrackerData = {
  subscription: {
    id: string;
    status: string;
    startDate: string;
    endDate: string;
    isCustom: boolean;
    storeDelivery: boolean;
    source: string;
  };
  customer: { id: string; name: string; phone: string };
  store: { id: string; name: string } | null;
  address: any;
  summary: {
    totalDays: number;
    deliveredDays: number;
    pendingDays: number;
    failedDays: number;
    skippedDays: number;
    totalAmountPaise: number;
    collectedPaise: number;
    duePaise: number;
  };
  deliveries: DeliveryRow[];
};

const statusConfig: Record<string, { color: string; icon: any; label: string }> = {
  DELIVERED: { color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2, label: 'Delivered' },
  SCHEDULED: { color: 'bg-blue-100 text-blue-700', icon: Clock, label: 'Scheduled' },
  GENERATING: { color: 'bg-amber-100 text-amber-700', icon: Loader2, label: 'Generating' },
  ORDER_GENERATED: { color: 'bg-amber-100 text-amber-700', icon: Clock, label: 'Order Ready' },
  PREPARING: { color: 'bg-amber-100 text-amber-700', icon: Clock, label: 'Preparing' },
  PACKED: { color: 'bg-amber-100 text-amber-700', icon: Clock, label: 'Packed' },
  STORE_DELIVERING: { color: 'bg-orange-100 text-orange-700', icon: Clock, label: 'Out for Delivery' },
  FAILED: { color: 'bg-red-100 text-red-700', icon: XCircle, label: 'Failed' },
  SKIPPED: { color: 'bg-slate-100 text-slate-500', icon: SkipForward, label: 'Skipped' },
  CANCELLED: { color: 'bg-slate-100 text-slate-500', icon: XCircle, label: 'Cancelled' },
};

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-slate-300">-</span>;
  const config = statusConfig[status] || { color: 'bg-slate-100 text-slate-500', icon: Clock, label: status };
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-black ${config.color}`}>
      <Icon className="h-3 w-3" /> {config.label}
    </span>
  );
}

export default function OfflineCustomerTracker({ subscriptionId }: { subscriptionId: string }) {
  const toast = useToast();
  const [data, setData] = useState<TrackerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'delivered' | 'pending' | 'failed'>('all');

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(`/admin/subscriptions/offline-customers/${subscriptionId}/delivery-tracker?subscriptionId=${subscriptionId}`);
      setData(res.data);
    } catch (err: any) {
      toast.error(getToastErrorMessage(err, 'Failed to load tracker'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [subscriptionId]);

  if (loading) {
    return <div className="flex min-h-60 items-center justify-center"><Loader2 className="h-9 w-9 animate-spin text-emerald-700" /></div>;
  }

  if (!data) {
    return <div className="rounded-2xl bg-red-50 p-6 text-center text-red-700">Failed to load delivery tracker.</div>;
  }

  const filtered = data.deliveries.filter((d) => {
    if (filter === 'all') return true;
    if (filter === 'delivered') return d.status === 'DELIVERED';
    if (filter === 'pending') return ['SCHEDULED', 'GENERATING', 'ORDER_GENERATED', 'PREPARING', 'PACKED'].includes(d.status);
    if (filter === 'failed') return ['FAILED', 'SKIPPED', 'CANCELLED'].includes(d.status);
    return true;
  });

  const formatPaise = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 0 })}`;
  const dayName = (date: string) => new Date(date).toLocaleDateString('en-IN', { weekday: 'short' });
  const formatDate = (date: string) => new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-900">{data.customer.name || 'Customer'}</h2>
            <p className="text-sm text-slate-500">{data.customer.phone}</p>
            {data.store && <p className="text-xs text-slate-400 mt-1">Store: {data.store.name}</p>}
          </div>
          <div className="flex items-center gap-2">
            {data.subscription.isCustom && <span className="rounded-lg bg-purple-100 px-2 py-1 text-xs font-black text-purple-700">Custom</span>}
            {data.subscription.storeDelivery && <span className="rounded-lg bg-orange-100 px-2 py-1 text-xs font-black text-orange-700">Store Delivery</span>}
            <span className={`rounded-lg px-2 py-1 text-xs font-black ${
              data.subscription.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' :
              data.subscription.status === 'COMPLETED' ? 'bg-blue-100 text-blue-700' :
              'bg-slate-100 text-slate-600'
            }`}>{data.subscription.status}</span>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
          <div className="rounded-2xl bg-slate-50 p-3 text-center">
            <div className="text-xl font-black text-slate-900">{data.summary.totalDays}</div>
            <div className="text-[10px] font-bold text-slate-400">Total Days</div>
          </div>
          <div className="rounded-2xl bg-emerald-50 p-3 text-center">
            <div className="text-xl font-black text-emerald-700">{data.summary.deliveredDays}</div>
            <div className="text-[10px] font-bold text-emerald-600">Delivered</div>
          </div>
          <div className="rounded-2xl bg-blue-50 p-3 text-center">
            <div className="text-xl font-black text-blue-700">{data.summary.pendingDays}</div>
            <div className="text-[10px] font-bold text-blue-600">Pending</div>
          </div>
          <div className="rounded-2xl bg-red-50 p-3 text-center">
            <div className="text-xl font-black text-red-700">{data.summary.failedDays}</div>
            <div className="text-[10px] font-bold text-red-600">Failed</div>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3 text-center">
            <div className="text-xl font-black text-slate-700">{data.summary.skippedDays}</div>
            <div className="text-[10px] font-bold text-slate-400">Skipped</div>
          </div>
          <div className="rounded-2xl bg-amber-50 p-3 text-center">
            <div className="text-xl font-black text-amber-700">{formatPaise(data.summary.collectedPaise)}</div>
            <div className="text-[10px] font-bold text-amber-600">Collected</div>
          </div>
          <div className="rounded-2xl bg-red-50 p-3 text-center">
            <div className="text-xl font-black text-red-700">{formatPaise(data.summary.duePaise)}</div>
            <div className="text-[10px] font-bold text-red-600">Due</div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {(['all', 'delivered', 'pending', 'failed'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-xl px-4 py-2 text-xs font-black capitalize ${
              filter === f ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {f} ({f === 'all' ? data.deliveries.length : data.deliveries.filter((d) => {
              if (f === 'delivered') return d.status === 'DELIVERED';
              if (f === 'pending') return ['SCHEDULED', 'GENERATING', 'ORDER_GENERATED', 'PREPARING', 'PACKED'].includes(d.status);
              if (f === 'failed') return ['FAILED', 'SKIPPED', 'CANCELLED'].includes(d.status);
              return true;
            }).length})
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-500">#</th>
              <th className="px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-500">Date</th>
              <th className="px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-500">Day</th>
              <th className="px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-500">Slot</th>
              <th className="px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-500">Status</th>
              <th className="px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-500">Order</th>
              <th className="px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-500">Items</th>
              <th className="px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-500 text-right">Cash Due</th>
              <th className="px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-500 text-right">Collected</th>
              <th className="px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-500">Delivered By</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => (
              <tr key={d.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                <td className="px-4 py-3 font-bold text-slate-400">{d.sequenceNumber}</td>
                <td className="px-4 py-3 font-semibold text-slate-700">{formatDate(d.date)}</td>
                <td className="px-4 py-3 text-slate-500">{dayName(d.date)}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-lg px-2 py-0.5 text-[11px] font-black ${
                    d.deliverySlot === 'AM' ? 'bg-amber-100 text-amber-700' :
                    d.deliverySlot === 'PM' ? 'bg-indigo-100 text-indigo-700' :
                    'bg-slate-100 text-slate-600'
                  }`}>{d.deliverySlot}</span>
                </td>
                <td className="px-4 py-3"><StatusBadge status={d.status} /></td>
                <td className="px-4 py-3">
                  {d.order ? (
                    <span className="font-mono text-xs text-slate-500">#{d.order.id.slice(-6)}</span>
                  ) : (
                    <span className="text-xs text-slate-300">-</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {d.order?.items ? (
                    <div className="max-w-[200px]">
                      {d.order.items.slice(0, 2).map((i, idx) => (
                        <div key={idx} className="truncate text-xs text-slate-600">{i.quantity}x {i.name}</div>
                      ))}
                      {d.order.items.length > 2 && <div className="text-[10px] text-slate-400">+{d.order.items.length - 2} more</div>}
                    </div>
                  ) : <span className="text-xs text-slate-300">-</span>}
                </td>
                <td className="px-4 py-3 text-right font-bold text-slate-700">{formatPaise(d.cashDuePaise)}</td>
                <td className="px-4 py-3 text-right font-bold text-emerald-700">{d.cashCollectedPaise > 0 ? formatPaise(d.cashCollectedPaise) : '-'}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{d.deliveredByStoreUserId ? 'Store Staff' : d.status === 'DELIVERED' ? 'Rider' : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="p-8 text-center text-sm font-bold text-slate-400">No deliveries match the filter.</div>
        )}
      </div>
    </div>
  );
}
