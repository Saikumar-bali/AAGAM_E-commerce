"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { getToastErrorMessage, useToast } from "@/components/ToastProvider";
import { apiClient } from "@aagam/utils";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  KeyRound,
  MapPin,
  Navigation,
  Package,
  RefreshCw,
  Route,
  ShieldCheck,
  Store,
  X,
  Camera,
  Plus,
  ArrowUpDown,
  Sun,
  Moon,
  Loader2,
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
type StopStatus =
  | "PLANNED"
  | "READY"
  | "ARRIVED"
  | "DELIVERED"
  | "FAILED"
  | "RETRY_PENDING"
  | "RETURN_REQUIRED"
  | "RETURNED"
  | "CANCELLED";
type FailureReason =
  | "CUSTOMER_UNREACHABLE"
  | "CUSTOMER_REFUSED"
  | "ADDRESS_NOT_FOUND"
  | "WRONG_ADDRESS"
  | "PAYMENT_NOT_AVAILABLE"
  | "VEHICLE_BREAKDOWN"
  | "PACKAGE_DAMAGED"
  | "SAFETY_CONCERN"
  | "OTHER";

type RunStop = {
  id: string;
  sequenceNumber: number;
  status: StopStatus;
  version: number;
  cashDuePaise: number;
  proofMode: string;
  expectedParcelCount: number;
  failureReason?: string | null;
  deliveryJob: {
    order: {
      id: string;
      customer?: { name?: string | null; phone?: string | null } | null;
      items: Array<{ id: string; quantity: number; product: { name: string } }>;
    };
  };
  subscriptionDelivery: {
    subscription: {
      addressSnapshot?: Record<string, unknown> | null;
      deliveryMethod:
        | "TRUSTED_DROP"
        | "PERSONAL_HANDOVER"
        | "SECURITY_RECEPTION";
      trustedDropInstructions?: string | null;
    };
  };
};

type Run = {
  id: string;
  routeCode: string;
  deliveryZone?: { id: string; code: string; name: string } | null;
  estimatedDistanceKm?: number;
  estimatedDurationMinutes?: number;
  assignmentReasonSummary?: string | null;
  status: RunStatus;
  serviceDate: string;
  slotStart: string;
  slotEnd: string;
  totalStopCount: number;
  completedStopCount: number;
  failedStopCount: number;
  retryPendingStopCount: number;
  expectedCashPaise: number;
  collectedCashPaise: number;
  depositedCashPaise: number;
  version: number;
  expectedBagCount?: number;
  packedBagCount?: number;
  crateCode?: string | null;
  storeHandoffConfirmedAt?: string | null;
  pickupConfirmedAt?: string | null;
  store: {
    name: string;
    address: string;
    latitude?: number | null;
    longitude?: number | null;
  };
  stops?: RunStop[];
};

type CashLedger = { id: string; riderHoldingBalancePaise: number };
type CashAccountability = {
  riderHoldingPaise: number;
  expectedCashPaise: number;
  collectedCashPaise: number;
  depositedCashPaise: number;
  ledgers: CashLedger[];
};
type CashBatch = { id: string; version: number; expectedAmountPaise: number };

type Coordinates = {
  latitude: number;
  longitude: number;
  accuracyMetres?: number;
};

const failures: Array<{ value: FailureReason; label: string }> = [
  ["CUSTOMER_UNREACHABLE", "Customer unreachable"],
  ["CUSTOMER_REFUSED", "Customer refused"],
  ["ADDRESS_NOT_FOUND", "Address not found"],
  ["WRONG_ADDRESS", "Wrong address"],
  ["PAYMENT_NOT_AVAILABLE", "Cash unavailable"],
  ["PACKAGE_DAMAGED", "Package damaged"],
  ["VEHICLE_BREAKDOWN", "Vehicle breakdown"],
  ["SAFETY_CONCERN", "Safety concern"],
  ["OTHER", "Other"],
].map(([value, label]) => ({ value: value as FailureReason, label }));

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
function snapshotText(snapshot: Record<string, unknown> | null | undefined) {
  return (
    [
      "label",
      "addressLine1",
      "addressLine2",
      "landmark",
      "city",
      "state",
      "postalCode",
    ]
      .map((key) => snapshot?.[key])
      .filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0
      )
      .join(", ") || "Customer delivery address"
  );
}
function coordinates(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation)
      return reject(
        new Error("This browser does not provide precise location.")
      );
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMetres: position.coords.accuracy,
        }),
      () =>
        reject(
          new Error("Allow precise location before completing route proof.")
        ),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 4000 }
    );
  });
}

