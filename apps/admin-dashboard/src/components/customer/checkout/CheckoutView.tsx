'use client';

/**
 * Direction contract — /shop/checkout "trust-first" redesign (user-locked 2026-08-31, code-led build).
 * THESIS: checkout reads like a signed ledger, not a dashboard — one honest page where every
 *   decision (address, time, payment) visibly completes and the bill never moves without saying why.
 *   Refuses the category default of scattered dark cards and all-caps shouting.
 * OWN-WORLD: bright white paper surfaces on the app's mint canvas; deep-teal ink (teal-950/800)
 *   carried over from the Aagaam shell; amber only for attention (closed store, scarcity, delivery
 *   gap), emerald only for money saved; 1px hairline structure, one soft shadow reserved for
 *   floating surfaces (summary, modal, mobile bar); 12–16px radii; tabular numerals for money.
 * STORY: the customer sees where the order goes, when it arrives, how they pay, and what it costs —
 *   each step finishing with a check they can trust; capabilities we truly have (live tracking,
 *   OTP-verified handover) are the only trust claims.
 * FIRST VIEWPORT: slim header (back, "Secure checkout", item count, live total); left rail of three
 *   numbered steps — Delivery address tiles first; sticky Order summary right with items, fees,
 *   coupon, deep-teal total slab and the Place order CTA; on mobile the CTA docks to a bottom bar.
 * FORM: user-pinned "trust-first" card from the presented direction round (pin beats roll, no seed key).
 * SIGNATURE MOMENT: the step badge completing to a check as each decision locks (single authored
 *   motion; everything else is standard state transition).
 * FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the
 *   verdict, DESIGN.md, and every shipping raster carrying its provenance.
 */

import React, { useId, useMemo } from 'react';
import dynamic from 'next/dynamic';
import {
  AlertCircle,
  ArrowLeft,
  Banknote,
  CalendarDays,
  Check,
  Clock3,
  CreditCard,
  Loader2,
  Lock,
  MapPin,
  Pencil,
  Plus,
  ScanLine,
  ShieldCheck,
  ShoppingBag,
  Tag,
  Trash2,
  Truck,
  X,
  Zap,
} from 'lucide-react';

const CustomerLocationPicker = dynamic(
  () => import('@/components/customer/CustomerLocationPicker'),
  { ssr: false },
);

/* ---------------------------------- types --------------------------------- */

export type Address = {
  id: string;
  label?: string | null;
  recipientName: string;
  phoneE164: string;
  line1: string;
  line2?: string | null;
  landmark?: string | null;
  city: string;
  state: string;
  pincode: string;
  country: string;
  latitude: number;
  longitude: number;
  instructions?: string | null;
  isDefault: boolean;
  locationSource?: 'LIVE_GPS' | 'MAP_PIN' | 'GEOCODED' | 'LEGACY_UNKNOWN';
  locationAccuracyMetres?: number | null;
  locationCapturedAt?: string | null;
  localityId?: string | null;
};

export type AddressDraft = {
  label: string;
  recipientName: string;
  phoneE164: string;
  line1: string;
  line2: string;
  landmark: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  locationSource: 'LIVE_GPS' | 'MAP_PIN' | 'GEOCODED' | 'LEGACY_UNKNOWN';
  locationAccuracyMetres: number | null;
  locationCapturedAt: string | null;
  instructions: string;
  isDefault: boolean;
};

export type QuoteResponse = {
  currency: 'INR';
  serviceable: boolean;
  distanceKm: number | null;
  store: { id: string; name: string | null } | null;
  deliveryPricing: {
    serviceable: boolean;
    ratePaisePerKm: number;
    freeDeliveryMinimumPaise: number;
    maximumDistanceKm: number;
    distanceFeePaise: number;
    waivedByThreshold: boolean;
    waivedByFirstOrder: boolean;
    payableFeePaise: number;
  } | null;
  invoice: {
    items: Array<{
      productId: string;
      name: string;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
      inStock: boolean;
      availableQty: number | null;
    }>;
    subtotal: number;
    deliveryFee: number;
    discountAmount: number;
    taxAmount: number;
    grandTotal: number;
  };
  appliedCoupon?: {
    id: string;
    code: string;
    name: string;
    discountType: string;
    applicationMode: string;
    discountAmount: number;
  } | null;
};

export type DeliverySlot = {
  id: string;
  label: string;
  windowStart: string;
  windowEnd: string;
  remainingCapacity: number;
  available: boolean;
};

export type StoreStatus = {
  storeOpen: boolean;
  nextOpenAt: string | null;
  timezone: string;
};

export type CartLine = { name: string; price: number; quantity: number };

