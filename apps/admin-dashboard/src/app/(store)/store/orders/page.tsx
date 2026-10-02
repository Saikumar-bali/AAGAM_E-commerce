"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { apiClient } from "@aagam/utils";
import {
  ChevronDown,
  ClipboardList,
  Clock,
  Filter,
  Package,
  CheckCircle,
  ShoppingCart,
  User,
  XCircle,
} from "lucide-react";
import {
  EmptyState,
  ResultsNote,
  SearchField,
  SegmentedControl,
} from "@/components/store/OpsControls";
import {
  KpiStrip,
  PageHeader,
  RefreshButton,
} from "@/components/store/OpsSummary";

type OrderItem = {
  id: string;
  quantity: number;
  product?: { name: string; image: string | null } | null;
};
type Payment = { id: string; status: string; method: string; amountPaise?: number | null };
type RiderInfo = { id: string; user: { name: string } };
type ProductOption = {
  id: string;
  name: string;
  price: number;
  availability?: { availableQty?: number };
};
type Order = {
  id: string;
  status: string;
  grandTotal: number;
  createdAt: string;
  storeDelivery?: boolean;
  deliveryWindowStart?: string | null;
  deliveryWindowEnd?: string | null;
  orderSource?: string | null;
  customer?: { name: string; email: string; phone?: string } | null;
  items?: OrderItem[];
  payment?: Payment | null;
  rider?: RiderInfo | null;
  subscriptionId?: string | null;
  subscriptionSequence?: number | null;
  subscription?: { id: string; planVersion?: { pricePaise?: number | null } } | null;
};

type GroupId = "action" | "progress" | "rider" | "done" | "cancelled";
type TypeFilter = "all" | "subscription" | "single";
type SortId = "smart" | "newest" | "scheduled";
type SectionId = "action" | "today" | "tomorrow" | "later" | "unscheduled";

const GROUPS: Array<{ id: GroupId; label: string; statuses: string[] }> = [
  { id: "action", label: "Needs action", statuses: ["PENDING", "PAYMENT_PENDING"] },
  {
    id: "progress",
    label: "In progress",
    statuses: ["CONFIRMED", "PICKING", "PACKED"],
  },
  {
    id: "rider",
    label: "With rider",
    statuses: ["RIDER_ASSIGNED", "OUT_FOR_DELIVERY", "STORE_DELIVERING"],
  },
  { id: "done", label: "Done", statuses: ["DELIVERED", "STORE_DELIVERED"] },
  { id: "cancelled", label: "Cancelled", statuses: ["CANCELLED"] },
];

const SECTION_META: Array<{ id: SectionId; title: string; hint: string }> = [
  { id: "action", title: "Needs action now", hint: "Accept or reject before the window opens." },
  { id: "today", title: "Scheduled today", hint: "Preparation opens two hours before the window." },
  { id: "tomorrow", title: "Scheduled tomorrow", hint: "Plan stock and picking the night before." },
  { id: "later", title: "Scheduled later", hint: "Confirmed subscriptions further out." },
  { id: "unscheduled", title: "Unscheduled & past", hint: "One-time orders and windows that have closed." },
];

/** YYYY-MM-DD of an instant in the store's timezone (Asia/Kolkata). */
function dayKeyOf(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function shiftDay(key: string, days: number) {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function scheduledWindow(order: Order) {
  if (!order.deliveryWindowStart || !order.deliveryWindowEnd) return null;
  const start = new Date(order.deliveryWindowStart);
  const end = new Date(order.deliveryWindowEnd);
  const date = start.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  });
  const time = `${start.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  })}–${end.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  })}`;
  return `${date} · ${time}`;
}

