"use client";

import DashboardLayout from "@/components/DashboardLayout";
import { apiClient } from "@aagam/utils";
import {
  AlertCircle,
  Banknote,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  Filter,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Store,
  Truck,
  UserRound,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";

type Operation = {
  id: string;
  type: string;
  status: string;
  actorRole?: string | null;
  actorUserId?: string | null;
  details?: Record<string, any>;
  createdAt: string;
};

type QueueJob = {
  id: string;
  orderId: string;
  status: string;
  updatedAt: string;
  currentRider?: {
    user?: { name?: string | null; email?: string | null };
  } | null;
  operations: Operation[];
  failureDecisions?: Array<{
    id: string;
    reason: string;
    recommendedAction: string;
    decidedAction: string;
    rationale: string;
    status: string;
  }>;
  codLedger?: {
    expectedAmountPaise: number;
    collectedAmountPaise: number;
    riderHoldingBalancePaise: number;
    depositedAmountPaise: number;
    variancePaise: number;
    status: string;
  } | null;
  order: {
    id: string;
    grandTotal?: number;
    customer?: { name?: string | null; email?: string | null };
    store?: { name?: string | null };
    payment?: { method?: string; status?: string; amountPaise?: number } | null;
    items?: Array<{
      id: string;
      quantity: number;
      product?: { name?: string | null };
    }>;
  };
};

type QuantityState = Record<
  string,
  Record<
    string,
    {
      sellable: string;
      damaged: string;
      missing: string;
    }
  >
>;

type FilterValue = "ALL" | "EXCEPTIONS" | "RETURNS" | "COD";

function shortId(value?: string | null) {
  return value ? value.slice(-8).toUpperCase() : "UNKNOWN";
}

function label(value?: string | null) {
  return String(value || "UNKNOWN").replaceAll("_", " ");
}

function completed(job: QueueJob, type: string) {
  return job.operations.some(
    (operation) => operation.type === type && operation.status === "COMPLETED"
  );
}

function statusClass(status: string) {
  if (status === "DELIVERY_FAILED")
    return "bg-red-50 text-red-800 ring-red-200";
  if (status === "RETURNING_TO_STORE")
    return "bg-amber-50 text-amber-800 ring-amber-200";
  if (status === "RETURNED_TO_STORE")
    return "bg-indigo-50 text-indigo-800 ring-indigo-200";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function errorMessage(error: any) {
  const value = error?.response?.data?.message;
  if (Array.isArray(value)) return value.join(", ");
  return value || error?.message || "The operation could not be completed.";
}

export default function AdminDeliveryExceptionsPage() {
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterValue>("ALL");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [settlementRefs, setSettlementRefs] = useState<Record<string, string>>(
    {}
  );
  const [depositAmounts, setDepositAmounts] = useState<Record<string, string>>(
    {}
  );
  const [varianceReasons, setVarianceReasons] = useState<
    Record<string, string>
  >({});
  const [resolutionActions, setResolutionActions] = useState<
    Record<string, string>
  >({});
  const [resolutionReasons, setResolutionReasons] = useState<
    Record<string, string>
  >({});
  const [inspectionNotes, setInspectionNotes] = useState<
    Record<string, string>
  >({});
  const [quantities, setQuantities] = useState<QuantityState>({});

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get("/orders/delivery-operations/queue");
      setJobs(Array.isArray(response.data) ? response.data : []);
    } catch (err: any) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchQueue();
    const timer = window.setInterval(fetchQueue, 20_000);
    return () => window.clearInterval(timer);
  }, [fetchQueue]);

  const visibleJobs = useMemo(
    () =>
      jobs.filter((job) => {
        if (filter === "EXCEPTIONS") return job.status === "DELIVERY_FAILED";
        if (filter === "RETURNS")
          return ["RETURNING_TO_STORE", "RETURNED_TO_STORE"].includes(
            job.status
          );
        if (filter === "COD") return job.order.payment?.method === "COD";
        return true;
      }),
    [jobs, filter]
  );

  const stats = useMemo(
    () => ({
      exceptions: jobs.filter((job) => job.status === "DELIVERY_FAILED").length,
      returning: jobs.filter((job) => job.status === "RETURNING_TO_STORE")
        .length,
      inspections: jobs.filter(
        (job) =>
          job.status === "RETURNED_TO_STORE" &&
          !completed(job, "RETURN_INSPECTION_COMPLETED")
      ).length,
      settlements: jobs.filter(
        (job) =>
          job.order.payment?.method === "COD" &&
          Boolean(job.codLedger) &&
          !["SETTLED", "VARIANCE_REVIEW"].includes(job.codLedger?.status || "")
      ).length,
    }),
    [jobs]
  );

  const post = async (
    key: string,
    path: string,
    body: Record<string, unknown>,
    success: string
  ) => {
    if (busy) return;
    setBusy(key);
    setError(null);
    setMessage(null);
    try {
      await apiClient.post(path, body, {
        headers: { "Idempotency-Key": `admin:${key}:${Date.now()}` },
      });
      setMessage(success);
      await fetchQueue();
    } catch (err: any) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const updateQuantity = (
    jobId: string,
    itemId: string,
    field: "sellable" | "damaged" | "missing",
    value: string
  ) => {
    const numeric = value.replace(/\D/g, "");
    setQuantities((current) => ({
      ...current,
      [jobId]: {
        ...(current[jobId] || {}),
        [itemId]: {
          sellable: current[jobId]?.[itemId]?.sellable || "",
          damaged: current[jobId]?.[itemId]?.damaged || "",
          missing: current[jobId]?.[itemId]?.missing || "",
          [field]: numeric,
        },
      },
    }));
  };

  const submitInspection = async (job: QueueJob) => {
    const lines: Array<{
      orderItemId: string;
      disposition: string;
      quantity: number;
    }> = [];
    for (const item of job.order.items || []) {
      const values = quantities[job.id]?.[item.id] || {
        sellable: "",
        damaged: "",
        missing: "",
      };
      const entries = [
        ["SELLABLE", Number(values.sellable || 0)],
        ["DAMAGED", Number(values.damaged || 0)],
        ["MISSING", Number(values.missing || 0)],
      ] as const;
      if (
        !entries.every(
          ([, quantity]) => Number.isInteger(quantity) && quantity >= 0
        )
      ) {
        setError("Inspection quantities must be non-negative whole numbers.");
        return;
      }
      const total = entries.reduce((sum, [, quantity]) => sum + quantity, 0);
      if (total !== item.quantity) {
        setError(
          `${item.product?.name || "Item"} must account for exactly ${
            item.quantity
          } unit(s).`
        );
        return;
      }
      entries.forEach(([disposition, quantity]) => {
        if (quantity > 0)
          lines.push({ orderItemId: item.id, disposition, quantity });
      });
    }
    if (lines.length === 0) {
      setError("Enter the inspection disposition for every returned unit.");
      return;
    }
    await post(
      `inspection:${job.id}`,
      `/orders/delivery-operations/jobs/${job.id}/return/inspection`,
      { lines, note: inspectionNotes[job.id]?.trim() || undefined },
      `Return inspection completed for order #${shortId(job.orderId)}.`
    );
  };

  return (
    <DashboardLayout allowedRole="ADMIN">
      <div className="space-y-6">
        <header className="flex flex-col gap-4 rounded-[2rem] border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-red-950 p-6 text-white shadow-xl lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-red-300">
              Delivery control room
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">
              Delivery Exceptions
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">
              Review failed attempts, physical returns, inventory inspections,
              and COD settlement without bypassing the canonical delivery
              workflow.
            </p>
          </div>
          <button
            onClick={() => void fetchQueue()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-slate-900 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />{" "}
            Refresh queue
          </button>
        </header>

        {error && (
          <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </div>
        )}
        {message && (
          <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {message}
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Failed attempts",
              value: stats.exceptions,
              icon: ShieldAlert,
              cls: "bg-red-50 text-red-700",
            },
            {
              label: "Returning parcels",
              value: stats.returning,
              icon: RotateCcw,
              cls: "bg-amber-50 text-amber-700",
            },
            {
              label: "Awaiting inspection",
              value: stats.inspections,
              icon: ClipboardCheck,
              cls: "bg-indigo-50 text-indigo-700",
            },
            {
              label: "COD settlements",
              value: stats.settlements,
              icon: Banknote,
              cls: "bg-emerald-50 text-emerald-700",
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className={`inline-flex rounded-xl p-2.5 ${item.cls}`}>
                <item.icon className="h-5 w-5" />
              </div>
              <p className="mt-4 text-xs font-black uppercase tracking-wider text-slate-400">
                {item.label}
              </p>
              <p className="mt-1 text-3xl font-black text-slate-950">
                {item.value}
              </p>
            </div>
          ))}
        </section>

        <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <Filter className="mx-2 h-4 w-4 text-slate-400" />
          {(["ALL", "EXCEPTIONS", "RETURNS", "COD"] as FilterValue[]).map(
            (value) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={`rounded-xl px-4 py-2 text-xs font-black transition ${
                  filter === value
                    ? "bg-slate-950 text-white"
                    : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                }`}
              >
                {value}
              </button>
            )
          )}
        </section>

        {!loading && visibleJobs.length === 0 && (
          <section className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-12 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
            <h2 className="mt-4 text-xl font-black text-slate-900">
              No matching operations
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              The selected exception queue is clear.
            </p>
          </section>
        )}

        <div className="space-y-5">
          {visibleJobs.map((job) => {
            const payment = job.order.payment;
            const inspectionDone = completed(
              job,
              "RETURN_INSPECTION_COMPLETED"
            );
            const codCollected = completed(job, "COD_COLLECTED");
            const decision = job.failureDecisions?.[0];
            const canConfirmReturn = job.status === "RETURNING_TO_STORE";
            const canInspect =
              job.status === "RETURNED_TO_STORE" && !inspectionDone;
            const canSettle =
              payment?.method === "COD" &&
              codCollected &&
              Boolean(job.codLedger?.riderHoldingBalancePaise) &&
              !["SETTLED", "VARIANCE_REVIEW"].includes(
                job.codLedger?.status || ""
              );

            return (
              <article
                key={job.id}
                className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-mono text-sm font-black text-slate-950">
                        #{shortId(job.orderId)}
                      </p>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-black ring-1 ${statusClass(
                          job.status
                        )}`}
                      >
                        {label(job.status)}
                      </span>
                      {payment?.method === "COD" && (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-800 ring-1 ring-emerald-200">
                          COD {label(payment.status)}
                        </span>
                      )}
                    </div>
                    <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
                      <p className="flex items-center gap-2">
                        <UserRound className="h-4 w-4 text-slate-400" />
                        {job.order.customer?.name ||
                          job.order.customer?.email ||
                          "Customer"}
                      </p>
                      <p className="flex items-center gap-2">
                        <Store className="h-4 w-4 text-slate-400" />
                        {job.order.store?.name || "Store"}
                      </p>
                      <p className="flex items-center gap-2">
                        <Truck className="h-4 w-4 text-slate-400" />
                        {job.currentRider?.user?.name ||
                          job.currentRider?.user?.email ||
                          "No rider"}
                      </p>
                    </div>
                  </div>
                  <p className="text-2xl font-black text-slate-950">
                    ₹
                    {Number(job.order.grandTotal || 0).toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                    })}
                  </p>
                </div>

                {job.status === "DELIVERY_FAILED" && decision && (
                  <section className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4">
                    <h3 className="font-black text-red-950">
                      System failure resolution
                    </h3>
                    <p className="mt-1 text-sm font-bold text-red-800">
                      {label(decision.reason)} →{" "}
                      {label(decision.recommendedAction)}
                    </p>
                    <p className="mt-1 text-sm text-red-700">
                      {decision.rationale}
                    </p>
                    <div className="mt-3 grid gap-2 lg:grid-cols-[240px_1fr_auto]">
                      <select
                        value={
                          resolutionActions[job.id] || decision.decidedAction
                        }
                        onChange={(event) =>
                          setResolutionActions((current) => ({
                            ...current,
                            [job.id]: event.target.value,
                          }))
                        }
                        className="rounded-xl border border-red-200 bg-white px-3 py-2.5 text-sm font-bold"
                      >
                        {[
                          "RETRY_DELIVERY",
                          "REASSIGN_RIDER",
                          "RETURN_TO_STORE",
                          "CANCEL_AND_REFUND",
                          "ESCALATE_TO_ADMIN",
                        ].map((action) => (
                          <option key={action} value={action}>
                            {label(action)}
                          </option>
                        ))}
                      </select>
                      <input
                        value={resolutionReasons[job.id] || ""}
                        onChange={(event) =>
                          setResolutionReasons((current) => ({
                            ...current,
                            [job.id]: event.target.value,
                          }))
                        }
                        placeholder="Required only when overriding the system recommendation"
                        className="rounded-xl border border-red-200 bg-white px-3 py-2.5 text-sm"
                      />
                      <button
                        disabled={Boolean(busy)}
                        onClick={() => {
                          const action =
                            resolutionActions[job.id] || decision.decidedAction;
                          const reason = resolutionReasons[job.id]?.trim();
                          if (
                            action !== decision.recommendedAction &&
                            (!reason || reason.length < 5)
                          ) {
                            setError(
                              "Enter an audited override reason with at least 5 characters."
                            );
                            return;
                          }
                          if (
                            !window.confirm(
                              `Apply ${label(action)} to this failed delivery?`
                            )
                          )
                            return;
                          void post(
                            `resolution:${job.id}`,
                            `/orders/delivery-operations/jobs/${job.id}/failure-resolution`,
                            { action, overrideReason: reason || undefined },
                            `Failure resolution applied for order #${shortId(
                              job.orderId
                            )}.`
                          );
                        }}
                        className="rounded-xl bg-red-800 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
                      >
                        Apply decision
                      </button>
                    </div>
                  </section>
                )}

                {canConfirmReturn && (
                  <section className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <div className="flex items-start gap-3">
                      <RotateCcw className="mt-0.5 h-5 w-5 text-amber-700" />
                      <div className="flex-1">
                        <h3 className="font-black text-amber-950">
                          Confirm physical return
                        </h3>
                        <p className="mt-1 text-sm text-amber-800">
                          Use this only after the store physically receives the
                          parcel. This releases the rider.
                        </p>
                        <button
                          disabled={Boolean(busy)}
                          onClick={() => {
                            if (
                              !window.confirm(
                                "Confirm that the store physically received this returned parcel?"
                              )
                            )
                              return;
                            void post(
                              `return:${job.id}`,
                              `/orders/delivery-operations/jobs/${job.id}/return/confirm`,
                              {},
                              `Returned parcel confirmed for order #${shortId(
                                job.orderId
                              )}.`
                            );
                          }}
                          className="mt-3 rounded-xl bg-amber-700 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
                        >
                          {busy === `return:${job.id}`
                            ? "Confirming…"
                            : "Confirm parcel received"}
                        </button>
                      </div>
                    </div>
                  </section>
                )}

                {canInspect && (
                  <section className="mt-5 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4">
                    <div className="flex items-start gap-3">
                      <Boxes className="mt-0.5 h-5 w-5 text-indigo-700" />
                      <div className="min-w-0 flex-1">
                        <h3 className="font-black text-indigo-950">
                          Returned-item inspection
                        </h3>
                        <p className="mt-1 text-sm text-indigo-800">
                          Every ordered unit must be classified. Only SELLABLE
                          quantities are restored.
                        </p>
                        <div className="mt-4 space-y-3">
                          {(job.order.items || []).map((item) => {
                            const values = quantities[job.id]?.[item.id] || {
                              sellable: "",
                              damaged: "",
                              missing: "",
                            };
                            return (
                              <div
                                key={item.id}
                                className="rounded-xl border border-indigo-100 bg-white p-3"
                              >
                                <p className="text-sm font-black text-slate-900">
                                  {item.product?.name || "Item"} ×{" "}
                                  {item.quantity}
                                </p>
                                <div className="mt-3 grid grid-cols-3 gap-2">
                                  {(
                                    [
                                      ["sellable", "Sellable"],
                                      ["damaged", "Damaged"],
                                      ["missing", "Missing"],
                                    ] as const
                                  ).map(([field, text]) => (
                                    <label
                                      key={field}
                                      className="text-[10px] font-black uppercase tracking-wide text-slate-500"
                                    >
                                      {text}
                                      <input
                                        value={values[field]}
                                        onChange={(event) =>
                                          updateQuantity(
                                            job.id,
                                            item.id,
                                            field,
                                            event.target.value
                                          )
                                        }
                                        inputMode="numeric"
                                        placeholder="0"
                                        className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-2 text-center text-sm font-black text-slate-900 outline-none focus:border-indigo-500"
                                      />
                                    </label>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <textarea
                          value={inspectionNotes[job.id] || ""}
                          onChange={(event) =>
                            setInspectionNotes((current) => ({
                              ...current,
                              [job.id]: event.target.value,
                            }))
                          }
                          placeholder="Inspection note"
                          maxLength={500}
                          className="mt-3 min-h-20 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-900 outline-none focus:border-indigo-500"
                        />
                        <button
                          disabled={Boolean(busy)}
                          onClick={() => void submitInspection(job)}
                          className="mt-3 rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
                        >
                          {busy === `inspection:${job.id}`
                            ? "Saving…"
                            : "Complete explicit inspection"}
                        </button>
                      </div>
                    </div>
                  </section>
                )}

                {canSettle && (
                  <section className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                    <div className="flex items-start gap-3">
                      <Banknote className="mt-0.5 h-5 w-5 text-emerald-700" />
                      <div className="flex-1">
                        <h3 className="font-black text-emerald-950">
                          Settle collected COD
                        </h3>
                        <p className="mt-1 text-sm text-emerald-800">
                          Expected ₹
                          {Number(
                            (job.codLedger?.expectedAmountPaise || 0) / 100
                          ).toFixed(2)}{" "}
                          · Rider holding ₹
                          {Number(
                            (job.codLedger?.riderHoldingBalancePaise || 0) / 100
                          ).toFixed(2)}{" "}
                          · deposited ₹
                          {Number(
                            (job.codLedger?.depositedAmountPaise || 0) / 100
                          ).toFixed(2)}
                        </p>
                        <div className="mt-3 grid gap-2 lg:grid-cols-[160px_1fr_1fr_auto]">
                          <input
                            value={
                              depositAmounts[job.id] ??
                              String(
                                job.codLedger?.riderHoldingBalancePaise || ""
                              )
                            }
                            onChange={(event) =>
                              setDepositAmounts((current) => ({
                                ...current,
                                [job.id]: event.target.value.replace(/\D/g, ""),
                              }))
                            }
                            placeholder="Deposit paise"
                            inputMode="numeric"
                            className="h-11 rounded-xl border border-emerald-200 bg-white px-3 text-sm font-bold"
                          />
                          <input
                            value={settlementRefs[job.id] || ""}
                            onChange={(event) =>
                              setSettlementRefs((current) => ({
                                ...current,
                                [job.id]: event.target.value,
                              }))
                            }
                            placeholder="Settlement reference"
                            maxLength={120}
                            className="h-11 flex-1 rounded-xl border border-emerald-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-emerald-600"
                          />
                          <input
                            value={varianceReasons[job.id] || ""}
                            onChange={(event) =>
                              setVarianceReasons((current) => ({
                                ...current,
                                [job.id]: event.target.value,
                              }))
                            }
                            placeholder="Variance reason if deposit is short"
                            maxLength={500}
                            className="h-11 rounded-xl border border-emerald-200 bg-white px-3 text-sm"
                          />
                          <button
                            disabled={Boolean(busy)}
                            onClick={() => {
                              const reference = settlementRefs[job.id]?.trim();
                              if (!reference || reference.length < 3) {
                                setError(
                                  "Enter a settlement reference with at least 3 characters."
                                );
                                return;
                              }
                              const amountPaise = Number(
                                depositAmounts[job.id] ??
                                  job.codLedger?.riderHoldingBalancePaise ??
                                  0
                              );
                              const expectedRemaining =
                                Number(
                                  job.codLedger?.expectedAmountPaise || 0
                                ) -
                                Number(
                                  job.codLedger?.depositedAmountPaise || 0
                                );
                              const varianceReason =
                                varianceReasons[job.id]?.trim();
                              if (
                                !Number.isInteger(amountPaise) ||
                                amountPaise <= 0
                              ) {
                                setError(
                                  "Deposit amount must be positive whole paise."
                                );
                                return;
                              }
                              if (
                                amountPaise !== expectedRemaining &&
                                (!varianceReason || varianceReason.length < 5)
                              ) {
                                setError(
                                  "A variance reason is required for a short final deposit."
                                );
                                return;
                              }
                              if (
                                !window.confirm(
                                  `Finalize COD deposit of ₹${(
                                    amountPaise / 100
                                  ).toFixed(2)}?`
                                )
                              )
                                return;
                              void post(
                                `settle:${job.id}`,
                                `/orders/delivery-operations/jobs/${job.id}/cod/settle`,
                                {
                                  amountPaise,
                                  settlementReference: reference,
                                  finalize: true,
                                  varianceReason: varianceReason || undefined,
                                },
                                `COD settlement recorded for order #${shortId(
                                  job.orderId
                                )}.`
                              );
                            }}
                            className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
                          >
                            {busy === `settle:${job.id}`
                              ? "Recording…"
                              : "Record settlement"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </section>
                )}

                <section className="mt-5 border-t border-slate-100 pt-4">
                  <h3 className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                    Append-only operation audit
                  </h3>
                  <div className="mt-3 grid gap-2 lg:grid-cols-2">
                    {job.operations.length === 0 && (
                      <p className="text-sm text-slate-500">
                        No Phase 3 operations recorded yet.
                      </p>
                    )}
                    {job.operations.slice(0, 10).map((operation) => (
                      <div
                        key={operation.id}
                        className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-black text-slate-800">
                            {label(operation.type)}
                          </p>
                          <span className="text-[9px] font-black text-slate-500">
                            {operation.status}
                          </span>
                        </div>
                        <p className="mt-1 text-[10px] text-slate-500">
                          {operation.actorRole || "SYSTEM"} ·{" "}
                          {new Date(operation.createdAt).toLocaleString()}
                        </p>
                        {operation.details?.reason && (
                          <p className="mt-1 text-xs font-bold text-red-700">
                            {label(operation.details.reason)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              </article>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
