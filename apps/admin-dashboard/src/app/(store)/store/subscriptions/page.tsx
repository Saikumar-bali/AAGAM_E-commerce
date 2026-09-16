"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import DashboardLayout from "@/components/DashboardLayout";
import { getToastErrorMessage, useToast } from "@/components/ToastProvider";
import { apiClient } from "@aagam/utils";
import {
  AlertTriangle,
  Archive,
  Banknote,
  BarChart3,
  Box,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Edit3,
  FileSpreadsheet,
  Loader2,
  MapPin,
  Moon,
  Navigation,
  Package,
  PackageCheck,
  Pause,
  Play,
  RefreshCw,
  Route,
  ScanLine,
  Sun,
  Truck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import MilkDeliveryGrid from "@/components/MilkDeliveryGrid";

const CustomerLocationPicker = dynamic(
  () => import("@/components/customer/CustomerLocationPicker"),
  { ssr: false }
);

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
type Tab = "grid" | "subscribers" | "plans" | "calendar" | "prep" | "runs" | "forecast" | "cash" | "exceptions" | "analytics";

type SubscriberRow = {
  id: string;
  status: string;
  startDate: string;
  createdAt: string;
  amountCollectedPaise?: number;
  amountDuePaise?: number;
  completedDeliveries?: number;
  fundedDeliveryCount?: number;
  deliveryMethod?: string | null;
  storeDelivery?: boolean;
  homeStore: { id: string; name: string } | null;
  customer: { id: string; name: string | null; email: string | null; phone: string | null };
  deliveryContact?: { phone: string; name?: string | null } | null;
  plan: { id: string; code: string; name: string };
  planVersion: {
    id: string;
    version: number;
    pricePaise?: number;
    totalDeliveries?: number;
  } | null;
  _count?: { deliveries?: number; issues?: number };
};

type PlanRow = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  status: string;
  pricePaise: number;
  mrpPaise: number;
  currency: string;
  fundingCycle: string;
  totalDeliveries: number;
  items: Array<{
    productId: string;
    quantityPerDelivery: number;
    product: { id: string; name: string; image?: string | null; weightGrams?: number | null };
  }>;
  stores: Array<{ storeId: string; store?: { id: string; name: string } | null }>;
  zones: Array<{ zoneId: string }>;
  _count?: { subscriptions?: number };
};

type CalendarRow = {
  id: string;
  serviceDate: string;
  sequenceNumber: number;
  status: string;
  cashDuePaise?: number;
  deliverySlot?: string | null;
  subscription: {
    id: string;
    customer: { name: string | null; phone: string | null };
    plan: { name: string; code: string };
  };
  store?: { name: string } | null;
  order?: { id: string; status: string } | null;
  runStop?: {
    id: string;
    deliveryRun: { routeCode: string; status: string; riderId: string | null };
  } | null;
};

