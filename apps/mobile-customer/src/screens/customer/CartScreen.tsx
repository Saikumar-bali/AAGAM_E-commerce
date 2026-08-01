import React, { useMemo } from 'react';
import { FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Clock3, MapPin, Minus, Plus, Tag, Trash2 } from 'lucide-react-native';
import { getProductImage } from '@aagam/utils';
import { apiClient } from '@aagam/mobile-shared';
import { useCartStore } from '../../store/cartStore';
import { getCartItemCount, getProductMrp } from '../../utils/customerCommerce';
import { CUSTOMER_ADDRESSES_QUERY_KEY } from '../../utils/addressQueries';
import { AagamBrand } from '../../components/AagamBrand';

export const CartScreen = () => {
  const navigation = useNavigation<any>();
  const { items, removeItem, updateQuantity, total, clearCart } = useCartStore();
  const { data: addresses = [] } = useQuery({
    queryKey: CUSTOMER_ADDRESSES_QUERY_KEY,
    queryFn: async () => {
      const response = await apiClient.get('/customer/addresses');
      return Array.isArray(response.data) ? response.data : [];
    },
  });
  const defaultAddress = addresses.find((address: any) => address.isDefault) || addresses[0];
  const itemCount = getCartItemCount(items);
  const savings = useMemo(() => items.reduce((sum, item) => {
    const mrp = getProductMrp(item.product);
    const price = Number(item.product.price || 0);
    return sum + Math.max(0, mrp - price) * item.quantity;
  }, 0), [items]);
  const cartTotal = total();
  const subtotalBeforeSavings = cartTotal + savings;

  if (items.length === 0) {
    return (
      <View style={styles.emptyScreen}>
        <View style={styles.emptyBrand}><AagamBrand compact /></View>
        <View style={styles.emptyIcon}><Tag size={32} color="#0F766E" /></View>
        <Text style={styles.emptyTitle}>Your cart is empty</Text>
        <Text style={styles.emptyText}>Add fresh groceries and essentials to get started.</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('MainTabs', { screen: 'Home' })}>
          <Text style={styles.primaryButtonText}>Start shopping</Text><ArrowRight size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.product.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={(
          <View>
            <View style={styles.brandHeader}><AagamBrand compact /></View>
            <View style={styles.header}><TouchableOpacity style={styles.backButton} onPress={() => navigation.navigate('MainTabs', { screen: 'Home' })} accessibilityLabel="Back to home"><ArrowLeft size={22} color="#0F172A" /></TouchableOpacity><View style={styles.headerCopy}><Text style={styles.title}>My Cart</Text><Text style={styles.subtitle}>{itemCount} {itemCount === 1 ? 'item' : 'items'}{savings > 0 ? ` • ₹${savings} saved` : ''}</Text></View><TouchableOpacity onPress={() => clearCart()} accessibilityLabel="Clear cart"><Trash2 size={20} color="#64748B" /></TouchableOpacity></View>
          </View>
        )}
        renderItem={({ item }) => (
          <View style={styles.cartItem}>
            <Image source={{ uri: getProductImage(item.product) }} style={styles.itemImage} resizeMode="contain" />
            <View style={styles.itemDetails}><Text style={styles.itemName} numberOfLines={2}>{item.product.name}</Text><Text style={styles.measure}>{item.product.unit || item.product.quantityLabel || 'Fresh essential'}</Text><Text style={styles.itemPrice}>₹{item.product.price}</Text><Text style={styles.stockPending}>Availability checked at checkout</Text></View>
            <View style={styles.itemActions}><TouchableOpacity testID="cart_remove_item" onPress={() => removeItem(item.product.id)} accessibilityLabel={`Remove ${item.product.name}`}><Trash2 size={18} color="#64748B" /></TouchableOpacity><View style={styles.quantityContainer}><TouchableOpacity testID="cart_decrease_quantity" onPress={() => updateQuantity(item.product.id, item.quantity - 1)} style={styles.qtyButton}><Minus size={16} color="#0F766E" /></TouchableOpacity><Text style={styles.quantity}>{item.quantity}</Text><TouchableOpacity testID="cart_increase_quantity" onPress={() => updateQuantity(item.product.id, item.quantity + 1)} style={styles.qtyButton}><Plus size={16} color="#0F766E" /></TouchableOpacity></View><Text style={styles.lineTotal}>₹{Number(item.product.price) * item.quantity}</Text></View>
          </View>
        )}
        ListFooterComponent={(
          <View>
            <TouchableOpacity style={styles.couponCard} onPress={() => navigation.navigate('Deals')}><View style={styles.couponIcon}><Tag size={21} color="#FFFFFF" /></View><View style={styles.couponCopy}><Text style={styles.couponTitle}>Got a coupon code?</Text><Text style={styles.couponText}>Save more on your order</Text></View><Text style={styles.applyText}>Apply</Text><ArrowRight size={18} color="#0F766E" /></TouchableOpacity>
            <TouchableOpacity style={styles.infoCard} onPress={() => navigation.navigate('SavedAddresses')}><View style={styles.infoIcon}><MapPin size={21} color="#FFFFFF" /></View><View style={styles.infoCopy}><Text style={styles.infoLabel}>Delivering to</Text><Text style={styles.infoTitle}>{defaultAddress?.label || 'Add a delivery address'}</Text><Text style={styles.infoText}>{defaultAddress ? `${defaultAddress.city}, ${defaultAddress.pincode}` : 'Choose an address before checkout'}</Text></View><Text style={styles.changeText}>{defaultAddress ? 'Change' : 'Add'}</Text></TouchableOpacity>
            <View style={styles.infoCard}><View style={styles.infoIcon}><Clock3 size={21} color="#FFFFFF" /></View><View style={styles.infoCopy}><Text style={styles.infoLabel}>Delivery slot</Text><Text style={styles.infoTitle}>Choose your slot at checkout</Text><Text style={styles.infoText}>Inventory will be checked for your address at checkout</Text></View></View>
            <View style={styles.summaryCard}><View style={styles.summaryRow}><Text style={styles.summaryLabel}>Subtotal ({itemCount} items)</Text><Text style={styles.summaryValue}>₹{subtotalBeforeSavings}</Text></View>{savings > 0 ? <View style={styles.summaryRow}><Text style={styles.savingsLabel}>Savings</Text><Text style={styles.savingsValue}>-₹{savings}</Text></View> : null}<View style={styles.divider} /><View style={styles.totalRow}><View><Text style={styles.totalLabel}>Total Amount</Text><Text style={styles.taxText}>Inclusive of all taxes</Text></View><Text style={styles.totalValue}>₹{cartTotal}</Text></View>{savings > 0 ? <View style={styles.savedStrip}><Text style={styles.savedStripText}>You saved ₹{savings} on this order</Text></View> : null}</View>
            <TouchableOpacity testID="cart_checkout_button" style={styles.checkoutButton} onPress={() => navigation.navigate('Checkout')}><Text style={styles.checkoutText}>Proceed to checkout</Text><ArrowRight size={21} color="#FFFFFF" /></TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' }, list: { padding: 16, paddingBottom: 160 }, header: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 12 }, backButton: { width: 50, height: 50, borderRadius: 17, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }, headerCopy: { flex: 1 }, title: { color: '#0F172A', fontSize: 24, fontWeight: '900' }, subtitle: { marginTop: 3, color: '#0F766E', fontSize: 13, fontWeight: '800' }, cartItem: { flexDirection: 'row', alignItems: 'center', minHeight: 130, marginBottom: 12, padding: 11, borderRadius: 20, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', gap: 10 }, itemImage: { width: 88, height: 88, borderRadius: 15, backgroundColor: '#FFFFFF' }, itemDetails: { flex: 1, alignSelf: 'stretch', justifyContent: 'center' }, itemName: { color: '#0F172A', fontSize: 15, lineHeight: 20, fontWeight: '900' }, measure: { marginTop: 3, color: '#64748B', fontSize: 12, fontWeight: '600' }, itemPrice: { marginTop: 7, color: '#0F172A', fontSize: 16, fontWeight: '900' }, stock: { marginTop: 2, color: '#0F766E', fontSize: 11, fontWeight: '800' }, stockPending: { marginTop: 2, color: '#B45309', fontSize: 11, fontWeight: '800' }, itemActions: { alignItems: 'flex-end', justifyContent: 'space-between', alignSelf: 'stretch', paddingVertical: 2 }, quantityContainer: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', padding: 3, gap: 4 }, qtyButton: { width: 28, height: 28, borderRadius: 9, backgroundColor: '#E6FFFA', alignItems: 'center', justifyContent: 'center' }, quantity: { minWidth: 20, textAlign: 'center', color: '#0F172A', fontWeight: '900' }, lineTotal: { color: '#0F172A', fontSize: 15, fontWeight: '900' }, couponCard: { marginTop: 3, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, borderWidth: 1, borderColor: '#99F6E4', backgroundColor: '#F0FDFA', padding: 13 }, couponIcon: { width: 41, height: 41, borderRadius: 14, backgroundColor: '#0F766E', alignItems: 'center', justifyContent: 'center' }, couponCopy: { flex: 1 }, couponTitle: { color: '#0F172A', fontWeight: '900' }, couponText: { marginTop: 2, color: '#64748B', fontSize: 12, fontWeight: '600' }, applyText: { color: '#0F766E', fontWeight: '900' }, infoCard: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 18, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', padding: 13 }, infoIcon: { width: 41, height: 41, borderRadius: 20, backgroundColor: '#0F766E', alignItems: 'center', justifyContent: 'center' }, infoCopy: { flex: 1 }, infoLabel: { color: '#64748B', fontSize: 11, fontWeight: '700' }, infoTitle: { marginTop: 3, color: '#0F172A', fontSize: 14, fontWeight: '900' }, infoText: { marginTop: 2, color: '#64748B', fontSize: 11, fontWeight: '600' }, changeText: { color: '#0F766E', fontWeight: '900', borderWidth: 1, borderColor: '#0F766E', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7 }, summaryCard: { marginTop: 12, borderRadius: 20, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', padding: 16 }, summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }, summaryLabel: { color: '#475569', fontWeight: '700' }, summaryValue: { color: '#0F172A', fontWeight: '800' }, savingsLabel: { color: '#0F766E', fontWeight: '800' }, savingsValue: { color: '#0F766E', fontWeight: '900' }, divider: { height: 1, marginVertical: 3, backgroundColor: '#E2E8F0' }, totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10 }, totalLabel: { color: '#0F172A', fontSize: 16, fontWeight: '900' }, taxText: { marginTop: 2, color: '#64748B', fontSize: 11, fontWeight: '600' }, totalValue: { color: '#0F172A', fontSize: 24, fontWeight: '900' }, savedStrip: { marginHorizontal: -16, marginBottom: -16, marginTop: 14, alignItems: 'center', borderBottomLeftRadius: 20, borderBottomRightRadius: 20, backgroundColor: '#E6FFFA', paddingVertical: 11 }, savedStripText: { color: '#0F766E', fontSize: 12, fontWeight: '900' }, checkoutButton: { marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 18, backgroundColor: '#0F766E', paddingVertical: 16 }, checkoutText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' }, emptyScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 26, backgroundColor: '#F8FAFC' }, emptyIcon: { width: 76, height: 76, borderRadius: 25, backgroundColor: '#E6FFFA', alignItems: 'center', justifyContent: 'center' }, emptyTitle: { marginTop: 18, color: '#0F172A', fontSize: 22, fontWeight: '900' }, emptyText: { marginTop: 8, color: '#64748B', textAlign: 'center', lineHeight: 20 }, primaryButton: { marginTop: 20, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 16, backgroundColor: '#0F766E', paddingHorizontal: 18, paddingVertical: 13 }, primaryButtonText: { color: '#FFFFFF', fontWeight: '900' },
  brandHeader: { marginBottom: 16 },
  emptyBrand: { position: 'absolute', left: 20, top: 20 },
});
