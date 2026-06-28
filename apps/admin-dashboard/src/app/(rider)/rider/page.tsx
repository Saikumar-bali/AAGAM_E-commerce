'use client';

import React, { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import DashboardLayout from '@/components/DashboardLayout';
import { apiClient } from '@aagam/utils';
import { playNotificationSound, requestNotificationPermission, sendBrowserNotification } from '@/utils/notifications';
import { 
  Truck, 
  MapPin, 
  Clock, 
  CheckCircle, 
  Package, 
  RefreshCw,
  DollarSign,
  Star,
  Bell,
  Menu,
  X,
  ArrowRight
} from 'lucide-react';
import { formatINR } from '@/lib/currency';

type OrderStatus = 
  | 'PENDING'
  | 'PAYMENT_PENDING'
  | 'CONFIRMED'
  | 'PICKING'
  | 'PACKED'
  | 'RIDER_ASSIGNED'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED';

type Order = {
  id: string;
  status: OrderStatus;
  grandTotal: number;
  createdAt: string;
  riderId?: string | null;
  customer?: { name: string; phone: string } | null;
  store?: { name: string; address: string; latitude?: number | null; longitude?: number | null } | null;
  payment?: { method: 'ONLINE' | 'COD'; status: string } | null;
  items?: Array<{ id: string; quantity: number; product?: { name: string; image?: string | null } | null }>;
};

type NearbyOrder = {
  orderId: string;
  grandTotal: number;
  store: { id: string; name: string | null };
  customer: { name: string; email: string };
  delivery: {
    latitude: number;
    longitude: number;
    address: string;
    city: string;
  };
};

const statusConfig: Record<OrderStatus, { label: string; cls: string; step: number }> = {
  PENDING: { label: 'Pending', cls: 'bg-amber-100 text-amber-700', step: 1 },
  PAYMENT_PENDING: { label: 'Payment Pending', cls: 'bg-orange-100 text-orange-700', step: 1 },
  CONFIRMED: { label: 'Confirmed', cls: 'bg-blue-100 text-blue-700', step: 2 },
  PICKING: { label: 'Picking', cls: 'bg-indigo-100 text-indigo-700', step: 3 },
  PACKED: { label: 'Packed', cls: 'bg-violet-100 text-violet-700', step: 3 },
  RIDER_ASSIGNED: { label: 'Assigned', cls: 'bg-purple-100 text-purple-700', step: 3 },
  OUT_FOR_DELIVERY: { label: 'On Way', cls: 'bg-cyan-100 text-cyan-700', step: 4 },
  DELIVERED: { label: 'Delivered', cls: 'bg-emerald-100 text-emerald-700', step: 5 },
  CANCELLED: { label: 'Cancelled', cls: 'bg-red-100 text-red-700', step: 0 },
};

export default function RiderDashboard() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [showNewOrderAlert, setShowNewOrderAlert] = useState(false);
  const [newOrderData, setNewOrderData] = useState<NearbyOrder | null>(null);
  const [locating, setLocating] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [riderLocation, setRiderLocation] = useState<{ lat: number; lng: number } | null>(null);
  const soundPlayedRef = useRef(false);

  const fetchOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      // Get recent orders (all zones) for riders to see
      const res = await apiClient.get('/orders/rider/queue');
      const orderList = res.data as Order[];
      setOrders(orderList);
      
      // Set active order (first non-delivered, non-cancelled)
      const active = orderList.find(o => o.status !== 'DELIVERED' && o.status !== 'CANCELLED');
      setActiveOrder(active || null);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  // Request notification permission
  useEffect(() => {
    requestNotificationPermission();
  }, []);

  // Socket.IO connection and zone joining
  useEffect(() => {
    const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
    const newSocket = io(SOCKET_URL, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });

    newSocket.on('connect', () => {
      console.log('[Rider] Socket connected');
      // Join general queue for ALL orders (fallback - guaranteed to receive)
      newSocket.emit('joinRidersQueue');
    });

    newSocket.on('connect_error', (err) => {
      console.error('[Rider] Socket connection error:', err);
    });

    newSocket.on('newOrderNearby', (data: NearbyOrder) => {
      console.log('[Rider] Received newOrderNearby:', data);
      setNewOrderData(data);
      setShowNewOrderAlert(true);

      // Play sound (only once per order)
      if (!soundPlayedRef.current) {
        playNotificationSound(0.6);
        soundPlayedRef.current = true;
      }

      // Browser notification
      sendBrowserNotification('New order!', {
        body: `Order: ${formatINR(data.grandTotal)} from ${data.store.name}`,
        icon: '/icon.png',
      });

      // Fetch latest orders
      fetchOrders();

      // Auto-hide alert
      setTimeout(() => {
        setShowNewOrderAlert(false);
        setNewOrderData(null);
      }, 8000);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, []);

  // Join zone when location is available
  const joinZone = (lat: number, lng: number) => {
    if (socket) {
      socket.emit('joinRiderZone', { latitude: lat, longitude: lng });
      setRiderLocation({ lat, lng });
      setIsOnline(true);
    }
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation not available');
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setCurrentLocation({ lat, lng });
        joinZone(lat, lng);
        setLocating(false);
      },
      () => {
        setError('Could not get location');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const handleAcceptOrder = async (orderId: string) => {
    console.log('[handleAcceptOrder] Attempting to accept order:', orderId);
    try {
      await apiClient.patch('/orders/assign', { orderId });
      fetchOrders();
      setShowNewOrderAlert(false);
      setNewOrderData(null);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to accept order');
    }
  };

  const handlePickOrder = async (orderId: string) => {
    console.log('[handlePickOrder] Attempting to pick order:', orderId);
    try {
      console.log('[handlePickOrder] Calling API...');
      // Use body-based endpoint for reliability
      await apiClient.patch('/orders/assign', { orderId });
      console.log('[handlePickOrder] Success, fetching orders...');
      fetchOrders();
    } catch (e: any) {
      console.error('[handlePickOrder] Error:', e);
      console.error('[handlePickOrder] Response:', e.response?.data);
      setError(e?.response?.data?.message || 'Failed to pick order');
    }
  };

  const handleStartDelivery = async (orderId: string) => {
    console.log('[handleStartDelivery] Attempting to start delivery for:', orderId);
    try {
      await apiClient.patch(`/orders/${orderId}/status`, { status: 'OUT_FOR_DELIVERY' });
      console.log('[handleStartDelivery] Success');
      fetchOrders();
    } catch (e: any) {
      console.error('[handleStartDelivery] Error:', e);
      setError(e?.response?.data?.message || 'Failed to start delivery');
    }
  };

  const handleDelivered = async (orderId: string) => {
    console.log('[handleDelivered] Attempting to mark delivered for:', orderId);
    try {
      await apiClient.patch(`/orders/${orderId}/status`, { status: 'DELIVERED' });
      console.log('[handleDelivered] Success');
      fetchOrders();
    } catch (e: any) {
      console.error('[handleDelivered] Error:', e);
      setError(e?.response?.data?.message || 'Failed to mark delivered');
    }
  };

  const completedToday = orders.filter(o => o.status === 'DELIVERED');
  const todayEarnings = completedToday.reduce((sum, o) => sum + (Number(o.grandTotal) || 0), 0);

  const currentConfig = activeOrder ? statusConfig[activeOrder.status] : null;

  return (
    <DashboardLayout allowedRole="RIDER">
      <div className="min-h-screen">
        {/* New Order Alert Toast */}
        {showNewOrderAlert && newOrderData && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-slide-down">
            <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4">
              <div className="p-3 bg-white/20 rounded-xl">
                <Bell className="h-6 w-6" />
              </div>
              <div>
                <p className="font-bold">New order nearby!</p>
                <p className="text-sm text-emerald-100">
                  {formatINR(newOrderData.grandTotal)} • {newOrderData.store.name}
                </p>
              </div>
              <button
                onClick={() => handleAcceptOrder(newOrderData.orderId)}
                className="ml-4 px-4 py-2 bg-white text-emerald-700 font-bold rounded-xl"
              >
                Accept
              </button>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Delivery Queue</h1>
            <p className="text-gray-500">
              {isOnline ? 'Ready for deliveries' : 'Go online to receive orders'}
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            {!isOnline ? (
              <button
                onClick={useCurrentLocation}
                disabled={locating}
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50"
              >
                {locating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                {locating ? 'Getting location...' : 'Go Online'}
              </button>
            ) : (
              <div className="flex items-center gap-2 bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-200">
                <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse"></div>
                <span className="text-sm font-semibold text-emerald-700">Online</span>
              </div>
            )}
            <button
              onClick={fetchOrders}
              disabled={loading}
              className="p-2.5 bg-white border border-gray-200 rounded-xl hover:bg-gray-50"
            >
              <RefreshCw className={`h-5 w-5 text-gray-600 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white p-4 rounded-2xl border border-gray-100">
            <p className="text-xs text-gray-500 font-medium">Today</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{completedToday.length}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-gray-100">
            <p className="text-xs text-gray-500 font-medium">Earnings</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{formatINR(todayEarnings)}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-gray-100">
            <p className="text-xs text-gray-500 font-medium">Queue</p>
            <p className="text-xl font-bold text-gray-900 mt-1">
              {orders.filter(o => o.status !== 'DELIVERED' && o.status !== 'CANCELLED').length}
            </p>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Active Order */}
          <div className="lg:col-span-2">
            {loading ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-6 animate-pulse">
                <div className="h-6 bg-gray-100 rounded w-32 mb-4"></div>
                <div className="h-20 bg-gray-100 rounded w-full"></div>
              </div>
            ) : activeOrder ? (
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="h-1.5 bg-emerald-500"></div>
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Active Delivery</span>
                      <h2 className="text-xl font-bold text-gray-900 mt-1">
                        #{activeOrder.id.slice(-8).toUpperCase()}
                      </h2>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${currentConfig?.cls}`}>
                      {currentConfig?.label}
                    </span>
                  </div>

                  {/* Pickup from Store */}
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Package className="h-4 w-4 text-amber-600" />
                      <span className="text-xs font-bold text-amber-700 uppercase">Pick from</span>
                    </div>
                    <p className="font-semibold text-gray-900">{activeOrder.store?.name || 'Store'}</p>
                    <p className="text-sm text-gray-600">{activeOrder.store?.address || 'Store address'}</p>
                    {activeOrder.store?.latitude && activeOrder.store?.longitude && (
                      <a 
                        href={`https://www.google.com/maps/dir/?api=1&destination=${activeOrder.store.latitude},${activeOrder.store.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 mt-2 text-sm text-emerald-600 font-medium"
                      >
                        Open in Maps ↗
                      </a>
                    )}
                  </div>

                  {/* Deliver to Customer */}
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <MapPin className="h-4 w-4 text-emerald-600" />
                      <span className="text-xs font-bold text-emerald-700 uppercase">Deliver to</span>
                    </div>
                    <p className="font-semibold text-gray-900">{activeOrder.customer?.name || 'Customer'}</p>
                    <p className="text-sm text-gray-600">{activeOrder.customer?.phone || 'Phone'}</p>
                  </div>

                  {/* Items to Pick */}
                  {activeOrder.items && activeOrder.items.length > 0 && (
                    <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 mb-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Package className="h-4 w-4 text-gray-600" />
                        <span className="text-xs font-bold text-gray-700 uppercase">Items to pick ({activeOrder.items.length})</span>
                      </div>
                      <div className="space-y-2">
                        {activeOrder.items.map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <div className="w-4 h-4 border border-gray-300 rounded flex-shrink-0" />
                              <span className="text-gray-700">{item.product?.name || 'Item'}</span>
                            </div>
                            <span className="font-medium text-gray-900">x{item.quantity}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Payment Info */}
                  {activeOrder.payment && (
                    <div className="flex items-center justify-between text-sm mb-4">
                      <span className="text-gray-500">Payment</span>
                      <span className={`font-bold px-2 py-0.5 rounded ${
                        activeOrder.payment.method === 'COD' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {activeOrder.payment.method === 'COD' ? 'COD' : 'Online'}
                      </span>
                    </div>
                  )}

                  {/* Progress */}
                  {activeOrder.status !== 'DELIVERED' && currentConfig && (
                    <div className="mb-4">
                      <div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map((step) => (
                          <div
                            key={step}
                            className={`h-2 flex-1 rounded-full ${
                              step <= currentConfig.step ? 'bg-emerald-500' : 'bg-gray-200'
                            }`}
                          />
                        ))}
                      </div>
                      <div className="flex justify-between mt-2 text-xs text-gray-400">
                        <span>Picked</span>
                        <span>Loading</span>
                        <span>Transit</span>
                        <span>Done</span>
                      </div>
                    </div>
                  )}

                  {/* Instruction */}
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-4">
                    <p className="text-sm text-blue-800">
                      {activeOrder.status === 'RIDER_ASSIGNED' && '🏪 Head to the store, pick up the order, then tap "Start Delivery"'}
                      {activeOrder.status === 'OUT_FOR_DELIVERY' && '📍 Reach delivery address, hand items to customer, tap "Delivered"'}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3">
                    {activeOrder.status === 'RIDER_ASSIGNED' && (
                      <button 
                        onClick={() => handleStartDelivery(activeOrder.id)}
                        className="flex-1 bg-indigo-600 text-white py-4 rounded-xl font-bold hover:bg-indigo-700 transition-colors"
                      >
                        🚚 Start Delivery
                      </button>
                    )}
                    {activeOrder.status === 'OUT_FOR_DELIVERY' && (
                      <button 
                        onClick={() => handleDelivered(activeOrder.id)}
                        className="flex-1 bg-emerald-600 text-white py-4 rounded-xl font-bold hover:bg-emerald-700 transition-colors"
                      >
                        ✅ Mark Delivered
                      </button>
                    )}
                  </div>

                  {/* Total */}
                  <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-center">
                    <span className="text-gray-500">Total to Collect</span>
                    <span className="text-2xl font-bold text-gray-900">{formatINR(activeOrder.grandTotal)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-12 text-center">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Truck className="h-8 w-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">No active orders</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Go online to start receiving delivery requests
                </p>
              </div>
            )}

            {/* Queue Orders - Available to pick */}
            {orders.length > 0 && (
              <div className="mt-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Available Orders</h3>
                <div className="space-y-3">
                  {orders.slice(0, 10).map((order) => {
                    const config = statusConfig[order.status];
                    const isAvailable = order.status === 'CONFIRMED' && !order.riderId;
                    return (
                      <div key={order.id} className={`bg-white border rounded-xl p-4 flex items-center justify-between ${
                        activeOrder?.id === order.id ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-gray-100'
                      }`}>
                        <div className="flex items-center flex-1">
                          <div className={`p-2 rounded-lg ${
                            order.status === 'DELIVERED' ? 'bg-emerald-100' : 
                            order.status === 'PICKING' || order.status === 'OUT_FOR_DELIVERY' ? 'bg-indigo-100' : 'bg-gray-100'
                          }`}>
                            {order.status === 'DELIVERED' ? (
                              <CheckCircle className="h-5 w-5 text-emerald-600" />
                            ) : order.status === 'PICKING' || order.status === 'OUT_FOR_DELIVERY' ? (
                              <Package className="h-5 w-5 text-indigo-600" />
                            ) : (
                              <Clock className="h-5 w-5 text-gray-500" />
                            )}
                          </div>
                          <div className="ml-3 flex-1">
                            <p className="text-sm font-bold text-gray-900">#{order.id.slice(-8).toUpperCase()}</p>
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              <span>{order.store?.name}</span>
                              <span>•</span>
                              <span>{new Date(order.createdAt).toLocaleString('en-IN')}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="font-bold text-gray-900">{formatINR(order.grandTotal)}</p>
                            <p className={`text-xs font-semibold ${config.cls.split(' ')[1]} ${config.cls.split(' ')[0].replace('bg-', 'text-')}`}>
                              {config.label}
                            </p>
                          </div>
                          {isAvailable && (
                            <button
                              onClick={() => handlePickOrder(order.id)}
                              className="px-4 py-2 bg-emerald-600 text-white text-sm font-bold rounded-lg hover:bg-emerald-700"
                            >
                              Pick
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Location Info */}
            {currentLocation && (
              <div className="bg-white p-4 rounded-2xl border border-gray-100">
                <p className="text-xs text-gray-500 font-medium mb-2">Current Zone</p>
                <p className="font-mono text-sm text-gray-900">
                  {currentLocation.lat.toFixed(4)}, {currentLocation.lng.toFixed(4)}
                </p>
              </div>
            )}

            {/* Performance */}
            <div className="bg-white p-5 rounded-2xl border border-gray-100">
              <h3 className="text-gray-900 font-bold mb-4">Performance</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-500">Rating</span>
                    <span className="font-bold">4.9 ★</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-yellow-400 w-[98%]"></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-500">Acceptance</span>
                    <span className="font-bold">92%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 w-[92%]"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}