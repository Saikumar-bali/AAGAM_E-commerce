'use client';

/**
 * DEV-ONLY design preview for the /shop/checkout trust-first redesign.
 * Mounted at /shop/checkout/preview and disabled in production builds (the route
 * returns notFound). Exists so the redesigned surface can be inspected with
 * realistic mock data without a running backend or a customer session.
 * Safe to delete: production never references it.
 */

import React, { useMemo, useState } from 'react';
import CheckoutView from '@/components/customer/checkout/CheckoutView';
import type { Address, AddressDraft, CheckoutViewActions, DeliverySlot, QuoteResponse } from '@/components/customer/checkout/CheckoutView';

const mockAddresses: Address[] = [
  {
    id: 'addr-1',
    label: 'Home',
    recipientName: 'Suresh Kumar',
    phoneE164: '+919848012345',
    line1: 'Flat 402, Emerald Heights, Road No. 12',
    line2: 'Banjara Hills',
    landmark: 'Opposite KBR park gate 3',
    city: 'Hyderabad',
    state: 'Telangana',
    pincode: '500034',
    country: 'IN',
    latitude: 17.4126,
    longitude: 78.4392,
    instructions: 'Ring the bell twice, lift is on the left.',
    isDefault: true,
  },
  {
    id: 'addr-2',
    label: 'Work',
    recipientName: 'Suresh Kumar',
    phoneE164: '+919848012345',
    line1: 'Level 4, Cyber Towers, HITEC City',
    line2: 'Madhapur',
    city: 'Hyderabad',
    state: 'Telangana',
    pincode: '500081',
    country: 'IN',
    latitude: 17.4483,
    longitude: 78.3915,
    isDefault: false,
  },
  {
    id: 'addr-3',
    label: 'Parents',
    recipientName: 'Lakshmi Devi',
    phoneE164: '+919848098765',
    line1: '12-3/4, Srinivasa Nilayam, Temple Street',
    line2: 'West Marredpally',
    city: 'Hyderabad',
    state: 'Telangana',
    pincode: '500026',
    country: 'IN',
    latitude: 17.4448,
    longitude: 78.4994,
    isDefault: false,
  },
];

const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 3600_000).toISOString();

const mockSlots: DeliverySlot[] = [
  { id: 'slot-1', label: 'Morning', windowStart: hoursFromNow(14), windowEnd: hoursFromNow(16), remainingCapacity: 3, available: true },
  { id: 'slot-2', label: 'Afternoon', windowStart: hoursFromNow(18), windowEnd: hoursFromNow(20), remainingCapacity: 9, available: true },
  { id: 'slot-3', label: 'Evening', windowStart: hoursFromNow(22), windowEnd: hoursFromNow(24), remainingCapacity: 12, available: true },
  { id: 'slot-4', label: 'Morning', windowStart: hoursFromNow(38), windowEnd: hoursFromNow(40), remainingCapacity: 15, available: true },
  { id: 'slot-5', label: 'Afternoon', windowStart: hoursFromNow(42), windowEnd: hoursFromNow(44), remainingCapacity: 2, available: true },
];

const buildQuote = (appliedCoupon: boolean): QuoteResponse => ({
  currency: 'INR',
  serviceable: true,
  distanceKm: 3.2,
  store: { id: 'store-1', name: 'Aagaam Fresh — Banjara Hills' },
  deliveryPricing: {
    serviceable: true,
    ratePaisePerKm: 800,
    freeDeliveryMinimumPaise: 99_900,
    maximumDistanceKm: 12,
    distanceFeePaise: 0,
    waivedByThreshold: true,
    waivedByFirstOrder: false,
    payableFeePaise: 0,
  },
  invoice: {
    items: [
      { productId: 'p1', name: 'Sonamasoori Rice — 5 kg', quantity: 1, unitPrice: 480, lineTotal: 480, inStock: true, availableQty: 20 },
      { productId: 'p2', name: 'Cold-Pressed Groundnut Oil — 1 L', quantity: 2, unitPrice: 285, lineTotal: 570, inStock: true, availableQty: 14 },
      { productId: 'p3', name: 'Free-range Eggs — pack of 12', quantity: 1, unitPrice: 118, lineTotal: 118, inStock: true, availableQty: 30 },
      { productId: 'p4', name: 'Filter Coffee Powder — 500 g', quantity: 1, unitPrice: 262, lineTotal: 262, inStock: true, availableQty: 8 },
      { productId: 'p5', name: 'Atom Banana — 1 dozen', quantity: 2, unitPrice: 64, lineTotal: 128, inStock: true, availableQty: 25 },
    ],
    subtotal: 1558,
    deliveryFee: 0,
    discountAmount: appliedCoupon ? 155.8 : 0,
    taxAmount: 32.4,
    grandTotal: appliedCoupon ? 1434.6 : 1590.4,
  },
  appliedCoupon: appliedCoupon
    ? {
        id: 'coupon-1',
        code: 'FRESH10',
        name: '10% off groceries',
        discountType: 'PERCENTAGE',
        applicationMode: 'SUBTOTAL',
        discountAmount: 155.8,
      }
    : null,
});

