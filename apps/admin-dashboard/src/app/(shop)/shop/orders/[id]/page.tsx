'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import DashboardLayout from '@/components/DashboardLayout';
import { apiClient } from '@aagam/utils';
import { formatINR } from '@/lib/currency';
import { ArrowLeft, Calendar, MapPin, Package, Phone, Store, Truck } from 'lucide-react';

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
  createdAt: string;
  store?: { name?: string | null; address?: string | null } | null;
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
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient.get(`/orders/my/${orderId}`);
        const tracking = await apiClient.get(`/orders/my/${orderId}/tracking`);
        setOrder(res.data as Order);
        setTrackingPayload(tracking.data);
      } catch (e: any) {
        setError(e?.response?.data?.message || e?.message || 'Failed to load order');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [orderId]);

  useEffect(() => {
    if (!orderId) return;
    const socket: Socket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005', {
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });
    socket.on('connect', () => socket.emit('joinOrder', { orderId }));
    socket.on('riderLocationUpdated', (payload: any) => {
      if (payload.orderId === orderId) setLiveLocation(payload);
    });
    socket.on('orderTimelineUpdated', (payload: any) => {
      if (payload.order?.id === orderId) setTrackingPayload(payload);
    });
    return () => {
      socket.disconnect();
    };
  }, [orderId]);

  const items = useMemo(() => {
    if (Array.isArray(order?.items) && order!.items!.length > 0) return order!.items!;
    if (Array.isArray(order?.itemsSnapshot)) return order!.itemsSnapshot;
    return [];
  }, [order]);

  const pricing = useMemo(() => {
    if (order?.pricingSnapshot && typeof order.pricingSnapshot === 'object') return order.pricingSnapshot;
    return {
      subtotal: order?.subtotal ?? 0,
      deliveryFee: order?.deliveryFee ?? 0,
      discountAmount: order?.discountAmount ?? 0,
      taxAmount: order?.taxAmount ?? 0,
      grandTotal: order?.grandTotal ?? order?.totalAmount ?? 0,
    };
  }, [order]);

  const address = useMemo(() => {
    if (order?.addressSnapshot && typeof order.addressSnapshot === 'object') return order.addressSnapshot;
    return null;
  }, [order]);
  const livePoint = liveLocation || trackingPayload?.tracking?.latestLocation || null;
  const trackingMeta = trackingPayload?.tracking || {};
  const etaLabel = trackingMeta.etaMinutes ? `ETA ${trackingMeta.etaMinutes} min` : null;
  const etaStale = Boolean(trackingMeta.etaStale);
  const etaConfidence = trackingMeta.etaConfidence as 'HIGH' | 'MEDIUM' | 'LOW' | undefined;
  const etaBadgeTone =
    etaConfidence === 'HIGH'
      ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
      : etaConfidence === 'MEDIUM'
        ? 'text-amber-700 bg-amber-50 border-amber-200'
        : 'text-gray-700 bg-gray-50 border-gray-200';

  return (
    <DashboardLayout allowedRole="CUSTOMER">
      <div className="min-h-screen">
        <button
          onClick={() => router.push('/shop/orders')}
          className="inline-flex items-center gap-2 text-emerald-900 font-black"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to orders
        </button>

        <div className="mt-6 rounded-2xl border border-emerald-100 bg-white p-6">
          {loading ? (
            <div className="text-sm text-gray-600">Loading order...</div>
          ) : error ? (
            <div className="text-sm text-red-800 font-bold">{error}</div>
          ) : !order ? (
            <div className="text-sm text-gray-600">Order not found.</div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-xs text-gray-600">Order ID</div>
                  <div className="mt-1 font-mono text-sm font-black text-gray-900 break-all">{order.id}</div>
                  <div className="mt-3 flex items-center gap-2 text-xs text-gray-600">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    <span>{new Date(order.createdAt).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-gray-600">
                    <Store className="h-4 w-4 text-gray-400" />
                    <span>{order.store?.name || 'Assigned store'}</span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xs font-black uppercase tracking-widest text-emerald-900/60">Total</div>
                  <div className="mt-1 text-2xl font-black text-gray-900">{formatINR(Number(pricing.grandTotal) || 0)}</div>
                  <div className="mt-1 text-[11px] font-black uppercase tracking-widest text-emerald-900/60">
                    {order.payment?.method === 'COD' ? 'COD' : 'ONLINE'}
                  </div>
                  {etaLabel ? (
                    <div className={`mt-2 inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-black ${etaBadgeTone}`}>
                      {etaLabel}
                      <span className="opacity-80">{etaConfidence || 'LOW'} confidence</span>
                    </div>
                  ) : (
                    <div className="mt-2 text-xs font-bold text-gray-600">
                      ETA unavailable right now.
                    </div>
                  )}
                </div>
              </div>

              {trackingPayload?.timeline?.length ? (
                <div className="rounded-2xl border border-emerald-100 bg-white p-5">
                  <div className="text-sm font-black text-gray-900">Timeline</div>
                  <div className="mt-4 space-y-3">
                    {trackingPayload.timeline.map((event: any) => (
                      <div key={event.id} className="flex gap-3 text-sm">
                        <div className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-600" />
                        <div>
                          <div className="font-black text-gray-900">{String(event.toStatus).replace(/_/g, ' ')}</div>
                          <div className="text-xs text-gray-500">{new Date(event.createdAt).toLocaleString('en-IN')}</div>
                          {event.note ? <div className="text-xs text-gray-600 mt-1">{event.note}</div> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {address ? (
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/30 p-5">
                  <div className="inline-flex items-center gap-2 text-sm font-black text-gray-900">
                    <MapPin className="h-4 w-4 text-emerald-700" />
                    Delivery address
                  </div>
                  <div className="mt-2 text-sm text-gray-800 font-bold">
                    {address.recipientName}{' '}
                    <span className="text-gray-500 font-black">({address.phoneE164}{address.alternatePhoneE164 ? `, ${address.alternatePhoneE164}` : ''})</span>
                  </div>
                  <div className="mt-1 text-sm text-gray-700">
                    {address.line1}
                    {address.line2 ? `, ${address.line2}` : ''}
                    {address.landmark ? `, ${address.landmark}` : ''}
                  </div>
                  <div className="mt-1 text-sm text-gray-700">
                    {address.city}, {address.state} {address.pincode}
                  </div>
                  {address.instructions ? (
                    <div className="mt-2 text-xs text-gray-600">
                      <span className="font-black text-gray-900">Instructions:</span> {address.instructions}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="rounded-2xl border border-emerald-100 bg-white p-5">
                <div className="inline-flex items-center gap-2 text-sm font-black text-gray-900">
                  <Package className="h-4 w-4 text-emerald-700" />
                  Items
                </div>
                <div className="mt-4 space-y-3">
                  {items.map((it: any, idx: number) => {
                    const name = it?.product?.name || it?.name || `Item ${idx + 1}`;
                    const qty = Number(it.quantity) || 0;
                    const unitPrice = Number(it.unitPrice ?? it.price) || 0;
                    const lineTotal = Number(it.lineTotal) || unitPrice * qty;
                    return (
                      <div key={it.id || it.productId || idx} className="flex items-start justify-between gap-3 text-sm">
                        <div className="min-w-0">
                          <div className="font-black text-gray-900 truncate">{name}</div>
                          <div className="text-gray-600 mt-0.5">
                            {qty} × {formatINR(unitPrice)}
                          </div>
                        </div>
                        <div className="font-black text-gray-900">{formatINR(lineTotal)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-emerald-100 bg-white p-5">
                  <div className="text-sm font-black text-gray-900">Invoice</div>
                  <div className="mt-3 space-y-2 text-sm">
                    <Row label="Subtotal" value={formatINR(Number(pricing.subtotal) || 0)} />
                    <Row label="Delivery fee" value={formatINR(Number(pricing.deliveryFee) || 0)} />
                    <Row label="Discount" value={formatINR(Number(pricing.discountAmount) || 0)} />
                    <Row label="Tax" value={formatINR(Number(pricing.taxAmount) || 0)} />
                    <div className="pt-2 border-t border-emerald-100">
                      <Row
                        label={<span className="font-black">Grand total</span>}
                        value={<span className="font-black">{formatINR(Number(pricing.grandTotal) || 0)}</span>}
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-emerald-100 bg-white p-5">
                  <div className="text-sm font-black text-gray-900">Delivery</div>
                  <div className="mt-3 text-sm text-gray-700">
                    <div className="inline-flex items-center gap-2">
                      <Truck className="h-4 w-4 text-emerald-700" />
                      <span className="font-black text-gray-900">Status:</span> {order.status}
                    </div>
                  </div>
                  <div className="mt-3 text-sm text-gray-700">
                    <div className="inline-flex items-center gap-2">
                      <Phone className="h-4 w-4 text-emerald-700" />
                      <span className="font-black text-gray-900">Rider:</span> {trackingPayload?.rider?.name || order.rider?.user?.name || 'Not assigned yet'}
                    </div>
                    {(trackingPayload?.rider?.phone || order.rider?.user?.phone) ? (
                      <div className="mt-1 text-xs text-gray-600">Contact: {trackingPayload?.rider?.phone || order.rider?.user?.phone}</div>
                    ) : null}
                  </div>
                  {(liveLocation || trackingPayload?.tracking?.latestLocation) ? (
                    <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-900">
                      <div className="font-black">Latest rider position</div>
                      <div className="mt-1">
                        {Number(livePoint.latitude).toFixed(5)}, {Number(livePoint.longitude).toFixed(5)}
                      </div>
                      <div className="mt-1 text-emerald-900/70">
                        Updated {new Date(livePoint.createdAt).toLocaleTimeString('en-IN')}
                      </div>
                      {etaStale ? (
                        <div className="mt-1 text-[11px] font-bold text-amber-700">
                          Waiting for a fresh rider GPS update before showing ETA.
                        </div>
                      ) : null}
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${livePoint.latitude},${livePoint.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-block rounded-lg bg-emerald-700 px-2.5 py-1.5 text-[11px] font-black text-white"
                      >
                        Track rider on map
                      </a>
                    </div>
                  ) : (
                    <div className="mt-4 text-xs text-gray-600">
                      Rider tracking will appear here once a rider is assigned and starts moving.
                    </div>
                  )}
                  {livePoint ? (
                    <div className="mt-3 overflow-hidden rounded-xl border border-emerald-100">
                      <iframe
                        title="Rider live location"
                        className="h-44 w-full"
                        loading="lazy"
                        src={`https://maps.google.com/maps?q=${livePoint.latitude},${livePoint.longitude}&z=15&output=embed`}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-gray-600">{label}</div>
      <div className="text-gray-900">{value}</div>
    </div>
  );
}
