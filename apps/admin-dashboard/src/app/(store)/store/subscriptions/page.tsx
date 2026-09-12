"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { getToastErrorMessage, useToast } from "@/components/ToastProvider";
import { apiClient } from "@aagam/utils";
import {
  AlertTriangle,
  Banknote,
  Box,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  Package,
  PackageCheck,
  RefreshCw,
  Route,
  ScanLine,
  Truck,
  X,
} from "lucide-react";

type RunStatus =
  | "PLANNED"
  | "RIDER_NEEDED"
  | "READY_FOR_PICKUP"
  | "PICKED_UP"
  | "IN_PROGRESS"
  | "RETURNING"
  | "AWAITING_SETTLEMENT"
  | "INTERRUPTED"
  | "RECOVERY_REQUIRED"
  | "COMPLETED"
  | "CANCELLED";
type Stop = {
  id: string;
  sequenceNumber: number;
  status: string;
  expectedParcelCount: number;
  cashDuePaise: number;
  failureReason?: string | null;
  subscriptionDelivery: {
    order?: {
      customer?: { name?: string | null };
      items: Array<{ id: string; quantity: number; product: { name: string } }>;
    } | null;
  };
};
type Run = {
  id: string;
  routeCode: string;
  serviceDate?: string;
  slotStart?: string;
  slotEnd?: string;
  deliveryZone?: { id: string; code: string; name: string } | null;
  estimatedDistanceKm?: number;
  estimatedDurationMinutes?: number;
  status: RunStatus;
  version: number;
  totalStopCount: number;
  expectedBagCount?: number;
  packedBagCount?: number;
  expectedCashPaise: number;
  rider?: {
    user?: { name?: string | null; phone?: string | null } | null;
  } | null;
  stops: Stop[];
};
type DemandRow = {
  storeId: string;
  serviceDate: string;
  stopCount: number;
  productTotals: Array<{ productId: string; name: string; quantity: number }>;
};
type CashBatch = {
  id: string;
  reference: string;
  status: string;
  expectedAmountPaise: number;
  submittedAmountPaise: number;
  verifiedAmountPaise: number;
  variancePaise: number;
  version: number;
  rider?: { user?: { name?: string | null } | null } | null;
};
type ExceptionRow = Stop & { deliveryRun: { routeCode: string } };
type Tab = "prep" | "runs" | "forecast" | "cash" | "exceptions";

type PreparationRow = {
  id: string;
  subscriptionId: string;
  sequenceNumber: number;
  serviceDate: string;
  deliverySlot: string;
  deliveryStatus: string;
  generatedAt?: string | null;
  store: { id: string; name: string } | null;
  plan: { name: string; orderGenerationHoursBefore: number };
  customer: { id: string; name?: string | null; email?: string | null; accountPhone?: string | null; deliveryPhone?: string | null };
  address: { recipientName?: string | null; phone?: string | null; formattedAddress?: string | null; instructions?: string | null; latitude?: number | null; longitude?: number | null };
  items: Array<{ productId: string; name: string; quantity: number }>;
  order?: { id: string; status: string } | null;
  run?: { id: string; routeCode: string; status: string; slotStart?: string | null; slotEnd?: string | null; rider?: { user?: { name?: string | null } | null } | null } | null;
  readiness: { status: 'PENDING' | 'READY' | 'SHORTAGE'; note?: string | null; updatedAt?: string | null };
  inventoryReservation: 'FORECAST_ONLY' | 'RESERVED_BY_ORDER';
  packingAvailableNow: boolean;
};