const statusConfig: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  PENDING: { label: "New order", cls: "bg-amber-100 text-amber-800", icon: Clock },
  PAYMENT_PENDING: { label: "Payment pending", cls: "bg-orange-100 text-orange-800", icon: Clock },
  CONFIRMED: { label: "Accepted", cls: "bg-blue-100 text-blue-800", icon: CheckCircle },
  PICKING: { label: "Preparing", cls: "bg-indigo-100 text-indigo-800", icon: Package },
  PACKED: { label: "Ready for pickup", cls: "bg-violet-100 text-violet-800", icon: Package },
  STORE_DELIVERING: { label: "Store delivering", cls: "bg-orange-100 text-orange-800", icon: TruckIcon },
  STORE_DELIVERED: { label: "Store delivered", cls: "bg-emerald-100 text-emerald-800", icon: CheckCircle },
  RIDER_ASSIGNED: { label: "Rider assigned", cls: "bg-purple-100 text-purple-800", icon: User },
  OUT_FOR_DELIVERY: { label: "Out for delivery", cls: "bg-cyan-100 text-cyan-800", icon: TruckIcon },
  DELIVERED: { label: "Delivered", cls: "bg-emerald-100 text-emerald-800", icon: CheckCircle },
  CANCELLED: { label: "Cancelled", cls: "bg-red-100 text-red-700", icon: XCircle },
};

function TruckIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M10 17h4V5H2v12h3" />
      <path d="M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5v8h1" />
      <circle cx="7.5" cy="17.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
    </svg>
  );
}

type StoreAction = { status: string; label: string };
const STORE_ACTIONS: Record<string, StoreAction[]> = {
  PENDING: [
    { status: "CONFIRMED", label: "Accept order" },
    { status: "CANCELLED", label: "Reject" },
  ],
  PAYMENT_PENDING: [
    { status: "CONFIRMED", label: "Accept order" },
    { status: "CANCELLED", label: "Reject" },
  ],
  CONFIRMED: [
    { status: "PICKING", label: "Start preparing" },
    { status: "PACKED", label: "Ready for pickup" },
    { status: "CANCELLED", label: "Cancel" },
  ],
  PICKING: [
    { status: "PACKED", label: "Ready for pickup" },
    { status: "CANCELLED", label: "Cancel" },
  ],
  PACKED: [{ status: "STORE_DELIVERING", label: "Deliver with store staff" }],
  STORE_DELIVERING: [{ status: "STORE_DELIVERED", label: "Mark as delivered" }],
};

const editableItemStates = ["PENDING", "PAYMENT_PENDING", "CONFIRMED", "PICKING"];

function groupOf(status: string): GroupId {
  const match = GROUPS.find((group) => group.statuses.includes(status));
  return match ? match.id : "progress";
}

function sectionOf(order: Order, todayKey: string): SectionId {
  if (order.status === "PENDING" || order.status === "PAYMENT_PENDING") return "action";
  if (!order.deliveryWindowStart) return "unscheduled";
  const key = dayKeyOf(order.deliveryWindowStart);
  if (key === todayKey) return "today";
  if (key === shiftDay(todayKey, 1)) return "tomorrow";
  if (key > shiftDay(todayKey, 1)) return "later";
  return "unscheduled";
}

function orderAmount(order: Order) {
  if (order.payment?.method === "COD" && order.payment.amountPaise) {
    return order.payment.amountPaise / 100;
  }
  if (order.subscription?.planVersion?.pricePaise) {
    return order.subscription.planVersion.pricePaise / 100;
  }
  return order.grandTotal;
}

