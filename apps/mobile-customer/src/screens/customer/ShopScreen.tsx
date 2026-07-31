import React, { useEffect, useMemo, useState } from 'react';
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
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  ChevronDown,
  Gift,
  Grid2X2,
  MapPin,
  Plus,
  Search,
  ShoppingCart,
} from 'lucide-react-native';
import { getProductImage } from '@aagam/utils';
import { apiClient, useAuthStore } from '@aagam/mobile-shared';
import { useCartStore } from '../../store/cartStore';
import { PromotionCarousel } from '../../components/promotions/PromotionCarousel';
import { AagamBrand } from '../../components/AagamBrand';
import { normalizePromotionPlacements, type PromotionCampaign } from '../../promotions/types';
import { getCartItemCount, getProductCartQuantity, groupProductsByCategory } from '../../utils/customerCommerce';
import { normalizeShopSearch, SHOP_SEARCH_DEBOUNCE_MS } from '../../utils/shopSearch';

const unavailable = (product: any) => product.availability?.inStock === false;

const ProductCard = ({ product, compact, quantity, onOpen, onAdd }: any) => {
  const inStock = !unavailable(product);
  const sellingPrice = Number(product.price || 0);
  const mrp = Number(product.mrp || product.originalPrice || sellingPrice);
  const discount = mrp > sellingPrice ? Math.round(((mrp - sellingPrice) / mrp) * 100) : 0;
  return (
    <TouchableOpacity
      testID="shop_product_card"
      style={[styles.card, compact && styles.cardCompact, !inStock && styles.disabled]}
      disabled={!inStock}
      onPress={onOpen}
      activeOpacity={0.92}
    >
      <View style={styles.imageWrap}>
        <Image source={{ uri: getProductImage(product) }} style={styles.productImage} resizeMode="contain" />
        {discount > 0 ? <Text style={styles.discount}>{discount}% OFF</Text> : null}
        {quantity > 0 ? <View style={styles.inCart}><Text style={styles.inCartText}>{quantity} in cart</Text></View> : null}
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
        <Text style={styles.measure}>{product.unit || product.quantityLabel || 'Fresh everyday essential'}</Text>
        <View style={styles.ratingPill}><Text style={styles.ratingText}>★ {Number(product.rating || 4.5).toFixed(1)}</Text></View>
        <View style={styles.cardFooter}>
          <View>
            <View style={styles.priceRow}><Text style={styles.price}>₹{sellingPrice}</Text>{discount > 0 ? <Text style={styles.mrp}>₹{mrp}</Text> : null}</View>
            <Text style={inStock ? styles.stock : styles.out}>{inStock ? 'In stock' : 'Unavailable'}</Text>
          </View>
          <TouchableOpacity testID="shop_product_add_button" accessibilityLabel={`Add ${product.name} to cart`} style={[styles.add, !inStock && styles.addDisabled]} disabled={!inStock} onPress={(event) => { event.stopPropagation(); onAdd(); }}>
            <Plus size={21} color="#FFFFFF" strokeWidth={2.8} />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
};

export const ShopScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const user = useAuthStore((state) => state.user);
  const items = useCartStore((state) => state.items);
  const addItem = useCartStore((state) => state.addItem);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const isCategoriesTab = route.name === 'Categories';

  useEffect(() => {
    if (typeof route.params?.categoryId === 'string') setCategoryId(route.params.categoryId);
  }, [route.params?.categoryId]);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(normalizeShopSearch(query)), SHOP_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const response = await apiClient.get('/products/categories');
      return Array.isArray(response.data) ? response.data : [];
    },
  });
  const productsQuery = useQuery({
    queryKey: ['products', debouncedQuery, categoryId],
    queryFn: async () => {
      const response = await apiClient.get('/products', { params: { search: debouncedQuery || undefined, categoryId: categoryId || undefined } });
      const rows = Array.isArray(response.data) ? response.data : response.data?.items || [];
      return [...rows].sort((left, right) => Number(unavailable(left)) - Number(unavailable(right)));
    },
    placeholderData: (previousData) => previousData,
  });
  const promotionsQuery = useQuery({
    queryKey: ['promotions', 'active'],
    queryFn: async () => normalizePromotionPlacements((await apiClient.get('/promotions/active')).data),
  });
  const addressesQuery = useQuery({
    queryKey: ['shop-default-address'],
    queryFn: async () => {
      const response = await apiClient.get('/customer/addresses');
      return Array.isArray(response.data) ? response.data : [];
    },
  });

  const categories = categoriesQuery.data || [];
  const products = productsQuery.data || [];
  const sections = useMemo(() => groupProductsByCategory(categories, products), [categories, products]);
  const categoryPills = useMemo(() => [{ id: '', name: 'All' }, ...categories], [categories]);
  const categoryImages = useMemo(() => {
    const fromProducts = new Map<string, string>();
    products.forEach((product: any) => {
      const id = product.categoryId || product.category?.id;
      if (id && !fromProducts.has(id)) fromProducts.set(id, getProductImage(product));
    });
    return fromProducts;
  }, [products]);
  const defaultAddress = addressesQuery.data?.find((address: any) => address.isDefault) || addressesQuery.data?.[0];
  const homeMode = route.name === 'Home' && !debouncedQuery && !categoryId;
  const cartCount = getCartItemCount(items);
  const openPromotion = (campaign: PromotionCampaign) => {
    const target = campaign.targetUrl || '';
    const product = target.match(/^\/shop\/products\/([^/?#]+)/);
    const category = target.match(/[?&]category=([^&#]+)/);
    if (product) navigation.navigate('ProductDetail', { productId: product[1] });
    else if (target.startsWith('/shop/deals')) navigation.navigate('Deals');
    else if (target.startsWith('/shop/checkout')) navigation.navigate('Checkout');
    else if (category) setCategoryId(decodeURIComponent(category[1]));
  };
  const refresh = () => { void categoriesQuery.refetch(); void productsQuery.refetch(); void promotionsQuery.refetch(); void addressesQuery.refetch(); };

  const categoryRail = (
    <FlatList
      horizontal
      data={categoryPills}
      keyExtractor={(item) => item.id || 'all'}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.categoryRail}
      renderItem={({ item }) => {
        const image = item.id ? categories.find((category: any) => category.id === item.id)?.imageUrl || categoryImages.get(item.id) : undefined;
        return (
          <TouchableOpacity style={[styles.categoryTile, categoryId === item.id && styles.categoryTileActive]} onPress={() => setCategoryId(item.id)}>
            <View style={[styles.categoryImageWrap, categoryId === item.id && styles.categoryImageWrapActive]}>
              {image ? <Image source={{ uri: image }} style={styles.categoryImage} resizeMode="contain" /> : <Grid2X2 size={26} color={categoryId === item.id ? '#FFFFFF' : '#0F766E'} />}
            </View>
            <Text style={[styles.categoryText, categoryId === item.id && styles.categoryTextActive]} numberOfLines={2}>{item.name}</Text>
          </TouchableOpacity>
        );
      }}
    />
  );

  const searchInput = (
    <View style={styles.searchWrap}><Search size={21} color="#64748B" /><TextInput value={query} onChangeText={setQuery} onSubmitEditing={() => setDebouncedQuery(normalizeShopSearch(query))} returnKeyType="search" placeholder="Search milk, vegetables, rice, oils..." placeholderTextColor="#94A3B8" style={styles.search} /></View>
  );

  const header = (
    <View style={styles.header}>
      {isCategoriesTab ? (
        <View style={styles.catalogHeader}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.navigate('Home')} accessibilityLabel="Back to home"><ArrowLeft size={22} color="#0F172A" /></TouchableOpacity>
          <Text style={styles.catalogTitle}>Categories</Text>
          <View style={styles.headerActions}><TouchableOpacity style={styles.iconButton} onPress={() => navigation.navigate('Alerts')} accessibilityLabel="Open notifications"><Bell size={21} color="#0F766E" /></TouchableOpacity><TouchableOpacity style={styles.cartButton} onPress={() => navigation.navigate('Cart')} accessibilityLabel={`Open cart with ${cartCount} items`}><ShoppingCart size={22} color="#115E59" />{cartCount > 0 ? <View style={styles.cartBadge}><Text style={styles.cartBadgeText}>{cartCount > 99 ? '99+' : cartCount}</Text></View> : null}</TouchableOpacity></View>
        </View>
      ) : (
        <>
          <View style={styles.brandRow}><AagamBrand compact /><View style={styles.headerActions}><TouchableOpacity style={styles.iconButton} onPress={() => navigation.navigate('Alerts')} accessibilityLabel="Open notifications"><Bell size={21} color="#0F766E" /></TouchableOpacity><TouchableOpacity style={styles.cartButton} onPress={() => navigation.navigate('Cart')} accessibilityLabel={`Open cart with ${cartCount} items`}><ShoppingCart size={22} color="#115E59" />{cartCount > 0 ? <View style={styles.cartBadge}><Text style={styles.cartBadgeText}>{cartCount > 99 ? '99+' : cartCount}</Text></View> : null}</TouchableOpacity></View></View>
          <TouchableOpacity style={styles.locationCard} onPress={() => navigation.navigate('SavedAddresses')} activeOpacity={0.85}><View style={styles.locationIcon}><MapPin size={21} color="#FFFFFF" /></View><View style={styles.locationCopy}><Text style={styles.greeting}>Good morning, {user?.name?.split(' ')[0] || 'there'} 👋</Text><Text style={styles.delivering}>Delivering to <Text style={styles.deliveringStrong}>{defaultAddress?.label || 'Add an address'}{defaultAddress?.city ? ` - ${defaultAddress.city}` : ''}</Text></Text></View><ChevronDown size={19} color="#0F766E" /></TouchableOpacity>
          <PromotionCarousel campaigns={promotionsQuery.data?.HOME_HERO} onPress={openPromotion} />
          {promotionsQuery.data?.HOME_TODAY_OFFERS?.length ? <View style={styles.offerBlock}><View style={styles.headingRow}><View style={styles.headingCopy}><Gift size={17} color="#0F766E" /><Text style={styles.smallHeading}>Today's offers</Text></View><TouchableOpacity style={styles.linkRow} onPress={() => navigation.navigate('Deals')}><Text style={styles.link}>View all</Text><ArrowRight size={13} color="#0F766E" /></TouchableOpacity></View><PromotionCarousel campaigns={promotionsQuery.data.HOME_TODAY_OFFERS} onPress={openPromotion} compact /></View> : null}
        </>
      )}
      {categoryRail}
      <View style={styles.catalogTitleRow}><View><Text style={styles.title}>{homeMode ? 'Shop by category' : isCategoriesTab ? 'All products' : 'Shop products'}</Text>{!homeMode ? <Text style={styles.catalogSubtitle}>{products.length} products available near you</Text> : null}</View>{!homeMode ? <TouchableOpacity style={styles.sortButton}><Text style={styles.sortText}>Sort</Text><ChevronDown size={15} color="#0F766E" /></TouchableOpacity> : null}</View>
    </View>
  );

  if (productsQuery.isLoading) return <View style={styles.screen}><View style={styles.searchContent}>{searchInput}</View><View style={styles.center}><ActivityIndicator size="large" color="#0F766E" /></View></View>;
  if (productsQuery.error) return <View style={styles.screen}><View style={styles.searchContent}>{searchInput}</View><View style={styles.center}><Text style={styles.error}>Failed to load products.</Text><TouchableOpacity style={styles.retry} onPress={() => productsQuery.refetch()}><Text style={styles.retryText}>Try again</Text></TouchableOpacity></View></View>;
  if (homeMode) {
    return <View style={styles.screen}><View style={styles.searchContent}>{searchInput}</View><FlatList key="home-categories" style={styles.list} data={sections} keyExtractor={(section) => section.category.id} ListHeaderComponent={header} contentContainerStyle={styles.content} refreshing={productsQuery.isRefetching || promotionsQuery.isRefetching} onRefresh={refresh} renderItem={({ item: section }) => <View style={styles.section}><View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>{section.category.name}</Text><Text style={styles.sectionSubtitle}>Popular picks in {section.category.name}</Text></View><TouchableOpacity style={styles.viewAll} onPress={() => setCategoryId(section.category.id)}><Text style={styles.link}>View all</Text><ArrowRight size={14} color="#0F766E" /></TouchableOpacity></View><FlatList horizontal data={section.products.slice(0, 8)} keyExtractor={(product) => product.id} showsHorizontalScrollIndicator={false} renderItem={({ item }) => <ProductCard product={item} compact quantity={getProductCartQuantity(items, item.id)} onOpen={() => navigation.navigate('ProductDetail', { productId: item.id })} onAdd={() => addItem(item)} />} /></View>} ListEmptyComponent={<View style={styles.empty}><Text style={styles.sectionTitle}>No category products yet</Text></View>} /></View>;
  }
  return <View style={styles.screen}><View style={styles.searchContent}>{searchInput}</View><FlatList key="product-grid" style={styles.list} data={products} numColumns={2} columnWrapperStyle={styles.columns} keyExtractor={(item) => item.id} ListHeaderComponent={header} contentContainerStyle={styles.content} refreshing={productsQuery.isRefetching || promotionsQuery.isRefetching} onRefresh={refresh} renderItem={({ item }) => <ProductCard product={item} quantity={getProductCartQuantity(items, item.id)} onOpen={() => navigation.navigate('ProductDetail', { productId: item.id })} onAdd={() => addItem(item)} />} ListEmptyComponent={<View style={styles.empty}><Text style={styles.sectionTitle}>No products found</Text><Text style={styles.sectionSubtitle}>Try another category or search term.</Text></View>} /></View>;
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' }, list: { flex: 1 }, searchContent: { paddingHorizontal: 16, backgroundColor: '#F8FAFC' }, content: { paddingHorizontal: 16, paddingBottom: 170 }, header: { paddingTop: 14, paddingBottom: 6 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#F8FAFC' },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 }, headerActions: { flexDirection: 'row', alignItems: 'center', gap: 9 }, iconButton: { width: 46, height: 46, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DDE7EA', alignItems: 'center', justifyContent: 'center' }, cartButton: { position: 'relative', width: 48, height: 48, borderRadius: 17, backgroundColor: '#CCFBF1', alignItems: 'center', justifyContent: 'center' }, cartBadge: { position: 'absolute', right: -4, top: -4, minWidth: 21, height: 21, borderRadius: 11, backgroundColor: '#0F766E', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }, cartBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '900' },
  locationCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0FDFA', borderRadius: 20, padding: 12, gap: 10, marginBottom: 15 }, locationIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#0F766E', alignItems: 'center', justifyContent: 'center' }, locationCopy: { flex: 1 }, greeting: { color: '#0F172A', fontSize: 12, fontWeight: '700' }, delivering: { marginTop: 4, color: '#475569', fontSize: 12, fontWeight: '700' }, deliveringStrong: { color: '#0F766E', fontWeight: '900' },
  catalogHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15, gap: 12 }, backButton: { width: 48, height: 48, borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }, catalogTitle: { flex: 1, color: '#0F172A', fontSize: 25, fontWeight: '900' },
  offerBlock: { marginTop: 18 }, headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }, headingCopy: { flexDirection: 'row', alignItems: 'center', gap: 7 }, smallHeading: { color: '#0F172A', fontWeight: '900', textTransform: 'uppercase' }, linkRow: { flexDirection: 'row', alignItems: 'center', gap: 3 }, link: { color: '#0F766E', fontWeight: '900', fontSize: 12 }, searchWrap: { marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 54, paddingHorizontal: 15, borderRadius: 18, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF' }, search: { flex: 1, color: '#0F172A', fontSize: 14, fontWeight: '600', paddingVertical: 0 }, categoryRail: { paddingVertical: 14, gap: 10 }, categoryTile: { width: 83, alignItems: 'center', gap: 6 }, categoryTileActive: { transform: [{ scale: 1.02 }] }, categoryImageWrap: { width: 66, height: 66, borderRadius: 22, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }, categoryImageWrapActive: { borderColor: '#0F766E', backgroundColor: '#0F766E' }, categoryImage: { width: 54, height: 54 }, categoryText: { color: '#334155', fontSize: 11, lineHeight: 14, fontWeight: '800', textAlign: 'center' }, categoryTextActive: { color: '#0F766E' }, catalogTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }, title: { color: '#0F172A', fontSize: 21, fontWeight: '900' }, catalogSubtitle: { marginTop: 3, color: '#64748B', fontSize: 12, fontWeight: '700' }, sortButton: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, backgroundColor: '#E6FFFA', paddingHorizontal: 12, paddingVertical: 8 }, sortText: { color: '#0F766E', fontSize: 12, fontWeight: '900' },
  section: { marginBottom: 24 }, sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 }, sectionTitle: { color: '#0F172A', fontSize: 18, fontWeight: '900' }, sectionSubtitle: { marginTop: 3, color: '#64748B', fontSize: 12, fontWeight: '600' }, viewAll: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, backgroundColor: '#E6FFFA', paddingHorizontal: 11, paddingVertical: 8 }, columns: { gap: 12 }, card: { flex: 1, marginBottom: 14, borderRadius: 20, overflow: 'hidden', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0' }, cardCompact: { flex: 0, width: 168, marginRight: 12 }, disabled: { opacity: 0.62 }, imageWrap: { position: 'relative', height: 132, backgroundColor: '#FFFFFF' }, productImage: { width: '100%', height: '100%' }, discount: { position: 'absolute', left: 8, top: 8, overflow: 'hidden', borderRadius: 9, backgroundColor: '#0F766E', color: '#FFFFFF', paddingHorizontal: 7, paddingVertical: 5, fontSize: 10, fontWeight: '900' }, inCart: { position: 'absolute', right: 8, top: 8, borderRadius: 999, backgroundColor: '#E6FFFA', paddingHorizontal: 7, paddingVertical: 5 }, inCartText: { color: '#0F766E', fontSize: 9, fontWeight: '900' }, cardBody: { padding: 11 }, productName: { minHeight: 38, color: '#0F172A', fontSize: 14, lineHeight: 19, fontWeight: '900' }, measure: { marginTop: 3, color: '#64748B', fontSize: 11, fontWeight: '700' }, ratingPill: { alignSelf: 'flex-start', marginTop: 7, borderRadius: 7, backgroundColor: '#E6FFFA', paddingHorizontal: 7, paddingVertical: 3 }, ratingText: { color: '#115E59', fontSize: 10, fontWeight: '900' }, cardFooter: { marginTop: 10, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 6 }, priceRow: { flexDirection: 'row', alignItems: 'center', gap: 7 }, price: { color: '#0F172A', fontSize: 16, fontWeight: '900' }, mrp: { color: '#94A3B8', fontSize: 11, textDecorationLine: 'line-through', fontWeight: '700' }, stock: { marginTop: 3, color: '#0F766E', fontSize: 10, fontWeight: '800' }, out: { marginTop: 3, color: '#DC2626', fontSize: 10, fontWeight: '800' }, add: { width: 39, height: 39, borderRadius: 20, backgroundColor: '#0F766E', alignItems: 'center', justifyContent: 'center' }, addDisabled: { backgroundColor: '#94A3B8' }, retry: { marginTop: 12, borderRadius: 999, backgroundColor: '#0F766E', paddingHorizontal: 16, paddingVertical: 10 }, retryText: { color: '#FFFFFF', fontWeight: '900' }, error: { color: '#B91C1C', fontWeight: '800' }, empty: { alignItems: 'center', paddingVertical: 50 },
});
