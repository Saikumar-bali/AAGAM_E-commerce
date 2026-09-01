'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@aagam/utils';
import DashboardLayout from '@/components/DashboardLayout';
import { useToast } from '@/components/ToastProvider';
import { useCart } from '@/hooks/useCart';
import CheckoutView from '@/components/customer/checkout/CheckoutView';
import type {
  Address,
  AddressDraft,
  DeliverySlot,
  QuoteResponse,
  StoreStatus,
} from '@/components/customer/checkout/CheckoutView';

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

const DELIVERY_TIME_ZONE = 'Asia/Kolkata';
const DEFAULT_MAP_CENTER = { latitude: 17.385, longitude: 78.4867 };

const emptyDraft = (): AddressDraft => ({
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
  locationSource: 'GEOCODED' as 'LIVE_GPS' | 'MAP_PIN' | 'GEOCODED' | 'LEGACY_UNKNOWN',
  locationAccuracyMetres: null as number | null,
  locationCapturedAt: null as string | null,
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
  // Locality state commented out — replaced by Mapbox geocoding search in CustomerLocationPicker
  // const [localities, setLocalities] = useState<LocalityOption[]>([]);
  // const [localitiesLoading, setLocalitiesLoading] = useState(false);
  // const [localitiesError, setLocalitiesError] = useState(false);
  // const [selectedLocalityId, setSelectedLocalityId] = useState('');

  // Locality loading commented out — replaced by Mapbox geocoding search
  // const loadLocalities = useCallback(async () => {
  //   setLocalitiesLoading(true);
  //   setLocalitiesError(false);
  //   try {
  //     const response = await apiClient.get('/localities');
  //     setLocalities(Array.isArray(response.data) ? response.data : []);
  //   } catch {
  //     setLocalitiesError(true);
  //   } finally {
  //     setLocalitiesLoading(false);
  //   }
  // }, []);

  // useEffect(() => { void loadLocalities(); }, [loadLocalities]);

  // Locality apply commented out — replaced by Mapbox geocoding search
  // const applyLocality = useCallback((localityId: string) => {
  //   setSelectedLocalityId(localityId);
  //   const locality = localities.find((entry) => entry.id === localityId);
  //   if (!locality) return;
  //   setDraft((current) => ({
  //     ...current,
  //     city: locality.city,
  //     pincode: locality.pincode,
  //     state: locality.state,
  //     line2: current.line2 || locality.name,
  //     latitude: locality.latitude ?? current.latitude,
  //     longitude: locality.longitude ?? current.longitude,
  //   }));
  // }, [localities]);

  // const filteredLocalities = useMemo(() => {
  //   const pincodeFilter = /^\d{6}$/.test(draft.pincode.trim()) ? draft.pincode.trim() : null;
  //   const cityRaw = draft.city.trim().replace(/^string:/i, '');
  //   const cityFilter = /^\d{6}$/.test(cityRaw) ? '' : cityRaw.toLowerCase();
  //   const cityOptions: Array<{ city: string; items: LocalityOption[] }> = [];
  //   for (const entry of localities) {
  //     if (pincodeFilter && entry.pincode !== pincodeFilter) continue;
  //     if (cityFilter && !entry.city.toLowerCase().includes(cityFilter)) continue;
  //     const group = cityOptions.find((item) => item.city === entry.city);
  //     if (group) group.items.push(entry);
  //     else cityOptions.push({ city: entry.city, items: [entry] });
  //   }
  //   return cityOptions;
  // }, [draft.pincode, draft.city, localities]);

  // useEffect(() => {
  //   if (!editingAddressId || draft.locationSource !== 'GEOCODED' || selectedLocalityId || localities.length === 0) return;
  //   const matchedLocalities = localities.filter((entry) => entry.city.trim().toLowerCase() === draft.city.trim().toLowerCase() && entry.state.trim().toLowerCase() === draft.state.trim().toLowerCase() && entry.pincode === draft.pincode.trim());
  //   const matchedLocality = matchedLocalities.length === 1 ? matchedLocalities[0] : undefined;
  //   if (matchedLocality) setSelectedLocalityId(matchedLocality.id);
  // }, [editingAddressId, localities]);

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

  const updateCoordinates = useCallback(async (latitude: number, longitude: number, locationSource: 'LIVE_GPS' | 'MAP_PIN', accuracyMetres?: number) => {
    // setSelectedLocalityId(''); // Locality removed
    setDraft((current) => ({
      ...current,
      latitude,
      longitude,
      locationSource,
      locationAccuracyMetres: locationSource === 'LIVE_GPS' ? accuracyMetres ?? null : null,
      locationCapturedAt: locationSource === 'LIVE_GPS' ? new Date().toISOString() : null,
    }));
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
        void updateCoordinates(position.coords.latitude, position.coords.longitude, 'LIVE_GPS', position.coords.accuracy).finally(() => setLocating(false));
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
    // setSelectedLocalityId(''); // Locality removed
    const initial = emptyDraft();
    const center = defaultMapCenter || DEFAULT_MAP_CENTER;
    initial.latitude = center.latitude;
    initial.longitude = center.longitude;
    initial.locationSource = 'MAP_PIN';
    setDraft(initial);
    setShowAddressForm(true);
  };

  const openEditAddress = (address: Address) => {
    setEditingAddressId(address.id);
    // Locality matching commented out — using Mapbox geocoding search
    // setSelectedLocalityId(address.localityId || (() => { const matches = localities.filter((entry) => entry.city.trim().toLowerCase() === address.city.trim().toLowerCase() && entry.state.trim().toLowerCase() === address.state.trim().toLowerCase() && entry.pincode === address.pincode.trim()); return matches.length === 1 ? matches[0]?.id : ''; })() || '');
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
      locationSource: ['LIVE_GPS', 'MAP_PIN', 'GEOCODED', 'LEGACY_UNKNOWN'].includes(String(address.locationSource)) ? address.locationSource! : 'GEOCODED',
      locationAccuracyMetres: address.locationAccuracyMetres ?? null,
      locationCapturedAt: address.locationCapturedAt ?? null,
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
    const pincodeClean = draft.pincode.trim().replace(/\D/g, '');
    // Locality pincode validation commented out — using Mapbox geocoding search
    // if (/^\d{6}$/.test(pincodeClean) && localities.length > 0 && !localities.some((loc) => loc.pincode === pincodeClean)) {
    //   toast.warning('This pincode is not serviceable in your area.');
    //   return;
    // }
    // Locality match validation commented out — using Mapbox geocoding search
    // const locality = localities.find((entry) => entry.id === selectedLocalityId);
    // if (draft.locationSource === 'GEOCODED' && (!locality || locality.city.toLowerCase() !== draft.city.trim().toLowerCase() || locality.state.toLowerCase() !== draft.state.trim().toLowerCase() || locality.pincode !== draft.pincode.trim())) {
    //   toast.warning('Select a locality matching the city, state, and pincode.');
    //   return;
    // }
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
      // localityId no longer required — using Mapbox geocoding coordinates
      localityId: undefined,
      locationSource: draft.locationSource === 'LEGACY_UNKNOWN' ? undefined : draft.locationSource,
      locationAccuracyMetres: draft.locationSource === 'LIVE_GPS' ? draft.locationAccuracyMetres ?? undefined : undefined,
      locationCapturedAt: draft.locationSource === 'LIVE_GPS' ? draft.locationCapturedAt ?? undefined : undefined,
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

  const closeAddressForm = useCallback(() => {
    setShowAddressForm(false);
    setEditingAddressId(null);
    setDraft(emptyDraft());
  }, []);

  const setFulfillment = useCallback((type: 'IMMEDIATE' | 'SCHEDULED') => {
    if (type === 'IMMEDIATE') {
      setFulfillmentType('IMMEDIATE');
      setSelectedSlotId(null);
      return;
    }
    setFulfillmentType('SCHEDULED');
  }, []);

  const viewState = {
    isLoaded,
    cartLines: cart.map((item) => ({ name: item.name, price: item.price, quantity: item.quantity })),
    orderId,

    addresses,
    selectedAddressId,
    loadingAddresses,
    showAddressForm,
    editingAddressId,
    draft,
    savingAddress,
    locating,
    defaultMapCenter,

    quote,
    loadingQuote,
    cartTotal: totalPrice,

    couponInput,
    couponError,

    fulfillmentType,
    deliverySlots,
    selectedSlotId,
    storeStatus,
    loadingSlots,

    paymentMethod,
    placingOrder,
    error,
  };

  const viewActions = {
    onBack: () => router.push('/shop'),
    onBrowse: () => router.push('/shop'),
    onBrowseDeals: () => router.push('/shop/deals'),
    onViewOrder: () => router.push('/shop/orders'),

    onSelectAddress: (id: string) => setSelectedAddressId(id),
    onOpenNewAddress: openNewAddress,
    onOpenEditAddress: openEditAddress,
    onCloseAddressForm: closeAddressForm,
    onSaveAddress: () => void saveAddress(),
    onDeleteAddress: (id: string) => void deleteAddress(id),
    onUseLiveLocation: useCurrentLocation,
    onDraftChange: (patch: Partial<AddressDraft>) => setDraft((current) => ({ ...current, ...patch })),
    onMapPinChange: (latitude: number, longitude: number) => void updateCoordinates(latitude, longitude, 'MAP_PIN'),

    onSetFulfillment: setFulfillment,
    onSelectSlot: (id: string) => setSelectedSlotId(id),
    onSetPayment: (method: 'COD' | 'ONLINE') => setPaymentMethod(method),

    onCouponInputChange: (value: string) => setCouponInput(value),
    onApplyCoupon: applyCoupon,
    onRemoveCoupon: removeCoupon,

    onPlaceOrder: () => void placeOrder(),
  };

  return (
    <DashboardLayout allowedRole="CUSTOMER">
      <CheckoutView state={viewState} actions={viewActions} />
    </DashboardLayout>
  );
}
