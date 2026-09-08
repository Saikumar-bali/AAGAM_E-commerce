'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@aagam/utils';
import DashboardLayout from '@/components/DashboardLayout';
import { getToastErrorMessage, useToast } from '@/components/ToastProvider';
import {
  CheckCircle2,
  Clock,
  Loader2,
  MapPin,
  Phone,
  Package,
  Truck,
  User,
  XCircle,
} from 'lucide-react';

type DeliveryItem = {
  id: string;
  sequenceNumber: number;
  deliverySlot: string;
  status: string;
  serviceDate: string;
  window: string;
  customer: { id: string; name: string; phone: string };
  address: { line1: string; line2: string; city: string; pincode: string; latitude: number; longitude: number; landmark: string };
  order: { id: string; status: string; grandTotalPaise: number; items: Array<{ name: string; quantity: number; pricePaise: number }> } | null;
  deliveryJobId: string | null;
  deliveryJobStatus: string | null;
};

export default function StoreSelfDeliveryPage() {
  const toast = useToast();
  const [deliveries, setDeliveries] = useState<DeliveryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [stores, setStores] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  const [verifyModal, setVerifyModal] = useState<DeliveryItem | null>(null);
  const [verifyName, setVerifyName] = useState('');
  const [verifyPhone, setVerifyPhone] = useState('');
  const [verifyNotes, setVerifyNotes] = useState('');
  const [verifyCash, setVerifyCash] = useState('');

  const loadStores = async () => {
    try {
      const res = await apiClient.get('/store-owner/stores');
      const storeList = res.data.stores || res.data || [];
      setStores(storeList.map((s: any) => ({ id: s.id, name: s.name })));
      if (storeList.length === 1) setSelectedStoreId(storeList[0].id);
    } catch (err: any) {
      toast.error(getToastErrorMessage(err, 'Failed to load stores'));
      setLoading(false);
    }
  };

  const loadDeliveries = async () => {
    if (!selectedStoreId) return;
    setLoading(true);
    try {
      const res = await apiClient.get(`/store-self-delivery/queue/${selectedStoreId}`);
      setDeliveries(res.data);
    } catch (err: any) {
      toast.error(getToastErrorMessage(err, 'Failed to load deliveries'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStores(); }, []);
  useEffect(() => { if (selectedStoreId) loadDeliveries(); }, [selectedStoreId]);

  const startDelivery = async (deliveryId: string) => {
    setProcessingId(deliveryId);
    try {
      await apiClient.post(`/store-self-delivery/start/${deliveryId}`);
      toast.success('Delivery started');
      loadDeliveries();
    } catch (err: any) {
      toast.error(getToastErrorMessage(err, 'Failed to start delivery'));
    } finally {
      setProcessingId(null);
    }
  };

  const openVerify = (delivery: DeliveryItem) => {
    setVerifyModal(delivery);
    setVerifyName(delivery.customer.name || '');
    setVerifyPhone(delivery.customer.phone || '');
    setVerifyNotes('');
    setVerifyCash('');
  };

  const completeDelivery = async () => {
    if (!verifyModal) return;
    if (verifyCash) {
      const cashNum = parseFloat(verifyCash);
      if (!Number.isFinite(cashNum) || cashNum < 0) {
        return toast.warning('Enter a valid non-negative cash amount.');
      }
      const paise = Math.round(cashNum * 100);
      if (paise > Number.MAX_SAFE_INTEGER || paise < 0) {
        return toast.warning('Cash amount is too large.');
      }
    }
    setProcessingId(verifyModal.id);
    try {
      await apiClient.post(`/store-self-delivery/complete/${verifyModal.id}`, {
        verifiedCustomerName: verifyName,
        verifiedCustomerPhone: verifyPhone,
        notes: verifyNotes || undefined,
        cashCollectedPaise: verifyCash ? Math.round(parseFloat(verifyCash) * 100) : undefined,
      });
      toast.success('Delivery completed and verified!');
      setVerifyModal(null);
      loadDeliveries();
    } catch (err: any) {
      toast.error(getToastErrorMessage(err, 'Failed to complete delivery'));
    } finally {
      setProcessingId(null);
    }
  };

  const recordFailure = async (deliveryId: string, reason: string) => {
    setProcessingId(deliveryId);
    try {
      await apiClient.post(`/store-self-delivery/fail/${deliveryId}`, { reason });
      toast.success('Failure recorded');
      loadDeliveries();
    } catch (err: any) {
      toast.error(getToastErrorMessage(err, 'Failed to record failure'));
    } finally {
      setProcessingId(null);
    }
  };

  const formatPaise = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;
  const openMap = (lat: number, lng: number) => {
    window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank');
  };

  const grouped = {
    scheduled: deliveries.filter((d) => ['ORDER_GENERATED', 'PREPARING', 'PACKED'].includes(d.status)),
    inProgress: deliveries.filter((d) => d.status === 'STORE_DELIVERING'),
    completed: deliveries.filter((d) => d.status === 'DELIVERED'),
    failed: deliveries.filter((d) => d.status === 'FAILED'),
  };

  return (
    <DashboardLayout allowedRole="ADMIN">
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-gray-900">Store Self-Delivery</h1>
        <p className="mt-1 font-medium text-gray-500">Manage store-delivered orders for offline customers.</p>
      </div>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {stores.length > 1 && (
            <select value={selectedStoreId} onChange={(e) => setSelectedStoreId(e.target.value)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold">
              <option value="">Select Store</option>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </div>
        <div className="flex items-center gap-4 text-sm font-bold text-slate-500">
          <span>{deliveries.length} deliveries today</span>
          <button onClick={loadDeliveries} className="rounded-xl bg-slate-100 p-2 hover:bg-slate-200"><Loader2 className="h-4 w-4" /></button>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-60 items-center justify-center"><Loader2 className="h-9 w-9 animate-spin text-emerald-700" /></div>
      ) : !selectedStoreId ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
          <Truck className="mx-auto h-12 w-12 text-slate-300" />
          <p className="mt-4 text-lg font-black text-slate-400">Select a store to view deliveries</p>
        </div>
      ) : deliveries.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-slate-300" />
          <p className="mt-4 text-lg font-black text-slate-400">No store deliveries today</p>
          <p className="mt-1 text-sm text-slate-400">All deliveries for today are complete or there are no scheduled store deliveries.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.inProgress.length > 0 && (
            <section>
              <h3 className="mb-4 flex items-center gap-2 text-lg font-black text-orange-700">
                <Truck className="h-5 w-5" /> In Progress ({grouped.inProgress.length})
              </h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {grouped.inProgress.map((d) => (
                  <DeliveryCard key={d.id} delivery={d} onStart={() => startDelivery(d.id)} onVerify={() => openVerify(d)} onFail={(reason) => recordFailure(d.id, reason)} onMap={() => openMap(d.address.latitude, d.address.longitude)} processing={processingId === d.id} phase="progress" />
                ))}
              </div>
            </section>
          )}

          {grouped.scheduled.length > 0 && (
            <section>
              <h3 className="mb-4 flex items-center gap-2 text-lg font-black text-blue-700">
                <Clock className="h-5 w-5" /> Ready to Deliver ({grouped.scheduled.length})
              </h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {grouped.scheduled.map((d) => (
                  <DeliveryCard key={d.id} delivery={d} onStart={() => startDelivery(d.id)} onVerify={() => openVerify(d)} onFail={(reason) => recordFailure(d.id, reason)} onMap={() => openMap(d.address.latitude, d.address.longitude)} processing={processingId === d.id} phase="scheduled" />
                ))}
              </div>
            </section>
          )}

          {grouped.completed.length > 0 && (
            <section>
              <h3 className="mb-4 flex items-center gap-2 text-lg font-black text-emerald-700">
                <CheckCircle2 className="h-5 w-5" /> Completed ({grouped.completed.length})
              </h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {grouped.completed.map((d) => (
                  <DeliveryCard key={d.id} delivery={d} onStart={() => {}} onVerify={() => {}} onMap={() => openMap(d.address.latitude, d.address.longitude)} processing={false} phase="completed" />
                ))}
              </div>
            </section>
          )}

          {grouped.failed.length > 0 && (
            <section>
              <h3 className="mb-4 flex items-center gap-2 text-lg font-black text-red-700">
                <XCircle className="h-5 w-5" /> Failed ({grouped.failed.length})
              </h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {grouped.failed.map((d) => (
                  <DeliveryCard key={d.id} delivery={d} onStart={() => startDelivery(d.id)} onVerify={() => openVerify(d)} onFail={(reason) => recordFailure(d.id, reason)} onMap={() => openMap(d.address.latitude, d.address.longitude)} processing={processingId === d.id} phase="failed" />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {verifyModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true">
          <div className="max-h-[96vh] w-full max-w-lg overflow-y-auto rounded-t-[28px] bg-white shadow-2xl sm:rounded-[28px]">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white p-5">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-emerald-700">Verify Customer</p>
                <h2 className="mt-1 text-xl font-black text-slate-900">Confirm Delivery Handoff</h2>
              </div>
              <button onClick={() => setVerifyModal(null)} className="rounded-xl bg-slate-100 p-3"><XCircle className="h-5 w-5" /></button>
            </div>

            <div className="space-y-4 p-5">
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="text-xs font-black uppercase tracking-wider text-slate-500">Customer Info</div>
                <div className="mt-2 space-y-1">
                  <div className="flex items-center gap-2 text-sm"><User className="h-4 w-4 text-slate-400" /> {verifyModal.customer.name}</div>
                  <div className="flex items-center gap-2 text-sm"><Phone className="h-4 w-4 text-slate-400" /> {verifyModal.customer.phone}</div>
                  <div className="flex items-center gap-2 text-sm"><MapPin className="h-4 w-4 text-slate-400" /> {verifyModal.address.line1}, {verifyModal.address.city}</div>
                </div>
              </div>

              <div className="space-y-3">
                <label className="block text-sm font-black text-slate-700">Verified Customer Name</label>
                <input value={verifyName} onChange={(e) => setVerifyName(e.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-emerald-500" placeholder="Confirm customer name" />
              </div>

              <div className="space-y-3">
                <label className="block text-sm font-black text-slate-700">Verified Phone (last 4 digits)</label>
                <input value={verifyPhone} onChange={(e) => setVerifyPhone(e.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-emerald-500" placeholder="Confirm phone number" />
              </div>

              <div className="space-y-3">
                <label className="block text-sm font-black text-slate-700">Cash Collected (₹)</label>
                <input type="number" min="0" step="1" value={verifyCash} onChange={(e) => setVerifyCash(e.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-emerald-500" placeholder="0" />
              </div>

              <div className="space-y-3">
                <label className="block text-sm font-black text-slate-700">Notes (optional)</label>
                <input value={verifyNotes} onChange={(e) => setVerifyNotes(e.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-emerald-500" placeholder="Any delivery notes" />
              </div>
            </div>

            <div className="sticky bottom-0 flex justify-end gap-3 border-t border-slate-200 bg-white p-5">
              <button onClick={() => setVerifyModal(null)} className="min-h-12 rounded-2xl border border-slate-200 px-5 font-black">Cancel</button>
              <button disabled={!verifyName.trim() || !verifyPhone.trim() || processingId === verifyModal.id} onClick={completeDelivery} className="inline-flex min-h-12 min-w-40 items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 font-black text-white disabled:opacity-50">
                {processingId === verifyModal.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />} Confirm & Complete
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

function DeliveryCard({ delivery, onStart, onVerify, onFail, onMap, processing, phase }: {
  delivery: DeliveryItem;
  onStart: () => void;
  onVerify: () => void;
  onFail?: (reason: string) => void;
  onMap: () => void;
  processing: boolean;
  phase: 'scheduled' | 'progress' | 'completed' | 'failed';
}) {
  const formatPaise = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;

  return (
    <div className={`rounded-2xl border bg-white p-5 shadow-sm ${
      phase === 'completed' ? 'border-emerald-200 bg-emerald-50/30' :
      phase === 'failed' ? 'border-red-200 bg-red-50/30' :
      phase === 'progress' ? 'border-orange-200 bg-orange-50/30' :
      'border-slate-200'
    }`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-black text-slate-900">{delivery.customer.name}</span>
            <span className={`rounded-lg px-2 py-0.5 text-[10px] font-black ${
              delivery.deliverySlot === 'AM' ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'
            }`}>{delivery.deliverySlot}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">{delivery.window}</p>
        </div>
        <span className="text-xs font-bold text-slate-400">#{delivery.sequenceNumber}</span>
      </div>

      <div className="mt-3 space-y-1 text-xs text-slate-600">
        <div className="flex items-center gap-1.5"><Phone className="h-3 w-3 text-slate-400" /> {delivery.customer.phone}</div>
        <div className="flex items-center gap-1.5"><MapPin className="h-3 w-3 text-slate-400" /> {delivery.address.line1}, {delivery.address.city}</div>
        {delivery.address.landmark && <div className="pl-4 text-slate-400">Near: {delivery.address.landmark}</div>}
      </div>

      {delivery.order && (
        <div className="mt-3 rounded-xl bg-slate-50 p-3">
          <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Order Items</div>
          {delivery.order.items.map((i, idx) => (
            <div key={idx} className="mt-1 flex justify-between text-xs">
              <span className="text-slate-700">{i.quantity}x {i.name}</span>
              <span className="font-bold text-slate-500">{formatPaise(i.pricePaise)}</span>
            </div>
          ))}
          <div className="mt-2 border-t border-slate-200 pt-2 text-right text-sm font-black text-slate-900">
            Total: {formatPaise(delivery.order.grandTotalPaise)}
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button onClick={onMap} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">
          <MapPin className="h-3.5 w-3.5" /> Map
        </button>

        {phase === 'scheduled' && (
          <button disabled={processing} onClick={onStart} className="flex-1 rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white hover:bg-blue-700 disabled:opacity-50">
            {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4 inline" />} Start Delivery
          </button>
        )}

        {phase === 'progress' && (
          <>
            <button disabled={processing} onClick={onVerify} className="flex-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50">
              <CheckCircle2 className="h-4 w-4 inline" /> Verify & Complete
            </button>
            {onFail && (
              <button disabled={processing} onClick={() => {
                const reason = window.prompt('Enter failure reason:');
                if (reason?.trim()) onFail(reason.trim());
              }} className="rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50">
                <XCircle className="h-3.5 w-3.5 inline" /> Fail
              </button>
            )}
          </>
        )}

        {phase === 'failed' && (
          <button disabled={processing} onClick={onStart} className="flex-1 rounded-xl bg-amber-600 px-3 py-2 text-xs font-black text-white hover:bg-amber-700 disabled:opacity-50">
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