const initialDraft = (): AddressDraft => ({
  label: 'Home',
  recipientName: '',
  phoneE164: '',
  line1: '',
  line2: '',
  landmark: '',
  city: '',
  state: '',
  pincode: '',
  country: 'IN',
  latitude: 17.385,
  longitude: 78.4867,
  locationSource: 'MAP_PIN',
  locationAccuracyMetres: null,
  locationCapturedAt: null,
  instructions: '',
  isDefault: true,
});

export default function CheckoutPreview() {
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>('addr-1');
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [draft, setDraft] = useState(initialDraft);
  const [fulfillmentType, setFulfillmentType] = useState<'IMMEDIATE' | 'SCHEDULED'>('IMMEDIATE');
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'ONLINE'>('COD');
  const [couponApplied, setCouponApplied] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [placingOrder, setPlacingOrder] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);

  const quote = useMemo(() => buildQuote(couponApplied), [couponApplied]);

  const actions: CheckoutViewActions = {
    onBack: () => {},
    onBrowse: () => {},
    onBrowseDeals: () => {},
    onViewOrder: () => {},

    onSelectAddress: setSelectedAddressId,
    onOpenNewAddress: () => {
      setEditingAddressId(null);
      setDraft(initialDraft());
      setShowAddressForm(true);
    },
    onOpenEditAddress: (address) => {
      setEditingAddressId(address.id);
      setDraft({
        label: address.label || 'Home',
        recipientName: address.recipientName,
        phoneE164: address.phoneE164,
        line1: address.line1,
        line2: address.line2 || '',
        landmark: address.landmark || '',
        city: address.city,
        state: address.state,
        pincode: address.pincode,
        country: address.country,
        latitude: address.latitude,
        longitude: address.longitude,
        locationSource: address.locationSource || 'GEOCODED',
        locationAccuracyMetres: null,
        locationCapturedAt: null,
        instructions: address.instructions || '',
        isDefault: address.isDefault,
      });
      setShowAddressForm(true);
    },
    onCloseAddressForm: () => setShowAddressForm(false),
    onSaveAddress: () => setShowAddressForm(false),
    onDeleteAddress: () => {},
    onUseLiveLocation: () => {},
    onDraftChange: (patch) => setDraft((current) => ({ ...current, ...patch })),
    onMapPinChange: () => {},

    onSetFulfillment: (type) => {
      if (type === 'IMMEDIATE') {
        setFulfillmentType('IMMEDIATE');
        setSelectedSlotId(null);
        return;
      }
      setFulfillmentType('SCHEDULED');
    },
    onSelectSlot: setSelectedSlotId,
    onSetPayment: setPaymentMethod,

    onCouponInputChange: setCouponInput,
    onApplyCoupon: () => setCouponApplied(couponInput.trim().length >= 3),
    onRemoveCoupon: () => {
      setCouponApplied(false);
      setCouponInput('');
    },

    onPlaceOrder: () => {
      setPlacingOrder(true);
      window.setTimeout(() => {
        setPlacingOrder(false);
        setOrderId('a1b2c3d4e5f6');
      }, 900);
    },
  };

  return (
    <div className="min-h-screen">
      <p className="mx-auto max-w-6xl px-4 pt-4 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
        Dev-only design preview — mock data, no backend
      </p>
      <div className="px-3 py-3 sm:px-5">
        <CheckoutView
          state={{
            isLoaded: true,
            cartLines: quote.invoice.items.map((item) => ({ name: item.name, price: item.unitPrice, quantity: item.quantity })),
            orderId,

            addresses: mockAddresses,
            selectedAddressId,
            loadingAddresses: false,
            showAddressForm,
            editingAddressId,
            draft,
            addressFieldErrors: {},
            savingAddress: false,
            locating: false,
            defaultMapCenter: { latitude: 17.6916, longitude: 83.0037 },

            quote,
            loadingQuote: false,
            cartTotal: quote.invoice.subtotal,

            couponInput,
            couponError: '',

            fulfillmentType,
            deliverySlots: mockSlots,
            selectedSlotId,
            storeStatus: { storeOpen: true, nextOpenAt: null, timezone: 'Asia/Kolkata' },
            loadingSlots: false,

            paymentMethod,
            placingOrder,
            error: null,
          }}
          actions={actions}
        />
      </div>
    </div>
  );
}
