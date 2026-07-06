import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { getProductImage } from '@aagam/utils';
import { apiClient } from '@aagam/mobile-shared';
import { useCartStore } from '../../store/cartStore';
import { SlidersHorizontal } from 'lucide-react-native';

const SORT_OPTIONS = [
  { label: 'Newest', value: 'newest' },
  { label: 'Low-High', value: 'price_asc' },
  { label: 'High-Low', value: 'price_desc' },
];

const isUnavailable = (product: any) => Boolean(product.availability) && product.availability?.inStock === false;

export const ShopScreen = () => {
  const navigation = useNavigation<any>();
  const addItem = useCartStore((state) => state.addItem);
  const [query, setQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [sort, setSort] = useState('newest');
  const [sortMenuVisible, setSortMenuVisible] = useState(false);

  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: async () => { const response = await apiClient.get('/products/categories'); return Array.isArray(response.data) ? response.data : []; } });
  const { data: products, isLoading, error, refetch, isRefetching } = useQuery({ queryKey: ['products', query, selectedCategoryId, sort], queryFn: async () => { const response = await apiClient.get('/products', { params: { search: query || undefined, categoryId: selectedCategoryId || undefined, sort } }); const rows = Array.isArray(response.data) ? response.data : response.data?.items || []; return [...rows].sort((a, b) => { const aUnavailable = isUnavailable(a); const bUnavailable = isUnavailable(b); if (aUnavailable !== bUnavailable) return aUnavailable ? 1 : -1; return 0; }); } });
  const categoryPills = useMemo(() => [{ id: '', name: 'All' }, ...categories], [categories]);

  if (isLoading) return <View style={styles.centered}><ActivityIndicator size="large" color="#0F766E" /></View>;
  if (error) return <View style={styles.centered}><Text style={styles.errorText}>Failed to load products. Make sure the API is running.</Text><TouchableOpacity style={styles.retryButton} onPress={() => refetch()}><Text style={styles.retryButtonText}>Try Again</Text></TouchableOpacity></View>;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.logoMark}><Text style={styles.logoMarkText}>A</Text></View>
          <View><Text style={styles.logoText}>aagam</Text><Text style={styles.subtitle}>Quick commerce, delivered fast.</Text></View>
        </View>
        <TextInput value={query} onChangeText={setQuery} placeholder="Search products" placeholderTextColor="#94A3B8" style={styles.searchInput} />
        <View style={styles.filterRow}>
          <FlatList data={categoryPills} horizontal keyExtractor={(item) => item.id || 'all'} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryList} renderItem={({ item }) => { const active = selectedCategoryId === item.id; return <TouchableOpacity style={[styles.categoryPill, active && styles.categoryPillActive]} onPress={() => setSelectedCategoryId(item.id)}><Text style={[styles.categoryPillText, active && styles.categoryPillTextActive]}>{item.name}</Text></TouchableOpacity>; }} />
          <TouchableOpacity style={styles.sortIcon} onPress={() => setSortMenuVisible(true)}><SlidersHorizontal size={18} color="#0F766E" /></TouchableOpacity>
        </View>
        <Modal visible={sortMenuVisible} transparent animationType="fade" onRequestClose={() => setSortMenuVisible(false)}><Pressable style={styles.modalOverlay} onPress={() => setSortMenuVisible(false)}><View style={styles.modalSheet}><Text style={styles.modalTitle}>Sort by</Text>{SORT_OPTIONS.map((option) => { const active = option.value === sort; return <TouchableOpacity key={option.value} style={[styles.modalOption, active && styles.modalOptionActive]} onPress={() => { setSort(option.value); setSortMenuVisible(false); }}><Text style={[styles.modalOptionText, active && styles.modalOptionTextActive]}>{option.label}</Text>{active && <Text style={styles.checkmark}>✓</Text>}</TouchableOpacity>; })}</View></Pressable></Modal>
      </View>
      <FlatList
        data={products}
        numColumns={2}
        columnWrapperStyle={styles.productRow}
        renderItem={({ item }) => {
          const unavailable = isUnavailable(item);
          const inStock = item.availability?.inStock ?? true;
          const productImage = getProductImage(item);
          return (
            <TouchableOpacity
              style={[styles.productCard, unavailable && styles.productCardDisabled]}
              disabled={unavailable}
              onPress={() => navigation.navigate('ProductDetail', { productId: item.id })}
              activeOpacity={0.92}
            >
              <View style={styles.imageWrap}>
                <Image source={{ uri: productImage }} style={[styles.productImage, unavailable && styles.productImageDisabled]} />
                {unavailable && <View style={styles.unavailableOverlay}><Text style={styles.unavailableBadge}>Unavailable</Text></View>}
              </View>
              <View style={styles.productInfo}>
                <Text style={styles.productCategory}>{item.category?.name || 'General'}</Text>
                <Text style={[styles.productName, unavailable && styles.productNameDisabled]}>{item.name}</Text>
                <Text numberOfLines={2} style={styles.productDescription}>{item.description || 'Fast local delivery available.'}</Text>
                <View style={styles.cardFooter}>
                  <View><Text style={[styles.productPrice, unavailable && styles.productNameDisabled]}>₹{item.price}</Text><Text style={[styles.stockText, !inStock && styles.stockTextOut]}>{inStock ? 'In stock' : 'Currently unavailable'}</Text></View>
                  <TouchableOpacity style={[styles.addButton, !inStock && styles.addButtonDisabled]} disabled={!inStock} onPress={(event) => { event.stopPropagation(); addItem(item); }}><Text style={styles.addButtonText}>{inStock ? 'Add' : 'N/A'}</Text></TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        refreshing={isRefetching}
        onRefresh={refetch}
        ListEmptyComponent={<View style={styles.emptyContainer}><Text style={styles.emptyTitle}>No products found</Text><Text style={styles.emptyText}>Try a different search or category.</Text></View>}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  header: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoMark: { width: 44, height: 44, borderRadius: 16, backgroundColor: '#0F766E', alignItems: 'center', justifyContent: 'center' },
  logoMarkText: { color: '#FFFFFF', fontSize: 22, fontWeight: '900' },
  logoText: { fontSize: 30, fontWeight: '900', color: '#0F172A', letterSpacing: -1 },
  subtitle: { marginTop: 2, fontSize: 13, color: '#64748B', fontWeight: '700' },
  searchInput: { marginTop: 16, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 14, paddingVertical: 12, color: '#0F172A' },
  categoryList: { paddingTop: 0, paddingBottom: 0 },
  filterRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 14, paddingBottom: 6 },
  categoryPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: '#E2E8F0', marginRight: 8 },
  categoryPillActive: { backgroundColor: '#0F766E' },
  categoryPillText: { color: '#0F172A', fontWeight: '700' },
  categoryPillTextActive: { color: '#FFFFFF' },
  sortIcon: { alignItems: 'center', justifyContent: 'center', width: 42, height: 42, borderRadius: 999, borderWidth: 1, borderColor: '#0F766E', backgroundColor: '#CCFBF1', marginLeft: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end', padding: 16 },
  modalSheet: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20, marginBottom: 90 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginBottom: 16 },
  modalOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14, marginBottom: 6 },
  modalOptionActive: { backgroundColor: '#CCFBF1' },
  modalOptionText: { fontSize: 15, fontWeight: '600', color: '#334155' },
  modalOptionTextActive: { color: '#115E59', fontWeight: '800' },
  checkmark: { color: '#0F766E', fontSize: 18, fontWeight: '800' },
  listContainer: { paddingHorizontal: 16, paddingBottom: 170 },
  productRow: { gap: 12 },
  productCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 20, marginHorizontal: 0, marginBottom: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0' },
  productCardDisabled: { opacity: 0.72 },
  imageWrap: { position: 'relative' },
  productImage: { width: '100%', height: 112, resizeMode: 'cover' },
  productImageDisabled: { opacity: 0.5 },
  unavailableOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.72)' },
  unavailableBadge: { overflow: 'hidden', borderRadius: 999, backgroundColor: '#FEE2E2', color: '#B91C1C', fontSize: 11, fontWeight: '900', paddingHorizontal: 10, paddingVertical: 5 },
  productInfo: { padding: 12 },
  productCategory: { fontSize: 11, fontWeight: '800', color: '#0F766E', textTransform: 'uppercase' },
  productName: { marginTop: 4, fontSize: 15, fontWeight: '800', color: '#0F172A' },
  productNameDisabled: { color: '#94A3B8' },
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