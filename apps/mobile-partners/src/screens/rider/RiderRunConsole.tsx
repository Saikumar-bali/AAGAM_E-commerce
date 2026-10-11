import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Linking,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock,
  Layers,
  Milk,
  MapPin,
  Navigation,
  Phone,
  RotateCcw,
  Route,
  SkipForward,
  Users,
  X,
  Plus,
} from 'lucide-react-native';
import type { ReactNode } from 'react';
import { RiderRouteMap } from '../../components/rider/RiderRouteMap';
import type { RiderMapStop } from '../../components/rider/riderRouteMapHtml';
import { subscriptionOperationsService } from '../../api/subscriptionOperationsService';
import type { DeliveryFailureReason, DeliveryRunDetails, DeliveryRunStop } from '../../api/subscriptionOperationsService';
import { riderService } from '../../api/riderService';
import { PartnerDocumentPicker } from '../../native/PartnerDocumentPicker';

type Coordinates = { latitude: number; longitude: number };

const ACTIVE_STATUSES = ['READY', 'PLANNED', 'ARRIVED', 'RETRY_PENDING'];
const DONE_STATUSES = ['DELIVERED', 'COMPLETED'];

const CASH_PRESETS_PAISE = [5000, 10000, 20000];

function money(paise: number) {
  return `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function label(value: string) {
  return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function errorMessage(error: unknown) {
  const candidate = error as { response?: { data?: { message?: string | string[] } }; message?: string };
  const message = candidate?.response?.data?.message;
  if (Array.isArray(message)) return message.join(', ');
  return message || candidate?.message || 'The route action could not be completed.';
}

function addressFrom(stop?: DeliveryRunStop | null) {
  const snapshot = stop?.subscriptionDelivery?.subscription?.addressSnapshot || {};
  const parts = [snapshot.line1, snapshot.line2, snapshot.city, snapshot.pincode]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean);
  return parts.join(', ') || 'Address not provided';
}

function stopCoordinates(stop?: DeliveryRunStop | null): Coordinates | null {
  if (!stop) return null;
  if (typeof stop.deliveryLatitude === 'number' && typeof stop.deliveryLongitude === 'number') {
    return { latitude: stop.deliveryLatitude, longitude: stop.deliveryLongitude };
  }
  const snapshot = stop.subscriptionDelivery?.subscription?.addressSnapshot || {};
  if (typeof snapshot.latitude === 'number' && typeof snapshot.longitude === 'number') {
    return { latitude: snapshot.latitude, longitude: snapshot.longitude };
  }
  return null;
}

function customerKey(stop: DeliveryRunStop) {
  return stop.deliveryJob?.order?.customer?.name?.trim().toLowerCase()
    || stop.subscriptionDelivery?.subscription?.customerId
    || stop.id;
}

function planLabel(stop: DeliveryRunStop) {
  return stop.subscriptionDelivery?.subscription?.plan?.name
    || (stop.subscriptionDelivery?.deliverySlot ? `${stop.subscriptionDelivery.deliverySlot} slot` : 'Subscription');
}

function proofQuickLabel(stop: DeliveryRunStop) {
  if (stop.proofMode === 'TRUSTED_DROP') return 'Trusted Drop';
  if (stop.proofMode === 'RIDER_PHOTO_GPS') return 'Photo proof';
  return 'OTP handover';
}

function statusTone(status: string) {
  if (status === 'DELIVERED' || status === 'COMPLETED') return { text: '#065F46', bg: '#D9F6E7' };
  if (status === 'ARRIVED') return { text: '#075E45', bg: '#DFF7EC' };
  if (['FAILED', 'CANCELLED', 'RETURNED'].includes(status)) return { text: '#9A3412', bg: '#FFE4D6' };
  if (status === 'RETRY_PENDING') return { text: '#8A4B00', bg: '#FFF2D9' };
  return { text: '#334155', bg: '#E8EEF2' };
}

// Rupees still owed on this stop today: the day's due minus whatever was already
// collected against it (a partial or full door payment).
function outstandingPaise(stop: DeliveryRunStop) {
  return Math.max(0, Number(stop.cashDuePaise || 0) - Number(stop.subscriptionDelivery?.cashCollectedPaise || 0));
}

function collectedPaise(stop: DeliveryRunStop) {
  return Math.max(0, Number(stop.subscriptionDelivery?.cashCollectedPaise || 0));
}

// The server stamps add-on milk into the delivery's deferredReason marker
// (e.g. "[EXTRA: 1L|2]" when extra was attached). Parse it so the console can
// surface "+NL" without another endpoint.
function extraCountFor(stop: DeliveryRunStop): number {
  const reason = String((stop.subscriptionDelivery as any)?.deferredReason || '');
  const match = reason.match(/\[(EXTRA|ADD-ON):\s*([^\]|]+)(?:\|(\d+))?(?:\|([A-Z]{2}))?\]/);
  if (!match) return 0;
  const qty = match[2] || '';
  const litres = Number((qty.match(/(\d+(?:\.\d+)?)/) || [])[1]);
  const repeat = Number(match[3] || 1);
  const base = Number.isFinite(litres) && litres > 0 ? litres : 1;
  return Math.max(1, Math.round(base * (Number.isFinite(repeat) && repeat > 0 ? repeat : 1)));
}

export type RiderRunConsoleProps = {
  run: DeliveryRunDetails;
  riderLocation: Coordinates | null;
  completed: number;
  total: number;
  onClose: () => void;
  onNavigate: (stop: DeliveryRunStop) => void;
  onStartRun: () => void;
  starting: boolean;
  /** Reads precise GPS with permission; supplied by the run screen. */
  resolveLocation: () => Promise<Coordinates>;
  /** Re-fetches the run after a successful action. */
  onRefresh: () => Promise<void> | void;
  /**
   * The run screen's full board, injected so the console is the single surface:
   * the expanded sheet hosts the ordered stops and the run lifecycle (handoff,
   * settlement) rather than sending the rider back to the page. Optional so the
   * console still renders standalone (preview/tests).
   */
  renderBoard?: (controls: { focusStop: (stopId: string) => void }) => ReactNode;
  /** Header status chips (e.g. offline queue) rendered inline in the header. */
  headerChips?: ReactNode;
  /** Rendered in the peek sheet above the ops when the run cannot start yet. */
  lifecycle?: ReactNode;
};

type CaptureState = {
  stop: DeliveryRunStop;
  mode: 'PHOTO' | 'OTP' | 'TRUSTED_DROP';
  photoId?: string;
  photoName?: string;
  otpCode: string;
  token?: string;
};

const FAILURE_REASONS: Array<{ value: DeliveryFailureReason; label: string }> = [
  { value: 'CUSTOMER_UNREACHABLE', label: 'Customer unreachable' },
  { value: 'CUSTOMER_REFUSED', label: 'Customer refused' },
  { value: 'ADDRESS_NOT_FOUND', label: 'Address not found' },
  { value: 'WRONG_ADDRESS', label: 'Wrong address' },
  { value: 'PAYMENT_NOT_AVAILABLE', label: 'Cash not available' },
  { value: 'SAFETY_CONCERN', label: 'Safety concern' },
  { value: 'OTHER', label: 'Other issue' },
];

/**
 * Full-screen, map-first delivery console for a run. The map owns the whole
 * screen; every route control floats above it as a glass overlay so the rider
 * never leaves the map to work the route.
 *
 * Unlike the compact sheet, the console is self-contained: it records cash
 * (preset + custom), attaches extra milk, toggles the slot, skips, undoes, and
 * captures the delivery proof (photo/OTP) inline — so a rider can work a whole
 * run without opening another screen. Every mutation goes through the same
 * audited rider endpoints the sheet uses, then re-fetches.
 */
export const RiderRunConsole = ({
  run,
  riderLocation,
  completed,
  total,
  onClose,
  onNavigate,
  onStartRun,
  starting,
  resolveLocation,
  onRefresh,
  renderBoard,
  headerChips,
  lifecycle,
}: RiderRunConsoleProps) => {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [focusedStopId, setFocusedStopId] = useState<string | null>(null);
  const railRef = useRef<ScrollView>(null);

  // One draggable sheet: peek shows the stop answering right now, dragging it up
  // reveals the whole route board. Two snap points keep the map the hero while
  // making everything reachable without leaving the console.
  const expandedHeight = Math.round(windowHeight * 0.86);
  const peekHeight = Math.min(430, Math.round(windowHeight * 0.5));
  const peekOffset = expandedHeight - peekHeight;
  const [sheetExpanded, setSheetExpanded] = useState(false);
  // Animated.Value + PanResponder are created once; the latest snap state is
  // mirrored into a ref (updated by effect) so handlers never read stale values.
  const expandedRef = useRef(false);
  useEffect(() => { expandedRef.current = sheetExpanded; }, [sheetExpanded]);
  const [sheetTranslate] = useState(() => new Animated.Value(peekOffset));
  const snapTo = (toExpanded: boolean) => {
    setSheetExpanded(toExpanded);
    Animated.spring(sheetTranslate, {
      toValue: toExpanded ? 0 : peekOffset,
      useNativeDriver: true,
      damping: 22,
      stiffness: 220,
      mass: 0.9,
    }).start();
  };
  const [sheetPan] = useState(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_evt, gesture) => Math.abs(gesture.dy) > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderGrant: () => { sheetTranslate.stopAnimation(); },
    onPanResponderMove: (_evt, gesture) => {
      sheetTranslate.setValue(Math.min(Math.max(0, peekOffset + gesture.dy), peekOffset));
    },
    onPanResponderRelease: (_evt, gesture) => {
      const shouldExpand = gesture.dy < -60 || (gesture.vy < -0.5 && gesture.dy < 40) || expandedRef.current;
      snapTo(shouldExpand ? !(gesture.dy > 80 || gesture.vy > 0.5) : false);
    },
  }));

  // Inline action surface: at most one expander is open at a time so the map
  // stays the hero and the card never grows unbounded.
  const [expander, setExpander] = useState<'none' | 'cash' | 'extra' | 'skip' | 'problem'>('none');
  const toggleExpander = (next: 'cash' | 'extra' | 'skip' | 'problem') => {
    const willOpen = expander !== next;
    setExpander(willOpen ? next : 'none');
    if (willOpen) snapTo(true);
  };
  const [cashPaise, setCashPaise] = useState(0);
  const [cashMode, setCashMode] = useState<'CASH' | 'PHONE_PE'>('CASH');
  const [extraQty, setExtraQty] = useState('+1L');
  const [extraPrice, setExtraPrice] = useState('80');
  const [extraDays, setExtraDays] = useState(1);
  const [extraSlot, setExtraSlot] = useState<'AM' | 'PM'>('PM');
  const [skipReason, setSkipReason] = useState('Customer requested skip');
  const [failureReason, setFailureReason] = useState<DeliveryFailureReason>('CUSTOMER_UNREACHABLE');
  const [failureNote, setFailureNote] = useState('');
  const [retryRequested, setRetryRequested] = useState(true);
  const [capture, setCapture] = useState<CaptureState | null>(null);
  // Per-op busy so the pressed button (not just a global flag) shows progress.
  const [busy, setBusy] = useState<string | null>(null);

  const stops = useMemo(() => run.stops || [], [run.stops]);
  const actionable = useMemo(() => stops.filter((stop) => ACTIVE_STATUSES.includes(stop.status)), [stops]);
  const duplicateKeys = useMemo(() => {
    const counts = new Map<string, number>();
    stops.forEach((stop) => counts.set(customerKey(stop), (counts.get(customerKey(stop)) || 0) + 1));
    return new Set(Array.from(counts.entries()).filter(([, count]) => count > 1).map(([key]) => key));
  }, [stops]);

  // Focus follows the run: an explicit pick wins while it is still on the run,
  // otherwise the sheet tracks the first actionable stop (then the first stop).
  const effectiveFocusId = focusedStopId && stops.some((stop) => stop.id === focusedStopId)
    ? focusedStopId
    : (actionable[0]?.id || stops[0]?.id || null);
  const focusedStop = useMemo(
    () => stops.find((stop) => stop.id === effectiveFocusId) || null,
    [stops, effectiveFocusId],
  );

  const mapStops = useMemo<RiderMapStop[]>(() => stops.flatMap((stop) => {
    const point = stopCoordinates(stop);
    if (!point) return [];
    const done = DONE_STATUSES.includes(stop.status);
    const isFocused = focusedStop?.id === stop.id;
    const multiSub = duplicateKeys.has(customerKey(stop));
    return [{
      id: stop.id,
      latitude: point.latitude,
      longitude: point.longitude,
      sequence: stop.sequenceNumber,
      label: stop.deliveryJob?.order?.customer?.name || 'Customer',
      address: addressFrom(stop),
      plan: planLabel(stop),
      status: stop.status,
      multiSub,
      cashDuePaise: stop.cashDuePaise,
      cashPaidPaise: collectedPaise(stop),
      extraCount: extraCountFor(stop),
      skipped: stop.status === 'CANCELLED',
      slot: stop.subscriptionDelivery?.deliverySlot || '',
      parcelCount: stop.expectedParcelCount || stop.expectedItemCount || 1,
      state: isFocused ? 'current' : done ? 'done' : 'upcoming',
    }];
  }), [stops, focusedStop?.id, duplicateKeys]);

  const mapDestination = focusedStop ? stopCoordinates(focusedStop) : null;
  const remaining = stops.filter((stop) => ACTIVE_STATUSES.includes(stop.status)).length;
  const progress = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  const cashHeld = Math.max(0, Number(run.collectedCashPaise || 0) - Number(run.depositedCashPaise || 0));
  const cashTarget = useMemo(
    () => stops.reduce((sum, stop) => sum + Number(stop.cashDuePaise || 0), 0),
    [stops],
  );
  const focusTone = focusedStop ? statusTone(focusedStop.status) : statusTone('READY');
  // Deliver is only offered once the run is actually underway; before that the
  // rider confirms handoff/pickup in the lifecycle block instead.
  const runStarted = run.status === 'IN_PROGRESS' || run.status === 'AWAITING_SETTLEMENT' || run.status === 'COMPLETED';
  const focusActionable = Boolean(runStarted && focusedStop && ACTIVE_STATUSES.includes(focusedStop.status));
  const focusDelivered = Boolean(focusedStop && DONE_STATUSES.includes(focusedStop.status));
  const focusOutstanding = focusedStop ? outstandingPaise(focusedStop) : 0;
  const focusCollected = focusedStop ? collectedPaise(focusedStop) : 0;
  const focusExtra = focusedStop ? extraCountFor(focusedStop) : 0;
  const focusSkipped = focusedStop?.status === 'CANCELLED';
  // The server refuses to undo a COD-funded stop (its cash/entitlement
  // allocation is not reversed), so never offer an Undo that cannot succeed.
  const undoable = Boolean((focusDelivered || focusSkipped) && Number(focusedStop?.cashDuePaise || 0) <= 0);

  const focusStop = (stopId: string) => {
    setFocusedStopId(stopId);
    setExpander('none');
    setCashPaise(0);
  };

  const runAction = async (key: string, fn: () => Promise<unknown>, success?: { title: string; body?: string }, collapse = true) => {
    if (busy) return;
    setBusy(key);
    try {
      await fn();
      await onRefresh();
      if (collapse) setExpander('none');
      if (success) Toast.show({ type: 'success', text1: success.title, text2: success.body });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Action failed', text2: errorMessage(error) });
    } finally {
      setBusy(null);
    }
  };

  const recordCash = (stop: DeliveryRunStop) => {
    const amount = Math.round(cashPaise);
    if (!amount || amount <= 0) { Toast.show({ type: 'error', text1: 'Enter an amount', text2: 'Add the cash you collected at the door.' }); return; }
    if (amount > focusOutstanding) { Toast.show({ type: 'error', text1: 'Amount too high', text2: `Only ${money(focusOutstanding)} is still due on this stop.` }); return; }
    setCashPaise(0);
    void runAction('cash', () => subscriptionOperationsService.recordStopPayment(run.id, stop.id, {
      version: stop.version,
      amountPaise: amount,
      paymentMode: cashMode,
    }), { title: `Collected ${money(amount)}`, body: 'Hand it to the store at settlement.' });
  };

  const attachExtra = (stop: DeliveryRunStop) => {
    const paise = Math.round(Number(extraPrice) * 100);
    if (!Number.isFinite(paise) || paise <= 0) { Toast.show({ type: 'error', text1: 'Enter a price', text2: 'Set the per-litre price for the add-on.' }); return; }
    void runAction('extra', () => subscriptionOperationsService.addExtraMilk(run.id, stop.id, {
      extraQuantity: extraQty.trim() || '+1L',
      extraPaise: paise,
      consecutiveDays: extraDays,
      targetSlot: extraDays > 1 ? extraSlot : undefined,
    }, `console-extra-${stop.id}-${Date.now()}`), {
      title: `Extra milk attached (${extraQty.trim() || '+1L'})`,
      body: extraDays > 1 ? `Scheduled ${extraSlot} for ${extraDays} days.` : 'Added to today.',
    });
  };

  const toggleSlot = (stop: DeliveryRunStop) => {
    const next = (stop.subscriptionDelivery?.deliverySlot || 'AM') === 'AM' ? 'PM' : 'AM';
    void runAction('slot', () => subscriptionOperationsService.toggleStopSlot(run.id, stop.id, { targetSlot: next, version: stop.version }), {
      title: `Moved to ${next} slot`,
      body: `This delivery now runs in the ${next} window.`,
    }, false);
  };

  const reportProblem = (stop: DeliveryRunStop) => {
    void runAction('fail', async () => {
      const coordinates = await resolveLocation();
      return subscriptionOperationsService.failStop(run.id, stop.id, {
        ...coordinates,
        version: stop.version,
        reason: failureReason,
        note: failureNote.trim() || undefined,
        retryRequested,
      });
    }, {
      title: retryRequested ? 'Retry recorded' : 'Failure recorded',
      body: retryRequested ? 'The stop stays unresolved and must be retried.' : 'The exception is visible to the store and admin.',
    });
  };

  const skipStop = (stop: DeliveryRunStop) => {
    void runAction('skip', () => subscriptionOperationsService.skipStop(run.id, stop.id, { reason: skipReason.trim() || 'Customer requested skip', version: stop.version }), {
      title: 'Stop skipped',
      body: 'The store and admin can see it.',
    });
  };

  const undoStop = (stop: DeliveryRunStop) => {
    void runAction('undo', () => subscriptionOperationsService.undoStop(run.id, stop.id, { version: stop.version, reason: 'Reversed from map console' }), {
      title: 'Stop reopened',
      body: 'Delivery and cash counters were reversed.',
    });
  };

  // Deliver inline: ensure arrival, then complete with the right proof — a
  // camera photo for photo-GPS, a six-digit OTP for OTP handover, or a scanned
  // Trusted Drop QR token plus a photo. Everything happens in this console.
  const beginDeliver = async (stop: DeliveryRunStop) => {
    if (busy) return;
    setBusy('arrive');
    try {
      if (stop.status === 'READY' || stop.status === 'PLANNED' || stop.status === 'RETRY_PENDING') {
        const coordinates = await resolveLocation();
        await subscriptionOperationsService.arriveAtStop(run.id, stop.id, { ...coordinates, version: stop.version });
        await onRefresh();
      }
      const mode = stop.proofMode === 'TRUSTED_DROP' ? 'TRUSTED_DROP' : stop.proofMode === 'RIDER_PHOTO_GPS' ? 'PHOTO' : 'OTP';
      setCapture({ stop, mode, otpCode: '' });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Could not record arrival', text2: errorMessage(error) });
    } finally {
      setBusy(null);
    }
  };

  const capturePhoto = async () => {
    if (!capture) return;
    setBusy('photo');
    try {
      const picked = await PartnerDocumentPicker.captureImage();
      if (!picked.type.startsWith('image/')) throw new Error('Delivery proof must be a camera image.');
      if (picked.size > 6 * 1024 * 1024) throw new Error('Delivery proof photo must be 6 MB or smaller.');
      if (capture.mode === 'TRUSTED_DROP') {
        if (!capture.token?.trim()) throw new Error('Scan the customer QR before taking the drop photo.');
        // Trusted Drop evidence must be bound to the stop's one-time token;
        // the generic upload returns a bare storage key the server cannot
        // verify against the stop's proof mode.
        const evidence = await subscriptionOperationsService.uploadTrustedDropEvidence(run.id, capture.stop.id, {
          trustedDropToken: capture.token.trim(),
          file: { uri: picked.uri, name: picked.name, type: picked.type },
        });
        setCapture((current) => (current ? { ...current, photoId: evidence.id, photoName: picked.name } : current));
      } else {
        const uploaded = await riderService.uploadEvidence({ uri: picked.uri, name: picked.name, type: picked.type, size: picked.size });
        setCapture((current) => (current ? { ...current, photoId: uploaded.storageKey, photoName: picked.name } : current));
      }
      Toast.show({ type: 'success', text1: 'Delivery photo secured', text2: 'Now complete the stop.' });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Photo upload failed', text2: errorMessage(error) });
    } finally {
      setBusy(null);
    }
  };

  const sendOtp = async () => {
    if (!capture) return;
    setBusy('otp-send');
    try {
      await subscriptionOperationsService.issueStopOtp(run.id, capture.stop.id, capture.stop.version);
      Toast.show({ type: 'success', text1: 'OTP sent', text2: 'Ask the customer for the six-digit code.' });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'OTP could not be sent', text2: errorMessage(error) });
    } finally {
      setBusy(null);
    }
  };

  const confirmCapture = async () => {
    if (!capture) return;
    const { stop, mode, photoId, otpCode, token } = capture;
    if (mode === 'PHOTO' && !photoId) { Toast.show({ type: 'error', text1: 'Take the delivery photo first' }); return; }
    if (mode === 'OTP' && !/^\d{6}$/.test(otpCode)) { Toast.show({ type: 'error', text1: 'Enter the six-digit OTP' }); return; }
    if (mode === 'TRUSTED_DROP' && (!token?.trim() || !photoId)) { Toast.show({ type: 'error', text1: 'Scan the QR and take the photo', text2: 'Trusted Drop needs both the token and a photo.' }); return; }
    setBusy('complete');
    try {
      const coordinates = await resolveLocation();
      const outstanding = outstandingPaise(stop);
      await subscriptionOperationsService.completeStop(run.id, stop.id, {
        ...coordinates,
        version: stop.version,
        riderConfirmed: true,
        otpCode: mode === 'OTP' ? otpCode : undefined,
        trustedDropToken: mode === 'TRUSTED_DROP' ? token!.trim() : undefined,
        evidenceId: mode !== 'OTP' ? photoId : undefined,
        cashCollectedPaise: outstanding > 0 ? outstanding : undefined,
      });
      setCapture(null);
      await onRefresh();
      Toast.show({ type: 'success', text1: 'Stop completed', text2: 'Proof and funding entitlement were recorded.' });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Completion failed', text2: errorMessage(error) });
    } finally {
      setBusy(null);
    }
  };

  const cashPadPaise = Math.round(cashPaise);

  return (
    <View style={styles.screen}>
      <View style={styles.mapLayer}>
        <RiderRouteMap
          destination={mapDestination}
          destinationLabel={focusedStop ? `${focusedStop.sequenceNumber}. ${focusedStop.deliveryJob?.order?.customer?.name || 'Customer'}` : run.store.name}
          active
          riderLocation={riderLocation}
          stops={mapStops}
          progressDone={completed}
          progressTotal={total}
          activeStopId={focusedStop?.id || null}
          onStopPress={(stopId) => { focusStop(stopId); snapTo(true); }}
          expanded
        />
      </View>

      {/* Top glass chrome: identity, progress, and live route stats. */}
      <View style={[styles.topStack, { paddingTop: Math.max(insets.top, 12) + 4 }]} pointerEvents="box-none">
        <View style={styles.headerCard}>
          <View style={styles.headerRow}>
            <TouchableOpacity accessibilityLabel="Close map console" style={styles.backButton} onPress={onClose}>
              <ArrowLeft size={20} color="#0B1B3A" />
            </TouchableOpacity>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow} numberOfLines={1}>ROUTE {run.routeCode}</Text>
              <Text style={styles.headerTitle} numberOfLines={1}>{run.store.name}</Text>
            </View>
            <View style={[styles.statusChip, { backgroundColor: focusTone.bg }]}>
              <Text style={[styles.statusChipText, { color: focusTone.text }]} numberOfLines={1}>{label(run.status)}</Text>
            </View>
          </View>
          <View style={styles.progressRow}>
            <Text style={styles.progressText}>{completed} of {total} stops</Text>
            <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>
            <Text style={styles.progressPct}>{progress}%</Text>
          </View>
          <View style={styles.statRow}>
            <View style={styles.stat}><MapPin size={13} color="#0F766E" /><Text style={styles.statValue}>{remaining}</Text><Text style={styles.statLabel}>left</Text></View>
            <View style={styles.statDot} />
            <View style={styles.stat}><Banknote size={13} color="#A15C00" /><Text style={styles.statValue}>{money(cashHeld)}</Text><Text style={styles.statLabel}>held</Text></View>
            <View style={styles.statDot} />
            <View style={styles.stat}><Milk size={13} color="#1D4ED8" /><Text style={styles.statValue}>{money(cashTarget)}</Text><Text style={styles.statLabel}>target</Text></View>
            <View style={styles.statDot} />
            <View style={styles.stat}><Users size={13} color="#155E75" /><Text style={styles.statValue}>{mapStops.length}</Text><Text style={styles.statLabel}>pinned</Text></View>
          </View>
          {headerChips}
        </View>

        {run.status === 'PICKED_UP' ? (
          <TouchableOpacity style={styles.startButton} disabled={starting} onPress={onStartRun}>
            <Navigation size={18} color="#FFFFFF" />
            <Text style={styles.startButtonText}>{starting ? 'Starting…' : 'Start delivery run'}</Text>
          </TouchableOpacity>
        ) : null}

        <ScrollView
          ref={railRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rail}
          style={styles.railWrap}
        >
          {stops.map((stop) => {
            const done = DONE_STATUSES.includes(stop.status);
            const isFocused = focusedStop?.id === stop.id;
            const multiSub = duplicateKeys.has(customerKey(stop));
            const paid = collectedPaise(stop);
            const due = Number(stop.cashDuePaise || 0);
            const part = paid > 0 && paid < due;
            const extra = extraCountFor(stop) > 0;
            return (
              <TouchableOpacity
                key={stop.id}
                accessibilityLabel={`Focus stop ${stop.sequenceNumber}`}
                onPress={() => { focusStop(stop.id); snapTo(true); }}
                style={[styles.railChip, done && styles.railChipDone, isFocused && styles.railChipActive]}
              >
                <Text style={[styles.railSeq, isFocused && styles.railSeqActive]}>{stop.sequenceNumber}</Text>
                <Text style={[styles.railName, isFocused && styles.railNameActive]} numberOfLines={1}>
                  {stop.deliveryJob?.order?.customer?.name || 'Customer'}
                </Text>
                {multiSub ? <Text style={styles.railMulti}>2 subs</Text> : null}
                {extra ? <Milk size={12} color={isFocused ? '#93C5FD' : '#1D4ED8'} /> : null}
                {part ? <Banknote size={12} color={isFocused ? '#FDE68A' : '#A15C00'} /> : null}
                {done ? <CheckCircle2 size={13} color={isFocused ? '#7DE2C0' : '#0F766E'} /> : null}
                {stop.status === 'CANCELLED' ? <SkipForward size={12} color={isFocused ? '#CBD5E1' : '#64748B'} /> : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Bottom console: one draggable sheet. Peek = the stop answering now and
          its actions; drag up = the full route board (ordered stops + run
          lifecycle), so the rider never leaves this map to work the route. */}
      {focusedStop ? (
        <Animated.View
          style={[styles.sheet, { height: expandedHeight, paddingBottom: Math.max(insets.bottom, 12) + 8, transform: [{ translateY: sheetTranslate }] }]}
          pointerEvents="box-none"
        >
          <View style={styles.sheetCard}>
            <View {...sheetPan.panHandlers} style={styles.sheetGripWrap}>
              <View style={styles.sheetGrip} />
              <Text style={styles.sheetGripLabel}>{sheetExpanded ? 'Route board' : 'Drag up for the route board'}</Text>
            </View>
            <ScrollView
              style={styles.sheetScroll}
              contentContainerStyle={styles.sheetScrollContent}
              scrollEnabled={sheetExpanded}
              showsVerticalScrollIndicator={sheetExpanded}
              keyboardShouldPersistTaps="handled"
            >
            {lifecycle}
            <View style={styles.sheetHead}>
              <View style={[styles.seqCircle, focusActionable && styles.seqCircleActive, focusDelivered && styles.seqCircleDone]}>
                <Text style={[styles.seqText, (focusActionable || focusDelivered) && styles.seqTextActive]}>{focusedStop.sequenceNumber}</Text>
              </View>
              <View style={styles.sheetCopy}>
                <Text style={styles.sheetEyebrow}>
                  {focusDelivered ? 'DELIVERED' : focusSkipped ? 'SKIPPED' : focusActionable ? 'NEXT STOP' : 'STOP'} · {focusedStop.sequenceNumber} OF {total}
                </Text>
                <Text style={styles.sheetName} numberOfLines={1}>{focusedStop.deliveryJob?.order?.customer?.name || 'Customer'}</Text>
                <View style={styles.planRow}>
                  <Text style={styles.sheetPlan} numberOfLines={1}>{planLabel(focusedStop)}</Text>
                  {focusedStop.subscriptionDelivery?.deliverySlot ? <Text style={styles.slotPill}>{focusedStop.subscriptionDelivery.deliverySlot}</Text> : null}
                  {duplicateKeys.has(customerKey(focusedStop)) ? <Text style={styles.multiBadge}>2 subscriptions</Text> : null}
                </View>
              </View>
              <View style={[styles.statusChip, { backgroundColor: focusTone.bg }]}>
                <Text style={[styles.statusChipText, { color: focusTone.text }]}>{label(focusedStop.status)}</Text>
              </View>
            </View>

            <View style={styles.addressRow}>
              <MapPin size={14} color="#64748B" />
              <Text style={styles.sheetAddress} numberOfLines={2}>{addressFrom(focusedStop)}</Text>
            </View>

            {/* State signals: what already happened to this stop, at a glance. */}
            <View style={styles.signalRow}>
              {focusDelivered ? <View style={[styles.signal, styles.signalDone]}><CheckCircle2 size={12} color="#065F46" /><Text style={styles.signalDoneText}>Delivered</Text></View> : null}
              {focusSkipped ? <View style={[styles.signal, styles.signalSkip]}><SkipForward size={12} color="#475569" /><Text style={styles.signalSkipText}>Skipped</Text></View> : null}
              {focusCollected > 0 ? (
                <View style={[styles.signal, focusOutstanding > 0 ? styles.signalPartial : styles.signalPaid]}>
                  <Banknote size={12} color={focusOutstanding > 0 ? '#8A4B00' : '#065F46'} />
                  <Text style={focusOutstanding > 0 ? styles.signalPartialText : styles.signalPaidText}>
                    {money(focusCollected)} {focusOutstanding > 0 ? 'part-paid' : 'paid'}
                  </Text>
                </View>
              ) : null}
              {focusExtra > 0 ? <View style={[styles.signal, styles.signalExtra]}><Milk size={12} color="#1D4ED8" /><Text style={styles.signalExtraText}>+{focusExtra}L extra</Text></View> : null}
              {focusActionable && focusCollected === 0 ? (
                Number(focusedStop.cashDuePaise || 0) > 0
                  ? <View style={[styles.signal, styles.signalDue]}><Banknote size={12} color="#8A4B00" /><Text style={styles.signalPartialText}>{money(focusedStop.cashDuePaise)} due</Text></View>
                  : <View style={[styles.signal, styles.signalPaid]}><CheckCircle2 size={12} color="#065F46" /><Text style={styles.signalPaidText}>Prepaid</Text></View>
              ) : null}
              {focusActionable ? <View style={[styles.signal, styles.signalMeta]}><Layers size={12} color="#475569" /><Text style={styles.signalMetaText}>{proofQuickLabel(focusedStop)}</Text></View> : null}
            </View>

            {focusedStop.failureReason ? (
              <View style={styles.failureRow}><CircleAlert size={14} color="#B42318" /><Text style={styles.failureText} numberOfLines={2}>{focusedStop.failureReason}</Text></View>
            ) : null}

            {/* Quick ops: one glass button per operation. Enabled when it applies. */}
            <View style={styles.opsRow}>
              <TouchableOpacity
                accessibilityLabel="Record cash collected"
                disabled={focusDelivered || focusSkipped || (!focusActionable && focusCollected === 0)}
                style={[styles.op, expander === 'cash' && styles.opActive, (focusDelivered || focusSkipped) && styles.opDisabled]}
                onPress={() => toggleExpander('cash')}
              >
                <Banknote size={17} color={expander === 'cash' ? '#FFFFFF' : '#A15C00'} />
                <Text style={[styles.opText, expander === 'cash' && styles.opTextActive]}>Cash</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityLabel="Attach extra milk"
                disabled={focusDelivered || focusSkipped}
                style={[styles.op, expander === 'extra' && styles.opActive, (focusDelivered || focusSkipped) && styles.opDisabled]}
                onPress={() => toggleExpander('extra')}
              >
                <Milk size={17} color={expander === 'extra' ? '#FFFFFF' : '#1D4ED8'} />
                <Text style={[styles.opText, expander === 'extra' && styles.opTextActive]}>Extra</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityLabel="Toggle AM or PM slot"
                disabled={focusDelivered || focusSkipped}
                style={[styles.op, (focusDelivered || focusSkipped) && styles.opDisabled]}
                onPress={() => toggleSlot(focusedStop)}
              >
                <Clock size={17} color="#0F766E" />
                <Text style={styles.opText}>Slot</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityLabel="Skip this stop"
                disabled={focusDelivered || focusSkipped}
                style={[styles.op, expander === 'skip' && styles.opActive, (focusDelivered || focusSkipped) && styles.opDisabled]}
                onPress={() => toggleExpander('skip')}
              >
                <SkipForward size={17} color={expander === 'skip' ? '#FFFFFF' : '#475569'} />
                <Text style={[styles.opText, expander === 'skip' && styles.opTextActive]}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityLabel="Report a delivery problem"
                disabled={focusDelivered || focusSkipped || !focusActionable}
                style={[styles.op, expander === 'problem' && styles.opActiveDanger, (focusDelivered || focusSkipped || !focusActionable) && styles.opDisabled]}
                onPress={() => toggleExpander('problem')}
              >
                <CircleAlert size={17} color={expander === 'problem' ? '#FFFFFF' : '#B42318'} />
                <Text style={[styles.opText, expander === 'problem' && styles.opTextActive]}>Problem</Text>
              </TouchableOpacity>
            </View>

            {expander === 'cash' ? (
              <View style={styles.expander}>
                <View style={styles.expanderHead}>
                  <Text style={styles.expanderTitle}>Collect cash · {money(focusOutstanding)} outstanding</Text>
                  <TouchableOpacity onPress={() => setExpander('none')} accessibilityLabel="Close cash pad"><X size={16} color="#64748B" /></TouchableOpacity>
                </View>
                <View style={styles.chipWrap}>
                  {CASH_PRESETS_PAISE.filter((preset) => preset <= focusOutstanding).map((preset) => (
                    <TouchableOpacity key={preset} style={styles.chip} onPress={() => setCashPaise(cashPaise + preset)}>
                      <Text style={styles.chipText}>+{money(preset)}</Text>
                    </TouchableOpacity>
                  ))}
                  {focusOutstanding > 0 ? (
                    <TouchableOpacity style={[styles.chip, styles.chipStrong]} onPress={() => setCashPaise(focusOutstanding)}>
                      <Text style={styles.chipStrongText}>Full {money(focusOutstanding)}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                <View style={styles.cashRow}>
                  <Text style={styles.cashRupee}>₹</Text>
                  <TextInput
                    style={styles.cashInput}
                    value={cashPadPaise ? String(Math.round(cashPadPaise / 100)) : ''}
                    onChangeText={(text) => setCashPaise(Math.round(Number(text.replace(/[^0-9.]/g, '') || 0) * 100))}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor="#94A3B8"
                    accessibilityLabel="Cash amount in rupees"
                  />
                  <View style={styles.modeToggle}>
                    {(['CASH', 'PHONE_PE'] as const).map((mode) => (
                      <TouchableOpacity key={mode} style={[styles.modeOption, cashMode === mode && styles.modeOptionActive]} onPress={() => setCashMode(mode)}>
                        <Text style={[styles.modeText, cashMode === mode && styles.modeTextActive]}>{mode === 'CASH' ? 'Cash' : 'PhonePe'}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <TouchableOpacity
                  accessibilityLabel="Save cash payment"
                  style={[styles.expanderAction, (!cashPadPaise || busy === 'cash') && styles.expanderActionDisabled]}
                  disabled={!cashPadPaise || busy === 'cash'}
                  onPress={() => recordCash(focusedStop)}
                >
                  {busy === 'cash' ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.expanderActionText}>Record {money(cashPadPaise)}</Text>}
                </TouchableOpacity>
              </View>
            ) : null}

            {expander === 'extra' ? (
              <View style={styles.expander}>
                <View style={styles.expanderHead}>
                  <Text style={styles.expanderTitle}>Attach extra milk</Text>
                  <TouchableOpacity onPress={() => setExpander('none')} accessibilityLabel="Close extra milk panel"><X size={16} color="#64748B" /></TouchableOpacity>
                </View>
                <View style={styles.chipWrap}>
                  {['+0.5L', '+1L', '+2L'].map((qty) => (
                    <TouchableOpacity key={qty} style={[styles.chip, extraQty === qty && styles.chipStrong]} onPress={() => setExtraQty(qty)}>
                      <Text style={[styles.chipText, extraQty === qty && styles.chipStrongText]}>{qty}</Text>
                    </TouchableOpacity>
                  ))}
                  {[1, 3, 7].map((days) => (
                    <TouchableOpacity key={days} style={[styles.chip, extraDays === days && styles.chipStrong]} onPress={() => setExtraDays(days)}>
                      <Text style={[styles.chipText, extraDays === days && styles.chipStrongText]}>{days === 1 ? 'Today' : `${days} days`}</Text>
                    </TouchableOpacity>
                  ))}
                  {extraDays > 1 ? (['AM', 'PM'] as const).map((slot) => (
                    <TouchableOpacity key={slot} style={[styles.chip, extraSlot === slot && styles.chipStrong]} onPress={() => setExtraSlot(slot)}>
                      <Text style={[styles.chipText, extraSlot === slot && styles.chipStrongText]}>{slot} slot</Text>
                    </TouchableOpacity>
                  )) : null}
                </View>
                <View style={styles.cashRow}>
                  <Text style={styles.cashRupee}>₹</Text>
                  <TextInput
                    style={styles.cashInput}
                    value={extraPrice}
                    onChangeText={setExtraPrice}
                    keyboardType="numeric"
                    placeholder="80"
                    placeholderTextColor="#94A3B8"
                    accessibilityLabel="Extra milk price in rupees"
                  />
                  <Text style={styles.perUnit}>per litre</Text>
                </View>
                <TouchableOpacity
                  accessibilityLabel="Attach extra milk now"
                  style={[styles.expanderAction, busy === 'extra' && styles.expanderActionDisabled]}
                  disabled={busy === 'extra'}
                  onPress={() => attachExtra(focusedStop)}
                >
                  {busy === 'extra' ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.expanderActionText}>Attach {extraQty} · {money(Math.round(Number(extraPrice) * 100) * extraDays)}</Text>}
                </TouchableOpacity>
              </View>
            ) : null}

            {expander === 'skip' ? (
              <View style={styles.expander}>
                <View style={styles.expanderHead}>
                  <Text style={styles.expanderTitle}>Skip this stop</Text>
                  <TouchableOpacity onPress={() => setExpander('none')} accessibilityLabel="Close skip panel"><X size={16} color="#64748B" /></TouchableOpacity>
                </View>
                <View style={styles.chipWrap}>
                  {['Customer requested skip', 'Customer unavailable', 'Address issue'].map((reason) => (
                    <TouchableOpacity key={reason} style={[styles.chip, skipReason === reason && styles.chipStrong]} onPress={() => setSkipReason(reason)}>
                      <Text style={[styles.chipText, skipReason === reason && styles.chipStrongText]}>{reason}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity
                  accessibilityLabel="Confirm skip stop"
                  style={[styles.expanderAction, styles.expanderDanger, busy === 'skip' && styles.expanderActionDisabled]}
                  disabled={busy === 'skip'}
                  onPress={() => skipStop(focusedStop)}
                >
                  {busy === 'skip' ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.expanderActionText}>Skip stop</Text>}
                </TouchableOpacity>
              </View>
            ) : null}

            {expander === 'problem' ? (
              <View style={styles.expander}>
                <View style={styles.expanderHead}>
                  <Text style={styles.expanderTitle}>Report a delivery problem</Text>
                  <TouchableOpacity onPress={() => setExpander('none')} accessibilityLabel="Close problem panel"><X size={16} color="#64748B" /></TouchableOpacity>
                </View>
                <View style={styles.chipWrap}>
                  {FAILURE_REASONS.map((reason) => (
                    <TouchableOpacity key={reason.value} style={[styles.chip, failureReason === reason.value && styles.chipDanger]} onPress={() => setFailureReason(reason.value)}>
                      <Text style={[styles.chipText, failureReason === reason.value && styles.chipStrongText]}>{reason.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={[styles.input, styles.noteInput]}
                  value={failureNote}
                  onChangeText={setFailureNote}
                  multiline
                  placeholder="What happened and what should the next operator know?"
                  placeholderTextColor="#94A3B8"
                />
                <TouchableOpacity style={styles.retryToggle} onPress={() => setRetryRequested((value) => !value)} accessibilityLabel="Toggle retry this stop">
                  <View style={[styles.checkbox, retryRequested && styles.checkboxOn]}>{retryRequested ? <CheckCircle2 size={13} color="#FFFFFF" /> : null}</View>
                  <View style={styles.retryCopy}>
                    <Text style={styles.retryTitle}>Keep this stop for retry</Text>
                    <Text style={styles.retryText}>It stays unresolved so the run cannot close accidentally.</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityLabel="Submit delivery problem"
                  style={[styles.expanderAction, styles.expanderDanger, busy === 'fail' && styles.expanderActionDisabled]}
                  disabled={busy === 'fail'}
                  onPress={() => reportProblem(focusedStop)}
                >
                  {busy === 'fail' ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.expanderActionText}>{retryRequested ? 'Record and keep for retry' : 'Record delivery failure'}</Text>}
                </TouchableOpacity>
              </View>
            ) : null}

            <View style={styles.actionRow}>
              <TouchableOpacity accessibilityLabel="Navigate to this stop" style={styles.actionGhost} onPress={() => onNavigate(focusedStop)}>
                <Navigation size={17} color="#0F766E" />
                <Text style={styles.actionGhostText}>Navigate</Text>
              </TouchableOpacity>
              {focusedStop.deliveryJob?.order?.customer?.phone ? (
                <TouchableOpacity accessibilityLabel="Call the customer" style={styles.actionGhost} onPress={() => void Linking.openURL(`tel:${focusedStop.deliveryJob.order.customer.phone}`)}>
                  <Phone size={17} color="#0F766E" />
                  <Text style={styles.actionGhostText}>Call</Text>
                </TouchableOpacity>
              ) : null}
              {undoable ? (
                <TouchableOpacity accessibilityLabel="Undo last action" style={styles.actionGhost} disabled={busy === 'undo'} onPress={() => undoStop(focusedStop)}>
                  {busy === 'undo' ? <ActivityIndicator color="#0F766E" /> : <RotateCcw size={17} color="#0F766E" />}
                  <Text style={styles.actionGhostText}>Undo</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  accessibilityLabel="Deliver this stop"
                  style={[styles.actionPrimary, (!focusActionable || busy === 'arrive') && styles.actionPrimaryMuted]}
                  disabled={!focusActionable || busy === 'arrive'}
                  onPress={() => void beginDeliver(focusedStop)}
                >
                  {busy === 'arrive' ? <ActivityIndicator color="#FFFFFF" /> : (
                    <>
                      <Text style={styles.actionPrimaryText}>
                        {!focusActionable ? 'Not deliverable yet' : focusOutstanding > 0 ? `Deliver · collect ${money(focusOutstanding)}` : 'Deliver'}
                      </Text>
                      <ChevronRight size={18} color="#FFFFFF" />
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
            {renderBoard ? <View style={styles.boardHost}>{renderBoard({ focusStop: (id) => focusStop(id) })}</View> : null}
            </ScrollView>
          </View>
        </Animated.View>
      ) : (
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]} pointerEvents="box-none">
          <View style={styles.sheetCard}>
            <View style={styles.emptyRow}><Route size={20} color="#0F766E" /><Text style={styles.emptyText}>No stops with a map pin on this route.</Text></View>
          </View>
        </View>
      )}

      {/* Inline proof capture: photo or OTP, without leaving the console. */}
      {capture ? (
        <View style={styles.captureBackdrop}>
          <View style={[styles.captureCard, { paddingBottom: Math.max(insets.bottom, 16) + 10 }]}>
            <View style={styles.captureHead}>
              <View>
                <Text style={styles.sheetEyebrow}>DELIVER · STOP {capture.stop.sequenceNumber}</Text>
                <Text style={styles.captureTitle}>{capture.stop.deliveryJob?.order?.customer?.name || 'Customer'}</Text>
              </View>
              <TouchableOpacity onPress={() => setCapture(null)} accessibilityLabel="Close proof capture"><X size={20} color="#475569" /></TouchableOpacity>
            </View>
            {capture.mode === 'PHOTO' ? (
              <>
                <Text style={styles.captureHint}>Take a delivery photo at the door. GPS is recorded automatically.</Text>
                <TouchableOpacity style={styles.capturePhoto} onPress={() => void capturePhoto()} disabled={busy === 'photo'}>
                  {busy === 'photo' ? <ActivityIndicator color="#0F766E" /> : <Plus size={16} color="#0F766E" />}
                  <Text style={styles.capturePhotoText}>{capture.photoId ? 'Retake photo' : 'Capture photo'}</Text>
                </TouchableOpacity>
                {capture.photoName ? <Text style={styles.captureFileName}>{capture.photoName} secured</Text> : null}
              </>
            ) : capture.mode === 'TRUSTED_DROP' ? (
              <>
                <Text style={styles.captureHint}>Trusted Drop needs the door QR token and a photo taken inside the geofence.</Text>
                <View style={styles.captureRow}>
                  <TextInput
                    style={styles.otpInput}
                    value={capture.token || ''}
                    onChangeText={(text) => setCapture((current) => (current ? { ...current, token: text.trim() } : current))}
                    autoCapitalize="characters"
                    placeholder="Scan or enter drop token"
                    placeholderTextColor="#94A3B8"
                    accessibilityLabel="Trusted Drop token"
                  />
                  <TouchableOpacity style={styles.capturePhoto} onPress={() => void capturePhoto()} disabled={busy === 'photo'}>
                    {busy === 'photo' ? <ActivityIndicator color="#0F766E" /> : <Plus size={16} color="#0F766E" />}
                    <Text style={styles.capturePhotoText}>{capture.photoId ? 'Retake' : 'Photo'}</Text>
                  </TouchableOpacity>
                </View>
                {capture.photoName ? <Text style={styles.captureFileName}>{capture.photoName} secured</Text> : null}
              </>
            ) : (
              <>
                <Text style={styles.captureHint}>Ask the customer for the six-digit OTP from their app.</Text>
                <View style={styles.captureRow}>
                  <TextInput
                    style={styles.otpInput}
                    value={capture.otpCode}
                    onChangeText={(text) => setCapture((current) => (current ? { ...current, otpCode: text.replace(/[^0-9]/g, '').slice(0, 6) } : current))}
                    keyboardType="number-pad"
                    maxLength={6}
                    placeholder="000000"
                    placeholderTextColor="#94A3B8"
                    accessibilityLabel="Customer OTP"
                  />
                  <TouchableOpacity style={styles.captureGhost} onPress={() => void sendOtp()} disabled={busy === 'otp-send'}>
                    {busy === 'otp-send' ? <ActivityIndicator color="#0F766E" /> : <Text style={styles.captureGhostText}>Send OTP</Text>}
                  </TouchableOpacity>
                </View>
              </>
            )}
            <TouchableOpacity style={styles.capturePrimary} onPress={() => void confirmCapture()} disabled={busy === 'complete'}>
              {busy === 'complete' ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.capturePrimaryText}>Confirm & complete</Text>}
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
};

const GLASS = 'rgba(255,255,255,0.94)';
const GLASS_BORDER = 'rgba(15,23,42,0.08)';

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B1B3A' },
  mapLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  topStack: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 12 },
  headerCard: {
    backgroundColor: GLASS,
    borderRadius: 20,
    padding: 13,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    shadowColor: '#0B1B3A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 6,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  backButton: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#EEF4F2', alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, marginLeft: 10, marginRight: 8 },
  eyebrow: { color: '#0F766E', fontSize: 10, fontWeight: '700', letterSpacing: 1.1 },
  headerTitle: { color: '#0B1B3A', fontSize: 16, fontWeight: '700', marginTop: 1 },
  statusChip: { borderRadius: 11, paddingHorizontal: 9, paddingVertical: 5, maxWidth: 108 },
  statusChipText: { fontSize: 9, fontWeight: '700', textAlign: 'center' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 11 },
  progressText: { color: '#334155', fontSize: 11, fontWeight: '600' },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: '#E4EBE8', overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: '#10A36F' },
  progressPct: { color: '#0F766E', fontSize: 11, fontWeight: '700' },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statValue: { color: '#0B1B3A', fontSize: 12, fontWeight: '700' },
  statLabel: { color: '#7A8580', fontSize: 10, fontWeight: '500' },
  statDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: '#C7D2CE' },
  startButton: {
    marginTop: 10,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: '#0F766E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 6,
  },
  startButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  railWrap: { marginTop: 10 },
  rail: { gap: 8, paddingRight: 4 },
  railChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    maxWidth: 210,
    shadowColor: '#0B1B3A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  railChipDone: { backgroundColor: 'rgba(233,249,240,0.96)' },
  railChipActive: { backgroundColor: '#0B1B3A', borderColor: '#0B1B3A' },
  railSeq: { color: '#0B1B3A', fontSize: 12, fontWeight: '800' },
  railSeqActive: { color: '#7DE2C0' },
  railName: { color: '#17211D', fontSize: 12, fontWeight: '600', flexShrink: 1 },
  railNameActive: { color: '#FFFFFF' },
  railMulti: { color: '#8A4B00', fontSize: 9, fontWeight: '700' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 12 },
  sheetCard: {
    flex: 1,
    backgroundColor: GLASS,
    borderRadius: 22,
    paddingTop: 7,
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    shadowColor: '#0B1B3A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    elevation: 8,
  },
  sheetGripWrap: { alignItems: 'center', paddingVertical: 6 },
  sheetGrip: { width: 44, height: 5, borderRadius: 3, backgroundColor: '#C7D2CE' },
  sheetGripLabel: { color: '#94A3B8', fontSize: 10, fontWeight: '600', marginTop: 5 },
  sheetScroll: { flex: 1 },
  sheetScrollContent: { paddingBottom: 6 },
  boardHost: { marginTop: 16, borderTopWidth: 1, borderTopColor: '#EEF2F6', paddingTop: 4 },
  sheetHead: { flexDirection: 'row', alignItems: 'center' },
  seqCircle: { width: 44, height: 44, borderRadius: 15, backgroundColor: '#E7F0EE', alignItems: 'center', justifyContent: 'center' },
  seqCircleActive: { backgroundColor: '#0F766E' },
  seqCircleDone: { backgroundColor: '#0F9D63' },
  seqText: { color: '#0B1B3A', fontSize: 18, fontWeight: '800' },
  seqTextActive: { color: '#FFFFFF' },
  sheetCopy: { flex: 1, marginLeft: 11, marginRight: 8 },
  sheetEyebrow: { color: '#0F766E', fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  sheetName: { color: '#0B1B3A', fontSize: 17, fontWeight: '700', marginTop: 2 },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' },
  sheetPlan: { color: '#475569', fontSize: 11, fontWeight: '600', flexShrink: 1 },
  slotPill: { color: '#155E75', backgroundColor: '#E0F2FE', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, fontSize: 9, fontWeight: '700' },
  multiBadge: { color: '#8A4B00', backgroundColor: '#FFF2D9', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, fontSize: 9, fontWeight: '700' },
  addressRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 12 },
  sheetAddress: { flex: 1, color: '#475569', fontSize: 12.5, lineHeight: 18 },
  signalRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  signal: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5 },
  signalDone: { backgroundColor: '#D9F6E7' },
  signalDoneText: { color: '#065F46', fontSize: 10.5, fontWeight: '700' },
  signalSkip: { backgroundColor: '#EEF2F6' },
  signalSkipText: { color: '#475569', fontSize: 10.5, fontWeight: '700' },
  signalPaid: { backgroundColor: '#D9F6E7' },
  signalPaidText: { color: '#065F46', fontSize: 10.5, fontWeight: '700' },
  signalPartial: { backgroundColor: '#FFF2D9' },
  signalPartialText: { color: '#8A4B00', fontSize: 10.5, fontWeight: '700' },
  signalDue: { backgroundColor: '#FFF2D9' },
  signalExtra: { backgroundColor: '#E7EFFF' },
  signalExtraText: { color: '#1D4ED8', fontSize: 10.5, fontWeight: '700' },
  signalMeta: { backgroundColor: '#EEF4F2' },
  signalMetaText: { color: '#334155', fontSize: 10.5, fontWeight: '600' },
  failureRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, backgroundColor: '#FFF3F2', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
  failureText: { flex: 1, color: '#B42318', fontSize: 11.5, fontWeight: '600' },
  opsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  op: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 8, borderRadius: 13, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' },
  opActive: { backgroundColor: '#0B1B3A', borderColor: '#0B1B3A' },
  opActiveDanger: { backgroundColor: '#B42318', borderColor: '#B42318' },
  opDisabled: { opacity: 0.4 },
  opText: { color: '#334155', fontSize: 10.5, fontWeight: '700' },
  opTextActive: { color: '#FFFFFF' },
  expander: { marginTop: 11, borderTopWidth: 1, borderTopColor: '#EEF2F6', paddingTop: 11 },
  expanderHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 },
  expanderTitle: { color: '#0B1B3A', fontSize: 12.5, fontWeight: '700' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { borderRadius: 11, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC', paddingHorizontal: 11, paddingVertical: 7 },
  chipText: { color: '#334155', fontSize: 11.5, fontWeight: '700' },
  chipStrong: { backgroundColor: '#0F766E', borderColor: '#0F766E' },
  chipDanger: { backgroundColor: '#B42318', borderColor: '#B42318' },
  chipStrongText: { color: '#FFFFFF' },
  input: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 12, paddingVertical: 10, fontSize: 13.5, color: '#0B1B3A', backgroundColor: '#FFFFFF' },
  noteInput: { minHeight: 72, marginTop: 10, textAlignVertical: 'top' },
  retryToggle: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 11 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: '#0F766E', borderColor: '#0F766E' },
  retryCopy: { flex: 1 },
  retryTitle: { color: '#0B1B3A', fontSize: 12.5, fontWeight: '700' },
  retryText: { color: '#64748B', fontSize: 11, marginTop: 1 },
  cashRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  cashRupee: { color: '#0B1B3A', fontSize: 18, fontWeight: '800' },
  cashInput: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 12, fontSize: 16, fontWeight: '700', color: '#0B1B3A', backgroundColor: '#FFFFFF' },
  perUnit: { color: '#64748B', fontSize: 11, fontWeight: '600' },
  modeToggle: { flexDirection: 'row', borderRadius: 12, backgroundColor: '#EEF2F6', padding: 3 },
  modeOption: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9 },
  modeOptionActive: { backgroundColor: '#0B1B3A' },
  modeText: { color: '#475569', fontSize: 11, fontWeight: '700' },
  modeTextActive: { color: '#FFFFFF' },
  expanderAction: { marginTop: 11, minHeight: 46, borderRadius: 14, backgroundColor: '#0F766E', alignItems: 'center', justifyContent: 'center' },
  expanderDanger: { backgroundColor: '#B42318' },
  expanderActionDisabled: { opacity: 0.5 },
  expanderActionText: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '700' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 13 },
  actionGhost: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 14, borderWidth: 1, borderColor: '#B7E4D7', backgroundColor: '#EFFBF5', paddingHorizontal: 13, minHeight: 48 },
  actionGhostText: { color: '#0F766E', fontSize: 13, fontWeight: '700' },
  actionPrimary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 14, backgroundColor: '#0F766E', minHeight: 48 },
  actionPrimaryMuted: { backgroundColor: '#64748B' },
  actionPrimaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  emptyText: { color: '#475569', fontSize: 13, fontWeight: '600' },
  captureBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(11,27,58,0.5)', justifyContent: 'flex-end' },
  captureCard: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18 },
  captureHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  captureTitle: { color: '#0B1B3A', fontSize: 17, fontWeight: '700', marginTop: 2 },
  captureHint: { color: '#475569', fontSize: 12.5, lineHeight: 18, marginTop: 12 },
  capturePhoto: { marginTop: 12, minHeight: 52, borderRadius: 14, borderWidth: 1.5, borderColor: '#B7E4D7', borderStyle: 'dashed', backgroundColor: '#F0FBF6', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  capturePhotoText: { color: '#0F766E', fontSize: 14, fontWeight: '700' },
  captureFileName: { color: '#065F46', fontSize: 11.5, fontWeight: '600', marginTop: 8 },
  captureRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 12 },
  otpInput: { flex: 1, minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 14, fontSize: 20, letterSpacing: 5, fontWeight: '800', color: '#0B1B3A', backgroundColor: '#F8FAFC' },
  captureGhost: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: '#B7E4D7', backgroundColor: '#EFFBF5', paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  captureGhostText: { color: '#0F766E', fontSize: 13, fontWeight: '700' },
  capturePrimary: { marginTop: 14, minHeight: 52, borderRadius: 16, backgroundColor: '#0F766E', alignItems: 'center', justifyContent: 'center' },
  capturePrimaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
