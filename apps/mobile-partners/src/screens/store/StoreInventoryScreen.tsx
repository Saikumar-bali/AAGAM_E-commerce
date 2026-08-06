import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DEFAULT_PRODUCT_IMAGE, getProductImage } from '@aagam/utils';
import Toast from 'react-native-toast-message';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  Minus,
  Package,
  Plus,
  RefreshCw,
  Search,
  Store,
} from 'lucide-react-native';
import { storeService } from '../../api/storeService';
import { AagamBrand } from '../../components/AagamBrand';
import { flattenCataloguePages, nextCataloguePage } from '../../domain/cataloguePagination';
import {
  defaultDraft,
  parseWholeQuantity,
  StoreInventoryDraft,
  validateStoreInventoryDraft,
} from '../../domain/storeInventory';
import {
  effectiveStoreSellingPricePaise,
  productMrpPaise,
  productSellingPricePaise,
} from '../../domain/storeInventoryPresentation';

type Product = {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  pricePaise?: number | null;
  mrpPaise?: number | null;
  image?: string | null;
  category?: { id: string; name: string } | null;
};

type InventoryItem = {
  id: string;
  storeId: string;
  productId: string;
  quantity: number;
  isListed: boolean;
  autoHideWhenOutOfStock: boolean;
  sellingPricePaise?: number | null;
  product: Product;
};

type StoreSummary = { id: string; name: string; address?: string };

type MutationVariables = {
  storeId: string;
  item: InventoryItem;
  draft: StoreInventoryDraft;
  policy?: Partial<Pick<InventoryItem, 'isListed' | 'autoHideWhenOutOfStock'>>;
};

const BRAND_GREEN = '#057A55';
const ACTION_GREEN = '#078B4D';

