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
  ArrowLeft,
} from "lucide-react";

type OrderStatus =
  | "PENDING"
  | "PAYMENT_PENDING"
  | "PAYMENT_FAILED"
  | "CONFIRMED"
  | "PICKING"
  | "PACKED"
  | "STORE_DELIVERING"
  | "STORE_DELIVERED"
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
  storeDelivery?: boolean;
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
    label: "Ready for Pickup",
    message: "Packed and ready for delivery.",
    cls: "bg-violet-50 text-violet-700 border-violet-200",
    icon: Package,
    step: 4,
  },
  STORE_DELIVERING: {
    label: "Store Delivering",
    message: "Store partner is delivering your order directly.",
    cls: "bg-orange-50 text-orange-700 border-orange-200",
    icon: Store,
    step: 6,
  },
  STORE_DELIVERED: {
    label: "Delivered by Store",
    message: "Delivered directly by your store partner.",
    cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
    icon: CheckCircle2,
    step: 7,
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
  "STORE_DELIVERING",
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
        : statusFilter === "DELIVERED"
        ? orders.filter((order) => order.status === "DELIVERED" || order.status === "STORE_DELIVERED")
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
      delivered: orders.filter((order) => order.status === "DELIVERED" || order.status === "STORE_DELIVERED").length,
      active: orders.filter((order) => activeStatuses.includes(order.status))
        .length,
    }),
    [orders]
  );

  return (
    <DashboardLayout allowedRole="CUSTOMER">
      <div className="mx-auto max-w-5xl">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/shop')} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <p className="enterprise-kicker">Orders</p>
              <h1 className="mt-1 text-lg font-semibold text-slate-950">
                My orders
              </h1>
              <p className="mt-0.5 text-xs text-slate-500">
                Track rider assignment, pickup, live delivery and delivered proof.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/shop")}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
            >
              <ShoppingBag className="h-4 w-4" /> Shop
            </button>
            <button
              onClick={() => void fetchOrders()}
              disabled={loading}
              className="enterprise-button"
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />{" "}
              Refresh
            </button>
          </div>
        </div>
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
            <XCircle className="h-4 w-4" /> {error}
          </div>
        )}
        {!loading && orders.length > 0 && (
          <div className="mb-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
            {[
              {
                label: "Total orders",
                value: stats.total,
                icon: Package,
                color: "bg-teal-50 text-teal-700",
              },
              {
                label: "Total spent",
                value: formatINR(stats.totalSpent),
                icon: Store,
                color: "bg-amber-50 text-amber-700",
              },
              {
                label: "Delivered",
                value: stats.delivered,
                icon: CheckCircle2,
                color: "bg-emerald-50 text-emerald-700",
              },
              {
                label: "Active",
                value: stats.active,
                icon: Truck,
                color: "bg-violet-50 text-violet-700",
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="enterprise-card p-3 sm:p-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      {stat.label}
                    </p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-slate-950">
                      {stat.value}
                    </p>
                  </div>
                  <div
                    className={`grid h-8 w-8 place-items-center rounded-md ${stat.color}`}
                  >
                    <stat.icon className="h-4 w-4" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {!loading && orders.length > 0 && (
          <div className="mb-4 flex items-center gap-1.5 overflow-x-auto pb-1">
            {filters.map((filter) => (
              <button
                key={filter.value}
                onClick={() => setStatusFilter(filter.value)}
                className={`shrink-0 rounded-md px-2.5 py-1.5 text-[11px] font-medium ${
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
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-40 animate-pulse rounded-xl bg-white"
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
          <div className="rounded-xl border border-slate-100 bg-white p-8 text-center">
            <Package className="mx-auto mb-3 h-8 w-8 text-slate-300" />
            <p className="text-sm font-medium text-slate-500">
              No orders match this filter
            </p>
          </div>
        )}
        {!loading && filteredOrders.length > 0 && (
          <div className="space-y-2">
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
                  className="cursor-pointer overflow-hidden rounded-xl border border-slate-100 bg-white transition-all hover:border-slate-200"
                  onClick={() => router.push(`/shop/orders/${order.id}`)}
                >
                  <div className={`h-0.5 ${config.cls.split(" ")[0]}`} />
                  <div className="p-3 sm:p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex-1">
                        <div className="mb-1.5 flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-slate-950">
                            #{order.id.slice(-8).toUpperCase()}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${config.cls}`}
                          >
                            <Icon className="h-3 w-3" /> {config.label}
                          </span>
                          {(order.storeDelivery || order.status === "STORE_DELIVERING" || order.status === "STORE_DELIVERED") && (
                            <span className="inline-flex items-center gap-1 rounded-md border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700">
                              <Store className="h-3 w-3" /> Store Delivery
                            </span>
                          )}
                        </div>
                        <p className="mb-1.5 text-[11px] text-slate-600">
                          {config.message}
                        </p>
                        {deliveryWindow(order) && <p className="mb-1.5 inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-800">Scheduled delivery · {deliveryWindow(order)}</p>}
                        <div className="flex flex-wrap items-center gap-2.5 text-[11px] text-slate-500">
                          <span className="flex items-center gap-1">
                            <Store className="h-3 w-3" />
                            {order.store?.name || "Store"}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
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
                            className={`rounded-sm px-1.5 py-0.5 text-[10px] font-semibold ${
                              order.payment?.method === "COD"
                                ? "bg-amber-50 text-amber-700"
                                : "bg-blue-50 text-blue-700"
                            }`}
                          >
                            {order.payment?.method === "COD"
                              ? "COD"
                              : "PREPAID"}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <div className="text-sm font-semibold tabular-nums text-slate-950">
                            {formatINR(amount)}
                          </div>
                          {order.items && (
                            <div className="text-[10px] text-slate-400">
                              {order.items.length} item
                              {order.items.length !== 1 ? "s" : ""}
                            </div>
                          )}
                        </div>
                        <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
                      </div>
                    </div>
                    {isActive && (
                      <div className="mt-2.5 border-t border-slate-100 pt-2.5">
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5, 6, 7].map((step) => (
                            <div
                              key={step}
                              className={`h-1 flex-1 rounded-full ${
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
                      <div className="mt-2.5">
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            void cancelOrder(order.id);
                          }}
                          disabled={cancellingId === order.id}
                          className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-700 disabled:opacity-60"
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