type StoreAnalytics = {
  subscriptions: Array<{ status: string; _count: { _all: number }; _sum: { amountCollectedPaise: number | null; amountDuePaise: number | null } }>;
  deliveries: Array<{ status: string; _count: { _all: number }; _sum: { cashDuePaise: number | null; cashCollectedPaise?: number | null } }>;
  cash: Array<{ status: string; _count: { _all: number }; _sum: { expectedAmountPaise: number | null; verifiedAmountPaise: number | null; variancePaise: number | null } }>;
  upcomingSevenDayDemand: number;
  todayStoreCashPaise?: number;
  generatedAt: string;
};
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
const formatPaise = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(paise || 0) / 100);
const formatDate = (value?: string | null) => value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
const humanize = (value: unknown) => String(value || "Unknown").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function StoreSubscriptionOperationsPage() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("grid");
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
  const [subscribers, setSubscribers] = useState<SubscriberRow[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [calendar, setCalendar] = useState<CalendarRow[]>([]);
  const [analytics, setAnalytics] = useState<StoreAnalytics | null>(null);
  const [editingSubscriber, setEditingSubscriber] = useState<SubscriberRow | null>(null);
  const [editForm, setEditForm] = useState({
    mode: "renew" as "renew" | "schedule" | "cashflow" | "edit",
    renewalType: "same" as "same" | "switch" | "split",
    newPlanId: "",
    frequency: "DAILY" as "DAILY" | "ALTERNATE_DAYS" | "WEEKDAYS",
    vacationFrom: "",
    vacationTo: "",
    vacationPolicy: "EXTEND_PLAN" as "EXTEND_PLAN" | "DEDUCT_BILL",
    startDate: new Date().toISOString().slice(0, 10),
    totalDeliveries: "30",
    deliverySlot: "MORNING" as "MORNING" | "EVENING" | "BOTH",
    amProductName: "Cow Milk",
    amQuantity: "0.5L",
    pmProductName: "Buffalo Milk",
    pmQuantity: "1.0L",
    initialCollectedRupees: "0",
    paymentMode: "CASH" as "CASH" | "PHONE_PE" | "DUE",
    amountDueRupees: "",
    amountCollectedRupees: "",
    note: "",
    additionalDeliveries: "30",
    additionalAmountRupees: "",
  });
  const [viewingHistory, setViewingHistory] = useState<SubscriberRow | null>(null);
  const [historyData, setHistoryData] = useState<any>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [productList, setProductList] = useState<Array<{ id: string; name: string }>>([]);
  const [storesList, setStoresList] = useState<Array<{ id: string; name: string; address?: string }>>([]);
  const [addCustomerModalOpen, setAddCustomerModalOpen] = useState(false);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [customerForm, setCustomerForm] = useState({
    name: "",
    phone: "",
    address: "",
    landmark: "",
    city: "Anakapalle",
    state: "Andhra Pradesh",
    pincode: "531001",
    latitude: 17.6913,
    longitude: 83.0039,
    hasLocation: false,
    locating: false,
    showMap: true,
    storeId: "",
    planId: "",
    deliverySlot: "MORNING" as "MORNING" | "EVENING" | "BOTH",
    frequency: "DAILY" as "DAILY" | "ALTERNATE_DAYS" | "WEEKDAYS",
    enableSplitItems: false,
    amProductName: "Cow Milk",
    amQuantity: "500ml",
    pmProductName: "Buffalo Milk",
    pmQuantity: "1L",
    enableVacation: false,
    vacationFrom: "",
    vacationTo: "",
    vacationPolicy: "EXTEND_PLAN" as "EXTEND_PLAN" | "DEDUCT_BILL",
    startDate: new Date().toISOString().slice(0, 10),
    totalDeliveries: "30",
    amountCollectedRupees: "0",
    paymentMode: "CASH" as "CASH" | "PHONE_PE" | "DUE",
    note: "",
  });

  const availableProducts = useMemo(() => {
    const list: Array<{ id: string; name: string }> = [...productList];
    for (const plan of plans) {
      if (Array.isArray(plan.items)) {
        for (const item of plan.items) {
          if (item.product?.name && !list.some((p) => p.name.toLowerCase() === item.product.name.toLowerCase())) {
            list.push({ id: item.productId, name: item.product.name });
          }
        }
      }
    }
    if (list.length === 0) {
      return [
        { id: "cm-1", name: "Cow Milk" },
        { id: "bm-1", name: "Buffalo Milk" },
      ];
    }
    return list;
  }, [productList, plans]);

  const handleUseLiveLocation = useCallback(() => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }
    setCustomerForm((prev) => ({ ...prev, locating: true }));
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        try {
          const res = await apiClient.get('/geo/reverse', { params: { lat, lng } });
          const addr = res.data?.address;
          setCustomerForm((prev) => ({
            ...prev,
            latitude: lat,
            longitude: lng,
            hasLocation: true,
            locating: false,
            showMap: true,
            address: addr?.line1 || prev.address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
            landmark: addr?.landmark || prev.landmark,
            city: addr?.city || prev.city || "Anakapalle",
            state: addr?.state || prev.state || "Andhra Pradesh",
            pincode: addr?.pincode || prev.pincode || "531001",
          }));
          toast.success("Live GPS coordinates captured!");
        } catch {
          setCustomerForm((prev) => ({
            ...prev,
            latitude: lat,
            longitude: lng,
            hasLocation: true,
            locating: false,
            showMap: true,
          }));
          toast.success("GPS location captured!");
        }
      },
      (err) => {
        setCustomerForm((prev) => ({ ...prev, locating: false }));
        toast.error(err.message || "Failed to get live location");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
  }, [toast]);

  const handleMapPinChange = useCallback(async (lat: number, lng: number) => {
    setCustomerForm((prev) => ({
      ...prev,
      latitude: lat,
      longitude: lng,
      hasLocation: true,
    }));
    try {
      const res = await apiClient.get('/geo/reverse', { params: { lat, lng } });
      const addr = res.data?.address;
      if (addr) {
        setCustomerForm((prev) => ({
          ...prev,
          address: addr.line1 || prev.address,
          landmark: addr.landmark || prev.landmark,
          city: addr.city || prev.city,
          state: addr.state || prev.state,
          pincode: addr.pincode || prev.pincode,
        }));
      }
    } catch {
      // Keep coordinates even if reverse geocoding is unavailable
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [runsResponse, demandResponse, cashResponse, exceptionsResponse, prepResponse, subscribersResponse, plansResponse, calendarResponse, analyticsResponse] =
        await Promise.allSettled([
          apiClient.get("/store/subscription-operations/runs"),
          apiClient.get("/store/subscription-operations/demand", {
            params: { days: 14 },
          }),
          apiClient.get("/store/subscription-operations/cash-batches"),
          apiClient.get("/store/subscription-operations/exceptions"),
          apiClient.get("/store/subscription-preparation", { params: { days: 3 } }),
          apiClient.get("/store/subscriptions/subscribers"),
          apiClient.get("/store/subscriptions/plans"),
          apiClient.get("/store/subscriptions/calendar"),
          apiClient.get("/store/subscriptions/analytics"),
        ]);
      if (runsResponse.status === "fulfilled") setRuns(Array.isArray(runsResponse.value.data) ? runsResponse.value.data : []);
      if (demandResponse.status === "fulfilled") setDemand(Array.isArray(demandResponse.value.data) ? demandResponse.value.data : []);
      if (cashResponse.status === "fulfilled") setCash(Array.isArray(cashResponse.value.data) ? cashResponse.value.data : []);
      if (exceptionsResponse.status === "fulfilled") setExceptions(Array.isArray(exceptionsResponse.value.data) ? exceptionsResponse.value.data : []);
      if (prepResponse.status === "fulfilled") setPrepRows(Array.isArray(prepResponse.value.data) ? prepResponse.value.data : []);
      if (subscribersResponse.status === "fulfilled") setSubscribers(Array.isArray(subscribersResponse.value.data) ? subscribersResponse.value.data : []);
      const loadedPlans = plansResponse.status === "fulfilled" && Array.isArray(plansResponse.value.data) ? plansResponse.value.data : [];
      setPlans(loadedPlans);
      if (calendarResponse.status === "fulfilled") setCalendar(Array.isArray(calendarResponse.value.data) ? calendarResponse.value.data : []);
      if (analyticsResponse.status === "fulfilled") setAnalytics(analyticsResponse.value.data ?? null);

      try {
        const prodRes = await apiClient.get("/products");
        const items = Array.isArray(prodRes.data) ? prodRes.data : (prodRes.data?.items || []);
        if (Array.isArray(items) && items.length) {
          setProductList(items.map((p: any) => ({ id: p.id, name: p.name })));
        }
      } catch (err) {
        console.warn('Could not fetch products:', err);
      }

      try {
        const storesRes = await apiClient.get("/stores/my-stores");
        if (Array.isArray(storesRes.data) && storesRes.data.length) {
          setStoresList(storesRes.data);
          setCustomerForm((prev) => ({
            ...prev,
            storeId: prev.storeId || storesRes.data[0].id,
            planId: prev.planId || (loadedPlans[0]?.id ?? ""),
          }));
        }
      } catch (err) {
        console.warn('Could not fetch stores list:', err);
      }
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

  const saveOfflineCustomer = async () => {
    if (!customerForm.name.trim()) {
      toast.error("Please enter customer name");
      return;
    }
    const cleanPhone = customerForm.phone.replace(/\D/g, "");
    if (cleanPhone.length !== 10) {
      toast.error("Phone number must be exactly 10 digits");
      return;
    }
    if (!customerForm.address.trim()) {
      toast.error("Please enter delivery address or locality");
      return;
    }
    const storeId = customerForm.storeId || storesList[0]?.id || (subscribers[0] as any)?.homeStoreId || (subscribers[0] as any)?.homeStore?.id;
    if (!storeId) {
      toast.error("No store found to link subscription");
      return;
    }
    const planId = customerForm.planId || plans[0]?.id;
    if (!planId) {
      toast.error("No active subscription plan selected");
      return;
    }

    setSavingCustomer(true);
    try {
      const custRes = await apiClient.post("/store/subscriptions/manual-customer", {
        name: customerForm.name.trim(),
        phone: cleanPhone,
        line1: customerForm.address.trim(),
        landmark: customerForm.landmark.trim() || undefined,
        city: customerForm.city.trim() || "Anakapalle",
        state: customerForm.state.trim() || "Andhra Pradesh",
        pincode: customerForm.pincode.trim() || "531001",
        latitude: customerForm.latitude,
        longitude: customerForm.longitude,
      });
      const customer = custRes.data.customer;
      const address = custRes.data.address;

      const amountPaise = Math.round(Number(customerForm.amountCollectedRupees || 0) * 100);
      const paymentModeLabel = customerForm.paymentMode === "PHONE_PE" ? "PhonePe" : customerForm.paymentMode === "CASH" ? "Cash" : "Payment Due";
      const paymentNote = `[${paymentModeLabel}] ${customerForm.note || ""}`.trim();

      await apiClient.post("/store/subscriptions/manual-subscribe", {
        storeId,
        planId,
        customerId: customer.id,
        addressId: address.id,
        startDate: customerForm.startDate || new Date().toISOString().slice(0, 10),
        totalDeliveries: Number(customerForm.totalDeliveries || 30),
        deliverySlot: customerForm.deliverySlot,
        frequency: customerForm.frequency,
        splitItems: customerForm.enableSplitItems ? {
          amProductName: customerForm.amProductName,
          amQuantity: customerForm.amQuantity,
          pmProductName: customerForm.pmProductName,
          pmQuantity: customerForm.pmQuantity,
        } : undefined,
        vacationRange: customerForm.enableVacation && customerForm.vacationFrom && customerForm.vacationTo ? {
          fromDate: customerForm.vacationFrom,
          toDate: customerForm.vacationTo,
          policy: customerForm.vacationPolicy,
        } : undefined,
        initialCashCollectedPaise: customerForm.paymentMode === "DUE" ? 0 : amountPaise,
        storeDelivery: true,
        note: paymentNote,
      });

      toast.success("Offline customer created successfully with GPS location!");
      setAddCustomerModalOpen(false);
      setCustomerForm({
        name: "",
        phone: "",
        address: "",
        landmark: "",
        city: "Anakapalle",
        state: "Andhra Pradesh",
        pincode: "531001",
        latitude: 17.6913,
        longitude: 83.0039,
        hasLocation: false,
        locating: false,
        showMap: true,
        storeId: storesList[0]?.id || "",
        planId: plans[0]?.id || "",
        deliverySlot: "MORNING",
        frequency: "DAILY",
        enableSplitItems: false,
        amProductName: availableProducts[0]?.name || "Cow Milk",
        amQuantity: "500ml",
        pmProductName: availableProducts[1]?.name || availableProducts[0]?.name || "Buffalo Milk",
        pmQuantity: "1L",
        enableVacation: false,
        vacationFrom: "",
        vacationTo: "",
        vacationPolicy: "EXTEND_PLAN",
        startDate: new Date().toISOString().slice(0, 10),
        totalDeliveries: "30",
        amountCollectedRupees: "0",
        paymentMode: "CASH",
        note: "",
      });
      await load();
    } catch (err) {
      toast.error(getToastErrorMessage(err, "Failed to create offline customer subscription"));
    } finally {
      setSavingCustomer(false);
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
  const submittedCash =
    cash
      .filter((batch) => batch.status === "SUBMITTED")
      .reduce((sum, batch) => sum + Number(batch.submittedAmountPaise || 0), 0) +
    Number(analytics?.todayStoreCashPaise || 0);
  const pendingCashCount = cash.filter(
    (batch) => batch.status === "SUBMITTED"
  ).length;
  const tabCounts = useMemo<Record<Tab, number>>(
    () => ({
      grid: subscribers.length,
      subscribers: subscribers.length,
      plans: plans.length,
      calendar: 0,
      prep: prepPending + prepShortages,
      runs: runs.length,
      forecast: forecastItems,
      cash: pendingCashCount,
      exceptions: exceptions.length,
      analytics: 0,
    }),
    [subscribers.length, plans.length, prepPending, prepShortages, runs.length, forecastItems, pendingCashCount, exceptions.length]
  );

  return (
    <DashboardLayout allowedRole="STORE_OWNER">
      <div className="space-y-6">
        <section className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-black text-slate-900">Subscriptions, runs & cash</h1>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => void load()} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
            <button onClick={() => setPrepModalOpen(true)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-amber-400 px-3 text-xs font-black text-slate-900 hover:bg-amber-300"><ClipboardCheck className="h-3.5 w-3.5" /> Tomorrow Prep</button>
            <a href="/store/deliveries" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-emerald-700 px-3 text-xs font-black text-white hover:bg-emerald-800"><Truck className="h-3.5 w-3.5" /> Deliver at store</a>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-2 xl:grid-cols-4">
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <div className="flex items-center gap-2 text-emerald-700"><span className="rounded-lg bg-emerald-50 p-1.5"><Users className="h-3.5 w-3.5" /></span><span className="text-xs font-black text-slate-600">Subscribers</span></div>
            <strong className="text-lg text-slate-900">{subscribers.length}</strong>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <div className="flex items-center gap-2 text-emerald-700"><span className="rounded-lg bg-emerald-50 p-1.5"><Archive className="h-3.5 w-3.5" /></span><span className="text-xs font-black text-slate-600">Active plans</span></div>
            <strong className="text-lg text-slate-900">{plans.length}</strong>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <div className="flex items-center gap-2 text-emerald-700"><span className="rounded-lg bg-emerald-50 p-1.5"><Route className="h-3.5 w-3.5" /></span><span className="text-xs font-black text-slate-600">Routes today</span></div>
            <strong className="text-lg text-slate-900">{runs.length}</strong>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <div className="flex items-center gap-2 text-emerald-700"><span className="rounded-lg bg-emerald-50 p-1.5"><Banknote className="h-3.5 w-3.5" /></span><span className="text-xs font-black text-slate-600">Cash to count</span></div>
            <strong className="text-lg text-slate-900">{money(submittedCash)}</strong>
          </div>
        </section>

        <nav className="flex gap-0.5 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1">
          {(
            [
              ["grid", "Milk Grid (Sheet View)", FileSpreadsheet],
              ["subscribers", "Subscribers", Users],
              ["prep", "Tomorrow Prep", ClipboardCheck],
              ["forecast", "Demand", BarChart3],
              ["plans", "Plans", Archive],
              ["calendar", "Calendar", CalendarDays],
              ["runs", "Runs", Route],
              ["cash", "Cash", Banknote],
              ["exceptions", "Exceptions", AlertTriangle],
              ["analytics", "Analytics", BarChart3],
            ] as Array<[Tab, string, any]>
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-black ${
                tab === value
                  ? "bg-emerald-100 text-emerald-800"
                  : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </nav>

        {tab === "grid" ? (
          <MilkDeliveryGrid onReload={() => void load()} />
        ) : loading ? (
          <State
            icon={RefreshCw}
            title="Loading subscription operations"
            text="Fetching route, demand, exception, and cash data…"
            spin
          />
        ) : (
          <>

            {tab === "subscribers" && (
              <SubscribersSection 
                rows={subscribers} 
                onEdit={(sub) => {
                  setEditingSubscriber(sub);
                  const isCompleted = sub.status === 'COMPLETED' || (sub.completedDeliveries && sub.completedDeliveries >= (sub.fundedDeliveryCount || 30));
                  setEditForm({
                    mode: isCompleted ? "renew" : "renew",
                    renewalType: "same",
                    newPlanId: sub.plan.id,
                    frequency: "DAILY",
                    vacationFrom: "",
                    vacationTo: "",
                    vacationPolicy: "EXTEND_PLAN",
                    startDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
                    totalDeliveries: String(sub.fundedDeliveryCount || sub.planVersion?.totalDeliveries || 30),
                    deliverySlot: sub.deliveryMethod === 'PERSONAL_HANDOVER' ? "MORNING" : "MORNING",
                    amProductName: "Cow Milk",
                    amQuantity: "0.5L",
                    pmProductName: "Buffalo Milk",
                    pmQuantity: "1.0L",
                    initialCollectedRupees: "0",
                    paymentMode: "CASH",
                    amountDueRupees: String((sub.amountDuePaise || 0) / 100),
                    amountCollectedRupees: String((sub.amountCollectedPaise || 0) / 100),
                    note: "",
                    additionalDeliveries: "30",
                    additionalAmountRupees: "",
                  });
                }}
                onViewHistory={async (sub) => { setViewingHistory(sub); setHistoryLoading(true); try { const res = await apiClient.get(`/store/subscriptions/subscribers/${sub.id}/history`); setHistoryData(res.data); } catch { setHistoryData(null); } finally { setHistoryLoading(false); } }}
                onAddOfflineCustomer={() => setAddCustomerModalOpen(true)}
              />
            )}

            {tab === "plans" && (
              <PlansSection rows={plans} />
            )}

            {tab === "calendar" && (
              <CalendarSection rows={calendar} upcomingDemand={analytics?.upcomingSevenDayDemand ?? null} onReload={() => void load()} />
            )}

            {tab === "analytics" && (
              <AnalyticsSection analytics={analytics} runs={runs} cash={cash} subscribers={subscribers} />
            )}

            {tab === "prep" && (
              <section className="space-y-3">
                {prepRows.length ? (
                  <>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                        <p className="text-[10px] font-badge text-slate-400">Total Deliveries</p>
                        <p className="mt-1 text-xl font-kpi text-slate-900">{prepRows.length}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                        <p className="text-[10px] font-badge text-slate-400">Pending</p>
                        <p className="mt-1 text-xl font-kpi text-amber-700">{prepRows.filter((r) => r.readiness.status === 'PENDING').length}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                        <p className="text-[10px] font-badge text-slate-400">Ready</p>
                        <p className="mt-1 text-xl font-kpi text-emerald-700">{prepRows.filter((r) => r.readiness.status === 'READY').length}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                        <p className="text-[10px] font-badge text-slate-400">Shortage</p>
                        <p className="mt-1 text-xl font-kpi text-red-700">{prepRows.filter((r) => r.readiness.status === 'SHORTAGE').length}</p>
                      </div>
                    </div>
                    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                      <table className="min-w-[750px] w-full text-left text-xs">
                        <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-3 py-2.5 font-badge">Date</th>
                            <th className="px-3 py-2.5 font-badge">Customer</th>
                            <th className="px-3 py-2.5 font-badge">Phone</th>
                            <th className="px-3 py-2.5 font-badge">Slot</th>
                            <th className="px-3 py-2.5 font-badge">Items</th>
                            <th className="px-3 py-2.5 font-badge">Status</th>
                            <th className="px-3 py-2.5 font-badge">Readiness</th>
                            <th className="px-3 py-2.5 font-badge">Actions</th>
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
              <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                {runs.length ? (
                  <table className="min-w-[750px] w-full text-left text-xs">
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
            <button
              onClick={() => setPrepModalOpen(false)}
              className="min-h-10 w-full rounded-xl border border-slate-200 text-sm font-black text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
          </Modal>
        )}

        {editingSubscriber && (
          <Modal title={`Manage: ${editingSubscriber.customer.name || 'Subscriber'}`} onClose={() => setEditingSubscriber(null)}>
            <div className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
              {/* Customer Profile Banner */}
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3.5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-slate-900 text-sm">{editingSubscriber.customer.name || 'Subscriber'}</span>
                      <span className="text-xs text-slate-500 font-semibold">{editingSubscriber.customer.phone || '—'}</span>
                    </div>
                    <p className="text-xs font-bold text-emerald-700 mt-0.5">{editingSubscriber.plan.name}</p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Progress: <span className="font-bold text-slate-800">{editingSubscriber.completedDeliveries ?? 0}/{editingSubscriber.fundedDeliveryCount || '—'} delivered</span>
                      {' · '}Collected: <span className="font-bold text-emerald-700">{formatPaise(editingSubscriber.amountCollectedPaise || 0)}</span>
                      {' · '}Due: <span className="font-bold text-red-700">{formatPaise(editingSubscriber.amountDuePaise || 0)}</span>
                    </p>
                  </div>
                  <StatusPill status={editingSubscriber.status} />
                </div>
              </div>

              {/* Modal Navigation Tabs */}
              <div className="flex gap-1.5 rounded-xl bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setEditForm((prev) => ({ ...prev, mode: 'renew' }))}
                  className={`flex-1 rounded-lg py-2 text-xs font-black transition-all ${editForm.mode === 'renew' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  🔄 Renew Plan
                </button>
                <button
                  type="button"
                  onClick={() => setEditForm((prev) => ({ ...prev, mode: 'schedule' }))}
                  className={`flex-1 rounded-lg py-2 text-xs font-black transition-all ${editForm.mode === 'schedule' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  ⚙️ Split AM/PM
                </button>
                <button
                  type="button"
                  onClick={() => setEditForm((prev) => ({ ...prev, mode: 'cashflow' }))}
                  className={`flex-1 rounded-lg py-2 text-xs font-black transition-all ${editForm.mode === 'cashflow' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  💰 Cash Flow
                </button>
                <button
                  type="button"
                  onClick={() => setEditForm((prev) => ({ ...prev, mode: 'edit' }))}
                  className={`flex-1 rounded-lg py-2 text-xs font-black transition-all ${editForm.mode === 'edit' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  ✏️ Edit Balances
                </button>
              </div>

              {/* TAB 1: RENEW PLAN */}
              {editForm.mode === 'renew' && (
                <div className="space-y-3.5">
                  <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3">
                    <p className="text-xs font-black text-emerald-900">Start Next Renewal Cycle</p>
                    <p className="text-[10px] text-emerald-700 mt-0.5">
                      Creates a clean new delivery & cash flow cycle. Previous cycle history and collected cash remain completely preserved.
                    </p>
                  </div>

                  {/* Plan / Product Option */}
                  <div>
                    <label className="text-[11px] font-black uppercase tracking-wider text-slate-500">Renewal Option</label>
                    <div className="mt-1.5 grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setEditForm((prev) => ({ ...prev, renewalType: 'same', newPlanId: editingSubscriber.plan.id }))}
                        className={`rounded-xl border p-2.5 text-left text-xs transition-all ${editForm.renewalType === 'same' ? 'border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-500/20' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                      >
                        <p className="font-black text-slate-800">Same Plan</p>
                        <p className="text-[10px] text-slate-500 truncate">{editingSubscriber.plan.name}</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditForm((prev) => ({ ...prev, renewalType: 'switch' }))}
                        className={`rounded-xl border p-2.5 text-left text-xs transition-all ${editForm.renewalType === 'switch' ? 'border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-500/20' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                      >
                        <p className="font-black text-slate-800">Switch Plan</p>
                        <p className="text-[10px] text-slate-500">Change product / size</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditForm((prev) => ({ ...prev, renewalType: 'split' }))}
                        className={`rounded-xl border p-2.5 text-left text-xs transition-all ${editForm.renewalType === 'split' ? 'border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-500/20' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                      >
                        <p className="font-black text-slate-800">Split AM/PM</p>
                        <p className="text-[10px] text-slate-500">Cow + Buffalo milk</p>
                      </button>
                    </div>
                  </div>

                  {/* If Switch Plan is chosen */}
                  {editForm.renewalType === 'switch' && (
                    <Field label="Choose New Plan">
                      <select
                        value={editForm.newPlanId || editingSubscriber.plan.id}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, newPlanId: e.target.value }))}
                        className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs font-bold outline-none focus:border-emerald-500 bg-white"
                      >
                        {plans.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} · {formatPaise(p.pricePaise)} ({p.totalDeliveries} deliveries)
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}

                  {/* If Split AM/PM is chosen */}
                  {editForm.renewalType === 'split' && (
                    <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-3 space-y-2">
                      <p className="text-xs font-black text-indigo-900">Custom AM & PM Milk Setup</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-slate-600">Morning Product (AM)</label>
                          <select
                            value={editForm.amProductName}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, amProductName: e.target.value }))}
                            className="h-8 w-full rounded-lg border border-slate-300 px-2 text-xs font-semibold bg-white outline-none focus:border-indigo-500"
                          >
                            {availableProducts.map((p) => (
                              <option key={p.id} value={p.name}>{p.name}</option>
                            ))}
                          </select>
                          <select
                            value={editForm.amQuantity}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, amQuantity: e.target.value }))}
                            className="mt-1 h-8 w-full rounded-lg border border-slate-300 px-2 text-xs font-semibold bg-white"
                          >
                            <option value="0.25L">0.25 Liter</option>
                            <option value="0.5L">0.5 Liter</option>
                            <option value="1.0L">1.0 Liter</option>
                            <option value="1.5L">1.5 Liters</option>
                            <option value="2.0L">2.0 Liters</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-600">Evening Product (PM)</label>
                          <select
                            value={editForm.pmProductName}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, pmProductName: e.target.value }))}
                            className="h-8 w-full rounded-lg border border-slate-300 px-2 text-xs font-semibold bg-white outline-none focus:border-indigo-500"
                          >
                            {availableProducts.map((p) => (
                              <option key={p.id} value={p.name}>{p.name}</option>
                            ))}
                          </select>
                          <select
                            value={editForm.pmQuantity}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, pmQuantity: e.target.value }))}
                            className="mt-1 h-8 w-full rounded-lg border border-slate-300 px-2 text-xs font-semibold bg-white"
                          >
                            <option value="0.25L">0.25 Liter</option>
                            <option value="0.5L">0.5 Liter</option>
                            <option value="1.0L">1.0 Liter</option>
                            <option value="1.5L">1.5 Liters</option>
                            <option value="2.0L">2.0 Liters</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Delivery Frequency (Automated Scheduling - No Manual Skipping needed!) */}
                  <div>
                    <label className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                      Delivery Frequency (Automated Schedule)
                    </label>
                    <div className="mt-1.5 grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setEditForm((prev) => ({ ...prev, frequency: 'DAILY' }))}
                        className={`rounded-xl border p-2 text-center text-xs transition-all ${editForm.frequency === 'DAILY' ? 'border-emerald-600 bg-emerald-50/50 font-black text-emerald-900 ring-1 ring-emerald-500/20' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 font-bold'}`}
                      >
                        Daily (All 7 Days)
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditForm((prev) => ({ ...prev, frequency: 'ALTERNATE_DAYS' }))}
                        className={`rounded-xl border p-2 text-center text-xs transition-all ${editForm.frequency === 'ALTERNATE_DAYS' ? 'border-emerald-600 bg-emerald-50/50 font-black text-emerald-900 ring-1 ring-emerald-500/20' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 font-bold'}`}
                      >
                        Alternate Days (Every 2nd Day)
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditForm((prev) => ({ ...prev, frequency: 'WEEKDAYS' }))}
                        className={`rounded-xl border p-2 text-center text-xs transition-all ${editForm.frequency === 'WEEKDAYS' ? 'border-emerald-600 bg-emerald-50/50 font-black text-emerald-900 ring-1 ring-emerald-500/20' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 font-bold'}`}
                      >
                        Weekdays Only (Mon–Fri)
                      </button>
                    </div>
                    {editForm.frequency === 'ALTERNATE_DAYS' && (
                      <p className="mt-1 text-[10px] text-emerald-700 font-bold">
                        ✓ System automatically schedules deliveries on alternating days (e.g. Day 1, 3, 5...). No manual skipping required.
                      </p>
                    )}
                  </div>

                  {/* Planned Vacation / Temporary Pause (Optional) */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-black text-slate-800">Planned Vacation / Leave (Optional)</span>
                      <span className="text-[10px] text-slate-500">Auto-skip in advance</span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500">Vacation From</label>
                        <input
                          type="date"
                          value={editForm.vacationFrom}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, vacationFrom: e.target.value }))}
                          className="h-8 w-full rounded-lg border border-slate-300 px-2 text-xs bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500">Vacation To</label>
                        <input
                          type="date"
                          value={editForm.vacationTo}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, vacationTo: e.target.value }))}
                          className="h-8 w-full rounded-lg border border-slate-300 px-2 text-xs bg-white"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Dates & Schedule */}
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Cycle Start Date">
                      <input
                        type="date"
                        value={editForm.startDate}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, startDate: e.target.value }))}
                        className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs font-bold outline-none focus:border-emerald-500"
                      />
                    </Field>
                    <Field label="Total Deliveries">
                      <input
                        type="number"
                        min="1"
                        value={editForm.totalDeliveries}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, totalDeliveries: e.target.value }))}
                        className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs font-bold outline-none focus:border-emerald-500"
                      />
                    </Field>
                  </div>

                  {/* Cash Flow for this Renewal */}
                  <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-600">Past Cycle Dues:</span>
                      <span className="font-black text-red-700">{formatPaise(editingSubscriber.amountDuePaise || 0)}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs border-t border-amber-200/60 pt-2">
                      <span className="font-bold text-slate-800">Initial Payment Collected Now:</span>
                      <div className="flex items-center gap-1.5">
                        <span>₹</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editForm.initialCollectedRupees}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, initialCollectedRupees: e.target.value }))}
                          placeholder="0"
                          className="h-8 w-24 rounded-lg border border-slate-300 px-2 text-right font-black text-slate-900"
                        />
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="text-[11px] font-semibold text-slate-500">Payment Mode:</span>
                      <div className="flex gap-1">
                        {(['CASH', 'PHONE_PE', 'DUE'] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setEditForm((prev) => ({ ...prev, paymentMode: m }))}
                            className={`rounded px-2 py-0.5 text-[10px] font-black ${editForm.paymentMode === m ? 'bg-emerald-700 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
                          >
                            {m === 'PHONE_PE' ? 'PhonePe' : m === 'CASH' ? 'Cash' : 'Post-Paid'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <Field label="Renewal Note">
                    <input
                      type="text"
                      value={editForm.note}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, note: e.target.value }))}
                      placeholder="e.g. Renewed for April month"
                      className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs outline-none focus:border-emerald-500"
                    />
                  </Field>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setEditingSubscriber(null)}
                      className="min-h-10 flex-1 rounded-xl border border-slate-200 text-xs font-black hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={working === "renew-subscriber"}
                      onClick={async () => {
                        setWorking("renew-subscriber");
                        try {
                          const initialCashPaise = Math.round(Number(editForm.initialCollectedRupees || 0) * 100);
                          const splitItems = editForm.renewalType === 'split'
                            ? {
                                amProductName: editForm.amProductName,
                                amQuantity: editForm.amQuantity,
                                pmProductName: editForm.pmProductName,
                                pmQuantity: editForm.pmQuantity,
                              }
                            : undefined;

                          const vacationRange = editForm.vacationFrom && editForm.vacationTo
                            ? {
                                fromDate: editForm.vacationFrom,
                                toDate: editForm.vacationTo,
                                policy: editForm.vacationPolicy,
                              }
                            : undefined;

                          await apiClient.post(`/store/subscriptions/subscribers/${editingSubscriber.id}/renew`, {
                            isSamePlan: editForm.renewalType === 'same',
                            newPlanId: editForm.renewalType === 'switch' ? editForm.newPlanId : undefined,
                            frequency: editForm.frequency,
                            vacationRange,
                            startDate: editForm.startDate,
                            totalDeliveries: Number(editForm.totalDeliveries || 30),
                            deliverySlot: editForm.renewalType === 'split' ? 'BOTH' : editForm.deliverySlot,
                            splitItems,
                            initialCashCollectedPaise: initialCashPaise > 0 ? initialCashPaise : undefined,
                            paymentMode: editForm.paymentMode !== 'DUE' ? editForm.paymentMode : undefined,
                            note: editForm.note.trim() || undefined,
                          });

                          toast.success("Subscription renewed successfully for next cycle!");
                          setEditingSubscriber(null);
                          await load();
                        } catch (error) {
                          toast.error(getToastErrorMessage(error, "Renewal failed"));
                        } finally {
                          setWorking("");
                        }
                      }}
                      className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-700 text-xs font-black text-white hover:bg-emerald-800 disabled:opacity-50"
                    >
                      {working === "renew-subscriber" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      Confirm Renewal
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 2: SPLIT AM/PM SCHEDULE */}
              {editForm.mode === 'schedule' && (
                <div className="space-y-3.5">
                  <div className="rounded-xl bg-indigo-50 border border-indigo-200 p-3">
                    <p className="text-xs font-black text-indigo-900">Split Morning & Evening Shift Setup</p>
                    <p className="text-[10px] text-indigo-700 mt-0.5">
                      Configure different products and quantities for morning vs evening delivery runs.
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
                    <div>
                      <div className="flex items-center gap-1.5 font-black text-slate-800 text-xs">
                        <Sun className="h-3.5 w-3.5 text-amber-500" /> Morning Run (AM)
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <select
                          value={editForm.amProductName}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, amProductName: e.target.value }))}
                          className="h-9 w-full rounded-lg border border-slate-300 px-2.5 text-xs font-semibold bg-white outline-none focus:border-indigo-500"
                        >
                          {availableProducts.map((p) => (
                            <option key={p.id} value={p.name}>{p.name}</option>
                          ))}
                        </select>
                        <select
                          value={editForm.amQuantity}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, amQuantity: e.target.value }))}
                          className="h-9 w-full rounded-lg border border-slate-300 px-2.5 text-xs font-semibold bg-white"
                        >
                          <option value="0.25L">0.25 Liter</option>
                          <option value="0.5L">0.5 Liter</option>
                          <option value="1.0L">1.0 Liter</option>
                          <option value="1.5L">1.5 Liters</option>
                          <option value="2.0L">2.0 Liters</option>
                        </select>
                      </div>
                    </div>

                    <div className="border-t border-slate-100 pt-3">
                      <div className="flex items-center gap-1.5 font-black text-slate-800 text-xs">
                        <Moon className="h-3.5 w-3.5 text-indigo-500" /> Evening Run (PM)
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <select
                          value={editForm.pmProductName}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, pmProductName: e.target.value }))}
                          className="h-9 w-full rounded-lg border border-slate-300 px-2.5 text-xs font-semibold bg-white outline-none focus:border-indigo-500"
                        >
                          {availableProducts.map((p) => (
                            <option key={p.id} value={p.name}>{p.name}</option>
                          ))}
                        </select>
                        <select
                          value={editForm.pmQuantity}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, pmQuantity: e.target.value }))}
                          className="h-9 w-full rounded-lg border border-slate-300 px-2.5 text-xs font-semibold bg-white"
                        >
                          <option value="0.25L">0.25 Liter</option>
                          <option value="0.5L">0.5 Liter</option>
                          <option value="1.0L">1.0 Liter</option>
                          <option value="1.5L">1.5 Liters</option>
                          <option value="2.0L">2.0 Liters</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl bg-slate-100 p-3 text-center text-xs">
                    <span className="font-bold text-slate-600">Combined Daily Total: </span>
                    <span className="font-black text-emerald-800">
                      {editForm.amQuantity} {editForm.amProductName} + {editForm.pmQuantity} {editForm.pmProductName}
                    </span>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setEditingSubscriber(null)}
                      className="min-h-10 flex-1 rounded-xl border border-slate-200 text-xs font-black hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditForm((prev) => ({ ...prev, mode: 'renew', renewalType: 'split' }));
                        toast.info("Split AM/PM setup saved. Proceed with Renewal.");
                      }}
                      className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-700 text-xs font-black text-white hover:bg-emerald-800"
                    >
                      Apply to Renewal
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 3: CASH FLOW & DUES */}
              {editForm.mode === 'cashflow' && (
                <div className="space-y-3.5">
                  <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                    <p className="text-xs font-black text-slate-900">Customer Account Ledger</p>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-center">
                      <div className="rounded-lg bg-emerald-100/60 p-2">
                        <p className="text-[10px] font-bold text-emerald-800">Total Collected</p>
                        <p className="text-base font-black text-emerald-900">{formatPaise(editingSubscriber.amountCollectedPaise || 0)}</p>
                      </div>
                      <div className="rounded-lg bg-red-100/60 p-2">
                        <p className="text-[10px] font-bold text-red-800">Balance Due</p>
                        <p className="text-base font-black text-red-900">{formatPaise(editingSubscriber.amountDuePaise || 0)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Record Payment Box */}
                  <div className="rounded-xl border border-emerald-300 bg-emerald-50/40 p-3 space-y-2.5">
                    <p className="text-xs font-black text-emerald-950">Record Customer Payment</p>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-[10px] font-bold text-slate-600">Amount (₹)</label>
                        <input
                          type="number"
                          min="1"
                          step="0.01"
                          value={editForm.additionalAmountRupees}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, additionalAmountRupees: e.target.value }))}
                          placeholder={String((editingSubscriber.amountDuePaise || 0) / 100)}
                          className="h-9 w-full rounded-lg border border-slate-300 px-2.5 text-xs font-bold bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-600">Payment Mode</label>
                        <select
                          value={editForm.paymentMode === 'DUE' ? 'CASH' : editForm.paymentMode}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, paymentMode: e.target.value as any }))}
                          className="h-9 rounded-lg border border-slate-300 px-2 text-xs font-bold bg-white"
                        >
                          <option value="CASH">Cash</option>
                          <option value="PHONE_PE">PhonePe / UPI</option>
                        </select>
                      </div>
                    </div>

                    <input
                      type="text"
                      value={editForm.note}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, note: e.target.value }))}
                      placeholder="Optional reference / note (e.g. UPI Ref #8932)"
                      className="h-8 w-full rounded-lg border border-slate-300 px-2 text-xs bg-white"
                    />

                    <button
                      type="button"
                      disabled={working === "record-payment" || !editForm.additionalAmountRupees || Number(editForm.additionalAmountRupees) <= 0}
                      onClick={async () => {
                        setWorking("record-payment");
                        try {
                          await apiClient.post(`/store/subscriptions/subscribers/${editingSubscriber.id}/record-payment`, {
                            amountPaise: Math.round(Number(editForm.additionalAmountRupees) * 100),
                            paymentMode: editForm.paymentMode === 'PHONE_PE' ? 'PHONE_PE' : 'CASH',
                            note: editForm.note.trim() || undefined,
                          });
                          toast.success("Payment recorded successfully!");
                          setEditingSubscriber(null);
                          await load();
                        } catch (error) {
                          toast.error(getToastErrorMessage(error, "Payment recording failed"));
                        } finally {
                          setWorking("");
                        }
                      }}
                      className="w-full inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-emerald-700 text-xs font-black text-white hover:bg-emerald-800 disabled:opacity-50"
                    >
                      {working === "record-payment" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
                      Record Payment Now
                    </button>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => setEditingSubscriber(null)}
                      className="min-h-9 px-4 rounded-xl border border-slate-200 text-xs font-black hover:bg-slate-50"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 4: EDIT BALANCES */}
              {editForm.mode === 'edit' && (
                <div className="space-y-3">
                  <Field label="Amount Due (₹)">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editForm.amountDueRupees}
                      onChange={(e) => setEditForm({ ...editForm, amountDueRupees: e.target.value })}
                      className="h-10 w-full rounded-xl border border-slate-300 px-3 font-bold outline-none focus:border-emerald-500"
                    />
                  </Field>
                  <Field label="Amount Collected (₹)">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editForm.amountCollectedRupees}
                      onChange={(e) => setEditForm({ ...editForm, amountCollectedRupees: e.target.value })}
                      className="h-10 w-full rounded-xl border border-slate-300 px-3 font-bold outline-none focus:border-emerald-500"
                    />
                  </Field>
                  <Field label="Note">
                    <textarea
                      value={editForm.note}
                      onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
                      rows={2}
                      placeholder="Optional note"
                      className="w-full rounded-xl border border-slate-300 p-3 outline-none focus:border-emerald-500"
                    />
                  </Field>
                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setEditingSubscriber(null)}
                      className="min-h-10 flex-1 rounded-xl border border-slate-200 text-xs font-black"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={working === "edit-subscriber"}
                      onClick={async () => {
                        setWorking("edit-subscriber");
                        try {
                          await apiClient.patch(`/store/subscriptions/subscribers/${editingSubscriber.id}/manual-edit`, {
                            amountDuePaise: Math.round(Number(editForm.amountDueRupees || 0) * 100),
                            amountCollectedPaise: Math.round(Number(editForm.amountCollectedRupees || 0) * 100),
                            note: editForm.note.trim() || undefined,
                          });
                          toast.success("Subscriber balances updated");
                          setEditingSubscriber(null);
                          await load();
                        } catch (error) {
                          toast.error(getToastErrorMessage(error, "Update failed"));
                        } finally {
                          setWorking("");
                        }
                      }}
                      className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-700 text-xs font-black text-white disabled:opacity-50"
                    >
                      {working === "edit-subscriber" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Save Changes
                    </button>
                  </div>
                </div>
              )}
            </div>
          </Modal>
        )}

        {viewingHistory && (
          <Modal title={`${viewingHistory.customer.name || 'Customer'} History`} onClose={() => { setViewingHistory(null); setHistoryData(null); }} wide>
            {historyLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
              </div>
            ) : historyData ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-slate-50 p-2 text-center">
                    <p className="text-[10px] text-slate-500">Progress</p>
                    <p className="font-kpi text-sm">{historyData.completedDeliveries ?? historyData.summary?.deliveredDays ?? 0}/{historyData.fundedDeliveryCount || historyData.totalDeliveries || historyData.summary?.totalDays || '—'}</p>
                  </div>
                  <div className="rounded-xl bg-emerald-50 p-2 text-center">
                    <p className="text-[10px] text-emerald-600">Collected</p>
                    <p className="font-kpi text-sm text-emerald-700">{formatPaise(historyData.amountCollectedPaise ?? historyData.summary?.collectedPaise ?? 0)}</p>
                  </div>
                  <div className="rounded-xl bg-amber-50 p-2 text-center">
                    <p className="text-[10px] text-amber-600">Due</p>
                    <p className="font-kpi text-sm text-amber-700">{formatPaise(historyData.amountDuePaise ?? historyData.summary?.duePaise ?? 0)}</p>
                  </div>
                </div>
                
                <DeliveryCalendar deliveries={historyData.deliveries || []} />
              </div>
            ) : (
              <p className="text-center text-sm text-slate-500 py-4">No history data available</p>
            )}
          </Modal>
        )}

        {addCustomerModalOpen && (
          <Modal title="Add Offline Customer & Subscription" onClose={() => setAddCustomerModalOpen(false)} wide>
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-900">
                <p className="font-black text-emerald-800">Add milk customer directly for store delivery and cash / PhonePe tracking.</p>
                <p className="text-[11px] text-emerald-700 mt-0.5">Schedules deliveries on the calendar and reconciles milk cash flow accurately.</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Customer Full Name *">
                  <input
                    type="text"
                    required
                    placeholder="e.g. Saikumar Bali"
                    value={customerForm.name}
                    onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-xs outline-none focus:border-emerald-500"
                  />
                </Field>
                <Field label="Mobile Number (10 Digits) *">
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    placeholder="e.g. 7842204844"
                    value={customerForm.phone}
                    onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-xs outline-none focus:border-emerald-500"
                  />
                </Field>
              </div>

              {/* Mapbox & Google Places Location Picker (Exact replica of /shop/checkout) */}
              <div className="rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50/50 via-white to-slate-50 p-3.5 sm:p-4 space-y-3 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 font-black text-slate-900 text-xs">
                      <MapPin className="h-4 w-4 text-teal-700" />
                      <span>Delivery Location & Map Pin</span>
                      <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[9px] font-black text-teal-800 uppercase tracking-wider">
                        Google & Mapbox Search
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Search address or drag pin. Exact GPS coordinates & address details are captured automatically.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleUseLiveLocation}
                      disabled={customerForm.locating}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-teal-300 bg-teal-700 px-3 py-1.5 text-xs font-black text-white shadow-sm hover:bg-teal-800 active:scale-95 disabled:opacity-60 transition"
                      title="Capture exact device GPS coordinates"
                    >
                      {customerForm.locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Navigation className="h-3.5 w-3.5" />}
                      {customerForm.locating ? "Locating GPS..." : "📍 Use Live GPS"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomerForm((prev) => ({ ...prev, showMap: !prev.showMap }))}
                      className="rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-xs"
                    >
                      {customerForm.showMap ? "Hide Map" : "Show Map"}
                    </button>
                  </div>
                </div>

                {customerForm.showMap && (
                  <div className="overflow-hidden rounded-xl border border-teal-200 shadow-sm">
                    <CustomerLocationPicker
                      latitude={customerForm.latitude}
                      longitude={customerForm.longitude}
                      onChange={handleMapPinChange}
                    />
                  </div>
                )}

                {/* Live GPS / Coordinate indicator */}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-2.5 text-[11px] border border-slate-200 shadow-2xs">
                  <div className="flex items-center gap-2 font-mono text-slate-700 font-semibold text-xs">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-100 animate-pulse"></span>
                    <span>GPS Lat: {customerForm.latitude.toFixed(6)}, Lng: {customerForm.longitude.toFixed(6)}</span>
                  </div>
                  {customerForm.hasLocation && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                      <Check className="h-3 w-3 stroke-[3]" /> Auto-Geocoded from Map
                    </span>
                  )}
                </div>

                {/* Auto-filled address inputs */}
                <div className="grid gap-3 sm:grid-cols-2 pt-1">
                  <Field label="Delivery Address / Door No / Street *">
                    <input
                      type="text"
                      required
                      placeholder="e.g. Flat 301, Sri Sai Residency / Main Road"
                      value={customerForm.address}
                      onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })}
                      className="w-full rounded-xl border border-slate-300 p-2.5 text-xs outline-none focus:border-teal-500"
                    />
                  </Field>
                  <Field label="Landmark (Optional)">
                    <input
                      type="text"
                      placeholder="e.g. Near Ganesh Temple / Opp Water Tank"
                      value={customerForm.landmark}
                      onChange={(e) => setCustomerForm({ ...customerForm, landmark: e.target.value })}
                      className="w-full rounded-xl border border-slate-300 p-2.5 text-xs outline-none focus:border-teal-500"
                    />
                  </Field>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="City / Town">
                    <input
                      type="text"
                      placeholder="Anakapalle"
                      value={customerForm.city}
                      onChange={(e) => setCustomerForm({ ...customerForm, city: e.target.value })}
                      className="w-full rounded-xl border border-slate-300 p-2.5 text-xs outline-none focus:border-teal-500"
                    />
                  </Field>
                  <Field label="State">
                    <input
                      type="text"
                      placeholder="Andhra Pradesh"
                      value={customerForm.state}
                      onChange={(e) => setCustomerForm({ ...customerForm, state: e.target.value })}
                      className="w-full rounded-xl border border-slate-300 p-2.5 text-xs outline-none focus:border-teal-500"
                    />
                  </Field>
                  <Field label="Pincode">
                    <input
                      type="text"
                      placeholder="531001"
                      value={customerForm.pincode}
                      onChange={(e) => setCustomerForm({ ...customerForm, pincode: e.target.value })}
                      className="w-full rounded-xl border border-slate-300 p-2.5 text-xs outline-none focus:border-teal-500"
                    />
                  </Field>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Subscription Plan *">
                  <select
                    value={customerForm.planId}
                    onChange={(e) => {
                      const selected = plans.find(p => p.id === e.target.value);
                      setCustomerForm({
                        ...customerForm,
                        planId: e.target.value,
                        totalDeliveries: String(selected?.totalDeliveries || 30),
                        amountCollectedRupees: selected ? String(selected.pricePaise / 100) : customerForm.amountCollectedRupees,
                      });
                    }}
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-xs outline-none focus:border-emerald-500"
                  >
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({formatPaise(p.pricePaise)})
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Delivery Slot *">
                  <select
                    value={customerForm.deliverySlot}
                    onChange={(e) => setCustomerForm({ ...customerForm, deliverySlot: e.target.value as any })}
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-xs outline-none focus:border-emerald-500"
                  >
                    <option value="MORNING">Morning (AM Slot: 6 AM - 9 AM)</option>
                    <option value="EVENING">Evening (PM Slot: 5 PM - 8 PM)</option>
                    <option value="BOTH">Both (AM + PM)</option>
                  </select>
                </Field>

                <Field label="Delivery Frequency *">
                  <select
                    value={customerForm.frequency}
                    onChange={(e) => setCustomerForm({ ...customerForm, frequency: e.target.value as any })}
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-xs outline-none focus:border-emerald-500 font-semibold text-emerald-800 bg-emerald-50/50"
                  >
                    <option value="DAILY">Daily (Every Day)</option>
                    <option value="ALTERNATE_DAYS">Alternate Days (Day-by-Day, Auto-skip)</option>
                    <option value="WEEKDAYS">Weekdays Only (Mon – Fri)</option>
                  </select>
                </Field>

                <Field label="Start Date *">
                  <input
                    type="date"
                    required
                    value={customerForm.startDate}
                    onChange={(e) => setCustomerForm({ ...customerForm, startDate: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-xs outline-none focus:border-emerald-500"
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Total Days / Deliveries">
                  <input
                    type="number"
                    min="1"
                    max="366"
                    value={customerForm.totalDeliveries}
                    onChange={(e) => setCustomerForm({ ...customerForm, totalDeliveries: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-xs outline-none focus:border-emerald-500"
                  />
                </Field>

                <Field label="Payment Mode">
                  <select
                    value={customerForm.paymentMode}
                    onChange={(e) => setCustomerForm({ ...customerForm, paymentMode: e.target.value as any })}
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-xs outline-none focus:border-emerald-500"
                  >
                    <option value="CASH">Cash Payment</option>
                    <option value="PHONE_PE">PhonePe / UPI</option>
                    <option value="DUE">Payment Due (Pay Later)</option>
                  </select>
                </Field>

                <Field label="Amount Collected (₹)">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    disabled={customerForm.paymentMode === "DUE"}
                    placeholder="0"
                    value={customerForm.amountCollectedRupees}
                    onChange={(e) => setCustomerForm({ ...customerForm, amountCollectedRupees: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-xs outline-none focus:border-emerald-500 disabled:bg-slate-100"
                  />
                </Field>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-black text-slate-800">Split AM & PM Products</p>
                    <p className="text-[11px] text-slate-500">e.g. Cow Milk in Morning (0.5L) + Buffalo Milk in Evening (1L)</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={customerForm.enableSplitItems}
                      onChange={(e) => setCustomerForm({ ...customerForm, enableSplitItems: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>
                {customerForm.enableSplitItems && (
                  <div className="grid gap-2 sm:grid-cols-2 pt-2 border-t border-slate-200">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-500">Morning Product & Qty</label>
                      <div className="flex gap-1.5">
                        <select
                          value={customerForm.amProductName}
                          onChange={(e) => setCustomerForm({ ...customerForm, amProductName: e.target.value })}
                          className="w-2/3 rounded-lg border border-slate-300 p-2 text-xs font-semibold bg-white outline-none focus:border-emerald-500"
                        >
                          {availableProducts.map((p) => (
                            <option key={p.id} value={p.name}>{p.name}</option>
                          ))}
                        </select>
                        <select
                          value={customerForm.amQuantity}
                          onChange={(e) => setCustomerForm({ ...customerForm, amQuantity: e.target.value })}
                          className="w-1/3 rounded-lg border border-slate-300 p-2 text-xs font-semibold bg-white"
                        >
                          <option value="0.25L">0.25L</option>
                          <option value="0.5L">0.5L</option>
                          <option value="1.0L">1.0L</option>
                          <option value="1.5L">1.5L</option>
                          <option value="2.0L">2.0L</option>
                        </select>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-500">Evening Product & Qty</label>
                      <div className="flex gap-1.5">
                        <select
                          value={customerForm.pmProductName}
                          onChange={(e) => setCustomerForm({ ...customerForm, pmProductName: e.target.value })}
                          className="w-2/3 rounded-lg border border-slate-300 p-2 text-xs font-semibold bg-white outline-none focus:border-emerald-500"
                        >
                          {availableProducts.map((p) => (
                            <option key={p.id} value={p.name}>{p.name}</option>
                          ))}
                        </select>
                        <select
                          value={customerForm.pmQuantity}
                          onChange={(e) => setCustomerForm({ ...customerForm, pmQuantity: e.target.value })}
                          className="w-1/3 rounded-lg border border-slate-300 p-2 text-xs font-semibold bg-white"
                        >
                          <option value="0.25L">0.25L</option>
                          <option value="0.5L">0.5L</option>
                          <option value="1.0L">1.0L</option>
                          <option value="1.5L">1.5L</option>
                          <option value="2.0L">2.0L</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-black text-slate-800">Planned Vacation / Advance Pauses</p>
                    <p className="text-[11px] text-slate-500">Automatically skip deliveries during customer vacation dates</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={customerForm.enableVacation}
                      onChange={(e) => setCustomerForm({ ...customerForm, enableVacation: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>
                {customerForm.enableVacation && (
                  <div className="grid gap-2 sm:grid-cols-3 pt-2 border-t border-slate-200">
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-500">Vacation From</label>
                      <input
                        type="date"
                        value={customerForm.vacationFrom}
                        onChange={(e) => setCustomerForm({ ...customerForm, vacationFrom: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 p-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-500">Vacation To</label>
                      <input
                        type="date"
                        value={customerForm.vacationTo}
                        onChange={(e) => setCustomerForm({ ...customerForm, vacationTo: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 p-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-500">Vacation Policy</label>
                      <select
                        value={customerForm.vacationPolicy}
                        onChange={(e) => setCustomerForm({ ...customerForm, vacationPolicy: e.target.value as any })}
                        className="w-full rounded-lg border border-slate-300 p-2 text-xs"
                      >
                        <option value="EXTEND_PLAN">Extend Plan (Deliveries shifted forward)</option>
                        <option value="DEDUCT_BILL">Deduct Bill (Mark as Skipped)</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <Field label="Remarks / Operational Notes">
                <input
                  type="text"
                  placeholder="e.g. 1L Buffalo Milk AM, Riksha Colony"
                  value={customerForm.note}
                  onChange={(e) => setCustomerForm({ ...customerForm, note: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-xs outline-none focus:border-emerald-500"
                />
              </Field>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAddCustomerModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingCustomer}
                  onClick={() => void saveOfflineCustomer()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-5 py-2.5 text-xs font-black text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  {savingCustomer ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 stroke-[3]" />}
                  Create Customer & Subscription
                </button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </DashboardLayout>
  );
}

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    ACTIVE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    PAUSED: "bg-amber-50 text-amber-700 ring-amber-200",
    CANCELLED: "bg-red-50 text-red-700 ring-red-200",
    ONLINE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    OFFLINE: "bg-slate-100 text-slate-600 ring-slate-200",
    DRAFT: "bg-slate-100 text-slate-600 ring-slate-200",
    PENDING_CASH_COLLECTION: "bg-amber-50 text-amber-700 ring-amber-200",
    PAYMENT_DUE: "bg-amber-50 text-amber-700 ring-amber-200",
    GRACE_PERIOD: "bg-orange-50 text-orange-700 ring-orange-200",
  };
  const shortLabels: Record<string, string> = {
    PENDING_CASH_COLLECTION: "Pending",
    PAYMENT_DUE: "Payment Due",
    GRACE_PERIOD: "Grace",
  };
  const label = shortLabels[status] || humanize(status);
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ring-1 ${colors[status] || "bg-slate-50 text-slate-600 ring-slate-200"}`}
    >
      {label}
    </span>
  );
}

function SubscribersSection({
  rows,
  onEdit,
  onViewHistory,
  onAddOfflineCustomer,
}: {
  rows: SubscriberRow[];
  onEdit?: (sub: SubscriberRow) => void;
  onViewHistory?: (sub: SubscriberRow) => void;
  onAddOfflineCustomer?: () => void;
}) {
  const [sourceFilter, setSourceFilter] = useState<'all' | 'online' | 'offline'>('all');
  const filteredRows = rows.filter((row) => {
    if (sourceFilter === 'all') return true;
    const isOffline = row.deliveryMethod === 'PERSONAL_HANDOVER' || row.customer?.email?.startsWith('offline.');
    return sourceFilter === 'offline' ? isOffline : !isOffline;
  });

  return (
    <section className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-black text-slate-900">Customer subscriptions</h2>
          <p className="text-xs font-semibold text-slate-500">Store subscription records for your assigned stores.</p>
        </div>
        <div className="flex items-center gap-2">
          {onAddOfflineCustomer && (
            <button
              onClick={onAddOfflineCustomer}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3.5 py-1.5 text-xs font-black text-white hover:bg-emerald-800 shadow-sm transition-all"
            >
              <UserPlus className="h-3.5 w-3.5" /> Add Offline Customer
            </button>
          )}
          <div className="flex gap-1.5">
            {(['all', 'online', 'offline'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setSourceFilter(filter)}
                className={`rounded-lg px-3 py-1.5 text-xs font-black ${sourceFilter === filter ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {filter.charAt(0).toUpperCase() + filter.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>
      {filteredRows.length ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-[850px] w-full text-left text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2.5 font-badge">Customer</th>
                <th className="px-3 py-2.5 font-badge">Phone</th>
                <th className="px-3 py-2.5 font-badge">Plan</th>
                <th className="px-3 py-2.5 font-badge">Store</th>
                <th className="px-3 py-2.5 font-badge">Delivery</th>
                <th className="px-3 py-2.5 font-badge">Status</th>
                <th className="px-3 py-2.5 font-badge text-right">Progress</th>
                <th className="px-3 py-2.5 font-badge text-right">Collected / due</th>
                <th className="px-3 py-2.5 font-badge">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.map((row) => (
                <tr key={row.id} className="hover:bg-emerald-50/30">
                  <td className="whitespace-nowrap px-3 py-2.5 font-black text-slate-900">
                    {row.customer.name || row.deliveryContact?.name || "Customer"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-600">
                    {row.customer.phone || row.deliveryContact?.phone || "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <p className="font-bold text-slate-800">{row.plan.name}</p>
                    <p className="text-[10px] text-slate-400">{row.plan.code || "—"}</p>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                    {row.homeStore?.name || "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    {row.storeDelivery || row.deliveryMethod === 'PERSONAL_HANDOVER' ? (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">
                        <Truck className="h-3 w-3" /> Store
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-blue-100 px-2 py-0.5 text-[10px] font-black text-blue-700">
                        <Route className="h-3 w-3" /> Rider
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <StatusPill status={row.status} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-black text-slate-800">
                    {row.completedDeliveries ?? 0}/{row.fundedDeliveryCount || row.planVersion?.totalDeliveries || "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">
                    <span className="font-black text-emerald-700">{formatPaise(Number(row.amountCollectedPaise || 0))}</span>
                    <span className="text-slate-400"> / </span>
                    <span className="font-black text-amber-700">{formatPaise(Number(row.amountDuePaise || 0))}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <div className="flex gap-1">
                      {onViewHistory && (
                        <button
                          onClick={() => onViewHistory(row)}
                          className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 text-[10px] font-black text-emerald-700 hover:bg-emerald-100"
                        >
                          <CalendarDays className="h-3 w-3" /> Track
                        </button>
                      )}
                      {onEdit && (
                        <button
                          onClick={() => onEdit(row)}
                          className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 text-[10px] font-black text-slate-700 hover:bg-slate-100"
                        >
                          <Edit3 className="h-3 w-3" /> Edit
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <h2 className="text-sm font-black text-slate-800">No subscribers yet</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">Subscriptions tied to your stores will appear here.</p>
          {onAddOfflineCustomer && (
            <button
              onClick={onAddOfflineCustomer}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-black text-white hover:bg-emerald-800 shadow-sm transition-all"
            >
              <UserPlus className="h-4 w-4" /> Add Offline Customer
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function PlansSection({ rows }: { rows: PlanRow[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const actives = rows.filter((row) => row.status === "ACTIVE").length;
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-black text-slate-800">
          Plans · {rows.length} ({actives} active)
        </h2>
        <p className="text-xs text-slate-500">
          Subscription plans assigned to your stores.
        </p>
      </div>
      {rows.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((plan) => (
            <article
              key={plan.id}
              className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-black text-slate-900">{plan.name}</p>
                  <p className="text-xs text-slate-500">{plan.code}</p>
                </div>
                <StatusPill status={plan.status} />
              </div>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-xl font-black text-slate-900">
                  {formatPaise(plan.pricePaise)}
                </span>
                {Number(plan.mrpPaise) > Number(plan.pricePaise) ? (
                  <span className="text-sm font-bold text-slate-400 line-through">
                    {formatPaise(plan.mrpPaise)}
                  </span>
                ) : null}
                <span className="text-xs text-slate-500">
                  · {humanize(plan.fundingCycle)} · {plan.totalDeliveries} deliveries
                </span>
              </div>
              {plan.description ? (
                <p className="text-sm text-slate-600">{plan.description}</p>
              ) : null}
              <ul className="space-y-1 text-xs text-slate-600">
                {plan.items.slice(0, expanded === plan.id ? undefined : 2).map((item) => (
                  <li key={item.productId} className="flex justify-between gap-2">
                    <span className="truncate">{item.product.name}</span>
                    <span className="shrink-0 font-bold">
                      {item.quantityPerDelivery} × {item.product.weightGrams ? `${item.product.weightGrams}g` : "unit"}
                    </span>
                  </li>
                ))}
              </ul>
              {plan.items.length > 2 ? (
                <button
                  onClick={() => setExpanded(expanded === plan.id ? null : plan.id)}
                  className="text-left text-xs font-black text-emerald-700"
                >
                  {expanded === plan.id ? "Show less" : `Show ${plan.items.length - 2} more`}
                </button>
              ) : null}
              <div className="mt-auto flex flex-wrap gap-2 text-xs text-slate-500">
                <span>{plan.stores?.length ?? 0} stores</span>
                <span>· {plan.zones?.length ?? 0} zones</span>
                <span>· {plan._count?.subscriptions ?? 0} subscribers</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <State
          icon={Archive}
          title="No plans assigned"
          text="Plans are assigned to stores by the admin hub."
        />
      )}
    </section>
  );
}

function CalendarSection({ rows, upcomingDemand, onReload }: { rows: CalendarRow[]; upcomingDemand?: number | null; onReload: () => void }) {
  const [dateFilter, setDateFilter] = useState("next14");
  const scopeStart = useMemo(() => {
    const now = new Date();
    if (dateFilter === "next14") return new Date(now.getTime());
    if (dateFilter === "past14") return new Date(now.getTime() - 14 * 86_400_000);
    return new Date(now.getTime() - 60 * 86_400_000);
  }, [dateFilter]);
  const scopeEnd = useMemo(() => {
    const now = new Date();
    if (dateFilter === "next14") return new Date(now.getTime() + 14 * 86_400_000);
    if (dateFilter === "past14") return new Date(now.getTime());
    return new Date(now.getTime() + 60 * 86_400_000);
  }, [dateFilter]);
  const filtered = rows
    .filter((row) => {
      const date = new Date(row.serviceDate).getTime();
      return date >= scopeStart.getTime() && date <= scopeEnd.getTime();
    })
    .sort((a, b) => a.serviceDate.localeCompare(b.serviceDate));
  const byDate = useMemo(() => {
    const map = new Map<string, CalendarRow[]>();
    for (const row of filtered) {
      const key = row.serviceDate.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }
    return [...map.entries()];
  }, [filtered]);
  const scheduled = filtered.filter((row) => row.status === "SCHEDULED").length;
  const cashDue = filtered.reduce((sum, row) => sum + Number(row.cashDuePaise || 0), 0);
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-black text-slate-800">
          Delivery calendar · {filtered.length} deliveries
        </h2>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1">
            {(["next14", "past14", "all"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setDateFilter(mode)}
                className={`rounded-lg px-3 py-1 text-xs font-black ${dateFilter === mode ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
              >
                {mode === "next14" ? "Next 14 days" : mode === "past14" ? "Past 14 days" : "All"}
              </button>
            ))}
          </div>
          <button
            onClick={onReload}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-2xl bg-slate-900 p-4 text-white">
          <p className="text-xs text-slate-300">Scheduled</p>
          <p className="mt-1 text-2xl font-black">{scheduled}</p>
        </div>
        <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <p className="text-xs text-slate-500">Cash due</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{formatPaise(cashDue)}</p>
        </div>
        <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <p className="text-xs text-slate-500">Upcoming 7-day demand</p>
          <p className="mt-1 text-2xl font-black text-slate-900">
            {upcomingDemand !== null && upcomingDemand !== undefined ? upcomingDemand : "—"}
          </p>
        </div>
      </div>
      {byDate.length ? (
        byDate.map(([date, dayRows]) => (
          <div key={date} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="font-black text-slate-800">
                {new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })}
              </h3>
              <span className="text-xs font-bold text-slate-500">{dayRows.length} deliveries</span>
            </div>
            <div className="divide-y divide-slate-100">
              {dayRows.map((row) => (
                <div key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                  <span className="font-bold text-slate-800">
                    {row.subscription.customer.name || "Customer"}
                  </span>
                  <span className="text-xs text-slate-500">
                    {row.subscription.plan.name}
                  </span>
                  <span className="text-xs text-slate-400">#{row.sequenceNumber}</span>
                  <StatusPill status={row.status} />
                  {row.runStop?.deliveryRun ? (
                    <span className="text-xs text-slate-500">
                      {row.runStop.deliveryRun.routeCode}
                    </span>
                  ) : null}
                  <span className="ml-auto text-xs font-bold text-slate-600">
                    {formatPaise(Number(row.cashDuePaise || 0))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))
      ) : (
        <State icon={CalendarDays} title="No deliveries in range" text="Adjust the calendar range to see scheduled deliveries." />
      )}
    </section>
  );
}

function AnalyticsSection({
  analytics,
  runs,
  cash,
  subscribers,
}: {
  analytics: StoreAnalytics | null;
  runs: Run[];
  cash: CashBatch[];
  subscribers: SubscriberRow[];
}) {
  const activeSubs = useMemo(() => {
    if (analytics) {
      const row = analytics.subscriptions.find((r) => r.status === "ACTIVE");
      return row?._count?._all ?? 0;
    }
    return subscribers.filter((s) => s.status === "ACTIVE").length;
  }, [analytics, subscribers]);
  const collected = useMemo(() => {
    if (analytics) {
      return analytics.subscriptions.reduce((sum, row) => sum + Number(row._sum?.amountCollectedPaise || 0), 0);
    }
    return 0;
  }, [analytics]);
  const due = useMemo(() => {
    if (analytics) {
      return analytics.subscriptions.reduce((sum, row) => sum + Number(row._sum?.amountDuePaise || 0), 0);
    }
    return 0;
  }, [analytics]);
  const pendingBatches = cash.filter((batch) => batch.status === "SUBMITTED").length;
  const openRuns = runs.filter((run) => run.status !== "COMPLETED" && run.status !== "CANCELLED").length;
  const plannedDeliveries = runs.reduce((sum, run) => sum + (run.totalStopCount || run.stops?.length || 0), 0);
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-black text-slate-800">Store analytics</h2>
        <span className="text-xs text-slate-400">
          {analytics?.generatedAt ? `Updated ${formatDate(analytics.generatedAt)}` : ""}
        </span>
      </div>
      {analytics ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <AnalyticCard label="Active subscribers" value={String(activeSubs)} icon={Users} tone="emerald" />
            <AnalyticCard label="Cash collected" value={formatPaise(collected)} icon={Banknote} tone="emerald" />
            <AnalyticCard label="Cash due" value={formatPaise(due)} icon={Banknote} tone="amber" />
            <AnalyticCard label="Upcoming 7-day demand" value={String(analytics.upcomingSevenDayDemand ?? 0)} icon={Truck} tone="slate" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <AnalyticCard label="Open runs" value={String(openRuns)} icon={Route} tone="slate" />
            <AnalyticCard label="Batches pending verify" value={String(pendingBatches)} icon={ClipboardCheck} tone="amber" />
            <AnalyticCard label="Total subscribers" value={String(subscribers.length)} icon={Users} tone="slate" />
            <AnalyticCard label="Planned deliveries" value={String(plannedDeliveries)} icon={Package} tone="slate" />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <AnalyticsTable title="Subscriptions by status" rows={analytics.subscriptions.map((row) => ({ status: row.status, count: row._count?._all ?? 0, amount: Number(row._sum?.amountCollectedPaise || 0) }))} />
            <AnalyticsTable title="Deliveries by status" rows={analytics.deliveries.map((row) => ({ status: row.status, count: row._count?._all ?? 0, amount: Number(row._sum?.cashDuePaise || 0) }))} />
            <AnalyticsTable title="Cash batches by status" rows={analytics.cash.map((row) => ({ status: row.status, count: row._count?._all ?? 0, amount: Number(row._sum?.verifiedAmountPaise || 0) }))} />
          </div>
        </>
      ) : (
        <State icon={BarChart3} title="Analytics unavailable" text="Aggregated store analytics will appear here." />
      )}
    </section>
  );
}

function AnalyticCard({ label, value, icon: Icon, tone = "slate" }: { label: string; value: string; icon: typeof Users; tone?: "emerald" | "amber" | "slate" }) {
  return (
    <div className={`rounded-2xl p-4 ring-1 ${tone === "emerald" ? "bg-emerald-50 ring-emerald-100" : tone === "amber" ? "bg-amber-50 ring-amber-100" : "bg-white ring-slate-200"}`}>
      <Icon className={`h-4 w-4 ${tone === "emerald" ? "text-emerald-700" : tone === "amber" ? "text-amber-700" : "text-slate-500"}`} />
      <p className="mt-2 text-xs font-bold text-slate-500">{label}</p>
      <p className="text-xl font-black text-slate-900">{value}</p>
    </div>
  );
}

function AnalyticsTable({ title: heading, rows }: { title: string; rows: Array<{ status: string; count: number; amount: number }> }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="mb-2 font-black text-slate-800">{heading}</h3>
      <div className="divide-y divide-slate-100">
        {rows.length ? rows.map((row) => (
          <div key={row.status} className="flex items-center justify-between gap-2 py-1.5 text-sm">
            <span className="text-slate-600">{humanize(row.status)}</span>
            <span className="font-black text-slate-800">{row.count}</span>
          </div>
        )) : (
          <p className="py-2 text-xs text-slate-400">No data</p>
        )}
      </div>
    </div>
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
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 sm:items-center sm:p-5">
      <div className={`max-h-[94vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl ${wide ? 'max-w-3xl' : 'max-w-xl'}`}>
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

function DeliveryCalendar({ deliveries }: { deliveries: any[] }) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const [selectedDate, setSelectedDate] = useState<string>(todayKey);

  const deliveryMap = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const d of deliveries) {
      const rawDate = d.serviceDate || d.date;
      if (!rawDate) continue;
      const date = new Date(rawDate);
      if (isNaN(date.getTime())) continue;
      const localKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const utcKey = date.toISOString().slice(0, 10);
      if (!map[localKey]) map[localKey] = [];
      if (!map[localKey].includes(d)) map[localKey].push(d);
      if (utcKey !== localKey) {
        if (!map[utcKey]) map[utcKey] = [];
        if (!map[utcKey].includes(d)) map[utcKey].push(d);
      }
    }
    return map;
  }, [deliveries]);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const days = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  const statusColor: Record<string, string> = {
    DELIVERED: 'bg-emerald-500',
    FAILED: 'bg-red-500',
    SKIPPED: 'bg-slate-400',
    SCHEDULED: 'bg-amber-400',
    ORDER_GENERATED: 'bg-blue-400',
    PREPARING: 'bg-indigo-400',
    PACKED: 'bg-purple-400',
    STORE_DELIVERING: 'bg-orange-400',
  };

  const selectedDeliveries = deliveryMap[selectedDate] || [];

  return (
    <div className="rounded-xl border border-slate-200 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <button onClick={() => setCurrentMonth(new Date(year, month - 1, 1))} className="rounded-lg p-1 hover:bg-slate-100">
          <span className="text-lg font-bold text-slate-600">&lt;</span>
        </button>
        <h3 className="text-sm font-badge text-slate-800">
          {currentMonth.toLocaleString('en-IN', { month: 'long', year: 'numeric' })}
        </h3>
        <button onClick={() => setCurrentMonth(new Date(year, month + 1, 1))} className="rounded-lg p-1 hover:bg-slate-100">
          <span className="text-lg font-bold text-slate-600">&gt;</span>
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
          <div key={d} className="text-center text-[9px] font-badge uppercase text-slate-400 py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} />;
          const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const dayDeliveries = deliveryMap[dateKey] || [];
          const hasDelivery = dayDeliveries.length > 0;
          const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
          const isSelected = selectedDate === dateKey;
          const isDelivered = dayDeliveries.some((d: any) => d.status === 'DELIVERED');

          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => setSelectedDate(dateKey)}
              className={`relative min-h-[48px] rounded-lg p-1 text-center transition-all ${
                isSelected
                  ? 'ring-2 ring-emerald-600 bg-emerald-50'
                  : isToday
                  ? 'ring-1 ring-emerald-400 bg-slate-50'
                  : hasDelivery
                  ? 'bg-slate-50 hover:bg-slate-100'
                  : 'hover:bg-slate-50'
              }`}
            >
              <span className={`text-xs font-bold block ${isToday ? 'text-emerald-700' : 'text-slate-700'}`}>{day}</span>
              {hasDelivery && (
                <div className="flex flex-col items-center justify-center mt-1">
                  {isDelivered ? (
                    <span
                      className="flex items-center justify-center h-5 w-5 rounded-full bg-emerald-100 text-emerald-700 shadow-sm ring-1 ring-emerald-300"
                      title={dayDeliveries.map((d: any) => `#${d.sequenceNumber}: Delivered${d.cashCollectedPaise ? ` (Collected: ${formatPaise(d.cashCollectedPaise)})` : ''}`).join('\n')}
                    >
                      <Check className="h-3.5 w-3.5 stroke-[3]" />
                    </span>
                  ) : dayDeliveries.some((d: any) => d.status === 'FAILED') ? (
                    <span className="flex items-center justify-center h-5 w-5 rounded-full bg-red-100 text-red-700 shadow-sm" title="Delivery Failed">
                      <X className="h-3.5 w-3.5 stroke-[3]" />
                    </span>
                  ) : dayDeliveries.some((d: any) => d.status === 'SKIPPED') ? (
                    <span className="flex items-center justify-center h-5 w-5 rounded-full bg-slate-100 text-slate-600 shadow-sm" title="Delivery Skipped">
                      <Pause className="h-3 w-3 stroke-[2.5]" />
                    </span>
                  ) : (
                    <div className="flex flex-wrap justify-center gap-0.5">
                      {dayDeliveries.slice(0, 3).map((d: any) => (
                        <span
                          key={d.id}
                          className={`h-2 w-2 rounded-full ${statusColor[d.status] || 'bg-slate-300'}`}
                          title={`#${d.sequenceNumber}: ${d.status}${d.cashCollectedPaise ? ` (Collected: ${formatPaise(d.cashCollectedPaise)})` : ''}`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {selectedDeliveries.length > 0 ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 space-y-2">
          <p className="text-[11px] font-black uppercase text-emerald-900">
            Deliveries on {formatDate(selectedDate)}
          </p>
          <div className="space-y-1.5">
            {selectedDeliveries.map((d: any) => (
              <div key={d.id} className="flex items-center justify-between rounded-lg bg-white p-2.5 shadow-sm border border-slate-100 text-xs">
                <div className="flex items-center gap-2">
                  {d.status === 'DELIVERED' ? (
                    <span className="flex items-center justify-center h-4 w-4 rounded-full bg-emerald-100 text-emerald-700">
                      <Check className="h-3 w-3 stroke-[3]" />
                    </span>
                  ) : (
                    <span className={`h-2.5 w-2.5 rounded-full ${statusColor[d.status] || 'bg-slate-300'}`} />
                  )}
                  <div>
                    <span className="font-black text-slate-900">Delivery #{d.sequenceNumber}</span>
                    <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                      {d.deliverySlot || 'AM'}
                    </span>
                    <p className="text-[10px] text-slate-500 mt-0.5">Status: <strong className="font-semibold text-slate-700">{humanize(d.status)}</strong></p>
                  </div>
                </div>
                <div className="text-right">
                  {d.cashCollectedPaise > 0 ? (
                    <div>
                      <p className="font-black text-emerald-700">{formatPaise(d.cashCollectedPaise)}</p>
                      <p className="text-[9px] text-slate-400">Cash Collected</p>
                    </div>
                  ) : d.cashDuePaise > 0 ? (
                    <div>
                      <p className="font-black text-amber-700">{formatPaise(d.cashDuePaise)}</p>
                      <p className="text-[9px] text-slate-400">Cash Due</p>
                    </div>
                  ) : (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Pre-funded</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5 text-center text-xs text-slate-500">
          {selectedDate ? `No deliveries scheduled on ${formatDate(selectedDate)}` : 'Select a date to view delivery details'}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
        <div className="flex items-center gap-1.5">
          <span className="flex items-center justify-center h-3.5 w-3.5 rounded-full bg-emerald-100 text-emerald-700">
            <Check className="h-2.5 w-2.5 stroke-[3]" />
          </span>
          <span className="text-[10px] font-bold text-slate-700">Delivered</span>
        </div>
        {Object.entries(statusColor).filter(([s]) => s !== 'DELIVERED' && deliveries.some((d) => d.status === s)).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1">
            <div className={`h-2 w-2 rounded-full ${color}`} />
            <span className="text-[9px] text-slate-500">{humanize(status)}</span>
          </div>
        ))}
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
