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
import { Minus, Plus, ShoppingCart } from 'lucide-react-native';
import { getProductImage } from '@aagam/utils';
import { apiClient } from '@aagam/mobile-shared';
import { useCartStore } from '../../store/cartStore';
import {
  getCartItemCount,
  getCartTotal,
  getProductCartQuantity,
  normalizeProductImages,
} from '../../utils/customerCommerce';

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
    queryFn: async () =>
      (
        await apiClient.get(`/products/${productId}`, {
          params: { includeAvailability: true },
        })
      ).data,
    enabled: Boolean(productId),
  });

  const { data: related = [] } = useQuery({
    queryKey: [
      'related-products',
      product?.categoryId || product?.category?.id,
      productId,
    ],
    queryFn: async () => {
      const categoryId = product?.categoryId || product?.category?.id;
      const response = await apiClient.get('/products', {
        params: { categoryId, pageSize: 8 },
      });
      const rows = Array.isArray(response.data)
        ? response.data
        : response.data?.items || [];
      return rows.filter((item: any) => item.id !== productId).slice(0, 6);
    },
    enabled: Boolean(product?.categoryId || product?.category?.id),
  });

  const fallbackImage = product ? getProductImage(product) : '';
  const productImages = useMemo(
    () => (product ? normalizeProductImages(product, fallbackImage) : []),
    [fallbackImage, product],
  );
  const imageWidth = Math.max(280, width - 32);
  const productQuantity = getProductCartQuantity(items, productId);
  const totalItemCount = getCartItemCount(items);
  const cartTotal = getCartTotal(items);

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
    <View style={styles.screen}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.galleryWrap}>
          <FlatList
            horizontal
            pagingEnabled
            data={productImages}
            keyExtractor={(item, index) => `${item}-${index}`}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(event) => {
              const nextIndex = Math.round(
                event.nativeEvent.contentOffset.x / imageWidth,
              );
              setActiveImageIndex(Math.min(nextIndex, productImages.length - 1));
            }}
            renderItem={({ item }) => (
              <Image
                source={{ uri: item }}
                style={[styles.image, { width: imageWidth }]}
                resizeMode="cover"
              />
            )}
          />
          {productImages.length > 1 ? (
            <>
              <View style={styles.imageCounter}>
                <Text style={styles.imageCounterText}>
                  {activeImageIndex + 1}/{productImages.length}
                </Text>
              </View>
              <View style={styles.pagination}>
                {productImages.map((image, index) => (
                  <View
                    key={`${image}-dot`}
                    style={[
                      styles.paginationDot,
                      index === activeImageIndex && styles.paginationDotActive,
                    ]}
                  />
                ))}
              </View>
            </>
          ) : null}
        </View>

        <Text style={styles.category}>{product.category?.name || 'General'}</Text>
        <Text style={styles.name}>{product.name}</Text>
        <Text style={styles.price}>₹{product.price}</Text>
        <Text style={styles.description}>
          {product.description || 'Freshly stocked and available for delivery.'}
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Availability</Text>
          <Text style={[styles.stockText, !inStock && styles.stockTextOut]}>
            {inStock
              ? 'In stock and ready to order'
              : 'Currently out of stock'}
          </Text>
          {product.availability?.storeName ? (
            <Text style={styles.detailText}>
              Nearest store: {product.availability.storeName}
            </Text>
          ) : null}
        </View>

        {productQuantity > 0 ? (
          <View style={styles.quantityCard}>
            <View>
              <Text style={styles.quantityTitle}>Added to cart</Text>
              <Text style={styles.quantitySubtitle}>
                Update the quantity without leaving this product.
              </Text>
            </View>
            <View style={styles.quantityControl}>
              <TouchableOpacity
                testID="product_detail_decrease_quantity"
                accessibilityLabel="Decrease product quantity"
                style={styles.quantityButton}
                onPress={() => updateQuantity(product.id, productQuantity - 1)}
              >
                <Minus size={18} color="#0F766E" />
              </TouchableOpacity>
              <Text style={styles.quantityValue}>{productQuantity}</Text>
              <TouchableOpacity
                testID="product_detail_increase_quantity"
                accessibilityLabel="Increase product quantity"
                style={styles.quantityButton}
                onPress={() => addItem(product)}
              >
                <Plus size={18} color="#0F766E" />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            testID="product_detail_add_to_cart"
            style={[styles.addButton, !inStock && styles.addButtonDisabled]}
            disabled={!inStock}
            onPress={() => addItem(product)}
          >
            <ShoppingCart size={19} color="#FFFFFF" />
            <Text style={styles.addButtonText}>
              {inStock ? 'Add to Cart' : 'Unavailable'}
            </Text>
          </TouchableOpacity>
        )}

        {related.length > 0 ? (
          <View style={styles.relatedSection}>
            <Text style={styles.relatedTitle}>You may also like</Text>
            <FlatList
              horizontal
              data={related}
              keyExtractor={(item) => item.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.relatedList}
              renderItem={({ item }) => {
                const image = getProductImage(item);
                const itemInStock = item.availability?.inStock ?? true;
                const itemQuantity = getProductCartQuantity(items, item.id);
                return (
                  <TouchableOpacity
                    testID="product_detail_related_product"
                    style={styles.relatedCard}
                    onPress={() =>
                      navigation.push('ProductDetail', { productId: item.id })
                    }
                  >
                    <Image source={{ uri: image }} style={styles.relatedImage} />
                    {itemQuantity > 0 ? (
                      <View style={styles.relatedCartBadge}>
                        <Text style={styles.relatedCartBadgeText}>
                          {itemQuantity} in cart
                        </Text>
                      </View>
                    ) : null}
                    <Text style={styles.relatedName} numberOfLines={2}>
                      {item.name}
                    </Text>
                    <Text style={styles.relatedPrice}>₹{item.price}</Text>
                    <TouchableOpacity
                      testID="product_detail_related_add"
                      disabled={!itemInStock}
                      onPress={(event) => {
                        event.stopPropagation();
                        addItem(item);
                      }}
                      style={[
                        styles.relatedButton,
                        !itemInStock && styles.addButtonDisabled,
                      ]}
                    >
                      <Text style={styles.relatedButtonText}>
                        {itemInStock
                          ? itemQuantity > 0
                            ? `Add more (${itemQuantity})`
                            : 'Add'
                          : 'Out'}
                      </Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        ) : null}
      </ScrollView>

      {totalItemCount > 0 ? (
        <TouchableOpacity
          testID="product_detail_floating_cart"
          accessibilityLabel={`Open cart with ${totalItemCount} items`}
          style={styles.floatingCart}
          activeOpacity={0.94}
          onPress={() => navigation.navigate('MainTabs', { screen: 'Cart' })}
        >
          <View style={styles.floatingCartIcon}>
            <ShoppingCart size={21} color="#115E59" />
            <View style={styles.floatingCartBadge}>
              <Text style={styles.floatingCartBadgeText}>{totalItemCount}</Text>
            </View>
          </View>
          <View style={styles.floatingCartCopy}>
            <Text style={styles.floatingCartTitle}>
              {totalItemCount} {totalItemCount === 1 ? 'item' : 'items'} added
            </Text>
            <Text style={styles.floatingCartTotal}>₹{cartTotal.toFixed(2)}</Text>
          </View>
          <Text style={styles.floatingCartAction}>View Cart</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 16, paddingBottom: 170 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  galleryWrap: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 24,
    backgroundColor: '#E2E8F0',
  },
  image: { height: 300, backgroundColor: '#E2E8F0' },
  imageCounter: {
    position: 'absolute',
    right: 14,
    top: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  imageCounterText: { color: '#FFFFFF', fontWeight: '900', fontSize: 12 },
  pagination: {
    position: 'absolute',
    bottom: 13,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  paginationDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.65)',
  },
  paginationDotActive: { width: 22, backgroundColor: '#FFFFFF' },
  category: {
    marginTop: 18,
    fontSize: 12,
    fontWeight: '800',
    color: '#0F766E',
    textTransform: 'uppercase',
  },
  name: { marginTop: 8, fontSize: 28, fontWeight: '800', color: '#0F172A' },
  price: { marginTop: 10, fontSize: 26, fontWeight: '800', color: '#111827' },
  description: { marginTop: 14, fontSize: 15, lineHeight: 24, color: '#475569' },
  card: {
    marginTop: 20,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  stockText: { marginTop: 10, color: '#0F766E', fontWeight: '700' },
  stockTextOut: { color: '#DC2626' },
  detailText: { marginTop: 8, color: '#64748B' },
  addButton: {
    marginTop: 24,
    backgroundColor: '#0F766E',
    borderRadius: 18,
    paddingVertical: 16,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonDisabled: { backgroundColor: '#94A3B8' },
  addButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
  quantityCard: {
    marginTop: 24,
    borderRadius: 20,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#99F6E4',
    padding: 16,
    gap: 15,
  },
  quantityTitle: { color: '#115E59', fontSize: 16, fontWeight: '900' },
  quantitySubtitle: { marginTop: 4, color: '#0F766E', fontSize: 12, fontWeight: '600' },
  quantityControl: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#99F6E4',
    padding: 4,
  },
  quantityButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#CCFBF1',
  },
  quantityValue: {
    minWidth: 44,
    textAlign: 'center',
    color: '#0F172A',
    fontWeight: '900',
    fontSize: 17,
  },
  errorText: { color: '#B91C1C', fontWeight: '700', textAlign: 'center' },
  relatedSection: { marginTop: 26 },
  relatedTitle: { fontSize: 20, fontWeight: '900', color: '#0F172A', marginBottom: 12 },
  relatedList: { gap: 12, paddingRight: 16 },
  relatedCard: {
    width: 150,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  relatedImage: { width: '100%', height: 96, borderRadius: 14, backgroundColor: '#E2E8F0' },
  relatedCartBadge: {
    alignSelf: 'flex-start',
    marginTop: -12,
    marginLeft: 6,
    borderRadius: 999,
    backgroundColor: '#CCFBF1',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  relatedCartBadgeText: { color: '#115E59', fontSize: 10, fontWeight: '900' },
  relatedName: { marginTop: 8, color: '#0F172A', fontWeight: '800', minHeight: 38 },
  relatedPrice: { marginTop: 4, color: '#0F766E', fontWeight: '900' },
  relatedButton: {
    marginTop: 8,
    backgroundColor: '#0F766E',
    borderRadius: 999,
    alignItems: 'center',
    paddingVertical: 8,
  },
  relatedButtonText: { color: '#FFFFFF', fontWeight: '900', fontSize: 12 },
  floatingCart: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 18,
    minHeight: 72,
    borderRadius: 24,
    backgroundColor: '#0F172A',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.24,
    shadowRadius: 18,
  },
  floatingCartIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: '#CCFBF1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingCartBadge: {
    position: 'absolute',
    right: -5,
    top: -5,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: '#F97316',
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingCartBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  floatingCartCopy: { flex: 1, marginLeft: 12 },
  floatingCartTitle: { color: '#FFFFFF', fontWeight: '900', fontSize: 14 },
  floatingCartTotal: { marginTop: 3, color: '#99F6E4', fontWeight: '800', fontSize: 12 },
  floatingCartAction: { color: '#FFFFFF', fontWeight: '900', fontSize: 13 },
});
