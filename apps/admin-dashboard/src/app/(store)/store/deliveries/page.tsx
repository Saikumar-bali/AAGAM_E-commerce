'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@aagam/utils';
import DashboardLayout from '@/components/DashboardLayout';
import { getToastErrorMessage, useToast } from '@/components/ToastProvider';
import {
  CheckCircle2,
  Clock,
  Edit3,
  Loader2,
  MapPin,
  Package,
  PackageCheck,
  Phone,
  RefreshCw,
  Route,
  Truck,
  XCircle,
  AlertTriangle,
  User,
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
  subscription: { storeDelivery: boolean } | null;
};

type StatusFilter = 'all' | 'pending' | 'delivering' | 'delivered' | 'failed';

function money(paise: number) {
  return `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function statusBadge(status: string) {
  const config: Record<string, { color: string; icon: any; label: string }> = {
    ORDER_GENERATED: { color: 'bg-blue-100 text-blue-700', icon: Clock, label: 'Ready' },
    PREPARING: { color: 'bg-amber-100 text-amber-700', icon: Clock, label: 'Preparing' },
    PACKED: { color: 'bg-emerald-100 text-emerald-700', icon: Package, label: 'Packed' },
    STORE_DELIVERING: { color: 'bg-orange-100 text-orange-700', icon: Truck, label: 'Out for Delivery' },
    DELIVERED: { color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2, label: 'Delivered' },
    FAILED: { color: 'bg-red-100 text-red-700', icon: XCircle, label: 'Failed' },
  };
  const cfg = config[status] || { color: 'bg-slate-100 text-slate-600', icon: Clock, label: status };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-black ${cfg.color}`}>
      <Icon className="h-3 w-3" /> {cfg.label}
    </span>
  );
}

