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
  activeJobs?: DeliveryJob[];
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
  const activeJobs = workspace.activeJobs?.length
    ? workspace.activeJobs
    : workspace.activeJob
      ? [workspace.activeJob]
      : [];

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
  return (
    <DashboardLayout allowedRole="RIDER">
      <div className="space-y-4">
        <header className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="enterprise-kicker">Rider operations</p>
              <h1 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-slate-950 sm:text-xl">
                Delivery workspace
              </h1>
              <p className="mt-0.5 text-xs text-slate-500">
                Jobs offered to you or assigned to you.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                  workspace.rider?.status === "ONLINE"
                    ? "bg-emerald-50 text-emerald-700"
                    : workspace.rider?.status === "BUSY"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {workspace.rider?.status || "OFFLINE"}
              </span>
              <button
                onClick={fetchWorkspace}
                disabled={loading}
                className="enterprise-button"
                aria-label="Refresh rider workspace"
              >
                <RefreshCw
                  className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
                />
                Refresh
              </button>
            </div>
          </div>
        </header>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}
        {message && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            {message}
          </div>
        )}

        <section className="grid gap-2 sm:grid-cols-3">
          <div className="enterprise-card p-3 sm:p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Pending offers
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-violet-700">
              {workspace.pendingOffers.length}
            </p>
          </div>
          <div className="enterprise-card p-3 sm:p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Active delivery
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-indigo-700">
              {activeJobs.length}
            </p>
          </div>
          <div className="enterprise-card p-3 sm:p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Accepted offers
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-700">
              {completedOffers}
            </p>
          </div>
        </section>

        {pendingOffer && (
          <section className="overflow-hidden rounded-xl border border-violet-200 bg-white">
            <div className="flex items-center justify-between bg-violet-600 px-4 py-3 text-white">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-200">
                  New delivery offer
                </p>
                <p className="mt-0.5 font-mono text-base font-semibold">
                  #{pendingOffer.deliveryJob.orderId.slice(0, 8).toUpperCase()}
                </p>
              </div>
              <div className="flex items-center gap-1.5 rounded-md bg-white/15 px-2 py-1 text-sm font-semibold">
                <Clock3 className="h-3.5 w-3.5" />{" "}
                {secondsLeft(pendingOffer.expiresAt) ?? "—"}s
              </div>
            </div>
            <div className="grid gap-4 p-4 md:grid-cols-[1fr_auto]">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Store className="h-4 w-4 text-violet-500" />
                  {pendingOffer.deliveryJob.order.store?.name || "Store"}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {pendingOffer.deliveryJob.order.store?.address ||
                    "Store address unavailable"}
                </p>
                <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <UserRound className="h-4 w-4 text-violet-500" />
                  Delivery area
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">{offerAddress}</p>
                {deliveryWindow(pendingOffer.deliveryJob.order) && <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-medium text-emerald-800">Promised delivery · {deliveryWindow(pendingOffer.deliveryJob.order)}</p>}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(pendingOffer.deliveryJob.order.items || []).map((item) => (
                    <span
                      key={item.id}
                      className="rounded-md bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600"
                    >
                      {item.product?.name || "Item"} × {item.quantity}
                    </span>
                  ))}
                </div>
              </div>
              <div className="text-left md:text-right">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Order value
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-slate-950">
                  {formatINR(
                    Number(pendingOffer.deliveryJob.order.grandTotal || 0)
                  )}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {pendingOffer.deliveryJob.order.payment?.method ||
                    "Payment method unavailable"}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50 p-3 sm:flex-row sm:justify-end">
              <button
                onClick={() => rejectOffer(pendingOffer)}
                disabled={working !== null}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 text-sm font-medium text-red-700 disabled:opacity-50"
              >
                <XCircle className="h-4 w-4" />
                Reject
              </button>
              <button
                onClick={() => acceptOffer(pendingOffer)}
                disabled={
                  working !== null || secondsLeft(pendingOffer.expiresAt) === 0
                }
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-violet-600 px-5 text-sm font-semibold text-white disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                {working === `accept-${pendingOffer.id}`
                  ? "Accepting..."
                  : "Accept job"}
              </button>
            </div>
          </section>
        )}

        {activeJobs.length ? (
          <div className="space-y-5">
          {activeJobs.map((activeJob) => {
            const meta = statusMeta[activeJob.status] || null;
            const nextAction = riderActions[activeJob.status];
            const NextActionIcon = nextAction?.icon;
            const activeAddress =
              addressValue(activeJob.order.addressSnapshot, "line1") ||
              addressValue(activeJob.order.addressSnapshot, "city") ||
              "Address available in order details";
            return <section key={activeJob.id} className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Current delivery
                </p>
                <p className="mt-1 font-mono text-base font-semibold text-slate-950">
                  #{activeJob.orderId.slice(0, 8).toUpperCase()}
                </p>
                {meta && (
                  <span
                    className={`mt-2 inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold ring-1 ${meta.cls}`}
                  >
                    {meta.label}
                  </span>
                )}
                <p className="mt-2 text-[11px] text-slate-500">
                  {meta?.help || activeJob.status.replaceAll("_", " ")}
                </p>
                {deliveryWindow(activeJob.order) && <p className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-medium text-emerald-800">Promised delivery · {deliveryWindow(activeJob.order)}</p>}
              </div>
              <p className="text-xl font-semibold tabular-nums text-slate-950">
                {formatINR(Number(activeJob.order.grandTotal || 0))}
              </p>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Store className="h-4 w-4 text-indigo-500" />
                  Pickup store
                </p>
                <p className="mt-1.5 text-sm font-medium text-slate-800">
                  {activeJob.order.store?.name || "Store"}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
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
                  className="mt-3 inline-flex items-center gap-2 rounded-md bg-white px-2.5 py-1.5 text-[11px] font-medium text-indigo-700"
                >
                  <Navigation className="h-3.5 w-3.5" />
                  Open directions
                </button>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <MapPin className="h-4 w-4 text-emerald-500" />
                  Customer delivery
                </p>
                <p className="mt-1.5 text-sm font-medium text-slate-800">
                  {activeJob.order.customer?.name || "Customer"}
                </p>
                <p className="mt-1 text-sm text-slate-500">{activeAddress}</p>
                {activeJob.order.customer?.phone && (
                  <a
                    href={`tel:${activeJob.order.customer.phone}`}
                    className="mt-3 inline-flex items-center gap-2 rounded-md bg-white px-2.5 py-1.5 text-[11px] font-medium text-emerald-700"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    Call customer
                  </a>
                )}
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-slate-100 p-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <PackageCheck className="h-4 w-4 text-slate-500" />
                Parcel items
              </p>
              <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {(activeJob.order.items || []).map((item) => (
                  <div
                    key={item.id}
                    className="rounded-md bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-700"
                  >
                    {item.product?.name || "Item"}{" "}
                    <span className="text-slate-400">× {item.quantity}</span>
                  </div>
                ))}
              </div>
            </div>

            {activeJob.status === "RIDER_AT_STORE" && (
              <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">Store verification required</p>
                  <p className="mt-0.5 text-[11px]">
                    Do not start delivery until the store verifies the parcel
                    handoff.
                  </p>
                </div>
              </div>
            )}

            {nextAction && NextActionIcon && (
              <div className="mt-4 flex justify-end">
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
                  className="enterprise-button min-h-[44px] gap-2"
                >
                  <NextActionIcon className="h-4 w-4" />
                  {working === `job-${activeJob.id}`
                    ? "Updating..."
                    : nextAction.label}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </section>;
          })}
          </div>
        ) : !pendingOffer && !loading ? (
          <section className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center">
            <Bike className="mx-auto h-8 w-8 text-slate-300" />
            <h2 className="mt-3 text-base font-semibold text-slate-800">
              No active delivery
            </h2>
            <p className="mt-1 text-[11px] text-slate-500">
              You will see a job here only after dispatch sends an offer.
            </p>
          </section>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
