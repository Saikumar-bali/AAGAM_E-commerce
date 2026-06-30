'use client';

import React, { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import dynamic from 'next/dynamic';
import { apiClient } from '@aagam/utils';
import { io, Socket } from 'socket.io-client';
import { MapPin, Clock, User, Phone, Package, Truck, AlertTriangle, RefreshCw, X, Store, Navigation } from 'lucide-react';

const LiveTrackingMap = dynamic(() => import('@/components/LiveTrackingMap'), { ssr: false });

interface ActiveOrder {
  orderId: string;
  status: string;
  store: { id: string; name: string; latitude: number | null; longitude: number | null };
  customer: { id: string; name: string | null; phone: string | null };
  rider: { id: string; name: string | null; phone: string | null; latitude: number | null; longitude: number | null; updatedAt: string } | null;
  latestLocation: { latitude: number; longitude: number; createdAt: string } | null;
  delivery: { latitude: number | null; longitude: number | null };
}

type StatusFilter = 'ALL' | 'RIDER_ASSIGNED' | 'OUT_FOR_DELIVERY' | 'STALE';

const STALE_THRESHOLD_SECONDS = 360;

export default function AdminLiveTrackingPage() {
  const [orders, setOrders] = useState<ActiveOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchLiveTracking = useCallback(async () => {
    try {
      const response = await apiClient.get('/tracking/admin/live');
      setOrders(response.data);
    } catch (err) {
      console.error('Failed to fetch live tracking', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLiveTracking();
    const socket: Socket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000', {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      auth: { token: typeof document !== 'undefined' ? document.cookie.split('; ').find(c => c.startsWith('access_token='))?.split('=')[1] : undefined },
    });

    socket.on('connect', () => {
      socket.emit('joinAdminMonitor');
    });

    socket.on('adminRiderUpdate', (payload: any) => {
      setOrders(prev => prev.map(order => {
        if (order.orderId === payload.orderId) {
          return {
            ...order,
            latestLocation: { latitude: payload.latitude, longitude: payload.longitude, createdAt: payload.timestamp },
            rider: order.rider ? { ...order.rider, latitude: payload.latitude, longitude: payload.longitude, updatedAt: payload.timestamp } : order.rider,
          };
        }
        return order;
      }));
    });

    socket.on('orderStatusUpdated', () => {
      fetchLiveTracking();
    });

    socket.on('trackingStopped', (payload: any) => {
      setOrders(prev => prev.filter(o => o.orderId !== payload.orderId));
    });

    return () => { socket.disconnect(); };
  }, [fetchLiveTracking]);

  const filteredOrders = orders.filter(order => {
    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'STALE') {
      if (!order.latestLocation) return true;
      const ageSeconds = (Date.now() - new Date(order.latestLocation.createdAt).getTime()) / 1000;
      return ageSeconds > STALE_THRESHOLD_SECONDS;
    }
    return order.status === statusFilter;
  });

  const openOrderDetail = async (orderId: string) => {
    setSelectedOrderId(orderId);
    setDetailLoading(true);
    try {
      const response = await apiClient.get(`/tracking/order/${orderId}`);
      setSelectedOrderDetail(response.data);
    } catch (err) {
      console.error('Failed to fetch order detail', err);
    } finally {
      setDetailLoading(false);
    }
  };

  const getPingAge = (latestLocation: { createdAt: string } | null): string => {
    if (!latestLocation) return 'Never';
    const ageSeconds = Math.floor((Date.now() - new Date(latestLocation.createdAt).getTime()) / 1000);
    if (ageSeconds < 60) return `${ageSeconds}s ago`;
    return `${Math.floor(ageSeconds / 60)}m ${ageSeconds % 60}s ago`;
  };

  const isStale = (order: ActiveOrder): boolean => {
    if (!order.latestLocation) return true;
    const ageSeconds = (Date.now() - new Date(order.latestLocation.createdAt).getTime()) / 1000;
    return ageSeconds > STALE_THRESHOLD_SECONDS;
  };

  const filterOptions: { label: string; value: StatusFilter; color: string }[] = [
    { label: 'All Active', value: 'ALL', color: 'bg-gray-100 text-gray-700 border-gray-200' },
    { label: 'Rider Assigned', value: 'RIDER_ASSIGNED', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    { label: 'Out for Delivery', value: 'OUT_FOR_DELIVERY', color: 'bg-sky-50 text-sky-700 border-sky-200' },
    { label: 'Stale Location', value: 'STALE', color: 'bg-red-50 text-red-700 border-red-200' },
  ];

  return (
    <DashboardLayout allowedRole="ADMIN">
      <div className="mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Live Tracking</h1>
            <p className="text-gray-500">Monitor all active deliveries in real-time.</p>
          </div>
          <button onClick={fetchLiveTracking} className="flex items-center justify-center px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-900/10">
            <RefreshCw className={`h-5 w-5 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {filterOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${statusFilter === opt.value ? opt.color + ' ring-2 ring-offset-1 ring-gray-300' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
            >
              {opt.label}
              {opt.value === 'STALE' && ` (${orders.filter(o => isStale(o)).length})`}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl p-3 border border-gray-100">
            <p className="text-xs text-gray-500 font-medium">Active Orders</p>
            <p className="text-xl font-bold text-gray-900">{orders.length}</p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-gray-100">
            <p className="text-xs text-gray-500 font-medium">Active Riders</p>
            <p className="text-xl font-bold text-emerald-600">{new Set(orders.filter(o => o.rider).map(o => o.rider!.id)).size}</p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-gray-100">
            <p className="text-xs text-gray-500 font-medium">Stale Locations</p>
            <p className="text-xl font-bold text-red-600">{orders.filter(o => isStale(o)).length}</p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-gray-100">
            <p className="text-xs text-gray-500 font-medium">Out for Delivery</p>
            <p className="text-xl font-bold text-sky-600">{orders.filter(o => o.status === 'OUT_FOR_DELIVERY').length}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ height: 'calc(100vh - 280px)' }}>
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <LiveTrackingMap
            orders={filteredOrders}
            selectedOrderId={selectedOrderId}
            onOrderClick={openOrderDetail}
          />
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-900">Active Orders ({filteredOrders.length})</h3>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <Truck className="h-12 w-12 mb-3" />
                <p className="text-sm font-medium">No active orders</p>
              </div>
            ) : (
              filteredOrders.map(order => {
                const stale = isStale(order);
                return (
                  <div
                    key={order.orderId}
                    onClick={() => openOrderDetail(order.orderId)}
                    className={`p-4 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors ${selectedOrderId === order.orderId ? 'bg-emerald-50 border-l-4 border-l-emerald-500' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-mono font-bold text-gray-900">#{order.orderId.slice(-8).toUpperCase()}</span>
                      {stale && (
                        <span className="flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-lg">
                          <AlertTriangle className="h-3 w-3" /> Stale
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                      <User className="h-3 w-3" /> {order.customer.name || 'Customer'}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                      <Store className="h-3 w-3" /> {order.store.name}
                    </div>
                    {order.rider && (
                      <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                        <Truck className="h-3 w-3" /> {order.rider.name || 'Rider'}
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-xs text-gray-400 mt-2">
                      <Clock className="h-3 w-3" /> Last ping: {getPingAge(order.latestLocation)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {selectedOrderId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-end z-50">
          <div className="bg-white h-full w-full max-w-md shadow-2xl overflow-y-auto">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-lg font-bold text-gray-900">Order Detail</h2>
              <button onClick={() => { setSelectedOrderId(null); setSelectedOrderDetail(null); }} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            {detailLoading ? (
              <div className="p-6 text-center text-gray-400">Loading...</div>
            ) : selectedOrderDetail ? (
              <div className="p-6 space-y-4">
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase mb-1">Order</p>
                  <p className="font-mono text-sm font-bold">#{selectedOrderDetail.order.id.slice(-8).toUpperCase()}</p>
                  <p className="text-xs text-gray-500">{selectedOrderDetail.order.status.replace(/_/g, ' ')}</p>
                </div>

                {selectedOrderDetail.tracking && (
                  <div className="bg-teal-50 border border-teal-100 rounded-xl p-4">
                    <p className="text-xs font-bold text-teal-700 uppercase mb-2">Tracking</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-xs text-gray-500">State</p>
                        <p className="font-bold text-gray-900">{selectedOrderDetail.tracking.trackingState?.replace(/_/g, ' ')}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">ETA</p>
                        <p className="font-bold text-gray-900">{selectedOrderDetail.tracking.etaMinutes ? `${selectedOrderDetail.tracking.etaMinutes} min` : 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Distance</p>
                        <p className="font-bold text-gray-900">{selectedOrderDetail.tracking.distanceKm ? `${selectedOrderDetail.tracking.distanceKm} km` : 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Last Ping</p>
                        <p className="font-bold text-gray-900">{selectedOrderDetail.tracking.lastPingAt ? new Date(selectedOrderDetail.tracking.lastPingAt).toLocaleTimeString() : 'Never'}</p>
                      </div>
                    </div>
                  </div>
                )}

                {selectedOrderDetail.store && (
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                    <p className="text-xs font-bold text-amber-700 uppercase mb-2">Store</p>
                    <p className="text-sm font-bold text-gray-900">{selectedOrderDetail.store.name}</p>
                    <p className="text-xs text-gray-500">{selectedOrderDetail.store.address}</p>
                    {selectedOrderDetail.store.latitude && (
                      <p className="text-xs text-gray-400 font-mono mt-1">
                        {selectedOrderDetail.store.latitude.toFixed(6)}, {selectedOrderDetail.store.longitude.toFixed(6)}
                      </p>
                    )}
                  </div>
                )}

                {selectedOrderDetail.customer && (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                    <p className="text-xs font-bold text-blue-700 uppercase mb-2">Customer</p>
                    <p className="text-sm font-bold text-gray-900">{selectedOrderDetail.customer.name || 'Unknown'}</p>
                    <p className="text-xs text-gray-500">{selectedOrderDetail.customer.phone || selectedOrderDetail.customer.email}</p>
                  </div>
                )}

                {selectedOrderDetail.rider && (
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                    <p className="text-xs font-bold text-emerald-700 uppercase mb-2">Rider</p>
                    <p className="text-sm font-bold text-gray-900">{selectedOrderDetail.rider.name || 'Unknown'}</p>
                    <p className="text-xs text-gray-500">{selectedOrderDetail.rider.phone || 'No phone'}</p>
                    {selectedOrderDetail.rider.latitude && (
                      <p className="text-xs text-gray-400 font-mono mt-1">
                        {selectedOrderDetail.rider.latitude.toFixed(6)}, {selectedOrderDetail.rider.longitude.toFixed(6)}
                      </p>
                    )}
                  </div>
                )}

                <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
                  <p className="text-xs font-bold text-gray-500 uppercase mb-2">Delivery</p>
                  {selectedOrderDetail.order.addressSnapshot ? (
                    <p className="text-sm text-gray-700">
                      {selectedOrderDetail.order.addressSnapshot.line1}
                      {selectedOrderDetail.order.addressSnapshot.city && `, ${selectedOrderDetail.order.addressSnapshot.city}`}
                      {selectedOrderDetail.order.addressSnapshot.pincode && ` - ${selectedOrderDetail.order.addressSnapshot.pincode}`}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-400">Address not available</p>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
