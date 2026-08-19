'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { apiClient } from '@aagam/utils';
import {
  ArrowLeft,
  BadgePercent,
  Banknote,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  Edit2,
  Loader2,
  MapPin,
  Phone,
  ShieldCheck,
  ShoppingBag,
  Trash2,
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import BillDetailsCard from '@/components/customer/BillDetailsCard';
import { useToast } from '@/components/ToastProvider';
import { useCart } from '@/hooks/useCart';
import { formatINR } from '@/lib/currency';

const CustomerLocationPicker = dynamic(
  () => import('@/components/customer/CustomerLocationPicker'),
  { ssr: false },
);

type Address = {
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
};

type LocalityOption = {
  id: string;
  name: string;
  aliases: string[];
  city: string;
  state: string;
  pincode: string;
  latitude: number | null;
  longitude: number | null;
};

type QuoteResponse = {
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

type DeliverySlot = {
  id: string;
  label: string;
  windowStart: string;
  windowEnd: string;
  remainingCapacity: number;
  available: boolean;
};

type StoreStatus = {
  storeOpen: boolean;
  nextOpenAt: string | null;
  timezone: string;
};

const DELIVERY_TIME_ZONE = 'Asia/Kolkata';

const emptyDraft = () => ({
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
  latitude: null as number | null,
  longitude: null as number | null,
  instructions: '',
  isDefault: true,
});

export default function CheckoutPage() {
  const router = useRouter();
  const toast = useToast();
  const { cart, clearCart, totalPrice, isLoaded } = useCart();
  const itemsPayload = useMemo(
    () => cart.map((item) => ({ productId: item.id, quantity: item.quantity })),
    [cart],
  );

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [loadingAddresses, setLoadingAddresses] = useState(true);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [savingAddress, setSavingAddress] = useState(false);
  const [locating, setLocating] = useState(false);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [appliedCouponCode, setAppliedCouponCode] = useState('');
  const [couponError, setCouponError] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'ONLINE'>('COD');
  const [fulfillmentType, setFulfillmentType] = useState<'IMMEDIATE' | 'SCHEDULED'>('IMMEDIATE');
  const [deliverySlots, setDeliverySlots] = useState<DeliverySlot[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [storeStatus, setStoreStatus] = useState<StoreStatus | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const idemKeyRef = useRef<string | null>(null);
  const [defaultMapCenter, setDefaultMapCenter] = useState<{ latitude: number; longitude: number } | null>(null);
  const [localities, setLocalities] = useState<LocalityOption[]>([]);
  const [localitiesLoading, setLocalitiesLoading] = useState(false);
  const [selectedLocalityId, setSelectedLocalityId] = useState('');

  useEffect(() => {
    let active = true;
    setLocalitiesLoading(true);
    apiClient
      .get('/localities')
      .then((response) => {
        if (active) setLocalities(Array.isArray(response.data) ? response.data : []);
      })
      .catch(() => {
        // Manual entry still works; the locality picker is an optional convenience.
      })
      .finally(() => active && setLocalitiesLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const applyLocality = useCallback((localityId: string) => {
    setSelectedLocalityId(localityId);
    const locality = localities.find((entry) => entry.id === localityId);
    if (!locality) return;
    setDraft((current) => ({
      ...current,
      city: locality.city,
      pincode: locality.pincode,
      state: locality.state,
      line2: current.line2 || locality.name,
      latitude: locality.latitude ?? current.latitude,
      longitude: locality.longitude ?? current.longitude,
    }));
  }, [localities]);

  const filteredLocalities = useMemo(() => {
    const pincodeFilter = /^\d{6}$/.test(draft.pincode.trim()) ? draft.pincode.trim() : null;
    const cityFilter = draft.city.trim().toLowerCase();
    const cityOptions: Array<{ city: string; items: LocalityOption[] }> = [];
    for (const entry of localities) {
      if (pincodeFilter && entry.pincode !== pincodeFilter) continue;
      if (cityFilter && !entry.city.toLowerCase().includes(cityFilter)) continue;
      const group = cityOptions.find((item) => item.city === entry.city);
      if (group) group.items.push(entry);
      else cityOptions.push({ city: entry.city, items: [entry] });
    }
    return cityOptions;
  }, [draft.pincode, draft.city, localities]);

  useEffect(() => {
    let active = true;
    apiClient
      .get('/stores/delivery-zones')
      .then((response) => {
        if (!active) return;
        const zones = Array.isArray(response.data) ? response.data : [];
        const zone = zones.find(
          (entry: any) =>
            entry.isActive !== false &&
            typeof entry.centerLatitude === 'number' &&
            typeof entry.centerLongitude === 'number',
        );
        if (zone) setDefaultMapCenter({ latitude: zone.centerLatitude, longitude: zone.centerLongitude });
      })
      .catch(() => {
        // Optional fallback only; the address can still be saved without a map pin.
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedAddressId || orderId) {
      setDeliverySlots([]);
      setSelectedSlotId(null);
      setStoreStatus(null);
      return;
    }
    let active = true;
    setLoadingSlots(true);
    apiClient.get('/checkout/delivery-slots', { params: { addressId: selectedAddressId } })
      .then((response) => {
        if (!active) return;
        const slots = (response.data?.slots || []) as DeliverySlot[];
        setDeliverySlots(slots);
        setSelectedSlotId((current) => current && slots.some((slot) => slot.id === current) ? current : null);
        setStoreStatus({
          storeOpen: response.data?.storeOpen !== false,
          nextOpenAt: response.data?.nextOpenAt ?? null,
          timezone: response.data?.timezone || DELIVERY_TIME_ZONE,
        });
      })
      .catch((cause) => active && setError(cause?.response?.data?.message || 'Could not load delivery windows.'))
      .finally(() => active && setLoadingSlots(false));
    return () => { active = false; };
  }, [orderId, selectedAddressId]);

  useEffect(() => {
    if (storeStatus && !storeStatus.storeOpen) {
      setFulfillmentType('SCHEDULED');
    }
  }, [storeStatus]);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('coupon');
    const saved = sessionStorage.getItem('aagam_coupon_code');
    const initial = String(fromUrl || saved || '').trim().toUpperCase();
    if (initial) {
      setCouponInput(initial);
      setAppliedCouponCode(initial);
    }
  }, []);

  useEffect(() => {
    const loadAddresses = async () => {
      try {
        const response = await apiClient.get('/customer/addresses');
        const list = Array.isArray(response.data) ? (response.data as Address[]) : [];
        setAddresses(list);
        setSelectedAddressId(list.find((address) => address.isDefault)?.id || list[0]?.id || null);
      } catch (cause: any) {
        setError(cause?.response?.data?.message || cause?.message || 'Failed to load addresses.');
      } finally {
        setLoadingAddresses(false);
      }
    };
    void loadAddresses();
  }, []);

  useEffect(() => {
    if (!selectedAddressId || itemsPayload.length === 0 || orderId) return;
    let active = true;
    const loadQuote = async () => {
      setLoadingQuote(true);
      setError(null);
      if (appliedCouponCode) setCouponError('');
      try {
        const response = await apiClient.post('/checkout/quote', {
          items: itemsPayload,
          addressId: selectedAddressId,
          couponCode: appliedCouponCode || undefined,
        });
        if (!active) return;
        setQuote(response.data as QuoteResponse);
        const code = response.data?.appliedCoupon?.code;
        if (code) {
          setCouponInput(code);
          sessionStorage.setItem('aagam_coupon_code', code);
        }
      } catch (cause: any) {
        if (!active) return;
        const message = cause?.response?.data?.message || cause?.message || 'Failed to calculate invoice.';
        if (appliedCouponCode) {
          setCouponError(message);
          setAppliedCouponCode('');
          sessionStorage.removeItem('aagam_coupon_code');
        } else {
          setQuote(null);
          setError(message);
        }
      } finally {
        if (active) setLoadingQuote(false);
      }
    };
    void loadQuote();
    return () => {
      active = false;
    };
  }, [appliedCouponCode, itemsPayload, orderId, selectedAddressId]);

  const updateCoordinates = useCallback(async (latitude: number, longitude: number) => {
    setDraft((current) => ({ ...current, latitude, longitude }));
    try {
      const response = await apiClient.get('/geo/reverse', { params: { lat: latitude, lng: longitude } });
      const address = response.data?.address;
      if (response.data?.ok && address) {
        setDraft((current) => ({
          ...current,
          line1: address.line1 || current.line1,
          landmark: address.landmark || current.landmark,
          city: address.city || current.city,
          state: address.state || current.state,
          pincode: address.pincode || current.pincode,
          country: address.country || current.country,
        }));
      }
    } catch {
      // Coordinates remain usable even when reverse geocoding is unavailable.
    }
  }, []);

  const useCurrentLocation = () => {
    setError(null);
    if (!navigator.geolocation) {
      setError('Geolocation is not available in this browser.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void updateCoordinates(position.coords.latitude, position.coords.longitude).finally(() => setLocating(false));
      },
      (cause) => {
        setError(cause.message || 'Failed to get your current location.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    );
  };

  const openNewAddress = () => {
    setEditingAddressId(null);
    setSelectedLocalityId('');
    setDraft(emptyDraft());
    setShowAddressForm(true);
  };

  const openEditAddress = (address: Address) => {
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
      instructions: address.instructions || '',
      isDefault: address.isDefault,
    });
    setShowAddressForm(true);
  };

  const saveAddress = async () => {
    if (!draft.recipientName.trim() || !draft.phoneE164.trim() || !draft.line1.trim() || !draft.pincode.trim()) {
      toast.warning('Recipient, phone, address line, and pincode are required.');
      return;
    }
    setSavingAddress(true);
    setError(null);
    const payload = {
      ...draft,
      label: draft.label.trim() || 'Home',
      recipientName: draft.recipientName.trim(),
      phoneE164: draft.phoneE164.trim(),
      line1: draft.line1.trim(),
      line2: draft.line2.trim() || undefined,
      landmark: draft.landmark.trim() || undefined,
      instructions: draft.instructions.trim() || undefined,
      latitude: draft.latitude ?? undefined,
      longitude: draft.longitude ?? undefined,
      isDefault: addresses.length === 0 ? true : draft.isDefault,
    };
    try {
      const response = editingAddressId
        ? await apiClient.patch(`/customer/addresses/${editingAddressId}`, payload)
        : await apiClient.post('/customer/addresses', payload);
      const saved = response.data as Address;
      setAddresses((current) => {
        const withoutSaved = current.filter((address) => address.id !== saved.id);
        return [saved, ...withoutSaved].map((address) =>
          saved.isDefault && address.id !== saved.id ? { ...address, isDefault: false } : address,
        );
      });
      setSelectedAddressId(saved.id);
      setShowAddressForm(false);
      setEditingAddressId(null);
      setDraft(emptyDraft());
      toast.success(editingAddressId ? 'Delivery address updated.' : 'Delivery address saved.');
    } catch (cause: any) {
      setError(cause?.response?.data?.message || cause?.message || 'Failed to save address.');
    } finally {
      setSavingAddress(false);
    }
  };

  const deleteAddress = async (addressId: string) => {
    if (!window.confirm('Delete this delivery address?')) return;
    try {
      await apiClient.delete(`/customer/addresses/${addressId}`);
      const remaining = addresses.filter((address) => address.id !== addressId);
      setAddresses(remaining);
      if (selectedAddressId === addressId) setSelectedAddressId(remaining[0]?.id || null);
    } catch (cause: any) {
      setError(cause?.response?.data?.message || 'Failed to delete address.');
    }
  };

  const applyCoupon = () => {
    const code = couponInput.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
      setCouponError('Enter a valid coupon code.');
      return;
    }
    setAppliedCouponCode(code);
  };

  const removeCoupon = () => {
    setCouponInput('');
    setAppliedCouponCode('');
    setCouponError('');
    sessionStorage.removeItem('aagam_coupon_code');
  };

  const placeOrder = async () => {
    if (!selectedAddressId || !quote || !quote.serviceable || itemsPayload.length === 0) return;
    const selectedSlot = deliverySlots.find((slot) => slot.id === selectedSlotId);
    if (fulfillmentType === 'SCHEDULED' && !selectedSlot) {
      setError('Choose an available delivery window.');
      return;
    }
    setPlacingOrder(true);
    setError(null);
    try {
      const idempotencyKey =
        idemKeyRef.current || globalThis.crypto?.randomUUID?.() || `checkout-${Date.now()}`;
      idemKeyRef.current = idempotencyKey;
      const response = await apiClient.post(
        '/checkout/place-order',
        {
          items: itemsPayload,
          addressId: selectedAddressId,
          paymentMethod,
          couponCode: appliedCouponCode || undefined,
          deliveryWindowStart: selectedSlot?.windowStart,
          deliveryWindowEnd: selectedSlot?.windowEnd,
        },
        { headers: { 'Idempotency-Key': idempotencyKey } },
      );
      setOrderId(response.data?.id || response.data?.orderId || null);
      sessionStorage.removeItem('aagam_coupon_code');
      clearCart();
    } catch (cause: any) {
      setError(cause?.response?.data?.message || cause?.message || 'Failed to place order.');
    } finally {
      setPlacingOrder(false);
    }
  };

  if (!isLoaded) {
    return (
      <DashboardLayout allowedRole="CUSTOMER">
        <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-teal-700" /></div>
      </DashboardLayout>
    );
  }

  if (cart.length === 0 && !orderId) {
    return (
      <DashboardLayout allowedRole="CUSTOMER">
        <div className="mx-auto max-w-lg py-12 text-center">
          <ShoppingBag className="mx-auto h-12 w-12 text-teal-500" />
          <h2 className="mt-4 text-xl font-black text-slate-950">Your cart is empty</h2>
          <button onClick={() => router.push('/shop')} className="mt-6 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white">Browse products</button>
        </div>
      </DashboardLayout>
    );
  }

  const billItems = quote
    ? quote.invoice.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
      }))
    : cart.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.price,
        lineTotal: item.price * item.quantity,
      }));
  const subtotal = quote?.invoice.subtotal ?? totalPrice;
  const grandTotal = quote?.invoice.grandTotal ?? totalPrice;
  const selectedAddress = addresses.find((address) => address.id === selectedAddressId);

  return (
    <DashboardLayout allowedRole="CUSTOMER">
      <div className="mx-auto max-w-6xl pb-24">
        <div className="mb-6 flex items-center gap-3">
          <button onClick={() => router.push('/shop')} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white"><ArrowLeft className="h-4 w-4" /></button>
          <div>
            <h1 className="text-2xl font-black text-slate-950">Checkout</h1>
            <p className="text-xs font-bold text-slate-500">Confirm delivery point, bill, and payment.</p>
          </div>
          <div className="ml-auto rounded-xl bg-teal-50 px-3 py-2 text-sm font-black text-teal-800">{formatINR(grandTotal)}</div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-teal-100 text-teal-700"><MapPin className="h-5 w-5" /></div>
                  <div><h2 className="font-black text-slate-950">Delivery address</h2><p className="text-xs text-slate-500">Select an address or place the pin precisely.</p></div>
                </div>
                <button onClick={openNewAddress} className="rounded-xl bg-teal-700 px-4 py-2.5 text-xs font-black text-white">Add address</button>
              </div>

              {loadingAddresses ? (
                <div className="mt-5 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading addresses…</div>
              ) : (
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {addresses.map((address) => (
                    <button
                      key={address.id}
                      onClick={() => setSelectedAddressId(address.id)}
                      className={`rounded-2xl border p-4 text-left transition ${address.id === selectedAddressId ? 'border-teal-400 bg-teal-50' : 'border-slate-200 bg-white hover:border-teal-200'}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div><p className="text-xs font-black uppercase text-teal-700">{address.label || 'Address'}{address.isDefault ? ' · Default' : ''}</p><p className="mt-1 font-black text-slate-950">{address.recipientName}</p></div>
                        {address.id === selectedAddressId ? <CheckCircle2 className="h-5 w-5 text-teal-600" /> : null}
                      </div>
                      <p className="mt-2 text-xs leading-5 text-slate-600">{address.line1}, {address.city} - {address.pincode}</p>
                      <p className="mt-2 flex items-center gap-1 text-xs font-bold text-slate-500"><Phone className="h-3 w-3" />{address.phoneE164}</p>
                      <div className="mt-3 flex gap-2" onClick={(event) => event.stopPropagation()}>
                        <button onClick={() => openEditAddress(address)} className="flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-black text-slate-700"><Edit2 className="h-3 w-3" />Edit</button>
                        <button onClick={() => void deleteAddress(address.id)} className="flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] font-black text-red-700"><Trash2 className="h-3 w-3" />Delete</button>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {showAddressForm ? (
                <div className="mt-5 space-y-4 rounded-2xl border border-teal-200 bg-teal-50/40 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-black text-slate-950">{editingAddressId ? 'Edit address' : 'New address'}</h3>
                    <button onClick={useCurrentLocation} disabled={locating} className="flex items-center gap-2 rounded-xl bg-teal-700 px-3 py-2 text-xs font-black text-white disabled:opacity-50">
                      {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                      {locating ? 'Locating…' : 'Use live location'}
                    </button>
                  </div>
                  {draft.latitude != null && draft.longitude != null ? (
                    <CustomerLocationPicker latitude={draft.latitude} longitude={draft.longitude} onChange={(lat, lng) => void updateCoordinates(lat, lng)} />
                  ) : (
                    <div className="rounded-2xl border border-dashed border-teal-300 bg-white p-6 text-center">
                      <p className="text-sm font-bold text-slate-500">You can save this address without a map pin — we will place it on the delivery map from the address text.</p>
                      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                        {defaultMapCenter ? (
                          <button onClick={() => void updateCoordinates(defaultMapCenter.latitude, defaultMapCenter.longitude)} className="flex items-center gap-2 rounded-xl border border-teal-600 px-3 py-2 text-xs font-black text-teal-700">
                            <MapPin className="h-4 w-4" />Set pin on map
                          </button>
                        ) : null}
                      </div>
                      <p className="mt-3 text-[11px] font-semibold text-slate-400">Use live location or set a pin for an exact entrance point.</p>
                    </div>
                  )}
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="block md:col-span-2">
                      <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-500">Locality</span>
                      <select
                        value={selectedLocalityId}
                        onChange={(event) => applyLocality(event.target.value)}
                        disabled={localitiesLoading}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none focus:border-teal-500"
                      >
                        <option value="">{localitiesLoading ? 'Loading localities…' : 'Select your locality (optional)'}</option>
                        {filteredLocalities.map((group) => (
                          <optgroup key={group.city} label={group.city}>
                            {group.items.map((entry) => (
                              <option key={entry.id} value={entry.id}>
                                {entry.name} — {entry.pincode}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      <span className="mt-1 block text-[11px] font-semibold text-slate-400">
                        {filteredLocalities.length === 0
                          ? 'No matching serviceable locality. You can still type the address below.'
                          : 'Pick your village — city, pincode and delivery point are filled automatically.'}
                      </span>
                    </label>
                    <Field label="Label" value={draft.label} onChange={(value) => setDraft((current) => ({ ...current, label: value }))} />
                    <Field label="Recipient name" value={draft.recipientName} onChange={(value) => setDraft((current) => ({ ...current, recipientName: value }))} />
                    <Field label="Phone" value={draft.phoneE164} onChange={(value) => setDraft((current) => ({ ...current, phoneE164: value }))} placeholder="+91XXXXXXXXXX" />
                    <Field label="Pincode" value={draft.pincode} onChange={(value) => setDraft((current) => ({ ...current, pincode: value }))} />
                    <Field label="Address line" value={draft.line1} onChange={(value) => setDraft((current) => ({ ...current, line1: value }))} className="md:col-span-2" />
                    <Field label="City" value={draft.city} onChange={(value) => setDraft((current) => ({ ...current, city: value }))} />
                    <Field label="State" value={draft.state} onChange={(value) => setDraft((current) => ({ ...current, state: value }))} />
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setShowAddressForm(false)} className="rounded-xl bg-white px-4 py-2.5 text-xs font-black text-slate-700">Cancel</button>
                    <button onClick={() => void saveAddress()} disabled={savingAddress} className="flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-2.5 text-xs font-black text-white disabled:opacity-50">{savingAddress ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{editingAddressId ? 'Update address' : 'Save address'}</button>
                  </div>
                </div>
              ) : null}
            </section>

            <section className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
              <div className="bg-gradient-to-r from-slate-950 to-teal-950 p-5 text-white">
                <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white/10"><CalendarDays className="h-5 w-5" /></span><div><h2 className="font-black">Choose delivery time</h2><p className="text-xs font-semibold text-teal-100">{storeStatus && !storeStatus.storeOpen ? 'This store is closed right now — reserve the next open window.' : 'Get it now or reserve a convenient window.'}</p></div></div>
              </div>
              <div className="p-5">
                {storeStatus && !storeStatus.storeOpen ? (
                  <div className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                    <div>
                      <p className="text-sm font-black text-amber-900">Store is closed</p>
                      <p className="mt-1 text-xs font-semibold leading-5 text-amber-800">
                        {storeStatus.nextOpenAt
                          ? <>Instant delivery is paused. Pre-order now for delivery from <span className="font-black">{new Date(storeStatus.nextOpenAt).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: storeStatus.timezone })}</span>.</>
                          : 'Instant delivery is paused. Pre-order for the next open window.'}
                      </p>
                    </div>
                  </div>
                ) : null}
                <div className={`grid gap-3 ${storeStatus && !storeStatus.storeOpen ? 'grid-cols-1' : 'grid-cols-2'}`}>
                  {!(storeStatus && !storeStatus.storeOpen) ? (
                    <button type="button" onClick={() => { setFulfillmentType('IMMEDIATE'); setSelectedSlotId(null); }} className={`rounded-2xl border p-4 text-left transition ${fulfillmentType === 'IMMEDIATE' ? 'border-teal-500 bg-teal-50 ring-2 ring-teal-100' : 'border-slate-200 hover:border-teal-200'}`}><Clock3 className="h-5 w-5 text-teal-700"/><p className="mt-2 text-sm font-black text-slate-950">Deliver now</p><p className="mt-1 text-xs text-slate-500">Fastest available delivery</p></button>
                  ) : null}
                  <button type="button" onClick={() => setFulfillmentType('SCHEDULED')} className={`rounded-2xl border p-4 text-left transition ${fulfillmentType === 'SCHEDULED' ? 'border-teal-500 bg-teal-50 ring-2 ring-teal-100' : 'border-slate-200 hover:border-teal-200'}`}><CalendarDays className="h-5 w-5 text-teal-700"/><p className="mt-2 text-sm font-black text-slate-950">{storeStatus && !storeStatus.storeOpen ? 'Pre-order delivery' : 'Schedule delivery'}</p><p className="mt-1 text-xs text-slate-500">Reserve up to 7 days ahead</p></button>
                </div>
                {fulfillmentType === 'SCHEDULED' ? <div className="mt-5"><div className="mb-3 flex items-center justify-between"><p className="text-xs font-black uppercase tracking-wider text-slate-500">Available windows</p>{loadingSlots ? <Loader2 className="h-4 w-4 animate-spin text-teal-700"/> : null}</div><div className="grid max-h-72 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">{deliverySlots.filter((slot) => slot.available).map((slot) => { const start = new Date(slot.windowStart); const end = new Date(slot.windowEnd); const active = selectedSlotId === slot.id; return <button type="button" key={slot.id} onClick={() => setSelectedSlotId(slot.id)} className={`rounded-2xl border p-3 text-left transition ${active ? 'border-teal-500 bg-teal-50' : 'border-slate-200 hover:border-teal-300'}`}><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-black text-slate-950">{start.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: storeStatus?.timezone || DELIVERY_TIME_ZONE })}</p><p className="mt-1 text-xs font-bold text-teal-700">{slot.label} · {start.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: storeStatus?.timezone || DELIVERY_TIME_ZONE })}–{end.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: storeStatus?.timezone || DELIVERY_TIME_ZONE })}</p></div>{active ? <CheckCircle2 className="h-5 w-5 shrink-0 text-teal-600"/> : null}</div><p className="mt-2 text-[11px] font-semibold text-slate-400">{slot.remainingCapacity <= 5 ? `Only ${slot.remainingCapacity} windows left` : 'Available'}</p></button>; })}</div>{!loadingSlots && deliverySlots.filter((slot) => slot.available).length === 0 ? <p className="rounded-2xl bg-amber-50 p-4 text-sm font-bold text-amber-800">No scheduled windows are available for this address.</p> : null}</div> : null}
              </div>
            </section>

            <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
              <h2 className="font-black text-slate-950">Payment method</h2>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {([
                  ['COD', 'Cash on delivery', Banknote],
                  ['ONLINE', 'Pay online', CreditCard],
                ] as const).map(([method, label, Icon]) => (
                  <button key={method} onClick={() => setPaymentMethod(method)} className={`rounded-2xl border p-4 text-left ${paymentMethod === method ? 'border-teal-400 bg-teal-50' : 'border-slate-200'}`}>
                    <Icon className="h-5 w-5 text-teal-700" /><p className="mt-3 text-sm font-black text-slate-950">{label}</p>
                  </button>
                ))}
              </div>
            </section>

            {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">{error}</div> : null}
          </div>

          <aside className="space-y-5">
            <BillDetailsCard
              items={billItems}
              subtotal={subtotal}
              deliveryFee={quote?.invoice.deliveryFee ?? 0}
              discountAmount={quote?.invoice.discountAmount ?? 0}
              taxAmount={quote?.invoice.taxAmount ?? 0}
              grandTotal={grandTotal}
              storeName={quote?.store?.name}
              distanceKm={quote?.distanceKm}
              deliveryPricing={quote?.deliveryPricing}
              showDeliveryOffer
              loading={loadingQuote && !quote}
            />

            <section data-testid="checkout-coupon" className="rounded-2xl border border-slate-100 bg-white p-5">
              <div className="flex items-center gap-2"><BadgePercent className="h-4 w-4 text-teal-700" /><h3 className="text-sm font-black text-slate-950">Coupon</h3><button onClick={() => router.push('/shop/deals')} className="ml-auto text-xs font-black text-teal-700">Browse deals</button></div>
              {quote?.appliedCoupon ? (
                <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3"><p className="text-xs font-black text-emerald-700">{quote.appliedCoupon.code} applied</p><p className="mt-1 text-sm font-bold text-emerald-950">You save {formatINR(quote.appliedCoupon.discountAmount)}</p><button onClick={removeCoupon} className="mt-3 text-xs font-black text-slate-700">Remove</button></div>
              ) : (
                <div className="mt-3 flex gap-2"><input value={couponInput} onChange={(event) => setCouponInput(event.target.value.toUpperCase())} onKeyDown={(event) => event.key === 'Enter' && applyCoupon()} placeholder="Enter coupon code" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-sm font-bold uppercase" /><button onClick={applyCoupon} disabled={loadingQuote} className="rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">Apply</button></div>
              )}
              {couponError ? <p className="mt-2 text-xs font-bold text-red-600">{couponError}</p> : null}
            </section>

            <section className="rounded-2xl border border-slate-100 bg-white p-5">
              {orderId ? (
                <div className="text-center"><CheckCircle2 className="mx-auto h-12 w-12 text-teal-600" /><h3 className="mt-3 text-lg font-black text-slate-950">Order placed</h3><p className="mt-1 text-xs text-slate-500">#{orderId.slice(-8).toUpperCase()}</p><button onClick={() => router.push('/shop/orders')} className="mt-4 w-full rounded-xl bg-slate-950 py-3 text-sm font-black text-white">View order</button></div>
              ) : (
                <button onClick={() => void placeOrder()} disabled={placingOrder || !quote?.serviceable || (fulfillmentType === 'SCHEDULED' && !selectedSlotId)} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-teal-700 py-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">{placingOrder ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}{placingOrder ? 'Placing order…' : fulfillmentType === 'SCHEDULED' ? 'Reserve delivery window' : paymentMethod === 'COD' ? 'Place COD order' : 'Continue to pay'}</button>
              )}
              {selectedAddress ? <p className="mt-3 text-center text-xs text-slate-500">Deliver to <span className="font-black text-slate-800">{selectedAddress.recipientName}</span></p> : null}
            </section>
          </aside>
        </div>
      </div>
    </DashboardLayout>
  );
}

function Field({ label, value, onChange, placeholder, className = '' }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-500">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none focus:border-teal-500" />
    </label>
  );
}
