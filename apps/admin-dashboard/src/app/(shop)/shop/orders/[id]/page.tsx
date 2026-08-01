'use client';

export const runtime = 'edge';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { io, Socket } from 'socket.io-client';
import DashboardLayout from '@/components/DashboardLayout';
import OrderTimeline from '@/components/customer/OrderTimeline';
import BillDetailsCard from '@/components/customer/BillDetailsCard';
import { apiClient, normalizeOrderLine, normalizeOrderPricing } from '@aagam/utils';
import { formatINR } from '@/lib/currency';
import { ArrowLeft, Calendar, MapPin, Package, Phone, Store, Truck, RotateCcw, MessageSquare, ExternalLink, Clock, Navigation, Bike, CheckCircle2, ShieldCheck, AlertTriangle, KeyRound } from 'lucide-react';
import DeliveryCodeModal from '@/components/customer/DeliveryCodeModal';

const CustomerTrackingMap = dynamic(() => import('@/components/CustomerTrackingMap'), { ssr: false });

type Order = Record<string, any> & {
  id: string; status: string; currency: string; totalAmount: number; createdAt: string;
  deliveryLat: number | null; deliveryLng: number | null; deliveredAt?: string | null;
  store?: { name?: string | null; address?: string | null; latitude?: number | null; longitude?: number | null } | null;
  payment?: { method: 'ONLINE' | 'COD'; status: string; provider?: string | null } | null;
  rider?: { id: string; user?: { name?: string | null; phone?: string | null } | null } | null;
  items?: any[]; addressSnapshot?: any; itemsSnapshot?: any; pricingSnapshot?: any;
};

const statusSteps = [{ key: 'CONFIRMED', label: 'Confirmed' }, { key: 'PICKING', label: 'Preparing' }, { key: 'PACKED', label: 'Packed' }, { key: 'RIDER_ASSIGNED', label: 'Rider' }, { key: 'OUT_FOR_DELIVERY', label: 'On the way' }, { key: 'DELIVERED', label: 'Delivered' }];
const statusRank: Record<string, number> = { PENDING: 0, PAYMENT_PENDING: 0, CONFIRMED: 1, PICKING: 2, PACKED: 3, RIDER_ASSIGNED: 4, OUT_FOR_DELIVERY: 5, DELIVERED: 6, CANCELLED: -1, PAYMENT_FAILED: -1 };

function customerMessage(status: string, trackingState: string, etaStale: boolean) {
  if (status === 'DELIVERED') return 'Delivered successfully. Thanks for ordering with Aagaam.';
  if (status === 'CANCELLED') return 'This order was cancelled.';
  if (status === 'PACKED') return 'Your order is packed and waiting for rider pickup.';
  if (status === 'RIDER_ASSIGNED') return trackingState === 'ASSIGNED_NO_LOCATION' ? 'Rider assigned. Live location will appear after pickup starts.' : 'Rider assigned and moving towards pickup.';
  if (status === 'OUT_FOR_DELIVERY') return etaStale ? 'Your order is on the way. Location is temporarily stale.' : 'Your order is on the way with live tracking.';
  if (status === 'PICKING') return 'The store is picking and packing your items.';
  if (status === 'CONFIRMED') return 'The store confirmed your order.';
  return 'We are processing your order.';
}

function TrackingStateBanner({ state, status, etaStale }: { state: string; status: string; etaStale: boolean }) {
  const config: Record<string, { bg: string; border: string; text: string; dot: string; label: string }> = {
    NOT_ASSIGNED: { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700', dot: 'bg-slate-400', label: 'Waiting for rider assignment' },
    ASSIGNED_NO_LOCATION: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', dot: 'bg-blue-500', label: 'Rider assigned — pickup pending' },
    LIVE: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500 animate-pulse', label: 'Live tracking active' },
    STALE: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500', label: 'Tracking paused — waiting for rider update' },
    DELIVERED: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'Order delivered' },
    CANCELLED: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', dot: 'bg-red-500', label: 'Order cancelled' },
    STOPPED: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'Tracking completed' },
  };
  const value = config[state] || config.NOT_ASSIGNED;
  return <div className={`rounded-2xl border ${value.border} ${value.bg} p-4`}><div className="flex items-center gap-3"><div className={`h-2.5 w-2.5 rounded-full ${value.dot}`} /><span className={`text-sm font-black ${value.text}`}>{value.label}</span></div><p className={`mt-2 text-sm font-bold ${value.text}`}>{customerMessage(status, state, etaStale)}</p></div>;
}

