"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import {
  apiClient,
  normalizeOrderPricing,
  type OrderPricingItem,
} from "@aagam/utils";
import { formatINR } from "@/lib/currency";
import EmptyState from "@/components/customer/EmptyState";
import {
  Calendar,
  ChevronRight,
  Package,
  RefreshCw,
  Store,
  Clock,
  CheckCircle2,
  XCircle,
  Truck,
  ShoppingBag,
  Filter,
  Bike,
} from "lucide-react";

type OrderStatus =
  | "PENDING"
  | "PAYMENT_PENDING"
  | "PAYMENT_FAILED"
  | "CONFIRMED"
  | "PICKING"
  | "PACKED"
  | "RIDER_ASSIGNED"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED";
type OrderItem = OrderPricingItem & {
  id: string;
  product?: { name?: string | null; image?: string | null } | null;
};
type Order = Record<string, any> & {
  id: string;
  status: OrderStatus;
  currency: string;
  totalAmount: number;
  grandTotal?: number;
  createdAt: string;
  deliveryWindowStart?: string | null;
  deliveryWindowEnd?: string | null;
  store?: { name: string | null } | null;
  payment?: { method: "ONLINE" | "COD"; status: string } | null;
  items?: OrderItem[];
};

function deliveryWindow(order: Order) {
  if (!order.deliveryWindowStart || !order.deliveryWindowEnd) return null;
  const start = new Date(order.deliveryWindowStart);
  const end = new Date(order.deliveryWindowEnd);
  const date = start.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
  const time = `${start.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}–${end.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}`;
  return `${date} · ${time}`;
}

const statusConfig: Record<
  OrderStatus,
  { label: string; message: string; cls: string; icon: any; step: number }
> = {
  PENDING: {
    label: "Pending",
    message: "Waiting for store confirmation.",
    cls: "bg-amber-50 text-amber-700 border-amber-200",
    icon: Clock,
    step: 1,
  },
  PAYMENT_PENDING: {
    label: "Payment Pending",
    message: "Waiting for payment confirmation.",
    cls: "bg-amber-50 text-amber-700 border-amber-200",
    icon: Clock,
    step: 1,
  },
  PAYMENT_FAILED: {
    label: "Payment Failed",
    message: "Payment failed. Please retry checkout.",
    cls: "bg-red-50 text-red-700 border-red-200",
    icon: XCircle,
    step: 0,
  },
  CONFIRMED: {
    label: "Confirmed",
    message: "Store accepted your order.",
    cls: "bg-blue-50 text-blue-700 border-blue-200",
    icon: CheckCircle2,
    step: 2,
  },
  PICKING: {
    label: "Preparing",
    message: "Store is picking your items.",
    cls: "bg-indigo-50 text-indigo-700 border-indigo-200",
    icon: Package,
    step: 3,
  },
  PACKED: {
    label: "Ready for Rider",
    message: "Packed and waiting for rider pickup.",
    cls: "bg-violet-50 text-violet-700 border-violet-200",
    icon: Package,
    step: 4,
  },
  RIDER_ASSIGNED: {
    label: "Rider Assigned",
    message: "Rider assigned and heading to the store.",
    cls: "bg-purple-50 text-purple-700 border-purple-200",
    icon: Bike,
    step: 5,
  },
  OUT_FOR_DELIVERY: {
    label: "Out for Delivery",
    message: "Your order is on the way.",
    cls: "bg-cyan-50 text-cyan-700 border-cyan-200",
    icon: Truck,
    step: 6,
  },
  DELIVERED: {
    label: "Delivered",
    message: "Delivered successfully.",
    cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
    icon: CheckCircle2,
    step: 7,
  },
  CANCELLED: {
    label: "Cancelled",
    message: "This order was cancelled.",
    cls: "bg-red-50 text-red-700 border-red-200",
    icon: XCircle,
    step: -1,
  },
};
const filters = [
  { label: "All", value: "All" },
  { label: "Active", value: "Active" },
  { label: "Delivered", value: "DELIVERED" },
  { label: "Cancelled", value: "CANCELLED" },
];
const activeStatuses: OrderStatus[] = [
  "PENDING",
  "PAYMENT_PENDING",
  "CONFIRMED",
  "PICKING",
  "PACKED",
  "RIDER_ASSIGNED",
  "OUT_FOR_DELIVERY",
];

