'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { apiClient } from '@aagam/utils';
import { createRealtimeSocket } from '@/lib/realtimeSocket';
import { formatINR } from '@/lib/currency';
import {
  ShoppingCart,
  Clock,
  DollarSign,
  RefreshCw,
  Download,
  Eye,
  EyeOff,
  Search,
  X,
  Filter,
  FileSpreadsheet,
  Wifi,
  WifiOff,
} from 'lucide-react';

interface SyncOrder {
  id: string;
  shortId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  customerName: string;
  customerPhone: string;
  addressLine1: string;
  addressLine2: string;
  addressCity: string;
  addressPincode: string;
  storeName: string;
  items: { productName: string; quantity: number; unitPrice: number; lineTotal: number }[];
  itemCount: number;
  itemsSummary: string;
  subtotal: number;
  deliveryFee: number;
  discountAmount: number;
  taxAmount: number;
  grandTotal: number;
  paymentMethod: string;
  paymentStatus: string;
  riderName: string;
  riderPhone: string;
}

const STATUS_OPTIONS = [
  'PENDING',
  'PAYMENT_PENDING',
  'PAYMENT_FAILED',
  'CONFIRMED',
  'PICKING',
  'PACKED',
  'RIDER_ASSIGNED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
] as const;

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string; label: string }> = {
  PENDING: { bg: '#fffbeb', text: '#b45309', border: '#fde68a', label: 'Pending' },
  PAYMENT_PENDING: { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa', label: 'Payment Pending' },
  PAYMENT_FAILED: { bg: '#fef2f2', text: '#dc2626', border: '#fecaca', label: 'Payment Failed' },
  CONFIRMED: { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe', label: 'Confirmed' },
  PICKING: { bg: '#faf5ff', text: '#7e22ce', border: '#e9d5ff', label: 'Picking' },
  PACKED: { bg: '#f5f3ff', text: '#6d28d9', border: '#ddd6fe', label: 'Packed' },
  RIDER_ASSIGNED: { bg: '#eef2ff', text: '#4338ca', border: '#c7d2fe', label: 'Rider Assigned' },
  OUT_FOR_DELIVERY: { bg: '#f0f9ff', text: '#0369a1', border: '#bae6fd', label: 'Out for Delivery' },
  DELIVERED: { bg: '#ecfdf5', text: '#059669', border: '#a7f3d0', label: 'Delivered' },
  CANCELLED: { bg: '#fef2f2', text: '#dc2626', border: '#fecaca', label: 'Cancelled' },
};

const PAYMENT_COLORS: Record<string, string> = {
  ONLINE: 'text-blue-700',
  COD: 'text-amber-700',
  SUBSCRIPTION_CASH_CREDIT: 'text-purple-700',
};

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    PENDING: 'FFFFFF00',
    PAYMENT_PENDING: 'FFFF9800',
    PAYMENT_FAILED: 'FFF44336',
    CONFIRMED: 'FF2196F3',
    PICKING: 'FF9C27B0',
    PACKED: 'FF9C27B0',
    RIDER_ASSIGNED: 'FF3F51B5',
    OUT_FOR_DELIVERY: 'FF03A9F4',
    DELIVERED: 'FF4CAF50',
    CANCELLED: 'FFF44336',
  };
  return colors[status] || 'FF757575';
}

function getStatusBgArgb(status: string): string {
  const colors: Record<string, string> = {
    PENDING: 'FFFFF8E1',
    PAYMENT_PENDING: 'FFFFF3E0',
    PAYMENT_FAILED: 'FFFFEBEE',
    CONFIRMED: 'FFE3F2FD',
    PICKING: 'FFF3E5F5',
    PACKED: 'FFF3E5F5',
    RIDER_ASSIGNED: 'FFE8EAF6',
    OUT_FOR_DELIVERY: 'FFE1F5FE',
    DELIVERED: 'FFE8F5E9',
    CANCELLED: 'FFFFEBEE',
  };
  return colors[status] || 'FFF5F5F5';
}

