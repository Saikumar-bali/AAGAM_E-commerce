"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { apiClient } from "@aagam/utils";
import { formatINR } from "@/lib/currency";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  ArrowRight,
  Bike,
  CheckCircle2,
  Clock3,
  MapPin,
  Navigation,
  PackageCheck,
  Phone,
  RefreshCw,
  ShieldCheck,
  Store,
  UserRound,
  XCircle,
} from "lucide-react";

type Assignment = {
  id: string;
  status: string;
  offeredAt?: string | null;
  expiresAt?: string | null;
  deliveryJob: DeliveryJob;
};

type DeliveryJob = {
  id: string;
  orderId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  order: {
    id: string;
    status: string;
    deliveryWindowStart?: string | null;
    deliveryWindowEnd?: string | null;
    grandTotal?: number;
    addressSnapshot?: Record<string, unknown> | null;
    customer?: { name?: string | null; phone?: string | null };
    store?: {
      name?: string | null;
      address?: string | null;
      latitude?: number | null;
      longitude?: number | null;
    };
    payment?: { method?: string; status?: string } | null;
    items?: Array<{
      id: string;
      quantity: number;
      product?: { name?: string | null; image?: string | null };
    }>;
  };
};

type Workspace = {
  rider?: {
    id: string;
    status: string;
    user?: {
      name?: string | null;
      email?: string | null;
      phone?: string | null;
    };
  };
  pendingOffers: Assignment[];
  activeJob: DeliveryJob | null;
  assignmentHistory: Array<{
    id: string;
    status: string;
    createdAt: string;
    deliveryJob?: { order?: { id?: string; store?: { name?: string | null } } };
  }>;
};

type RiderAction = {
  label: string;
  endpoint: string;
  success: string;
  icon: LucideIcon;
};

const emptyWorkspace: Workspace = {
  pendingOffers: [],
  activeJob: null,
  assignmentHistory: [],
};

const statusMeta: Record<string, { label: string; help: string; cls: string }> =
  {
    RIDER_ASSIGNED: {
      label: "Assignment accepted",
      help: "Start travelling to the store.",
      cls: "bg-violet-50 text-violet-800 ring-violet-200",
    },
    RIDER_EN_ROUTE_TO_STORE: {
      label: "Going to store",
      help: "Mark arrival only after reaching the store.",
      cls: "bg-indigo-50 text-indigo-800 ring-indigo-200",
    },
    RIDER_AT_STORE: {
      label: "At store",
      help: "Wait for the store to verify parcel handoff.",
      cls: "bg-amber-50 text-amber-800 ring-amber-200",
    },
    PICKUP_VERIFIED: {
      label: "Pickup verified",
      help: "Start delivery after receiving the parcel.",
      cls: "bg-cyan-50 text-cyan-800 ring-cyan-200",
    },
    OUT_FOR_DELIVERY: {
      label: "Out for delivery",
      help: "Travel to the customer location.",
      cls: "bg-blue-50 text-blue-800 ring-blue-200",
    },
    RIDER_AT_CUSTOMER: {
      label: "At customer",
      help: "Complete handoff and confirm delivery.",
      cls: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    },
    DELIVERED: {
      label: "Delivered",
      help: "Delivery is complete.",
      cls: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    },
  };

const riderActions: Record<string, RiderAction> = {
  RIDER_ASSIGNED: {
    label: "Start trip to store",
    endpoint: "en-route-to-store",
    success: "Trip to store started.",
    icon: Navigation,
  },
  RIDER_EN_ROUTE_TO_STORE: {
    label: "I arrived at store",
    endpoint: "arrived-at-store",
    success: "Store arrival recorded.",
    icon: Store,
  },
  PICKUP_VERIFIED: {
    label: "Start delivery",
    endpoint: "out-for-delivery",
    success: "Order is now out for delivery.",
    icon: Bike,
  },
  OUT_FOR_DELIVERY: {
    label: "I arrived at customer",
    endpoint: "arrived-at-customer",
    success: "Customer arrival recorded.",
    icon: MapPin,
  },
  RIDER_AT_CUSTOMER: {
    label: "Confirm delivered",
    endpoint: "delivered",
    success: "Delivery completed.",
    icon: CheckCircle2,
  },
};

