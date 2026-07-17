import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigation, useRoute } from '@react-navigation/native';
import { BadgePercent, Tag, X } from 'lucide-react-native';
import { apiClient } from '@aagam/mobile-shared';
import { useCartStore } from '../../store/cartStore';

const errorMessage = (error: any, fallback: string) => {
  const message = error?.response?.data?.message || error?.message;
  return Array.isArray(message) ? message.join(', ') : message || fallback;
};

export const CheckoutScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { items, total, clearCart, couponCode, setCouponCode } = useCartStore();
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'ONLINE'>('COD');
  const [couponInput, setCouponInput] = useState(couponCode || '');
  const [appliedCouponCode, setAppliedCouponCode] = useState(couponCode || '');
  const [couponError, setCouponError] = useState('');
  const idempotencyKey = useRef(`mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const lastRequestedCoupon = useRef('');
  const itemsPayload = useMemo(
    () => items.map((item) => ({ productId: item.product.id, quantity: item.quantity })),
    [items],
  );

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

  useEffect(() => {
    if (!quoteError) return;
    if (appliedCouponCode) {
      setCouponError(errorMessage(quoteError, 'This coupon could not be applied.'));
      setAppliedCouponCode('');
      setCouponCode(null);
    }
  }, [appliedCouponCode, quoteError, setCouponCode]);

  const applyCoupon = () => {
    const next = couponInput.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,32}$/.test(next)) {
      setCouponError('Enter a valid coupon code.');
      return;
    }
    setCouponError('');
    setCouponInput(next);
    setAppliedCouponCode(next);
    setCouponCode(next);
  };

  const removeCoupon = () => {
    setCouponInput('');
    setAppliedCouponCode('');
    setCouponCode(null);
    setCouponError('');
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
      Alert.alert(
        'Order placed',
        paymentMethod === 'ONLINE'
          ? 'Your order is waiting for payment confirmation.'
          : 'Your COD order has been confirmed.',
        [{ text: 'View Order', onPress: () => navigation.replace('OrderDetail', { orderId }) }],
      );
    },
    onError: (error: any) => {
      Alert.alert('Checkout failed', errorMessage(error, 'Failed to place order'));
      void refetchQuote();
    },
  });

  if (items.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>Your cart is empty.</Text>
        <Text style={styles.emptyText}>Add a few items before checking out.</Text>
        <TouchableOpacity style={styles.browseButton} onPress={() => navigation.navigate('MainTabs', { screen: 'Shop' })}>
          <Text style={styles.browseButtonText}>Browse products</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (loadingAddresses) return <View style={styles.centered}><ActivityIndicator size="large" color="#0F766E" /></View>;

  const discountAmount = Number(quote?.invoice?.discountAmount || 0);
  const appliedCoupon = quote?.appliedCoupon;
  const quoteFailure = quoteError && !appliedCouponCode
    ? errorMessage(quoteError, 'Failed to calculate the latest total.')
    : '';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.sectionTitle}>Delivery Address</Text>
      {addresses.map((address: any) => {
        const active = selectedAddressId === address.id;
        return (
          <TouchableOpacity key={address.id} style={[styles.addressCard, active && styles.addressCardActive]} onPress={() => setSelectedAddressId(address.id)}>
            <Text style={styles.addressLabel}>{address.label || 'Address'} {active ? '• Selected' : ''}</Text>
            <Text style={styles.addressName}>{address.recipientName}</Text>
            <Text style={styles.addressText}>{address.line1}{address.line2 ? `, ${address.line2}` : ''}</Text>
            <Text style={styles.addressText}>{address.city}, {address.state} - {address.pincode}</Text>
            <Text style={styles.addressPhone}>{address.phoneE164}</Text>
          </TouchableOpacity>
        );
      })}
      {addresses.length === 0 ? (
        <View style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>No saved address yet</Text>
          <Text style={styles.noticeText}>Open the Profile tab to add your delivery address first.</Text>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Payment Method</Text>
      <View style={styles.paymentRow}>
        {(['COD', 'ONLINE'] as const).map((option) => {
          const active = paymentMethod === option;
          return (
            <TouchableOpacity key={option} style={[styles.paymentButton, active && styles.paymentButtonActive]} onPress={() => setPaymentMethod(option)}>
              <Text style={[styles.paymentLabel, active && styles.paymentLabelActive]}>{option === 'COD' ? 'Cash on Delivery' : 'Pay Online'}</Text>
              <Text style={styles.paymentMeta}>{option === 'COD' ? 'Pay when the order arrives' : 'Simulated payment capture'}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.couponHeadingRow}>
        <Text style={styles.sectionTitle}>Coupon</Text>
        <TouchableOpacity style={styles.viewDeals} onPress={() => navigation.navigate('Deals')}>
          <Tag size={14} color="#0F766E" /><Text style={styles.viewDealsText}>Browse deals</Text>
        </TouchableOpacity>
      </View>
      {appliedCoupon ? (
        <View style={styles.appliedCard}>
          <View style={styles.appliedCopy}>
            <BadgePercent size={20} color="#0F766E" />
            <View style={styles.appliedTextWrap}>
              <Text style={styles.appliedTitle}>{appliedCoupon.name || appliedCoupon.code} applied</Text>
              <Text style={styles.appliedText}>You save ₹{Number(appliedCoupon.discountAmount || discountAmount)}</Text>
            </View>
          </View>
          {appliedCoupon.applicationMode === 'CODE' ? (
            <TouchableOpacity onPress={removeCoupon} accessibilityLabel="Remove coupon"><X size={20} color="#475569" /></TouchableOpacity>
          ) : <Text style={styles.autoBadge}>AUTO</Text>}
        </View>
      ) : (
        <View style={styles.couponRow}>
          <TextInput
            value={couponInput}
            onChangeText={(value) => { setCouponInput(value.toUpperCase()); setCouponError(''); }}
            onSubmitEditing={applyCoupon}
            placeholder="Enter coupon code"
            placeholderTextColor="#94A3B8"
            autoCapitalize="characters"
            style={styles.couponInput}
          />
          <TouchableOpacity style={styles.applyButton} onPress={applyCoupon}><Text style={styles.applyButtonText}>Apply</Text></TouchableOpacity>
        </View>
      )}
      {couponError ? <Text style={styles.couponError}>{couponError}</Text> : null}

      <Text style={styles.sectionTitle}>Order Summary</Text>
      <View style={styles.summaryCard}>
        {items.map((item) => <View key={item.product.id} style={styles.summaryRow}><Text style={styles.summaryText}>{item.product.name} x {item.quantity}</Text><Text style={styles.summaryAmount}>₹{item.product.price * item.quantity}</Text></View>)}
        <View style={styles.summaryDivider} />
        <View style={styles.summaryRow}><Text style={styles.summaryText}>Subtotal</Text><Text style={styles.summaryAmount}>₹{quote?.invoice?.subtotal ?? total()}</Text></View>
        <View style={styles.summaryRow}><Text style={styles.summaryText}>Delivery Fee</Text><Text style={styles.summaryAmount}>₹{quote?.invoice?.deliveryFee ?? 0}</Text></View>
        {discountAmount > 0 ? <View style={styles.summaryRow}><Text style={styles.discountLabel}>Offer discount</Text><Text style={styles.discountValue}>-₹{discountAmount}</Text></View> : null}
        <View style={styles.summaryRow}><Text style={styles.totalLabel}>Grand Total</Text><Text style={styles.totalValue}>₹{quote?.invoice?.grandTotal ?? total()}</Text></View>
        {quote && quote.serviceable === false ? <Text style={styles.errorText}>This address is currently outside the delivery radius.</Text> : null}
        {quoteFailure ? <Text style={styles.errorText}>{quoteFailure}</Text> : null}
      </View>
      <TouchableOpacity
        style={[styles.placeOrderButton, (!selectedAddressId || loadingQuote || placeOrderMutation.isPending || quote?.serviceable === false || Boolean(quoteFailure)) && styles.placeOrderButtonDisabled]}
        onPress={() => placeOrderMutation.mutate()}
        disabled={!selectedAddressId || loadingQuote || placeOrderMutation.isPending || quote?.serviceable === false || Boolean(quoteFailure)}
      >
        {loadingQuote || placeOrderMutation.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.placeOrderText}>{paymentMethod === 'COD' ? 'Place COD Order' : 'Continue to Pay'}</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 16, paddingBottom: 150 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#F8FAFC' },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  emptyText: { marginTop: 8, color: '#64748B' },
  browseButton: { marginTop: 18, borderRadius: 14, backgroundColor: '#0F766E', paddingHorizontal: 18, paddingVertical: 12 },
  browseButtonText: { color: '#FFFFFF', fontWeight: '900' },
  sectionTitle: { marginTop: 12, marginBottom: 12, fontSize: 20, fontWeight: '800', color: '#0F172A' },
  addressCard: { backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#E2E8F0', padding: 16, marginBottom: 12 },
  addressCardActive: { borderColor: '#0F766E', backgroundColor: '#F0FDFA' },
  addressLabel: { fontSize: 12, fontWeight: '800', color: '#0F766E', textTransform: 'uppercase' },
  addressName: { marginTop: 6, fontSize: 16, fontWeight: '800', color: '#0F172A' },
  addressText: { marginTop: 4, color: '#475569' },
  addressPhone: { marginTop: 6, color: '#0F172A', fontWeight: '700' },
  noticeCard: { borderRadius: 18, backgroundColor: '#FFF7ED', padding: 16, borderWidth: 1, borderColor: '#FED7AA' },
  noticeTitle: { fontSize: 16, fontWeight: '800', color: '#9A3412' },
  noticeText: { marginTop: 6, color: '#9A3412' },
  paymentRow: { gap: 10 },
  paymentButton: { borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 16 },
  paymentButtonActive: { borderColor: '#0F766E', backgroundColor: '#F0FDFA' },
  paymentLabel: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  paymentLabelActive: { color: '#115E59' },
  paymentMeta: { marginTop: 6, color: '#64748B', fontSize: 12 },
  couponHeadingRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  viewDeals: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 8 },
  viewDealsText: { color: '#0F766E', fontSize: 12, fontWeight: '900' },
  couponRow: { flexDirection: 'row', gap: 10 },
  couponInput: { flex: 1, borderRadius: 15, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', paddingHorizontal: 14, color: '#0F172A', fontWeight: '800' },
  applyButton: { justifyContent: 'center', borderRadius: 15, backgroundColor: '#0F172A', paddingHorizontal: 18 },
  applyButtonText: { color: '#FFFFFF', fontWeight: '900' },
  couponError: { marginTop: 8, color: '#B91C1C', fontSize: 12, fontWeight: '800' },
  appliedCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 18, borderWidth: 1, borderColor: '#99F6E4', backgroundColor: '#F0FDFA', padding: 15 },
  appliedCopy: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11 },
  appliedTextWrap: { flex: 1 },
  appliedTitle: { color: '#115E59', fontSize: 14, fontWeight: '900' },
  appliedText: { marginTop: 3, color: '#0F766E', fontSize: 12, fontWeight: '700' },
  autoBadge: { overflow: 'hidden', borderRadius: 999, backgroundColor: '#EDE9FE', paddingHorizontal: 9, paddingVertical: 5, color: '#6D28D9', fontSize: 10, fontWeight: '900' },
  summaryCard: { borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 16 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10, gap: 12 },
  summaryText: { color: '#475569', flex: 1 },
  summaryAmount: { color: '#334155', fontWeight: '700' },
  summaryDivider: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 8 },
  discountLabel: { color: '#0F766E', fontWeight: '800' },
  discountValue: { color: '#0F766E', fontWeight: '900' },
  totalLabel: { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  totalValue: { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  errorText: { marginTop: 10, color: '#B91C1C', fontWeight: '700' },
  placeOrderButton: { marginTop: 20, borderRadius: 18, backgroundColor: '#0F766E', paddingVertical: 16, alignItems: 'center' },
  placeOrderButtonDisabled: { backgroundColor: '#94A3B8' },
  placeOrderText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});