export default function CustomerOrderDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const orderId = params?.id;
  const [order, setOrder] = useState<Order | null>(null);
  const [trackingPayload, setTrackingPayload] = useState<any | null>(null);
  const [liveLocation, setLiveLocation] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deliveryJobId, setDeliveryJobId] = useState<string | null>(null);
  const [deliveryStatus, setDeliveryStatus] = useState<string | null>(null);
  const [otpModalOpen, setOtpModalOpen] = useState(false);

  const refresh = async () => {
    if (!orderId) return;
    setLoading(true); setError(null);
    try {
      const [orderResponse, trackingResponse] = await Promise.all([apiClient.get(`/orders/my/${orderId}`), apiClient.get(`/tracking/my/order/${orderId}`)]);
      setOrder(orderResponse.data as Order); setTrackingPayload(trackingResponse.data);
    } catch (exception: any) { setError(exception?.response?.data?.message || 'Failed to load order'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!orderId) return;
    void apiClient.get(`/orders/my/${orderId}/delivery-context`).then((res) => {
      setDeliveryJobId(res.data?.deliveryJobId || null);
      setDeliveryStatus(res.data?.deliveryStatus || null);
    }).catch(() => undefined);
  }, [orderId, order?.status]);

  useEffect(() => {
    if (deliveryStatus === 'RIDER_AT_CUSTOMER' && deliveryJobId) {
      setOtpModalOpen(true);
    }
  }, [deliveryStatus, deliveryJobId]);

  useEffect(() => { void refresh(); }, [orderId]);
  useEffect(() => {
    if (!orderId) return;
    const socket: Socket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005', { withCredentials: true, transports: ['websocket', 'polling'], auth: { token: typeof document !== 'undefined' ? document.cookie.split('; ').find((cookie) => cookie.startsWith('access_token='))?.split('=')[1] : undefined } });
    socket.on('connect', () => socket.emit('joinOrder', { orderId }));
    socket.on('riderLocationUpdated', (payload: any) => { if (payload.orderId === orderId) setLiveLocation(payload); });
    socket.on('riderMoved', (payload: any) => { if (payload.orderId === orderId) setLiveLocation(payload); });
    socket.on('orderTimelineUpdated', (payload: any) => { if (payload.order?.id === orderId) setTrackingPayload(payload); });
    socket.on('orderStatusUpdated', (payload: any) => { if (payload.orderId === orderId) void refresh(); });
    socket.on('trackingStopped', (payload: any) => { if (payload.orderId === orderId) void refresh(); });
    return () => socket.disconnect();
  }, [orderId]);
  useEffect(() => { if (!orderId) return; const poll = setInterval(() => { apiClient.get(`/tracking/my/order/${orderId}`).then((response) => setTrackingPayload(response.data)).catch(() => undefined); }, 10000); return () => clearInterval(poll); }, [orderId]);

  const items = useMemo(() => Array.isArray(order?.items) && order!.items!.length > 0 ? order!.items! : Array.isArray(order?.itemsSnapshot) ? order!.itemsSnapshot : [], [order]);
  const pricing = useMemo(() => normalizeOrderPricing(order, items), [order, items]);
  const address = useMemo(() => order?.addressSnapshot && typeof order.addressSnapshot === 'object' ? order.addressSnapshot : null, [order]);
  const livePoint = liveLocation || trackingPayload?.tracking?.latestLocation || null;
  const trackingMeta = trackingPayload?.tracking || {};
  const trackingState = trackingMeta.trackingState || 'NOT_ASSIGNED';
  const etaLabel = trackingMeta.etaMinutes ? `ETA ${trackingMeta.etaMinutes} min` : null;
  const distanceLabel = trackingMeta.distanceKm != null ? `${trackingMeta.distanceKm} km away` : null;
  const lastPingAt = livePoint?.createdAt || trackingMeta.lastPingAt;
  const timeline = Array.isArray(trackingPayload?.timeline) ? trackingPayload.timeline : [];
  const proofEvent = timeline.find((item: any) => item?.metadata?.event === 'DELIVERY_PROOF_RECORDED' || item?.note === 'Rider submitted delivery proof.');
  const proof = proofEvent?.metadata || null;
  const proofCode = proof?.code || proof?.deliveryProof?.code || null;
  const proofNote = proof?.note || proof?.deliveryProof?.note || null;
  const currentRank = statusRank[order?.status || 'PENDING'] ?? 0;
  const markers = useMemo(() => {
    const values: { latitude: number; longitude: number; type: 'store' | 'delivery' | 'rider'; label?: string }[] = [];
    if (typeof trackingPayload?.store?.latitude === 'number' && typeof trackingPayload?.store?.longitude === 'number') values.push({ latitude: trackingPayload.store.latitude, longitude: trackingPayload.store.longitude, type: 'store', label: trackingPayload.store.name || 'Store' });
    if (typeof order?.deliveryLat === 'number' && typeof order?.deliveryLng === 'number') values.push({ latitude: order.deliveryLat, longitude: order.deliveryLng, type: 'delivery', label: 'Delivery' });
    const riderLat = livePoint?.latitude ?? trackingPayload?.rider?.latitude; const riderLng = livePoint?.longitude ?? trackingPayload?.rider?.longitude;
    if (typeof riderLat === 'number' && typeof riderLng === 'number') values.push({ latitude: riderLat, longitude: riderLng, type: 'rider', label: trackingPayload?.rider?.name || 'Rider' });
    return values;
  }, [trackingPayload, order, livePoint]);
  const showTrackingMap = !['NOT_ASSIGNED', 'DELIVERED', 'CANCELLED', 'STOPPED'].includes(trackingState);

  return <DashboardLayout allowedRole="CUSTOMER"><div className="mx-auto max-w-4xl"><button onClick={() => router.push('/shop/orders')} className="mb-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700"><ArrowLeft className="h-4 w-4" /> Back to orders</button>
    {loading ? <div className="h-64 animate-pulse rounded-2xl bg-white" /> : error ? <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-center text-sm font-bold text-red-700">{error}</div> : !order ? <div className="rounded-2xl bg-white p-6 text-center">Order not found.</div> : <div className="space-y-5">
      <section className="rounded-2xl border border-slate-100 bg-white p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><span className="font-mono text-lg font-black text-slate-950">#{order.id.slice(-8).toUpperCase()}</span><div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-500"><span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{new Date(order.createdAt).toLocaleString('en-IN')}</span><span className="flex items-center gap-1"><Store className="h-3.5 w-3.5" />{order.store?.name || 'Store'}</span><span className={`rounded-lg px-2 py-0.5 text-[10px] font-black ${order.payment?.method === 'COD' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{order.payment?.method || 'PAYMENT'}</span></div></div><div className="text-right"><div className="text-2xl font-black text-slate-950">{formatINR(pricing.grandTotal)}</div><div className="mt-2 flex flex-wrap justify-end gap-2">{etaLabel && <span className="inline-flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-black text-teal-700"><Truck className="h-3 w-3" /> {etaLabel}</span>}{distanceLabel && <span className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-700"><Navigation className="h-3 w-3" /> {distanceLabel}</span>}</div></div></div></section>
      <TrackingStateBanner state={trackingState} status={order.status} etaStale={Boolean(trackingMeta.etaStale || trackingMeta.isStale)} />
      <section className="rounded-2xl border border-slate-100 bg-white p-5"><div className="mb-4 flex items-center gap-2"><Bike className="h-4 w-4 text-cyan-600" /><h2 className="text-sm font-black text-slate-950">Delivery progress</h2></div><div className="grid grid-cols-2 gap-2 md:grid-cols-6">{statusSteps.map((step, index) => { const done = currentRank >= index + 1; return <div key={step.key} className={`rounded-xl border p-3 text-center ${done ? 'border-teal-200 bg-teal-50 text-teal-800' : 'border-slate-100 bg-slate-50 text-slate-400'}`}><CheckCircle2 className="mx-auto h-4 w-4" /><p className="mt-1 text-[11px] font-black">{step.label}</p></div>; })}</div>
        {(deliveryStatus === 'OUT_FOR_DELIVERY' || deliveryStatus === 'RIDER_AT_CUSTOMER') && deliveryJobId && (
          <button onClick={() => setOtpModalOpen(true)} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-black text-violet-800 transition hover:bg-violet-100">
            <KeyRound className="h-4 w-4" /> {deliveryStatus === 'RIDER_AT_CUSTOMER' ? 'View delivery code' : 'Delivery code (rider approaching)'}
          </button>
        )}
      </section>
      {showTrackingMap && <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white"><CustomerTrackingMap markers={markers} /><div className="border-t border-slate-100 p-4"><div className="flex items-center justify-between text-xs text-slate-500"><span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Last update: {lastPingAt ? new Date(lastPingAt).toLocaleTimeString('en-IN') : 'Never'}</span>{trackingPayload?.rider?.name && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {trackingPayload.rider.name}</span>}</div>{trackingMeta.etaStale && <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800"><AlertTriangle className="h-4 w-4" /> Rider location is stale. ETA will resume after the next location update.</div>}</div></div>}
      {order.status === 'DELIVERED' && <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><div className="flex items-center gap-2 text-emerald-800"><ShieldCheck className="h-5 w-5" /><h2 className="text-sm font-black">Delivery completed</h2></div><p className="mt-2 text-sm font-bold text-emerald-800">Delivered at {order.deliveredAt ? new Date(order.deliveredAt).toLocaleString('en-IN') : 'delivery completion time'}.</p>{proof && <div className="mt-3 rounded-xl bg-white/70 p-3 text-xs font-bold text-emerald-900"><div>Proof: {proof.proofType || proof.deliveryProof?.method || 'Rider confirmation'}</div>{proofCode && <div className="mt-1">Delivery code: {proofCode}</div>}{proofNote && <div className="mt-1">Rider note: {proofNote}</div>}</div>}</section>}
      <OrderTimeline currentStatus={order.status} timeline={timeline} />
      {address && <section className="rounded-2xl border border-slate-100 bg-white p-5"><div className="mb-3 flex items-center gap-2"><div className="grid h-8 w-8 place-items-center rounded-lg bg-teal-100 text-teal-700"><MapPin className="h-4 w-4" /></div><span className="text-sm font-black text-slate-950">Delivery Address</span></div><div className="text-sm font-bold text-slate-800">{address.recipientName} <span className="text-slate-500">({address.phoneE164})</span></div><div className="mt-1 text-sm text-slate-600">{address.line1}{address.line2 ? `, ${address.line2}` : ''}{address.landmark ? `, ${address.landmark}` : ''}</div><div className="text-sm text-slate-600">{address.city}, {address.state} {address.pincode}</div></section>}
      <section className="rounded-2xl border border-slate-100 bg-white p-5"><div className="mb-3 flex items-center gap-2"><div className="grid h-8 w-8 place-items-center rounded-lg bg-violet-100 text-violet-700"><Package className="h-4 w-4" /></div><span className="text-sm font-black text-slate-950">Items ({items.length})</span></div><div className="space-y-2">{items.map((item: any, index: number) => { const line = normalizeOrderLine(item); return <div key={item.id || item.productId || index} className="flex items-center gap-3 rounded-xl border border-slate-50 bg-slate-50/50 px-3 py-2.5"><div className="min-w-0 flex-1"><div className="truncate text-sm font-black text-slate-950">{item?.product?.name || item?.name || `Item ${index + 1}`}</div><div className="mt-0.5 text-xs text-slate-500">{line.quantity} × {formatINR(line.unitPrice)}</div></div><div className="text-sm font-black text-slate-950">{formatINR(line.lineTotal)}</div></div>; })}</div></section>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2"><BillDetailsCard items={items.map((item: any) => { const line = normalizeOrderLine(item); return { name: item?.product?.name || item?.name || 'Item', quantity: line.quantity, unitPrice: line.unitPrice, lineTotal: line.lineTotal }; })} subtotal={pricing.subtotal} deliveryFee={pricing.deliveryFee} discountAmount={pricing.discountAmount} taxAmount={pricing.taxAmount} grandTotal={pricing.grandTotal} /><section className="rounded-2xl border border-slate-100 bg-white p-5"><div className="mb-3 text-sm font-black text-slate-950">Delivery</div><div className="space-y-3"><div className="flex items-center gap-2.5 text-sm"><Truck className="h-4 w-4 text-teal-600" /><span className="font-bold text-slate-800">Status:</span><span className="font-black text-slate-950">{order.status.replace(/_/g, ' ')}</span></div><div className="flex items-center gap-2.5 text-sm"><Phone className="h-4 w-4 text-teal-600" /><span className="font-bold text-slate-800">Rider:</span><span className="font-black text-slate-950">{trackingPayload?.rider?.name || order.rider?.user?.name || 'Not assigned'}</span></div>{livePoint && <a href={`https://www.google.com/maps/dir/?api=1&destination=${livePoint.latitude},${livePoint.longitude}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-teal-700 px-2.5 py-1.5 text-[11px] font-black text-white"><ExternalLink className="h-3 w-3" /> Track on map</a>}</div></section></div>
      <div className="flex flex-wrap gap-3"><button onClick={() => router.push('/shop')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700"><RotateCcw className="h-4 w-4" /> Reorder</button><button className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700"><MessageSquare className="h-4 w-4" /> Support</button></div>
    </div>}
      <DeliveryCodeModal
        deliveryJobId={deliveryJobId}
        open={otpModalOpen}
        onClose={() => setOtpModalOpen(false)}
      />
    </div></DashboardLayout>;
}
