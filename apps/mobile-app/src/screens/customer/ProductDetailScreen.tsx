import React from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { useCartStore } from '../../store/cartStore';

export const ProductDetailScreen = () => {
  const route = useRoute<RouteProp<Record<string, { productId: string }>, string>>();
  const addItem = useCartStore((state) => state.addItem);
  const productId = route.params?.productId;

  const { data: product, isLoading, error } = useQuery({
    queryKey: ['product', productId],
    queryFn: async () => {
      const response = await apiClient.get(`/products/${productId}`);
      return response.data;
    },
    enabled: Boolean(productId),
  });

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0F766E" />
      </View>
    );
  }

  if (error || !product) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Unable to load product details.</Text>
      </View>
    );
  }

  const inStock = product.availability?.inStock ?? true;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Image source={{ uri: product.image || 'https://via.placeholder.com/400' }} style={styles.image} />
      <Text style={styles.category}>{product.category?.name || 'General'}</Text>
      <Text style={styles.name}>{product.name}</Text>
      <Text style={styles.price}>₹{product.price}</Text>
      <Text style={styles.description}>{product.description || 'Freshly stocked and available for delivery.'}</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Availability</Text>
        <Text style={[styles.stockText, !inStock && styles.stockTextOut]}>
          {inStock ? 'In stock and ready to order' : 'Currently out of stock'}
        </Text>
        {product.availability?.storeName ? (
          <Text style={styles.detailText}>Nearest store: {product.availability.storeName}</Text>
        ) : null}
      </View>

      <TouchableOpacity
        style={[styles.addButton, !inStock && styles.addButtonDisabled]}
        disabled={!inStock}
        onPress={() => addItem(product)}
      >
        <Text style={styles.addButtonText}>{inStock ? 'Add to Cart' : 'Unavailable'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  image: { width: '100%', height: 280, borderRadius: 24, backgroundColor: '#E2E8F0' },
  category: { marginTop: 18, fontSize: 12, fontWeight: '800', color: '#0F766E', textTransform: 'uppercase' },
  name: { marginTop: 8, fontSize: 28, fontWeight: '800', color: '#0F172A' },
  price: { marginTop: 10, fontSize: 26, fontWeight: '800', color: '#111827' },
  description: { marginTop: 14, fontSize: 15, lineHeight: 24, color: '#475569' },
  card: { marginTop: 20, borderRadius: 20, backgroundColor: '#FFFFFF', padding: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  stockText: { marginTop: 10, color: '#0F766E', fontWeight: '700' },
  stockTextOut: { color: '#DC2626' },
  detailText: { marginTop: 8, color: '#64748B' },
  addButton: { marginTop: 24, backgroundColor: '#0F766E', borderRadius: 18, paddingVertical: 16, alignItems: 'center' },
  addButtonDisabled: { backgroundColor: '#94A3B8' },
  addButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
  errorText: { color: '#B91C1C', fontWeight: '700' },
});
