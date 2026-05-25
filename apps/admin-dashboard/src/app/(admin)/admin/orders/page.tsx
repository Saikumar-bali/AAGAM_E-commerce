'use client';

import React, { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { apiClient } from '@aagam/utils';
import { io } from 'socket.io-client';
import { playNotificationSound, requestNotificationPermission, sendBrowserNotification } from '@/utils/notifications';
import { ShoppingCart, DollarSign, Clock, CheckCircle, XCircle, Truck, Package, Search, Eye, Calendar, User, Store, Bike, X, RefreshCw, ChevronDown } from 'lucide-react';

interface OrderItem {
  id: string;
  quantity: number;
  price: number;
  product?: { name: string };
}

interface Order {
  id: string;
  status: 'PENDING' | 'CONFIRMED' | 'PICKING' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED';
  totalAmount: number;
  deliveryLat: number | null;
  deliveryLng: number | null;
  riderId: string | null;
  createdAt: string;
  addressSnapshot?: {
    recipientName?: string;
    phoneE164?: string;
    line1?: string;
    line2?: string;
    landmark?: string;
    city?: string;
    pincode?: string;
  } | null;
  customer?: { name: string | null; email: string | null; phone?: string | null };
  store?: { name: string; address?: string | null; latitude?: number | null; longitude?: number | null };
  items?: OrderItem[];
  rider?: { user?: { name: string | null } };
}

const statusOptions = ['PENDING', 'CONFIRMED', 'PICKING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'];

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [updatingOrder, setUpdatingOrder] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [trackingDetail, setTrackingDetail] = useState<any | null>(null);

  const getAddressText = (order: Order) => {
    const a = order.addressSnapshot;
    if (!a) return 'Address not set';
    const line = [a.line1, a.line2].filter(Boolean).join(', ');
    const locality = [a.landmark, a.city, a.pincode].filter(Boolean).join(', ');
    return [line, locality].filter(Boolean).join(' • ') || 'Address not set';
  };

  const openDeliveryMap = (order: Order) => {
    const hasDestination = typeof order.deliveryLat === 'number' && typeof order.deliveryLng === 'number';
    if (!hasDestination) return;
    const destination = `${order.deliveryLat},${order.deliveryLng}`;
    const hasStoreCoords = typeof order.store?.latitude === 'number' && typeof order.store?.longitude === 'number';
    const href = hasStoreCoords
      ? `https://www.google.com/maps/dir/?api=1&origin=${order.store?.latitude},${order.store?.longitude}&destination=${destination}&travelmode=driving`
      : `https://www.google.com/maps/search/?api=1&query=${destination}`;
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  const openTrackingRoute = () => {
    if (!trackingDetail || !selectedOrder) return;
    const storeLat = trackingDetail.store?.latitude;
    const storeLng = trackingDetail.store?.longitude;
    const endLat = selectedOrder.deliveryLat;
    const endLng = selectedOrder.deliveryLng;
    if (typeof endLat !== 'number' || typeof endLng !== 'number') return;
    const destination = `${endLat},${endLng}`;
    const hasOrigin = typeof storeLat === 'number' && typeof storeLng === 'number';
    const routePath = Array.isArray(trackingDetail.tracking?.routePath) ? trackingDetail.tracking.routePath : [];
    const waypoints = routePath.slice(1, 8).map((p: any) => `${p.latitude},${p.longitude}`).join('|');
    let href = hasOrigin
      ? `https://www.google.com/maps/dir/?api=1&origin=${storeLat},${storeLng}&destination=${destination}&travelmode=driving`
      : `https://www.google.com/maps/search/?api=1&query=${destination}`;
    if (hasOrigin && waypoints) href += `&waypoints=${encodeURIComponent(waypoints)}`;
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  const fetchOrders = async () => {
    try {
      const response = await apiClient.get('/orders');
      setOrders(response.data);
    } catch (err) {
      console.error('Failed to fetch orders', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrderTracking = async (orderId: string) => {
    try {
      const response = await apiClient.get(`/orders/${orderId}/tracking`);
      setTrackingDetail(response.data);
    } catch (err) {
      console.error('Failed to load order tracking detail', err);
      setTrackingDetail(null);
    }
  };

  useEffect(() => {
    requestNotificationPermission();
    fetchOrders();
    const s = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000');
    s.on('connect', () => s.emit('joinAdminOrders'));
    s.on('orderPlaced', (payload: any) => {
      playNotificationSound(0.6);
      sendBrowserNotification(`New Order — ${payload.paymentMethod}`, {
        body: `${payload.customer?.name || 'Customer'} ordered ${payload.itemCount} items for ₹${payload.grandTotal}`,
        icon: '/favicon.ico',
        tag: 'new-order',
      });
      setOrders((prev) => [{ id: payload.id, status: payload.status, totalAmount: payload.totalAmount, deliveryLat: null, deliveryLng: null, riderId: null, createdAt: payload.createdAt, customer: payload.customer, store: { name: payload.store?.name || '' }, items: [] }, ...prev]);
    });
    return () => s.disconnect();
  }, []);

  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      order.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.store?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'All' ? true : order.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalRevenue = orders.reduce((acc, o) => acc + o.totalAmount, 0);
  const pendingOrders = orders.filter((o) => o.status === 'PENDING').length;
  const deliveredOrders = orders.filter((o) => o.status === 'DELIVERED').length;

  const stats = [
    { label: 'Total Orders', value: orders.length, icon: ShoppingCart, color: 'bg-blue-500' },
    { label: 'Pending', value: pendingOrders, icon: Clock, color: 'bg-amber-500' },
    { label: 'Delivered', value: deliveredOrders, icon: CheckCircle, color: 'bg-emerald-500' },
    { label: 'Revenue', value: `₹${totalRevenue.toFixed(2)}`, icon: DollarSign, color: 'bg-purple-500' },
  ];

  const renderEtaSummary = () => {
    const tracking = trackingDetail?.tracking;
    if (!tracking) return 'ETA unavailable';
    if (tracking.etaStale) return 'ETA paused (stale rider location)';
    if (!tracking.etaMinutes) return 'ETA unavailable';
    return `ETA ${tracking.etaMinutes} min • ${tracking.etaConfidence || 'LOW'} confidence`;
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'PENDING': return { label: 'Pending', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: Clock };
      case 'CONFIRMED': return { label: 'Confirmed', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', icon: CheckCircle };
      case 'PICKING': return { label: 'Picking', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', icon: Package };
      case 'OUT_FOR_DELIVERY': return { label: 'Out for Delivery', bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', icon: Truck };
      case 'DELIVERED': return { label: 'Delivered', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: CheckCircle };
      case 'CANCELLED': return { label: 'Cancelled', bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: XCircle };
      default: return { label: status, bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200', icon: ShoppingCart };
    }
  };

  const handleStatusUpdate = async (newStatus: string) => {
    if (!selectedOrder) return;
    setUpdatingOrder(true);
    try {
      await apiClient.patch(`/orders/${selectedOrder.id}/status`, { status: newStatus });
      setSelectedOrder({ ...selectedOrder, status: newStatus as Order['status'] });
      setShowStatusModal(false);
      fetchOrders();
    } catch (err) {
      console.error('Failed to update status', err);
    } finally {
      setUpdatingOrder(false);
    }
  };

  return (
    <DashboardLayout allowedRole="ADMIN">
      <div className="mb-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Order Management</h1>
            <p className="text-gray-500">Track and manage all customer orders.</p>
          </div>
          <button onClick={fetchOrders} className="flex items-center justify-center px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-900/10">
            <RefreshCw className={`h-5 w-5 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh Orders
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {stats.map((stat, idx) => (
            <div key={idx} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 font-medium">{stat.label}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
                </div>
                <div className={`p-3 rounded-xl ${stat.color}`}><stat.icon className="h-6 w-6 text-white" /></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-50 bg-gray-50/50">
          <div className="flex flex-col lg:flex-row gap-4 items-center">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input type="text" placeholder="Search by order ID, store or customer..." className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500">
              <option value="All">All Status</option>
              {statusOptions.map((status) => <option key={status} value={status}>{getStatusConfig(status).label}</option>)}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead><tr className="bg-gray-50/50 border-b border-gray-100"><th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Order ID</th><th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Customer</th><th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Store</th><th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Amount</th><th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th><th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th><th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th></tr></thead>
            <tbody className="divide-y divide-gray-50">
              {filteredOrders.map((order) => {
                const statusConfig = getStatusConfig(order.status);
                return (
                  <tr key={order.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-6 py-4"><p className="text-sm font-mono font-bold text-gray-900">{order.id.substring(0, 8)}</p></td>
                    <td className="px-6 py-4"><div className="flex items-center"><div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 mr-3"><User className="h-4 w-4" /></div><p className="text-sm font-medium text-gray-900">{order.customer?.name || 'Unknown'}</p></div></td>
                    <td className="px-6 py-4"><div className="flex items-center text-sm text-gray-600"><Store className="h-4 w-4 mr-2 text-gray-400" />{order.store?.name || 'Unknown Store'}</div></td>
                    <td className="px-6 py-4"><div className="flex items-center text-sm font-bold text-gray-900"><span className="text-gray-400 mr-0.5">₹</span>{order.totalAmount.toFixed(2)}₹</div></td>
                    <td className="px-6 py-4"><span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold ${statusConfig.bg} ${statusConfig.text} border ${statusConfig.border}`}><statusConfig.icon className="h-3 w-3 mr-1.5" />{statusConfig.label}</span></td>
                    <td className="px-6 py-4"><div className="flex items-center text-sm text-gray-500"><Calendar className="h-4 w-4 mr-2 text-gray-400" />{new Date(order.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div></td>
                    <td className="px-6 py-4 text-right"><div className="flex justify-end space-x-1.5"><button onClick={() => { setSelectedOrder(order); fetchOrderTracking(order.id); }} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"><Eye className="h-4 w-4" /></button><button onClick={() => { setSelectedOrder(order); setShowStatusModal(true); }} className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"><ChevronDown className="h-4 w-4" /></button></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selectedOrder && !showStatusModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
              <div><h2 className="text-xl font-bold text-gray-900">Order Details</h2><p className="text-sm text-gray-500 font-mono">{selectedOrder.id}</p></div>
              <button onClick={() => setSelectedOrder(null)} className="p-2 hover:bg-gray-100 rounded-lg transition-all"><X className="h-5 w-5 text-gray-500" /></button>
            </div>
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                {(() => { const statusConfig = getStatusConfig(selectedOrder.status); return <span className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-bold ${statusConfig.bg} ${statusConfig.text} border ${statusConfig.border}`}><statusConfig.icon className="h-4 w-4 mr-2" />{statusConfig.label}</span>; })()}
                <div className="text-right"><p className="text-sm text-gray-500">Order Total</p><p className="text-2xl font-bold text-gray-900">₹{selectedOrder.totalAmount.toFixed(2)}</p></div>
              </div>

              <div className="grid grid-cols-2 gap-6 mb-6">
                <div className="bg-gray-50 rounded-xl p-4"><div className="flex items-center text-gray-500 mb-2"><User className="h-4 w-4 mr-2" /><p className="text-xs font-medium uppercase">Customer</p></div><p className="text-sm font-bold text-gray-900">{selectedOrder.customer?.name || 'Unknown'}</p><p className="text-xs text-gray-500">{selectedOrder.customer?.email}</p><p className="text-xs text-gray-500">{selectedOrder.customer?.phone || selectedOrder.addressSnapshot?.phoneE164 || 'Phone not set'}</p></div>
                <div className="bg-gray-50 rounded-xl p-4"><div className="flex items-center text-gray-500 mb-2"><Store className="h-4 w-4 mr-2" /><p className="text-xs font-medium uppercase">Store</p></div><p className="text-sm font-bold text-gray-900">{selectedOrder.store?.name}</p><p className="text-xs text-gray-500">{selectedOrder.store?.address || 'Store address not set'}</p></div>
              </div>

              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 mb-6">
                <div className="flex items-center justify-between mb-2"><p className="text-xs font-medium uppercase text-indigo-700">Delivery Location</p><button onClick={() => openDeliveryMap(selectedOrder)} disabled={typeof selectedOrder.deliveryLat !== 'number' || typeof selectedOrder.deliveryLng !== 'number'} className="text-xs font-bold text-indigo-700 disabled:text-gray-400">Open Route</button></div>
                <p className="text-sm font-semibold text-gray-900">{getAddressText(selectedOrder)}</p>
                <p className="text-xs text-gray-600 mt-1">{typeof selectedOrder.deliveryLat === 'number' && typeof selectedOrder.deliveryLng === 'number' ? `Lat ${selectedOrder.deliveryLat.toFixed(6)}, Lng ${selectedOrder.deliveryLng.toFixed(6)}` : 'Delivery coordinates not available'}</p>
              </div>

              <div className="bg-sky-50 border border-sky-100 rounded-xl p-4 mb-6">
                <div className="flex items-center justify-between mb-2"><p className="text-xs font-medium uppercase text-sky-700">Rider Trip History</p><button onClick={openTrackingRoute} className="text-xs font-bold text-sky-700">Open Blue Route</button></div>
                <p className="text-sm font-semibold text-gray-900">{trackingDetail?.tracking?.tripSummary?.distanceKm ?? 0} km • {trackingDetail?.tracking?.tripSummary?.durationMinutes ?? 'N/A'} min</p>
                <p className="text-xs text-gray-600 mt-1">GPS points: {trackingDetail?.tracking?.tripSummary?.points ?? 0}</p>
                <p className="text-xs font-semibold text-sky-800 mt-2">{renderEtaSummary()}</p>
              </div>

              {selectedOrder.rider && (<div className="bg-gray-50 rounded-xl p-4 mb-6"><div className="flex items-center text-gray-500 mb-2"><Bike className="h-4 w-4 mr-2" /><p className="text-xs font-medium uppercase">Assigned Rider</p></div><p className="text-sm font-bold text-gray-900">{selectedOrder.rider.user?.name || 'Unknown'}</p></div>)}

              <div className="mb-6">
                <p className="text-xs font-medium uppercase text-gray-500 mb-3">Order Items</p>
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-gray-50"><tr><th className="px-4 py-3 text-xs font-bold text-gray-500">Item</th><th className="px-4 py-3 text-xs font-bold text-gray-500 text-right">Qty</th><th className="px-4 py-3 text-xs font-bold text-gray-500 text-right">Price</th><th className="px-4 py-3 text-xs font-bold text-gray-500 text-right">Total</th></tr></thead>
                    <tbody className="divide-y divide-gray-100">{selectedOrder.items?.map((item) => <tr key={item.id}><td className="px-4 py-3 text-sm font-medium text-gray-900">{item.product?.name || 'Unknown'}</td><td className="px-4 py-3 text-sm text-gray-600 text-right">{item.quantity}</td><td className="px-4 py-3 text-sm text-gray-600 text-right">₹{item.price.toFixed(2)}</td><td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">₹{(item.quantity * item.price).toFixed(2)}</td></tr>)}</tbody>
                    <tfoot className="bg-gray-50"><tr><td colSpan={3} className="px-4 py-3 text-sm font-bold text-gray-900 text-right">Total</td><td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">₹{selectedOrder.totalAmount.toFixed(2)}</td></tr></tfoot>
                  </table>
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex gap-3 sticky bottom-0 bg-white"><button onClick={() => setSelectedOrder(null)} className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-all">Close</button><button onClick={() => setShowStatusModal(true)} className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all">Update Status</button></div>
          </div>
        </div>
      )}

      {showStatusModal && selectedOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between"><h2 className="text-xl font-bold text-gray-900">Update Order Status</h2><button onClick={() => setShowStatusModal(false)} className="p-2 hover:bg-gray-100 rounded-lg"><X className="h-5 w-5 text-gray-500" /></button></div>
            <div className="p-6">
              <p className="text-sm text-gray-500 mb-4">Order: {selectedOrder.id.substring(0, 8)}</p>
              <div className="space-y-2">
                {statusOptions.map((status) => {
                  const sc = getStatusConfig(status);
                  return (
                    <button key={status} onClick={() => handleStatusUpdate(status)} disabled={updatingOrder || selectedOrder.status === status} className={`w-full p-4 rounded-xl text-left flex items-center justify-between transition-all ${selectedOrder.status === status ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : `${sc.bg} ${sc.text} border ${sc.border} hover:shadow-md`}`}>
                      <div className="flex items-center"><sc.icon className="h-5 w-5 mr-3" /><span className="font-bold">{sc.label}</span></div>
                      {selectedOrder.status === status && <span className="text-xs">Current</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
