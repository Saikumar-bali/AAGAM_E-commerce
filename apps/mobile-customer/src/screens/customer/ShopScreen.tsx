import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Bell, Gift, ShoppingCart } from 'lucide-react-native';
import { getProductImage } from '@aagam/utils';
import { apiClient } from '@aagam/mobile-shared';
import { useCartStore } from '../../store/cartStore';
import { PromotionCarousel } from '../../components/promotions/PromotionCarousel';
import { AagamBrand } from '../../components/AagamBrand';
import { normalizePromotionPlacements, type PromotionCampaign } from '../../promotions/types';
import { getCartItemCount, getProductCartQuantity, groupProductsByCategory } from '../../utils/customerCommerce';
import { normalizeShopSearch, SHOP_SEARCH_DEBOUNCE_MS } from '../../utils/shopSearch';

const unavailable = (product: any) => product.availability?.inStock === false;

function ProductCard({ product, compact, quantity, onOpen, onAdd }: any) {
  const inStock = !unavailable(product);
  return <TouchableOpacity testID="shop_product_card" style={[styles.card, compact && styles.cardCompact, !inStock && styles.disabled]} disabled={!inStock} onPress={onOpen} activeOpacity={0.92}><View><Image source={{ uri: getProductImage(product) }} style={styles.productImage} />{quantity > 0 ? <View style={styles.inCart}><Text style={styles.inCartText}>{quantity} in cart</Text></View> : null}</View><View style={styles.cardBody}><Text style={styles.categoryLabel}>{product.category?.name || 'General'}</Text><Text style={styles.productName} numberOfLines={2}>{product.name}</Text><View style={styles.cardFooter}><View><Text style={styles.price}>₹{product.price}</Text><Text style={inStock ? styles.stock : styles.out}>{inStock ? 'In stock' : 'Unavailable'}</Text></View><TouchableOpacity testID="shop_product_add_button" style={[styles.add, !inStock && styles.addDisabled]} disabled={!inStock} onPress={(event) => { event.stopPropagation(); onAdd(); }}><Text style={styles.addText}>{quantity > 0 ? `+ (${quantity})` : 'Add'}</Text></TouchableOpacity></View></View></TouchableOpacity>;
}

