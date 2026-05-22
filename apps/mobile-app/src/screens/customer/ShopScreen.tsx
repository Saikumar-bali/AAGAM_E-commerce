import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { getProductImage } from '@aagam/utils';
import { apiClient } from '../../api/client';
import { useCartStore } from '../../store/cartStore';

const SORT_OPTIONS = [
  { label: 'Newest', value: 'newest' },
  { label: 'Low-High', value: 'price_asc' },
  { label: 'High-Low', value: 'price_desc' },
];

export const ShopScreen = () => {
  const navigation = useNavigation<any>();
  const addItem = useCartStore((state) => state.addItem);
  const [query, setQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [sort, setSort] = useState('newest');

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const response = await apiClient.get('/products/categories');
      return Array.isArray(response.data) ? response.data : [];
    },
  });

  const { data: products, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['products', query, selectedCategoryId, sort],
    queryFn: async () => {
      const response = await apiClient.get('/products', {
        params: {
          search: query || undefined,
          categoryId: selectedCategoryId || undefined,
          sort,
        },
      });
      return Array.isArray(response.data) ? response.data : response.data?.items || [];
    },
  });

  const categoryPills = useMemo(
    () => [{ id: '', name: 'All' }, ...categories],
    [categories],
  );

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0F766E" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Failed to load products. Make sure the API is running.</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Shop Groceries</Text>
        <Text style={styles.subtitle}>Search, filter, compare, and add to cart.</Text>

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search products"
          placeholderTextColor="#94A3B8"
          style={styles.searchInput}
        />

        <FlatList
          data={categoryPills}
          horizontal
          keyExtractor={(item) => item.id || 'all'}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryList}
          renderItem={({ item }) => {
            const active = selectedCategoryId === item.id;
            return (
              <TouchableOpacity
                style={[styles.categoryPill, active && styles.categoryPillActive]}
                onPress={() => setSelectedCategoryId(item.id)}
              >
                <Text style={[styles.categoryPillText, active && styles.categoryPillTextActive]}>
                  {item.name}
                </Text>
              </TouchableOpacity>
            );
          }}
        />

        <View style={styles.sortRow}>
          {SORT_OPTIONS.map((option) => {
            const active = option.value === sort;
            return (
              <TouchableOpacity
                key={option.value}
                style={[styles.sortButton, active && styles.sortButtonActive]}
                onPress={() => setSort(option.value)}
              >
                <Text style={[styles.sortButtonText, active && styles.sortButtonTextActive]}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <FlatList
        data={products}
        numColumns={2}
        columnWrapperStyle={styles.productRow}
        renderItem={({ item }) => {
          const inStock = item.availability?.inStock ?? true;
          const productImage = getProductImage(item);
          return (
            <TouchableOpacity
              style={styles.productCard}
              onPress={() => navigation.navigate('ProductDetail', { productId: item.id })}
              activeOpacity={0.92}
            >
              <Image
                source={{ uri: productImage }}
                style={styles.productImage}
              />
              <View style={styles.productInfo}>
                <Text style={styles.productCategory}>{item.category?.name || 'General'}</Text>
                <Text style={styles.productName}>{item.name}</Text>
                <Text numberOfLines={2} style={styles.productDescription}>
                  {item.description || 'Fast local delivery available.'}
                </Text>
                <View style={styles.cardFooter}>
                  <View>
                    <Text style={styles.productPrice}>₹{item.price}</Text>
                    <Text style={[styles.stockText, !inStock && styles.stockTextOut]}>
                      {inStock ? 'In stock' : 'Out of stock'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.addButton, !inStock && styles.addButtonDisabled]}
                    disabled={!inStock}
                    onPress={() => addItem(item)}
                  >
                    <Text style={styles.addButtonText}>Add</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        refreshing={isRefetching}
        onRefresh={refetch}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>No products found</Text>
            <Text style={styles.emptyText}>Try a different search or category.</Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  header: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8 },
  title: { fontSize: 28, fontWeight: '800', color: '#0F172A' },
  subtitle: { marginTop: 4, fontSize: 14, color: '#64748B' },
  searchInput: {
    marginTop: 16,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#0F172A',
  },
  categoryList: { paddingTop: 14, paddingBottom: 6 },
  categoryPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#E2E8F0',
    marginRight: 8,
  },
  categoryPillActive: { backgroundColor: '#0F766E' },
  categoryPillText: { color: '#0F172A', fontWeight: '700' },
  categoryPillTextActive: { color: '#FFFFFF' },
  sortRow: { flexDirection: 'row', marginTop: 10, gap: 8 },
  sortButton: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  sortButtonActive: { borderColor: '#0F766E', backgroundColor: '#CCFBF1' },
  sortButtonText: { color: '#334155', fontWeight: '700', fontSize: 12 },
  sortButtonTextActive: { color: '#115E59' },
  listContainer: { paddingHorizontal: 16, paddingBottom: 24 },
  productRow: { gap: 12 },
  productCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    marginHorizontal: 0,
    marginBottom: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  productImage: { width: '100%', height: 112, resizeMode: 'cover' },
  productInfo: { padding: 12 },
  productCategory: { fontSize: 11, fontWeight: '800', color: '#0F766E', textTransform: 'uppercase' },
  productName: { marginTop: 4, fontSize: 15, fontWeight: '800', color: '#0F172A' },
  productDescription: { marginTop: 6, fontSize: 12, lineHeight: 16, color: '#64748B' },
  cardFooter: { marginTop: 12, gap: 8 },
  productPrice: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  stockText: { marginTop: 3, fontSize: 12, color: '#0F766E', fontWeight: '700' },
  stockTextOut: { color: '#DC2626' },
  addButton: { backgroundColor: '#0F766E', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999 },
  addButtonDisabled: { backgroundColor: '#94A3B8' },
  addButtonText: { color: '#FFFFFF', fontWeight: '800' },
  errorText: { color: '#B91C1C', textAlign: 'center', marginBottom: 12 },
  retryButton: { backgroundColor: '#0F766E', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 },
  retryButtonText: { color: '#FFFFFF', fontWeight: '700' },
  emptyContainer: { paddingTop: 50, alignItems: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  emptyText: { marginTop: 8, color: '#64748B' },
});
