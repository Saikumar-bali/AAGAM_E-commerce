import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { apiClient } from '@aagam/mobile-shared';
import { useCartStore } from '../../store/cartStore';

export const CheckoutScreen = () => {
  const navigation = useNavigation<any>();
  const { items, total, clearCart } = useCartStore();
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'ONLINE'>('COD');
  const itemsPayload = useMemo(() => items.map((item) => ({ productId: item.product.id, quantity: item.quantity })), [items]);
  const { data: addresses = [], isLoading: loadingAddresses } = useQuery({ queryKey: ['addresses'], queryFn: async () => { const response = await apiClient.get('/customer/addresses'); const next = Array.isArray(response.data) ? response.data : []; if (next.length > 0 && !selectedAddressId) { const defaultAddress = next.find((address: any) => address.isDefault) || next[0]; setSelectedAddressId(defaultAddress.id); } return next; } });
  const { data: quote, isLoading: loadingQuote, refetch: refetchQuote } = useQuery({ queryKey: ['quote', itemsPayload, selectedAddressId], queryFn: async () => (await apiClient.post('/checkout/quote', { items: itemsPayload, addressId: selectedAddressId })).data, enabled: itemsPayload.length > 0 && Boolean(selectedAddressId) });
  const placeOrderMutation = useMutation({ mutationFn: async () => apiClient.post('/checkout/place-order', { items: itemsPayload, addressId: selectedAddressId, paymentMethod }), onSuccess: (response) => { clearCart(); const orderId = response.data?.id; Alert.alert('Order placed', paymentMethod === 'ONLINE' ? 'Your order is waiting for payment confirmation.' : 'Your COD order has been confirmed.', [{ text: 'View Order', onPress: () => navigation.replace('OrderDetail', { orderId }) }]); }, onError: (error: any) => { Alert.alert('Checkout failed', error.response?.data?.message || 'Failed to place order'); refetchQuote(); } });
  if (items.length === 0) return <View style={styles.centered}><Text style={styles.emptyTitle}>Your cart is empty.</Text><Text style={styles.emptyText}>Add a few items before checking out.</Text></View>;
  if (loadingAddresses) return <View style={styles.centered}><ActivityIndicator size="large" color="#0F766E" /></View>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Delivery Address</Text>
      {addresses.map((address: any) => { const active = selectedAddressId === address.id; return <TouchableOpacity key={address.id} style={[styles.addressCard, active && styles.addressCardActive]} onPress={() => setSelectedAddressId(address.id)}><Text style={styles.addressLabel}>{address.label || 'Address'} {active ? '• Selected' : ''}</Text><Text style={styles.addressName}>{address.recipientName}</Text><Text style={styles.addressText}>{address.line1}{address.line2 ? `, ${address.line2}` : ''}</Text><Text style={styles.addressText}>{address.city}, {address.state} - {address.pincode}</Text><Text style={styles.addressPhone}>{address.phoneE164}</Text></TouchableOpacity>; })}
      {addresses.length === 0 ? <View style={styles.noticeCard}><Text style={styles.noticeTitle}>No saved address yet</Text><Text style={styles.noticeText}>Open the Profile tab to add your delivery address first.</Text></View> : null}
      <Text style={styles.sectionTitle}>Payment Method</Text>
      <View style={styles.paymentRow}>{(['COD', 'ONLINE'] as const).map((option) => { const active = paymentMethod === option; return <TouchableOpacity key={option} style={[styles.paymentButton, active && styles.paymentButtonActive]} onPress={() => setPaymentMethod(option)}><Text style={[styles.paymentLabel, active && styles.paymentLabelActive]}>{option === 'COD' ? 'Cash on Delivery' : 'Pay Online'}</Text><Text style={styles.paymentMeta}>{option === 'COD' ? 'Pay when the order arrives' : 'Simulated payment capture'}</Text></TouchableOpacity>; })}</View>
      <Text style={styles.sectionTitle}>Order Summary</Text>
      <View style={styles.summaryCard}>{items.map((item) => <View key={item.product.id} style={styles.summaryRow}><Text style={styles.summaryText}>{item.product.name} x {item.quantity}</Text><Text style={styles.summaryText}>₹{item.product.price * item.quantity}</Text></View>)}<View style={styles.summaryDivider} /><View style={styles.summaryRow}><Text style={styles.summaryText}>Subtotal</Text><Text style={styles.summaryText}>₹{quote?.invoice?.subtotal ?? total()}</Text></View><View style={styles.summaryRow}><Text style={styles.summaryText}>Delivery Fee</Text><Text style={styles.summaryText}>₹{quote?.invoice?.deliveryFee ?? 0}</Text></View><View style={styles.summaryRow}><Text style={styles.totalLabel}>Grand Total</Text><Text style={styles.totalValue}>₹{quote?.invoice?.grandTotal ?? total()}</Text></View>{quote && quote.serviceable === false ? <Text style={styles.errorText}>This address is currently outside the delivery radius.</Text> : null}</View>
      <TouchableOpacity style={[styles.placeOrderButton, (!selectedAddressId || placeOrderMutation.isPending || quote?.serviceable === false) && styles.placeOrderButtonDisabled]} onPress={() => placeOrderMutation.mutate()} disabled={!selectedAddressId || placeOrderMutation.isPending || quote?.serviceable === false}>{loadingQuote || placeOrderMutation.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.placeOrderText}>{paymentMethod === 'COD' ? 'Place COD Order' : 'Continue to Pay'}</Text>}</TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 16, paddingBottom: 150 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  emptyText: { marginTop: 8, color: '#64748B' },
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
  summaryCard: { borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 16 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10, gap: 12 },
  summaryText: { color: '#475569', flex: 1 },
  summaryDivider: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 8 },
  totalLabel: { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  totalValue: { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  errorText: { marginTop: 10, color: '#B91C1C', fontWeight: '700' },
  placeOrderButton: { marginTop: 20, borderRadius: 18, backgroundColor: '#0F766E', paddingVertical: 16, alignItems: 'center' },
  placeOrderButtonDisabled: { backgroundColor: '#94A3B8' },
  placeOrderText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});