export type CheckoutViewState = {
  isLoaded: boolean;
  cartLines: CartLine[];
  orderId: string | null;

  addresses: Address[];
  selectedAddressId: string | null;
  loadingAddresses: boolean;
  showAddressForm: boolean;
  editingAddressId: string | null;
  draft: AddressDraft;
  savingAddress: boolean;
  locating: boolean;
  defaultMapCenter: { latitude: number; longitude: number } | null;

  quote: QuoteResponse | null;
  loadingQuote: boolean;
  cartTotal: number;

  couponInput: string;
  couponError: string;

  fulfillmentType: 'IMMEDIATE' | 'SCHEDULED';
  deliverySlots: DeliverySlot[];
  selectedSlotId: string | null;
  storeStatus: StoreStatus | null;
  loadingSlots: boolean;

  paymentMethod: 'COD' | 'ONLINE';
  placingOrder: boolean;
  error: string | null;
};

export type CheckoutViewActions = {
  onBack: () => void;
  onBrowse: () => void;
  onBrowseDeals: () => void;
  onViewOrder: () => void;

  onSelectAddress: (id: string) => void;
  onOpenNewAddress: () => void;
  onOpenEditAddress: (address: Address) => void;
  onCloseAddressForm: () => void;
  onSaveAddress: () => void;
  onDeleteAddress: (id: string) => void;
  onUseLiveLocation: () => void;
  onDraftChange: (patch: Partial<AddressDraft>) => void;
  onMapPinChange: (latitude: number, longitude: number) => void;

  onSetFulfillment: (type: 'IMMEDIATE' | 'SCHEDULED') => void;
  onSelectSlot: (id: string) => void;
  onSetPayment: (method: 'COD' | 'ONLINE') => void;

  onCouponInputChange: (value: string) => void;
  onApplyCoupon: () => void;
  onRemoveCoupon: () => void;

  onPlaceOrder: () => void;
};

/* --------------------------------- helpers -------------------------------- */

const DELIVERY_TIME_ZONE = 'Asia/Kolkata';

const money = (amount: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);

const slotTime = (iso: string, timeZone: string | undefined, opts: Intl.DateTimeFormatOptions) =>
  new Date(iso).toLocaleString('en-IN', { ...opts, timeZone: timeZone || DELIVERY_TIME_ZONE });

const formatSlotDay = (iso: string, timeZone?: string) =>
  slotTime(iso, timeZone, { weekday: 'short', day: 'numeric', month: 'short' });

const formatSlotTime = (iso: string, timeZone?: string) =>
  slotTime(iso, timeZone, { hour: 'numeric', minute: '2-digit' });

/* ---------------------------------- view ---------------------------------- */