export default function RiderRunsPage() {
  const toast = useToast();
  const [runs, setRuns] = useState<Run[]>([]);
  const [activeRun, setActiveRun] = useState<Run | null>(null);
  const [selectedStop, setSelectedStop] = useState<RunStop | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [dropToken, setDropToken] = useState("");
  const [proofReference, setProofReference] = useState("");
  const [note, setNote] = useState("");
  const [failureReason, setFailureReason] = useState<FailureReason>(
    "CUSTOMER_UNREACHABLE"
  );
  const [failureNote, setFailureNote] = useState("");
  const [retryRequested, setRetryRequested] = useState(true);
  const [cash, setCash] = useState<CashAccountability | null>(null);
  const [batch, setBatch] = useState<CashBatch | null>(null);
  const [submittedCash, setSubmittedCash] = useState("");
  const [pickupCrateCode, setPickupCrateCode] = useState("");

  // Photo proof & in-flight states
  const [evidenceStorageKey, setEvidenceStorageKey] = useState<string | null>(null);
  const [evidencePreview, setEvidencePreview] = useState<string | null>(null);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [collectedCashInput, setCollectedCashInput] = useState("");

  // In-flight: Extra Milk Modal
  const [extraMilkModalStop, setExtraMilkModalStop] = useState<RunStop | null>(null);
  const [extraMilkText, setExtraMilkText] = useState("1 Packet Full Cream Milk");
  const [extraPriceRupees, setExtraPriceRupees] = useState("40");

  // In-flight: Payment Modal
  const [paymentModalStop, setPaymentModalStop] = useState<RunStop | null>(null);
  const [paymentAmountRupees, setPaymentAmountRupees] = useState("");
  const [paymentMode, setPaymentMode] = useState<"CASH" | "PHONE_PE">("CASH");

  // In-flight: Skip Modal
  const [skipModalStop, setSkipModalStop] = useState<RunStop | null>(null);
  const [skipReason, setSkipReason] = useState("Customer requested skip / not needed");

  const loadRuns = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get("/rider/delivery-runs/today");
      const rows: Run[] = Array.isArray(response.data) ? response.data : [];
      setRuns(rows);
      const currentId =
        activeRun?.id ||
        rows.find((run) =>
          ["PICKED_UP", "IN_PROGRESS", "AWAITING_SETTLEMENT"].includes(
            run.status
          )
        )?.id;
      if (currentId) {
        const detail = await apiClient.get(
          `/rider/delivery-runs/${encodeURIComponent(currentId)}`
        );
        setActiveRun(detail.data);
        if (["AWAITING_SETTLEMENT", "COMPLETED"].includes(detail.data.status)) {
          const cashResponse = await apiClient.get(
            `/rider/delivery-runs/${encodeURIComponent(
              currentId
            )}/cash-accountability`
          );
          setCash(cashResponse.data);
        }
      }
    } catch (error) {
      toast.error(
        getToastErrorMessage(error, "Delivery runs could not be loaded.")
      );
    } finally {
      setLoading(false);
    }
  }, [activeRun?.id, toast]);

  useEffect(() => {
    void loadRuns();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openRun = async (runId: string) => {
    setWorking(`open-${runId}`);
    try {
      const response = await apiClient.get(
        `/rider/delivery-runs/${encodeURIComponent(runId)}`
      );
      setActiveRun(response.data);
      setSelectedStop(null);
      if (["AWAITING_SETTLEMENT", "COMPLETED"].includes(response.data.status)) {
        const cashResponse = await apiClient.get(
          `/rider/delivery-runs/${encodeURIComponent(
            runId
          )}/cash-accountability`
        );
        setCash(cashResponse.data);
      } else setCash(null);
    } catch (error) {
      toast.error(getToastErrorMessage(error, "The run could not be opened."));
    } finally {
      setWorking("");
    }
  };

  const refreshActive = async () => {
    if (!activeRun) return loadRuns();
    const response = await apiClient.get(
      `/rider/delivery-runs/${encodeURIComponent(activeRun.id)}`
    );
    setActiveRun(response.data);
    setRuns((current) =>
      current.map((run) =>
        run.id === response.data.id
          ? { ...run, ...response.data, stops: undefined }
          : run
      )
    );
    if (["AWAITING_SETTLEMENT", "COMPLETED"].includes(response.data.status)) {
      const cashResponse = await apiClient.get(
        `/rider/delivery-runs/${encodeURIComponent(
          activeRun.id
        )}/cash-accountability`
      );
      setCash(cashResponse.data);
    }
  };

  const act = async (
    key: string,
    request: () => Promise<unknown>,
    success: string
  ) => {
    setWorking(key);
    try {
      await request();
      toast.success(success);
      await refreshActive();
    } catch (error) {
      toast.error(getToastErrorMessage(error, "The route action failed."));
    } finally {
      setWorking("");
    }
  };

  const arrive = (stop: RunStop) =>
    act(
      `arrive-${stop.id}`,
      async () => {
        const gps = await coordinates();
        await apiClient.post(
          `/rider/delivery-runs/${activeRun?.id}/stops/${stop.id}/arrive`,
          { ...gps, version: stop.version },
          {
            headers: {
              "Idempotency-Key": `web-arrive:${stop.id}:v${stop.version}`,
            },
          }
        );
      },
      "Arrival and GPS recorded."
    );

  const issueOtp = (stop: RunStop) =>
    act(
      `otp-${stop.id}`,
      () =>
        apiClient.post(
          `/rider/delivery-runs/${activeRun?.id}/stops/${stop.id}/otp`,
          {},
          {
            headers: {
              "Idempotency-Key": `web-otp:${stop.id}:v${stop.version}`,
            },
          }
        ),
      "OTP sent to the handover contact."
    );

  const complete = (stop: RunStop) =>
    act(
      `complete-${stop.id}`,
      async () => {
        const isPhotoGps = stop.proofMode === "RIDER_PHOTO_GPS";
        const trusted =
          stop.subscriptionDelivery.subscription.deliveryMethod ===
            "TRUSTED_DROP" && stop.cashDuePaise === 0;

        if (isPhotoGps) {
          if (!evidenceStorageKey) {
            throw new Error("Please capture or upload delivery photo proof before completing.");
          }
        } else if (trusted) {
          if (!dropToken.trim() || !proofReference.trim())
            throw new Error(
              "Secure drop token and proof reference are required."
            );
        } else {
          if (!/^\d{6}$/.test(otpCode))
            throw new Error("Enter the six-digit handover OTP.");
        }

        const gps = await coordinates();
        const cashAmt = collectedCashInput.trim()
          ? Math.round(parseFloat(collectedCashInput) * 100)
          : stop.cashDuePaise > 0
          ? stop.cashDuePaise
          : undefined;

        await apiClient.post(
          `/rider/delivery-runs/${activeRun?.id}/stops/${stop.id}/complete`,
          {
            ...gps,
            version: stop.version,
            riderConfirmed: true,
            evidenceId: isPhotoGps ? evidenceStorageKey : undefined,
            otpCode: isPhotoGps || trusted ? undefined : otpCode,
            trustedDropToken: trusted && !isPhotoGps ? dropToken.trim() : undefined,
            proofReference: trusted && !isPhotoGps ? proofReference.trim() : undefined,
            cashCollectedPaise: cashAmt,
            note: note.trim() || undefined,
          },
          {
            headers: {
              "Idempotency-Key": `web-complete:${stop.id}:v${stop.version}`,
            },
          }
        );
        setSelectedStop(null);
        setOtpCode("");
        setDropToken("");
        setProofReference("");
        setNote("");
        setEvidenceStorageKey(null);
        setEvidencePreview(null);
        setCollectedCashInput("");
      },
      "Delivery proof recorded and stop completed."
    );

  const handleExtraMilk = (stop: RunStop) =>
    act(
      `extra-${stop.id}`,
      async () => {
        if (!extraMilkText.trim()) throw new Error("Please enter milk/item description");
        const extraPricePaise = extraPriceRupees.trim() ? Math.round(parseFloat(extraPriceRupees) * 100) : undefined;
        await apiClient.post(
          `/rider/delivery-runs/${activeRun?.id}/stops/${stop.id}/extra-milk`,
          {
            extraMilkText: extraMilkText.trim(),
            extraPricePaise,
          }
        );
        setExtraMilkModalStop(null);
        await loadRuns();
      },
      "Extra milk added to stop successfully."
    );

  const handleToggleSlot = (stop: RunStop) =>
    act(
      `slot-${stop.id}`,
      async () => {
        await apiClient.post(
          `/rider/delivery-runs/${activeRun?.id}/stops/${stop.id}/toggle-slot`,
          {}
        );
        await loadRuns();
      },
      "Delivery slot updated."
    );

  const handleRecordPayment = (stop: RunStop) =>
    act(
      `pay-${stop.id}`,
      async () => {
        const amt = parseFloat(paymentAmountRupees);
        if (isNaN(amt) || amt <= 0) throw new Error("Please enter a valid payment amount in rupees");
        await apiClient.post(
          `/rider/delivery-runs/${activeRun?.id}/stops/${stop.id}/record-payment`,
          {
            amountPaise: Math.round(amt * 100),
            paymentMode,
          }
        );
        setPaymentModalStop(null);
        await loadRuns();
      },
      "Payment recorded successfully."
    );

  const handleSkipStop = (stop: RunStop) =>
    act(
      `skip-${stop.id}`,
      async () => {
        await apiClient.post(
          `/rider/delivery-runs/${activeRun?.id}/stops/${stop.id}/skip`,
          {
            reason: skipReason,
          }
        );
        setSkipModalStop(null);
        setSelectedStop(null);
        await loadRuns();
      },
      "Stop marked as skipped."
    );

  const fail = (stop: RunStop) =>
    act(
      `fail-${stop.id}`,
      async () => {
        const gps = await coordinates();
        await apiClient.post(
          `/rider/delivery-runs/${activeRun?.id}/stops/${stop.id}/fail`,
          {
            ...gps,
            version: stop.version,
            reason: failureReason,
            note: failureNote.trim() || undefined,
            retryRequested,
          },
          {
            headers: {
              "Idempotency-Key": `web-failure:${stop.id}:v${stop.version}`,
            },
          }
        );
        setSelectedStop(null);
        setFailureNote("");
      },
      retryRequested
        ? "Retry requirement recorded."
        : "Delivery failure recorded."
    );

  const createBatch = () =>
    act(
      "batch-create",
      async () => {
        if (!activeRun || !cash)
          throw new Error("Cash accountability is not loaded.");
        const ids = cash.ledgers
          .filter((ledger) => ledger.riderHoldingBalancePaise > 0)
          .map((ledger) => ledger.id);
        if (!ids.length)
          throw new Error("No rider-held ledger cash is eligible.");
        const response = await apiClient.post(
          `/rider/delivery-runs/${activeRun.id}/cash-batches`,
          { version: activeRun.version, codLedgerIds: ids },
          {
            headers: {
              "Idempotency-Key": `web-cash-batch:${activeRun.id}:v${activeRun.version}`,
            },
          }
        );
        setBatch(response.data);
        setSubmittedCash(String(response.data.expectedAmountPaise / 100));
      },
      "Cash batch created from individual COD ledgers."
    );

  const submitBatch = () =>
    act(
      "batch-submit",
      async () => {
        if (!batch) throw new Error("Create a cash batch first.");
        const paise = Math.round(Number(submittedCash) * 100);
        if (!Number.isFinite(paise) || paise < 0)
          throw new Error("Enter the physical amount handed to the store.");
        await apiClient.post(
          `/rider/delivery-runs/cash-batches/${batch.id}/submit`,
          { version: batch.version, submittedAmountPaise: paise },
          {
            headers: {
              "Idempotency-Key": `web-cash-submit:${batch.id}:v${batch.version}`,
            },
          }
        );
        setBatch(null);
        setSubmittedCash("");
      },
      "Physical cash submitted for independent store verification."
    );

  const confirmPickupReceipt = () =>
    act(
      "pickup-receipt",
      async () => {
        if (!activeRun) throw new Error("Choose a delivery run.");
        const expectedBagCount = Number(
          activeRun.expectedBagCount ||
            activeRun.totalStopCount ||
            activeRun.stops?.length ||
            0
        );
        await apiClient.post(
          `/rider/delivery-runs/${activeRun.id}/pickup`,
          {
            version: activeRun.version,
            expectedBagCount,
            crateCode: activeRun.crateCode ? pickupCrateCode.trim() : undefined,
          },
          {
            headers: {
              "Idempotency-Key": `web-pickup-receipt:${activeRun.id}:v${activeRun.version}`,
            },
          }
        );
        setPickupCrateCode("");
      },
      "Independent route-bag receipt recorded."
    );

  const activeStops = activeRun?.stops || [];
  const progress = activeRun
    ? Math.round(
        (Number(activeRun.completedStopCount || 0) /
          Math.max(1, Number(activeRun.totalStopCount || activeStops.length))) *
          100
      )
    : 0;
  const currentStop = useMemo(
    () =>
      activeStops.find((stop) =>
        ["READY", "PLANNED", "ARRIVED", "RETRY_PENDING"].includes(stop.status)
      ),
    [activeStops]
  );

  return (
    <DashboardLayout allowedRole="RIDER">
      <div className="space-y-6">
        <header className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-800 p-6 text-white ">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.24em] text-emerald-200">
                Morning operations
              </p>
              <h1 className="mt-2 text-3xl font-semibold">
                Subscription Delivery Runs
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-emerald-100">
                One route, individually verified stops. Funded deliveries show
                ₹0 due; cash is collected only on explicit funding stops.
              </p>
            </div>
            <button
              onClick={() => void loadRuns()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white/15 px-4 text-sm font-semibold hover:bg-white/25"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <HeroMetric label="Routes today" value={String(runs.length)} />
            <HeroMetric
              label="Stops complete"
              value={`${runs.reduce(
                (sum, run) => sum + Number(run.completedStopCount || 0),
                0
              )}/${runs.reduce(
                (sum, run) => sum + Number(run.totalStopCount || 0),
                0
              )}`}
            />
            <HeroMetric
              label="Cash held"
              value={money(
                runs.reduce(
                  (sum, run) =>
                    sum +
                    Math.max(
                      0,
                      Number(run.collectedCashPaise || 0) -
                        Number(run.depositedCashPaise || 0)
                    ),
                  0
                )
              )}
            />
          </div>
        </header>

        <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
          <aside className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-900">
              Today’s routes
            </h2>
            {loading && !runs.length ? (
              <div className="rounded-xl border bg-white p-8 text-center text-sm text-slate-500">
                Loading assigned runs…
              </div>
            ) : runs.length ? (
              runs.map((run) => (
                <button
                  key={run.id}
                  onClick={() => void openRun(run.id)}
                  className={`w-full rounded-xl border p-4 text-left  transition ${
                    activeRun?.id === run.id
                      ? "border-emerald-400 bg-emerald-50"
                      : "border-slate-200 bg-white hover:border-emerald-200"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
                      <Route className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-slate-900">
                        {run.routeCode}
                      </span>
                      <span className="block text-xs font-semibold text-emerald-700">{new Date(run.slotStart).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" })} · {new Date(run.slotStart).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}–{new Date(run.slotEnd).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {run.store.name}
                      </span>
                      <span className="mt-2 block text-xs font-bold text-emerald-700">
                        {run.completedStopCount}/{run.totalStopCount} stops ·{" "}
                        {title(run.status)}
                      </span>
                    </span>
                    <ChevronRight className="h-5 w-5 text-slate-400" />
                  </div>
                </button>
              ))
            ) : (
              <div className="rounded-xl border border-dashed bg-white p-8 text-center">
                <Route className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-3 font-semibold text-slate-800">No runs today</p>
              </div>
            )}
          </aside>

          <main>
            {activeRun ? (
              <div className="space-y-5">
                <section className="rounded-xl border border-slate-200 bg-white p-5 ">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                        {activeRun.deliveryZone?.name
                          ? `${activeRun.deliveryZone.name} · `
                          : ""}
                        {activeRun.routeCode}
                      </p>
                      <h2 className="mt-1 text-2xl font-semibold text-slate-950">
                        {activeRun.store.name}
                      </h2>
                      <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                        <Store className="h-4 w-4" />
                        {activeRun.store.address}
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
                      {title(activeRun.status)}
                    </span>
                  </div>
                  <div className="mt-5 flex items-center justify-between text-sm font-bold">
                    <span>
                      {activeRun.completedStopCount} of{" "}
                      {activeRun.totalStopCount} complete
                    </span>
                    <span className="text-emerald-700">{progress}%</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-5">
                    <Metric
                      label="Retry pending"
                      value={String(activeRun.retryPendingStopCount)}
                    />
                    <Metric
                      label="Distance"
                      value={`${Number(
                        activeRun.estimatedDistanceKm || 0
                      ).toFixed(1)} km`}
                    />
                    <Metric
                      label="Estimate"
                      value={`${activeRun.estimatedDurationMinutes || 0} min`}
                    />
                    <Metric
                      label="Expected cash"
                      value={money(activeRun.expectedCashPaise)}
                    />
                    <Metric
                      label="Rider holding"
                      value={money(
                        Math.max(
                          0,
                          activeRun.collectedCashPaise -
                            activeRun.depositedCashPaise
                        )
                      )}
                    />
                  </div>
                  {activeRun.status === "READY_FOR_PICKUP" &&
                    !activeRun.storeHandoffConfirmedAt && (
                      <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">
                        Waiting for the store to confirm the physical route
                        handoff.
                      </div>
                    )}
                  {activeRun.status === "READY_FOR_PICKUP" &&
                    activeRun.storeHandoffConfirmedAt && (
                      <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                        <p className="font-semibold text-emerald-950">
                          Confirm your independent route receipt
                        </p>
                        <p className="mt-1 text-sm text-emerald-800">
                          Count exactly{" "}
                          {activeRun.expectedBagCount ||
                            activeRun.totalStopCount}{" "}
                          bags before accepting the run.
                        </p>
                        {activeRun.crateCode && (
                          <input
                            value={pickupCrateCode}
                            onChange={(event) =>
                              setPickupCrateCode(event.target.value)
                            }
                            placeholder="Enter or scan route crate code"
                            className="mt-3 h-12 w-full rounded-xl border border-emerald-300 bg-white px-4 font-bold uppercase outline-none focus:border-emerald-600"
                          />
                        )}
                        <button
                          disabled={
                            working === "pickup-receipt" ||
                            Boolean(
                              activeRun.crateCode && !pickupCrateCode.trim()
                            )
                          }
                          onClick={confirmPickupReceipt}
                          className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 font-semibold text-white disabled:opacity-50"
                        >
                          <Package className="h-5 w-5" />
                          {working === "pickup-receipt"
                            ? "Verifying receipt…"
                            : `Confirm ${
                                activeRun.expectedBagCount ||
                                activeRun.totalStopCount
                              } bags received`}
                        </button>
                      </div>
                    )}
                  {activeRun.status === "PICKED_UP" && (
                    <button
                      disabled={working === "start"}
                      onClick={() =>
                        act(
                          "start",
                          () =>
                            apiClient.post(
                              `/rider/delivery-runs/${activeRun.id}/start`,
                              { version: activeRun.version }
                            ),
                          "Run started. Complete every stop individually."
                        )
                      }
                      className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                    >
                      <Navigation className="h-5 w-5" />
                      {working === "start" ? "Starting…" : "Start delivery run"}
                    </button>
                  )}
                </section>

                {currentStop && activeRun.status === "IN_PROGRESS" && (
                  <button
                    onClick={() => setSelectedStop(currentStop)}
                    className="flex w-full items-center gap-4 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-left"
                  >
                    <span className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-700 text-white">
                      <MapPin className="h-6 w-6" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                        Next stop · {currentStop.sequenceNumber}
                      </span>
                      <span className="block font-semibold text-slate-900">
                        {currentStop.deliveryJob.order.customer?.name ||
                          "Customer"}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {snapshotText(
                          currentStop.subscriptionDelivery.subscription
                            .addressSnapshot
                        )}
                      </span>
                    </span>
                    <ChevronRight className="h-5 w-5 text-emerald-700" />
                  </button>
                )}

                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-semibold text-slate-900">
                      Ordered stops
                    </h3>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                      No bulk delivery action
                    </span>
                  </div>
                  {activeStops.map((stop) => (
                    <button
                      key={stop.id}
                      onClick={() => setSelectedStop(stop)}
                      className={`w-full rounded-xl border bg-white p-4 text-left  ${
                        currentStop?.id === stop.id
                          ? "border-emerald-400 ring-2 ring-emerald-100"
                          : "border-slate-200"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-semibold ${
                            stop.status === "DELIVERED"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {stop.sequenceNumber}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-slate-900">
                              {stop.deliveryJob.order.customer?.name ||
                                "Customer"}
                            </span>
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
                              {title(stop.status)}
                            </span>
                            {stop.proofMode === "RIDER_PHOTO_GPS" && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 border border-teal-200 px-2 py-0.5 text-[10px] font-bold text-teal-800">
                                <Camera className="h-3 w-3 text-teal-600" />
                                Photo &amp; GPS
                              </span>
                            )}
                          </span>
                          <span className="mt-1 block truncate text-xs text-slate-500">
                            {snapshotText(
                              stop.subscriptionDelivery.subscription
                                .addressSnapshot
                            )}
                          </span>
                          <span
                            className={`mt-2 block text-xs font-semibold ${
                              stop.cashDuePaise > 0
                                ? "text-amber-700"
                                : "text-emerald-700"
                            }`}
                          >
                            {stop.cashDuePaise > 0
                              ? `Collect ${money(stop.cashDuePaise)} (COD)`
                              : "Customer due ₹0 · subscription funded"}
                          </span>
                        </span>
                        <ChevronRight className="h-5 w-5 text-slate-400" />
                      </div>
                    </button>
                  ))}
                </section>

                {activeRun.status === "IN_PROGRESS" && (
                  <button
                    disabled={working === "finish"}
                    onClick={() =>
                      act(
                        "finish",
                        () =>
                          apiClient.post(
                            `/rider/delivery-runs/${activeRun.id}/finish`,
                            { version: activeRun.version }
                          ),
                        "Run completion checked."
                      )
                    }
                    className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                  >
                    <CheckCircle2 className="h-5 w-5" />
                    Finish only after all retries and returns
                  </button>
                )}

                {activeRun.status === "AWAITING_SETTLEMENT" && (
                  <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
                    <div className="flex items-start gap-3">
                      <Banknote className="h-7 w-7 text-amber-700" />
                      <div>
                        <h3 className="text-lg font-semibold text-amber-950">
                          Cash return required
                        </h3>
                        <p className="mt-1 text-sm text-amber-800">
                          The batch references individual held COD ledgers; the
                          store must count it independently.
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <Metric
                        label="Expected"
                        value={money(cash?.expectedCashPaise || 0)}
                      />
                      <Metric
                        label="Collected"
                        value={money(cash?.collectedCashPaise || 0)}
                      />
                      <Metric
                        label="Holding"
                        value={money(cash?.riderHoldingPaise || 0)}
                      />
                    </div>
                    {!batch ? (
                      <button
                        disabled={
                          working === "batch-create" || !cash?.riderHoldingPaise
                        }
                        onClick={createBatch}
                        className="mt-4 min-h-12 w-full rounded-xl bg-amber-700 font-semibold text-white disabled:opacity-50"
                      >
                        Create deposit batch
                      </button>
                    ) : (
                      <div className="mt-4 rounded-xl bg-white p-4">
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Physical amount handed to store
                        </label>
                        <input
                          value={submittedCash}
                          onChange={(event) =>
                            setSubmittedCash(event.target.value)
                          }
                          inputMode="decimal"
                          className="mt-2 h-12 w-full rounded-xl border border-slate-300 px-4 text-lg font-semibold outline-none focus:border-amber-500"
                        />
                        <button
                          disabled={working === "batch-submit"}
                          onClick={submitBatch}
                          className="mt-3 min-h-12 w-full rounded-xl bg-amber-700 font-semibold text-white"
                        >
                          Submit for store verification
                        </button>
                      </div>
                    )}
                  </section>
                )}
              </div>
            ) : (
              <div className="grid min-h-[480px] place-items-center rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
                <div>
                  <Route className="mx-auto h-12 w-12 text-slate-300" />
                  <h2 className="mt-4 text-xl font-semibold text-slate-900">
                    Choose a delivery run
                  </h2>
                  <p className="mt-2 text-sm text-slate-500">
                    Route details, stops, proof and cash controls will appear
                    here.
                  </p>
                </div>
              </div>
            )}
          </main>
        </div>

        {selectedStop && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-5">
            <div className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-5  sm:rounded-xl">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                    Stop {selectedStop.sequenceNumber}
                  </p>
                  <h3 className="mt-1 text-2xl font-semibold text-slate-950">
                    {selectedStop.deliveryJob.order.customer?.name ||
                      "Customer delivery"}
                  </h3>
                  <p className="mt-2 text-sm text-slate-500">
                    {snapshotText(
                      selectedStop.subscriptionDelivery.subscription
                        .addressSnapshot
                    )}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedStop(null)}
                  className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div
                className={`mt-4 rounded-xl border p-4 ${
                  selectedStop.cashDuePaise > 0
                    ? "border-amber-200 bg-amber-50"
                    : "border-emerald-200 bg-emerald-50"
                }`}
              >
                <p
                  className={`font-semibold ${
                    selectedStop.cashDuePaise > 0
                      ? "text-amber-900"
                      : "text-emerald-900"
                  }`}
                >
                  {selectedStop.cashDuePaise > 0
                    ? `${money(selectedStop.cashDuePaise)} due now`
                    : "Customer amount due: ₹0"}
                </p>
                <p
                  className={`mt-1 text-xs ${
                    selectedStop.cashDuePaise > 0
                      ? "text-amber-800"
                      : "text-emerald-800"
                  }`}
                >
                  {selectedStop.cashDuePaise > 0
                    ? "Collect exactly this amount only after the valid OTP."
                    : "Subscription already funded. Do not collect cash."}
                </p>
              </div>
              {/* Rider In-Flight Actions */}
              {selectedStop.status !== "DELIVERED" &&
                selectedStop.status !== "FAILED" &&
                selectedStop.status !== "CANCELLED" && (
                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      In-Flight Stop Actions
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <button
                        type="button"
                        onClick={() => setExtraMilkModalStop(selectedStop)}
                        className="inline-flex items-center justify-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100 transition-colors shadow-2xs"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Extra Item</span>
                      </button>

                      <button
                        type="button"
                        disabled={working === `slot-${selectedStop.id}`}
                        onClick={() => handleToggleSlot(selectedStop)}
                        className="inline-flex items-center justify-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-2 text-xs font-bold text-indigo-900 hover:bg-indigo-100 transition-colors shadow-2xs"
                        title="Switch between Morning and Evening shifts"
                      >
                        <ArrowUpDown className="h-3.5 w-3.5" />
                        <span>Toggle Shift</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setPaymentModalStop(selectedStop);
                          setPaymentAmountRupees(
                            selectedStop.cashDuePaise > 0
                              ? (selectedStop.cashDuePaise / 100).toString()
                              : ""
                          );
                        }}
                        className="inline-flex items-center justify-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-2 text-xs font-bold text-emerald-900 hover:bg-emerald-100 transition-colors shadow-2xs"
                      >
                        <Banknote className="h-3.5 w-3.5" />
                        <span>Collect Pay</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSkipModalStop(selectedStop)}
                        className="inline-flex items-center justify-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-2 text-xs font-bold text-rose-800 hover:bg-rose-100 transition-colors shadow-2xs"
                      >
                        <X className="h-3.5 w-3.5" />
                        <span>Skip Stop</span>
                      </button>
                    </div>
                  </div>
                )}

              {selectedStop.status !== "ARRIVED" &&
                !["DELIVERED", "FAILED", "CANCELLED", "RETURNED"].includes(
                  selectedStop.status
                ) && (
                  <button
                    disabled={working === `arrive-${selectedStop.id}`}
                    onClick={() => arrive(selectedStop)}
                    className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 font-semibold text-white"
                  >
                    <MapPin className="h-5 w-5" />I have arrived · record GPS
                  </button>
                )}
              {selectedStop.status === "ARRIVED" && (
                <div className="mt-4 space-y-4">
                  {selectedStop.proofMode === "RIDER_PHOTO_GPS" ? (
                    <div className="space-y-3 rounded-xl border border-teal-200 bg-teal-50/50 p-4">
                      <div className="flex items-center gap-2 text-teal-900 font-bold text-sm">
                        <Camera className="h-4 w-4 text-teal-700" />
                        <span>Delivery Photo &amp; Location Proof</span>
                      </div>
                      <p className="text-xs text-slate-600">
                        Take a clear photo of the delivery items placed at customer doorstep. GPS coordinates are recorded automatically on verify.
                      </p>

                      {/* Photo capture input */}
                      <div>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          id="stop-proof-camera"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setUploadingEvidence(true);
                            try {
                              const body = new FormData();
                              body.append("file", file);
                              const res = await apiClient.post("/upload/evidence", body);
                              setEvidenceStorageKey(res.data.storageKey);
                              setEvidencePreview(URL.createObjectURL(file));
                              toast.success("Delivery photo captured!");
                            } catch {
                              toast.error("Failed to upload delivery photo");
                            } finally {
                              setUploadingEvidence(false);
                            }
                          }}
                        />

                        {evidencePreview ? (
                          <div className="relative rounded-xl border border-teal-300 bg-white p-2 text-center">
                            <img
                              src={evidencePreview}
                              alt="Delivery proof preview"
                              className="max-h-48 w-auto mx-auto rounded-lg object-contain"
                            />
                            <label
                              htmlFor="stop-proof-camera"
                              className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-teal-800 cursor-pointer hover:underline"
                            >
                              <RefreshCw className="h-3 w-3" /> Retake Photo
                            </label>
                          </div>
                        ) : (
                          <label
                            htmlFor="stop-proof-camera"
                            className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-teal-300 bg-white p-6 cursor-pointer hover:bg-teal-50/50 transition-colors"
                          >
                            <Camera className="h-8 w-8 text-teal-600 mb-1" />
                            <span className="text-xs font-bold text-teal-900">
                              {uploadingEvidence ? "Uploading Proof..." : "Take / Upload Delivery Photo *"}
                            </span>
                            <span className="text-[10px] text-slate-400 mt-0.5">Camera or gallery</span>
                          </label>
                        )}
                      </div>

                      {/* Cash collection input if cash due */}
                      {selectedStop.cashDuePaise > 0 && (
                        <div className="pt-2 border-t border-teal-200">
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Cash Collected (₹)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={collectedCashInput}
                            onChange={(e) => setCollectedCashInput(e.target.value)}
                            placeholder={`Expected: ₹${selectedStop.cashDuePaise / 100}`}
                            className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm font-bold text-slate-800 bg-white outline-none focus:border-teal-600"
                          />
                        </div>
                      )}
                    </div>
                  ) : !(
                    selectedStop.subscriptionDelivery.subscription
                      .deliveryMethod === "TRUSTED_DROP" &&
                    selectedStop.cashDuePaise === 0
                  ) ? (
                    <>
                      <button
                        disabled={working === `otp-${selectedStop.id}`}
                        onClick={() => issueOtp(selectedStop)}
                        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 font-semibold text-emerald-800"
                      >
                        <KeyRound className="h-4 w-4" />
                        Send / resend OTP
                      </button>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Six-digit OTP
                        <input
                          value={otpCode}
                          onChange={(event) =>
                            setOtpCode(
                              event.target.value.replace(/\D/g, "").slice(0, 6)
                            )
                          }
                          inputMode="numeric"
                          maxLength={6}
                          className="mt-2 h-12 w-full rounded-xl border border-slate-300 px-4 text-center text-xl font-semibold tracking-[.4em] outline-none focus:border-emerald-500"
                        />
                      </label>
                    </>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Secure drop token
                        <input
                          value={dropToken}
                          onChange={(event) => setDropToken(event.target.value)}
                          className="mt-2 h-12 w-full rounded-xl border border-slate-300 px-4 normal-case tracking-normal outline-none focus:border-emerald-500"
                        />
                      </label>
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Photo / proof reference
                        <input
                          value={proofReference}
                          onChange={(event) =>
                            setProofReference(event.target.value)
                          }
                          className="mt-2 h-12 w-full rounded-xl border border-slate-300 px-4 normal-case tracking-normal outline-none focus:border-emerald-500"
                        />
                      </label>
                    </div>
                  )}
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Delivery note
                    <textarea
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      rows={3}
                      className="mt-2 w-full rounded-xl border border-slate-300 p-3 normal-case tracking-normal outline-none focus:border-emerald-500"
                    />
                  </label>
                  <button
                    disabled={working === `complete-${selectedStop.id}`}
                    onClick={() => complete(selectedStop)}
                    className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 font-semibold text-white"
                  >
                    <ShieldCheck className="h-5 w-5" />
                    Verify and complete this stop
                  </button>
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                    <div className="flex items-center gap-2 font-semibold text-red-900">
                      <AlertTriangle className="h-5 w-5" />
                      Delivery exception
                    </div>
                    <select
                      value={failureReason}
                      onChange={(event) =>
                        setFailureReason(event.target.value as FailureReason)
                      }
                      className="mt-3 h-11 w-full rounded-xl border border-red-200 bg-white px-3 text-sm font-bold"
                    >
                      {failures.map((reason) => (
                        <option key={reason.value} value={reason.value}>
                          {reason.label}
                        </option>
                      ))}
                    </select>
                    <textarea
                      value={failureNote}
                      onChange={(event) => setFailureNote(event.target.value)}
                      rows={2}
                      placeholder="Operational note"
                      className="mt-3 w-full rounded-xl border border-red-200 p-3 text-sm"
                    />
                    <label className="mt-3 flex items-center gap-2 text-sm font-bold text-red-900">
                      <input
                        type="checkbox"
                        checked={retryRequested}
                        onChange={(event) =>
                          setRetryRequested(event.target.checked)
                        }
                      />
                      Keep unresolved for retry
                    </label>
                    <button
                      disabled={working === `fail-${selectedStop.id}`}
                      onClick={() => fail(selectedStop)}
                      className="mt-3 min-h-11 w-full rounded-xl bg-red-700 font-semibold text-white"
                    >
                      Record exception
                    </button>
                  </div>
                </div>
              )}
              {selectedStop.status === "DELIVERED" && (
                <div className="mt-6 rounded-xl bg-emerald-50 p-6 text-center">
                  <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-700" />
                  <p className="mt-3 font-semibold text-emerald-900">
                    Delivery already verified
                  </p>
                  <p className="mt-1 text-sm text-emerald-700">
                    This stop cannot be completed a second time.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Extra Milk Modal */}
        {extraMilkModalStop && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-5 border border-slate-200 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2 text-slate-900 font-bold">
                  <Plus className="h-5 w-5 text-amber-600" />
                  <span>Add Extra Item / Milk</span>
                </div>
                <button
                  onClick={() => setExtraMilkModalStop(null)}
                  className="rounded-lg p-1 text-slate-400 hover:text-slate-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <p className="text-slate-600">
                  Stop #{extraMilkModalStop.sequenceNumber} · {extraMilkModalStop.deliveryJob.order.customer?.name}
                </p>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Item Description / Quantity *
                  </label>
                  <input
                    type="text"
                    value={extraMilkText}
                    onChange={(e) => setExtraMilkText(e.target.value)}
                    placeholder="e.g. 1 Packet Buffalo Milk / 500ml Cow Milk"
                    className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm font-semibold outline-none focus:border-amber-600"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Extra Price to Collect (₹, optional)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={extraPriceRupees}
                    onChange={(e) => setExtraPriceRupees(e.target.value)}
                    placeholder="40"
                    className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm font-semibold outline-none focus:border-amber-600"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setExtraMilkModalStop(null)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={working === `extra-${extraMilkModalStop.id}`}
                  onClick={() => handleExtraMilk(extraMilkModalStop)}
                  className="rounded-xl bg-amber-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-amber-700 disabled:opacity-50"
                >
                  {working === `extra-${extraMilkModalStop.id}` ? "Adding..." : "Add Extra Item"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Record Payment Modal */}
        {paymentModalStop && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-5 border border-slate-200 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2 text-slate-900 font-bold">
                  <Banknote className="h-5 w-5 text-emerald-600" />
                  <span>Record Customer Payment</span>
                </div>
                <button
                  onClick={() => setPaymentModalStop(null)}
                  className="rounded-lg p-1 text-slate-400 hover:text-slate-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <p className="text-slate-600">
                  Stop #{paymentModalStop.sequenceNumber} · {paymentModalStop.deliveryJob.order.customer?.name}
                </p>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Amount Received (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={paymentAmountRupees}
                    onChange={(e) => setPaymentAmountRupees(e.target.value)}
                    placeholder="Enter amount in ₹"
                    className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm font-bold outline-none focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Payment Method
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentMode("CASH")}
                      className={`py-2 rounded-xl border text-xs font-bold transition-all ${
                        paymentMode === "CASH"
                          ? "border-emerald-500 bg-emerald-50 text-emerald-900 shadow-xs"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      Cash Collection
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMode("PHONE_PE")}
                      className={`py-2 rounded-xl border text-xs font-bold transition-all ${
                        paymentMode === "PHONE_PE"
                          ? "border-purple-500 bg-purple-50 text-purple-900 shadow-xs"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      PhonePe / UPI
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPaymentModalStop(null)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={working === `pay-${paymentModalStop.id}` || !paymentAmountRupees}
                  onClick={() => handleRecordPayment(paymentModalStop)}
                  className="rounded-xl bg-emerald-700 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-800 disabled:opacity-50"
                >
                  {working === `pay-${paymentModalStop.id}` ? "Recording..." : "Record Payment"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Skip Stop Modal */}
        {skipModalStop && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-5 border border-slate-200 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2 text-slate-900 font-bold">
                  <X className="h-5 w-5 text-rose-600" />
                  <span>Mark Delivery as Skipped</span>
                </div>
                <button
                  onClick={() => setSkipModalStop(null)}
                  className="rounded-lg p-1 text-slate-400 hover:text-slate-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <p className="text-slate-600">
                  Stop #{skipModalStop.sequenceNumber} · {skipModalStop.deliveryJob.order.customer?.name}
                </p>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Reason for Skipping
                  </label>
                  <select
                    value={skipReason}
                    onChange={(e) => setSkipReason(e.target.value)}
                    className="w-full h-11 rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold outline-none focus:border-rose-600"
                  >
                    <option value="Customer requested skip / not needed">Customer requested skip today</option>
                    <option value="Customer absent / door locked">Customer absent / door locked</option>
                    <option value="Vacation / out of town">Customer on vacation / out of town</option>
                    <option value="Customer refused delivery">Customer refused delivery</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSkipModalStop(null)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={working === `skip-${skipModalStop.id}`}
                  onClick={() => handleSkipStop(skipModalStop)}
                  className="rounded-xl bg-rose-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-rose-700 disabled:opacity-50"
                >
                  {working === `skip-${skipModalStop.id}` ? "Skipping..." : "Confirm Skip"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/10 p-4">
      <p className="text-xs font-bold text-emerald-100">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 text-center">
      <p className="text-lg font-semibold text-slate-900">{value}</p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
    </div>
  );
}
