import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Award,
  ChevronDown,
  Droplets,
  Heart,
  Leaf,
  Minus,
  Plus,
  ShieldCheck,
  ShoppingCart,
  Thermometer,
  Truck,
} from 'lucide-react-native';
import { getProductImage } from '@aagam/utils';
import { apiClient } from '@aagam/mobile-shared';
import { useCartStore } from '../../store/cartStore';
import { getCartItemCount, getCartTotal, getProductCartQuantity, normalizeProductImages } from '../../utils/customerCommerce';

export const ProductDetailScreen = () => {
  const route = useRoute<RouteProp<Record<string, { productId: string }>, string>>();
  const navigation = useNavigation<any>();
  const { width } = useWindowDimensions();
  const items = useCartStore((state) => state.items);
  const addItem = useCartStore((state) => state.addItem);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const productId = route.params?.productId;
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const { data: product, isLoading, error } = useQuery({
    queryKey: ['product', productId],
    queryFn: async () => (await apiClient.get(`/products/${productId}`, { params: { includeAvailability: true } })).data,
    enabled: Boolean(productId),
  });
  const { data: related = [] } = useQuery({
    queryKey: ['related-products', product?.categoryId || product?.category?.id, productId],
    queryFn: async () => {
      const response = await apiClient.get('/products', { params: { categoryId: product?.categoryId || product?.category?.id, pageSize: 8 } });
      const rows = Array.isArray(response.data) ? response.data : response.data?.items || [];
      return rows.filter((item: any) => item.id !== productId).slice(0, 6);
    },
    enabled: Boolean(product?.categoryId || product?.category?.id),
  });

  const fallbackImage = product ? getProductImage(product) : '';
  const productImages = useMemo(() => product ? normalizeProductImages(product, fallbackImage) : [], [fallbackImage, product]);
  const productQuantity = getProductCartQuantity(items, productId);
  const totalItemCount = getCartItemCount(items);
  const cartTotal = getCartTotal(items);

  if (isLoading) return <View style={styles.centered}><ActivityIndicator size="large" color="#0F766E" /></View>;
  if (error || !product) return <View style={styles.centered}><Text style={styles.errorText}>Unable to load product details.</Text><TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.backText}>Go back</Text></TouchableOpacity></View>;

  const inStock = product.availability?.inStock ?? true;
  const price = Number(product.price || 0);
  const mrp = Number(product.mrp || product.originalPrice || price);
  const discount = mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;
  const imageWidth = Math.max(280, width);
  const buyNow = () => { if (!inStock) return; if (!productQuantity) addItem(product); navigation.navigate('Checkout'); };

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}><TouchableOpacity style={styles.topButton} onPress={() => navigation.goBack()} accessibilityLabel="Go back"><ArrowLeft size={23} color="#0F172A" /></TouchableOpacity><View style={styles.topSpacer} /><TouchableOpacity style={styles.topButton} accessibilityLabel="Save product"><Heart size={22} color="#0F172A" /></TouchableOpacity><TouchableOpacity style={styles.cartButton} onPress={() => navigation.navigate('MainTabs', { screen: 'Cart' })} accessibilityLabel={`Open cart with ${totalItemCount} items`}><ShoppingCart size={22} color="#115E59" />{totalItemCount > 0 ? <View style={styles.cartBadge}><Text style={styles.cartBadgeText}>{totalItemCount}</Text></View> : null}</TouchableOpacity></View>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.galleryWrap}>
          <FlatList horizontal pagingEnabled data={productImages} keyExtractor={(item, index) => `${item}-${index}`} showsHorizontalScrollIndicator={false} onMomentumScrollEnd={(event) => setActiveImageIndex(Math.round(event.nativeEvent.contentOffset.x / imageWidth))} renderItem={({ item }) => <Image source={{ uri: item }} style={[styles.image, { width: imageWidth }]} resizeMode="contain" />} />
          <View style={styles.qualitySeal}><Award size={18} color="#0F766E" /><Text style={styles.qualitySealText}>QUALITY{`\n`}TRUSTED</Text></View>
          {productImages.length > 1 ? <View style={styles.pagination}>{productImages.map((image, index) => <View key={`${image}-dot`} style={[styles.paginationDot, index === activeImageIndex && styles.paginationDotActive]} />)}</View> : null}
        </View>
        <View style={styles.productHeader}><View style={styles.titleCopy}><Text style={styles.name}>{product.name}</Text><Text style={styles.measure}>{product.unit || product.quantityLabel || 'Fresh everyday essential'}</Text><View style={styles.ratingRow}><Text style={styles.rating}>★ {Number(product.rating || 4.8).toFixed(1)}</Text><Text style={styles.reviewText}>{product.reviewCount ? `(${product.reviewCount.toLocaleString()} reviews)` : 'Quality you can trust'}</Text><ShieldCheck size={16} color="#0F766E" /><Text style={styles.trustText}>Quality you can trust</Text></View></View><View style={styles.deliveryCard}><Truck size={23} color="#0F766E" /><Text style={styles.deliveryLabel}>Delivering to</Text><Text style={styles.deliveryTitle}>Your saved address</Text><ChevronDown size={16} color="#0F766E" /></View></View>
        <View style={styles.priceRow}><Text style={styles.price}>₹{price}</Text>{discount > 0 ? <Text style={styles.mrp}>₹{mrp}</Text> : null}{discount > 0 ? <Text style={styles.discount}>{discount}% OFF</Text> : null}</View><Text style={styles.taxText}>Inclusive of all taxes</Text>
        <View style={styles.featureStrip}>{[[Leaf, '100% Pure\n& Natural'], [Award, 'No Added\nPreservatives'], [Droplets, 'Sourced from\nHealthy Stores'], [Thermometer, 'Packed for\nFreshness']].map(([Icon, label]: any) => <View key={label} style={styles.feature}><Icon size={21} color="#0F766E" /><Text style={styles.featureText}>{label}</Text></View>)}</View>
        <Text style={styles.sectionTitle}>About this product</Text><Text style={styles.description}>{product.description || 'Freshly stocked from a verified local store and prepared for reliable doorstep delivery.'}</Text>
        {product.nutrition ? <View style={styles.nutritionCard}><Text style={styles.nutritionTitle}>Nutritional information</Text><Text style={styles.nutritionText}>{typeof product.nutrition === 'string' ? product.nutrition : JSON.stringify(product.nutrition)}</Text></View> : null}
        <View style={styles.actionRow}><View style={styles.quantityBox}><Text style={styles.quantityLabel}>Quantity</Text><View style={styles.quantityControl}><TouchableOpacity testID="product_detail_decrease_quantity" style={styles.quantityButton} onPress={() => updateQuantity(product.id, productQuantity - 1)} disabled={!productQuantity}><Minus size={17} color="#0F766E" /></TouchableOpacity><Text style={styles.quantityValue}>{productQuantity || 1}</Text><TouchableOpacity testID="product_detail_increase_quantity" style={styles.quantityButton} onPress={() => addItem(product)} disabled={!inStock}><Plus size={17} color="#0F766E" /></TouchableOpacity></View></View><TouchableOpacity testID="product_detail_add_to_cart" style={[styles.addButton, !inStock && styles.disabledButton]} onPress={() => addItem(product)} disabled={!inStock}><ShoppingCart size={19} color="#0F766E" /><Text style={styles.addButtonText}>{inStock ? 'Add to cart' : 'Unavailable'}</Text></TouchableOpacity><TouchableOpacity style={[styles.buyButton, !inStock && styles.disabledButton]} onPress={buyNow} disabled={!inStock}><Text style={styles.buyButtonText}>Buy now</Text></TouchableOpacity></View>
        {related.length > 0 ? <View style={styles.relatedSection}><View style={styles.relatedHeader}><Text style={styles.sectionTitle}>You may also like</Text><TouchableOpacity style={styles.linkRow} onPress={() => navigation.navigate('MainTabs', { screen: 'Categories' })}><Text style={styles.viewAll}>View all</Text><ArrowRight size={13} color="#0F766E" /></TouchableOpacity></View><FlatList horizontal data={related} keyExtractor={(item) => item.id} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.relatedList} renderItem={({ item }) => { const itemQuantity = getProductCartQuantity(items, item.id); return <TouchableOpacity testID="product_detail_related_product" style={styles.relatedCard} onPress={() => navigation.push('ProductDetail', { productId: item.id })}><Image source={{ uri: getProductImage(item) }} style={styles.relatedImage} resizeMode="contain" /><Text style={styles.relatedName} numberOfLines={2}>{item.name}</Text><Text style={styles.relatedPrice}>₹{item.price}</Text><TouchableOpacity testID="product_detail_related_add" onPress={(event) => { event.stopPropagation(); addItem(item); }} style={styles.relatedAdd}><Plus size={17} color="#FFFFFF" /></TouchableOpacity>{itemQuantity > 0 ? <Text style={styles.relatedCartText}>{itemQuantity} in cart</Text> : null}</TouchableOpacity>; }} /></View> : null}
      </ScrollView>
      {totalItemCount > 0 ? <TouchableOpacity testID="product_detail_floating_cart" style={styles.floatingCart} onPress={() => navigation.navigate('MainTabs', { screen: 'Cart' })}><View style={styles.floatingIcon}><ShoppingCart size={20} color="#0F766E" /></View><View style={styles.floatingCopy}><Text style={styles.floatingTitle}>{totalItemCount} {totalItemCount === 1 ? 'item' : 'items'} added</Text><Text style={styles.floatingTotal}>₹{cartTotal.toFixed(2)}</Text></View><Text style={styles.floatingAction}>View cart</Text></TouchableOpacity> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { color: '#0F172A', fontSize: 16, fontWeight: '800', textAlign: 'center' },
  backText: { marginTop: 12, color: '#0F766E', fontWeight: '900' },
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, backgroundColor: '#FFFFFF' },
  topButton: { width: 48, height: 48, borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  topSpacer: { flex: 1 },
  cartButton: { position: 'relative', width: 52, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E6FFFA' },
  cartBadge: { position: 'absolute', right: 1, top: -5, minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, backgroundColor: '#0F766E' },
  cartBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  container: { flex: 1 },
  content: { paddingBottom: 225 },
  galleryWrap: { position: 'relative', height: 355, backgroundColor: '#FFFFFF' },
  image: { height: 355, backgroundColor: '#FFFFFF' },
  qualitySeal: { position: 'absolute', left: 20, top: 22, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 14, borderWidth: 1, borderColor: '#99F6E4', paddingHorizontal: 9, paddingVertical: 7, backgroundColor: '#F0FDFA' },
  qualitySealText: { color: '#0F766E', fontSize: 9, fontWeight: '900', lineHeight: 10 },
  pagination: { position: 'absolute', bottom: 14, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 5 },
  paginationDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#CBD5E1' },
  paginationDotActive: { width: 20, backgroundColor: '#0F766E' },
  productHeader: { paddingHorizontal: 18, paddingTop: 18, gap: 12, backgroundColor: '#FFFFFF' },
  titleCopy: { gap: 6 },
  name: { color: '#0F172A', fontSize: 24, fontWeight: '900' },
  measure: { color: '#64748B', fontSize: 14, fontWeight: '700' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  rating: { color: '#0F766E', fontSize: 14, fontWeight: '900' },
  reviewText: { color: '#475569', fontSize: 12, fontWeight: '700' },
  trustText: { color: '#334155', fontSize: 12, fontWeight: '700' },
  deliveryCard: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 8, rowGap: 3, borderRadius: 18, padding: 14, backgroundColor: '#F0FDFA' },
  deliveryLabel: { color: '#64748B', fontSize: 12, fontWeight: '700' },
  deliveryTitle: { width: '100%', paddingLeft: 31, color: '#0F766E', fontSize: 14, fontWeight: '900' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingTop: 17, backgroundColor: '#FFFFFF' },
  price: { color: '#0F172A', fontSize: 28, fontWeight: '900' },
  mrp: { color: '#94A3B8', fontSize: 15, textDecorationLine: 'line-through', fontWeight: '700' },
  discount: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6, color: '#0F766E', backgroundColor: '#CCFBF1', fontSize: 12, fontWeight: '900' },
  taxText: { paddingHorizontal: 18, paddingTop: 3, paddingBottom: 16, color: '#64748B', fontSize: 12, backgroundColor: '#FFFFFF' },
  featureStrip: { flexDirection: 'row', marginHorizontal: 18, marginTop: 16, borderRadius: 18, borderWidth: 1, borderColor: '#E2E8F0', paddingVertical: 14, backgroundColor: '#FFFFFF' },
  feature: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 5, borderRightWidth: 1, borderRightColor: '#E2E8F0' },
  featureText: { color: '#334155', fontSize: 10, lineHeight: 14, fontWeight: '800', textAlign: 'center' },
  sectionTitle: { marginTop: 18, paddingHorizontal: 18, color: '#0F172A', fontSize: 17, fontWeight: '900' },
  description: { paddingHorizontal: 18, paddingTop: 8, color: '#64748B', fontSize: 13, lineHeight: 20, fontWeight: '600' },
  nutritionCard: { marginHorizontal: 18, marginTop: 16, borderRadius: 18, borderWidth: 1, borderColor: '#E2E8F0', padding: 15, backgroundColor: '#FFFFFF' },
  nutritionTitle: { color: '#0F172A', fontSize: 13, fontWeight: '900' },
  nutritionText: { marginTop: 6, color: '#64748B', fontSize: 12, lineHeight: 18 },
  actionRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginHorizontal: 18, marginTop: 18 },
  quantityBox: { borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', padding: 8, backgroundColor: '#FFFFFF' },
  quantityLabel: { marginBottom: 5, color: '#64748B', fontSize: 10, fontWeight: '800' },
  quantityControl: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  quantityButton: { width: 28, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#E6FFFA' },
  quantityValue: { minWidth: 18, color: '#0F172A', fontSize: 15, fontWeight: '900', textAlign: 'center' },
  addButton: { flex: 1, height: 55, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 16, borderWidth: 1.5, borderColor: '#0F766E', backgroundColor: '#FFFFFF' },
  addButtonText: { color: '#0F766E', fontSize: 13, fontWeight: '900' },
  buyButton: { flex: 1, height: 55, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: '#0F766E' },
  buyButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  disabledButton: { opacity: 0.5 },
  relatedSection: { marginTop: 20 },
  relatedHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 18 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  viewAll: { color: '#0F766E', fontSize: 12, fontWeight: '900' },
  relatedList: { gap: 10, paddingHorizontal: 18, paddingTop: 12 },
  relatedCard: { position: 'relative', width: 145, minHeight: 190, borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', padding: 10, backgroundColor: '#FFFFFF' },
  relatedImage: { width: '100%', height: 92 },
  relatedName: { marginTop: 5, color: '#0F172A', fontSize: 12, lineHeight: 16, fontWeight: '900' },
  relatedPrice: { marginTop: 6, color: '#0F172A', fontSize: 14, fontWeight: '900' },
  relatedAdd: { position: 'absolute', right: 8, bottom: 8, width: 29, height: 29, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: '#0F766E' },
  relatedCartText: { marginTop: 3, color: '#0F766E', fontSize: 10, fontWeight: '800' },
  floatingCart: { position: 'absolute', left: 18, right: 18, bottom: 92, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, padding: 12, backgroundColor: '#0F766E', elevation: 5, shadowColor: '#0F766E', shadowOpacity: 0.22, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
  floatingIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#CCFBF1' },
  floatingCopy: { flex: 1 },
  floatingTitle: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  floatingTotal: { marginTop: 2, color: '#CCFBF1', fontSize: 12, fontWeight: '900' },
  floatingAction: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
});