function money(paise: number) {
  return `₹${(Number(paise || 0) / 100).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;
}
function title(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function StoreSubscriptionOperationsPage() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("prep");
  const [runs, setRuns] = useState<Run[]>([]);
  const [demand, setDemand] = useState<DemandRow[]>([]);
  const [cash, setCash] = useState<CashBatch[]>([]);
  const [exceptions, setExceptions] = useState<ExceptionRow[]>([]);
  const [prepRows, setPrepRows] = useState<PreparationRow[]>([]);
  const [prepLoading, setPrepLoading] = useState(false);
  const [shortageNotes, setShortageNotes] = useState<Record<string, string>>({});
  const [shortageDialogOpen, setShortageDialogOpen] = useState<string | null>(null);
  const [prepModalOpen, setPrepModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [packingRun, setPackingRun] = useState<Run | null>(null);
  const [packedBags, setPackedBags] = useState("");
  const [crateCode, setCrateCode] = useState("");
  const [packingNote, setPackingNote] = useState("");
  const [verifyBatch, setVerifyBatch] = useState<CashBatch | null>(null);
  const [verifiedAmount, setVerifiedAmount] = useState("");
  const [settlementReference, setSettlementReference] = useState("");
  const [varianceReason, setVarianceReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [runsResponse, demandResponse, cashResponse, exceptionsResponse, prepResponse] =
        await Promise.all([
          apiClient.get("/store/subscription-operations/runs"),
          apiClient.get("/store/subscription-operations/demand", {
            params: { days: 14 },
          }),
          apiClient.get("/store/subscription-operations/cash-batches"),
          apiClient.get("/store/subscription-operations/exceptions"),
          apiClient.get("/store/subscription-preparation", { params: { days: 3 } }),
        ]);
      setRuns(Array.isArray(runsResponse.data) ? runsResponse.data : []);
      setDemand(Array.isArray(demandResponse.data) ? demandResponse.data : []);
      setCash(Array.isArray(cashResponse.data) ? cashResponse.data : []);
      setExceptions(
        Array.isArray(exceptionsResponse.data) ? exceptionsResponse.data : []
      );
      setPrepRows(Array.isArray(prepResponse.data) ? prepResponse.data : []);
    } catch (error) {
      toast.error(
        getToastErrorMessage(
          error,
          "Subscription operations could not be loaded."
        )
      );
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (
    key: string,
    request: () => Promise<unknown>,
    success: string
  ) => {
    setWorking(key);
    try {
      await request();
      toast.success(success);
      await load();
    } catch (error) {
      toast.error(getToastErrorMessage(error, "The store operation failed."));
    } finally {
      setWorking("");
    }
  };

  const confirmPacking = () =>
    act(
      "packing",
      async () => {
        if (!packingRun) throw new Error("Choose a route to pack.");
        const expected = Number(
          packingRun.expectedBagCount ||
            packingRun.totalStopCount ||
            packingRun.stops.length
        );
        const packed = Number(packedBags);
        if (!Number.isInteger(packed) || packed < 1)
          throw new Error("Enter a valid packed bag count.");
        if (packed !== expected && packingNote.trim().length < 5)
          throw new Error("Explain the bag-count exception.");
        await apiClient.post(
          `/store/subscription-operations/runs/${packingRun.id}/packing`,
          {
            version: packingRun.version,
            expectedBagCount: expected,
            packedBagCount: packed,
            crateCode: crateCode.trim() || undefined,
            exceptionNote: packingNote.trim() || undefined,
          }
        );
        setPackingRun(null);
        setPackedBags("");
        setCrateCode("");
        setPackingNote("");
      },
      "Route bags verified and packing confirmed."
    );

  const confirmPickup = (run: Run) =>
    act(
      `pickup-${run.id}`,
      () =>
        apiClient.post(`/store/subscription-operations/runs/${run.id}/pickup`, {
          version: run.version,
        }),
      "store handoff confirmed. The rider must independently verify the bags before starting."
    );

  const verifyCash = () =>
    act(
      "cash-verify",
      async () => {
        if (!verifyBatch) throw new Error("Choose a submitted cash batch.");
        const paise = Math.round(Number(verifiedAmount) * 100);
        if (!Number.isFinite(paise) || paise < 0)
          throw new Error("Enter the independently counted amount.");
        if (settlementReference.trim().length < 3)
          throw new Error("Enter a settlement reference.");
        if (
          paise !== verifyBatch.expectedAmountPaise &&
          varianceReason.trim().length < 3
        )
          throw new Error("A variance reason is required.");
        await apiClient.post(
          `/store/subscription-operations/cash-batches/${verifyBatch.id}/verify`,
          {
            version: verifyBatch.version,
            verifiedAmountPaise: paise,
            settlementReference: settlementReference.trim(),
            varianceReason: varianceReason.trim() || undefined,
          },
          {
            headers: {
              "Idempotency-Key": `web-store-cash:${verifyBatch.id}:v${verifyBatch.version}`,
            },
          }
        );
        setVerifyBatch(null);
        setVerifiedAmount("");
        setSettlementReference("");
        setVarianceReason("");
      },
      "Physical cash verification recorded against individual COD ledgers."
    );

  const prepPending = prepRows.filter((row) => row.readiness.status === 'PENDING').length;
  const prepShortages = prepRows.filter((row) => row.readiness.status === 'SHORTAGE').length;

  const decide = async (row: PreparationRow, decision: 'READY' | 'SHORTAGE') => {
    if (decision === 'SHORTAGE') {
      setShortageDialogOpen(row.id);
      return;
    }
    setWorking(`${row.id}:${decision}`);
    try {
      const nonce = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      await apiClient.post(
        `/store/subscription-preparation/deliveries/${encodeURIComponent(row.id)}/readiness`,
        { decision, note: undefined },
        { headers: { 'Idempotency-Key': `store-preparation:${row.id}:${decision}:${nonce}` } },
      );
      toast.success('Stock readiness confirmed.');
      await load();
    } catch (error) {
      toast.error(getToastErrorMessage(error, 'Stock readiness could not be recorded.'));
    } finally {
      setWorking('');
    }
  };

  const confirmShortage = async (rowId: string) => {
    const note = shortageNotes[rowId]?.trim();
    if (!note || note.length < 5) {
      toast.warning('Describe the shortage so Admin can resolve it before generation or packing (min 5 characters).');
      return;
    }
    setWorking(`${rowId}:SHORTAGE`);
    try {
      const nonce = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      await apiClient.post(
        `/store/subscription-preparation/deliveries/${encodeURIComponent(rowId)}/readiness`,
        { decision: 'SHORTAGE', note },
        { headers: { 'Idempotency-Key': `store-preparation:${rowId}:SHORTAGE:${nonce}` } },
      );
      toast.success('Shortage reported to Admin.');
      setShortageDialogOpen(null);
      setShortageNotes((prev) => ({ ...prev, [rowId]: '' }));
      await load();
    } catch (error) {
      toast.error(getToastErrorMessage(error, 'Shortage could not be reported.'));
    } finally {
      setWorking('');
    }
  };

  const totalStops = runs.reduce(
    (sum, run) => sum + Number(run.totalStopCount || run.stops.length),
    0
  );
  const forecastItems = demand.reduce(
    (sum, row) =>
      sum +
      row.productTotals.reduce((itemSum, item) => itemSum + item.quantity, 0),
    0
  );
  const submittedCash = cash
    .filter((batch) => batch.status === "SUBMITTED")
    .reduce((sum, batch) => sum + Number(batch.submittedAmountPaise || 0), 0);
  const pendingCashCount = cash.filter(
    (batch) => batch.status === "SUBMITTED"
  ).length;
  const tabCounts = useMemo<Record<Tab, number>>(
    () => ({
      prep: prepPending + prepShortages,
      runs: runs.length,
      forecast: forecastItems,
      cash: pendingCashCount,
      exceptions: exceptions.length,
    }),
    [prepPending, prepShortages, runs.length, forecastItems, pendingCashCount, exceptions.length]
  );

  return (
    <DashboardLayout allowedRole="STORE_OWNER">
      <div className="space-y-6">
        <header className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-700 p-6 text-white shadow-xl">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="mt-2 text-3xl font-hero">
                Morning Runs & Cash Control
              </h1>
            </div>
            <button
              onClick={() => void load()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white/15 px-4 text-sm font-nav hover:bg-white/25"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
            <button
              onClick={() => setPrepModalOpen(true)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600/30 px-4 text-sm font-black text-white hover:bg-emerald-600/50"
            >
              Open tomorrow subscription preparation
            </button>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-4">
            <HeroMetric label="Routes today" value={String(runs.length)} />
            <HeroMetric label="Customer bags" value={String(totalStops)} />
            <HeroMetric label="14-day items" value={String(forecastItems)} />
            <HeroMetric label="Cash to count" value={money(submittedCash)} />
          </div>
        </header>

        <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          {(
            [
              ["prep", "Tomorrow prep"],
              ["runs", "Preparation runs"],
              ["forecast", "Demand forecast"],
              ["cash", "Cash batches"],
              ["exceptions", "Exceptions"],
            ] as Array<[Tab, string]>
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-black ${
                tab === value
                  ? "bg-emerald-700 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {label}
              {tabCounts[value] > 0 && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] ${
                    tab === value ? "bg-white/20" : "bg-slate-100"
                  }`}
                >
                  {tabCounts[value] > 999 ? "999+" : tabCounts[value]}
                </span>
              )}
            </button>
          ))}
        </nav>

        {loading ? (
          <State
            icon={RefreshCw}
            title="Loading subscription operations"
            text="Fetching route, demand, exception, and cash data…"
            spin
          />
        ) : (
          <>
            {tab === "prep" && (
              <section className="space-y-3">
                {prepRows.length ? (
                  <>
                    <div className="grid gap-2 sm:grid-cols-4">
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                        <p className="text-[10px] font-black uppercase text-slate-400">Total Deliveries</p>
                        <p className="mt-1 text-xl font-black text-slate-900">{prepRows.length}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                        <p className="text-[10px] font-black uppercase text-slate-400">Pending</p>
                        <p className="mt-1 text-xl font-black text-amber-700">{prepRows.filter((r) => r.readiness.status === 'PENDING').length}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                        <p className="text-[10px] font-black uppercase text-slate-400">Ready</p>
                        <p className="mt-1 text-xl font-black text-emerald-700">{prepRows.filter((r) => r.readiness.status === 'READY').length}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                        <p className="text-[10px] font-black uppercase text-slate-400">Shortage</p>
                        <p className="mt-1 text-xl font-black text-red-700">{prepRows.filter((r) => r.readiness.status === 'SHORTAGE').length}</p>
                      </div>
                    </div>
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                      <table className="min-w-full text-left text-xs">
                        <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-3 py-2.5 font-black">Date</th>
                            <th className="px-3 py-2.5 font-black">Customer</th>
                            <th className="px-3 py-2.5 font-black">Phone</th>
                            <th className="px-3 py-2.5 font-black">Slot</th>
                            <th className="px-3 py-2.5 font-black">Items</th>
                            <th className="px-3 py-2.5 font-black">Status</th>
                            <th className="px-3 py-2.5 font-black">Readiness</th>
                            <th className="px-3 py-2.5 font-black">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {prepRows.map((row) => {
                            const slotTime = row.run?.slotStart
                              ? new Date(row.run.slotStart).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
                              : null;
                            const slotEnd = row.run?.slotEnd
                              ? new Date(row.run.slotEnd).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
                              : null;
                            const slotLabel = row.deliverySlot || (slotTime ? (parseInt(slotTime) < 12 ? 'AM' : 'PM') : '—');
                            return (
                              <tr key={row.id} className={`hover:bg-emerald-50/30 ${row.readiness.status === 'SHORTAGE' ? 'bg-red-50/50' : ''}`}>
                                <td className="whitespace-nowrap px-3 py-2.5 font-bold text-slate-800">
                                  {new Date(row.serviceDate).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2.5 font-black text-slate-900">{row.address.recipientName || row.customer.name || 'Customer'}</td>
                                <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-600">{row.customer.deliveryPhone || row.address.phone || '—'}</td>
                                <td className="whitespace-nowrap px-3 py-2.5">
                                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${slotLabel === 'PM' ? 'bg-indigo-100 text-indigo-700' : slotLabel === 'AM' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                                    {slotLabel}{slotTime ? ` ${slotTime}${slotEnd ? `-${slotEnd}` : ''}` : ''}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5">
                                  <div className="flex flex-wrap gap-1 max-w-[200px]">
                                    {row.items.slice(0, 2).map((item) => (
                                      <span key={item.productId} className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">{item.quantity}× {item.name}</span>
                                    ))}
                                    {row.items.length > 2 && <span className="text-[10px] text-slate-400">+{row.items.length - 2}</span>}
                                  </div>
                                </td>
                                <td className="whitespace-nowrap px-3 py-2.5">
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600">{row.deliveryStatus.replaceAll('_', ' ')}</span>
                                </td>
                                <td className="whitespace-nowrap px-3 py-2.5">
                                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${row.readiness.status === 'READY' ? 'bg-emerald-100 text-emerald-800' : row.readiness.status === 'SHORTAGE' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{row.readiness.status}</span>
                                </td>
                                <td className="whitespace-nowrap px-3 py-2.5">
                                  {row.readiness.status === 'PENDING' ? (
                                    <div className="flex gap-1">
                                      <button
                                        disabled={working.startsWith(row.id)}
                                        onClick={() => void decide(row, 'READY')}
                                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50"
                                        title="Mark Ready"
                                      >
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        disabled={working.startsWith(row.id)}
                                        onClick={() => void decide(row, 'SHORTAGE')}
                                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
                                        title="Report Shortage"
                                      >
                                        <AlertTriangle className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  ) : row.readiness.status === 'SHORTAGE' && row.readiness.note ? (
                                    <p className="max-w-[150px] truncate text-[10px] text-red-600">{row.readiness.note}</p>
                                  ) : (
                                    <span className="text-[10px] text-slate-400">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <State
                    icon={CheckCircle2}
                    title="No upcoming subscription preparation"
                    text="New subscription demand will appear here immediately and remain forecast-only until its real order is generated."
                  />
                )}
              </section>
            )}

            {tab === "runs" && (
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {runs.length ? (
                  <table className="min-w-full text-left text-xs">
                    <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2.5 font-black">Route</th>
                        <th className="px-3 py-2.5 font-black">Schedule</th>
                        <th className="px-3 py-2.5 font-black">Zone</th>
                        <th className="px-3 py-2.5 font-black">Rider</th>
                        <th className="px-3 py-2.5 font-black">Stops</th>
                        <th className="px-3 py-2.5 font-black">Bags</th>
                        <th className="px-3 py-2.5 font-black">Cash Due</th>
                        <th className="px-3 py-2.5 font-black">Status</th>
                        <th className="px-3 py-2.5 font-black">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {runs.map((run) => (
                        <tr key={run.id} className="hover:bg-emerald-50/30">
                          <td className="whitespace-nowrap px-3 py-2.5 font-black text-slate-900">{run.routeCode}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-700">
                            {run.slotStart && run.slotEnd ? (
                              <>
                                {new Date(run.slotStart).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" })} · {new Date(run.slotStart).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}–{new Date(run.slotEnd).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}
                              </>
                            ) : "—"}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-600">{run.deliveryZone?.name || "—"}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-600">{run.rider?.user?.name || "Unassigned"}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 font-bold text-slate-800">{run.totalStopCount || run.stops.length}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 font-bold text-slate-800">{run.expectedBagCount || run.totalStopCount || run.stops.length}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 font-black text-amber-700">{money(run.expectedCashPaise)}</td>
                          <td className="whitespace-nowrap px-3 py-2.5">
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600">{title(run.status)}</span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5">
                            {run.status === "PLANNED" && (
                              <button
                                onClick={() => {
                                  setPackingRun(run);
                                  setPackedBags(String(run.expectedBagCount || run.totalStopCount || run.stops.length));
                                }}
                                className="inline-flex min-h-7 items-center gap-1 rounded-lg bg-emerald-700 px-2.5 text-[10px] font-black text-white hover:bg-emerald-800"
                              >
                                <PackageCheck className="h-3 w-3" /> Pack
                              </button>
                            )}
                            {run.status === "READY_FOR_PICKUP" && (
                              <button
                                disabled={working === `pickup-${run.id}`}
                                onClick={() => confirmPickup(run)}
                                className="inline-flex min-h-7 items-center gap-1 rounded-lg bg-teal-700 px-2.5 text-[10px] font-black text-white hover:bg-teal-800 disabled:opacity-60"
                              >
                                <Truck className="h-3 w-3" /> {working === `pickup-${run.id}` ? "Confirming…" : "Handoff"}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <State
                    icon={Route}
                    title="No preparation runs today"
                    text="Generated subscription orders will be grouped here by service date, store, slot, and cluster."
                  />
                )}
              </section>
            )}

            {tab === "forecast" && (
              <section className="grid gap-4 lg:grid-cols-2">
                {demand.length ? (
                  demand.map((row) => (
                    <article
                      key={`${row.storeId}:${row.serviceDate}`}
                      className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-lg font-black text-slate-950">
                            {new Date(
                              `${row.serviceDate}T00:00:00`
                            ).toLocaleDateString("en-IN", {
                              weekday: "long",
                              day: "numeric",
                              month: "short",
                            })}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {row.stopCount} future customer bag
                            {row.stopCount === 1 ? "" : "s"}
                          </p>
                        </div>
                        <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-800">
                          <Box className="h-4 w-4" />
                          {row.productTotals.reduce(
                            (sum, item) => sum + item.quantity,
                            0
                          )}{" "}
                          items
                        </span>
                      </div>
                      <div className="mt-4 divide-y rounded-2xl bg-slate-50 px-4">
                        {row.productTotals.map((item) => (
                          <div
                            key={item.productId}
                            className="flex items-center justify-between py-3"
                          >
                            <span className="font-bold text-slate-700">
                              {item.name}
                            </span>
                            <span className="font-black text-slate-950">
                              × {item.quantity}
                            </span>
                          </div>
                        ))}
                      </div>
                      <p className="mt-3 text-xs text-slate-500">
                        Forecast only. Inventory is reserved when each actual
                        delivery order is generated.
                      </p>
                    </article>
                  ))
                ) : (
                  <State
                    icon={Box}
                    title="No forecast demand"
                    text="Future active subscription occurrences will appear here."
                  />
                )}
              </section>
            )}

            {tab === "cash" && (
              <section className="grid gap-4 xl:grid-cols-2">
                {cash.length ? (
                  cash.map((batch) => (
                    <article
                      key={batch.id}
                      className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
                    >
                      <div className="flex items-start gap-3">
                        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-100 text-amber-700">
                          <Banknote className="h-6 w-6" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-black text-slate-950">
                            {batch.reference}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Rider: {batch.rider?.user?.name || "Assigned rider"}{" "}
                            · {title(batch.status)}
                          </p>
                        </div>
                        <p className="text-xl font-black text-amber-800">
                          {money(
                            batch.status === "SUBMITTED"
                              ? batch.submittedAmountPaise
                              : batch.expectedAmountPaise
                          )}
                        </p>
                      </div>
                      <div className="mt-4 grid grid-cols-4 gap-2">
                        <Metric
                          label="Expected"
                          value={money(batch.expectedAmountPaise)}
                        />
                        <Metric
                          label="Submitted"
                          value={money(batch.submittedAmountPaise)}
                        />
                        <Metric
                          label="Verified"
                          value={money(batch.verifiedAmountPaise)}
                        />
                        <Metric
                          label="Variance"
                          value={money(batch.variancePaise)}
                          danger={batch.variancePaise !== 0}
                        />
                      </div>
                      {batch.status === "SUBMITTED" && (
                        <button
                          onClick={() => {
                            setVerifyBatch(batch);
                            setVerifiedAmount(
                              String(batch.submittedAmountPaise / 100)
                            );
                            setSettlementReference(`STORE-${batch.reference}`);
                          }}
                          className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-amber-700 font-black text-white hover:bg-amber-800"
                        >
                          <ClipboardCheck className="h-5 w-5" />
                          Independently count and verify
                        </button>
                      )}
                    </article>
                  ))
                ) : (
                  <State
                    icon={Banknote}
                    title="No rider cash batches"
                    text="Submitted batches will appear here for independent store verification."
                  />
                )}
              </section>
            )}

            {tab === "exceptions" && (
              <section className="space-y-3">
                {exceptions.length ? (
                  exceptions.map((row) => (
                    <article
                      key={row.id}
                      className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4"
                    >
                      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
                      <div>
                        <p className="font-black text-red-950">
                          {row.deliveryRun.routeCode} · Stop{" "}
                          {row.sequenceNumber} · {title(row.status)}
                        </p>
                        <p className="mt-1 text-sm text-red-800">
                          {row.failureReason ||
                            "Operational follow-up required."}
                        </p>
                      </div>
                    </article>
                  ))
                ) : (
                  <State
                    icon={CheckCircle2}
                    title="No open exceptions"
                    text="Failed, retry-pending, and return-required stops will appear here."
                  />
                )}
              </section>
            )}
          </>
        )}

        {packingRun && (
          <Modal
            title={`Pack route ${packingRun.routeCode}`}
            onClose={() => setPackingRun(null)}
          >
            <div className="rounded-2xl bg-emerald-50 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-emerald-700">
                Expected bags
              </p>
              <p className="mt-1 text-3xl font-black text-emerald-950">
                {packingRun.expectedBagCount ||
                  packingRun.totalStopCount ||
                  packingRun.stops.length}
              </p>
            </div>
            <Field label="Packed bag count">
              <input
                value={packedBags}
                onChange={(event) =>
                  setPackedBags(event.target.value.replace(/\D/g, ""))
                }
                inputMode="numeric"
                className="h-12 w-full rounded-xl border border-slate-300 px-4 text-lg font-black outline-none focus:border-emerald-500"
              />
            </Field>
            <Field label="Route crate QR / code">
              <div className="flex h-12 items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4">
                <ScanLine className="h-5 w-5 text-emerald-700" />
                <input
                  value={crateCode}
                  onChange={(event) => setCrateCode(event.target.value)}
                  placeholder="Scan or enter crate code"
                  className="min-w-0 flex-1 bg-transparent outline-none"
                />
              </div>
            </Field>
            <Field label="Exception note">
              <textarea
                value={packingNote}
                onChange={(event) => setPackingNote(event.target.value)}
                rows={3}
                placeholder="Required only when packed and expected counts differ"
                className="w-full rounded-xl border border-slate-300 p-3 outline-none focus:border-emerald-500"
              />
            </Field>
            <button
              disabled={working === "packing"}
              onClick={confirmPacking}
              className="min-h-12 w-full rounded-xl bg-emerald-700 font-black text-white disabled:opacity-60"
            >
              {working === "packing" ? "Confirming…" : "Confirm route packing"}
            </button>
          </Modal>
        )}

        {verifyBatch && (
          <Modal
            title={`Verify ${verifyBatch.reference}`}
            onClose={() => setVerifyBatch(null)}
          >
            <div className="grid grid-cols-2 gap-3">
              <Metric
                label="Server expected"
                value={money(verifyBatch.expectedAmountPaise)}
              />
              <Metric
                label="Rider submitted"
                value={money(verifyBatch.submittedAmountPaise)}
              />
            </div>
            <Field label="Physical amount independently counted">
              <input
                value={verifiedAmount}
                onChange={(event) => setVerifiedAmount(event.target.value)}
                inputMode="decimal"
                className="h-12 w-full rounded-xl border border-slate-300 px-4 text-lg font-black outline-none focus:border-amber-500"
              />
            </Field>
            <Field label="Settlement reference">
              <input
                value={settlementReference}
                onChange={(event) => setSettlementReference(event.target.value)}
                className="h-12 w-full rounded-xl border border-slate-300 px-4 font-bold outline-none focus:border-amber-500"
              />
            </Field>
            <Field label="Variance reason (required when different)">
              <textarea
                value={varianceReason}
                onChange={(event) => setVarianceReason(event.target.value)}
                rows={3}
                className="w-full rounded-xl border border-slate-300 p-3 outline-none focus:border-amber-500"
              />
            </Field>
            <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
              Verification creates immutable deposit entries on every included
              COD ledger. A difference becomes VARIANCE_REVIEW and cannot be
              silently written off.
            </p>
            <button
              disabled={working === "cash-verify"}
              onClick={verifyCash}
              className="min-h-12 w-full rounded-xl bg-amber-700 font-black text-white disabled:opacity-60"
            >
              {working === "cash-verify"
                ? "Verifying…"
                : "Verify physical cash batch"}
            </button>
          </Modal>
        )}

        {shortageDialogOpen && (
          <Modal
            title="Report Shortage"
            onClose={() => setShortageDialogOpen(null)}
          >
            <p className="text-xs text-slate-600 mb-4">Enter the shortage reason (minimum 5 characters) so Admin can resolve it before generation or packing.</p>
            <Field label="Shortage Reason">
              <textarea
                value={shortageNotes[shortageDialogOpen] || ''}
                onChange={(event) => setShortageNotes((prev) => ({ ...prev, [shortageDialogOpen]: event.target.value }))}
                rows={3}
                className="w-full rounded-xl border border-slate-300 p-3 outline-none focus:border-red-500"
                placeholder="Describe the shortage..."
              />
            </Field>
            <div className="flex gap-2">
              <button
                onClick={() => setShortageDialogOpen(null)}
                className="min-h-10 flex-1 rounded-xl border border-slate-200 text-xs font-black"
              >
                Cancel
              </button>
              <button
                disabled={working.startsWith(shortageDialogOpen)}
                onClick={() => void confirmShortage(shortageDialogOpen)}
                className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-600 text-xs font-black text-white disabled:opacity-50"
              >
                {working.startsWith(shortageDialogOpen) ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
                Report Shortage
              </button>
            </div>
          </Modal>
        )}

        {prepModalOpen && (
          <Modal title="Prepare before delivery day" onClose={() => setPrepModalOpen(false)}>
            <p className="text-xs text-slate-600 mb-4">
              Inventory is deducted only when the real subscription order is generated. This
              preparation step ensures stock readiness without replacing individual COD ledgers.
            </p>
            <p className="text-sm text-slate-500">
              Forecast only. Inventory is reserved when each actual delivery order is generated.
            </p>
          </Modal>
        )}
      </div>
    </DashboardLayout>
  );
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/10 p-4">
      <p className="text-xs font-bold text-emerald-100">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </div>
  );
}
function Metric({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 text-center">
      <p
        className={`text-base font-black ${
          danger ? "text-red-700" : "text-slate-950"
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-[10px] font-black uppercase tracking-wide text-slate-500">
        {label}
      </p>
    </div>
  );
}
function State({
  icon: Icon,
  title,
  text,
  spin = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  text: string;
  spin?: boolean;
}) {
  return (
    <div className="col-span-full grid min-h-64 place-items-center rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <div>
        <Icon
          className={`mx-auto h-12 w-12 text-slate-300 ${
            spin ? "animate-spin" : ""
          }`}
        />
        <h2 className="mt-4 text-xl font-black text-slate-900">{title}</h2>
        <p className="mt-2 text-sm text-slate-500">{text}</p>
      </div>
    </div>
  );
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 sm:items-center sm:p-5">
      <div className="max-h-[94vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black text-slate-950">{title}</h2>
          <button
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-5 space-y-4">{children}</div>
      </div>
    </div>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-xs font-black uppercase tracking-wide text-slate-500">
      {label}
      <div className="mt-2 normal-case tracking-normal">{children}</div>
    </label>
  );
}
