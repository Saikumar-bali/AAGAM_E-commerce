import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Geolocation from 'react-native-geolocation-service';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ArrowLeft, BadgePercent, Tag, X } from 'lucide-react-native';
import { LeafletMap, apiClient, useAuthStore } from '@aagam/mobile-shared';
import { useCartStore } from '../../store/cartStore';
import { getUserSafeError, notify } from '../../ui/notify';

const formatCheckoutMoney = (value: number) => `₹${Number(value || 0).toFixed(2)}`;
type CheckoutAddressField = 'recipientName' | 'phoneE164' | 'line1' | 'city' | 'state' | 'pincode' | 'latitude' | 'longitude';
type CheckoutAddressErrors = Partial<Record<CheckoutAddressField, string>>;
type CheckoutAddressLocationSource = 'LIVE_GPS' | 'MAP_PIN';

function isValidPhone(value: string) {
  const compact = value.trim().replace(/[\s().-]/g, '');
  return /^(\+?[1-9]\d{7,14}|\d{10})$/.test(compact);
}

export const CheckoutScreen = () => {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { items, total, clearCart, couponCode, setCouponCode } = useCartStore();
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const paymentMethod = 'COD' as const;
  const [couponInput, setCouponInput] = useState(couponCode || '');
  const [appliedCouponCode, setAppliedCouponCode] = useState(couponCode || '');
  const [couponError, setCouponError] = useState('');
  const [couponApplying, setCouponApplying] = useState(false);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [addressDraft, setAddressDraft] = useState({
    label: 'Home',
    recipientName: user?.name || '',
    phoneE164: user?.phone || '',
    line1: '',
    city: '',
    state: '',
    pincode: '',
    latitude: '',
    longitude: '',
    locationSource: 'MAP_PIN' as CheckoutAddressLocationSource,
    locationAccuracyMetres: null as number | null,
    locationCapturedAt: null as string | null,
    country: 'IN',
    isDefault: true,
  });
  const [addressErrors, setAddressErrors] = useState<CheckoutAddressErrors>({});
  const [localities, setLocalities] = useState<Array<{ id: string; name: string; pincode: string; city: string; state: string }>>([]);
  const idempotencyKey = useRef(`mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const lastRequestedCoupon = useRef('');
  const itemsPayload = useMemo(() => items.map((item) => ({ productId: item.product.id, quantity: item.quantity })), [items]);

  useEffect(() => {
    apiClient.get('/localities').then((res) => {
      if (Array.isArray(res.data)) setLocalities(res.data);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const requested = String(route.params?.couponCode || couponCode || '').trim().toUpperCase();
    if (!requested || requested === lastRequestedCoupon.current) return;
    lastRequestedCoupon.current = requested;
    setCouponInput(requested);
    setAppliedCouponCode(requested);
    setCouponCode(requested);
  }, [couponCode, route.params?.couponCode, setCouponCode]);

  const { data: addresses = [], isLoading: loadingAddresses } = useQuery({
    queryKey: ['addresses'],
    queryFn: async () => {
      const response = await apiClient.get('/customer/addresses');
      const next = Array.isArray(response.data) ? response.data : [];
      if (next.length > 0 && !selectedAddressId) {
        const defaultAddress = next.find((address: any) => address.isDefault) || next[0];
        setSelectedAddressId(defaultAddress.id);
      }
      return next;
    },
  });

  const {
    data: quote,
    error: quoteError,
    isLoading: loadingQuote,
    refetch: refetchQuote,
  } = useQuery({
    queryKey: ['quote', itemsPayload, selectedAddressId, appliedCouponCode],
    queryFn: async () => (await apiClient.post('/checkout/quote', {
      items: itemsPayload,
      addressId: selectedAddressId,
      couponCode: appliedCouponCode || undefined,
    })).data,
    enabled: itemsPayload.length > 0 && Boolean(selectedAddressId),
    retry: false,
  });

  const clearAddressError = (field: CheckoutAddressField) => setAddressErrors((current) => ({ ...current, [field]: undefined }));

  const setPinnedLocation = async (
    latitude: number,
    longitude: number,
    locationSource: CheckoutAddressLocationSource = 'MAP_PIN',
    accuracyMetres?: number,
  ) => {
    clearAddressError('latitude');
    clearAddressError('longitude');
    const hasLiveAccuracy = locationSource === 'LIVE_GPS'
      && typeof accuracyMetres === 'number'
      && Number.isFinite(accuracyMetres)
      && accuracyMetres > 0;
    setAddressDraft((current) => ({
      ...current,
      latitude: String(latitude),
      longitude: String(longitude),
      locationSource,
      locationAccuracyMetres: hasLiveAccuracy ? accuracyMetres : null,
      locationCapturedAt: locationSource === 'LIVE_GPS' ? new Date().toISOString() : null,
    }));
    try {
      const response = await apiClient.get('/geo/reverse', { params: { lat: latitude, lng: longitude } });
      const address = response.data?.address;
      if (address) setAddressDraft((current) => ({ ...current, line1: address.line1 || current.line1, city: address.city || current.city, state: address.state || current.state, pincode: address.pincode || current.pincode }));
    } catch {
      notify.info('Address details unavailable', 'The pin was saved. Enter the address details manually.');
    }
  };

  const useCurrentLocation = async () => {
    if (Platform.OS === 'android') {
      const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, { title: 'Allow delivery location', message: 'Aagaam uses precise location to place your delivery pin.', buttonPositive: 'Allow', buttonNegative: 'Not now' });
      if (result !== PermissionsAndroid.RESULTS.GRANTED) {
        notify.warning('Location permission needed', 'Allow precise location or tap the map to pin manually.');
        return;
      }
    }
    Geolocation.getCurrentPosition(
      (position) => void setPinnedLocation(
        position.coords.latitude,
        position.coords.longitude,
        'LIVE_GPS',
        position.coords.accuracy,
      ),
      () => notify.error('Location unavailable', 'Turn on precise location or tap the map to pin manually.'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  };

  const validateAddressDraft = () => {
    const next: CheckoutAddressErrors = {};
    if (addressDraft.recipientName.trim().length < 2) next.recipientName = 'Recipient name is required (at least 2 characters).';
    if (!isValidPhone(addressDraft.phoneE164)) next.phoneE164 = 'Enter a valid required phone number.';
    if (addressDraft.line1.trim().length < 3) next.line1 = 'House, street and area is required.';
    if (addressDraft.city.trim().length < 2) next.city = 'City is required.';
    if (addressDraft.state.trim().length < 2) next.state = 'State is required.';
    if (!/^\d{6}$/.test(addressDraft.pincode.trim())) next.pincode = 'A valid 6 digit pincode is required.';
    else if (localities.length > 0 && !localities.some((loc) => loc.pincode === addressDraft.pincode.trim())) next.pincode = 'This pincode is not serviceable in your area.';
    const latitude = Number(addressDraft.latitude);
    const longitude = Number(addressDraft.longitude);
    if (!addressDraft.latitude.trim() || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) next.latitude = 'Pin a valid delivery location.';
    if (!addressDraft.longitude.trim() || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) next.longitude = 'Pin a valid delivery location.';
    setAddressErrors(next);
    return Object.keys(next).length === 0;
  };

  const saveAddress = useMutation({
    mutationFn: async () => (await apiClient.post('/customer/addresses', {
      ...addressDraft,
      latitude: Number(addressDraft.latitude),
      longitude: Number(addressDraft.longitude),
      ...(addressDraft.locationSource === 'LIVE_GPS'
        ? {
            locationAccuracyMetres: addressDraft.locationAccuracyMetres,
            locationCapturedAt: addressDraft.locationCapturedAt,
          }
        : {
            locationAccuracyMetres: undefined,
            locationCapturedAt: undefined,
          }),
    })).data,
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ['addresses'] });
      setSelectedAddressId(saved.id);
      setAddressErrors({});
      setShowAddressForm(false);
      notify.success('Delivery address selected');
    },
    onError: (error: unknown) => notify.error('Could not save address', getUserSafeError(error, 'Check the required fields.')),
  });

  const submitAddress = () => {
    if (!validateAddressDraft()) {
      notify.warning('Complete required address fields', 'Fields marked in red must be corrected before saving.');
      return;
    }
    saveAddress.mutate();
  };

  useEffect(() => {
    if (!quoteError || !appliedCouponCode) return;
    const message = getUserSafeError(quoteError, 'This coupon could not be applied.');
    setCouponError(message);
    setAppliedCouponCode('');
    setCouponCode(null);
    notify.error('Coupon not applied', message);
  }, [appliedCouponCode, quoteError, setCouponCode]);

  const applyCoupon = async () => {
    const next = couponInput.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,32}$/.test(next)) {
      const message = 'Enter a valid coupon code.';
      setCouponError(message);
      notify.warning('Invalid coupon', message);
      return;
    }
    if (!selectedAddressId) {
      const message = 'Select or add a delivery address before applying a coupon.';
      setCouponError(message);
      notify.warning('Delivery address required', message);
      return;
    }
    setCouponApplying(true);
    setCouponError('');
    try {
      const response = await apiClient.post('/checkout/quote', { items: itemsPayload, addressId: selectedAddressId, couponCode: next });
      if (!response.data?.appliedCoupon || Number(response.data?.invoice?.discountPaise || 0) <= 0) throw new Error('This coupon does not reduce the current order total.');
      setCouponInput(next);
      setAppliedCouponCode(next);
      setCouponCode(next);
      await queryClient.invalidateQueries({ queryKey: ['quote'] });
      notify.success('Coupon applied', `You save ₹${response.data.invoice.discountAmount}`);
    } catch (error) {
      const message = getUserSafeError(error, 'This coupon could not be applied.');
      setAppliedCouponCode('');
      setCouponCode(null);
      setCouponError(message);
      notify.error('Coupon not applied', message);
    } finally {
      setCouponApplying(false);
    }
  };

  const removeCoupon = () => {
    setCouponInput('');
    setAppliedCouponCode('');
    setCouponCode(null);
    setCouponError('');
    notify.info('Coupon removed');
  };

  const placeOrderMutation = useMutation({
    mutationFn: async () => apiClient.post('/checkout/place-order', {
      items: itemsPayload,
      addressId: selectedAddressId,
      paymentMethod,
      couponCode: appliedCouponCode || undefined,
    }, { headers: { 'Idempotency-Key': idempotencyKey.current } }),
    onSuccess: (response) => {
      clearCart();
      const orderId = response.data?.id || response.data?.orderId;
      notify.success('Order placed', 'Your COD order has been confirmed.');
      navigation.replace('OrderDetail', { orderId });
    },
    onError: (error: unknown) => {
      notify.error('Checkout failed', getUserSafeError(error, 'Failed to place order.'));
      void refetchQuote();
    },
  });

  if (items.length === 0) {
    return <View style={styles.centered}><Text style={styles.emptyTitle}>Your cart is empty.</Text><Text style={styles.emptyText}>Add a few items before checking out.</Text><TouchableOpacity testID="checkout_browse_products" style={styles.browseButton} onPress={() => navigation.navigate('MainTabs', { screen: 'Home' })}><Text style={styles.browseButtonText}>Browse products</Text></TouchableOpacity></View>;
  }
  if (loadingAddresses) return <View style={styles.centered}><ActivityIndicator size="large" color="#0F766E" /></View>;

  const discountAmount = Number(quote?.invoice?.discountAmount || 0);
  const appliedCoupon = quote?.appliedCoupon;
  const quoteFailure = quoteError && !appliedCouponCode ? getUserSafeError(quoteError, 'Failed to calculate the latest total.') : '';
  const orderDisabled = !selectedAddressId || loadingQuote || placeOrderMutation.isPending || quote?.serviceable === false || Boolean(quoteFailure);
  const quotedSubtotal = Number(quote?.invoice?.subtotal ?? total());
  const freeDeliveryMinimumPaise = Number(quote?.deliveryPricing?.freeDeliveryMinimumPaise ?? 9_900);
  const deliveryRatePaisePerKm = quote?.deliveryPricing?.ratePaisePerKm != null ? Number(quote.deliveryPricing.ratePaisePerKm) : null;
  const freeDeliveryRemainingPaise = Math.max(0, freeDeliveryMinimumPaise - Math.round(quotedSubtotal * 100));
  const leaveCheckout = () => {
    if (navigation.canGoBack?.()) navigation.goBack();
    else navigation.navigate('MainTabs', { screen: 'Cart' });
  };
  const locationError = addressErrors.latitude || addressErrors.longitude;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.checkoutHeader}>
        <TouchableOpacity testID="checkout_back_button" accessibilityLabel="Back to cart" style={styles.backButton} onPress={leaveCheckout}>
          <ArrowLeft size={21} color="#0F172A" />
        </TouchableOpacity>
        <View><Text style={styles.checkoutTitle}>Checkout</Text><Text style={styles.checkoutSubtitle}>Confirm delivery and payment</Text></View>
      </View>
      <Text style={styles.sectionTitle}>Delivery Address</Text>
      {addresses.map((address: any) => {
        const active = selectedAddressId === address.id;
        return <TouchableOpacity testID="checkout_address_card" key={address.id} style={[styles.addressCard, active && styles.addressCardActive]} onPress={() => setSelectedAddressId(address.id)}><Text style={styles.addressLabel}>{address.label || 'Address'} {active ? '• Selected' : ''}</Text><Text style={styles.addressName}>{address.recipientName}</Text><Text style={styles.addressText}>{address.line1}{address.line2 ? `, ${address.line2}` : ''}</Text><Text style={styles.addressText}>{address.city}, {address.state} - {address.pincode}</Text><Text style={styles.addressPhone}>{address.phoneE164}</Text></TouchableOpacity>;
      })}
      {addresses.length === 0 ? <View style={styles.noticeCard}><Text style={styles.noticeTitle}>No saved address yet</Text><Text style={styles.noticeText}>Add and pin a delivery address without leaving checkout.</Text><TouchableOpacity testID="checkout_inline_address_button" style={styles.inlineAddressButton} onPress={() => { setAddressErrors({}); setShowAddressForm(true); }}><Text style={styles.inlineAddressButtonText}>Add delivery address</Text></TouchableOpacity></View> : null}
      {addresses.length > 0 ? <TouchableOpacity testID="checkout_add_another_address" style={styles.addAnotherButton} onPress={() => { setAddressErrors({}); setShowAddressForm((value) => !value); }}><Text style={styles.addAnotherText}>{showAddressForm ? 'Close address form' : '+ Add another address'}</Text></TouchableOpacity> : null}
      {showAddressForm ? <View style={[styles.addressForm, locationError && styles.addressFormError]}><Text style={styles.addressFormTitle}>Pin delivery location *</Text><TouchableOpacity testID="checkout_use_live_location" style={styles.locationButton} onPress={() => void useCurrentLocation()}><Text style={styles.locationButtonText}>Use live location</Text></TouchableOpacity><LeafletMap latitude={Number(addressDraft.latitude) || 17.385} longitude={Number(addressDraft.longitude) || 78.4867} onPinChange={(latitude, longitude) => void setPinnedLocation(latitude, longitude, 'MAP_PIN')} />{locationError ? <Text style={styles.addressErrorText}>A valid pinned delivery location is required.</Text> : null}{(['recipientName', 'phoneE164', 'line1', 'city', 'state', 'pincode'] as CheckoutAddressField[]).map((key) => { const labels: Record<string, string> = { recipientName: 'Recipient name', phoneE164: 'Phone number', line1: 'House, street and area', city: 'City', state: 'State', pincode: 'Pincode' }; const fieldError = addressErrors[key]; return <View key={key}><TextInput testID={`checkout_address_input_${key}`} value={(addressDraft as any)[key]} onChangeText={(value) => { clearAddressError(key); setAddressDraft((current) => ({ ...current, [key]: value })); }} placeholder={`${labels[key]} (required)`} placeholderTextColor="#94A3B8" style={[styles.addressInput, fieldError && styles.addressInputError]} accessibilityLabel={labels[key]} />{fieldError ? <Text style={styles.addressErrorText}>{fieldError}</Text> : null}</View>; })}<TouchableOpacity testID="checkout_save_address_button" disabled={saveAddress.isPending} style={[styles.saveAddressButton, saveAddress.isPending && styles.placeOrderButtonDisabled]} onPress={submitAddress}><Text style={styles.saveAddressText}>{saveAddress.isPending ? 'Saving…' : 'Save and use this address'}</Text></TouchableOpacity></View> : null}

      <Text style={styles.sectionTitle}>Payment Method</Text>
      <View style={styles.paymentRow}><TouchableOpacity testID="checkout_payment_cod" style={[styles.paymentButton, styles.paymentButtonActive]} accessibilityState={{ selected: true }}><Text style={[styles.paymentLabel, styles.paymentLabelActive]}>Cash on Delivery</Text><Text style={styles.paymentMeta}>Pay when the order arrives</Text></TouchableOpacity><TouchableOpacity testID="checkout_payment_online" disabled accessibilityState={{ disabled: true }} style={[styles.paymentButton, { opacity: 0.55, backgroundColor: '#F8FAFC' }]}><Text style={[styles.paymentLabel, { color: '#94A3B8' }]}>Pay Online</Text><Text style={styles.paymentMeta}>Currently unavailable</Text></TouchableOpacity></View>

      <View style={styles.couponHeadingRow}><Text style={styles.sectionTitle}>Coupon</Text><TouchableOpacity testID="checkout_view_deals" style={styles.viewDeals} onPress={() => navigation.navigate('Deals')}><Tag size={14} color="#0F766E" /><Text style={styles.viewDealsText}>Browse deals</Text></TouchableOpacity></View>
      {appliedCoupon ? <View style={styles.appliedCard}><View style={styles.appliedCopy}><BadgePercent size={20} color="#0F766E" /><View style={styles.appliedTextWrap}><Text style={styles.appliedTitle}>{appliedCoupon.name || appliedCoupon.code} applied</Text><Text style={styles.appliedText}>You save ₹{Number(appliedCoupon.discountAmount || discountAmount)}</Text></View></View>{appliedCoupon.applicationMode === 'CODE' ? <TouchableOpacity testID="checkout_remove_coupon" onPress={removeCoupon} accessibilityLabel="Remove coupon"><X size={20} color="#475569" /></TouchableOpacity> : <Text style={styles.autoBadge}>AUTO</Text>}</View> : <View style={styles.couponRow}><TextInput testID="checkout_coupon_input" value={couponInput} onChangeText={(value) => { setCouponInput(value.toUpperCase()); setCouponError(''); }} onSubmitEditing={() => void applyCoupon()} placeholder="Enter coupon code" placeholderTextColor="#94A3B8" autoCapitalize="characters" style={styles.couponInput} /><TouchableOpacity testID="checkout_apply_coupon_button" disabled={couponApplying} style={[styles.applyButton, couponApplying && styles.placeOrderButtonDisabled]} onPress={() => void applyCoupon()}>{couponApplying ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.applyButtonText}>Apply</Text>}</TouchableOpacity></View>}
      {couponError ? <Text style={styles.couponError}>{couponError}</Text> : null}

      <Text style={styles.sectionTitle}>Order Summary</Text>
      <View style={styles.summaryCard}>
        <View style={[styles.freeDeliveryCard, freeDeliveryRemainingPaise === 0 && styles.freeDeliveryUnlocked]}><Text style={styles.freeDeliveryTitle}>{freeDeliveryRemainingPaise === 0 ? 'Free delivery unlocked' : `Add ${formatCheckoutMoney(freeDeliveryRemainingPaise / 100)} for free delivery`}</Text><Text style={styles.freeDeliveryText}>{deliveryRatePaisePerKm != null ? `Delivery at ${formatCheckoutMoney(deliveryRatePaisePerKm / 100)}/km. ` : ''}Free on orders of {formatCheckoutMoney(freeDeliveryMinimumPaise / 100)} or more.</Text></View>
        {items.map((item) => <View key={item.product.id} style={styles.summaryRow}><Text style={styles.summaryText}>{item.product.name} x {item.quantity}</Text><Text style={styles.summaryAmount}>₹{item.product.price * item.quantity}</Text></View>)}
        <View style={styles.summaryDivider} />
        <View style={styles.summaryRow}><Text style={styles.summaryText}>Subtotal</Text><Text style={styles.summaryAmount}>{formatCheckoutMoney(Number(quote?.invoice?.subtotal ?? total()))}</Text></View>
        <View style={styles.summaryRow}><Text style={styles.summaryText}>Delivery Fee{quote?.distanceKm != null ? ` · ${Number(quote.distanceKm).toFixed(1)} km` : ''}</Text><Text style={[styles.summaryAmount, (quote?.invoice?.deliveryFee ?? 0) === 0 && styles.freeDeliveryValue]}>{(quote?.invoice?.deliveryFee ?? 0) === 0 ? 'FREE' : formatCheckoutMoney(Number(quote?.invoice?.deliveryFee || 0))}</Text></View>
        {discountAmount > 0 ? <View style={styles.summaryRow}><Text style={styles.discountLabel}>Offer discount</Text><Text style={styles.discountValue}>-{formatCheckoutMoney(discountAmount)}</Text></View> : null}
        <View style={styles.summaryRow}><Text style={styles.totalLabel}>Grand Total</Text><Text style={styles.totalValue}>{formatCheckoutMoney(Number(quote?.invoice?.grandTotal ?? total()))}</Text></View>
        {quote && quote.serviceable === false ? <Text style={styles.errorText}>This address is currently outside the delivery radius.</Text> : null}
        {quoteFailure ? <Text style={styles.errorText}>{quoteFailure}</Text> : null}
      </View>
      <TouchableOpacity testID="checkout_place_order_button" style={[styles.placeOrderButton, orderDisabled && styles.placeOrderButtonDisabled]} onPress={() => placeOrderMutation.mutate()} disabled={orderDisabled}>{loadingQuote || placeOrderMutation.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.placeOrderText}>{paymentMethod === 'COD' ? 'Place COD Order' : 'Continue to Pay'}</Text>}</TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' }, content: { padding: 16, paddingBottom: 150 }, centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#F8FAFC' }, emptyTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A' }, emptyText: { marginTop: 8, color: '#64748B' }, browseButton: { marginTop: 18, borderRadius: 14, backgroundColor: '#0F766E', paddingHorizontal: 18, paddingVertical: 12 }, browseButtonText: { color: '#FFFFFF', fontWeight: '900' }, sectionTitle: { marginTop: 12, marginBottom: 12, fontSize: 20, fontWeight: '800', color: '#0F172A' },
  checkoutHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 }, backButton: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0' }, checkoutTitle: { color: '#0F172A', fontSize: 22, fontWeight: '900' }, checkoutSubtitle: { marginTop: 2, color: '#64748B', fontSize: 12, fontWeight: '600' },
  addressCard: { backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#E2E8F0', padding: 16, marginBottom: 12 }, addressCardActive: { borderColor: '#0F766E', backgroundColor: '#F0FDFA' }, addressLabel: { fontSize: 12, fontWeight: '800', color: '#0F766E', textTransform: 'uppercase' }, addressName: { marginTop: 6, fontSize: 16, fontWeight: '800', color: '#0F172A' }, addressText: { marginTop: 4, color: '#475569' }, addressPhone: { marginTop: 6, color: '#0F172A', fontWeight: '700' }, noticeCard: { borderRadius: 18, backgroundColor: '#FFF7ED', padding: 16, borderWidth: 1, borderColor: '#FED7AA' }, noticeTitle: { fontSize: 16, fontWeight: '800', color: '#9A3412' }, noticeText: { marginTop: 6, color: '#9A3412' }, inlineAddressButton: { marginTop: 12, alignItems: 'center', borderRadius: 14, backgroundColor: '#9A3412', paddingVertical: 12 }, inlineAddressButtonText: { color: '#FFFFFF', fontWeight: '900' }, addAnotherButton: { alignSelf: 'flex-start', paddingVertical: 8 }, addAnotherText: { color: '#0F766E', fontWeight: '900' }, addressForm: { marginBottom: 16, borderRadius: 20, borderWidth: 1, borderColor: '#99F6E4', backgroundColor: '#F0FDFA', padding: 12, gap: 10 }, addressFormError: { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' }, addressFormTitle: { fontSize: 17, fontWeight: '900', color: '#134E4A' }, locationButton: { alignItems: 'center', borderRadius: 14, backgroundColor: '#0F766E', paddingVertical: 12 }, locationButtonText: { color: '#FFFFFF', fontWeight: '900' }, addressInput: { borderRadius: 13, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', paddingHorizontal: 13, paddingVertical: 11, color: '#0F172A' }, addressInputError: { borderColor: '#EF4444', backgroundColor: '#FEF2F2' }, addressErrorText: { marginTop: 4, color: '#B91C1C', fontSize: 11, lineHeight: 16, fontWeight: '800' }, saveAddressButton: { alignItems: 'center', borderRadius: 14, backgroundColor: '#0F766E', paddingVertical: 14 }, saveAddressText: { color: '#FFFFFF', fontWeight: '900' },
  paymentRow: { gap: 10 }, paymentButton: { borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 16 }, paymentButtonActive: { borderColor: '#0F766E', backgroundColor: '#F0FDFA' }, paymentLabel: { fontSize: 15, fontWeight: '800', color: '#0F172A' }, paymentLabelActive: { color: '#115E59' }, paymentMeta: { marginTop: 6, color: '#64748B', fontSize: 12 }, couponHeadingRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, viewDeals: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 8 }, viewDealsText: { color: '#0F766E', fontSize: 12, fontWeight: '900' }, couponRow: { flexDirection: 'row', gap: 10 }, couponInput: { flex: 1, borderRadius: 15, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', paddingHorizontal: 14, color: '#0F172A', fontWeight: '800' }, applyButton: { justifyContent: 'center', borderRadius: 15, backgroundColor: '#0F172A', paddingHorizontal: 18 }, applyButtonText: { color: '#FFFFFF', fontWeight: '900' }, couponError: { marginTop: 8, color: '#B91C1C', fontSize: 12, fontWeight: '800' }, appliedCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 18, borderWidth: 1, borderColor: '#99F6E4', backgroundColor: '#F0FDFA', padding: 15 }, appliedCopy: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11 }, appliedTextWrap: { flex: 1 }, appliedTitle: { color: '#115E59', fontSize: 14, fontWeight: '900' }, appliedText: { marginTop: 3, color: '#0F766E', fontSize: 12, fontWeight: '700' }, autoBadge: { overflow: 'hidden', borderRadius: 999, backgroundColor: '#EDE9FE', paddingHorizontal: 9, paddingVertical: 5, color: '#6D28D9', fontSize: 10, fontWeight: '900' },
  summaryCard: { borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 16 }, freeDeliveryCard: { marginBottom: 15, borderRadius: 14, borderWidth: 1, borderColor: '#FDE68A', backgroundColor: '#FFFBEB', padding: 12 }, freeDeliveryUnlocked: { borderColor: '#A7F3D0', backgroundColor: '#ECFDF5' }, freeDeliveryTitle: { color: '#065F46', fontWeight: '900', fontSize: 13 }, freeDeliveryText: { marginTop: 3, color: '#64748B', fontSize: 11, fontWeight: '700' }, freeDeliveryValue: { color: '#059669', fontWeight: '900' }, summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10, gap: 12 }, summaryText: { color: '#475569', flex: 1 }, summaryAmount: { color: '#334155', fontWeight: '700' }, summaryDivider: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 8 }, discountLabel: { color: '#0F766E', fontWeight: '800' }, discountValue: { color: '#0F766E', fontWeight: '900' }, totalLabel: { fontSize: 17, fontWeight: '800', color: '#0F172A' }, totalValue: { fontSize: 17, fontWeight: '800', color: '#0F172A' }, errorText: { marginTop: 10, color: '#B91C1C', fontWeight: '700' }, placeOrderButton: { marginTop: 20, borderRadius: 18, backgroundColor: '#0F766E', paddingVertical: 16, alignItems: 'center' }, placeOrderButtonDisabled: { backgroundColor: '#94A3B8' }, placeOrderText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});