export default function CheckoutView({ state, actions }: { state: CheckoutViewState; actions: CheckoutViewActions }) {
  const {
    isLoaded,
    cartLines,
    orderId,
    addresses,
    selectedAddressId,
    showAddressForm,
    quote,
    loadingQuote,
    cartTotal,
    fulfillmentType,
    selectedSlotId,
    storeStatus,
    paymentMethod,
    placingOrder,
    error,
  } = state;

  const storeClosed = Boolean(storeStatus && !storeStatus.storeOpen);
  const selectedAddress = addresses.find((address) => address.id === selectedAddressId) || null;

  const billItems = useMemo(() => {
    if (quote) {
      return quote.invoice.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
      }));
    }
    return cartLines.map((line) => ({
      name: line.name,
      quantity: line.quantity,
      unitPrice: line.price,
      lineTotal: line.price * line.quantity,
    }));
  }, [cartLines, quote]);

  const subtotal = quote?.invoice.subtotal ?? cartTotal;
  const grandTotal = quote?.invoice.grandTotal ?? cartTotal;
  const totalUnits = billItems.reduce((sum, item) => sum + item.quantity, 0);

  const stepAddressDone = Boolean(selectedAddressId);
  const stepTimeDone = fulfillmentType === 'IMMEDIATE' && !storeClosed
    ? true
    : fulfillmentType === 'SCHEDULED' && Boolean(selectedSlotId);
  const stepPaymentDone = Boolean(paymentMethod);

  const slotMissing = fulfillmentType === 'SCHEDULED' && !selectedSlotId;
  const canPlace = Boolean(quote && quote.serviceable) && !slotMissing;
  const placeLabel = placingOrder
    ? 'Placing order…'
    : fulfillmentType === 'SCHEDULED'
      ? 'Reserve delivery window'
      : paymentMethod === 'COD'
        ? 'Place COD order'
        : 'Continue to pay';
  const placeHint = !quote || loadingQuote
    ? null
    : !quote.serviceable
      ? 'We cannot deliver to this address yet. Try another saved address.'
      : slotMissing
        ? 'Choose a delivery window to continue.'
        : null;

  if (!isLoaded) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-teal-800" aria-label="Loading checkout" />
      </div>
    );
  }

  if (cartLines.length === 0 && !orderId) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-teal-100 bg-teal-50">
          <ShoppingBag className="h-7 w-7 text-teal-800" />
        </div>
        <h1 className="mt-5 text-2xl font-extrabold tracking-[-0.02em] text-teal-950">Your basket is empty</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-600">
          Browse fresh groceries and daily essentials, then come back here to check out.
        </p>
        <button
          onClick={actions.onBrowse}
          className="mt-7 inline-flex items-center gap-2 rounded-2xl bg-teal-800 px-6 py-3.5 text-sm font-extrabold text-white shadow-[0_10px_30px_rgba(15,23,42,0.14)] transition hover:bg-teal-900"
        >
          Browse products
        </button>
      </div>
    );
  }

  if (orderId) {
    return (
      <div className="mx-auto max-w-lg py-14 text-center">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-full border border-teal-100 bg-teal-50">
          <Check className="aagam-check-pop h-9 w-9 text-teal-700" strokeWidth={2.5} />
        </div>
        <h1 className="mt-6 text-3xl font-extrabold tracking-[-0.02em] text-teal-950">Order placed</h1>
        <p className="mt-2 text-sm font-bold text-slate-500">Order #{orderId.slice(-8).toUpperCase()}</p>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-600">
          Thank you — your order is confirmed. You can follow it live from your orders page.
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <button
            onClick={actions.onViewOrder}
            className="w-full rounded-2xl bg-teal-800 py-4 text-sm font-extrabold text-white shadow-[0_10px_30px_rgba(15,23,42,0.14)] transition hover:bg-teal-900"
          >
            View order
          </button>
          <button
            onClick={actions.onBrowse}
            className="w-full rounded-2xl border border-slate-200 bg-white py-4 text-sm font-extrabold text-slate-800 transition hover:border-teal-300 hover:text-teal-800"
          >
            Continue shopping
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl pb-28 lg:pb-16">
      <header className="mb-8 flex items-center gap-4">
        <button
          onClick={actions.onBack}
          aria-label="Back to shop"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition hover:border-teal-300 hover:text-teal-800"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-extrabold tracking-[-0.02em] text-teal-950 sm:text-2xl">
            <Lock className="h-4 w-4 shrink-0 text-teal-700" aria-hidden />
            Secure checkout
          </h1>
          <p className="mt-0.5 truncate text-xs font-semibold text-slate-500 sm:text-sm">
            {totalUnits} {totalUnits === 1 ? 'item' : 'items'}
            {selectedAddress ? <> · delivering to {selectedAddress.city || selectedAddress.pincode}</> : ' · choose where we deliver'}
          </p>
        </div>
        <div className="ml-auto hidden items-baseline gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 shadow-[0_2px_10px_rgba(15,23,42,0.05)] sm:flex">
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">Total</span>
          <span className="text-lg font-extrabold tabular-nums text-teal-950">{money(grandTotal)}</span>
        </div>
      </header>

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div>
          <ol className="space-y-9">
            <Step n={1} title="Delivery address" done={stepAddressDone}
              doneSummary={selectedAddress ? `${selectedAddress.label || 'Address'} · ${selectedAddress.recipientName} · ${selectedAddress.pincode}` : undefined}
              isLast={false}>
              <AddressStep state={state} actions={actions} />
            </Step>

            <Step n={2} title="Delivery time" done={stepTimeDone}
              doneSummary={fulfillmentType === 'IMMEDIATE' && !storeClosed ? 'Delivering now — fastest available' : undefined}
              isLast={false}>
              <DeliveryTimeStep state={state} actions={actions} />
            </Step>

            <Step n={3} title="Payment" done={stepPaymentDone} isLast>
              <PaymentStep state={state} actions={actions} />
            </Step>
          </ol>

          {error ? (
            <div role="alert" className="mt-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
              <div>
                <p className="text-sm font-bold text-red-800">Something needs your attention</p>
                <p className="mt-1 text-sm leading-5 text-red-700">{error}</p>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="lg:sticky lg:top-4">
          <OrderSummary
            state={state}
            actions={actions}
            billItems={billItems}
            subtotal={subtotal}
            grandTotal={grandTotal}
            totalUnits={totalUnits}
            canPlace={canPlace}
            placeLabel={placeLabel}
            placeHint={placeHint}
            slotMissing={slotMissing}
          />
        </aside>
      </div>

      <MobileActionBar grandTotal={grandTotal} canPlace={canPlace} placeLabel={placeLabel} placingOrder={placingOrder} onPlaceOrder={actions.onPlaceOrder} />

      {showAddressForm ? (
        <AddressFormModal state={state} actions={actions} />
      ) : null}
    </div>
  );
}

/* ---------------------------------- steps --------------------------------- */

function Step({ n, title, done, doneSummary, isLast, children }: {
  n: number;
  title: string;
  done: boolean;
  doneSummary?: string;
  isLast: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="relative pl-14">
      {!isLast ? <span aria-hidden className="absolute left-[17px] top-11 bottom-2 w-px bg-slate-200" /> : null}
      {done ? (
        <span
          aria-hidden
          className="absolute left-0 top-0 grid h-9 w-9 place-items-center rounded-full border border-teal-700 bg-teal-700 text-white"
        >
          <Check key={`done-${n}`} className="aagam-check-pop h-5 w-5" strokeWidth={3} />
        </span>
      ) : (
        <span
          aria-hidden
          className="absolute left-0 top-0 grid h-9 w-9 place-items-center rounded-full border border-slate-300 bg-white text-sm font-extrabold text-slate-500"
        >
          {n}
        </span>
      )}
      <div className="flex min-h-9 flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-base font-extrabold tracking-[-0.01em] text-teal-950 sm:text-lg">{title}</h2>
        {done && doneSummary ? <p className="text-xs font-bold text-teal-700 sm:text-sm">{doneSummary}</p> : null}
      </div>
      <div className="mt-4">{children}</div>
    </li>
  );
}

function AddressStep({ state, actions }: { state: CheckoutViewState; actions: CheckoutViewActions }) {
  const { addresses, selectedAddressId, loadingAddresses } = state;
  return (
    <div role="group" aria-label="Choose a delivery address">
      {loadingAddresses ? (
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading saved addresses…
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {addresses.map((address) => {
            const selected = address.id === selectedAddressId;
            return (
              <div
                key={address.id}
                className={`relative rounded-2xl border p-4 transition ${
                  selected ? 'border-teal-600 bg-teal-50/50' : 'border-slate-200 bg-white hover:border-teal-300'
                }`}
              >
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => actions.onSelectAddress(address.id)}
                  className="block w-full text-left"
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full border border-teal-100 bg-teal-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.08em] text-teal-800">
                        {address.label || 'Address'}
                      </span>
                      {address.isDefault ? (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">Default</span>
                      ) : null}
                    </span>
                    <RadioDot selected={selected} />
                  </span>
                  <span className="mt-2 block text-sm font-extrabold text-slate-900">{address.recipientName}</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-600">
                    {address.line1}
                    {address.line2 ? `, ${address.line2}` : ''}, {address.city} — {address.pincode}
                  </span>
                  <span className="mt-1.5 flex items-center gap-1 text-xs font-bold text-slate-500">
                    <PhoneGlyph className="h-3 w-3" />
                    {address.phoneE164}
                  </span>
                </button>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => actions.onOpenEditAddress(address)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-extrabold text-slate-600 transition hover:border-teal-300 hover:text-teal-800"
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                  <button
                    onClick={() => actions.onDeleteAddress(address.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-100 bg-white px-2.5 py-1.5 text-[11px] font-extrabold text-red-600 transition hover:border-red-300 hover:bg-red-50"
                  >
                    <Trash2 className="h-3 w-3" /> Delete
                  </button>
                </div>
              </div>
            );
          })}

          <button
            type="button"
            onClick={actions.onOpenNewAddress}
            className="flex min-h-[7rem] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-white/60 p-4 text-slate-500 transition hover:border-teal-400 hover:text-teal-800"
          >
            <Plus className="h-5 w-5" />
            <span className="text-sm font-extrabold">Add new address</span>
            <span className="text-xs font-semibold">Pin it on the map for accurate delivery</span>
          </button>
        </div>
      )}
    </div>
  );
}

function DeliveryTimeStep({ state, actions }: { state: CheckoutViewState; actions: CheckoutViewActions }) {
  const { storeStatus, fulfillmentType, deliverySlots, selectedSlotId, loadingSlots } = state;
  const storeClosed = Boolean(storeStatus && !storeStatus.storeOpen);
  const availableSlots = deliverySlots.filter((slot) => slot.available);

  return (
    <div role="group" aria-label="Choose a delivery time">
      {storeClosed ? (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div>
            <p className="text-sm font-extrabold text-amber-900">The store is closed right now</p>
            <p className="mt-1 text-xs font-semibold leading-5 text-amber-800">
              {storeStatus?.nextOpenAt ? (
                <>
                  You can still pre-order — delivery starts from{' '}
                  <span className="font-extrabold">
                    {new Date(storeStatus.nextOpenAt).toLocaleString('en-IN', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      hour: 'numeric',
                      minute: '2-digit',
                      timeZone: storeStatus.timezone,
                    })}
                  </span>
                  .
                </>
              ) : (
                'You can still pre-order for the next open window.'
              )}
            </p>
          </div>
        </div>
      ) : null}

      <div className={`grid gap-3 ${storeClosed ? 'grid-cols-1 sm:max-w-md' : 'grid-cols-2'}`}>
        {!storeClosed ? (
          <OptionTile
            selected={fulfillmentType === 'IMMEDIATE'}
            onClick={() => actions.onSetFulfillment('IMMEDIATE')}
            icon={<Zap className="h-5 w-5 text-teal-700" />}
            title="Deliver now"
            subtitle="Fastest available delivery"
          />
        ) : null}
        <OptionTile
          selected={fulfillmentType === 'SCHEDULED'}
          onClick={() => actions.onSetFulfillment('SCHEDULED')}
          icon={<CalendarDays className="h-5 w-5 text-teal-700" />}
          title={storeClosed ? 'Pre-order delivery' : 'Schedule delivery'}
          subtitle="Reserve up to 7 days ahead"
        />
      </div>

      {fulfillmentType === 'SCHEDULED' ? (
        <div className="mt-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-slate-500">Available windows</p>
            {loadingSlots ? <Loader2 className="h-4 w-4 animate-spin text-teal-700" aria-label="Loading delivery windows" /> : null}
          </div>
          <div className="grid max-h-72 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
            {availableSlots.map((slot) => {
              const selected = selectedSlotId === slot.id;
              return (
                <button
                  type="button"
                  key={slot.id}
                  aria-pressed={selected}
                  onClick={() => actions.onSelectSlot(slot.id)}
                  className={`rounded-xl border p-3 text-left transition ${
                    selected ? 'border-teal-600 bg-teal-50/50' : 'border-slate-200 bg-white hover:border-teal-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-extrabold text-slate-900">{formatSlotDay(slot.windowStart, storeStatus?.timezone)}</p>
                      <p className="mt-0.5 text-xs font-bold text-teal-700">
                        {slot.label} · {formatSlotTime(slot.windowStart, storeStatus?.timezone)}–{formatSlotTime(slot.windowEnd, storeStatus?.timezone)}
                      </p>
                    </div>
                    <RadioDot selected={selected} />
                  </div>
                  <p className={`mt-2 text-[11px] font-bold ${slot.remainingCapacity <= 5 ? 'text-amber-700' : 'text-slate-500'}`}>
                    {slot.remainingCapacity <= 5 ? `Only ${slot.remainingCapacity} left in this window` : 'Available'}
                  </p>
                </button>
              );
            })}
          </div>
          {!loadingSlots && availableSlots.length === 0 ? (
            <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
              No scheduled windows are open for this address yet. Try “Deliver now” or check back soon.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PaymentStep({ state, actions }: { state: CheckoutViewState; actions: CheckoutViewActions }) {
  const { paymentMethod } = state;
  return (
    <div role="group" aria-label="Choose a payment method" className="grid grid-cols-2 gap-3">
      <OptionTile
        selected={paymentMethod === 'COD'}
        onClick={() => actions.onSetPayment('COD')}
        icon={<Banknote className="h-5 w-5 text-teal-700" />}
        title="Cash on delivery"
        subtitle="Pay when your order arrives"
      />
      <OptionTile
        selected={paymentMethod === 'ONLINE'}
        onClick={() => actions.onSetPayment('ONLINE')}
        icon={<CreditCard className="h-5 w-5 text-teal-700" />}
        title="Pay online"
        subtitle="Pay securely before delivery"
      />
    </div>
  );
}

function OptionTile({ selected, onClick, icon, title, subtitle }: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition ${
        selected ? 'border-teal-600 bg-teal-50/50' : 'border-slate-200 bg-white hover:border-teal-300'
      }`}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-teal-100 bg-teal-50">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="text-sm font-extrabold text-slate-900">{title}</span>
          <RadioDot selected={selected} />
        </span>
        <span className="mt-0.5 block text-xs font-semibold leading-5 text-slate-500">{subtitle}</span>
      </span>
    </button>
  );
}

function RadioDot({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden
      className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition-colors ${
        selected ? 'border-teal-700' : 'border-slate-300'
      }`}
    >
      {selected ? <span className="h-2.5 w-2.5 rounded-full bg-teal-700" /> : null}
    </span>
  );
}

function PhoneGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

/* ------------------------------- order summary ----------------------------- */

function OrderSummary({ state, actions, billItems, subtotal, grandTotal, totalUnits, canPlace, placeLabel, placeHint, slotMissing }: {
  state: CheckoutViewState;
  actions: CheckoutViewActions;
  billItems: Array<{ name: string; quantity: number; unitPrice: number; lineTotal: number }>;
  subtotal: number;
  grandTotal: number;
  totalUnits: number;
  canPlace: boolean;
  placeLabel: string;
  placeHint: string | null;
  slotMissing: boolean;
}) {
  const { quote, loadingQuote, cartLines, selectedAddressId, addresses, couponInput, couponError, placingOrder } = state;
  const couponInputId = useId();
  const showSkeleton = loadingQuote && !quote && cartLines.length > 0;

  const pricing = quote?.deliveryPricing || null;
  const firstOrderFree = Boolean(pricing?.waivedByFirstOrder);
  const freeMinimum = pricing ? pricing.freeDeliveryMinimumPaise / 100 : null;
  const freeRemaining = freeMinimum != null ? Math.max(0, freeMinimum - subtotal) : null;
  const freeUnlocked = firstOrderFree || (freeRemaining != null && freeRemaining === 0);
  const meterProgress = freeMinimum != null && freeMinimum > 0 ? Math.min(100, (subtotal / freeMinimum) * 100) : 0;

  const selectedAddress = addresses.find((address) => address.id === selectedAddressId) || null;
  const discount = quote?.invoice.discountAmount ?? 0;
  const deliveryFee = quote?.invoice.deliveryFee ?? 0;
  const tax = quote?.invoice.taxAmount ?? 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-[0_10px_34px_rgba(15,23,42,0.07)]">
      <div className="border-b border-slate-100 px-5 py-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-base font-extrabold tracking-[-0.01em] text-teal-950">Order summary</h2>
          <span className="text-xs font-bold text-slate-500">{totalUnits} {totalUnits === 1 ? 'item' : 'items'}</span>
        </div>
        {quote?.store?.name ? (
          <p className="mt-0.5 text-xs font-bold text-teal-700">
            From {quote.store.name}
            {quote.distanceKm != null ? ` · ${quote.distanceKm.toFixed(1)} km away` : ''}
          </p>
        ) : null}
      </div>

      <div className="px-5 py-4">
        {showSkeleton ? (
          <div className="space-y-3" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex justify-between">
                <div className="h-4 w-32 animate-pulse rounded bg-slate-100" />
                <div className="h-4 w-16 animate-pulse rounded bg-slate-100" />
              </div>
            ))}
            <p className="pt-1 text-xs font-semibold text-slate-500">Calculating your bill for this address…</p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {billItems.map((item, index) => (
              <li key={index} className="flex items-start justify-between gap-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-slate-800">{item.name}</p>
                  <p className="mt-0.5 text-xs tabular-nums text-slate-500">{item.quantity} × {money(item.unitPrice)}</p>
                </div>
                <p className="shrink-0 font-extrabold tabular-nums text-slate-950">{money(item.lineTotal)}</p>
              </li>
            ))}
          </ul>
        )}

        <div className="my-4 border-t border-dashed border-slate-200" aria-hidden />

        {firstOrderFree ? (
          <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3">
            <Tag className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
            <div>
              <p className="text-xs font-extrabold text-emerald-800">First order — delivery is free</p>
              <p className="mt-0.5 text-[11px] font-semibold text-emerald-800/80">Welcome to Aagaam. The delivery fee is on us for this order.</p>
            </div>
          </div>
        ) : freeMinimum != null && !freeUnlocked ? (
          <div className="mb-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs font-bold text-amber-800">Add {money(freeRemaining ?? 0)} more for free delivery</p>
              <p className="text-[11px] font-bold text-slate-500 tabular-nums">Free over {money(freeMinimum)}</p>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(meterProgress)} aria-label="Progress towards free delivery">
              <div className="h-full rounded-full bg-teal-600 transition-[width] duration-500" style={{ width: `${meterProgress}%` }} />
            </div>
          </div>
        ) : freeUnlocked && freeMinimum != null ? (
          <p className="mb-4 flex items-center gap-1.5 text-xs font-extrabold text-emerald-700"><Check className="h-3.5 w-3.5" /> Free delivery unlocked on this order</p>
        ) : null}

        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-500">Subtotal</span>
            <span className="font-extrabold tabular-nums text-slate-950">{money(subtotal)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-semibold text-slate-500">
              <Truck className="h-3.5 w-3.5" /> Delivery fee
            </span>
            <span className={`font-extrabold tabular-nums ${deliveryFee === 0 ? 'text-emerald-700' : 'text-slate-950'}`}>
              {deliveryFee === 0 ? 'FREE' : money(deliveryFee)}
            </span>
          </div>
          {discount > 0 ? (
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-semibold text-emerald-700">
                <Tag className="h-3.5 w-3.5" /> Discount
              </span>
              <span className="font-extrabold tabular-nums text-emerald-700">−{money(discount)}</span>
            </div>
          ) : null}
          {tax > 0 ? (
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-500">Tax</span>
              <span className="font-extrabold tabular-nums text-slate-950">{money(tax)}</span>
            </div>
          ) : null}
        </div>

        <div className="my-4 border-t border-slate-200" aria-hidden />

        <div data-testid="checkout-coupon">
          {quote?.appliedCoupon ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <Tag className="h-4 w-4 shrink-0 text-emerald-700" />
                <div className="min-w-0">
                  <p className="truncate text-xs font-extrabold text-emerald-800">{quote.appliedCoupon.code} applied</p>
                  <p className="text-xs font-bold tabular-nums text-emerald-700">You save {money(quote.appliedCoupon.discountAmount)}</p>
                </div>
              </div>
              <button onClick={actions.onRemoveCoupon} className="shrink-0 rounded-lg px-2 py-1 text-xs font-extrabold text-slate-600 underline-offset-2 transition hover:text-red-600 hover:underline">
                Remove
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor={couponInputId} className="text-xs font-extrabold uppercase tracking-[0.08em] text-slate-500">Coupon</label>
                <button onClick={actions.onBrowseDeals} className="text-xs font-extrabold text-teal-700 underline-offset-2 transition hover:text-teal-900 hover:underline">
                  Browse deals
                </button>
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  id={couponInputId}
                  value={couponInput}
                  onChange={(event) => actions.onCouponInputChange(event.target.value.toUpperCase())}
                  onKeyDown={(event) => event.key === 'Enter' && actions.onApplyCoupon()}
                  placeholder="Enter code"
                  autoComplete="off"
                  spellCheck={false}
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-extrabold uppercase tracking-wide text-slate-900 caret-teal-700 outline-none transition placeholder:font-semibold placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-500 focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
                />
                <button
                  onClick={actions.onApplyCoupon}
                  disabled={loadingQuote}
                  className="shrink-0 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-extrabold text-white transition hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Apply
                </button>
              </div>
              {couponError ? <p role="alert" className="mt-2 text-xs font-bold text-red-600">{couponError}</p> : null}
            </>
          )}
        </div>

        <div className="my-4 border-t border-dashed border-slate-200" aria-hidden />

        <div className="flex items-center justify-between rounded-2xl bg-teal-950 px-4 py-3.5">
          <span className="text-sm font-extrabold text-white">Total</span>
          <span className="text-xl font-extrabold tabular-nums text-white">{money(grandTotal)}</span>
        </div>

        <button
          onClick={actions.onPlaceOrder}
          disabled={!canPlace || placingOrder}
          className="mt-4 hidden w-full items-center justify-center gap-2 rounded-2xl bg-teal-800 py-4 text-sm font-extrabold text-white shadow-[0_10px_30px_rgba(15,23,42,0.16)] transition hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none lg:flex"
        >
          {placingOrder ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
          {placeLabel}
        </button>
        {placeHint ? (
          <p className="mt-2 hidden text-center text-xs font-bold text-amber-800 lg:block">{placeHint}</p>
        ) : null}

        <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
          {selectedAddress ? (
            <p className="flex items-start gap-1.5 text-xs font-semibold leading-5 text-slate-500">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-700" />
              <span>
                Delivering to <span className="font-extrabold text-slate-800">{selectedAddress.recipientName}</span>
                {selectedAddress.label ? <span className="font-bold text-slate-500"> · {selectedAddress.label}</span> : null}
              </span>
            </p>
          ) : null}
          <p className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5 text-teal-700" /> Secure checkout
            <span aria-hidden className="text-slate-300">·</span>
            <Truck className="h-3.5 w-3.5 text-teal-700" /> Live tracking
            <span aria-hidden className="text-slate-300">·</span>
            <ScanLine className="h-3.5 w-3.5 text-teal-700" /> OTP-verified handover
          </p>
        </div>
      </div>
    </div>
  );
}

function MobileActionBar({ grandTotal, canPlace, placeLabel, placingOrder, onPlaceOrder }: {
  grandTotal: number;
  canPlace: boolean;
  placeLabel: string;
  placingOrder: boolean;
  onPlaceOrder: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pl-4 pr-4 pt-3 backdrop-blur lg:hidden">
      <div className="mx-auto flex max-w-6xl items-center gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">Total</p>
          <p className="text-lg font-extrabold leading-tight tabular-nums text-teal-950">{money(grandTotal)}</p>
        </div>
        <button
          onClick={onPlaceOrder}
          disabled={!canPlace || placingOrder}
          className="ml-auto flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-teal-800 px-5 text-sm font-extrabold text-white shadow-[0_8px_24px_rgba(15,23,42,0.18)] transition hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
        >
          {placingOrder ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
          {placeLabel}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------ address modal ------------------------------ */

function AddressFormModal({ state, actions }: { state: CheckoutViewState; actions: CheckoutViewActions }) {
  const { draft, savingAddress, locating, editingAddressId, defaultMapCenter } = state;
  const titleId = useId();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-100 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.35)]"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur">
          <div>
            <h2 id={titleId} className="text-lg font-extrabold tracking-[-0.01em] text-teal-950">
              {editingAddressId ? 'Edit address' : 'Add a new address'}
            </h2>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">Pin your door on the map or fill in the details below.</p>
          </div>
          <button
            onClick={actions.onCloseAddressForm}
            aria-label="Close address form"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-4 px-5 py-5">
          <div className="flex justify-end">
            <button
              onClick={actions.onUseLiveLocation}
              disabled={locating}
              className="inline-flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3.5 py-2 text-xs font-extrabold text-teal-800 transition hover:border-teal-300 hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
              {locating ? 'Locating…' : 'Use my live location'}
            </button>
          </div>

          {draft.latitude != null && draft.longitude != null ? (
            <CustomerLocationPicker
              latitude={draft.latitude}
              longitude={draft.longitude}
              onChange={actions.onMapPinChange}
            />
          ) : (
            <div className="rounded-2xl border-2 border-dashed border-teal-200 bg-teal-50/40 p-6 text-center">
              <p className="text-sm font-bold text-slate-600">Pin your location on the map or use your live location above.</p>
              {defaultMapCenter ? (
                <button
                  onClick={() => actions.onMapPinChange(defaultMapCenter.latitude, defaultMapCenter.longitude)}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl border border-teal-300 bg-white px-3.5 py-2 text-xs font-extrabold text-teal-800 transition hover:border-teal-400"
                >
                  <MapPin className="h-4 w-4" /> Open the map
                </button>
              ) : null}
            </div>
          )}

          <div className="grid gap-3.5 md:grid-cols-2">
            <Field label="Label" value={draft.label} onChange={(value) => actions.onDraftChange({ label: value })} placeholder="Home, Work, etc." autoComplete="off" />
            <Field label="Recipient name" value={draft.recipientName} onChange={(value) => actions.onDraftChange({ recipientName: value })} placeholder="Who is this for?" autoComplete="name" />
            <Field label="Phone" value={draft.phoneE164} onChange={(value) => actions.onDraftChange({ phoneE164: value })} placeholder="10-digit mobile number" type="tel" inputMode="tel" autoComplete="tel" />
            <Field label="Pincode" value={draft.pincode} onChange={(value) => actions.onDraftChange({ pincode: value })} placeholder="6-digit pincode" inputMode="numeric" autoComplete="postal-code" />
            <Field label="House / street" value={draft.line1} onChange={(value) => actions.onDraftChange({ line1: value })} placeholder="Flat no, building, street" className="md:col-span-2" autoComplete="address-line1" />
            <Field label="Area / locality" value={draft.line2} onChange={(value) => actions.onDraftChange({ line2: value })} placeholder="Neighbourhood, colony" className="md:col-span-2" autoComplete="address-line2" />
            <Field label="Nearby landmark" value={draft.landmark} onChange={(value) => actions.onDraftChange({ landmark: value })} placeholder="Near temple, park, etc." />
            <Field label="Note for rider" value={draft.instructions} onChange={(value) => actions.onDraftChange({ instructions: value })} placeholder="Gate code, floor, etc." />
            <Field label="City" value={draft.city} onChange={(value) => actions.onDraftChange({ city: value })} autoComplete="address-level2" />
            <Field label="State" value={draft.state} onChange={(value) => actions.onDraftChange({ state: value })} autoComplete="address-level1" />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              onClick={actions.onCloseAddressForm}
              className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-extrabold text-slate-700 transition hover:border-slate-300"
            >
              Cancel
            </button>
            <button
              onClick={actions.onSaveAddress}
              disabled={savingAddress}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-teal-800 px-5 py-3 text-sm font-extrabold text-white shadow-[0_8px_24px_rgba(15,23,42,0.14)] transition hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              {savingAddress ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editingAddressId ? 'Update address' : 'Save address'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, className = '', type = 'text', inputMode, autoComplete }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  type?: string;
  inputMode?: 'text' | 'tel' | 'numeric' | 'email' | 'decimal';
  autoComplete?: string;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className={`block ${className}`}>
      <span className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-[0.08em] text-slate-500">{label}</span>
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-900 caret-teal-700 outline-none transition placeholder:font-normal placeholder:text-slate-500 focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
      />
    </label>
  );
}
