import React from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { useCartStore } from '../../store/cartStore';
import { useNavigation } from '@react-navigation/native';
import { getProductImage } from '@aagam/utils';

export const CartScreen = () => {
  const { items, removeItem, updateQuantity, total, clearCart } = useCartStore();
  const navigation = useNavigation<any>();

  const renderItem = ({ item }: { item: any }) => (
    <View style={styles.cartItem}>
      <Image source={{ uri: getProductImage(item.product) }} style={styles.itemImage} />
      <View style={styles.itemDetails}>
        <Text style={styles.itemName}>{item.product.name}</Text>
        <Text style={styles.itemPrice}>₹{item.product.price}</Text>
        <View style={styles.quantityContainer}>
          <TouchableOpacity onPress={() => updateQuantity(item.product.id, item.quantity - 1)} style={styles.qtyButton}><Text style={styles.qtyLabel}>-</Text></TouchableOpacity>
          <Text style={styles.quantity}>{item.quantity}</Text>
          <TouchableOpacity onPress={() => updateQuantity(item.product.id, item.quantity + 1)} style={styles.qtyButton}><Text style={styles.qtyLabel}>+</Text></TouchableOpacity>
        </View>
      </View>
      <TouchableOpacity onPress={() => removeItem(item.product.id)} style={styles.removeButton}><Text style={styles.removeText}>Remove</Text></TouchableOpacity>
    </View>
  );

  if (items.length === 0) return <View style={styles.centered}><Text style={styles.emptyText}>Your cart is empty</Text></View>;

  return <FlatList data={items} renderItem={renderItem} keyExtractor={(item) => item.product.id} contentContainerStyle={styles.list} ListFooterComponent={<View style={styles.footer}><View style={styles.totalRow}><Text style={styles.totalLabel}>Total Amount:</Text><Text style={styles.totalValue}>₹{total()}</Text></View><TouchableOpacity style={styles.checkoutButton} onPress={() => navigation.navigate('Checkout')}><Text style={styles.checkoutText}>Checkout</Text></TouchableOpacity><TouchableOpacity style={styles.clearButton} onPress={clearCart}><Text style={styles.clearButtonText}>Clear Cart</Text></TouchableOpacity></View>} />;
};

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9f9f9' },
  emptyText: { fontSize: 18, color: '#666' },
  list: { padding: 15, paddingBottom: 170 },
  cartItem: { flexDirection: 'row', backgroundColor: 'white', borderRadius: 10, padding: 10, marginBottom: 15, alignItems: 'center', elevation: 2 },
  itemImage: { width: 70, height: 70, borderRadius: 5 },
  itemDetails: { flex: 1, marginLeft: 15 },
  itemName: { fontSize: 16, fontWeight: 'bold' },
  itemPrice: { fontSize: 14, color: '#0F766E', marginVertical: 5 },
  quantityContainer: { flexDirection: 'row', alignItems: 'center', gap: 15 },
  qtyButton: { padding: 5, paddingHorizontal: 10, backgroundColor: '#f0f0f0', borderRadius: 5 },
  qtyLabel: { fontSize: 18, color: '#0F766E', fontWeight: 'bold' },
  quantity: { fontSize: 16, fontWeight: '600' },
  removeButton: { padding: 10 },
  removeText: { color: 'red', fontSize: 12 },
  footer: { backgroundColor: 'white', padding: 20, borderRadius: 20, marginTop: 5, borderWidth: 1, borderColor: '#E2E8F0', elevation: 8 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  totalLabel: { fontSize: 18, fontWeight: '600' },
  totalValue: { fontSize: 18, fontWeight: 'bold', color: '#0F766E' },
  checkoutButton: { backgroundColor: '#0F766E', paddingVertical: 15, borderRadius: 14, alignItems: 'center', marginBottom: 10 },
  checkoutText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  clearButton: { paddingVertical: 10, alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  clearButtonText: { color: '#64748B', fontWeight: '700' },
});