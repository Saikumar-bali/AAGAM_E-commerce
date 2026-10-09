'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@aagam/utils';
import { getToastErrorMessage, useToast } from '@/components/ToastProvider';
import {
  ArrowLeft,
  Banknote,
  Check,
  Crosshair,
  ExternalLink,
  Flag,
  Layers,
  Loader2,
  MapPin,
  Maximize2,
  MoreHorizontal,
  Navigation,
  Package,
  Phone,
  Plus,
  RefreshCw,
  Route as RouteIcon,
  TriangleAlert,
  X,
} from 'lucide-react';
import RiderRunConsoleMap, { stopMatchesFilter } from './RiderRunConsoleMap';
import type { ConsoleStop, ConsoleStopStatus } from './RiderRunConsoleMap';

// ---------------------------------------------------------------------------
// Types (shape mirrors GET /rider/delivery-runs/today and /:runId)
// ---------------------------------------------------------------------------

type RunStatus =
  | 'PLANNED'
  | 'RIDER_NEEDED'
  | 'READY_FOR_PICKUP'
  | 'PICKED_UP'
  | 'IN_PROGRESS'
  | 'RETURNING'
  | 'AWAITING_SETTLEMENT'
  | 'INTERRUPTED'
  | 'RECOVERY_REQUIRED'
  | 'COMPLETED'
  | 'CANCELLED';

type FailureReason =
  | 'CUSTOMER_UNREACHABLE'
  | 'CUSTOMER_REFUSED'
  | 'ADDRESS_NOT_FOUND'
  | 'WRONG_ADDRESS'
  | 'PAYMENT_NOT_AVAILABLE'
  | 'VEHICLE_BREAKDOWN'
  | 'PACKAGE_DAMAGED'
  | 'SAFETY_CONCERN'
  | 'OTHER';

type RunStop = {
  id: string;
  subscriptionDeliveryId?: string;
  deliveryJobId?: string;
  sequenceNumber: number;
  status: ConsoleStopStatus;
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
      deliveryMethod: 'TRUSTED_DROP' | 'PERSONAL_HANDOVER' | 'SECURITY_RECEPTION';
      trustedDropInstructions?: string | null;
    };
  };
};

type Run = {
  id: string;
  routeCode: string;
  deliveryZone?: {
    id: string;
    code: string;
    name: string;
    centerLatitude?: number | null;
    centerLongitude?: number | null;
  } | null;
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
  estimatedDistanceKm?: number;
  estimatedDurationMinutes?: number;
  store: { name: string; address: string; latitude?: number | null; longitude?: number | null };
  stops?: RunStop[];
};

type Coordinates = { latitude: number; longitude: number; accuracyMetres?: number };

type FilterKey = 'ALL' | 'UNDELIVERED' | 'DELIVERED' | 'FAILED' | 'COD';

type RiderAddOnPayload = {
  extraQuantity: string;
  extraPaise: number;
  consecutiveDays: number;
  targetSlot?: 'AM' | 'PM';
  note?: string;
};

const FAILURES: Array<{ value: FailureReason; label: string }> = (
  [
    ['CUSTOMER_UNREACHABLE', 'Customer unreachable'],
    ['CUSTOMER_REFUSED', 'Customer refused'],
    ['ADDRESS_NOT_FOUND', 'Address not found'],
    ['WRONG_ADDRESS', 'Wrong address'],
    ['PAYMENT_NOT_AVAILABLE', 'Cash unavailable'],
    ['PACKAGE_DAMAGED', 'Package damaged'],
    ['VEHICLE_BREAKDOWN', 'Vehicle breakdown'],
    ['SAFETY_CONCERN', 'Safety concern'],
    ['OTHER', 'Other'],
  ] as Array<[FailureReason, string]>
).map(([value, label]) => ({ value, label }));