function secondsLeft(expiresAt?: string | null) {
  if (!expiresAt) return null;
  return Math.max(
    0,
    Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000)
  );
}

function addressValue(
  snapshot: Record<string, unknown> | null | undefined,
  key: string
) {
  const value = snapshot?.[key];
  return typeof value === "string" ? value : "";
}

function deliveryWindow(order: DeliveryJob["order"]) {
  if (!order.deliveryWindowStart || !order.deliveryWindowEnd) return null;
  const start = new Date(order.deliveryWindowStart); const end = new Date(order.deliveryWindowEnd);
  const date = start.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
  return `${date} · ${start.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}–${end.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}`;
}

export default function RiderDashboard() {
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [, setClock] = useState(0);

  const fetchWorkspace = useCallback(async () => {
    setError(null);
    try {
      const response = await apiClient.get("/orders/dispatch/rider/workspace");
      setWorkspace({ ...emptyWorkspace, ...(response.data || {}) });
    } catch (err: any) {
      setError(
        err?.response?.data?.message || "Failed to load rider workspace"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkspace();
    const refresh = window.setInterval(fetchWorkspace, 15000);
    const timer = window.setInterval(
      () => setClock((value) => value + 1),
      1000
    );
    return () => {
      window.clearInterval(refresh);
      window.clearInterval(timer);
    };
  }, [fetchWorkspace]);

  const pendingOffer = workspace.pendingOffers[0] || null;
  const activeJob = workspace.activeJob;
  const meta = activeJob ? statusMeta[activeJob.status] : null;
  const nextAction = activeJob ? riderActions[activeJob.status] : undefined;
  const NextActionIcon = nextAction?.icon;

  const completedOffers = useMemo(
    () =>
      workspace.assignmentHistory.filter((entry) => entry.status === "ACCEPTED")
        .length,
    [workspace.assignmentHistory]
  );

  const act = async (
    key: string,
    request: () => Promise<unknown>,
    success: string
  ) => {
    setWorking(key);
    setError(null);
    setMessage(null);
    try {
      await request();
      setMessage(success);
      await fetchWorkspace();
    } catch (err: any) {
      setError(err?.response?.data?.message || "Delivery action failed");
    } finally {
      setWorking(null);
    }
  };

  const acceptOffer = (assignment: Assignment) =>
    act(
      `accept-${assignment.id}`,
      () =>
        apiClient.patch(`/orders/dispatch/assignments/${assignment.id}/accept`),
      "Delivery assignment accepted."
    );

  const rejectOffer = (assignment: Assignment) => {
    const reason = window.prompt(
      "Why are you rejecting this assignment?",
      "Rider unavailable"
    );
    if (reason === null) return;
    return act(
      `reject-${assignment.id}`,
      () =>
        apiClient.patch(
          `/orders/dispatch/assignments/${assignment.id}/reject`,
          { reason }
        ),
      "Assignment rejected and returned to dispatch."
    );
  };

  const openDirections = (
    latitude?: number | null,
    longitude?: number | null,
    address?: string | null
  ) => {
    const destination =
      typeof latitude === "number" && typeof longitude === "number"
        ? `${latitude},${longitude}`
        : encodeURIComponent(address || "");
    if (!destination) return;
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${destination}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  const offerAddress = pendingOffer
    ? addressValue(pendingOffer.deliveryJob.order.addressSnapshot, "city") ||
      addressValue(pendingOffer.deliveryJob.order.addressSnapshot, "line1") ||
      "Customer address provided after acceptance"
    : "";
  const activeAddress = activeJob
    ? addressValue(activeJob.order.addressSnapshot, "line1") ||
      addressValue(activeJob.order.addressSnapshot, "city") ||
      "Address available in order details"
    : "";

  return (
    <DashboardLayout allowedRole="RIDER">
      <div className="space-y-6">
        <header className="rounded-[2rem] border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-6 text-white shadow-xl">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-300">
                Rider operations
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight">
                Delivery Workspace
              </h1>
              <p className="mt-2 text-sm text-slate-300">
                Only jobs offered to you or already assigned to you appear here.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`rounded-full px-3 py-1.5 text-xs font-black ${
                  workspace.rider?.status === "ONLINE"
                    ? "bg-emerald-400/20 text-emerald-200"
                    : workspace.rider?.status === "BUSY"
                    ? "bg-amber-400/20 text-amber-200"
                    : "bg-slate-400/20 text-slate-300"
                }`}
              >
                {workspace.rider?.status || "OFFLINE"}
              </span>
              <button
                onClick={fetchWorkspace}
                disabled={loading}
                className="rounded-xl bg-white/10 p-2.5 hover:bg-white/20 disabled:opacity-50"
                aria-label="Refresh rider workspace"
              >
                <RefreshCw
                  className={`h-5 w-5 ${loading ? "animate-spin" : ""}`}
                />
              </button>
            </div>
          </div>
        </header>

        {error && (
          <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}
        {message && (
          <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
            <CheckCircle2 className="h-4 w-4" />
            {message}
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">
              Pending offers
            </p>
            <p className="mt-2 text-3xl font-black text-violet-700">
              {workspace.pendingOffers.length}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">
              Active delivery
            </p>
            <p className="mt-2 text-3xl font-black text-indigo-700">
              {activeJob ? 1 : 0}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">
              Accepted offers
            </p>
            <p className="mt-2 text-3xl font-black text-emerald-700">
              {completedOffers}
            </p>
          </div>
        </section>

        {pendingOffer && !activeJob && (
          <section className="overflow-hidden rounded-[2rem] border border-violet-200 bg-white shadow-lg">
            <div className="flex items-center justify-between bg-violet-600 px-5 py-4 text-white">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-violet-200">
                  New delivery offer
                </p>
                <p className="mt-1 font-mono text-lg font-black">
                  #{pendingOffer.deliveryJob.orderId.slice(0, 8).toUpperCase()}
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-sm font-black">
                <Clock3 className="h-4 w-4" />{" "}
                {secondsLeft(pendingOffer.expiresAt) ?? "—"}s
              </div>
            </div>
            <div className="grid gap-5 p-5 md:grid-cols-[1fr_auto]">
              <div>
                <p className="flex items-center gap-2 text-sm font-black text-slate-900">
                  <Store className="h-4 w-4 text-violet-500" />
                  {pendingOffer.deliveryJob.order.store?.name || "Store"}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {pendingOffer.deliveryJob.order.store?.address ||
                    "Store address unavailable"}
                </p>
                <p className="mt-4 flex items-center gap-2 text-sm font-black text-slate-900">
                  <UserRound className="h-4 w-4 text-violet-500" />
                  Delivery area
                </p>
                <p className="mt-1 text-sm text-slate-500">{offerAddress}</p>
                {deliveryWindow(pendingOffer.deliveryJob.order) && <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800">Promised delivery · {deliveryWindow(pendingOffer.deliveryJob.order)}</p>}
                <div className="mt-4 flex flex-wrap gap-2">
                  {(pendingOffer.deliveryJob.order.items || []).map((item) => (
                    <span
                      key={item.id}
                      className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-600"
                    >
                      {item.product?.name || "Item"} × {item.quantity}
                    </span>
                  ))}
                </div>
              </div>
              <div className="text-left md:text-right">
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                  Order value
                </p>
                <p className="mt-1 text-2xl font-black text-slate-950">
                  {formatINR(
                    Number(pendingOffer.deliveryJob.order.grandTotal || 0)
                  )}
                </p>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  {pendingOffer.deliveryJob.order.payment?.method ||
                    "Payment method unavailable"}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50 p-4 sm:flex-row sm:justify-end">
              <button
                onClick={() => rejectOffer(pendingOffer)}
                disabled={working !== null}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-5 text-sm font-black text-red-700 disabled:opacity-50"
              >
                <XCircle className="h-4 w-4" />
                Reject
              </button>
              <button
                onClick={() => acceptOffer(pendingOffer)}
                disabled={
                  working !== null || secondsLeft(pendingOffer.expiresAt) === 0
                }
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-600 px-6 text-sm font-black text-white disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                {working === `accept-${pendingOffer.id}`
                  ? "Accepting..."
                  : "Accept job"}
              </button>
            </div>
          </section>
        )}

        {activeJob ? (
          <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-slate-400">
                  Current delivery
                </p>
                <p className="mt-2 font-mono text-xl font-black text-slate-950">
                  #{activeJob.orderId.slice(0, 8).toUpperCase()}
                </p>
                {meta && (
                  <span
                    className={`mt-3 inline-flex rounded-full px-3 py-1.5 text-xs font-black ring-1 ${meta.cls}`}
                  >
                    {meta.label}
                  </span>
                )}
                <p className="mt-3 text-sm font-medium text-slate-500">
                  {meta?.help || activeJob.status.replaceAll("_", " ")}
                </p>
                {deliveryWindow(activeJob.order) && <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800">Promised delivery · {deliveryWindow(activeJob.order)}</p>}
              </div>
              <p className="text-2xl font-black text-slate-950">
                {formatINR(Number(activeJob.order.grandTotal || 0))}
              </p>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="flex items-center gap-2 text-sm font-black text-slate-900">
                  <Store className="h-4 w-4 text-indigo-500" />
                  Pickup store
                </p>
                <p className="mt-2 text-sm font-bold text-slate-800">
                  {activeJob.order.store?.name || "Store"}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {activeJob.order.store?.address || "Address unavailable"}
                </p>
                <button
                  onClick={() =>
                    openDirections(
                      activeJob.order.store?.latitude,
                      activeJob.order.store?.longitude,
                      activeJob.order.store?.address
                    )
                  }
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-black text-indigo-700 shadow-sm"
                >
                  <Navigation className="h-4 w-4" />
                  Open directions
                </button>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="flex items-center gap-2 text-sm font-black text-slate-900">
                  <MapPin className="h-4 w-4 text-emerald-500" />
                  Customer delivery
                </p>
                <p className="mt-2 text-sm font-bold text-slate-800">
                  {activeJob.order.customer?.name || "Customer"}
                </p>
                <p className="mt-1 text-sm text-slate-500">{activeAddress}</p>
                {activeJob.order.customer?.phone && (
                  <a
                    href={`tel:${activeJob.order.customer.phone}`}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-black text-emerald-700 shadow-sm"
                  >
                    <Phone className="h-4 w-4" />
                    Call customer
                  </a>
                )}
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-slate-100 p-4">
              <p className="flex items-center gap-2 text-sm font-black text-slate-900">
                <PackageCheck className="h-4 w-4 text-slate-500" />
                Parcel items
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {(activeJob.order.items || []).map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700"
                  >
                    {item.product?.name || "Item"}{" "}
                    <span className="text-slate-400">× {item.quantity}</span>
                  </div>
                ))}
              </div>
            </div>

            {activeJob.status === "RIDER_AT_STORE" && (
              <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-black">Store verification required</p>
                  <p className="mt-1 text-sm">
                    Do not start delivery until the store verifies the parcel
                    handoff.
                  </p>
                </div>
              </div>
            )}

            {nextAction && NextActionIcon && (
              <div className="mt-5 flex justify-end">
                <button
                  onClick={() =>
                    act(
                      `job-${activeJob.id}`,
                      () =>
                        apiClient.patch(
                          `/orders/dispatch/jobs/${activeJob.id}/${nextAction.endpoint}`,
                          activeJob.status === "RIDER_AT_CUSTOMER"
                            ? { proofType: "RIDER_CONFIRMATION" }
                            : {}
                        ),
                      nextAction.success
                    )
                  }
                  disabled={working !== null}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 px-6 text-sm font-black text-white disabled:opacity-50"
                >
                  <NextActionIcon className="h-4 w-4" />
                  {working === `job-${activeJob.id}`
                    ? "Updating..."
                    : nextAction.label}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </section>
        ) : !pendingOffer && !loading ? (
          <section className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-12 text-center">
            <Bike className="mx-auto h-10 w-10 text-slate-400" />
            <h2 className="mt-4 text-xl font-black text-slate-800">
              No active delivery
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              You will see a job here only after dispatch sends an offer.
            </p>
          </section>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
