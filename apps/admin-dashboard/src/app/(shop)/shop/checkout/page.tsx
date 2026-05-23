'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@aagam/utils';
import DashboardLayout from '@/components/DashboardLayout';
import { useCart } from '@/hooks/useCart';
import { formatINR } from '@/lib/currency';
import { ArrowLeft, CheckCircle2, Loader2, MapPin, Phone, ShoppingBag, MoreVertical, Edit2, Trash2, X } from 'lucide-react';

type Address = {
  id: string;
  label?: string | null;
  recipientName: string;
  phoneE164: string;
  alternatePhoneE164?: string | null;
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

type QuoteResponse = {
  currency: 'INR';
  serviceable: boolean;
  distanceKm: number | null;
  store: { id: string; name: string | null } | null;
  invoice: {
    items: Array<{
      productId: string;
      name: string;
      image?: string | null;
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
};

export default function CheckoutPage() {
  const router = useRouter();
  const { cart, clearCart } = useCart();

  const itemsPayload = useMemo(
    () => cart.map((i) => ({ productId: i.id, quantity: i.quantity })),
    [cart]
  );

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loadingAddresses, setLoadingAddresses] = useState(true);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);

  const [creatingAddress, setCreatingAddress] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [deletingAddressId, setDeletingAddressId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    label: 'Home',
    recipientName: '',
    phoneE164: '',
    alternatePhoneE164: '',
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
  const [locating, setLocating] = useState(false);

  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'ONLINE'>('COD');
  const [placingOrder, setPlacingOrder] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const idemKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoadingAddresses(true);
      setError(null);
      try {
        const res = await apiClient.get('/customer/addresses');
        const list = Array.isArray(res.data) ? (res.data as Address[]) : [];
        setAddresses(list);
        if (list.length > 0) {
          setSelectedAddressId(list.find((a) => a.isDefault)?.id || list[0].id);
        }
      } catch (e: any) {
        setError(e?.response?.data?.message || e?.message || 'Failed to load addresses');
      } finally {
        setLoadingAddresses(false);
      }
    };

    load();
  }, []);

  // Close menu on outside click
  useEffect(() => {
    const handleClick = () => setMenuOpenId(null);
    if (menuOpenId) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [menuOpenId]);

  useEffect(() => {
    const run = async () => {
      if (!selectedAddressId) return;
      if (itemsPayload.length === 0) return;
      if (orderId) return;

      setLoadingQuote(true);
      setError(null);
      try {
        const res = await apiClient.post('/checkout/quote', {
          items: itemsPayload,
          addressId: selectedAddressId,
        });
        setQuote(res.data as QuoteResponse);
      } catch (e: any) {
        setQuote(null);
        setError(e?.response?.data?.message || e?.message || 'Failed to calculate invoice');
      } finally {
        setLoadingQuote(false);
      }
    };

    run();
  }, [itemsPayload, selectedAddressId, orderId]);

  const useCurrentLocation = async () => {
    setError(null);
    if (!navigator.geolocation) {
      setError('Geolocation is not available in this browser.');
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const latitude = pos.coords.latitude;
        const longitude = pos.coords.longitude;

        setDraft((d) => ({
          ...d,
          latitude,
          longitude,
        }));

        try {
          // Server-side reverse geocode to avoid browser CORS + keep provider headers centralized.
          const res = await apiClient.get('/geo/reverse', { params: { lat: latitude, lng: longitude } });
          const payload = res.data;
          const addr = payload?.address;
          if (payload?.ok && addr) {
            setDraft((d) => ({
              ...d,
              line1: addr.line1 || d.line1,
              landmark: addr.landmark || d.landmark,
              city: addr.city || d.city,
              state: addr.state || d.state,
              pincode: addr.pincode || d.pincode,
              country: addr.country || d.country,
            }));
          }
        } catch (e) {
          // Non-fatal; user can still fill manually.
        } finally {
          setLocating(false);
        }
      },
      (err) => {
        setError(err.message || 'Failed to fetch location');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const createAddress = async () => {
    setError(null);
    if (draft.latitude == null || draft.longitude == null) {
      setError('Please fetch your location first.');
      return;
    }

    setCreatingAddress(true);
    try {
      const res = await apiClient.post('/customer/addresses', {
        label: draft.label,
        recipientName: draft.recipientName,
        phoneE164: draft.phoneE164,
        alternatePhoneE164: draft.alternatePhoneE164 || undefined,
        line1: draft.line1,
        line2: draft.line2 || undefined,
        landmark: draft.landmark || undefined,
        city: draft.city,
        state: draft.state,
        pincode: draft.pincode,
        country: draft.country,
        latitude: draft.latitude,
        longitude: draft.longitude,
        instructions: draft.instructions || undefined,
        isDefault: addresses.length === 0 ? true : Boolean(draft.isDefault),
      });
      const created = res.data as Address;
      setAddresses((prev) => [created, ...prev.map((a) => ({ ...a, isDefault: false }))]);
      setSelectedAddressId(created.id);
      setCreatingAddress(false);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to save address');
      setCreatingAddress(false);
    }
  };

  const handleEditAddress = (addr: Address) => {
    setEditingAddressId(addr.id);
    setDraft({
      label: addr.label || 'Home',
      recipientName: addr.recipientName,
      phoneE164: addr.phoneE164,
      alternatePhoneE164: addr.alternatePhoneE164 || '',
      line1: addr.line1,
      line2: addr.line2 || '',
      landmark: addr.landmark || '',
      city: addr.city,
      state: addr.state,
      pincode: addr.pincode,
      country: addr.country,
      latitude: addr.latitude,
      longitude: addr.longitude,
      instructions: addr.instructions || '',
      isDefault: addr.isDefault,
    });
    setCreatingAddress(true);
  };

  const saveEditedAddress = async () => {
    if (!editingAddressId) return;
    if (draft.latitude == null || draft.longitude == null) {
      setError('Please fetch your location first.');
      return;
    }

    setCreatingAddress(true);
    try {
      const res = await apiClient.patch(`/customer/addresses/${editingAddressId}`, {
        label: draft.label,
        recipientName: draft.recipientName,
        phoneE164: draft.phoneE164,
        alternatePhoneE164: draft.alternatePhoneE164 || undefined,
        line1: draft.line1,
        line2: draft.line2 || undefined,
        landmark: draft.landmark || undefined,
        city: draft.city,
        state: draft.state,
        pincode: draft.pincode,
        country: draft.country,
        latitude: draft.latitude,
        longitude: draft.longitude,
        instructions: draft.instructions || undefined,
        isDefault: draft.isDefault,
      });
      const updated = res.data as Address;
      setAddresses((prev) => prev.map((a) => (a.id === editingAddressId ? updated : a)));
      setEditingAddressId(null);
      setCreatingAddress(false);
      resetDraft();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to update address');
      setCreatingAddress(false);
    }
  };

  const confirmDeleteAddress = async () => {
    if (!deletingAddressId) return;
    try {
      await apiClient.delete(`/customer/addresses/${deletingAddressId}`);
      const remaining = addresses.filter((a) => a.id !== deletingAddressId);
      setAddresses(remaining);
      if (selectedAddressId === deletingAddressId) {
        setSelectedAddressId(remaining.length > 0 ? remaining[0].id : null);
      }
      setDeletingAddressId(null);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to delete address');
    }
  };

  const resetDraft = () => {
    setDraft({
      label: 'Home',
      recipientName: '',
      phoneE164: '',
      alternatePhoneE164: '',
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
  };

  const placeOrder = async () => {
    setError(null);
    if (!selectedAddressId) {
      setError('Please select a delivery address first.');
      return;
    }
    if (itemsPayload.length === 0) {
      setError('Your cart is empty. Add items before checking out.');
      return;
    }
    if (!quote) {
      setError('Please select an address to calculate the delivery fee.');
      return;
    }
    if (!quote.serviceable) {
      const dist = quote.distanceKm != null ? ` (${quote.distanceKm.toFixed(1)} km from nearest store — max 8 km)` : '';
      setError(`We don't deliver to your location yet. Try a different address${dist}.`);
      return;
    }

    setPlacingOrder(true);
    try {
      const idempotencyKey = idemKeyRef.current || (crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()));
      idemKeyRef.current = idempotencyKey;

      const res = await apiClient.post(
        '/checkout/place-order',
        {
          items: itemsPayload,
          addressId: selectedAddressId,
          paymentMethod: paymentMethod === 'COD' ? 'COD' : 'ONLINE',
        },
        { headers: { 'Idempotency-Key': idempotencyKey } }
      );
      setOrderId(res.data?.id || res.data?.orderId || null);
      clearCart();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to place order. Is the server running?');
    } finally {
      setPlacingOrder(false);
    }
  };

  const paySimulated = async () => {
    if (!orderId) return;
    setPaying(true);
    setError(null);
    try {
      await apiClient.post('/payments/simulated/capture', { orderId });
      clearCart();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Payment failed');
    } finally {
      setPaying(false);
    }
  };

  if (cart.length === 0 && !orderId) {
    return (
      <DashboardLayout allowedRole="CUSTOMER">
        <div className="py-10">
          <button
            onClick={() => router.push('/shop')}
            className="inline-flex items-center gap-2 text-emerald-800 font-black"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to shop
          </button>
          <div className="mt-6 rounded-2xl border border-emerald-100 bg-white p-6">
            <div className="flex items-center gap-3">
              <ShoppingBag className="h-6 w-6 text-emerald-700" />
              <div className="text-lg font-black text-gray-900">Your cart is empty</div>
            </div>
            <p className="mt-2 text-sm text-gray-600">Add items to your cart before checking out.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const selected = addresses.find((a) => a.id === selectedAddressId) || null;

  return (
    <DashboardLayout allowedRole="CUSTOMER">
      <div className="min-h-screen font-sans relative pb-10">
        <div className="pointer-events-none absolute inset-x-0 -top-8 h-64 bg-gradient-to-b from-emerald-100 via-white to-transparent" />

        <div className="mb-4 rounded-2xl border border-emerald-100 bg-white/90 px-4 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between h-12">
            <button
              onClick={() => router.push('/shop')}
              className="inline-flex items-center gap-2 text-emerald-900 font-black"
            >
              <ArrowLeft className="h-4 w-4" />
              Checkout
            </button>
            <div className="text-sm font-black text-emerald-900/70">{quote ? formatINR(quote.invoice.grandTotal) : ''}</div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto pt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <section className="rounded-2xl border border-emerald-100 bg-white p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-black text-gray-900">Delivery address</div>
                  <div className="text-xs text-gray-600 mt-1">Select a saved address or create one using your exact location pin.</div>
                </div>
                <button
                  onClick={() => { setEditingAddressId(null); resetDraft(); setCreatingAddress((v) => !v); }}
                  className="text-xs font-black px-3 py-2 rounded-full border border-emerald-100 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
                >
                  {creatingAddress ? 'Close' : 'Add new'}
                </button>
              </div>

              {loadingAddresses ? (
                <div className="mt-4 text-sm text-gray-600 inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading addresses...
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {addresses.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => setSelectedAddressId(a.id)}
                      className={[
                        'text-left rounded-2xl border p-4 transition-colors relative',
                        a.id === selectedAddressId ? 'border-emerald-300 bg-emerald-50' : 'border-emerald-100 bg-white hover:bg-emerald-50/50',
                      ].join(' ')}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs font-black text-emerald-800 uppercase tracking-widest">
                            {a.label || 'Address'} {a.isDefault ? '• Default' : ''}
                          </div>
                          <div className="mt-1 text-sm font-black text-gray-900">{a.recipientName}</div>
                        </div>
                        <div className="flex items-center gap-1">
                          {a.id === selectedAddressId && <CheckCircle2 className="h-5 w-5 text-emerald-700" />}
                          <div className="relative">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === a.id ? null : a.id); }}
                              className="p-1.5 rounded-lg hover:bg-emerald-100 transition-colors"
                            >
                              <MoreVertical className="h-4 w-4 text-emerald-700" />
                            </button>
                            {menuOpenId === a.id && (
                              <div className="absolute right-0 top-full mt-1 w-32 bg-white rounded-xl shadow-xl border border-emerald-100 z-20 overflow-hidden">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleEditAddress(a); setMenuOpenId(null); }}
                                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-emerald-50 transition-colors"
                                >
                                  <Edit2 className="h-4 w-4" />
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setDeletingAddressId(a.id); setMenuOpenId(null); }}
                                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-gray-700">
                        {a.line1}
                        {a.city ? `, ${a.city}` : ''}
                        {a.pincode ? ` - ${a.pincode}` : ''}
                      </div>
                  <div className="mt-2 inline-flex items-center gap-2 text-xs font-black text-emerald-900/70">
                    <Phone className="h-3.5 w-3.5" />
                    {a.phoneE164}
                  </div>
                  {a.alternatePhoneE164 ? (
                    <div className="mt-1 text-[11px] font-black text-emerald-900/50">
                      Alt: {a.alternatePhoneE164}
                    </div>
                  ) : null}
                </button>
              ))}
            </div>
          )}

              {creatingAddress ? (
                <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-black text-gray-900">
                      {editingAddressId ? 'Edit address' : 'New address'}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={useCurrentLocation}
                        disabled={locating}
                        className="inline-flex items-center gap-2 text-xs font-black px-3 py-2 rounded-full bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50"
                      >
                        {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                        {locating ? 'Locating...' : 'Use current location'}
                      </button>
                      {(draft.latitude != null || editingAddressId) && (
                        <button
                          type="button"
                          onClick={() => { setCreatingAddress(false); setEditingAddressId(null); resetDraft(); }}
                          className="p-2 rounded-lg hover:bg-emerald-100 transition-colors"
                        >
                          <X className="h-4 w-4 text-emerald-700" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Input label="Label" value={draft.label} onChange={(v) => setDraft((d) => ({ ...d, label: v }))} />
                    <Input label="Recipient name" value={draft.recipientName} onChange={(v) => setDraft((d) => ({ ...d, recipientName: v }))} />
                    <Input label="Contact number" value={draft.phoneE164} onChange={(v) => setDraft((d) => ({ ...d, phoneE164: v }))} placeholder="+91XXXXXXXXXX or 10 digits" />
                    <Input label="Alternate number (optional)" value={draft.alternatePhoneE164} onChange={(v) => setDraft((d) => ({ ...d, alternatePhoneE164: v }))} placeholder="+91XXXXXXXXXX or 10 digits" />
                    <Input label="Pincode" value={draft.pincode} onChange={(v) => setDraft((d) => ({ ...d, pincode: v }))} placeholder="6 digits" />
                    <Input label="Address line 1" value={draft.line1} onChange={(v) => setDraft((d) => ({ ...d, line1: v }))} className="md:col-span-2" />
                    <Input label="Address line 2 (optional)" value={draft.line2} onChange={(v) => setDraft((d) => ({ ...d, line2: v }))} className="md:col-span-2" />
                    <Input label="Landmark (optional)" value={draft.landmark} onChange={(v) => setDraft((d) => ({ ...d, landmark: v }))} />
                    <Input label="City" value={draft.city} onChange={(v) => setDraft((d) => ({ ...d, city: v }))} />
                    <Input label="State" value={draft.state} onChange={(v) => setDraft((d) => ({ ...d, state: v }))} />
                    <Input label="Instructions (optional)" value={draft.instructions} onChange={(v) => setDraft((d) => ({ ...d, instructions: v }))} className="md:col-span-2" />
                  </div>

                  <div className="mt-3 text-xs text-gray-600">
                    {draft.latitude != null && draft.longitude != null ? (
                      <span className="font-black text-emerald-900/70">Pinned: {draft.latitude.toFixed(6)}, {draft.longitude.toFixed(6)}</span>
                    ) : (
                      <span>Pin your exact location using the button above.</span>
                    )}
                  </div>

                  <div className="mt-4">
                    <button
                      onClick={editingAddressId ? saveEditedAddress : createAddress}
                      disabled={creatingAddress}
                      className="w-full md:w-auto px-4 py-3 rounded-2xl bg-emerald-700 text-white font-black hover:bg-emerald-800 disabled:opacity-50 flex items-center gap-2"
                    >
                      {creatingAddress && <Loader2 className="h-4 w-4 animate-spin" />}
                      {editingAddressId ? 'Update address' : 'Save address'}
                    </button>
                  </div>
                </div>
              ) : null}
            </section>

            <section className="rounded-2xl border border-emerald-100 bg-white p-5">
              <div className="text-sm font-black text-gray-900">Payment</div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <button
                  onClick={() => setPaymentMethod('COD')}
                  className={[
                    'rounded-2xl border p-4 text-left',
                    paymentMethod === 'COD' ? 'border-emerald-300 bg-emerald-50' : 'border-emerald-100 hover:bg-emerald-50/50',
                  ].join(' ')}
                >
                  <div className="text-xs font-black text-emerald-800 uppercase tracking-widest">COD</div>
                  <div className="mt-1 text-sm font-black text-gray-900">Cash on delivery</div>
                  <div className="mt-1 text-xs text-gray-600">Pay after delivery.</div>
                </button>
                <button
                  onClick={() => setPaymentMethod('ONLINE')}
                  className={[
                    'rounded-2xl border p-4 text-left',
                    paymentMethod === 'ONLINE' ? 'border-emerald-300 bg-emerald-50' : 'border-emerald-100 hover:bg-emerald-50/50',
                  ].join(' ')}
                >
                  <div className="text-xs font-black text-emerald-800 uppercase tracking-widest">Online</div>
                  <div className="mt-1 text-sm font-black text-gray-900">Pay now</div>
                  <div className="mt-1 text-xs text-gray-600">Simulated for now.</div>
                </button>
              </div>
            </section>

            {error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 font-bold">
                {error}
              </div>
            ) : null}
          </div>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-emerald-100 bg-white p-5">
              <div className="text-sm font-black text-gray-900">Invoice</div>
              {loadingQuote ? (
                <div className="mt-3 text-sm text-gray-600 inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Calculating...
                </div>
              ) : quote ? (
                <div className="mt-3 space-y-3">
                  <div className="text-xs text-gray-600">
                    Store: <span className="font-black text-gray-900">{quote.store?.name || 'Assigned'}</span>
                    {quote.distanceKm != null ? (
                      <span className="ml-2 text-emerald-900/70 font-black">({quote.distanceKm.toFixed(1)} km)</span>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    {quote.invoice.items.map((it) => (
                      <div key={it.productId} className="flex items-start justify-between gap-3 text-xs">
                        <div className="min-w-0">
                          <div className="font-black text-gray-900 truncate">{it.name}</div>
                          <div className="text-gray-600 mt-0.5">{it.quantity} × {formatINR(it.unitPrice)}</div>
                        </div>
                        <div className="font-black text-gray-900">{formatINR(it.lineTotal)}</div>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-emerald-100 pt-3 space-y-2 text-sm">
                    <Row label="Subtotal" value={formatINR(quote.invoice.subtotal)} />
                    <Row label="Delivery fee" value={formatINR(quote.invoice.deliveryFee)} />
                    <div className="pt-2 border-t border-emerald-100">
                      <Row label={<span className="font-black">Grand total</span>} value={<span className="font-black">{formatINR(quote.invoice.grandTotal)}</span>} />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-3 text-sm text-gray-600">Select an address to calculate totals.</div>
              )}
            </section>

            <section className="rounded-2xl border border-emerald-100 bg-white p-5">
              {orderId ? (
                <div>
                  <div className="inline-flex items-center gap-2 text-emerald-800 font-black">
                    <CheckCircle2 className="h-5 w-5" />
                    Order created
                  </div>
                  <div className="mt-2 text-xs text-gray-600">Order ID</div>
                  <div className="mt-1 font-mono text-xs text-gray-900 break-all">{orderId}</div>

                  {paymentMethod === 'ONLINE' ? (
                    <button
                      onClick={paySimulated}
                      disabled={paying}
                      className="mt-4 w-full bg-emerald-700 text-white py-3 rounded-2xl font-black hover:bg-emerald-800 disabled:opacity-60"
                    >
                      {paying ? 'Processing payment...' : 'Pay now (simulated)'}
                    </button>
                  ) : (
                    <button
                      onClick={() => router.push('/shop')}
                      className="mt-4 w-full bg-emerald-700 text-white py-3 rounded-2xl font-black hover:bg-emerald-800"
                    >
                      Back to shop
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <button
                    onClick={placeOrder}
                    disabled={placingOrder}
                    className="w-full bg-emerald-700 text-white py-4 rounded-2xl font-black hover:bg-emerald-800 disabled:opacity-60 transition-colors"
                  >
                    {placingOrder ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Placing order...
                      </span>
                    ) : paymentMethod === 'COD' ? (
                      'Place COD order'
                    ) : (
                      'Continue to pay'
                    )}
                  </button>
                  {error && (
                    <p className="mt-2 text-xs text-red-600 font-bold text-center">{error}</p>
                  )}
                </>
              )}

              {selected ? (
                <div className="mt-4 text-xs text-gray-600">
                  Deliver to <span className="font-black text-gray-900">{selected.recipientName}</span> ({selected.phoneE164})
                </div>
              ) : null}
            </section>
          </aside>
        </div>

        <DeleteAddressModal
          isOpen={deletingAddressId !== null}
          address={addresses.find((a) => a.id === deletingAddressId) || null}
          onConfirm={confirmDeleteAddress}
          onCancel={() => setDeletingAddressId(null)}
        />
      </div>
    </DashboardLayout>
  );
}

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-gray-600">{label}</div>
      <div className="text-gray-900">{value}</div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full px-4 py-2.5 border border-emerald-200 rounded-xl text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 ${className || ''}`}
    />
  );
}

// Delete confirmation modal
function DeleteAddressModal({
  isOpen,
  address,
  onConfirm,
  onCancel,
}: {
  isOpen: boolean;
  address: Address | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!isOpen || !address) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl p-6">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <Trash2 className="h-6 w-6 text-red-600" />
          </div>
          <h3 className="text-lg font-black text-gray-900">Delete address?</h3>
          <p className="mt-2 text-sm text-gray-600">
            Are you sure you want to delete this address? This action cannot be undone.
          </p>
        </div>
        <div className="mt-6 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-black hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-black hover:bg-red-700 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
