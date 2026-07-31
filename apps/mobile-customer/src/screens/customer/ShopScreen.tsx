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
  const productsQuery = useQuery({ queryKey: ['products', debouncedQuery, categoryId], queryFn: async () => { const response = await apiClient.get('/products', { params: { search: debouncedQuery || undefined, categoryId: categoryId || undefined } }); const rows = Array.isArray(response.data) ? response.data : response.data?.items || []; return [...rows].sort((left, right) => Number(unavailable(left)) - Number(unavailable(right))); }, placeholderData: (previousData) => previousData });
  const promotionsQuery = useQuery({ queryKey: ['promotions', 'active'], queryFn: async () => normalizePromotionPlacements((await apiClient.get('/promotions/active')).data) });
  const categories = categoriesQuery.data || [];
  const products = productsQuery.data || [];
  const sections = useMemo(() => groupProductsByCategory(categories, products), [categories, products]);
  const categoryPills = useMemo(() => [{ id: '', name: 'All' }, ...categories], [categories]);
  const homeMode = !debouncedQuery && !categoryId;
  const cartCount = getCartItemCount(items);
  const openPromotion = (campaign: PromotionCampaign) => { const target = campaign.targetUrl || ''; const product = target.match(/^\/shop\/products\/([^/?#]+)/); const category = target.match(/[?&]category=([^&#]+)/); if (product) navigation.navigate('ProductDetail', { productId: product[1] }); else if (target.startsWith('/shop/deals')) navigation.navigate('Deals'); else if (target.startsWith('/shop/checkout')) navigation.navigate('Checkout'); else if (category) setCategoryId(decodeURIComponent(category[1])); };
  const refresh = () => { void categoriesQuery.refetch(); void productsQuery.refetch(); void promotionsQuery.refetch(); };
  const header = <View style={styles.header}><View style={styles.brandRow}><AagamBrand compact /><View style={styles.headerActions}><TouchableOpacity style={styles.iconButton} onPress={() => navigation.navigate('Alerts')} accessibilityLabel="Open notifications"><Bell size={21} color="#0F766E" /></TouchableOpacity><TouchableOpacity style={styles.cartButton} onPress={() => navigation.navigate('Cart')} accessibilityLabel={`Open cart with ${cartCount} items`}><ShoppingCart size={22} color="#115E59" />{cartCount > 0 ? <View style={styles.cartBadge}><Text style={styles.cartBadgeText}>{cartCount > 99 ? '99+' : cartCount}</Text></View> : null}</TouchableOpacity></View></View><PromotionCarousel campaigns={promotionsQuery.data?.HOME_HERO} onPress={openPromotion} />{promotionsQuery.data?.HOME_TODAY_OFFERS?.length ? <View style={styles.offerBlock}><View style={styles.headingRow}><View style={styles.headingCopy}><Gift size={17} color="#0F766E" /><Text style={styles.smallHeading}>Today's offers</Text></View><TouchableOpacity onPress={() => navigation.navigate('Deals')}><Text style={styles.link}>View deals</Text></TouchableOpacity></View><PromotionCarousel campaigns={promotionsQuery.data.HOME_TODAY_OFFERS} onPress={openPromotion} compact /></View> : null}  const searchInput = <TextInput value={query} onChangeText={setQuery} onSubmitEditing={() => setDebouncedQuery(normalizeShopSearch(query))} returnKeyType="search" placeholder="Search products" placeholderTextColor="#94A3B8" style={styles.search} />;
  const header = <FlatList horizontal data={categoryPills} keyExtractor={(item) => item.id || 'all'} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills} renderItem={({ item }) => <TouchableOpacity style={[styles.pill, categoryId === item.id && styles.pillActive]} onPress={() => setCategoryId(item.id)}><Text style={[styles.pillText, categoryId === item.id && styles.pillTextActive]}>{item.name}</Text></TouchableOpacity>} /><Text style={styles.title}>{homeMode ? 'Shop by category' : 'Shop products'}</Text></View>;