const TERMINAL: ConsoleStopStatus[] = ['DELIVERED', 'FAILED', 'CANCELLED'];
const EXTRA_PRESETS = [
  { label: '+0.5L', qty: '+0.5L', priceRupees: 40 },
  { label: '+1L', qty: '+1L', priceRupees: 80 },
  { label: '+1.5L', qty: '+1.5L', priceRupees: 120 },
  { label: '+2L', qty: '+2L', priceRupees: 160 },
];
const SCHEDULE_DAYS = [
  { label: 'Today only', days: 1 },
  { label: '2 days', days: 2 },
  { label: '3 days', days: 3 },
  { label: '5 days', days: 5 },
  { label: '7 days', days: 7 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function money(paise?: number | null) {
  return `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/** Volume in litres for a quantity label, or null. Mirrors the backend parser. */
function parseQuantityLiters(label?: string | null): number | null {
  if (!label) return null;
  const text = label.toLowerCase();
  let unitVolume: number | null = null;
  const ml = text.match(/(?<!\d)(\d+(?:\.\d+)?)\s*ml\b/);
  if (ml) {
    unitVolume = Number(ml[1]) / 1000;
  } else {
    const fraction =
      text.match(/(?<!\d)(\d+)\s*\/\s*(\d+)\s*(?:l|lt|ltr|liter|litre)\b/) ||
      text.match(/(?<!\d)(\d+)\s*\/\s*(\d+)\s*\((?:l|lt|ltr|liter|litre)\)/);
    if (fraction && Number(fraction[2]) > 0) unitVolume = Number(fraction[1]) / Number(fraction[2]);
    else {
      const liters = text.match(/(?<!\d)(\d+(?:\.\d+)?)\s*(?:l|lt|ltr|liter|litre)\b/);
      if (liters) unitVolume = Number(liters[1]);
    }
  }
  if (unitVolume !== null) {
    const counted = text.match(/(?<!\d)(\d+(?:\.\d+)?)\s*(?:units?|packets?|packs?|pkts?|bottles?|pouches?|nos?\.?|pieces?|pcs?)\b/);
    return counted ? Number(counted[1]) * unitVolume : unitVolume;
  }
  return null;
}

function stopLitres(stop: RunStop): number | null {
  let total = 0;
  let found = false;
  for (const item of stop.deliveryJob.order.items || []) {
    const liters = parseQuantityLiters(item.product?.name);
    if (liters != null) {
      total += liters * (item.quantity || 1);
      found = true;
    }
  }
  return found ? Math.round(total * 100) / 100 : null;
}

function snapshotText(snapshot: Record<string, unknown> | null | undefined) {
  return (
    ['line1', 'addressLine1', 'line2', 'addressLine2', 'landmark', 'city', 'pincode', 'postalCode']
      .map((key) => snapshot?.[key])
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join(', ') || 'Customer delivery address'
  );
}

function stopName(stop: RunStop) {
  return stop.deliveryJob.order.customer?.name || 'Customer';
}

function stopPhone(stop: RunStop) {
  const snapshot = stop.subscriptionDelivery.subscription.addressSnapshot as
    | Record<string, unknown>
    | null
    | undefined;
  return (
    stop.deliveryJob.order.customer?.phone ||
    (typeof snapshot?.phoneE164 === 'string' ? snapshot.phoneE164 : null)
  );
}

function stopCoordinates(stop: RunStop, zone?: Run['deliveryZone']) {
  const snapshot = stop.subscriptionDelivery.subscription.addressSnapshot as
    | Record<string, unknown>
    | null
    | undefined;
  const lat = snapshot?.latitude;
  const lng = snapshot?.longitude;
  if (typeof lat === 'number' && typeof lng === 'number')
    return { latitude: lat, longitude: lng, approximate: false };
  if (zone && typeof zone.centerLatitude === 'number' && typeof zone.centerLongitude === 'number')
    return { latitude: zone.centerLatitude, longitude: zone.centerLongitude, approximate: true };
  return null;
}

function googleMapsUrl(latitude: number, longitude: number) {
  const params = new URLSearchParams({ api: '1', destination: `${latitude},${longitude}`, travelmode: 'driving' });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Multi-stop navigation: origin + waypoints, matching the store/route pattern. */
function googleMapsRouteUrl(points: Array<{ latitude: number; longitude: number }>) {
  if (points.length < 2) return points[0] ? googleMapsUrl(points[0].latitude, points[0].longitude) : null;
  const [origin, ...rest] = points;
  const destination = rest[rest.length - 1];
  const waypoints = rest.slice(0, -1).map((point) => `${point.latitude},${point.longitude}`).join('|');
  const params = new URLSearchParams({
    api: '1',
    origin: `${origin.latitude},${origin.longitude}`,
    destination: `${destination.latitude},${destination.longitude}`,
    travelmode: 'driving',
  });
  if (waypoints) params.set('waypoints', waypoints);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function coordinates(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('This browser does not provide precise location.'));
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMetres: position.coords.accuracy,
        }),
      () => reject(new Error('Allow precise location before completing route proof.')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 4000 },
    );
  });
}

function firstActionableId(run: Run | null) {
  return run?.stops?.find((stop) => !TERMINAL.includes(stop.status))?.id ?? null;
}

function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function statusTone(status: ConsoleStopStatus) {
  if (status === 'DELIVERED') return 'bg-teal-50 text-teal-700 ring-teal-200';
  if (status === 'ARRIVED') return 'bg-amber-50 text-amber-700 ring-amber-200';
  if (status === 'FAILED' || status === 'RETURN_REQUIRED' || status === 'RETURNED')
    return 'bg-red-50 text-red-700 ring-red-200';
  if (status === 'CANCELLED') return 'bg-slate-100 text-slate-500 ring-slate-200';
  return 'bg-slate-100 text-slate-600 ring-slate-200';
}

function statusLabel(status: ConsoleStopStatus) {
  return status.replace('_', ' ').toLowerCase().replace(/^\w/, (letter) => letter.toUpperCase());
}

// ---------------------------------------------------------------------------
// Small presentational pieces
// ---------------------------------------------------------------------------

function StatusChip({ status }: { status: ConsoleStopStatus }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusTone(status)}`}>
      {status === 'DELIVERED' ? <Check className="h-3 w-3" /> : null}
      {statusLabel(status)}
    </span>
  );
}

function ToolButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`grid h-10 w-10 place-items-center rounded-xl border shadow-sm backdrop-blur transition ${
        active
          ? 'border-teal-600 bg-teal-600 text-white'
          : 'border-slate-200 bg-white/95 text-slate-700 hover:border-teal-300 hover:text-teal-700'
      }`}
    >
      {children}
    </button>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
  tone = 'pine',
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'pine' | 'amber' | 'coral';
}) {
  const tones = {
    pine: 'bg-teal-700 hover:bg-teal-800',
    amber: 'bg-amber-600 hover:bg-amber-700',
    coral: 'bg-[#ec6b4d] hover:bg-[#d9583a]',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl px-5 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50 ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-xs font-semibold text-slate-500">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
        {footer ? <div className="mt-5">{footer}</div> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add-on dialog (rider-initiated extra milk: today vs coming days)
// ---------------------------------------------------------------------------

function AddOnDialog({
  stop,
  working,
  onClose,
  onSubmit,
}: {
  stop: RunStop;
  working: boolean;
  onClose: () => void;
  onSubmit: (payload: RiderAddOnPayload) => void;
}) {
  const [mode, setMode] = React.useState<'today' | 'coming'>('today');
  const [preset, setPreset] = React.useState(1);
  const [days, setDays] = React.useState(2);
  const [slot, setSlot] = React.useState<'AM' | 'PM'>('PM');
  const [note, setNote] = React.useState('');

  const chosen = EXTRA_PRESETS[preset];
  const consecutiveDays = mode === 'today' ? 1 : days;
  const marker =
    mode === 'today'
      ? `[EXTRA: ${chosen.qty}|${chosen.priceRupees * 100}]`
      : `[ADD-ON: ${chosen.qty}|${chosen.priceRupees * 100}|${slot}]`;

  return (
    <Modal
      title="Add milk for this customer"
      subtitle={`${stopName(stop)} · stop ${stop.sequenceNumber}`}
      onClose={onClose}
      footer={
        <PrimaryButton
          tone="amber"
          disabled={working}
          onClick={() =>
            onSubmit({
              extraQuantity: chosen.qty,
              extraPaise: chosen.priceRupees * 100,
              consecutiveDays,
              ...(mode === 'coming' ? { targetSlot: slot } : {}),
              ...(note.trim() ? { note: note.trim() } : {}),
            })
          }
        >
          {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {mode === 'today' ? `Add ${chosen.qty} today` : `Add ${chosen.qty} for ${days} days`}
        </PrimaryButton>
      }
    >
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => setMode('today')}
          className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${mode === 'today' ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-500'}`}
        >
          Today only
        </button>
        <button
          type="button"
          onClick={() => setMode('coming')}
          className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${mode === 'coming' ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-500'}`}
        >
          Coming days
        </button>
      </div>

      <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Quantity</p>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {EXTRA_PRESETS.map((option, index) => (
          <button
            key={option.qty}
            type="button"
            onClick={() => setPreset(index)}
            className={`rounded-xl border px-2 py-3 text-center text-sm font-semibold transition ${
              preset === index ? 'border-amber-500 bg-amber-50 text-amber-800' : 'border-slate-200 bg-white text-slate-700'
            }`}
          >
            <span className="block">{option.label}</span>
            <span className="mt-0.5 block text-[11px] text-slate-400">₹{option.priceRupees}</span>
          </button>
        ))}
      </div>

      {mode === 'coming' ? (
        <>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">For how many days</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {SCHEDULE_DAYS.filter((option) => option.days > 1).map((option) => (
              <button
                key={option.days}
                type="button"
                onClick={() => setDays(option.days)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  days === option.days ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Add-on slot</p>
          <div className="mt-2 flex gap-2">
            {(['AM', 'PM'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setSlot(option)}
                className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
                  slot === option ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                {option === 'AM' ? 'Morning (AM)' : 'Evening (PM)'}
              </button>
            ))}
          </div>
        </>
      ) : null}

      <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Note (optional)</p>
      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="e.g. customer asked at the door"
        className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-teal-500"
      />

      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Payload the grid will read</p>
        <p className="mt-1 font-mono text-xs font-semibold text-slate-800">{marker}</p>
        <p className="mt-1 text-[11px] text-slate-500">
          {mode === 'today'
            ? 'Adds the litres to today’s stop and ledger.'
            : `Adds the litres today and to the next ${days - 1} eligible deliveries on this slot.`}
        </p>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main console
// ---------------------------------------------------------------------------

export default function RiderRunConsole() {
  const toast = useToast();

  const [runs, setRuns] = useState<Run[]>([]);
  const [activeRun, setActiveRun] = useState<Run | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState('');
  const [filter, setFilter] = useState<FilterKey>('ALL');
  const [showAllLabels, setShowAllLabels] = useState(false);
  const [showRoute, setShowRoute] = useState(true);
  const [follow, setFollow] = useState(true);
  const [centerSignal, setCenterSignal] = useState(0);
  const [fitSignal, setFitSignal] = useState(0);
  const [riderPosition, setRiderPosition] = useState<{ latitude: number; longitude: number } | null>(null);
  const [sheetPct, setSheetPct] = useState(52);
  const dragRef = useRef<{ startY: number; startPct: number } | null>(null);

  // Completion state (per selected stop)
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [evidenceStorageKey, setEvidenceStorageKey] = useState<string | null>(null);
  const [evidencePreview, setEvidencePreview] = useState<string | null>(null);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [dropToken, setDropToken] = useState('');
  const [proofReference, setProofReference] = useState('');
  const [collectedCash, setCollectedCash] = useState('');
  const [note, setNote] = useState('');

  // Modals
  const [addOnStop, setAddOnStop] = useState<RunStop | null>(null);
  const [failStop, setFailStop] = useState<RunStop | null>(null);
  const [failureReason, setFailureReason] = useState<FailureReason>('CUSTOMER_UNREACHABLE');
  const [failureNote, setFailureNote] = useState('');
  const [retryRequested, setRetryRequested] = useState(true);
  const [paymentStop, setPaymentStop] = useState<RunStop | null>(null);
  const [paymentRupees, setPaymentRupees] = useState('');
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'PHONE_PE'>('CASH');
  const [pickupCrateCode, setPickupCrateCode] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  const addOnSubmitLock = useRef(false);
  const paymentSubmitLock = useRef(false);
  const addOnKeyRef = useRef<string | null>(null);
  const paymentKeyRef = useRef<string | null>(null);

  // ------------------------------------------------------------------ load
  const load = useCallback(
    async (preferredRunId?: string) => {
      setLoading(true);
      try {
        const response = await apiClient.get('/rider/delivery-runs/today');
        const rows: Run[] = Array.isArray(response.data) ? response.data : [];
        setRuns(rows);
        if (!rows.length) {
          setActiveRun(null);
          return;
        }
        const currentId =
          (preferredRunId && rows.some((run) => run.id === preferredRunId) ? preferredRunId : null) ||
          (activeRun && rows.some((run) => run.id === activeRun.id) ? activeRun.id : null) ||
          rows.find((run) => ['PICKED_UP', 'IN_PROGRESS', 'READY_FOR_PICKUP', 'AWAITING_SETTLEMENT'].includes(run.status))?.id ||
          rows[0].id;
        const detail = await apiClient.get(`/rider/delivery-runs/${encodeURIComponent(currentId)}`);
        setActiveRun(detail.data);
        setSelectedStopId((current) =>
          activeRun?.id === detail.data.id && current && detail.data.stops?.some((stop: RunStop) => stop.id === current)
            ? current
            : firstActionableId(detail.data),
        );
      } catch (error) {
        toast.error(getToastErrorMessage(error, 'Delivery runs could not be loaded.'));
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeRun?.id, toast],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // Rider position (route-board gives the live rider lat/lng when available).
    apiClient
      .get('/rider/delivery-runs/route-board')
      .then((response) => {
        const rider = response.data?.rider;
        if (rider && typeof rider.latitude === 'number' && typeof rider.longitude === 'number') {
          setRiderPosition({ latitude: rider.latitude, longitude: rider.longitude });
        }
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(async () => {
    if (!activeRun) return load();
    const response = await apiClient.get(`/rider/delivery-runs/${encodeURIComponent(activeRun.id)}`);
    setActiveRun(response.data);
    setRuns((current) =>
      current.map((run) => (run.id === response.data.id ? { ...run, ...response.data, stops: undefined } : run)),
    );
  }, [activeRun, load]);

  const act = async (key: string, request: () => Promise<unknown>, success: string) => {
    setWorking(key);
    try {
      await request();
      toast.success(success);
      await refresh();
    } catch (error) {
      toast.error(getToastErrorMessage(error, 'The route action failed.'));
    } finally {
      setWorking('');
    }
  };

  const stops = useMemo(() => activeRun?.stops || [], [activeRun?.stops]);
  const zone = activeRun?.deliveryZone;

  const actionable = useMemo(
    () => stops.filter((stop) => !TERMINAL.includes(stop.status)).sort((a, b) => a.sequenceNumber - b.sequenceNumber),
    [stops],
  );
  const activeStop = useMemo(
    () => stops.find((stop) => stop.id === selectedStopId) ?? actionable[0] ?? null,
    [stops, selectedStopId, actionable],
  );

  const consoleStops: ConsoleStop[] = useMemo(() => {
    const result: ConsoleStop[] = [];
    for (const stop of stops) {
      const point = stopCoordinates(stop, zone);
      if (!point) continue;
      result.push({
        id: stop.id,
        sequenceNumber: stop.sequenceNumber,
        status: stop.status,
        latitude: point.latitude,
        longitude: point.longitude,
        approximate: point.approximate,
        customerName: stopName(stop),
        litres: stopLitres(stop),
        cashDuePaise: stop.cashDuePaise,
        parcelCount: stop.expectedParcelCount,
      });
    }
    return result;
  }, [stops, zone]);

  const counts = useMemo(() => {
    return {
      ALL: consoleStops.length,
      UNDELIVERED: consoleStops.filter((s) => stopMatchesFilter(s.status, s.cashDuePaise, 'UNDELIVERED')).length,
      DELIVERED: consoleStops.filter((s) => stopMatchesFilter(s.status, s.cashDuePaise, 'DELIVERED')).length,
      FAILED: consoleStops.filter((s) => stopMatchesFilter(s.status, s.cashDuePaise, 'FAILED')).length,
      COD: consoleStops.filter((s) => stopMatchesFilter(s.status, s.cashDuePaise, 'COD')).length,
    } as Record<FilterKey, number>;
  }, [consoleStops]);

  const stats = useMemo(() => {
    const done = stops.filter((stop) => stop.status === 'DELIVERED').length;
    const litres = stops.reduce((sum, stop) => sum + (stopLitres(stop) || 0), 0);
    const cod = stops.reduce((sum, stop) => sum + Number(stop.cashDuePaise || 0), 0);
    return {
      done,
      total: activeRun?.totalStopCount || stops.length,
      litres: Math.round(litres * 100) / 100,
      cod,
    };
  }, [stops, activeRun?.totalStopCount]);

  // Keep the active stop's rail card in view.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail || !activeStop) return;
    const card = rail.querySelector(`[data-stop-card="${activeStop.id}"]`);
    card?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [activeStop]);

  // Reset per-stop completion inputs when the selection changes.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setEvidenceStorageKey(null);
    setEvidencePreview(null);
    setOtpCode('');
    setDropToken('');
    setProofReference('');
    setCollectedCash('');
    setNote('');
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [selectedStopId]);

  // ------------------------------------------------------------------ actions
  const arrive = (stop: RunStop) =>
    act(
      `arrive-${stop.id}`,
      async () => {
        const gps = await coordinates();
        await apiClient.post(
          `/rider/delivery-runs/${activeRun?.id}/stops/${stop.id}/arrive`,
          { ...gps, version: stop.version },
          { headers: { 'Idempotency-Key': `web-console-arrive:${stop.id}:v${stop.version}` } },
        );
      },
      'Arrival and GPS recorded.',
    );

  const issueOtp = (stop: RunStop) =>
    act(
      `otp-${stop.id}`,
      () =>
        apiClient.post(
          `/rider/delivery-runs/${activeRun?.id}/stops/${stop.id}/otp`,
          {},
          { headers: { 'Idempotency-Key': `web-console-otp:${stop.id}:v${stop.version}` } },
        ),
      'OTP sent to the handover contact.',
    );

  const complete = (stop: RunStop) =>
    act(
      `complete-${stop.id}`,
      async () => {
        const isPhotoGps = stop.proofMode === 'RIDER_PHOTO_GPS';
        const trusted = stop.subscriptionDelivery.subscription.deliveryMethod === 'TRUSTED_DROP' && stop.cashDuePaise === 0;
        if (isPhotoGps && !evidenceStorageKey)
          throw new Error('Capture or upload delivery photo proof before completing.');
        if (!isPhotoGps && trusted && (!dropToken.trim() || !proofReference.trim()))
          throw new Error('Secure drop token and proof reference are required.');
        if (!isPhotoGps && !trusted && !/^\d{6}$/.test(otpCode)) throw new Error('Enter the six-digit handover OTP.');

        const gps = await coordinates();
        const cashAmt = (() => {
          if (!collectedCash.trim()) return stop.cashDuePaise > 0 ? stop.cashDuePaise : undefined;
          const rupees = parseFloat(collectedCash);
          if (!Number.isFinite(rupees) || rupees < 0) throw new Error('Enter a valid cash amount in rupees.');
          return Math.round(rupees * 100);
        })();

        await apiClient.post(
          `/rider/delivery-runs/${activeRun?.id}/stops/${stop.id}/complete`,
          {
            ...gps,
            version: stop.version,
            riderConfirmed: true,
            evidenceId: isPhotoGps ? evidenceStorageKey : undefined,
            otpCode: !isPhotoGps && !trusted ? otpCode : undefined,
            trustedDropToken: !isPhotoGps && trusted ? dropToken.trim() : undefined,
            proofReference: !isPhotoGps && trusted ? proofReference.trim() : undefined,
            cashCollectedPaise: cashAmt,
            note: note.trim() || undefined,
          },
          { headers: { 'Idempotency-Key': `web-console-complete:${stop.id}:v${stop.version}` } },
        );
      },
      'Delivery proof recorded and stop completed.',
    );

  const submitAddOn = (stop: RunStop, payload: RiderAddOnPayload) => {
    if (addOnSubmitLock.current) return;
    addOnSubmitLock.current = true;
    const key = addOnKeyRef.current ?? `web-console-addon:${stop.id}:${Date.now()}`;
    addOnKeyRef.current = key;
    return act(
      `addon-${stop.id}`,
      async () => {
        await apiClient.post(
          `/rider/delivery-runs/${activeRun?.id}/stops/${stop.id}/extra-milk`,
          payload,
          { headers: { 'Idempotency-Key': key } },
        );
        setAddOnStop(null);
      },
      'Extra milk added.',
    ).finally(() => {
      addOnSubmitLock.current = false;
    });
  };

  const submitFailure = (stop: RunStop) =>
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
          { headers: { 'Idempotency-Key': `web-console-fail:${stop.id}:v${stop.version}` } },
        );
        setFailStop(null);
        setFailureNote('');
      },
      retryRequested ? 'Retry requirement recorded.' : 'Delivery failure recorded.',
    );

  const recordPayment = (stop: RunStop) => {
    if (paymentSubmitLock.current) return;
    paymentSubmitLock.current = true;
    const key = paymentKeyRef.current ?? `web-console-pay:${stop.id}:${Date.now()}`;
    paymentKeyRef.current = key;
    return act(
      `pay-${stop.id}`,
      async () => {
        const amount = parseFloat(paymentRupees);
        if (Number.isNaN(amount) || amount <= 0) throw new Error('Enter a valid payment amount in rupees.');
        await apiClient.post(
          `/rider/delivery-runs/${activeRun?.id}/stops/${stop.id}/record-payment`,
          { amountPaise: Math.round(amount * 100), paymentMode },
          { headers: { 'Idempotency-Key': key } },
        );
        setPaymentStop(null);
        setPaymentRupees('');
      },
      'Payment recorded.',
    ).finally(() => {
      paymentSubmitLock.current = false;
    });
  };

  const openAddOn = (stop: RunStop) => {
    addOnKeyRef.current = null;
    addOnSubmitLock.current = false;
    openAddOn(stop);
  };
  const closeAddOn = () => {
    addOnKeyRef.current = null;
    setAddOnStop(null);
  };
  const openPayment = (stop: RunStop) => {
    paymentKeyRef.current = null;
    paymentSubmitLock.current = false;
    setPaymentStop(stop);
  };
  const closePayment = () => {
    paymentKeyRef.current = null;
    setPaymentStop(null);
  };

  const confirmPickupReceipt = () =>
    act(
      'pickup-receipt',
      async () => {
        if (!activeRun) throw new Error('Choose a delivery run.');
        const expectedBagCount = Number(activeRun.expectedBagCount || activeRun.totalStopCount || stops.length || 0);
        await apiClient.post(
          `/rider/delivery-runs/${activeRun.id}/pickup`,
          {
            version: activeRun.version,
            expectedBagCount,
            crateCode: activeRun.crateCode ? pickupCrateCode.trim() : undefined,
          },
          { headers: { 'Idempotency-Key': `web-console-pickup:${activeRun.id}:v${activeRun.version}` } },
        );
        setPickupCrateCode('');
      },
      'Route bag receipt recorded.',
    );

  const startRun = () =>
    act(
      'start',
      () =>
        apiClient.post(
          `/rider/delivery-runs/${activeRun?.id}/start`,
          { version: activeRun?.version },
          { headers: { 'Idempotency-Key': `web-console-start:${activeRun?.id}:v${activeRun?.version}` } },
        ),
      'Run started. Complete every stop individually.',
    );

  const onPickPhoto = async (file: File) => {
    setUploadingEvidence(true);
    try {
      setEvidencePreview(URL.createObjectURL(file));
      const form = new FormData();
      form.append('file', file);
      const response = await apiClient.post('/upload/evidence', form);
      setEvidenceStorageKey(response.data.storageKey);
      toast.success('Photo proof uploaded.');
    } catch (error) {
      toast.error(getToastErrorMessage(error, 'Photo upload failed.'));
    } finally {
      setUploadingEvidence(false);
    }
  };

  // ------------------------------------------------------------- derived nav
  const navigationPoints = useMemo(
    () =>
      actionable
        .map((stop) => stopCoordinates(stop, zone))
        .filter((point): point is { latitude: number; longitude: number; approximate: boolean } => Boolean(point)),
    [actionable, zone],
  );
  const activePoint = activeStop ? stopCoordinates(activeStop, zone) : null;
  const navRouteUrl = useMemo(() => {
    if (riderPosition && navigationPoints.length) return googleMapsRouteUrl([riderPosition, ...navigationPoints]);
    return googleMapsRouteUrl(navigationPoints);
  }, [riderPosition, navigationPoints]);
  const activeDistance = useMemo(() => {
    if (!activePoint) return null;
    const from = riderPosition || (activeRun?.store.latitude && activeRun?.store.longitude
      ? { latitude: activeRun.store.latitude, longitude: activeRun.store.longitude }
      : null);
    return from ? distanceKm(from, activePoint) : null;
  }, [activePoint, riderPosition, activeRun]);

  // ------------------------------------------------------------ sheet drag
  const onSheetPointerDown = (event: React.PointerEvent) => {
    dragRef.current = { startY: event.clientY, startPct: sheetPct };
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  };
  const onSheetPointerMove = (event: React.PointerEvent) => {
    if (!dragRef.current) return;
    const deltaPct = ((dragRef.current.startY - event.clientY) / window.innerHeight) * 100;
    setSheetPct(Math.max(28, Math.min(88, dragRef.current.startPct + deltaPct)));
  };
  const onSheetPointerUp = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setSheetPct((current) => (current < 40 ? 28 : current < 70 ? 52 : 88));
  };

  // ------------------------------------------------------------------ render
  const statusBanner = (() => {
    if (!activeRun) return null;
    if (activeRun.status === 'READY_FOR_PICKUP' && !activeRun.storeHandoffConfirmedAt)
      return { tone: 'amber', text: 'Waiting for the store to confirm the physical route handoff.' };
    if (activeRun.status === 'READY_FOR_PICKUP' && activeRun.storeHandoffConfirmedAt)
      return { tone: 'pine', text: 'Count the bags and confirm your independent route receipt.' };
    return null;
  })();

  const heroAction = (() => {
    if (!activeRun) return null;
    if (activeRun.status === 'PICKED_UP')
      return <PrimaryButton onClick={startRun} disabled={working === 'start'}>
        {working === 'start' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
        Start delivery run
      </PrimaryButton>;
    if (activeRun.status === 'READY_FOR_PICKUP' && activeRun.storeHandoffConfirmedAt)
      return (
        <div className="space-y-2">
          {activeRun.crateCode ? (
            <input
              value={pickupCrateCode}
              onChange={(event) => setPickupCrateCode(event.target.value)}
              placeholder="Enter or scan route crate code"
              className="h-11 w-full rounded-xl border border-slate-200 px-3 font-semibold uppercase outline-none focus:border-teal-500"
            />
          ) : null}
          <PrimaryButton onClick={confirmPickupReceipt} disabled={working === 'pickup-receipt' || Boolean(activeRun.crateCode && !pickupCrateCode.trim())}>
            <Package className="h-4 w-4" />
            Confirm {activeRun.expectedBagCount || activeRun.totalStopCount} bags received
          </PrimaryButton>
        </div>
      );
    if (!activeStop) return <p className="rounded-xl bg-teal-50 p-3 text-sm font-semibold text-teal-800">All stops done. Head back to the store.</p>;
    if (activeStop.status === 'DELIVERED' || activeStop.status === 'FAILED' || activeStop.status === 'CANCELLED')
      return <p className="rounded-xl bg-slate-100 p-3 text-sm font-semibold text-slate-600">This stop is closed. Pick the next stop on the rail.</p>;
    if (activeStop.status === 'ARRIVED')
      return (
        <PrimaryButton tone="coral" onClick={() => complete(activeStop)} disabled={working === `complete-${activeStop.id}`}>
          {working === `complete-${activeStop.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {activeStop.cashDuePaise > 0 ? `Collect ${money(activeStop.cashDuePaise)} & complete` : 'Verify & complete stop'}
        </PrimaryButton>
      );
    return (
      <PrimaryButton onClick={() => arrive(activeStop)} disabled={working === `arrive-${activeStop.id}`}>
        {working === `arrive-${activeStop.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
        I have arrived
      </PrimaryButton>
    );
  })();

  const completionForm = (() => {
    if (!activeStop || activeStop.status !== 'ARRIVED') return null;
    const isPhotoGps = activeStop.proofMode === 'RIDER_PHOTO_GPS';
    const trusted = activeStop.subscriptionDelivery.subscription.deliveryMethod === 'TRUSTED_DROP' && activeStop.cashDuePaise === 0;
    return (
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Completion proof</p>
        {isPhotoGps ? (
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void onPickPhoto(file);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full items-center gap-3 rounded-xl border border-dashed border-slate-300 p-3 text-left hover:border-teal-400"
            >
              {evidencePreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={evidencePreview} alt="proof" className="h-14 w-14 rounded-lg object-cover" />
              ) : (
                <span className="grid h-14 w-14 place-items-center rounded-lg bg-slate-100 text-slate-400">
                  {uploadingEvidence ? <Loader2 className="h-5 w-5 animate-spin" /> : <Package className="h-5 w-5" />}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-800">
                  {evidenceStorageKey ? 'Photo proof attached' : 'Capture / upload delivery photo'}
                </span>
                <span className="block text-xs text-slate-500">GPS is recorded automatically on verify.</span>
              </span>
            </button>
            {activeStop.cashDuePaise > 0 ? (
              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Cash collected (₹)</p>
                <input
                  value={collectedCash}
                  onChange={(event) => setCollectedCash(event.target.value)}
                  inputMode="decimal"
                  placeholder={String(activeStop.cashDuePaise / 100)}
                  className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-teal-500"
                />
                <p className="mt-1 text-[11px] text-slate-500">Due {money(activeStop.cashDuePaise)} — enter less for a partial payment.</p>
              </div>
            ) : null}
          </div>
        ) : trusted ? (
          <div className="space-y-2">
            <input
              value={dropToken}
              onChange={(event) => setDropToken(event.target.value)}
              placeholder="Secure drop token"
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-teal-500"
            />
            <input
              value={proofReference}
              onChange={(event) => setProofReference(event.target.value)}
              placeholder="Proof reference"
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-teal-500"
            />
          </div>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => issueOtp(activeStop)}
              disabled={working === `otp-${activeStop.id}`}
              className="text-xs font-semibold text-teal-700 underline disabled:opacity-50"
            >
              {working === `otp-${activeStop.id}` ? 'Sending OTP…' : 'Send handover OTP to the customer'}
            </button>
            <input
              value={otpCode}
              onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              placeholder="6-digit handover OTP"
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-center text-lg font-bold tracking-[0.4em] outline-none focus:border-teal-500"
            />
          </div>
        )}
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Note (optional)"
          className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-teal-500"
        />
        {activeStop.status === 'ARRIVED' ? (
          <PrimaryButton tone="coral" onClick={() => complete(activeStop)} disabled={working === `complete-${activeStop.id}`}>
            {working === `complete-${activeStop.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Verify and complete
          </PrimaryButton>
        ) : null}
        <button
          type="button"
          onClick={() => setFailStop(activeStop)}
          className="inline-flex w-full items-center justify-center gap-2 text-xs font-semibold text-red-600"
        >
          <TriangleAlert className="h-3.5 w-3.5" /> Report a delivery problem
        </button>
      </div>
    );
  })();

  const routePanel = (
    <div className="flex h-full flex-col">
      {/* Sheet grabber (mobile only) */}
      <div
        className="flex cursor-grab touch-none items-center justify-center py-2 lg:hidden"
        onPointerDown={onSheetPointerDown}
        onPointerMove={onSheetPointerMove}
        onPointerUp={onSheetPointerUp}
      >
        <span className="h-1.5 w-12 rounded-full bg-slate-300" />
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4 lg:px-4">
        {/* Active stop hero */}
        {activeStop ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-700 text-sm font-bold text-white">
                {activeStop.sequenceNumber}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-semibold text-slate-950">{stopName(activeStop)}</p>
                  <StatusChip status={activeStop.status} />
                </div>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {snapshotText(activeStop.subscriptionDelivery.subscription.addressSnapshot)}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-500">
                  {stopLitres(activeStop) != null ? <span>{stopLitres(activeStop)} L</span> : null}
                  {activeStop.cashDuePaise > 0 ? <span className="text-amber-700">COD {money(activeStop.cashDuePaise)}</span> : <span className="text-teal-700">Funded</span>}
                  {activeDistance != null ? <span>{activeDistance.toFixed(1)} km{activePoint?.approximate ? ' (approx)' : ''}</span> : null}
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-2">
                {activePoint ? (
                  <a
                    href={googleMapsUrl(activePoint.latitude, activePoint.longitude)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Navigate to stop"
                    className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-teal-700 hover:bg-teal-50"
                  >
                    <Navigation className="h-4 w-4" />
                  </a>
                ) : null}
                {stopPhone(activeStop) ? (
                  <a
                    href={`tel:${stopPhone(activeStop)}`}
                    aria-label="Call customer"
                    className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                  >
                    <Phone className="h-4 w-4" />
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={() => openAddOn(activeStop)}
                  aria-label="Add milk for this customer"
                  className="grid h-9 w-9 place-items-center rounded-lg border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="mt-3">{heroAction}</div>
            {completionForm}
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-500">
            No active stop. {stats.done}/{stats.total} stops complete.
          </div>
        )}

        {/* Sequence rail */}
        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Delivery sequence</p>
          <span className="text-xs font-semibold text-slate-400">{stats.done}/{stats.total} done</span>
        </div>
        <div
          ref={railRef}
          className="mt-2 flex snap-x snap-mandatory gap-2 overflow-x-auto pb-2 pt-1 [scrollbar-width:thin]"
          style={{ scrollbarGutter: 'stable' }}
        >
          {stops
            .slice()
            .sort((a, b) => a.sequenceNumber - b.sequenceNumber)
            .map((stop) => {
              const litres = stopLitres(stop);
              const dimmed = !stopMatchesFilter(stop.status, stop.cashDuePaise, filter);
              const isActive = activeStop?.id === stop.id;
              return (
                <button
                  key={stop.id}
                  data-stop-card={stop.id}
                  onClick={() => setSelectedStopId(stop.id)}
                  className={`w-[168px] shrink-0 snap-start rounded-2xl border bg-white p-3 text-left shadow-sm transition ${
                    isActive ? 'border-[#ec6b4d] ring-2 ring-[#ec6b4d]/30' : 'border-slate-200 hover:border-teal-300'
                  } ${dimmed ? 'opacity-40' : ''}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold text-white ${isActive ? 'bg-[#ec6b4d]' : stop.status === 'DELIVERED' ? 'bg-teal-700' : 'bg-slate-500'}`}>
                      {stop.status === 'DELIVERED' ? <Check className="h-3.5 w-3.5" /> : stop.sequenceNumber}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{stopName(stop)}</span>
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`Add milk for ${stopName(stop)}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        openAddOn(stop);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.stopPropagation();
                          openAddOn(stop);
                        }
                      }}
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] font-semibold text-slate-500">
                    <span>{litres != null ? `${litres} L` : `${stop.expectedParcelCount} item`}</span>
                    {stop.cashDuePaise > 0 ? <span className="text-amber-700">{money(stop.cashDuePaise)}</span> : <span className="text-teal-700">Funded</span>}
                  </div>
                  <div className="mt-1.5 flex items-center justify-between">
                    <StatusChip status={stop.status} />
                    <span className="text-[11px] font-semibold text-slate-400">#{stop.sequenceNumber}</span>
                  </div>
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Full-viewport map layer */}
      <div className="fixed inset-0 z-0">
        <RiderRunConsoleMap
          stores={activeRun ? [{ name: activeRun.store.name, latitude: activeRun.store.latitude ?? null, longitude: activeRun.store.longitude ?? null }] : []}
          stops={consoleStops}
          activeStopId={activeStop?.id ?? null}
          showAllLabels={showAllLabels}
          filter={filter}
          showRoute={showRoute}
          followRider={follow}
          centerSignal={centerSignal}
          fitSignal={fitSignal}
          riderPosition={riderPosition}
          onSelectStop={(id) => setSelectedStopId(id)}
        />
      </div>

      {/* Floating top-left chrome */}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex flex-col gap-2 sm:max-w-[440px]">
        <div className="pointer-events-auto flex items-center gap-2">
          <Link
            href="/rider"
            aria-label="Back to rider home"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white/95 text-slate-700 shadow-sm backdrop-blur hover:text-teal-700"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
            <p className="truncate text-xs font-semibold uppercase tracking-wider text-teal-700">
              {activeRun?.deliveryZone?.name || activeRun?.routeCode || 'No run assigned'}
            </p>
            <p className="truncate text-[11px] font-semibold text-slate-500">
              {activeRun
                ? `${new Date(activeRun.slotStart).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}–${new Date(activeRun.slotEnd).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })} · ${activeRun.store.name}`
                : 'Map view'}
            </p>
          </div>
          <div className="shrink-0 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-center shadow-sm backdrop-blur">
            <p className="text-[11px] font-bold text-slate-900">{stats.done}/{stats.total}</p>
            <p className="text-[10px] font-semibold text-slate-500">{stats.litres} L · {money(stats.cod)}</p>
          </div>
        </div>

        <div className="pointer-events-auto -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {(['ALL', 'UNDELIVERED', 'DELIVERED', 'FAILED', 'COD'] as FilterKey[]).map((key) => {
            const labels: Record<FilterKey, string> = {
              ALL: 'All',
              UNDELIVERED: 'Undelivered',
              DELIVERED: 'Delivered',
              FAILED: 'Failed',
              COD: 'COD due',
            };
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold shadow-sm transition ${
                  filter === key ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-200 bg-white/95 text-slate-600 backdrop-blur'
                }`}
              >
                {labels[key]} · {counts[key]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Floating tools (left edge, vertically centered) */}
      <div className="absolute left-3 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-2">
        <ToolButton label="Labels" active={showAllLabels} onClick={() => setShowAllLabels((value) => !value)}>
          <Layers className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Route line" active={showRoute} onClick={() => setShowRoute((value) => !value)}>
          <RouteIcon className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Follow active stop" active={follow} onClick={() => setFollow((value) => !value)}>
          <Crosshair className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Fit whole route" onClick={() => setFitSignal((value) => value + 1)}>
          <Maximize2 className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Recenter" onClick={() => setCenterSignal((value) => value + 1)}>
          <MapPin className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="More" active={moreOpen} onClick={() => setMoreOpen((value) => !value)}>
          <MoreHorizontal className="h-4 w-4" />
        </ToolButton>
      </div>

      {moreOpen ? (
        <div className="absolute left-3 top-1/2 z-30 mt-24 w-52 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
          {navRouteUrl ? (
            <a href={navRouteUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Navigation className="h-4 w-4 text-teal-700" /> Navigate remaining stops
            </a>
          ) : null}
          {activeStop && stopPhone(activeStop) ? (
            <a href={`tel:${stopPhone(activeStop)}`} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Phone className="h-4 w-4 text-teal-700" /> Call {stopName(activeStop)}
            </a>
          ) : null}
          {activeStop ? (
            <button type="button" onClick={() => { openPayment(activeStop); setMoreOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Banknote className="h-4 w-4 text-amber-700" /> Record payment
            </button>
          ) : null}
          {activeStop ? (
            <button type="button" onClick={() => { setFailStop(activeStop); setMoreOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-red-600 hover:bg-red-50">
              <Flag className="h-4 w-4" /> Report a problem
            </button>
          ) : null}
          <button type="button" onClick={() => { setMoreOpen(false); void load(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <RefreshCw className="h-4 w-4" /> Refresh run
          </button>
        </div>
      ) : null}

      {/* Run switcher chip (when multiple runs today) */}
      {runs.length > 1 ? (
        <div className="absolute bottom-3 left-3 z-20 flex gap-1.5 lg:bottom-auto lg:top-24 lg:left-3 lg:flex-col">
          {runs.map((run) => (
            <button
              key={run.id}
              type="button"
              onClick={() => void load(run.id)}
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold shadow-sm ${
                activeRun?.id === run.id ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-200 bg-white/95 text-slate-600'
              }`}
            >
              {run.routeCode.split('-').slice(-1)[0]}
            </button>
          ))}
        </div>
      ) : null}

      {/* Status banner */}
      {statusBanner ? (
        <div className={`absolute inset-x-3 top-24 z-20 rounded-xl px-4 py-2 text-sm font-semibold shadow-sm sm:max-w-[440px] ${
          statusBanner.tone === 'amber' ? 'bg-amber-100 text-amber-900' : 'bg-teal-100 text-teal-900'
        }`}>
          {statusBanner.text}
        </div>
      ) : null}

      {/* Loading / empty overlays */}
      {loading && !activeRun ? (
        <div className="absolute inset-0 z-30 grid place-items-center bg-[#f6f3ec]/80">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your route…
          </div>
        </div>
      ) : null}
      {!loading && !activeRun ? (
        <div className="absolute inset-0 z-30 grid place-items-center bg-[#f6f3ec]/80 p-6">
          <div className="max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <RouteIcon className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 font-semibold text-slate-800">No delivery runs today</p>
            <p className="mt-1 text-sm text-slate-500">When the store assigns you a route it appears here on the map.</p>
            <button type="button" onClick={() => void load()} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white">
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
          </div>
        </div>
      ) : null}

      {/* Bottom sheet — mobile */}
      {activeRun ? (
        <div
          className="fixed inset-x-0 bottom-0 z-30 rounded-t-3xl border-t border-slate-200 bg-[#f6f3ec]/98 shadow-[0_-8px_30px_rgba(15,23,42,.18)] backdrop-blur lg:hidden"
          style={{ height: `${sheetPct}vh` }}
        >
          {routePanel}
        </div>
      ) : null}

      {/* Docked panel — desktop */}
      {activeRun ? (
        <div className="absolute inset-y-0 right-0 z-30 hidden w-[430px] border-l border-slate-200 bg-[#f6f3ec]/98 shadow-[-8px_0_30px_rgba(15,23,42,.12)] backdrop-blur lg:flex">
          {routePanel}
        </div>
      ) : null}

      {/* Modals */}
      {addOnStop ? (
        <AddOnDialog
          stop={addOnStop}
          working={working === `addon-${addOnStop.id}`}
          onClose={closeAddOn}
          onSubmit={(payload) => submitAddOn(addOnStop, payload)}
        />
      ) : null}

      {paymentStop ? (
        <Modal title="Record a payment" subtitle={`${stopName(paymentStop)} · stop ${paymentStop.sequenceNumber}`} onClose={closePayment}
          footer={
            <PrimaryButton onClick={() => recordPayment(paymentStop)} disabled={working === `pay-${paymentStop.id}`}>
              <Banknote className="h-4 w-4" /> Record payment
            </PrimaryButton>
          }
        >
          <input
            value={paymentRupees}
            onChange={(event) => setPaymentRupees(event.target.value)}
            inputMode="decimal"
            placeholder="Amount in ₹"
            className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-teal-500"
          />
          <div className="mt-2 flex gap-2">
            {(['CASH', 'PHONE_PE'] as const).map((mode) => (
              <button key={mode} type="button" onClick={() => setPaymentMode(mode)}
                className={`rounded-full border px-4 py-1.5 text-xs font-semibold ${paymentMode === mode ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-600'}`}>
                {mode === 'CASH' ? 'Cash' : 'PhonePe'}
              </button>
            ))}
          </div>
        </Modal>
      ) : null}

      {failStop ? (
        <Modal title="Report a delivery problem" subtitle={`${stopName(failStop)} · stop ${failStop.sequenceNumber}`} onClose={() => setFailStop(null)}
          footer={
            <PrimaryButton tone="coral" onClick={() => submitFailure(failStop)} disabled={working === `fail-${failStop.id}`}>
              <TriangleAlert className="h-4 w-4" /> Submit failure
            </PrimaryButton>
          }
        >
          <div className="space-y-2">
            {FAILURES.map((option) => (
              <label key={option.value} className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input type="radio" name="failure" checked={failureReason === option.value} onChange={() => setFailureReason(option.value)} />
                {option.label}
              </label>
            ))}
          </div>
          <input
            value={failureNote}
            onChange={(event) => setFailureNote(event.target.value)}
            placeholder="Note (optional)"
            className="mt-3 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-teal-500"
          />
          <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={retryRequested} onChange={(event) => setRetryRequested(event.target.checked)} />
            Request a retry
          </label>
        </Modal>
      ) : null}

      {/* External "open full route" for desktop quick access */}
      {navRouteUrl ? (
        <a
          href={navRouteUrl}
          target="_blank"
          rel="noreferrer"
          className="absolute bottom-24 right-3 z-20 hidden items-center gap-2 rounded-xl border border-teal-200 bg-white/95 px-3 py-2 text-xs font-semibold text-teal-800 shadow-sm backdrop-blur lg:inline-flex"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Open full route
        </a>
      ) : null}

      {/* Desktop refresh */}
      <button
        type="button"
        onClick={() => void load()}
        aria-label="Refresh"
        className="absolute bottom-3 right-3 z-20 grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white/95 text-slate-700 shadow-sm backdrop-blur hover:text-teal-700 lg:right-[446px]"
      >
        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
      </button>
    </>
  );
}