export default function StoreDeliveriesPage() {
  const toast = useToast();
  const [deliveries, setDeliveries] = useState<DeliveryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [stores, setStores] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedStoreId, setSelectedStoreId] = useState('');

  const [verifyModal, setVerifyModal] = useState<DeliveryItem | null>(null);
  const [verifyName, setVerifyName] = useState('');
  const [verifyPhone, setVerifyPhone] = useState('');
  const [verifyNotes, setVerifyNotes] = useState('');
  const [verifyCash, setVerifyCash] = useState('');

  const loadStores = async () => {
    try {
      const res = await apiClient.get('/stores/mine');
      const storeList = Array.isArray(res.data) ? res.data : res.data?.items || [];
      setStores(storeList.map((s: any) => ({ id: s.id, name: s.name })));
      if (storeList.length === 1) setSelectedStoreId(storeList[0].id);
    } catch (err) {
      toast.error(getToastErrorMessage(err, 'Failed to load stores'));
    }
  };

  const loadDeliveries = async (storeId: string, abortSignal?: AbortSignal) => {
    if (!storeId) return;
    setLoading(true);
    try {
      const res = await apiClient.get(`/store-self-delivery/queue/${storeId}`, { signal: abortSignal });
      if (!abortSignal?.aborted) {
        setDeliveries(Array.isArray(res.data) ? res.data : []);
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || err.name === 'CanceledError') return;
      toast.error(getToastErrorMessage(err, 'Failed to load deliveries'));
    } finally {
      if (!abortSignal?.aborted) setLoading(false);
    }
  };

  useEffect(() => { void loadStores(); }, []);
  
  useEffect(() => {
    if (!selectedStoreId) return;
    const controller = new AbortController();
    void loadDeliveries(selectedStoreId, controller.signal);
    return () => controller.abort();
  }, [selectedStoreId]);

  const startDelivery = async (deliveryId: string) => {
    setWorking(deliveryId);
    try {
      await apiClient.post(`/store-self-delivery/start/${deliveryId}`);
      toast.success('Delivery started. Verify customer on arrival.');
      if (selectedStoreId) await loadDeliveries(selectedStoreId);
    } catch (err) {
      toast.error(getToastErrorMessage(err, 'Failed to start delivery'));
    } finally {
      setWorking('');
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
    const cashNum = verifyCash ? Math.round(parseFloat(verifyCash) * 100) : 0;
    if (verifyCash && (!Number.isFinite(cashNum) || cashNum < 0)) {
      toast.warning('Enter a valid cash amount.');
      return;
    }
    if (!verifyName.trim()) {
      toast.warning('Enter the customer name for verification.');
      return;
    }
    setWorking(verifyModal.id);
    try {
      await apiClient.post(`/store-self-delivery/complete/${verifyModal.id}`, {
        verifiedCustomerName: verifyName.trim(),
        verifiedCustomerPhone: verifyPhone.trim(),
        notes: verifyNotes.trim() || undefined,
        cashCollectedPaise: cashNum,
      });
      toast.success('Delivery completed and verified.');
      setVerifyModal(null);
      if (selectedStoreId) await loadDeliveries(selectedStoreId);
    } catch (err) {
      toast.error(getToastErrorMessage(err, 'Failed to complete delivery'));
    } finally {
      setWorking('');
    }
  };

  const markFailed = async (deliveryId: string, reason: string) => {
    if (!reason.trim()) {
      toast.warning('Enter a failure reason.');
      return;
    }
    setWorking(deliveryId);
    try {
      await apiClient.post(`/store-self-delivery/fail/${deliveryId}`, { reason: reason.trim() });
      toast.success('Delivery marked as failed.');
      if (selectedStoreId) await loadDeliveries(selectedStoreId);
    } catch (err) {
      toast.error(getToastErrorMessage(err, 'Failed to record failure'));
    } finally {
      setWorking('');
    }
  };

  const [editModal, setEditModal] = useState<DeliveryItem | null>(null);
  const [editStatus, setEditStatus] = useState<'DELIVERED' | 'FAILED'>('DELIVERED');
  const [editCash, setEditCash] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const openEdit = (delivery: DeliveryItem) => {
    setEditModal(delivery);
    setEditStatus(delivery.status === 'FAILED' ? 'FAILED' : 'DELIVERED');
    setEditCash(delivery.order ? String(delivery.order.grandTotalPaise / 100) : '0');
    setEditNotes('');
  };

  const submitEdit = async () => {
    if (!editModal) return;
    const cashNum = editCash ? Math.round(parseFloat(editCash) * 100) : 0;
    if (editCash && (!Number.isFinite(cashNum) || cashNum < 0)) {
      toast.warning('Enter a valid cash amount.');
      return;
    }
    if (editStatus === 'FAILED' && !editNotes.trim()) {
      toast.warning('Enter a failure reason.');
      return;
    }
    setWorking(editModal.id);
    try {
      await apiClient.patch(`/store-self-delivery/update/${editModal.id}`, {
        status: editStatus,
        cashCollectedPaise: cashNum,
        notes: editNotes.trim() || undefined,
        failureReason: editStatus === 'FAILED' ? editNotes.trim() || 'Delivery failed' : undefined,
      });
      toast.success(`Delivery marked as ${editStatus.toLowerCase()}.`);
      setEditModal(null);
      await loadDeliveries(selectedStoreId);
    } catch (err) {
      toast.error(getToastErrorMessage(err, 'Failed to update delivery'));
    } finally {
      setWorking('');
    }
  };

  const filteredDeliveries = deliveries.filter((d) => {
    if (filter === 'all') return true;
    if (filter === 'pending') return ['SCHEDULED', 'ORDER_GENERATED', 'PREPARING', 'PACKED'].includes(d.status);
    if (filter === 'delivering') return d.status === 'STORE_DELIVERING';
    if (filter === 'delivered') return d.status === 'DELIVERED';
    if (filter === 'failed') return d.status === 'FAILED';
    return true;
  });

  const counts = {
    all: deliveries.length,
    pending: deliveries.filter((d) => ['SCHEDULED', 'ORDER_GENERATED', 'PREPARING', 'PACKED'].includes(d.status)).length,
    delivering: deliveries.filter((d) => d.status === 'STORE_DELIVERING').length,
    delivered: deliveries.filter((d) => d.status === 'DELIVERED').length,
    failed: deliveries.filter((d) => d.status === 'FAILED').length,
  };

  const totalCash = deliveries
    .filter((d) => d.status === 'DELIVERED')
    .reduce((sum, d) => sum + (d.order?.grandTotalPaise || 0), 0);

  return (
    <DashboardLayout allowedRole="STORE_OWNER">
      <div className="space-y-4 p-3 sm:p-4">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-hero text-slate-900">Store Deliveries</h1>
            <p className="text-xs font-label text-slate-500">Manage subscription deliveries assigned to your store.</p>
          </div>
          <div className="flex gap-2">
            {stores.length > 1 && (
              <select
                value={selectedStoreId}
                onChange={(e) => setSelectedStoreId(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-nav"
              >
                <option value="">Select Store</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            <button
              onClick={() => { if (selectedStoreId) void loadDeliveries(selectedStoreId); }}
              disabled={!selectedStoreId}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-nav text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </header>

        <section className="grid gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <p className="text-[10px] font-badge text-slate-400">Today's Deliveries</p>
            <p className="mt-1 text-xl font-kpi text-slate-900">{counts.all}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <p className="text-[10px] font-badge text-slate-400">Pending</p>
            <p className="mt-1 text-xl font-kpi text-blue-700">{counts.pending}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <p className="text-[10px] font-badge text-slate-400">Out for Delivery</p>
            <p className="mt-1 text-xl font-kpi text-orange-700">{counts.delivering}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <p className="text-[10px] font-badge text-slate-400">Cash to Collect</p>
            <p className="mt-1 text-xl font-kpi text-emerald-700">{money(totalCash)}</p>
          </div>
        </section>

        <nav className="flex gap-1.5 overflow-x-auto">
          {(['all', 'pending', 'delivering', 'delivered', 'failed'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-xs font-nav ${filter === f ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f]})
            </button>
          ))}
        </nav>

        {!selectedStoreId ? (
          <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <div>
              <Truck className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-3 font-black text-slate-700">Select a store to view deliveries</p>
            </div>
          </div>
        ) : loading ? (
          <div className="grid min-h-48 place-items-center">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-700" />
          </div>
        ) : filteredDeliveries.length === 0 ? (
          <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <div>
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
              <p className="mt-3 font-black text-slate-700">No deliveries found</p>
              <p className="mt-1 text-xs text-slate-500">
                {filter === 'all' ? 'No deliveries scheduled for today.' : `No ${filter} deliveries.`}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredDeliveries.map((d) => (
              <article key={d.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
                      <Route className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="font-black text-slate-900">
                        #{d.sequenceNumber} · {d.customer.name || 'Customer'}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {d.customer.phone || 'No phone'}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {d.address.line1}, {d.address.city} {d.address.pincode}
                      </p>
                      {d.order && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {d.order.items.slice(0, 3).map((item, idx) => (
                            <span key={idx} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                              {item.quantity}× {item.name}
                            </span>
                          ))}
                          {d.order.items.length > 3 && (
                            <span className="text-[10px] text-slate-400">+{d.order.items.length - 3} more</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    {statusBadge(d.status)}
                    <p className="mt-1 text-xs text-slate-500">{d.window}</p>
                    {d.order && (
                      <p className="mt-1 text-sm font-black text-slate-900">{money(d.order.grandTotalPaise)}</p>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex gap-2">
                  {['SCHEDULED', 'ORDER_GENERATED', 'PREPARING', 'PACKED'].includes(d.status) && (
                    <button
                      disabled={working === d.id}
                      onClick={() => void startDelivery(d.id)}
                      className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-700 text-xs font-black text-white hover:bg-emerald-800 disabled:opacity-50"
                    >
                      <Truck className="h-3.5 w-3.5" /> Start Delivery
                    </button>
                  )}
                  {d.status === 'STORE_DELIVERING' && (
                    <>
                      <button
                        disabled={working === d.id}
                        onClick={() => openVerify(d)}
                        className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-teal-700 text-xs font-black text-white hover:bg-teal-800 disabled:opacity-50"
                      >
                        <PackageCheck className="h-3.5 w-3.5" /> Complete & Collect Cash
                      </button>
                      <button
                        disabled={working === d.id}
                        onClick={() => {
                          const reason = prompt('Enter failure reason:');
                          if (reason) void markFailed(d.id, reason);
                        }}
                        className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-black text-red-700 hover:bg-red-100 disabled:opacity-50"
                      >
                        <AlertTriangle className="h-3.5 w-3.5" /> Failed
                      </button>
                    </>
                  )}
                  {d.status === 'DELIVERED' && (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Delivered
                    </span>
                  )}
                  {d.status === 'FAILED' && (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700">
                      <XCircle className="h-3.5 w-3.5" /> Failed
                    </span>
                  )}
                  <button
                    onClick={() => openEdit(d)}
                    className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50"
                  >
                    <Edit3 className="h-3.5 w-3.5" /> Edit
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}

        {verifyModal && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
            <div className="max-h-[94vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl">
              <h2 className="text-lg font-black text-slate-900">Verify & Complete Delivery</h2>
              <p className="mt-1 text-xs text-slate-500">Customer: {verifyModal.customer.name}</p>

              <div className="mt-4 space-y-3">
                <div className="rounded-xl bg-emerald-50 p-3">
                  <p className="text-[10px] font-black uppercase text-emerald-700">Order Total</p>
                  <p className="mt-1 text-2xl font-black text-emerald-900">
                    {verifyModal.order ? money(verifyModal.order.grandTotalPaise) : 'N/A'}
                  </p>
                </div>

                <label className="block text-xs font-black text-slate-700">
                  Customer Name (for verification)
                  <input
                    value={verifyName}
                    onChange={(e) => setVerifyName(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    placeholder="Verify customer name"
                  />
                </label>

                <label className="block text-xs font-black text-slate-700">
                  Customer Phone (for verification)
                  <input
                    value={verifyPhone}
                    onChange={(e) => setVerifyPhone(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    placeholder="Verify phone number"
                  />
                </label>

                <label className="block text-xs font-black text-slate-700">
                  Cash Collected (₹)
                  <input
                    value={verifyCash}
                    onChange={(e) => setVerifyCash(e.target.value)}
                    type="number"
                    min="0"
                    step="0.01"
                    className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    placeholder="Enter amount collected"
                  />
                </label>

                <label className="block text-xs font-black text-slate-700">
                  Notes (optional)
                  <textarea
                    value={verifyNotes}
                    onChange={(e) => setVerifyNotes(e.target.value)}
                    rows={2}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    placeholder="Any delivery notes"
                  />
                </label>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setVerifyModal(null)}
                  className="min-h-10 flex-1 rounded-xl border border-slate-200 text-xs font-black"
                >
                  Cancel
                </button>
                <button
                  disabled={working === verifyModal.id}
                  onClick={() => void completeDelivery()}
                  className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-700 text-xs font-black text-white disabled:opacity-50"
                >
                  {working === verifyModal.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Complete Delivery
                </button>
              </div>
            </div>
          </div>
        )}

        {editModal && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
            <div className="max-h-[94vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl">
              <h2 className="text-lg font-black text-slate-900">Edit Delivery</h2>
              <p className="mt-1 text-xs text-slate-500">
                Customer: {editModal.customer.name} · #{editModal.sequenceNumber}
              </p>

              <div className="mt-4 space-y-3">
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-[10px] font-black uppercase text-slate-500">Current Status</p>
                  <p className="mt-1">{statusBadge(editModal.status)}</p>
                </div>

                <label className="block text-xs font-black text-slate-700">
                  Update Status
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as 'DELIVERED' | 'FAILED')}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="DELIVERED">Delivered</option>
                    <option value="FAILED">Failed</option>
                  </select>
                </label>

                <label className="block text-xs font-black text-slate-700">
                  Cash Collected (₹)
                  <input
                    value={editCash}
                    onChange={(e) => setEditCash(e.target.value)}
                    type="number"
                    min="0"
                    step="0.01"
                    className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    placeholder="Enter amount collected"
                  />
                </label>

                <label className="block text-xs font-black text-slate-700">
                  Notes
                  <textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    rows={2}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    placeholder={editStatus === 'FAILED' ? 'Failure reason (required)' : 'Delivery notes (optional)'}
                  />
                </label>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setEditModal(null)}
                  className="min-h-10 flex-1 rounded-xl border border-slate-200 text-xs font-black"
                >
                  Cancel
                </button>
                <button
                  disabled={working === editModal.id}
                  onClick={() => void submitEdit()}
                  className={`inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-xs font-black text-white disabled:opacity-50 ${editStatus === 'FAILED' ? 'bg-red-600' : 'bg-emerald-700'}`}
                >
                  {working === editModal.id ? <Loader2 className="h-4 w-4 animate-spin" /> : editStatus === 'FAILED' ? <XCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                  Mark as {editStatus === 'FAILED' ? 'Failed' : 'Delivered'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
