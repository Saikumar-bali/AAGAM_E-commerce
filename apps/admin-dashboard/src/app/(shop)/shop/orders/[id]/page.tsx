'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import DashboardLayout from '@/components/DashboardLayout';
import { apiClient } from '@aagam/utils';
import { formatINR } from '@/lib/currency';
import OrderTimeline from '@/components/customer/OrderTimeline';
import BillDetailsCard from '@/components/customer/BillDetailsCard';
import dynamic from 'next/dynamic';
import {
  ArrowLeft, Calendar, MapPin, Package, Phone, Store, Truck,
  RotateCcw, MessageSquare, ExternalLink, Clock, Navigation,
} from 'lucide-react';

const CustomerTrackingMap = dynamic(() => import('@/components/CustomerTrackingMap'), { ssr: false });

type Order = {
  id: string;
  status: string;
  currency: string;
  subtotal: number;
  deliveryFee: number;
  discountAmount: number;
  taxAmount: number;
  grandTotal: number;
  totalAmount: number;
  deliveryLat: number | null;
  deliveryLng: number | null;
  createdAt: string;
  store?: { name?: string | null; address?: string | null; latitude?: number | null; longitude?: number | null } | null;
  payment?: { method: 'ONLINE' | 'COD'; status: string; provider?: string | null } | null;
  rider?: { id: string; user?: { name?: string | null; phone?: string | null } | null } | null;
  items?: Array<{
    id: string;
    quantity: number;
    price: number;
    product?: { name?: string | null; image?: string | null } | null;
  }>;
  addressSnapshot?: any;
  itemsSnapshot?: any;
  pricingSnapshot?: any;
};

const TrackingStateBanner = ({ state }: { state: string }) => {
  const config: Record<string, { bg: string; border: string; text: string; dot: string; label: string }> = {
    NOT_ASSIGNED: { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700', dot: 'bg-slate-400', label: 'Waiting for rider assignment...' },
    ASSIGNED_NO_LOCATION: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', dot: 'bg-blue-500', label: 'Rider is heading to pick up your order' },
    LIVE: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500 animate-pulse', label: 'Live tracking active' },
    STALE: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500', label: 'Tracking paused — waiting for rider location update' },
    DELIVERED: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'Order delivered!' },
    CANCELLED: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', dot: 'bg-red-500', label: 'Order was cancelled' },
    STOPPED: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'Order delivered!' },
  };
  const c = config[state] || config.NOT_ASSIGNED;
  return (
    <div className={`rounded-2xl border ${c.border} ${c.bg} p-4 flex items-center gap-3`}>
      <div className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
      <span className={`text-sm font-bold ${c.text}`}>{c.label}</span>
    </div>
  );
};

