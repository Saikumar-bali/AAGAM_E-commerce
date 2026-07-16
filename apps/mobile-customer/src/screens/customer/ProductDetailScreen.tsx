import React from 'react';
import { ActivityIndicator, FlatList, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { getProductImage } from '@aagam/utils';
import { apiClient } from '@aagam/mobile-shared';
import { useCartStore } from '../../store/cartStore';

export const ProductDetailScreen = () => {
  const route = useRoute<RouteProp<Record<string, { productId: string }>, string>>();
  const navigation = useNavigation<any>();
  const addItem = useCartStore((state) => state.addItem);
  const productId = route.params?.productId;

  const { data: product, isLoading, error } = useQuery({
    queryKey: ['product', productId],
    queryFn: async () => (await apiClient.get(`/products/${productId}`, { params: { includeAvailability: true } })).data,
    enabled: Boolean(productId),
  });

  const { data: related = [] } = useQuery({
    queryKey: ['related-products', product?.categoryId || product?.category?.id, productId],
    queryFn: async () => {
      const categoryId = product?.categoryId || product?.category?.id;
      const response = await apiClient.get('/products', { params: { categoryId, pageSize: 8 } });
      const items = Array.isArray(response.data) ? response.data : response.data?.items || [];
      return items.filter((item: any) => item.id !== productId).slice(0, 6);
    },
    enabled: Boolean(product?.categoryId || product?.category?.id),
  });

  if (isLoading) return <View style={styles.centered}><ActivityIndicator size="large" color="#0F766E" /></View>;
  if (error || !product) return <View style={styles.centered}><Text style={styles.errorText}>Unable to load product details.</Text></View>;

  const inStock = product.availability?.inStock ?? true;
  const productImage = getProductImage(product);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Image source={{ uri: productImage }} style={styles.image} />
      <Text style={styles.category}>{product.category?.name || 'General'}</Text>
      <Text style={styles.name}>{product.name}</Text>
      <Text style={styles.price}>₹{product.price}</Text>
      <Text style={styles.description}>{product.description || 'Freshly stocked and available for delivery.'}</Text>
      <View style={styles.card}><Text style={styles.cardTitle}>Availability</Text><Text style={[styles.stockText, !inStock && styles.stockTextOut]}>{inStock ? 'In stock and ready to order' : 'Currently out of stock'}</Text>{product.availability?.storeName ? <Text style={styles.detailText}>Nearest store: {product.availability.storeName}</Text> : null}</View>
      <TouchableOpacity style={[styles.addButton, !inStock && styles.addButtonDisabled]} disabled={!inStock} onPress={() => addItem(product)}><Text style={styles.addButtonText}>{inStock ? 'Add to Cart' : 'Unavailable'}</Text></TouchableOpacity>
      {related.length > 0 ? <View style={styles.relatedSection}><Text style={styles.relatedTitle}>You may also like</Text><FlatList horizontal data={related} keyExtractor={(item) => item.id} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.relatedList} renderItem={({ item }) => { const image = getProductImage(item); const itemInStock = item.availability?.inStock ?? true; return <TouchableOpacity style={styles.relatedCard} onPress={() => navigation.push('ProductDetail', { productId: item.id })}><Image source={{ uri: image }} style={styles.relatedImage} /><Text style={styles.relatedName} numberOfLines={2}>{item.name}</Text><Text style={styles.relatedPrice}>₹{item.price}</Text><TouchableOpacity disabled={!itemInStock} onPress={(event) => { event.stopPropagation(); addItem(item); }} style={[styles.relatedButton, !itemInStock && styles.addButtonDisabled]}><Text style={styles.relatedButtonText}>{itemInStock ? 'Add' : 'Out'}</Text></TouchableOpacity></TouchableOpacity>; }} /></View> : null}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 16, paddingBottom: 150 },
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
  relatedSection: { marginTop: 26 },
  relatedTitle: { fontSize: 20, fontWeight: '900', color: '#0F172A', marginBottom: 12 },
  relatedList: { gap: 12, paddingRight: 16 },
  relatedCard: { width: 150, backgroundColor: '#FFFFFF', borderRadius: 18, padding: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  relatedImage: { width: '100%', height: 96, borderRadius: 14, backgroundColor: '#E2E8F0' },
  relatedName: { marginTop: 8, color: '#0F172A', fontWeight: '800', minHeight: 38 },
  relatedPrice: { marginTop: 4, color: '#0F766E', fontWeight: '900' },
  relatedButton: { marginTop: 8, backgroundColor: '#0F766E', borderRadius: 999, alignItems: 'center', paddingVertical: 8 },
  relatedButtonText: { color: '#FFFFFF', fontWeight: '900', fontSize: 12 },
});
