'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@aagam/utils';
import DashboardLayout from '@/components/DashboardLayout';
import { useCart } from '@/hooks/useCart';
import { formatINR } from '@/lib/currency';
import BillDetailsCard from '@/components/customer/BillDetailsCard';
import {
  ArrowLeft, CheckCircle2, Loader2, MapPin, Phone, ShoppingBag,
  MoreVertical, Edit2, Trash2, X, Home, Building, Navigation,
  CreditCard, Banknote, ShieldCheck, Truck, Package, BadgePercent,
} from 'lucide-react';

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
  appliedCoupon?: {
    id: string;
    code: string;
    name: string;
    discountType: string;
    applicationMode: string;
    discountAmount: number;
  } | null;
};

const ADDRESS_ICONS: Record<string, any> = {
  home: Home,
  work: Building,
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
  const [savingAddress, setSavingAddress] = useState(false);
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
  const [couponInput, setCouponInput] = useState('');
  const [appliedCouponCode, setAppliedCouponCode] = useState('');
  const [couponError, setCouponError] = useState('');

  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'ONLINE'>('COD');
  const [placingOrder, setPlacingOrder] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const idemKeyRef = useRef<string | null>(null);

useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("coupon");
    const saved = sessionStorage.getItem("aagam_coupon_code");
    const initial = String(fromUrl || saved || "")
      .trim()
      .toUpperCase();
    if (initial) {
      setCouponInput(initial);
      setAppliedCouponCode(initial);
    }
  }, []);

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
      if (appliedCouponCode) setCouponError("");
      try {
        const res = await apiClient.post("/checkout/quote", {
          items: itemsPayload,
          addressId: selectedAddressId,
          couponCode: appliedCouponCode || undefined,
        });
        setQuote(res.data as QuoteResponse);
        if (res.data?.appliedCoupon?.code) {
          setCouponInput(res.data.appliedCoupon.code);
          sessionStorage.setItem(
            "aagam_coupon_code",
            res.data.appliedCoupon.code
          );
        }
      } catch (e: any) {
        const message =
          e?.response?.data?.message ||
          e?.message ||
          "Failed to calculate invoice";
        if (appliedCouponCode) {
          setCouponError(message);
          setAppliedCouponCode("");
          sessionStorage.removeItem("aagam_coupon_code");
        } else {
          setQuote(null);
          setError(message);
        }
      } finally {
        setLoadingQuote(false);
      }
    };
    run();
  }, [itemsPayload, selectedAddressId, orderId, appliedCouponCode]);

  const applyCoupon = () => {
    const code = couponInput.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
      setCouponError("Enter a valid coupon code.");
      return;
    }
    setCouponInput(code);
    setAppliedCouponCode(code);
  };

  const removeCoupon = () => {
    setCouponInput("");
    setAppliedCouponCode("");
    setCouponError("");
    sessionStorage.removeItem("aagam_coupon_code");
  };

  const useCurrentLocation = async () => {
    setError(null);
    if (!navigator.geolocation) { setError('Geolocation is not available.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setDraft((d) => ({ ...d, latitude, longitude }));
        try {
          const res = await apiClient.get('/geo/reverse', { params: { lat: latitude, lng: longitude } });
          const addr = res.data?.address;
          if (res.data?.ok && addr) {
            setDraft((d) => ({ ...d, line1: addr.line1 || d.line1, landmark: addr.landmark || d.landmark, city: addr.city || d.city, state: addr.state || d.state, pincode: addr.pincode || d.pincode, country: addr.country || d.country }));
          }
        } catch {} finally { setLocating(false); }
      },
      (err) => { setError(err.message || 'Failed to get location'); setLocating(false); },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const createAddress = async () => {
    setError(null);
    if (draft.latitude == null || draft.longitude == null) { setError('Please fetch your location first.'); return; }
    setSavingAddress(true);
    try {
      const res = await apiClient.post('/customer/addresses', {
        label: draft.label, recipientName: draft.recipientName, phoneE164: draft.phoneE164,
        alternatePhoneE164: draft.alternatePhoneE164 || undefined, line1: draft.line1, line2: draft.line2 || undefined,
        landmark: draft.landmark || undefined, city: draft.city, state: draft.state, pincode: draft.pincode,
        country: draft.country, latitude: draft.latitude, longitude: draft.longitude,
        instructions: draft.instructions || undefined, isDefault: addresses.length === 0 ? true : Boolean(draft.isDefault),
      });
      const created = res.data as Address;
      setAddresses((prev) => [created, ...prev.map((a) => ({ ...a, isDefault: false }))]);
      setSelectedAddressId(created.id);
      setCreatingAddress(false);
    } catch (e: any) { setError(e?.response?.data?.message || 'Failed to save address'); }
    setSavingAddress(false);
  };

  const handleEditAddress = (addr: Address) => {
    setEditingAddressId(addr.id);
    setDraft({ label: addr.label || 'Home', recipientName: addr.recipientName, phoneE164: addr.phoneE164, alternatePhoneE164: addr.alternatePhoneE164 || '', line1: addr.line1, line2: addr.line2 || '', landmark: addr.landmark || '', city: addr.city, state: addr.state, pincode: addr.pincode, country: addr.country, latitude: addr.latitude, longitude: addr.longitude, instructions: addr.instructions || '', isDefault: addr.isDefault });
    setCreatingAddress(true);
  };

  const saveEditedAddress = async () => {
    if (!editingAddressId || draft.latitude == null || draft.longitude == null) return;
    setSavingAddress(true);
    try {
      const res = await apiClient.patch(`/customer/addresses/${editingAddressId}`, { label: draft.label, recipientName: draft.recipientName, phoneE164: draft.phoneE164, alternatePhoneE164: draft.alternatePhoneE164 || undefined, line1: draft.line1, line2: draft.line2 || undefined, landmark: draft.landmark || undefined, city: draft.city, state: draft.state, pincode: draft.pincode, country: draft.country, latitude: draft.latitude, longitude: draft.longitude, instructions: draft.instructions || undefined, isDefault: draft.isDefault });
      setAddresses((prev) => prev.map((a) => (a.id === editingAddressId ? (res.data as Address) : a)));
      setEditingAddressId(null); setCreatingAddress(false); resetDraft();
    } catch (e: any) { setError(e?.response?.data?.message || 'Failed to update address'); }
    setSavingAddress(false);
  };

  const confirmDeleteAddress = async () => {
    if (!deletingAddressId) return;
    try {
      await apiClient.delete(`/customer/addresses/${deletingAddressId}`);
      const remaining = addresses.filter((a) => a.id !== deletingAddressId);
      setAddresses(remaining);
      if (selectedAddressId === deletingAddressId) setSelectedAddressId(remaining.length > 0 ? remaining[0].id : null);
      setDeletingAddressId(null);
    } catch (e: any) { setError(e?.response?.data?.message || 'Failed to delete address'); }
  };

  const resetDraft = () => {
    setDraft({ label: 'Home', recipientName: '', phoneE164: '', alternatePhoneE164: '', line1: '', line2: '', landmark: '', city: '', state: '', pincode: '', country: 'IN', latitude: null, longitude: null, instructions: '', isDefault: true });
  };

  const placeOrder = async () => {
    setError(null);
    if (!selectedAddressId) { setError('Please select a delivery address.'); return; }
    if (itemsPayload.length === 0) { setError('Your cart is empty.'); return; }
    if (!quote) { setError('Please select an address to calculate totals.'); return; }
    if (!quote.serviceable) { const dist = quote.distanceKm != null ? ` (${quote.distanceKm.toFixed(1)} km from nearest store — max 8 km)` : ''; setError(`We don't deliver to your location yet.${dist}`); return; }
    setPlacingOrder(true);
    try {
      const idempotencyKey = idemKeyRef.current || (crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()));
      idemKeyRef.current = idempotencyKey;
      const res = await apiClient.post('/checkout/place-order', { items: itemsPayload, addressId: selectedAddressId, paymentMethod: paymentMethod === 'COD' ? 'COD' : 'ONLINE', couponCode: appliedCouponCode || undefined }, { headers: { 'Idempotency-Key': idempotencyKey } });
      setOrderId(res.data?.id || res.data?.orderId || null);
      sessionStorage.removeItem('aagam_coupon_code');
      clearCart();
    } catch (e: any) { setError(e?.response?.data?.message || 'Failed to place order.'); }
    setPlacingOrder(false);
  };

  const paySimulated = async () => {
    if (!orderId) return;
    setPaying(true); setError(null);
    try { await apiClient.post('/payments/simulated/capture', { orderId }); clearCart(); }
    catch (e: any) { setError(e?.response?.data?.message || 'Payment failed'); }
    setPaying(false);
  };

  if (cart.length === 0 && !orderId) {
    return (
      <DashboardLayout allowedRole="CUSTOMER">
        <div className="max-w-lg mx-auto py-10 text-center">
          <div className="grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-teal-50 to-amber-50 border border-teal-100 mx-auto">
            <ShoppingBag className="h-9 w-9 text-teal-400" />
          </div>
          <h2 className="mt-5 text-xl font-black text-slate-950">Your cart is empty</h2>
          <p className="mt-2 text-sm text-slate-500">Add items to your cart before checking out.</p>
          <button onClick={() => router.push('/shop')} className="mt-6 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white hover:bg-teal-700 transition-colors">
            Browse products
          </button>
        </div>
      </DashboardLayout>
    );
  }

  const selected = addresses.find((a) => a.id === selectedAddressId) || null;

  const steps = ['Address', 'Items', 'Payment', 'Confirm'];
  const currentStep = orderId ? 3 : paymentMethod ? 2 : quote ? 1 : 0;

  return (
    <DashboardLayout allowedRole="CUSTOMER">
      <div className="max-w-5xl mx-auto pb-24 md:pb-8">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.push('/shop')} className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-xl font-black text-slate-950">Checkout</h1>
            <p className="text-xs font-bold text-slate-500">Complete your order</p>
          </div>
          {quote && (
            <div className="ml-auto rounded-xl bg-teal-50 border border-teal-100 px-3 py-1.5">
              <span className="text-sm font-black text-teal-800">{formatINR(quote.invoice.grandTotal)}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
          {steps.map((step, i) => (
            <React.Fragment key={step}>
              <div className={`flex items-center gap-2 shrink-0 rounded-xl px-3 py-2 text-xs font-black transition-colors ${
                i <= currentStep ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-400'
              }`}>
                <span className="grid h-5 w-5 place-items-center rounded-full bg-white/20 text-[10px]">{i + 1}</span>
                {step}
              </div>
              {i < steps.length - 1 && <div className={`h-0.5 w-6 shrink-0 ${i < currentStep ? 'bg-teal-600' : 'bg-slate-200'}`} />}
            </React.Fragment>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            <section className="rounded-2xl border border-slate-100 bg-white p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-xl bg-teal-100 text-teal-700">
                    <MapPin className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-black text-slate-950">Delivery address</div>
                    <div className="text-xs text-slate-500">Select or add a delivery location</div>
                  </div>
                </div>
                <button onClick={() => { setEditingAddressId(null); resetDraft(); setCreatingAddress((v) => !v); }} className="text-xs font-black px-3 py-2 rounded-xl border border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100 transition-colors">
                  {creatingAddress ? 'Close' : '+ Add new'}
                </button>
              </div>

              {loadingAddresses ? (
                <div className="mt-4 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading addresses...</div>
              ) : (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {addresses.map((a) => {
                    const Icon = ADDRESS_ICONS[(a.label || '').toLowerCase()] || Navigation;
                    return (
                      <button key={a.id} onClick={() => setSelectedAddressId(a.id)} className={`text-left rounded-2xl border p-4 transition-all relative ${
                        a.id === selectedAddressId ? 'border-teal-300 bg-teal-50 shadow-md shadow-teal-100' : 'border-slate-100 bg-white hover:border-teal-200 hover:bg-teal-50/30'
                      }`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div className={`grid h-8 w-8 place-items-center rounded-lg ${a.id === selectedAddressId ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                              <Icon className="h-4 w-4" />
                            </div>
                            <div>
                              <div className="text-xs font-black text-slate-950">{a.label || 'Address'} {a.isDefault && <span className="text-teal-600">• Default</span>}</div>
                              <div className="text-sm font-bold text-slate-800">{a.recipientName}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {a.id === selectedAddressId && <CheckCircle2 className="h-5 w-5 text-teal-600" />}
                            <div className="relative">
                              <button type="button" onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === a.id ? null : a.id); }} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                                <MoreVertical className="h-4 w-4 text-slate-400" />
                              </button>
                              {menuOpenId === a.id && (
                                <div className="absolute right-0 top-full mt-1 w-32 bg-white rounded-xl shadow-xl border border-slate-100 z-20 overflow-hidden">
                                  <button type="button" onClick={(e) => { e.stopPropagation(); handleEditAddress(a); setMenuOpenId(null); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Edit2 className="h-4 w-4" /> Edit</button>
                                  <button type="button" onClick={(e) => { e.stopPropagation(); setDeletingAddressId(a.id); setMenuOpenId(null); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /> Delete</button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="mt-2 text-xs text-slate-600">{a.line1}{a.city ? `, ${a.city}` : ''}{a.pincode ? ` - ${a.pincode}` : ''}</div>
                        <div className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-bold text-slate-500"><Phone className="h-3 w-3" />{a.phoneE164}</div>
                      </button>
                    );
                  })}
                </div>
              )}

              {creatingAddress && (
                <div className="mt-4 rounded-2xl border border-teal-100 bg-teal-50/30 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-black text-slate-950">{editingAddressId ? 'Edit address' : 'New address'}</div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={useCurrentLocation} disabled={locating} className="inline-flex items-center gap-2 text-xs font-black px-3 py-2 rounded-xl bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-50">
                        {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                        {locating ? 'Locating...' : 'Use current location'}
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Input label="Label" value={draft.label} onChange={(v) => setDraft((d) => ({ ...d, label: v }))} />
                    <Input label="Recipient name" value={draft.recipientName} onChange={(v) => setDraft((d) => ({ ...d, recipientName: v }))} />
                    <Input label="Contact number" value={draft.phoneE164} onChange={(v) => setDraft((d) => ({ ...d, phoneE164: v }))} placeholder="+91XXXXXXXXXX" />
                    <Input label="Pincode" value={draft.pincode} onChange={(v) => setDraft((d) => ({ ...d, pincode: v }))} />
                    <Input label="Address line 1" value={draft.line1} onChange={(v) => setDraft((d) => ({ ...d, line1: v }))} className="md:col-span-2" />
                    <Input label="City" value={draft.city} onChange={(v) => setDraft((d) => ({ ...d, city: v }))} />
                    <Input label="State" value={draft.state} onChange={(v) => setDraft((d) => ({ ...d, state: v }))} />
                  </div>
                  <div className="mt-3">
                    <button onClick={editingAddressId ? saveEditedAddress : createAddress} disabled={savingAddress} className="w-full md:w-auto px-5 py-3 rounded-xl bg-teal-700 text-white font-black hover:bg-teal-800 disabled:opacity-50 flex items-center justify-center gap-2">
                      {savingAddress && <Loader2 className="h-4 w-4 animate-spin" />}
                      {editingAddressId ? 'Update address' : 'Save address'}
                    </button>
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-100 bg-white p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-violet-100 text-violet-700">
                  <CreditCard className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-black text-slate-950">Payment method</div>
                  <div className="text-xs text-slate-500">Choose how you&apos;d like to pay</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { method: 'COD' as const, icon: Banknote, label: 'Cash on Delivery', desc: 'Pay when you receive', gradient: 'from-amber-500 to-orange-500' },
                  { method: 'ONLINE' as const, icon: CreditCard, label: 'Pay Online', desc: 'Simulated payment', gradient: 'from-blue-500 to-indigo-500' },
                ].map(({ method, icon: Icon, label, desc, gradient }) => (
                  <button key={method} onClick={() => setPaymentMethod(method)} className={`rounded-2xl border p-4 text-left transition-all ${
                    paymentMethod === method ? 'border-teal-300 bg-teal-50 shadow-md shadow-teal-100' : 'border-slate-100 hover:border-teal-200'
                  }`}>
                    <div className={`grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br ${gradient} text-white mb-3`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="text-sm font-black text-slate-950">{label}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
                  </button>
                ))}
              </div>
            </section>

            {!quote?.serviceable && quote && (
              <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-amber-600 shrink-0" />
                <p className="text-sm font-bold text-amber-800">We don&apos;t deliver to your location yet. Try a different address.</p>
              </div>
            )}

            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{error}</div>
            )}
          </div>

          <aside className="space-y-5">
            <BillDetailsCard
              items={quote?.invoice.items.map((it) => ({ name: it.name, quantity: it.quantity, unitPrice: it.unitPrice, lineTotal: it.lineTotal })) || []}
              subtotal={quote?.invoice.subtotal || 0}
              deliveryFee={quote?.invoice.deliveryFee || 0}
              discountAmount={quote?.invoice.discountAmount || 0}
              taxAmount={quote?.invoice.taxAmount || 0}
              grandTotal={quote?.invoice.grandTotal || 0}
              storeName={quote?.store?.name}
              distanceKm={quote?.distanceKm}
              loading={loadingQuote}
            />

            <section
              data-testid="checkout-coupon"
              className="rounded-2xl border border-slate-100 bg-white p-5"
            >
              <div className="flex items-center gap-2">
                <BadgePercent className="h-4 w-4 text-teal-700" />
                <h3 className="text-sm font-black text-slate-950">Coupon</h3>
                <button
                  onClick={() => router.push("/shop/deals")}
                  className="ml-auto text-xs font-black text-teal-700 hover:text-teal-900"
                >
                  Browse deals
                </button>
              </div>
              {quote?.appliedCoupon ? (
                <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-wide text-emerald-700">
                        {quote.appliedCoupon.code} applied
                      </p>
                      <p className="mt-0.5 text-sm font-bold text-emerald-950">
                        You save {formatINR(quote.appliedCoupon.discountAmount)}
                      </p>
                    </div>
                    <button
                      onClick={removeCoupon}
                      className="rounded-lg bg-white px-3 py-2 text-xs font-black text-slate-700 shadow-sm"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex gap-2">
                  <input
                    value={couponInput}
                    onChange={(event) =>
                      setCouponInput(event.target.value.toUpperCase())
                    }
                    onKeyDown={(event) =>
                      event.key === "Enter" && applyCoupon()
                    }
                    placeholder="Enter coupon code"
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-sm font-bold uppercase text-slate-950 focus:border-teal-500 focus:outline-none"
                  />
                  <button
                    onClick={applyCoupon}
                    disabled={loadingQuote}
                    className="rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"
                  >
                    Apply
                  </button>
                </div>
              )}
              {couponError && (
                <p className="mt-2 text-xs font-bold text-red-600">
                  {couponError}
                </p>
              )}
              {!quote?.appliedCoupon && !couponError && (
                <p className="mt-2 text-[11px] font-semibold text-slate-400">
                  Automatic offers are evaluated by the server. Code offers are
                  checked against cart, account, store, schedule, and usage
                  limits.
                </p>
              )}
            </section>

            <div className="rounded-2xl border border-slate-100 bg-white p-5">
              {orderId ? (
                <div className="text-center">
                  <div className="grid h-14 w-14 place-items-center rounded-full bg-teal-100 text-teal-600 mx-auto">
                    <CheckCircle2 className="h-7 w-7" />
                  </div>
                  <h3 className="mt-3 text-lg font-black text-slate-950">Order Placed!</h3>
                  <p className="text-xs text-slate-500 mt-1">Order ID: <span className="font-mono">{orderId.slice(0, 8).toUpperCase()}</span></p>
                  {paymentMethod === 'ONLINE' ? (
                    <button onClick={paySimulated} disabled={paying} className="mt-4 w-full rounded-xl bg-teal-700 py-3 text-sm font-black text-white hover:bg-teal-800 disabled:opacity-60">
                      {paying ? 'Processing...' : 'Pay now (simulated)'}
                    </button>
                  ) : (
                    <button onClick={() => router.push('/shop/orders')} className="mt-4 w-full rounded-xl bg-slate-950 py-3 text-sm font-black text-white hover:bg-teal-700 transition-colors">
                      View my orders
                    </button>
                  )}
                </div>
              ) : (
                <button onClick={placeOrder} disabled={placingOrder || !quote?.serviceable} className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-teal-700 to-teal-600 py-4 text-sm font-black text-white shadow-lg shadow-teal-900/15 transition-all hover:from-teal-800 hover:to-teal-700 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed">
                  {placingOrder ? (
                    <><Loader2 className="h-5 w-5 animate-spin" /> Placing order...</>
                  ) : (
                    <><ShieldCheck className="h-5 w-5" /> {paymentMethod === 'COD' ? 'Place COD order' : 'Continue to pay'}</>
                  )}
                </button>
              )}

              {selected && (
                <div className="mt-3 text-center text-xs text-slate-500">
                  Deliver to <span className="font-black text-slate-800">{selected.recipientName}</span> ({selected.phoneE164})
                </div>
              )}
            </div>
          </aside>
        </div>

        {deletingAddressId && (
          <div className="fixed inset-0 bg-slate-950/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl p-6">
              <div className="text-center">
                <div className="grid h-12 w-12 place-items-center rounded-full bg-red-100 text-red-600 mx-auto"><Trash2 className="h-6 w-6" /></div>
                <h3 className="mt-3 text-lg font-black text-slate-950">Delete address?</h3>
                <p className="mt-1 text-sm text-slate-500">This action cannot be undone.</p>
              </div>
              <div className="mt-5 flex gap-3">
                <button onClick={() => setDeletingAddressId(null)} className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-black hover:bg-slate-200">Cancel</button>
                <button onClick={confirmDeleteAddress} className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-black hover:bg-red-700">Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3"><div className="text-slate-500">{label}</div><div className="font-black text-slate-950">{value}</div></div>;
}

function Input({ label, value, onChange, placeholder, className }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 placeholder:text-slate-400 ${className || ''}`} />;
}