export const ShopScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const items = useCartStore((state) => state.items);
  const addItem = useCartStore((state) => state.addItem);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [categoryId, setCategoryId] = useState('');
  useEffect(() => { if (typeof route.params?.categoryId === 'string') setCategoryId(route.params.categoryId); }, [route.params?.categoryId]);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(normalizeShopSearch(query)), SHOP_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);
  const categoriesQuery = useQuery({ queryKey: ['categories'], queryFn: async () => { const response = await apiClient.get('/products/categories'); return Array.isArray(response.data) ? response.data : []; } });
  const productsQuery = useQuery({ queryKey: ['products', debouncedQuery, categoryId], queryFn: async () => { const response = await apiClient.get('/products', { params: { search: debouncedQuery || undefined, categoryId: categoryId || undefined } }); const rows = Array.isArray(response.data) ? response.data : response.data?.items || []; return [...rows].sort((left, right) => Number(unavailable(left)) - Number(unavailable(right))); } });
  const promotionsQuery = useQuery({ queryKey: ['promotions', 'active'], queryFn: async () => normalizePromotionPlacements((await apiClient.get('/promotions/active')).data) });
  const categories = categoriesQuery.data || [];
  const products = productsQuery.data || [];
  const sections = useMemo(() => groupProductsByCategory(categories, products), [categories, products]);
  const categoryPills = useMemo(() => [{ id: '', name: 'All' }, ...categories], [categories]);
  const homeMode = !debouncedQuery && !categoryId;
  const cartCount = getCartItemCount(items);
  const openPromotion = (campaign: PromotionCampaign) => { const target = campaign.targetUrl || ''; const product = target.match(/^\/shop\/products\/([^/?#]+)/); const category = target.match(/[?&]category=([^&#]+)/); if (product) navigation.navigate('ProductDetail', { productId: product[1] }); else if (target.startsWith('/shop/deals')) navigation.navigate('Deals'); else if (target.startsWith('/shop/checkout')) navigation.navigate('Checkout'); else if (category) setCategoryId(decodeURIComponent(category[1])); };
  const refresh = () => { void categoriesQuery.refetch(); void productsQuery.refetch(); void promotionsQuery.refetch(); };
  const header = <View style={styles.header}><View style={styles.brandRow}><AagamBrand compact /><View style={styles.headerActions}><TouchableOpacity style={styles.iconButton} onPress={() => navigation.navigate('Alerts')} accessibilityLabel="Open notifications"><Bell size={21} color="#0F766E" /></TouchableOpacity><TouchableOpacity style={styles.cartButton} onPress={() => navigation.navigate('Cart')} accessibilityLabel={`Open cart with ${cartCount} items`}><ShoppingCart size={22} color="#115E59" />{cartCount > 0 ? <View style={styles.cartBadge}><Text style={styles.cartBadgeText}>{cartCount > 99 ? '99+' : cartCount}</Text></View> : null}</TouchableOpacity></View></View><PromotionCarousel campaigns={promotionsQuery.data?.HOME_HERO} onPress={openPromotion} />{promotionsQuery.data?.HOME_TODAY_OFFERS?.length ? <View style={styles.offerBlock}><View style={styles.headingRow}><View style={styles.headingCopy}><Gift size={17} color="#0F766E" /><Text style={styles.smallHeading}>Today's offers</Text></View><TouchableOpacity onPress={() => navigation.navigate('Deals')}><Text style={styles.link}>View deals</Text></TouchableOpacity></View><PromotionCarousel campaigns={promotionsQuery.data.HOME_TODAY_OFFERS} onPress={openPromotion} compact /></View> : null}<TextInput value={query} onChangeText={setQuery} onSubmitEditing={() => setDebouncedQuery(normalizeShopSearch(query))} returnKeyType="search" placeholder="Search products" placeholderTextColor="#94A3B8" style={styles.search} /><FlatList horizontal data={categoryPills} keyExtractor={(item) => item.id || 'all'} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills} renderItem={({ item }) => <TouchableOpacity style={[styles.pill, categoryId === item.id && styles.pillActive]} onPress={() => setCategoryId(item.id)}><Text style={[styles.pillText, categoryId === item.id && styles.pillTextActive]}>{item.name}</Text></TouchableOpacity>} /><Text style={styles.title}>{homeMode ? 'Shop by category' : 'Shop products'}</Text></View>;
  if (productsQuery.isLoading) return <View style={styles.center}><ActivityIndicator size="large" color="#0F766E" /></View>;
  if (productsQuery.error) return <View style={styles.center}><Text style={styles.error}>Failed to load products.</Text><TouchableOpacity style={styles.retry} onPress={() => productsQuery.refetch()}><Text style={styles.addText}>Try again</Text></TouchableOpacity></View>;
  return (
    <View style={styles.screen}>
      <View style={styles.headerContent}>{header}</View>
      {homeMode ? (
        <FlatList key="home-categories" style={styles.screen} data={sections} keyExtractor={(section) => section.category.id} contentContainerStyle={styles.content} refreshing={productsQuery.isRefetching || promotionsQuery.isRefetching} onRefresh={refresh} renderItem={({ item: section }) => <View style={styles.section}><View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>{section.category.name}</Text><Text style={styles.sectionSubtitle}>Popular picks in {section.category.name}</Text></View><TouchableOpacity style={styles.viewAll} onPress={() => setCategoryId(section.category.id)}><Text style={styles.link}>View all</Text><ArrowRight size={14} color="#0F766E" /></TouchableOpacity></View><FlatList horizontal data={section.products.slice(0, 8)} keyExtractor={(product) => product.id} showsHorizontalScrollIndicator={false} renderItem={({ item }) => <ProductCard product={item} compact quantity={getProductCartQuantity(items, item.id)} onOpen={() => navigation.navigate('ProductDetail', { productId: item.id })} onAdd={() => addItem(item)} />} /></View>} ListEmptyComponent={<View style={styles.empty}><Text style={styles.sectionTitle}>No category products yet</Text></View>} />
      ) : (
        <FlatList key="product-grid" style={styles.screen} data={products} numColumns={2} columnWrapperStyle={styles.columns} keyExtractor={(item) => item.id} contentContainerStyle={styles.content} refreshing={productsQuery.isRefetching || promotionsQuery.isRefetching} onRefresh={refresh} renderItem={({ item }) => <ProductCard product={item} quantity={getProductCartQuantity(items, item.id)} onOpen={() => navigation.navigate('ProductDetail', { productId: item.id })} onAdd={() => addItem(item)} />} ListEmptyComponent={<View style={styles.empty}><Text style={styles.sectionTitle}>No products found</Text></View>} />
      )}
    </View>
  );
};
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' }, headerContent: { paddingHorizontal: 16 }, content: { paddingHorizontal: 16, paddingBottom: 170 }, header: { paddingTop: 18, paddingBottom: 8 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }, headerActions: { flexDirection: 'row', alignItems: 'center', gap: 9 }, iconButton: { width: 46, height: 46, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DDE7EA', alignItems: 'center', justifyContent: 'center' },
  cartButton: { position: 'relative', width: 48, height: 48, borderRadius: 17, backgroundColor: '#CCFBF1', alignItems: 'center', justifyContent: 'center' }, cartBadge: { position: 'absolute', right: -4, top: -4, minWidth: 21, height: 21, borderRadius: 11, backgroundColor: '#F97316', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }, cartBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '900' },
  offerBlock: { marginTop: 22 }, headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }, headingCopy: { flexDirection: 'row', alignItems: 'center', gap: 7 }, smallHeading: { color: '#0F172A', fontWeight: '900', textTransform: 'uppercase' }, link: { color: '#0F766E', fontWeight: '900', fontSize: 12 },
  search: { marginTop: 16, borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFF', color: '#0F172A', paddingHorizontal: 14, paddingVertical: 12 }, pills: { paddingVertical: 14 }, pill: { marginRight: 8, borderRadius: 999, backgroundColor: '#E2E8F0', paddingHorizontal: 14, paddingVertical: 8 }, pillActive: { backgroundColor: '#0F766E' }, pillText: { color: '#0F172A', fontWeight: '700' }, pillTextActive: { color: '#FFF' }, title: { marginBottom: 12, fontSize: 20, color: '#0F172A', fontWeight: '900' },
  section: { marginBottom: 26 }, sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }, sectionTitle: { color: '#0F172A', fontSize: 19, fontWeight: '900' }, sectionSubtitle: { marginTop: 3, color: '#64748B', fontSize: 12 }, viewAll: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, backgroundColor: '#CCFBF1', paddingHorizontal: 12, paddingVertical: 8 },
  columns: { gap: 12 }, card: { flex: 1, marginBottom: 14, borderRadius: 20, overflow: 'hidden', backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E2E8F0' }, cardCompact: { flex: 0, width: 168, marginRight: 12 }, disabled: { opacity: 0.62 }, productImage: { width: '100%', height: 116 }, inCart: { position: 'absolute', left: 8, top: 8, borderRadius: 999, backgroundColor: '#CCFBF1', paddingHorizontal: 8, paddingVertical: 5 }, inCartText: { color: '#115E59', fontSize: 10, fontWeight: '900' },
  cardBody: { padding: 12 }, categoryLabel: { color: '#0F766E', fontSize: 10, fontWeight: '900', textTransform: 'uppercase' }, productName: { marginTop: 4, minHeight: 38, color: '#0F172A', fontWeight: '800' }, cardFooter: { marginTop: 10, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }, price: { color: '#0F172A', fontSize: 16, fontWeight: '900' }, stock: { marginTop: 3, color: '#0F766E', fontSize: 10, fontWeight: '700' }, out: { marginTop: 3, color: '#DC2626', fontSize: 10, fontWeight: '700' }, add: { borderRadius: 999, backgroundColor: '#0F766E', paddingHorizontal: 13, paddingVertical: 9 }, addDisabled: { backgroundColor: '#94A3B8' }, addText: { color: '#FFF', fontWeight: '900' },
  retry: { marginTop: 12, borderRadius: 999, backgroundColor: '#0F766E', paddingHorizontal: 16, paddingVertical: 10 }, error: { color: '#B91C1C', fontWeight: '800' }, empty: { alignItems: 'center', paddingVertical: 50 },
});