export default function CustomerOrderDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const orderId = params?.id;

  const [order, setOrder] = useState<Order | null>(null);
  const [trackingPayload, setTrackingPayload] = useState<any | null>(null);
  const [liveLocation, setLiveLocation] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;
    const run = async () => {
      setLoading(true); setError(null);
      try {
        const res = await apiClient.get(`/orders/my/${orderId}`);
        const tracking = await apiClient.get(`/tracking/my/order/${orderId}`);
        setOrder(res.data as Order);
        setTrackingPayload(tracking.data);
      } catch (e: any) { setError(e?.response?.data?.message || 'Failed to load order'); }
      finally { setLoading(false); }
    };
    run();
  }, [orderId]);

  useEffect(() => {
    if (!orderId) return;
    const socket: Socket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005', {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      auth: { token: typeof document !== 'undefined' ? document.cookie.split('; ').find(c => c.startsWith('access_token='))?.split('=')[1] : undefined },
    });
    socket.on('connect', () => socket.emit('joinOrder', { orderId }));
    socket.on('riderLocationUpdated', (payload: any) => { if (payload.orderId === orderId) setLiveLocation(payload); });
    socket.on('riderMoved', (payload: any) => { if (payload.orderId === orderId) setLiveLocation(payload); });
    socket.on('orderTimelineUpdated', (payload: any) => { if (payload.order?.id === orderId) setTrackingPayload(payload); });
    socket.on('orderStatusUpdated', (payload: any) => { if (payload.orderId === orderId) window.location.reload(); });
    socket.on('trackingStopped', (payload: any) => { if (payload.orderId === orderId) window.location.reload(); });
    return () => { socket.disconnect(); };
  }, [orderId]);

  useEffect(() => {
    if (!orderId) return;
    const poll = setInterval(() => {
      apiClient.get(`/tracking/my/order/${orderId}`).then(res => setTrackingPayload(res.data)).catch(() => {});
    }, 10000);
    return () => clearInterval(poll);
  }, [orderId]);

  const items = useMemo(() => {
    if (Array.isArray(order?.items) && order!.items!.length > 0) return order!.items!;
    if (Array.isArray(order?.itemsSnapshot)) return order!.itemsSnapshot;
    return [];
  }, [order]);

  const pricing = useMemo(() => {
    if (order?.pricingSnapshot && typeof order.pricingSnapshot === 'object') return order.pricingSnapshot;
    return { subtotal: order?.subtotal ?? 0, deliveryFee: order?.deliveryFee ?? 0, discountAmount: order?.discountAmount ?? 0, taxAmount: order?.taxAmount ?? 0, grandTotal: order?.grandTotal ?? order?.totalAmount ?? 0 };
  }, [order]);

  const address = useMemo(() => {
    if (order?.addressSnapshot && typeof order.addressSnapshot === 'object') return order.addressSnapshot;
    return null;
  }, [order]);

  const livePoint = liveLocation || trackingPayload?.tracking?.latestLocation || null;
  const trackingMeta = trackingPayload?.tracking || {};
  const trackingState = trackingMeta.trackingState || 'NOT_ASSIGNED';
  const etaLabel = trackingMeta.etaMinutes ? `ETA ${trackingMeta.etaMinutes} min` : null;
  const distanceLabel = trackingMeta.distanceKm != null ? `${trackingMeta.distanceKm} km` : null;
  const lastPingAt = livePoint?.createdAt || trackingMeta.lastPingAt;

  const buildMapMarkers = () => {
    const markers: { latitude: number; longitude: number; type: 'store' | 'delivery' | 'rider'; label?: string }[] = [];
    if (trackingPayload?.store?.latitude && trackingPayload?.store?.longitude) {
      markers.push({ latitude: trackingPayload.store.latitude, longitude: trackingPayload.store.longitude, type: 'store', label: trackingPayload.store.name || 'Store' });
    }
    if (order?.deliveryLat && order?.deliveryLng) {
      markers.push({ latitude: order.deliveryLat, longitude: order.deliveryLng, type: 'delivery', label: 'Delivery' });
    }
    const riderLat = livePoint?.latitude ?? trackingPayload?.rider?.latitude;
    const riderLng = livePoint?.longitude ?? trackingPayload?.rider?.longitude;
    if (riderLat && riderLng) {
      markers.push({ latitude: riderLat, longitude: riderLng, type: 'rider', label: trackingPayload?.rider?.name || 'Rider' });
    }
    return markers;
  };

  const showTrackingMap = trackingState !== 'NOT_ASSIGNED' && trackingState !== 'DELIVERED' && trackingState !== 'CANCELLED';

  return (
    <DashboardLayout allowedRole="CUSTOMER">
      <div className="max-w-4xl mx-auto">
        <button onClick={() => router.push('/shop/orders')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to orders
        </button>

        {loading ? (
          <div className="rounded-2xl border border-slate-100 bg-white p-6 animate-pulse space-y-4">
            <div className="h-6 w-48 bg-slate-100 rounded" />
            <div className="h-4 w-32 bg-slate-100 rounded" />
            <div className="h-32 bg-slate-100 rounded-2xl" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-center">
            <p className="text-sm font-bold text-red-700">{error}</p>
          </div>
        ) : !order ? (
          <div className="rounded-2xl border border-slate-100 bg-white p-6 text-center">
            <p className="text-sm text-slate-500">Order not found.</p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-2xl border border-slate-100 bg-white p-5">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-mono text-lg font-black text-slate-950">#{order.id.slice(-8).toUpperCase()}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 font-semibold">
                    <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{new Date(order.createdAt).toLocaleString('en-IN')}</span>
                    <span className="flex items-center gap-1"><Store className="h-3.5 w-3.5" />{order.store?.name || 'Store'}</span>
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${order.payment?.method === 'COD' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{order.payment?.method}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black text-slate-950">{formatINR(Number(pricing.grandTotal) || 0)}</div>
                  <div className="flex flex-wrap justify-end gap-2 mt-2">
                    {etaLabel && (
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-teal-50 border border-teal-200 px-2.5 py-1 text-xs font-black text-teal-700">
                        <Truck className="h-3 w-3" /> {etaLabel}
                      </span>
                    )}
                    {distanceLabel && (
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 border border-blue-200 px-2.5 py-1 text-xs font-black text-blue-700">
                        <Navigation className="h-3 w-3" /> {distanceLabel}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <TrackingStateBanner state={trackingState} />

            {showTrackingMap && (
              <div className="rounded-2xl border border-slate-100 bg-white overflow-hidden">
                <CustomerTrackingMap markers={buildMapMarkers()} />
                <div className="p-4 border-t border-slate-100">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Last update: {lastPingAt ? new Date(lastPingAt).toLocaleTimeString('en-IN') : 'Never'}</span>
                    {trackingPayload?.rider?.name && (
                      <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {trackingPayload.rider.name}</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            <OrderTimeline currentStatus={order.status} timeline={trackingPayload?.timeline} />

            {address && (
              <div className="rounded-2xl border border-slate-100 bg-white p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="grid h-8 w-8 place-items-center rounded-lg bg-teal-100 text-teal-700"><MapPin className="h-4 w-4" /></div>
                  <span className="text-sm font-black text-slate-950">Delivery Address</span>
                </div>
                <div className="text-sm font-bold text-slate-800">{address.recipientName} <span className="text-slate-500">({address.phoneE164})</span></div>
                <div className="mt-1 text-sm text-slate-600">{address.line1}{address.line2 ? `, ${address.line2}` : ''}{address.landmark ? `, ${address.landmark}` : ''}</div>
                <div className="text-sm text-slate-600">{address.city}, {address.state} {address.pincode}</div>
              </div>
            )}

            <div className="rounded-2xl border border-slate-100 bg-white p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-violet-100 text-violet-700"><Package className="h-4 w-4" /></div>
                <span className="text-sm font-black text-slate-950">Items ({items.length})</span>
              </div>
              <div className="space-y-2">
                {items.map((it: any, idx: number) => {
                  const name = it?.product?.name || it?.name || `Item ${idx + 1}`;
                  const qty = Number(it.quantity) || 0;
                  const unitPrice = Number(it.unitPrice ?? it.price) || 0;
                  const lineTotal = Number(it.lineTotal) || unitPrice * qty;
                  return (
                    <div key={it.id || idx} className="flex items-center gap-3 rounded-xl border border-slate-50 bg-slate-50/50 px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-black text-slate-950 truncate">{name}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{qty} × {formatINR(unitPrice)}</div>
                      </div>
                      <div className="text-sm font-black text-slate-950">{formatINR(lineTotal)}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <BillDetailsCard
                items={items.map((it: any) => ({ name: it?.product?.name || it?.name || 'Item', quantity: Number(it.quantity) || 0, unitPrice: Number(it.unitPrice ?? it.price) || 0, lineTotal: Number(it.lineTotal) || 0 }))}
                subtotal={Number(pricing.subtotal) || 0}
                deliveryFee={Number(pricing.deliveryFee) || 0}
                discountAmount={Number(pricing.discountAmount) || 0}
                taxAmount={Number(pricing.taxAmount) || 0}
                grandTotal={Number(pricing.grandTotal) || 0}
              />

              <div className="rounded-2xl border border-slate-100 bg-white p-5">
                <div className="text-sm font-black text-slate-950 mb-3">Delivery</div>
                <div className="space-y-3">
                  <div className="flex items-center gap-2.5 text-sm">
                    <Truck className="h-4 w-4 text-teal-600" />
                    <span className="font-bold text-slate-800">Status: </span>
                    <span className="font-black text-slate-950">{order.status.replace(/_/g, ' ')}</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-sm">
                    <Phone className="h-4 w-4 text-teal-600" />
                    <span className="font-bold text-slate-800">Rider: </span>
                    <span className="font-black text-slate-950">{trackingPayload?.rider?.name || order.rider?.user?.name || 'Not assigned'}</span>
                  </div>
                  {livePoint && (
                    <div className="rounded-xl bg-teal-50 border border-teal-100 p-3 mt-3">
                      <div className="text-xs font-black text-teal-800">Live Location</div>
                      <div className="mt-1 text-xs font-mono text-slate-600">{Number(livePoint.latitude).toFixed(5)}, {Number(livePoint.longitude).toFixed(5)}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Updated {new Date(livePoint.createdAt).toLocaleTimeString('en-IN')}</div>
                      <a href={`https://www.google.com/maps/dir/?api=1&destination=${livePoint.latitude},${livePoint.longitude}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 rounded-lg bg-teal-700 px-2.5 py-1.5 text-[11px] font-black text-white hover:bg-teal-800">
                        <ExternalLink className="h-3 w-3" /> Track on map
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button onClick={() => router.push('/shop')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50 transition-colors">
                <RotateCcw className="h-4 w-4" /> Reorder
              </button>
              <button className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50 transition-colors">
                <MessageSquare className="h-4 w-4" /> Support
              </button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