export default function CustomerOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("All");
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const fetchOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get("/orders/my");
      setOrders(Array.isArray(res.data) ? res.data : []);
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to load orders");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void fetchOrders();
  }, []);
  const cancelOrder = async (orderId: string) => {
    setCancellingId(orderId);
    try {
      await apiClient.patch(`/orders/my/${orderId}/cancel`);
      await fetchOrders();
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to cancel order");
    } finally {
      setCancellingId(null);
    }
  };
  const filteredOrders = useMemo(
    () =>
      statusFilter === "All"
        ? orders
        : statusFilter === "Active"
        ? orders.filter((order) => activeStatuses.includes(order.status))
        : orders.filter((order) => order.status === statusFilter),
    [orders, statusFilter]
  );
  const stats = useMemo(
    () => ({
      total: orders.length,
      totalSpent: orders.reduce(
        (sum, order) =>
          sum + normalizeOrderPricing(order, order.items || []).grandTotal,
        0
      ),
      delivered: orders.filter((order) => order.status === "DELIVERED").length,
      active: orders.filter((order) => activeStatuses.includes(order.status))
        .length,
    }),
    [orders]
  );

  return (
    <DashboardLayout allowedRole="CUSTOMER">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950">
              My Orders
            </h1>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Track rider assignment, pickup, live delivery and delivered proof.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/shop")}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700"
            >
              <ShoppingBag className="h-4 w-4" /> Shop
            </button>
            <button
              onClick={() => void fetchOrders()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />{" "}
              Refresh
            </button>
          </div>
        </div>
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">
            <XCircle className="h-4 w-4" /> {error}
          </div>
        )}
        {!loading && orders.length > 0 && (
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              {
                label: "Total Orders",
                value: stats.total,
                icon: Package,
                color: "bg-teal-100 text-teal-700",
              },
              {
                label: "Total Spent",
                value: formatINR(stats.totalSpent),
                icon: Store,
                color: "bg-amber-100 text-amber-700",
              },
              {
                label: "Delivered",
                value: stats.delivered,
                icon: CheckCircle2,
                color: "bg-emerald-100 text-emerald-700",
              },
              {
                label: "Active",
                value: stats.active,
                icon: Truck,
                color: "bg-violet-100 text-violet-700",
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-slate-100 bg-white p-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-500">
                      {stat.label}
                    </p>
                    <p className="mt-1 text-xl font-black text-slate-950">
                      {stat.value}
                    </p>
                  </div>
                  <div
                    className={`grid h-10 w-10 place-items-center rounded-xl ${stat.color}`}
                  >
                    <stat.icon className="h-5 w-5" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {!loading && orders.length > 0 && (
          <div className="mb-5 flex items-center gap-2 overflow-x-auto pb-1">
            <Filter className="h-4 w-4 shrink-0 text-slate-400" />
            {filters.map((filter) => (
              <button
                key={filter.value}
                onClick={() => setStatusFilter(filter.value)}
                className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-black ${
                  statusFilter === filter.value
                    ? "bg-slate-950 text-white"
                    : "border border-slate-200 bg-white text-slate-600"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        )}
        {loading && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-44 animate-pulse rounded-2xl bg-white"
              />
            ))}
          </div>
        )}
        {!loading && orders.length === 0 && (
          <EmptyState
            icon={ShoppingBag}
            title="No orders yet"
            description="Start shopping to see your orders here."
            action={{
              label: "Start Shopping",
              onClick: () => router.push("/shop"),
            }}
          />
        )}
        {!loading && filteredOrders.length === 0 && orders.length > 0 && (
          <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center">
            <Package className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            <p className="text-sm font-bold text-slate-500">
              No orders match this filter
            </p>
          </div>
        )}
        {!loading && filteredOrders.length > 0 && (
          <div className="space-y-3">
            {filteredOrders.map((order) => {
              const config = statusConfig[order.status] || statusConfig.PENDING;
              const amount = normalizeOrderPricing(
                order,
                order.items || []
              ).grandTotal;
              const Icon = config.icon;
              const isActive = activeStatuses.includes(order.status);
              return (
                <div
                  key={order.id}
                  className="cursor-pointer overflow-hidden rounded-2xl border border-slate-100 bg-white transition-all hover:shadow-md"
                  onClick={() => router.push(`/shop/orders/${order.id}`)}
                >
                  <div className={`h-1 ${config.cls.split(" ")[0]}`} />
                  <div className="p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex-1">
                        <div className="mb-2 flex items-center gap-2.5">
                          <span className="font-mono text-sm font-black text-slate-950">
                            #{order.id.slice(-8).toUpperCase()}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-black ${config.cls}`}
                          >
                            <Icon className="h-3 w-3" /> {config.label}
                          </span>
                        </div>
                        <p className="mb-2 text-xs font-bold text-slate-600">
                          {config.message}
                        </p>
                        {deliveryWindow(order) && <p className="mb-2 inline-flex rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800">Scheduled delivery · {deliveryWindow(order)}</p>}
                        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-500">
                          <span className="flex items-center gap-1">
                            <Store className="h-3.5 w-3.5" />
                            {order.store?.name || "Store"}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {new Date(order.createdAt).toLocaleDateString(
                              "en-IN",
                              {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              }
                            )}
                          </span>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-black ${
                              order.payment?.method === "COD"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-blue-100 text-blue-700"
                            }`}
                          >
                            {order.payment?.method === "COD"
                              ? "COD"
                              : "PREPAID"}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-lg font-black text-slate-950">
                            {formatINR(amount)}
                          </div>
                          {order.items && (
                            <div className="text-[11px] font-bold text-slate-400">
                              {order.items.length} item
                              {order.items.length !== 1 ? "s" : ""}
                            </div>
                          )}
                        </div>
                        <div
                          className={`grid h-8 w-8 place-items-center rounded-xl ${
                            isActive
                              ? "bg-teal-100 text-teal-600"
                              : "bg-slate-100 text-slate-400"
                          }`}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </div>
                      </div>
                    </div>
                    {isActive && (
                      <div className="mt-3 border-t border-slate-100 pt-3">
                        <div className="flex gap-1.5">
                          {[1, 2, 3, 4, 5, 6, 7].map((step) => (
                            <div
                              key={step}
                              className={`h-1.5 flex-1 rounded-full ${
                                step <= config.step
                                  ? "bg-teal-500"
                                  : "bg-slate-100"
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {["PENDING", "PAYMENT_PENDING", "CONFIRMED"].includes(
                      order.status
                    ) && (
                      <div className="mt-3">
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            void cancelOrder(order.id);
                          }}
                          disabled={cancellingId === order.id}
                          className="rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-black text-red-700 disabled:opacity-60"
                        >
                          {cancellingId === order.id
                            ? "Cancelling..."
                            : "Cancel order"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