export default function ExcelReportPage() {
  const [orders, setOrders] = useState<SyncOrder[]>([]);
  const [newOrderIds, setNewOrderIds] = useState<Set<string>>(new Set());
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [connected, setConnected] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<SyncOrder | null>(null);

  const syncOrders = useCallback(async (silent = false) => {
    if (!silent) setSyncing(true);
    try {
      const since = lastSyncedAt || new Date(0).toISOString();
      const response = await apiClient.get('/orders/excel-sync', { params: { since } });
      const newOrders: SyncOrder[] = response.data;

      setOrders((prev) => {
        const map = new Map(prev.map((o) => [o.id, o]));
        for (const o of newOrders) {
          map.set(o.id, o);
        }
        return Array.from(map.values()).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      });

      if (newOrders.length > 0) {
        const maxUpdatedAt = newOrders.reduce((max, o) => {
          const t = new Date(o.updatedAt).getTime();
          return t > max ? t : max;
        }, 0);
        setLastSyncedAt(new Date(maxUpdatedAt).toISOString());
      }
    } catch (err) {
      console.error('Sync failed', err);
    } finally {
      setSyncing(false);
      setLoading(false);
    }
  }, [lastSyncedAt]);

  useEffect(() => {
    syncOrders();
    const s = createRealtimeSocket();
    s.on('connect', () => {
      s.emit('joinAdminOrders');
      setConnected(true);
    });
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', () => setConnected(false));

    s.on('orderPlaced', (payload: any) => {
      const mapped: SyncOrder = {
        id: payload.id,
        shortId: (payload.shortId || payload.id?.substring(0, 8) || '').toUpperCase(),
        status: payload.status || 'PENDING',
        createdAt: payload.createdAt || new Date().toISOString(),
        updatedAt: payload.createdAt || new Date().toISOString(),
        customerName: payload.customer?.name || 'Unknown',
        customerPhone: '',
        addressLine1: payload.delivery?.address || '',
        addressLine2: '',
        addressCity: payload.delivery?.city || '',
        addressPincode: '',
        storeName: payload.store?.name || '',
        items: [],
        itemCount: payload.itemCount || 0,
        itemsSummary: `${payload.itemCount || 0} items`,
        subtotal: payload.totalAmount || 0,
        deliveryFee: 0,
        discountAmount: 0,
        taxAmount: 0,
        grandTotal: payload.grandTotal || payload.totalAmount || 0,
        paymentMethod: payload.paymentMethod || 'UNKNOWN',
        paymentStatus: 'PENDING',
        riderName: '',
        riderPhone: '',
      };
      setOrders((prev) => [mapped, ...prev.filter((o) => o.id !== mapped.id)]);
      setNewOrderIds((prev) => new Set(prev).add(mapped.id));
    });

    s.on('orderStatusUpdated', (payload: any) => {
      const orderId = payload.order?.id || payload.id;
      const newStatus = payload.order?.status || payload.status;
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId ? { ...o, status: newStatus, updatedAt: new Date().toISOString() } : o
        )
      );
    });

    return () => {
      s.disconnect();
      setConnected(false);
    };
  }, []);

  useEffect(() => {
    const handleOnline = () => syncOrders(true);
    window.addEventListener('online', handleOnline);
    const interval = setInterval(() => syncOrders(true), 60000);
    return () => {
      window.removeEventListener('online', handleOnline);
      clearInterval(interval);
    };
  }, [syncOrders]);

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesSearch =
        !searchTerm ||
        order.shortId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.customerPhone.includes(searchTerm) ||
        order.storeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.id.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'All' || order.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [orders, searchTerm, statusFilter]);

  const stats = useMemo(() => {
    const total = orders.length;
    const pending = orders.filter((o) => o.status === 'PENDING').length;
    const delivered = orders.filter((o) => o.status === 'DELIVERED').length;
    const revenue = orders.filter((o) => o.status === 'DELIVERED').reduce((s, o) => s + o.grandTotal, 0);
    return { total, pending, delivered, revenue };
  }, [orders]);

  const markAsRead = (orderId: string) => {
    setNewOrderIds((prev) => {
      const next = new Set(prev);
      next.delete(orderId);
      return next;
    });
  };

  const markAllAsRead = () => setNewOrderIds(new Set());

  const generateExcel = async () => {
    setIsGenerating(true);
    try {
      const ExcelJSModule = await import('exceljs');
      const ExcelJS = ExcelJSModule.default;
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'AAGAAM';
      workbook.created = new Date();

      const ws = workbook.addWorksheet('Live Orders', {
        views: [{ state: 'frozen', ySplit: 1 }],
      });

      ws.columns = [
        { header: 'Order ID', key: 'orderId', width: 16 },
        { header: 'Date', key: 'date', width: 14 },
        { header: 'Time', key: 'time', width: 12 },
        { header: 'Customer', key: 'customer', width: 18 },
        { header: 'Phone', key: 'phone', width: 16 },
        { header: 'Address', key: 'address', width: 30 },
        { header: 'Items', key: 'items', width: 35 },
        { header: 'Subtotal', key: 'subtotal', width: 12 },
        { header: 'Delivery Fee', key: 'deliveryFee', width: 14 },
        { header: 'Discount', key: 'discount', width: 12 },
        { header: 'Tax', key: 'tax', width: 12 },
        { header: 'Grand Total', key: 'grandTotal', width: 14 },
        { header: 'Payment', key: 'payment', width: 12 },
        { header: 'Payment Status', key: 'paymentStatus', width: 16 },
        { header: 'Order Status', key: 'orderStatus', width: 18 },
        { header: 'Rider', key: 'rider', width: 16 },
        { header: 'Store', key: 'store', width: 18 },
        { header: 'Created At', key: 'createdAt', width: 20 },
        { header: 'Last Updated', key: 'updatedAt', width: 20 },
        { header: 'New/Old', key: 'isNew', width: 10 },
      ];

      const headerRow = ws.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0F172A' },
      };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

      const displayOrders = filteredOrders.length > 0 || searchTerm || statusFilter !== 'All'
        ? filteredOrders
        : orders;

      displayOrders.forEach((order) => {
        const dateObj = new Date(order.createdAt);
        const isNew = newOrderIds.has(order.id);
        const row = ws.addRow({
          orderId: order.shortId,
          date: dateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
          time: dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
          customer: order.customerName,
          phone: order.customerPhone,
          address: [order.addressLine1, order.addressLine2, order.addressCity, order.addressPincode]
            .filter(Boolean)
            .join(', '),
          items: order.itemsSummary,
          subtotal: order.subtotal,
          deliveryFee: order.deliveryFee,
          discount: order.discountAmount,
          tax: order.taxAmount,
          grandTotal: order.grandTotal,
          payment: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          orderStatus: STATUS_COLORS[order.status]?.label || order.status,
          rider: order.riderName || 'Unassigned',
          store: order.storeName,
          createdAt: dateObj.toLocaleString('en-IN'),
          updatedAt: new Date(order.updatedAt).toLocaleString('en-IN'),
          isNew: isNew ? 'NEW' : 'OLD',
        });

        if (isNew) {
          row.eachCell((cell) => {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFDCFCE7' },
            };
          });
        }

        const statusCell = row.getCell('orderStatus');
        const statusKey = order.status;
        statusCell.font = {
          bold: true,
          color: { argb: getStatusColor(statusKey) },
        };
        statusCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: getStatusBgArgb(statusKey) },
        };

        const isNewCell = row.getCell('isNew');
        if (isNew) {
          isNewCell.font = { bold: true, color: { argb: 'FF16A34A' } };
        } else {
          isNewCell.font = { color: { argb: 'FF9CA3AF' } };
        }

        const grandTotalCell = row.getCell('grandTotal');
        grandTotalCell.numFmt = '#,##0.00';

        const subtotalCell = row.getCell('subtotal');
        subtotalCell.numFmt = '#,##0.00';

        const deliveryFeeCell = row.getCell('deliveryFee');
        deliveryFeeCell.numFmt = '#,##0.00';

        const discountCell = row.getCell('discount');
        discountCell.numFmt = '#,##0.00';

        const taxCell = row.getCell('tax');
        taxCell.numFmt = '#,##0.00';
      });

      const itemsWs = workbook.addWorksheet('Order Items', {
        views: [{ state: 'frozen', ySplit: 1 }],
      });
      itemsWs.columns = [
        { header: 'Order ID', key: 'orderId', width: 16 },
        { header: 'Product', key: 'product', width: 25 },
        { header: 'Quantity', key: 'quantity', width: 10 },
        { header: 'Unit Price', key: 'unitPrice', width: 12 },
        { header: 'Line Total', key: 'lineTotal', width: 14 },
      ];

      const itemsHeaderRow = itemsWs.getRow(1);
      itemsHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      itemsHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };

      displayOrders.forEach((order) => {
        order.items.forEach((item) => {
          const row = itemsWs.addRow({
            orderId: order.shortId,
            product: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: item.lineTotal,
          });
          row.getCell('unitPrice').numFmt = '#,##0.00';
          row.getCell('lineTotal').numFmt = '#,##0.00';
        });
      });

      const summaryWs = workbook.addWorksheet('Daily Summary', {
        views: [{ state: 'frozen', ySplit: 1 }],
      });
      summaryWs.columns = [
        { header: 'Date', key: 'date', width: 14 },
        { header: 'Total Orders', key: 'totalOrders', width: 14 },
        { header: 'Delivered', key: 'delivered', width: 12 },
        { header: 'Cancelled', key: 'cancelled', width: 12 },
        { header: 'COD Orders', key: 'codOrders', width: 12 },
        { header: 'Online Orders', key: 'onlineOrders', width: 14 },
        { header: 'Revenue', key: 'revenue', width: 14 },
        { header: 'Delivery Fees', key: 'deliveryFees', width: 14 },
        { header: 'Discounts', key: 'discounts', width: 12 },
      ];

      const summaryHeaderRow = summaryWs.getRow(1);
      summaryHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      summaryHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };

      const byDate = new Map<string, SyncOrder[]>();
      displayOrders.forEach((o) => {
        const date = new Date(o.createdAt).toISOString().slice(0, 10);
        const arr = byDate.get(date) || [];
        arr.push(o);
        byDate.set(date, arr);
      });

      Array.from(byDate.entries())
        .sort(([a], [b]) => b.localeCompare(a))
        .forEach(([date, dayOrders]) => {
          const row = summaryWs.addRow({
            date,
            totalOrders: dayOrders.length,
            delivered: dayOrders.filter((o) => o.status === 'DELIVERED').length,
            cancelled: dayOrders.filter((o) => o.status === 'CANCELLED').length,
            codOrders: dayOrders.filter((o) => o.paymentMethod === 'COD').length,
            onlineOrders: dayOrders.filter((o) => o.paymentMethod === 'ONLINE').length,
            revenue: dayOrders.filter((o) => o.status === 'DELIVERED').reduce((s, o) => s + o.grandTotal, 0),
            deliveryFees: dayOrders.reduce((s, o) => s + o.deliveryFee, 0),
            discounts: dayOrders.reduce((s, o) => s + o.discountAmount, 0),
          });
          row.getCell('revenue').numFmt = '#,##0.00';
          row.getCell('deliveryFees').numFmt = '#,##0.00';
          row.getCell('discounts').numFmt = '#,##0.00';
        });

      const customersWs = workbook.addWorksheet('Customers', {
        views: [{ state: 'frozen', ySplit: 1 }],
      });
      customersWs.columns = [
        { header: 'Customer', key: 'name', width: 20 },
        { header: 'Phone', key: 'phone', width: 16 },
        { header: 'Orders', key: 'orderCount', width: 10 },
        { header: 'Total Spent', key: 'totalSpent', width: 14 },
        { header: 'Last Order', key: 'lastOrder', width: 20 },
      ];

      const customersHeaderRow = customersWs.getRow(1);
      customersHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      customersHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };

      const byCustomer = new Map<string, { name: string; phone: string; orders: SyncOrder[] }>();
      displayOrders.forEach((o) => {
        const key = o.customerPhone || o.id;
        const existing = byCustomer.get(key);
        if (existing) {
          existing.orders.push(o);
        } else {
          byCustomer.set(key, {
            name: o.customerName,
            phone: o.customerPhone,
            orders: [o],
          });
        }
      });

      Array.from(byCustomer.values())
        .sort((a, b) => b.orders.length - a.orders.length)
        .forEach(({ name, phone, orders: custOrders }) => {
          const sorted = custOrders.sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          const row = customersWs.addRow({
            name,
            phone,
            orderCount: custOrders.length,
            totalSpent: custOrders.filter((o) => o.status === 'DELIVERED').reduce((s, o) => s + o.grandTotal, 0),
            lastOrder: new Date(sorted[0].createdAt).toLocaleString('en-IN'),
          });
          row.getCell('totalSpent').numFmt = '#,##0.00';
        });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `AAGAAM_Orders_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Excel generation failed', err);
      alert('Failed to generate Excel. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <DashboardLayout allowedRole="ADMIN">
      <div className="mb-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">Orders Excel Report</h1>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                  connected
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}
              >
                {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                {connected ? 'Live' : 'Offline'}
              </span>
            </div>
            <p className="text-gray-500 mt-1">
              Real-time synced order report with Excel export.{' '}
              {lastSyncedAt && (
                <span className="text-xs text-gray-400">
                  Last sync: {new Date(lastSyncedAt).toLocaleTimeString('en-IN')}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => syncOrders()}
              disabled={syncing}
              className="flex items-center px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
              Sync Now
            </button>
            <button
              onClick={markAllAsRead}
              disabled={newOrderIds.size === 0}
              className="flex items-center px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 transition-all disabled:opacity-50"
            >
              <EyeOff className="h-4 w-4 mr-2" />
              Mark All Read ({newOrderIds.size})
            </button>
            <button
              onClick={generateExcel}
              disabled={isGenerating || orders.length === 0}
              className="flex items-center px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-900/10 disabled:opacity-50"
            >
              <Download className={`h-4 w-4 mr-2 ${isGenerating ? 'animate-bounce' : ''}`} />
              {isGenerating ? 'Generating...' : 'Download Excel'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'New Orders', value: newOrderIds.size, icon: Eye, color: 'bg-green-500' },
            { label: 'Total Orders', value: stats.total, icon: ShoppingCart, color: 'bg-blue-500' },
            { label: 'Pending', value: stats.pending, icon: Clock, color: 'bg-amber-500' },
            {
              label: 'Revenue',
              value: formatINR(stats.revenue),
              icon: DollarSign,
              color: 'bg-purple-500',
            },
          ].map((stat, idx) => (
            <div key={idx} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 font-medium">{stat.label}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
                </div>
                <div className={`p-3 rounded-xl ${stat.color}`}>
                  <stat.icon className="h-6 w-6 text-white" />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-50 bg-gray-50/50">
            <div className="flex flex-col lg:flex-row gap-4 items-center">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by order ID, customer, phone, store..."
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="All">All Status</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_COLORS[s]?.label || s}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Filter className="h-4 w-4" />
                {filteredOrders.length} of {orders.length} orders
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100">
                  <th className="px-4 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider w-8"></th>
                  <th className="px-4 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Order ID</th>
                  <th className="px-4 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Customer</th>
                  <th className="px-4 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Store</th>
                  <th className="px-4 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Items</th>
                  <th className="px-4 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-4 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Payment</th>
                  <th className="px-4 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Rider</th>
                  <th className="px-4 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-4 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr>
                    <td colSpan={11} className="px-6 py-12 text-center">
                      <RefreshCw className="h-8 w-8 text-gray-300 animate-spin mx-auto mb-3" />
                      <p className="text-sm text-gray-500">Loading orders...</p>
                    </td>
                  </tr>
                ) : filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-6 py-12 text-center">
                      <FileSpreadsheet className="h-12 w-12 text-gray-200 mx-auto mb-3" />
                      <p className="text-sm font-medium text-gray-500">No orders found</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {orders.length === 0 ? 'Click "Sync Now" to fetch orders' : 'Try adjusting your filters'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((order) => {
                    const sc = STATUS_COLORS[order.status] || STATUS_COLORS.PENDING;
                    const isNew = newOrderIds.has(order.id);
                    return (
                      <tr
                        key={order.id}
                        className={`transition-colors group ${
                          isNew ? 'bg-green-50/50' : 'hover:bg-gray-50'
                        }`}
                      >
                        <td className="px-4 py-4">
                          {isNew && (
                            <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-green-500 text-white text-[10px] font-black">
                              N
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <p className="text-sm font-mono font-bold text-gray-900">{order.shortId}</p>
                        </td>
                        <td className="px-4 py-4">
                          <p className="text-sm font-medium text-gray-900">{order.customerName}</p>
                          {order.customerPhone && (
                            <p className="text-xs text-gray-500">{order.customerPhone}</p>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <p className="text-sm text-gray-600">{order.storeName}</p>
                        </td>
                        <td className="px-4 py-4">
                          <p className="text-sm text-gray-600 max-w-[200px] truncate" title={order.itemsSummary}>
                            {order.itemsSummary}
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          <p className="text-sm font-bold text-gray-900">{formatINR(order.grandTotal)}</p>
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`text-xs font-bold ${PAYMENT_COLORS[order.paymentMethod] || 'text-gray-600'}`}
                          >
                            {order.paymentMethod}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold"
                            style={{ backgroundColor: sc.bg, color: sc.text, borderColor: sc.border, borderWidth: 1 }}
                          >
                            {sc.label}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <p className="text-sm text-gray-600">{order.riderName || 'Unassigned'}</p>
                        </td>
                        <td className="px-4 py-4">
                          <p className="text-sm text-gray-500">
                            {new Date(order.createdAt).toLocaleDateString('en-IN', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <div className="flex justify-end gap-1.5">
                            {isNew && (
                              <button
                                onClick={() => markAsRead(order.id)}
                                className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                title="Mark as read"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              onClick={() => setSelectedOrder(order)}
                              className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                              title="View details"
                            >
                              <Search className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selectedOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Order Details</h2>
                <p className="text-sm text-gray-500 font-mono">{selectedOrder.shortId}</p>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-all"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <span
                  className="inline-flex items-center px-4 py-2 rounded-full text-sm font-bold"
                  style={{
                    backgroundColor: STATUS_COLORS[selectedOrder.status]?.bg || '#f3f4f6',
                    color: STATUS_COLORS[selectedOrder.status]?.text || '#374151',
                    borderColor: STATUS_COLORS[selectedOrder.status]?.border || '#d1d5db',
                    borderWidth: 1,
                  }}
                >
                  {STATUS_COLORS[selectedOrder.status]?.label || selectedOrder.status}
                </span>
                <p className="text-2xl font-bold text-gray-900">{formatINR(selectedOrder.grandTotal)}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs font-medium uppercase text-gray-500 mb-2">Customer</p>
                  <p className="text-sm font-bold text-gray-900">{selectedOrder.customerName}</p>
                  <p className="text-xs text-gray-500">{selectedOrder.customerPhone}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs font-medium uppercase text-gray-500 mb-2">Store</p>
                  <p className="text-sm font-bold text-gray-900">{selectedOrder.storeName}</p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs font-medium uppercase text-gray-500 mb-2">Delivery Address</p>
                <p className="text-sm font-semibold text-gray-900">
                  {[selectedOrder.addressLine1, selectedOrder.addressLine2, selectedOrder.addressCity, selectedOrder.addressPincode]
                    .filter(Boolean)
                    .join(', ') || 'No address'}
                </p>
              </div>

              {selectedOrder.riderName && (
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs font-medium uppercase text-gray-500 mb-2">Rider</p>
                  <p className="text-sm font-bold text-gray-900">{selectedOrder.riderName}</p>
                </div>
              )}

              <div>
                <p className="text-xs font-medium uppercase text-gray-500 mb-3">Order Items</p>
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-xs font-bold text-gray-500">Product</th>
                        <th className="px-4 py-3 text-xs font-bold text-gray-500 text-right">Qty</th>
                        <th className="px-4 py-3 text-xs font-bold text-gray-500 text-right">Price</th>
                        <th className="px-4 py-3 text-xs font-bold text-gray-500 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {selectedOrder.items.map((item, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.productName}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 text-right">{item.quantity}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 text-right">
                            {formatINR(item.unitPrice)}
                          </td>
                          <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">
                            {formatINR(item.lineTotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50">
                      <tr>
                        <td colSpan={3} className="px-4 py-2 text-xs text-gray-500 text-right">Subtotal</td>
                        <td className="px-4 py-2 text-sm font-bold text-gray-900 text-right">
                          {formatINR(selectedOrder.subtotal)}
                        </td>
                      </tr>
                      <tr>
                        <td colSpan={3} className="px-4 py-2 text-xs text-gray-500 text-right">Delivery Fee</td>
                        <td className="px-4 py-2 text-sm text-gray-900 text-right">
                          {formatINR(selectedOrder.deliveryFee)}
                        </td>
                      </tr>
                      {selectedOrder.discountAmount > 0 && (
                        <tr>
                          <td colSpan={3} className="px-4 py-2 text-xs text-gray-500 text-right">Discount</td>
                          <td className="px-4 py-2 text-sm text-red-600 text-right">
                            -{formatINR(selectedOrder.discountAmount)}
                          </td>
                        </tr>
                      )}
                      {selectedOrder.taxAmount > 0 && (
                        <tr>
                          <td colSpan={3} className="px-4 py-2 text-xs text-gray-500 text-right">Tax</td>
                          <td className="px-4 py-2 text-sm text-gray-900 text-right">
                            {formatINR(selectedOrder.taxAmount)}
                          </td>
                        </tr>
                      )}
                      <tr className="border-t border-gray-200">
                        <td colSpan={3} className="px-4 py-3 text-sm font-bold text-gray-900 text-right">
                          Grand Total
                        </td>
                        <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">
                          {formatINR(selectedOrder.grandTotal)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs text-gray-400">
                <span>Payment: {selectedOrder.paymentMethod}</span>
                <span>Status: {selectedOrder.paymentStatus}</span>
                <span>Created: {new Date(selectedOrder.createdAt).toLocaleString('en-IN')}</span>
              </div>
            </div>
            <div className="p-6 border-t border-gray-100">
              <button
                onClick={() => setSelectedOrder(null)}
                className="w-full px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