const PAGE_STEP = 20;

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const [substitutes, setSubstitutes] = useState<Record<string, ProductOption[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [groupFilter, setGroupFilter] = useState<GroupId | "all">("all");
  const [sort, setSort] = useState<SortId>("smart");
  const [shown, setShown] = useState<Record<string, number>>({});

  const fetchOrders = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "refresh") setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get("/orders/store");
      setOrders(Array.isArray(res.data) ? res.data : []);
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to load orders");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchOrders("initial");
  }, [fetchOrders]);

  const updateStatus = async (orderId: string, status: string) => {
    setActionLoading(`${orderId}-${status}`);
    setActionErrors((prev) => ({ ...prev, [orderId]: "" }));
    try {
      if (status === "PACKED") {
        await apiClient.patch(`/orders/store/${orderId}/ready`);
      } else if (status === "STORE_DELIVERING") {
        await apiClient.post(`/orders/store/${orderId}/store-delivery/start`);
      } else if (status === "STORE_DELIVERED") {
        await apiClient.post(`/orders/store/${orderId}/store-delivery/complete`);
      } else {
        await apiClient.patch(`/orders/${orderId}/status`, { status });
      }
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status } : o)));
    } catch (e: any) {
      setActionErrors((prev) => ({
        ...prev,
        [orderId]: e?.response?.data?.message || `Failed to update status to ${status}`,
      }));
    } finally {
      setActionLoading(null);
    }
  };

  const markUnavailable = async (orderId: string, itemId: string) => {
    setActionLoading(`${itemId}-unavailable`);
    try {
      await apiClient.patch(`/orders/store/${orderId}/items/${itemId}/unavailable`, {
        reason: "Store marked item unavailable",
      });
      await fetchOrders("refresh");
    } catch (e: any) {
      setActionErrors((prev) => ({
        ...prev,
        [orderId]: e?.response?.data?.message || "Could not mark item unavailable",
      }));
    } finally {
      setActionLoading(null);
    }
  };

  const loadSubstitutes = async (orderId: string, itemId: string) => {
    setActionLoading(`${itemId}-substitutes`);
    try {
      const res = await apiClient.get(`/orders/store/${orderId}/items/${itemId}/substitutes`);
      setSubstitutes((prev) => ({
        ...prev,
        [itemId]: Array.isArray(res.data) ? res.data : [],
      }));
    } catch (e: any) {
      setActionErrors((prev) => ({
        ...prev,
        [orderId]: e?.response?.data?.message || "Could not load substitutes",
      }));
    } finally {
      setActionLoading(null);
    }
  };

  const applySubstitute = async (orderId: string, itemId: string, productId: string) => {
    setActionLoading(`${itemId}-${productId}`);
    try {
      await apiClient.patch(`/orders/store/${orderId}/items/${itemId}/substitute`, { productId });
      setSubstitutes((prev) => ({ ...prev, [itemId]: [] }));
      await fetchOrders("refresh");
    } catch (e: any) {
      setActionErrors((prev) => ({
        ...prev,
        [orderId]: e?.response?.data?.message || "Could not apply substitute",
      }));
    } finally {
      setActionLoading(null);
    }
  };

  const todayKey = dayKeyOf(new Date());

  const searched = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return orders;
    return orders.filter((order) => {
      const haystack = [
        order.id.slice(-8).toUpperCase(),
        order.customer?.name || "",
        order.customer?.phone || "",
        order.customer?.email || "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [orders, search]);

  const typed = useMemo(() => {
    if (typeFilter === "all") return searched;
    return searched.filter((order) => {
      const isSubscription = Boolean(order.subscriptionId) || order.orderSource === "SUBSCRIPTION";
      return typeFilter === "subscription" ? isSubscription : !isSubscription;
    });
  }, [searched, typeFilter]);

  const groupCounts = useMemo(() => {
    const counts = Object.fromEntries(GROUPS.map((group) => [group.id, 0])) as Record<GroupId, number>;
    for (const order of typed) counts[groupOf(order.status)] += 1;
    return counts;
  }, [typed]);

  const typeCounts = useMemo(() => {
    const subscription = searched.filter(
      (order) => Boolean(order.subscriptionId) || order.orderSource === "SUBSCRIPTION"
    ).length;
    return { all: searched.length, subscription, single: searched.length - subscription };
  }, [searched]);

  const filtered = useMemo(
    () => (groupFilter === "all" ? typed : typed.filter((order) => groupOf(order.status) === groupFilter)),
    [typed, groupFilter]
  );

  const sections = useMemo(() => {
    const buckets = Object.fromEntries(SECTION_META.map((meta) => [meta.id, [] as Order[]])) as Record<
      SectionId,
      Order[]
    >;
    for (const order of filtered) buckets[sectionOf(order, todayKey)].push(order);

    const compare = (a: Order, b: Order) => {
      if (sort === "newest") return b.createdAt.localeCompare(a.createdAt);
      if (sort === "scheduled") {
        const aTime = a.deliveryWindowStart || "9999";
        const bTime = b.deliveryWindowStart || "9999";
        return aTime.localeCompare(bTime) || b.createdAt.localeCompare(a.createdAt);
      }
      const aAction = a.status === "PENDING" || a.status === "PAYMENT_PENDING";
      const bAction = b.status === "PENDING" || b.status === "PAYMENT_PENDING";
      if (aAction !== bAction) return aAction ? -1 : 1;
      if (aAction) return a.createdAt.localeCompare(b.createdAt);
      const aTime = a.deliveryWindowStart || "";
      const bTime = b.deliveryWindowStart || "";
      if (aTime && bTime) return aTime.localeCompare(bTime);
      return b.createdAt.localeCompare(a.createdAt);
    };

    return SECTION_META.map((meta) => ({ ...meta, orders: buckets[meta.id].sort(compare) })).filter(
      (section) => section.orders.length > 0
    );
  }, [filtered, sort, todayKey]);

  const activeFilterCount =
    (typeFilter === "all" ? 0 : 1) + (groupFilter === "all" ? 0 : 1) + (search.trim() ? 1 : 0);

  const clearFilters = () => {
    setTypeFilter("all");
    setGroupFilter("all");
    setSearch("");
  };

  const toggleRow = (orderId: string) =>
    setExpanded((prev) => ({ ...prev, [orderId]: !prev[orderId] }));

  return (
    <DashboardLayout allowedRole="STORE_OWNER">
      <div className="space-y-5">
        <PageHeader
          kicker="Store fulfillment"
          title="Orders"
          description="Accept, prepare and hand off every order. Subscription work and one-time orders sit in the same queue, labelled."
          actions={
            <>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
                >
                  <Filter className="h-4 w-4" aria-hidden="true" />
                  Clear {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""}
                </button>
              )}
              <RefreshButton onClick={() => void fetchOrders("refresh")} busy={refreshing} />
            </>
          }
        />

        <KpiStrip
          label="Filter orders by stage"
          onSelect={(id) =>
            setGroupFilter((current) => (current === id ? "all" : (id as GroupId)))
          }
          tiles={GROUPS.map((group) => ({
            id: group.id,
            label: group.label,
            value: groupCounts[group.id],
            active: groupFilter === group.id,
            tone:
              group.id === "action"
                ? "amber"
                : group.id === "done"
                  ? "emerald"
                  : group.id === "cancelled"
                    ? "red"
                    : group.id === "rider"
                      ? "purple"
                      : "slate",
          }))}
        />

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <SearchField
            id="orders-search"
            value={search}
            onChange={setSearch}
            placeholder="Search order, customer or phone"
          />
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl<TypeFilter>
              label="Order type"
              value={typeFilter}
              onChange={setTypeFilter}
              options={[
                { value: "all", label: "All", count: typeCounts.all },
                { value: "subscription", label: "Subscription", count: typeCounts.subscription },
                { value: "single", label: "One-time", count: typeCounts.single },
              ]}
            />
            <label htmlFor="orders-sort" className="sr-only">
              Sort orders
            </label>
            <select
              id="orders-sort"
              value={sort}
              onChange={(event) => setSort(event.target.value as SortId)}
              className="enterprise-input min-h-[42px] w-auto py-2 text-sm"
            >
              <option value="smart">Work order</option>
              <option value="newest">Newest first</option>
              <option value="scheduled">Scheduled first</option>
            </select>
          </div>
        </div>

        <ResultsNote
          message={`${filtered.length} of ${orders.length} orders shown${typeFilter === "subscription" ? ", subscriptions only" : typeFilter === "single" ? ", one-time orders only" : ""}.`}
        />

        {error && (
          <div className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between">
            <span className="font-semibold">{error}</span>
            <button
              type="button"
              onClick={() => void fetchOrders("initial")}
              className="self-start rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-1 sm:self-auto"
            >
              Try again
            </button>
          </div>
        )}

        {loading ? (
          <div className="space-y-3" aria-busy="true">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : sections.length === 0 ? (
          <EmptyState
            icon={<ShoppingCart className="h-10 w-10" aria-hidden="true" />}
            title={activeFilterCount > 0 ? "No orders match these filters" : "No orders yet"}
            description={
              activeFilterCount > 0
                ? "Try clearing a filter, or search a different order number, customer or phone."
                : "Orders appear here as soon as a customer checks out or a subscription day is generated."
            }
            action={
              activeFilterCount > 0 ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="enterprise-button min-h-[40px] px-4 py-2 text-sm"
                >
                  Clear filters
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-6" aria-busy={refreshing}>
            {sections.map((section) => {
              const limit = shown[section.id] ?? PAGE_STEP;
              const visible = section.orders.slice(0, limit);
              return (
                <section key={section.id} aria-labelledby={`section-${section.id}`}>
                  <div className="mb-2 flex items-baseline justify-between gap-3">
                    <div>
                      <h2
                        id={`section-${section.id}`}
                        className="text-sm font-semibold uppercase tracking-[0.06em] text-slate-600"
                      >
                        {section.title}
                        <span className="ml-2 text-slate-400 tabular-nums">
                          {section.orders.length}
                        </span>
                      </h2>
                      <p className="mt-0.5 text-xs text-slate-500">{section.hint}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {visible.map((order) => (
                      <OrderRow
                        key={order.id}
                        order={order}
                        expanded={Boolean(expanded[order.id])}
                        onToggle={() => toggleRow(order.id)}
                        actionLoading={actionLoading}
                        actionError={actionErrors[order.id]}
                        substitutes={substitutes}
                        onUpdateStatus={updateStatus}
                        onMarkUnavailable={markUnavailable}
                        onLoadSubstitutes={loadSubstitutes}
                        onApplySubstitute={applySubstitute}
                        todayKey={todayKey}
                      />
                    ))}
                  </div>

                  {section.orders.length > visible.length && (
                    <button
                      type="button"
                      onClick={() =>
                        setShown((prev) => ({
                          ...prev,
                          [section.id]: (prev[section.id] ?? PAGE_STEP) + PAGE_STEP,
                        }))
                      }
                      className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
                    >
                      Show {Math.min(PAGE_STEP, section.orders.length - visible.length)} more of{" "}
                      {section.orders.length}
                    </button>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

type OrderRowProps = {
  order: Order;
  expanded: boolean;
  onToggle: () => void;
  actionLoading: string | null;
  actionError?: string;
  substitutes: Record<string, ProductOption[]>;
  onUpdateStatus: (orderId: string, status: string) => Promise<void>;
  onMarkUnavailable: (orderId: string, itemId: string) => Promise<void>;
  onLoadSubstitutes: (orderId: string, itemId: string) => Promise<void>;
  onApplySubstitute: (orderId: string, itemId: string, productId: string) => Promise<void>;
  todayKey: string;
};

function OrderRow({
  order,
  expanded,
  onToggle,
  actionLoading,
  actionError,
  substitutes,
  onUpdateStatus,
  onMarkUnavailable,
  onLoadSubstitutes,
  onApplySubstitute,
  todayKey,
}: OrderRowProps) {
  const config = statusConfig[order.status] || statusConfig.PENDING;
  const Icon = config.icon;
  const orderActions = STORE_ACTIONS[order.status] || [];
  const windowLabel = scheduledWindow(order);
  const isSubscription = Boolean(order.subscriptionId) || order.orderSource === "SUBSCRIPTION";
  const windowKey = order.deliveryWindowStart ? dayKeyOf(order.deliveryWindowStart) : null;
  const isUpcoming = Boolean(windowKey && windowKey > todayKey);

  return (
    <article className="enterprise-card p-4 transition">
      <div className="flex flex-wrap items-start gap-3">
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${config.cls}`}
          aria-hidden="true"
        >
          <Icon className="h-4 w-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-950">
              #{order.id.slice(-8).toUpperCase()}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${config.cls}`}>
              {config.label}
            </span>
            {isSubscription ? (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200">
                Subscription
                {order.subscriptionSequence ? ` · Day ${order.subscriptionSequence}` : ""}
              </span>
            ) : (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-200">
                One-time order
              </span>
            )}
            {order.storeDelivery && (
              <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-700 ring-1 ring-inset ring-orange-200">
                Store delivery
              </span>
            )}
          </div>

          <p className="mt-1 truncate text-sm text-slate-600">
            {order.customer?.name || "Customer"}
            <span className="text-slate-400"> · </span>
            {order.customer?.phone || order.customer?.email || "No contact"}
            <span className="text-slate-400"> · </span>
            {new Date(order.createdAt).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
            })}
          </p>

          {order.rider && (
            <p className="mt-0.5 text-xs font-medium text-purple-700">
              Rider: {order.rider.user.name}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <p className="text-base font-semibold tabular-nums text-slate-950">
            ₹{Number(orderAmount(order)).toLocaleString("en-IN")}
          </p>
          <p className="text-xs text-slate-500">
            {order.items?.length || 0} item{(order.items?.length || 0) > 1 ? "s" : ""}
          </p>
          {order.payment && (
            <p
              className={`text-[11px] font-semibold ${
                order.payment.status === "COMPLETED" ? "text-emerald-700" : "text-amber-700"
              }`}
            >
              {order.payment.method} · {order.payment.status}
            </p>
          )}
        </div>
      </div>

      {windowLabel && (
        <div
          className={`mt-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
            isUpcoming
              ? "border-teal-200 bg-teal-50 text-teal-900"
              : "border-slate-200 bg-slate-50 text-slate-600"
          }`}
        >
          <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="font-semibold">{windowLabel}</span>
          <span className="text-slate-500">Preparation opens two hours before.</span>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {orderActions.map((action) => {
          const busy = actionLoading === `${order.id}-${action.status}`;
          return (
            <button
              key={action.status}
              type="button"
              onClick={() => void onUpdateStatus(order.id, action.status)}
              disabled={busy}
              aria-label={`${action.label} for order ${order.id.slice(-8).toUpperCase()}`}
              className={`min-h-[38px] rounded-lg px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1 disabled:opacity-50 ${
                action.status === "CANCELLED"
                  ? "border border-red-200 text-red-600 hover:bg-red-50"
                  : "bg-slate-950 text-white hover:bg-teal-700"
              }`}
            >
              {busy ? "Working…" : action.label}
            </button>
          );
        })}

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="ml-auto inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1"
        >
          Picking list
          <span className="tabular-nums text-slate-400">{order.items?.length || 0}</span>
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
      </div>

      {actionError && (
        <p className="mt-2 text-xs font-semibold text-red-600" role="alert">
          {actionError}
        </p>
      )}

      {expanded && (
        <div className="mt-3 rounded-xl bg-slate-50 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
            <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" /> Picking list
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {(order.items || []).map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-700">
                    {item.product?.name || "Product"}
                  </span>
                  <span className="rounded-md bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">
                    ×{item.quantity}
                  </span>
                </div>
                {editableItemStates.includes(order.status) && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void onMarkUnavailable(order.id, item.id)}
                      disabled={actionLoading === `${item.id}-unavailable`}
                      className="rounded-md border border-amber-200 px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 disabled:opacity-50"
                    >
                      {actionLoading === `${item.id}-unavailable` ? "Working…" : "Unavailable"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void onLoadSubstitutes(order.id, item.id)}
                      disabled={actionLoading === `${item.id}-substitutes`}
                      className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1 disabled:opacity-50"
                    >
                      {actionLoading === `${item.id}-substitutes` ? "Loading…" : "Substitutes"}
                    </button>
                  </div>
                )}
                {(substitutes[item.id]?.length || 0) > 0 && (
                  <div className="mt-2 space-y-1">
                    {(substitutes[item.id] || []).map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => void onApplySubstitute(order.id, item.id, product.id)}
                        className="block w-full rounded-md bg-teal-50 px-2 py-1.5 text-left text-[11px] font-semibold text-teal-900 hover:bg-teal-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1"
                      >
                        Replace with {product.name} · stock {product.availability?.availableQty ?? "–"}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          {(order.items || []).length === 0 && (
            <p className="text-sm text-slate-500">No line items on this order.</p>
          )}
        </div>
      )}
    </article>
  );
}