const formatMoney = (paise: number) =>
  `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const errorText = (error: any, fallback: string) => {
  const raw = error?.response?.data?.message || error?.message || fallback;
  return Array.isArray(raw) ? raw.join(', ') : String(raw);
};

function validateDraftForProduct(
  draft: StoreInventoryDraft,
  product: Product,
  quantityLabel = 'Stock',
) {
  const parsed = validateStoreInventoryDraft(draft, quantityLabel);
  if (!parsed.valid) return parsed;

  const mrpPaise = productMrpPaise(product, productSellingPricePaise(product));
  if (parsed.sellingPrice != null && Math.round(parsed.sellingPrice * 100) > mrpPaise) {
    return {
      valid: false as const,
      message: `Store price cannot exceed MRP ${formatMoney(mrpPaise)}.`,
    };
  }
  return parsed;
}

function ProductThumbnail({ product }: { product: Product }) {
  const [failed, setFailed] = useState(false);
  return (
    <Image
      source={{ uri: failed ? DEFAULT_PRODUCT_IMAGE : getProductImage(product) }}
      style={styles.productImage}
      resizeMode="cover"
      accessibilityLabel={`${product.name} image`}
      onError={() => setFailed(true)}
    />
  );
}

function ProductHeader({
  product,
  sellingPricePaise,
  priceSource,
  quantity,
}: {
  product: Product;
  sellingPricePaise: number;
  priceSource: string;
  quantity?: number;
}) {
  const mrpPaise = productMrpPaise(product, sellingPricePaise);
  return (
    <View style={styles.productHeader}>
      <ProductThumbnail product={product} />
      <View style={styles.productCopy}>
        <Text style={styles.category}>{product.category?.name || 'Catalogue'}</Text>
        <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
        <View style={styles.priceRow}>
          <Text style={styles.sellingPrice}>{formatMoney(sellingPricePaise)}</Text>
          {mrpPaise > sellingPricePaise ? (
            <Text style={styles.mrpPrice}>MRP {formatMoney(mrpPaise)}</Text>
          ) : null}
        </View>
        <Text style={styles.priceSource}>{priceSource}</Text>
      </View>
      {quantity !== undefined ? (
        <View style={[styles.stockBadge, quantity < 10 && styles.stockBadgeWarning]}>
          <Text style={styles.stockBadgeText}>{quantity} units</Text>
        </View>
      ) : null}
    </View>
  );
}

export const StoreInventoryScreen = () => {
  const queryClient = useQueryClient();
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [section, setSection] = useState<'mine' | 'catalogue'>('mine');
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [addDrafts, setAddDrafts] = useState<Record<string, StoreInventoryDraft>>({});
  const [editDrafts, setEditDrafts] = useState<Record<string, StoreInventoryDraft>>({});
  const [storePickerOpen, setStorePickerOpen] = useState(false);

  const storesQuery = useQuery({
    queryKey: ['my-stores'],
    queryFn: storeService.getMyStores,
    retry: 1,
  });
  const stores: StoreSummary[] = useMemo(
    () => (Array.isArray(storesQuery.data) ? storesQuery.data : []),
    [storesQuery.data],
  );

  useEffect(() => {
    setSelectedStoreId((current) => {
      if (current && stores.some((store) => store.id === current)) return current;
      return stores[0]?.id || '';
    });
  }, [stores]);

  const assortmentQuery = useQuery({
    queryKey: ['store-assortment', selectedStoreId],
    queryFn: () => storeService.getStoreAssortment(selectedStoreId),
    enabled: Boolean(selectedStoreId),
    retry: 1,
  });

  const catalogueQuery = useInfiniteQuery({
    queryKey: ['store-catalogue', selectedStoreId, submittedSearch],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      storeService.getAvailableCatalogue(selectedStoreId, submittedSearch, Number(pageParam), 50),
    getNextPageParam: (lastPage: any) => nextCataloguePage(lastPage),
    enabled: Boolean(selectedStoreId),
    retry: 1,
  });

  const assortment: InventoryItem[] = useMemo(
    () => (Array.isArray(assortmentQuery.data) ? assortmentQuery.data : []),
    [assortmentQuery.data],
  );
  const catalogue: Product[] = useMemo(
    () => flattenCataloguePages<Product>(catalogueQuery.data?.pages as any),
    [catalogueQuery.data?.pages],
  );
  const catalogueTotal = Number(catalogueQuery.data?.pages?.[0]?.total || 0);

  useEffect(() => {
    setEditDrafts(
      Object.fromEntries(
        assortment.map((item) => [
          item.id,
          defaultDraft(item.quantity, item.sellingPricePaise),
        ]),
      ),
    );
  }, [selectedStoreId, assortment]);

  useEffect(() => {
    setAddDrafts((current) =>
      Object.fromEntries(
        catalogue.map((product) => [
          product.id,
          current[product.id] || defaultDraft(),
        ]),
      ),
    );
  }, [selectedStoreId, submittedSearch, catalogue]);

  const refresh = async () => {
    const results = await Promise.all([
      storesQuery.refetch(),
      selectedStoreId ? assortmentQuery.refetch() : Promise.resolve(null),
      selectedStoreId ? catalogueQuery.refetch() : Promise.resolve(null),
    ]);
    if (results.some((result: any) => result?.isError)) {
      Toast.show({
        type: 'error',
        text1: 'Refresh failed',
        text2: 'Existing inventory was kept. Check the connection and retry.',
      });
    }
  };

  const addMutation = useMutation({
    mutationFn: ({
      storeId,
      product,
      draft,
    }: {
      storeId: string;
      product: Product;
      draft: StoreInventoryDraft;
    }) => {
      const parsed = validateDraftForProduct(draft, product, 'Opening stock');
      if (!parsed.valid) throw new Error(parsed.message);
      return storeService.addStoreProduct(storeId, {
        productId: product.id,
        openingQuantity: parsed.quantity,
        sellingPrice: parsed.sellingPrice,
        isListed: true,
        autoHideWhenOutOfStock: true,
      });
    },
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['store-assortment', variables.storeId] }),
        queryClient.invalidateQueries({ queryKey: ['store-catalogue', variables.storeId] }),
      ]);
      if (selectedStoreId === variables.storeId) {
        setSection('mine');
        Toast.show({
          type: 'success',
          text1: 'Product added',
          text2: `${variables.product.name} is now in this store.`,
        });
      }
    },
    onError: (error: any) =>
      Toast.show({
        type: 'error',
        text1: 'Could not add product',
        text2: errorText(error, 'Please try again.'),
      }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ storeId, item, draft, policy }: MutationVariables) => {
      const parsed = validateDraftForProduct(draft, item.product);
      if (!parsed.valid) throw new Error(parsed.message);
      return storeService.updateInventory(storeId, {
        productId: item.productId,
        quantity: parsed.quantity,
        sellingPrice: parsed.sellingPrice,
        isListed: policy?.isListed ?? item.isListed,
        autoHideWhenOutOfStock:
          policy?.autoHideWhenOutOfStock ?? item.autoHideWhenOutOfStock,
      });
    },
    onSuccess: async (data, variables) => {
      queryClient.setQueryData<InventoryItem[]>(
        ['store-assortment', variables.storeId],
        (current = []) =>
          current.map((item) =>
            item.id === variables.item.id ? { ...item, ...data } : item,
          ),
      );
      await queryClient.invalidateQueries({
        queryKey: ['store-assortment', variables.storeId],
      });
      if (selectedStoreId === variables.storeId) {
        setEditDrafts((current) => ({
          ...current,
          [variables.item.id]: defaultDraft(data.quantity, data.sellingPricePaise),
        }));
        Toast.show({
          type: 'success',
          text1: 'Inventory updated',
          text2: variables.item.product.name,
        });
      }
    },
    onError: (error: any) =>
      Toast.show({
        type: 'error',
        text1: 'Update failed',
        text2: errorText(error, 'Please try again.'),
      }),
  });

  const selectedStore = stores.find((store) => store.id === selectedStoreId);
  const lowStock = assortment.filter(
    (item) => item.quantity > 0 && item.quantity < 10,
  ).length;
  const refreshing =
    storesQuery.isFetching || assortmentQuery.isFetching || catalogueQuery.isRefetching;
  const loading =
    storesQuery.isLoading || (Boolean(selectedStoreId) && assortmentQuery.isLoading);

  const setAddDraft = (
    productId: string,
    field: keyof StoreInventoryDraft,
    value: string,
  ) =>
    setAddDrafts((current) => ({
      ...current,
      [productId]: {
        ...(current[productId] || defaultDraft()),
        [field]: value,
      },
    }));

  const setEditDraft = (
    itemId: string,
    field: keyof StoreInventoryDraft,
    value: string,
  ) =>
    setEditDrafts((current) => ({
      ...current,
      [itemId]: {
        ...(current[itemId] || defaultDraft()),
        [field]: value,
      },
    }));

  if (storesQuery.isError && !stores.length) {
    return (
      <SafeAreaView style={styles.emptySafeArea}>
        <EmptyState
          icon={<AlertTriangle size={52} color="#DC2626" />}
          title="Could not load stores"
          body={errorText(storesQuery.error, 'Check your connection and try again.')}
          action="Try again"
          onAction={() => void storesQuery.refetch()}
        />
      </SafeAreaView>
    );
  }

  if (!storesQuery.isLoading && stores.length === 0) {
    return (
      <SafeAreaView style={styles.emptySafeArea}>
        <EmptyState
          icon={<Store size={52} color="#94A3B8" />}
          title="No assigned store"
          body="Your approved store must be assigned before you can manage products."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={BRAND_GREEN} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={ACTION_GREEN} />
        }
      >
        <View style={styles.hero}>
          <View style={styles.heroGlow} />
          <View style={styles.brandRow}>
            <AagamBrand compact inverse caption="Store operations" />
            <TouchableOpacity
              testID="inventory_refresh_button"
              accessibilityLabel="Refresh inventory"
              onPress={() => void refresh()}
              style={styles.heroIconButton}
            >
              <RefreshCw size={21} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          <Text style={styles.kicker}>STORE ASSORTMENT</Text>
          <Text style={styles.title}>Products & inventory</Text>
          <Text style={styles.subtitle}>
            Manage visibility, selling price and physical stock from one workspace.
          </Text>
        </View>

        <View style={styles.bodySheet}>
          {stores.length > 1 ? (
            <View style={styles.pickerWrap}>
              <TouchableOpacity
                testID="inventory_store_picker"
                style={styles.storePicker}
                onPress={() => setStorePickerOpen((current) => !current)}
              >
                <View style={styles.storeIcon}><Store size={21} color={ACTION_GREEN} /></View>
                <View style={styles.storePickerText}>
                  <Text style={styles.storePickerLabel}>MANAGING STORE</Text>
                  <Text style={styles.storePickerValue}>
                    {selectedStore?.name || 'Select store'}
                  </Text>
                </View>
                <ChevronDown size={19} color="#64748B" />
              </TouchableOpacity>
              {storePickerOpen ? (
                <View style={styles.storeOptions}>
                  {stores.map((store) => (
                    <TouchableOpacity
                      testID={`inventory_store_option_${store.id}`}
                      key={store.id}
                      style={[
                        styles.storeOption,
                        store.id === selectedStoreId && styles.storeOptionActive,
                      ]}
                      onPress={() => {
                        setSelectedStoreId(store.id);
                        setStorePickerOpen(false);
                        setSubmittedSearch('');
                        setSearch('');
                      }}
                    >
                      <Text style={styles.storeOptionText}>{store.name}</Text>
                      {store.id === selectedStoreId ? (
                        <Check size={18} color={ACTION_GREEN} />
                      ) : null}
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
            </View>
          ) : selectedStore ? (
            <View style={styles.singleStoreBanner}>
              <View style={styles.storeIcon}><Store size={21} color={ACTION_GREEN} /></View>
              <View style={styles.flex}>
                <Text style={styles.singleStoreName}>{selectedStore.name}</Text>
                <Text style={styles.singleStoreAddress} numberOfLines={1}>
                  {selectedStore.address || 'Assigned store'}
                </Text>
              </View>
            </View>
          ) : null}

          <View style={styles.statsRow}>
            <Stat label="MY PRODUCTS" value={assortment.length} />
            <Stat label="TO ADD" value={catalogueTotal} />
            <Stat label="LOW STOCK" value={lowStock} warning={lowStock > 0} />
          </View>

          <View style={styles.tabs}>
            <TouchableOpacity
              testID="inventory_tab_mine"
              style={[styles.tab, section === 'mine' && styles.tabActive]}
              onPress={() => setSection('mine')}
            >
              <Package size={18} color={section === 'mine' ? '#FFFFFF' : '#64748B'} />
              <Text style={[styles.tabText, section === 'mine' && styles.tabTextActive]}>
                My products
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="inventory_tab_catalogue"
              style={[styles.tab, section === 'catalogue' && styles.tabActive]}
              onPress={() => setSection('catalogue')}
            >
              <Plus size={18} color={section === 'catalogue' ? '#FFFFFF' : '#64748B'} />
              <Text style={[styles.tabText, section === 'catalogue' && styles.tabTextActive]}>
                Add products
              </Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator size="large" color={ACTION_GREEN} />
              <Text style={styles.loadingText}>Loading store products…</Text>
            </View>
          ) : section === 'mine' ? (
            assortmentQuery.isError ? (
              <ErrorCard
                title="Could not load inventory"
                body={errorText(assortmentQuery.error, 'Pull down to retry.')}
              />
            ) : assortment.length === 0 ? (
              <EmptyCard
                icon={<Package size={46} color="#94A3B8" />}
                title="No products in this store"
                body="Use Add products to choose items from the Admin catalogue."
                action="Browse catalogue"
                onAction={() => setSection('catalogue')}
              />
            ) : (
              assortment.map((item) => {
                const draft =
                  editDrafts[item.id] ||
                  defaultDraft(item.quantity, item.sellingPricePaise);
                const quantity = parseWholeQuantity(draft.quantity) ?? item.quantity;
                const adminPricePaise = productSellingPricePaise(item.product);
                const sellingPricePaise = effectiveStoreSellingPricePaise(
                  item.product,
                  item.sellingPricePaise,
                );
                const updating =
                  updateMutation.isPending &&
                  updateMutation.variables?.storeId === selectedStoreId &&
                  updateMutation.variables?.item.id === item.id;

                return (
                  <View key={item.id} style={styles.productCard}>
                    <ProductHeader
                      product={item.product}
                      sellingPricePaise={sellingPricePaise}
                      priceSource={
                        item.sellingPricePaise == null
                          ? 'Admin selling price'
                          : 'Store selling price'
                      }
                      quantity={item.quantity}
                    />
                    {item.quantity < 10 ? (
                      <View style={styles.warningBanner}>
                        <AlertTriangle size={16} color="#B45309" />
                        <Text style={styles.warningText}>
                          {item.quantity === 0 ? 'Out of stock' : 'Low stock — replenish soon'}
                        </Text>
                      </View>
                    ) : null}
                    <View style={styles.fieldsRow}>
                      <Field
                        label="Store selling price"
                        value={draft.sellingPrice}
                        onChangeText={(value) =>
                          setEditDraft(item.id, 'sellingPrice', value)
                        }
                        keyboardType="decimal-pad"
                        testID={`inventory_edit_price_${item.id}`}
                        placeholder={String(adminPricePaise / 100)}
                      />
                      <Field
                        label="Current stock"
                        value={draft.quantity}
                        onChangeText={(value) => setEditDraft(item.id, 'quantity', value)}
                        keyboardType="number-pad"
                        testID={`inventory_edit_quantity_${item.id}`}
                      />
                    </View>
                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        accessibilityLabel="Decrease stock"
                        style={styles.stepButton}
                        onPress={() =>
                          setEditDraft(
                            item.id,
                            'quantity',
                            String(Math.max(0, quantity - 1)),
                          )
                        }
                      >
                        <Minus size={19} color="#334155" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        accessibilityLabel="Increase stock"
                        style={styles.stepButton}
                        onPress={() =>
                          setEditDraft(item.id, 'quantity', String(quantity + 1))
                        }
                      >
                        <Plus size={19} color="#334155" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        testID={`inventory_save_${item.id}`}
                        disabled={updating}
                        style={[styles.saveButton, updating && styles.disabledButton]}
                        onPress={() =>
                          updateMutation.mutate({
                            storeId: selectedStoreId,
                            item,
                            draft,
                          })
                        }
                      >
                        {updating ? (
                          <ActivityIndicator color="#FFFFFF" />
                        ) : (
                          <Text style={styles.saveButtonText}>Save inventory</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                    <View style={styles.policyRow}>
                      <TouchableOpacity
                        testID={`inventory_listed_${item.id}`}
                        style={[
                          styles.policyButton,
                          item.isListed ? styles.policyPositive : styles.policyNeutral,
                        ]}
                        onPress={() =>
                          updateMutation.mutate({
                            storeId: selectedStoreId,
                            item,
                            draft,
                            policy: { isListed: !item.isListed },
                          })
                        }
                      >
                        {item.isListed ? (
                          <Eye size={16} color="#047857" />
                        ) : (
                          <EyeOff size={16} color="#475569" />
                        )}
                        <Text style={styles.policyText}>
                          {item.isListed ? 'Listed' : 'Hidden'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        testID={`inventory_auto_hide_${item.id}`}
                        style={[styles.policyButton, styles.policyAuto]}
                        onPress={() =>
                          updateMutation.mutate({
                            storeId: selectedStoreId,
                            item,
                            draft,
                            policy: {
                              autoHideWhenOutOfStock: !item.autoHideWhenOutOfStock,
                            },
                          })
                        }
                      >
                        <Text style={styles.policyAutoText}>
                          Auto-hide: {item.autoHideWhenOutOfStock ? 'On' : 'Off'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )
          ) : (
            <>
              <View style={styles.searchRow}>
                <View style={styles.searchInputWrap}>
                  <Search size={18} color="#94A3B8" />
                  <TextInput
                    testID="inventory_search_input"
                    value={search}
                    onChangeText={setSearch}
                    onSubmitEditing={() => setSubmittedSearch(search.trim())}
                    placeholder="Search catalogue"
                    placeholderTextColor="#94A3B8"
                    returnKeyType="search"
                    style={styles.searchInput}
                  />
                </View>
                <TouchableOpacity
                  testID="inventory_search_button"
                  style={styles.searchButton}
                  onPress={() => setSubmittedSearch(search.trim())}
                >
                  <Text style={styles.searchButtonText}>Search</Text>
                </TouchableOpacity>
              </View>

              {catalogueQuery.isLoading ? (
                <View style={styles.loading}>
                  <ActivityIndicator size="large" color={ACTION_GREEN} />
                </View>
              ) : catalogueQuery.isError ? (
                <ErrorCard
                  title="Could not load catalogue"
                  body={errorText(catalogueQuery.error, 'Pull down to retry.')}
                />
              ) : catalogue.length === 0 ? (
                <EmptyCard
                  icon={<Check size={46} color="#10B981" />}
                  title="No products available to add"
                  body="All matching Admin products are already part of this store."
                />
              ) : (
                catalogue.map((product) => {
                  const draft = addDrafts[product.id] || defaultDraft();
                  const adminPricePaise = productSellingPricePaise(product);
                  const adding =
                    addMutation.isPending &&
                    addMutation.variables?.product.id === product.id;
                  return (
                    <View key={product.id} style={styles.productCard}>
                      <ProductHeader
                        product={product}
                        sellingPricePaise={adminPricePaise}
                        priceSource="Admin selling price"
                      />
                      <View style={styles.fieldsRow}>
                        <Field
                          label="Opening stock"
                          value={draft.quantity}
                          onChangeText={(value) =>
                            setAddDraft(product.id, 'quantity', value)
                          }
                          keyboardType="number-pad"
                          testID={`inventory_add_quantity_${product.id}`}
                        />
                        <Field
                          label="Store selling price"
                          value={draft.sellingPrice}
                          onChangeText={(value) =>
                            setAddDraft(product.id, 'sellingPrice', value)
                          }
                          keyboardType="decimal-pad"
                          testID={`inventory_add_price_${product.id}`}
                          placeholder={String(adminPricePaise / 100)}
                        />
                      </View>
                      <TouchableOpacity
                        testID={`inventory_add_${product.id}`}
                        disabled={adding}
                        style={[styles.addButton, adding && styles.disabledButton]}
                        onPress={() =>
                          addMutation.mutate({
                            storeId: selectedStoreId,
                            product,
                            draft,
                          })
                        }
                      >
                        {adding ? (
                          <ActivityIndicator color="#FFFFFF" />
                        ) : (
                          <Text style={styles.addButtonText}>Add to store</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}

              {catalogueQuery.hasNextPage ? (
                <TouchableOpacity
                  testID="catalogue_load_more_button"
                  disabled={catalogueQuery.isFetchingNextPage}
                  style={styles.loadMoreButton}
                  onPress={() => void catalogueQuery.fetchNextPage()}
                >
                  {catalogueQuery.isFetchingNextPage ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Load more products</Text>
                  )}
                </TouchableOpacity>
              ) : null}
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

function Stat({ label, value, warning }: { label: string; value: number; warning?: boolean }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, warning && styles.warningValue]}>{value}</Text>
    </View>
  );
}

function EmptyState({
  icon,
  title,
  body,
  action,
  onAction,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.emptyPage}>
      {icon}
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
      {action && onAction ? (
        <TouchableOpacity style={styles.primaryButton} onPress={onAction}>
          <Text style={styles.primaryButtonText}>{action}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function EmptyCard(props: React.ComponentProps<typeof EmptyState>) {
  return <View style={styles.emptyCard}><EmptyState {...props} /></View>;
}

function ErrorCard({ title, body }: { title: string; body: string }) {
  return (
    <EmptyCard
      icon={<AlertTriangle size={44} color="#DC2626" />}
      title={title}
      body={body}
    />
  );
}

function Field({
  label,
  value,
  onChangeText,
  keyboardType,
  testID,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType: any;
  testID: string;
  placeholder?: string;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor="#94A3B8"
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BRAND_GREEN },
  emptySafeArea: { flex: 1, backgroundColor: '#F7F8F7' },
  container: { flex: 1, backgroundColor: '#F7F8F7' },
  content: { paddingBottom: 120 },
  flex: { flex: 1 },
  hero: {
    minHeight: 230,
    backgroundColor: BRAND_GREEN,
    paddingHorizontal: 20,
    paddingTop: 13,
    paddingBottom: 30,
    overflow: 'hidden',
  },
  heroGlow: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    right: -95,
    top: -110,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroIconButton: { width: 45, height: 45, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  kicker: { color: '#BDF6DD', fontSize: 10, fontWeight: '900', letterSpacing: 1.4, marginTop: 25 },
  title: { color: '#FFFFFF', fontSize: 30, lineHeight: 36, fontWeight: '900', letterSpacing: -0.8, marginTop: 4 },
  subtitle: { color: '#E5FFF4', fontSize: 13, lineHeight: 20, marginTop: 7, maxWidth: 330 },
  bodySheet: { marginTop: -24, minHeight: 600, borderTopLeftRadius: 30, borderTopRightRadius: 30, backgroundColor: '#F7F8F7', paddingHorizontal: 18, paddingTop: 24 },
  pickerWrap: { marginBottom: 2 },
  storePicker: { minHeight: 72, borderRadius: 19, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DCE3E0', paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 11, shadowColor: '#10241D', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2 },
  storeIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: '#E8F8EE', alignItems: 'center', justifyContent: 'center' },
  storePickerText: { flex: 1 },
  storePickerLabel: { color: '#6B7470', fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
  storePickerValue: { color: '#15181C', fontSize: 15, fontWeight: '900', marginTop: 3 },
  storeOptions: { marginTop: 7, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#DCE3E0', overflow: 'hidden' },
  storeOption: { minHeight: 49, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#EDF0EE' },
  storeOptionActive: { backgroundColor: '#EDF9F2' },
  storeOptionText: { color: '#334155', fontWeight: '800' },
  singleStoreBanner: { minHeight: 72, paddingHorizontal: 15, borderRadius: 19, backgroundColor: '#E8F8EE', borderWidth: 1, borderColor: '#A9E5C8', flexDirection: 'row', alignItems: 'center', gap: 11 },
  singleStoreName: { color: '#075E43', fontSize: 15, fontWeight: '900' },
  singleStoreAddress: { color: '#29755D', fontSize: 11, marginTop: 3 },
  statsRow: { flexDirection: 'row', gap: 9, marginTop: 14 },
  statCard: { flex: 1, minHeight: 92, backgroundColor: '#FFFFFF', borderRadius: 17, padding: 13, borderWidth: 1, borderColor: '#DEE3E1', shadowColor: '#10241D', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 },
  statLabel: { color: '#7C8791', fontSize: 8, fontWeight: '900', letterSpacing: 0.3 },
  statValue: { color: '#15181C', fontSize: 22, fontWeight: '900', marginTop: 8 },
  warningValue: { color: '#B45309' },
  tabs: { flexDirection: 'row', gap: 9, marginTop: 16, marginBottom: 12 },
  tab: { flex: 1, minHeight: 54, borderRadius: 17, backgroundColor: '#E6EBE8', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  tabActive: { backgroundColor: ACTION_GREEN, shadowColor: ACTION_GREEN, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.18, shadowRadius: 10, elevation: 3 },
  tabText: { color: '#64748B', fontSize: 13, fontWeight: '900' },
  tabTextActive: { color: '#FFFFFF' },
  loading: { minHeight: 230, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { color: '#64748B' },
  emptyPage: { flex: 1, minHeight: 330, alignItems: 'center', justifyContent: 'center', padding: 28 },
  emptyCard: { minHeight: 200, borderRadius: 22, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DEE3E1', marginTop: 8 },
  emptyTitle: { color: '#0F172A', fontSize: 18, fontWeight: '900', marginTop: 12, textAlign: 'center' },
  emptyBody: { color: '#64748B', fontSize: 12, lineHeight: 19, textAlign: 'center', marginTop: 6 },
  primaryButton: { minHeight: 48, borderRadius: 15, backgroundColor: ACTION_GREEN, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', marginTop: 15 },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '900' },
  productCard: { marginTop: 12, borderRadius: 22, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DEE3E1', padding: 15, shadowColor: '#10241D', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.05, shadowRadius: 11, elevation: 2 },
  productHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  productImage: { width: 70, height: 70, borderRadius: 17, backgroundColor: '#F1F5F9' },
  productCopy: { flex: 1, marginLeft: 12 },
  category: { color: ACTION_GREEN, fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },
  productName: { color: '#15181C', fontSize: 15, fontWeight: '900', marginTop: 3 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 6 },
  sellingPrice: { color: '#15181C', fontSize: 18, fontWeight: '900' },
  mrpPrice: { color: '#94A3B8', fontSize: 10, textDecorationLine: 'line-through' },
  priceSource: { color: '#64748B', fontSize: 9, marginTop: 2 },
  stockBadge: { borderRadius: 999, backgroundColor: '#DCFCE7', paddingHorizontal: 9, paddingVertical: 6 },
  stockBadgeWarning: { backgroundColor: '#FEF3C7' },
  stockBadgeText: { color: '#166534', fontSize: 9, fontWeight: '900' },
  warningBanner: { marginTop: 12, borderRadius: 13, padding: 10, backgroundColor: '#FFFBEB', flexDirection: 'row', alignItems: 'center', gap: 7 },
  warningText: { color: '#92400E', fontSize: 11, fontWeight: '800' },
  fieldsRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  fieldWrap: { flex: 1 },
  fieldLabel: { color: '#5D6963', fontSize: 9, fontWeight: '900', marginBottom: 6, textTransform: 'uppercase' },
  input: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: '#CFD8D4', backgroundColor: '#FAFBFA', paddingHorizontal: 12, color: '#15181C', fontWeight: '800' },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  stepButton: { width: 50, height: 50, borderRadius: 15, backgroundColor: '#F0F3F1', alignItems: 'center', justifyContent: 'center' },
  saveButton: { flex: 1, height: 50, borderRadius: 15, backgroundColor: ACTION_GREEN, alignItems: 'center', justifyContent: 'center' },
  saveButtonText: { color: '#FFFFFF', fontWeight: '900' },
  disabledButton: { opacity: 0.55 },
  policyRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  policyButton: { flex: 1, minHeight: 44, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8 },
  policyPositive: { backgroundColor: '#E8F8EE' },
  policyNeutral: { backgroundColor: '#F1F5F9' },
  policyAuto: { backgroundColor: '#EEF5FF' },
  policyText: { color: '#334155', fontSize: 11, fontWeight: '900' },
  policyAutoText: { color: '#1D4ED8', fontSize: 11, fontWeight: '900' },
  searchRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  searchInputWrap: { flex: 1, minHeight: 50, borderRadius: 15, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CFD8D4', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 },
  searchInput: { flex: 1, color: '#0F172A' },
  searchButton: { minWidth: 79, borderRadius: 15, backgroundColor: ACTION_GREEN, alignItems: 'center', justifyContent: 'center' },
  searchButtonText: { color: '#FFFFFF', fontWeight: '900' },
  addButton: { minHeight: 50, borderRadius: 15, backgroundColor: ACTION_GREEN, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  addButtonText: { color: '#FFFFFF', fontWeight: '900' },
  loadMoreButton: { minHeight: 50, borderRadius: 15, backgroundColor: ACTION_GREEN, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
});
