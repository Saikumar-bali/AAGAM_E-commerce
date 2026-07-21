import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import {
  defaultDraft,
  parseWholeQuantity,
  StoreInventoryDraft,
  validateStoreInventoryDraft,
} from '../../domain/storeInventory';

type Product = {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  pricePaise?: number;
  mrpPaise?: number;
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

const formatMoney = (paise?: number | null, fallbackRupees = 0) =>
  `₹${((paise == null ? fallbackRupees * 100 : paise) / 100).toLocaleString('en-IN', {
    maximumFractionDigits: 2,
  })}`;

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
  });
  const stores: StoreSummary[] = Array.isArray(storesQuery.data) ? storesQuery.data : [];

  useEffect(() => {
    if (!selectedStoreId && stores[0]?.id) setSelectedStoreId(stores[0].id);
  }, [selectedStoreId, stores]);

  const assortmentQuery = useQuery({
    queryKey: ['store-assortment', selectedStoreId],
    queryFn: () => storeService.getStoreAssortment(selectedStoreId),
    enabled: Boolean(selectedStoreId),
  });

  const catalogueQuery = useQuery({
    queryKey: ['store-catalogue', selectedStoreId, submittedSearch],
    queryFn: () => storeService.getAvailableCatalogue(selectedStoreId, submittedSearch),
    enabled: Boolean(selectedStoreId),
  });

  const assortment: InventoryItem[] = Array.isArray(assortmentQuery.data) ? assortmentQuery.data : [];
  const catalogue: Product[] = catalogueQuery.data?.items || [];

  useEffect(() => {
    setEditDrafts((current) => {
      const next = { ...current };
      assortment.forEach((item) => {
        next[item.id] ||= defaultDraft(item.quantity, item.sellingPricePaise);
      });
      return next;
    });
  }, [assortment]);

  useEffect(() => {
    setAddDrafts((current) => {
      const next = { ...current };
      catalogue.forEach((product) => {
        next[product.id] ||= defaultDraft();
      });
      return next;
    });
  }, [catalogue]);

  const refresh = async () => {
    await Promise.all([assortmentQuery.refetch(), catalogueQuery.refetch()]);
  };

  const addMutation = useMutation({
    mutationFn: ({ storeId, product, draft }: { storeId: string; product: Product; draft: StoreInventoryDraft }) => {
      const parsed = validateStoreInventoryDraft(draft, 'Opening stock');
      if (!parsed.valid) throw new Error(parsed.message);
      return storeService.addStoreProduct(storeId, {
        productId: product.id,
        openingQuantity: parsed.quantity,
        sellingPrice: parsed.sellingPrice,
        isListed: true,
        autoHideWhenOutOfStock: true,
      });
    },
    onSuccess: async (data, variables) => {
      queryClient.setQueryData<InventoryItem[]>(['store-assortment', variables.storeId], (current = []) => [
        ...current,
        data,
      ].sort((a, b) => a.product.name.localeCompare(b.product.name)));
      queryClient.setQueryData(['store-catalogue', variables.storeId, submittedSearch], (current: any) => ({
        ...(current || {}),
        items: (current?.items || []).filter((product: Product) => product.id !== variables.product.id),
        total: Math.max(0, Number(current?.total || 1) - 1),
      }));
      if (variables.storeId === selectedStoreId) setSection('mine');
      Toast.show({
        type: 'success',
        text1: 'Product added',
        text2: `${variables.product.name} is now part of this store.`,
      });
    },
    onError: (error: any) => {
      Toast.show({
        type: 'error',
        text1: 'Could not add product',
        text2: error?.response?.data?.message || error?.message || 'Please try again.',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ storeId, item, draft, policy }: {
      storeId: string;
      item: InventoryItem;
      draft: StoreInventoryDraft;
      policy?: Partial<Pick<InventoryItem, 'isListed' | 'autoHideWhenOutOfStock'>>;
    }) => {
      const parsed = validateStoreInventoryDraft(draft);
      if (!parsed.valid) throw new Error(parsed.message);
      return storeService.updateInventory(storeId, {
        productId: item.productId,
        quantity: parsed.quantity,
        sellingPrice: parsed.sellingPrice,
        isListed: policy?.isListed ?? item.isListed,
        autoHideWhenOutOfStock: policy?.autoHideWhenOutOfStock ?? item.autoHideWhenOutOfStock,
      });
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData<InventoryItem[]>(['store-assortment', variables.storeId], (current = []) =>
        current.map((item) => item.id === variables.item.id ? { ...item, ...data } : item),
      );
      setEditDrafts((current) => ({
        ...current,
        [variables.item.id]: defaultDraft(data.quantity, data.sellingPricePaise),
      }));
      Toast.show({ type: 'success', text1: 'Inventory updated', text2: variables.item.product.name });
    },
    onError: (error: any) => {
      Toast.show({
        type: 'error',
        text1: 'Update failed',
        text2: error?.response?.data?.message || error?.message || 'Please try again.',
      });
    },
  });

  const selectedStore = stores.find((store) => store.id === selectedStoreId);
  const lowStock = useMemo(() => assortment.filter((item) => item.quantity > 0 && item.quantity < 10).length, [assortment]);
  const refreshing = storesQuery.isFetching || assortmentQuery.isFetching || catalogueQuery.isFetching;
  const loading = storesQuery.isLoading || (Boolean(selectedStoreId) && assortmentQuery.isLoading);

  const setAddDraft = (productId: string, field: keyof StoreInventoryDraft, value: string) => {
    setAddDrafts((current) => ({
      ...current,
      [productId]: { ...(current[productId] || defaultDraft()), [field]: value },
    }));
  };

  const setEditDraft = (itemId: string, field: keyof StoreInventoryDraft, value: string) => {
    setEditDrafts((current) => ({
      ...current,
      [itemId]: { ...(current[itemId] || defaultDraft()), [field]: value },
    }));
  };

  if (!loading && stores.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.emptyPage}>
          <Store size={52} color="#94A3B8" />
          <Text style={styles.emptyTitle}>No assigned store</Text>
          <Text style={styles.emptyBody}>Your approved store must be assigned before you can manage products.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.kicker}>STORE ASSORTMENT</Text>
            <Text style={styles.title}>Products & inventory</Text>
            <Text style={styles.subtitle}>Choose what your store carries and maintain the physical stock.</Text>
          </View>
          <TouchableOpacity accessibilityLabel="Refresh inventory" onPress={refresh} style={styles.iconButton}>
            <RefreshCw size={20} color="#0F172A" />
          </TouchableOpacity>
        </View>

        {stores.length > 1 ? (
          <View style={styles.pickerWrap}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Select store"
              style={styles.storePicker}
              onPress={() => setStorePickerOpen((current) => !current)}
            >
              <Store size={18} color="#0F766E" />
              <View style={styles.storePickerText}>
                <Text style={styles.storePickerLabel}>Managing store</Text>
                <Text style={styles.storePickerValue}>{selectedStore?.name || 'Select store'}</Text>
              </View>
              <ChevronDown size={18} color="#64748B" />
            </TouchableOpacity>
            {storePickerOpen ? (
              <View style={styles.storeOptions}>
                {stores.map((store) => (
                  <TouchableOpacity
                    key={store.id}
                    style={[styles.storeOption, store.id === selectedStoreId && styles.storeOptionActive]}
                    onPress={() => {
                      setSelectedStoreId(store.id);
                      setStorePickerOpen(false);
                      setSubmittedSearch('');
                      setSearch('');
                    }}
                  >
                    <Text style={[styles.storeOptionText, store.id === selectedStoreId && styles.storeOptionTextActive]}>{store.name}</Text>
                    {store.id === selectedStoreId ? <Check size={18} color="#0F766E" /> : null}
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </View>
        ) : selectedStore ? (
          <View style={styles.singleStoreBanner}>
            <Store size={18} color="#0F766E" />
            <View style={{ flex: 1 }}>
              <Text style={styles.singleStoreName}>{selectedStore.name}</Text>
              {selectedStore.address ? <Text style={styles.singleStoreAddress}>{selectedStore.address}</Text> : null}
            </View>
          </View>
        ) : null}

        <View style={styles.statsRow}>
          <View style={styles.statCard}><Text style={styles.statLabel}>MY PRODUCTS</Text><Text style={styles.statValue}>{assortment.length}</Text></View>
          <View style={styles.statCard}><Text style={styles.statLabel}>TO ADD</Text><Text style={styles.statValue}>{catalogue.length}</Text></View>
          <View style={styles.statCard}><Text style={styles.statLabel}>LOW STOCK</Text><Text style={[styles.statValue, lowStock > 0 && styles.warningValue]}>{lowStock}</Text></View>
        </View>

        <View style={styles.tabs}>
          <TouchableOpacity
            accessibilityRole="tab"
            accessibilityState={{ selected: section === 'mine' }}
            style={[styles.tab, section === 'mine' && styles.tabActive]}
            onPress={() => setSection('mine')}
          >
            <Package size={17} color={section === 'mine' ? '#FFFFFF' : '#64748B'} />
            <Text style={[styles.tabText, section === 'mine' && styles.tabTextActive]}>My products</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="tab"
            accessibilityState={{ selected: section === 'catalogue' }}
            style={[styles.tab, section === 'catalogue' && styles.tabActive]}
            onPress={() => setSection('catalogue')}
          >
            <Plus size={17} color={section === 'catalogue' ? '#FFFFFF' : '#64748B'} />
            <Text style={[styles.tabText, section === 'catalogue' && styles.tabTextActive]}>Add products</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loading}><ActivityIndicator size="large" color="#0F766E" /><Text style={styles.loadingText}>Loading store products…</Text></View>
        ) : section === 'mine' ? (
          assortment.length === 0 ? (
            <View style={styles.emptyCard}>
              <Package size={46} color="#94A3B8" />
              <Text style={styles.emptyTitle}>No products in this store</Text>
              <Text style={styles.emptyBody}>Use Add products to choose items from the Admin catalogue and enter opening stock.</Text>
              <TouchableOpacity style={styles.primaryButton} onPress={() => setSection('catalogue')}>
                <Text style={styles.primaryButtonText}>Browse catalogue</Text>
              </TouchableOpacity>
            </View>
          ) : (
            assortment.map((item) => {
              const draft = editDrafts[item.id] || defaultDraft(item.quantity, item.sellingPricePaise);
              const quantity = parseWholeQuantity(draft.quantity) ?? item.quantity;
              const updating = updateMutation.isPending && updateMutation.variables?.storeId === selectedStoreId && updateMutation.variables?.item.id === item.id;
              return (
                <View key={item.id} style={styles.productCard}>
                  <View style={styles.productHeader}>
                    <View style={styles.productIcon}><Package size={24} color="#0F766E" /></View>
                    <View style={styles.productCopy}>
                      <Text style={styles.category}>{item.product.category?.name || 'Catalogue'}</Text>
                      <Text style={styles.productName}>{item.product.name}</Text>
                      <Text style={styles.productMeta}>Admin MRP {formatMoney(item.product.mrpPaise, item.product.price)}</Text>
                    </View>
                    <View style={[styles.stockBadge, item.quantity < 10 && styles.stockBadgeWarning]}>
                      <Text style={[styles.stockBadgeText, item.quantity < 10 && styles.stockBadgeTextWarning]}>{item.quantity} units</Text>
                    </View>
                  </View>

                  {item.quantity < 10 ? (
                    <View style={styles.warningBanner}>
                      <AlertTriangle size={16} color="#B45309" />
                      <Text style={styles.warningText}>{item.quantity === 0 ? 'Out of stock' : 'Low stock — consider replenishing soon'}</Text>
                    </View>
                  ) : null}

                  <View style={styles.fieldsRow}>
                    <View style={styles.fieldWrap}>
                      <Text style={styles.fieldLabel}>Store price</Text>
                      <TextInput
                        accessibilityLabel={`${item.product.name} store price`}
                        value={draft.sellingPrice}
                        onChangeText={(value) => setEditDraft(item.id, 'sellingPrice', value)}
                        placeholder={String(item.product.price)}
                        keyboardType="decimal-pad"
                        style={styles.input}
                      />
                    </View>
                    <View style={styles.fieldWrap}>
                      <Text style={styles.fieldLabel}>Current stock</Text>
                      <TextInput
                        accessibilityLabel={`${item.product.name} stock`}
                        value={draft.quantity}
                        onChangeText={(value) => setEditDraft(item.id, 'quantity', value)}
                        keyboardType="number-pad"
                        style={styles.input}
                      />
                    </View>
                  </View>

                  <View style={styles.actionRow}>
                    <TouchableOpacity accessibilityLabel={`Decrease ${item.product.name} stock`} style={styles.stepButton} onPress={() => setEditDraft(item.id, 'quantity', String(Math.max(0, quantity - 1)))}><Minus size={18} color="#334155" /></TouchableOpacity>
                    <TouchableOpacity accessibilityLabel={`Increase ${item.product.name} stock`} style={styles.stepButton} onPress={() => setEditDraft(item.id, 'quantity', String(quantity + 1))}><Plus size={18} color="#334155" /></TouchableOpacity>
                    <TouchableOpacity
                      disabled={updating}
                      style={[styles.saveButton, updating && styles.disabledButton]}
                      onPress={() => updateMutation.mutate({ storeId: selectedStoreId, item, draft })}
                    >
                      {updating ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.saveButtonText}>Save inventory</Text>}
                    </TouchableOpacity>
                  </View>

                  <View style={styles.policyRow}>
                    <TouchableOpacity
                      style={[styles.policyButton, item.isListed ? styles.policyPositive : styles.policyNeutral]}
                      onPress={() => updateMutation.mutate({ storeId: selectedStoreId, item, draft, policy: { isListed: !item.isListed } })}
                    >
                      {item.isListed ? <Eye size={16} color="#047857" /> : <EyeOff size={16} color="#475569" />}
                      <Text style={[styles.policyText, item.isListed ? styles.policyPositiveText : styles.policyNeutralText]}>{item.isListed ? 'Listed' : 'Hidden'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.policyButton, styles.policyAuto]}
                      onPress={() => updateMutation.mutate({ storeId: selectedStoreId, item, draft, policy: { autoHideWhenOutOfStock: !item.autoHideWhenOutOfStock } })}
                    >
                      <Text style={styles.policyAutoText}>Auto-hide: {item.autoHideWhenOutOfStock ? 'On' : 'Off'}</Text>
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
                  accessibilityLabel="Search Admin catalogue"
                  value={search}
                  onChangeText={setSearch}
                  onSubmitEditing={() => setSubmittedSearch(search.trim())}
                  placeholder="Search catalogue"
                  returnKeyType="search"
                  style={styles.searchInput}
                />
              </View>
              <TouchableOpacity style={styles.searchButton} onPress={() => setSubmittedSearch(search.trim())}>
                <Text style={styles.searchButtonText}>Search</Text>
              </TouchableOpacity>
            </View>

            {catalogueQuery.isLoading ? (
              <View style={styles.loading}><ActivityIndicator size="large" color="#0F766E" /></View>
            ) : catalogue.length === 0 ? (
              <View style={styles.emptyCard}>
                <Check size={46} color="#10B981" />
                <Text style={styles.emptyTitle}>No products available to add</Text>
                <Text style={styles.emptyBody}>All matching Admin products are already part of this store.</Text>
              </View>
            ) : (
              catalogue.map((product) => {
                const draft = addDrafts[product.id] || defaultDraft();
                const adding = addMutation.isPending && addMutation.variables?.storeId === selectedStoreId && addMutation.variables?.product.id === product.id;
                return (
                  <View key={product.id} style={styles.productCard}>
                    <View style={styles.productHeader}>
                      <View style={styles.productIcon}><Package size={24} color="#0F766E" /></View>
                      <View style={styles.productCopy}>
                        <Text style={styles.category}>{product.category?.name || 'Catalogue'}</Text>
                        <Text style={styles.productName}>{product.name}</Text>
                        <Text style={styles.productMeta}>MRP {formatMoney(product.mrpPaise, product.price)}</Text>
                      </View>
                    </View>
                    <View style={styles.fieldsRow}>
                      <View style={styles.fieldWrap}>
                        <Text style={styles.fieldLabel}>Opening stock</Text>
                        <TextInput
                          accessibilityLabel={`${product.name} opening stock`}
                          value={draft.quantity}
                          onChangeText={(value) => setAddDraft(product.id, 'quantity', value)}
                          keyboardType="number-pad"
                          style={styles.input}
                        />
                      </View>
                      <View style={styles.fieldWrap}>
                        <Text style={styles.fieldLabel}>Store price</Text>
                        <TextInput
                          accessibilityLabel={`${product.name} new store price`}
                          value={draft.sellingPrice}
                          onChangeText={(value) => setAddDraft(product.id, 'sellingPrice', value)}
                          placeholder={String(product.price)}
                          keyboardType="decimal-pad"
                          style={styles.input}
                        />
                      </View>
                    </View>
                    <TouchableOpacity
                      disabled={adding}
                      style={[styles.addButton, adding && styles.disabledButton]}
                      onPress={() => addMutation.mutate({ storeId: selectedStoreId, product, draft })}
                    >
                      {adding ? <ActivityIndicator size="small" color="#FFFFFF" /> : <><Plus size={18} color="#FFFFFF" /><Text style={styles.addButtonText}>Add to store</Text></>}
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </>
        )}

        <View style={{ height: 110 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8FAFC' },
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 18, paddingBottom: 20 },
  headerRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  headerText: { flex: 1 },
  kicker: { color: '#0F766E', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  title: { marginTop: 6, color: '#0F172A', fontSize: 28, fontWeight: '900', letterSpacing: -0.8 },
  subtitle: { marginTop: 7, color: '#64748B', fontSize: 13, lineHeight: 19, fontWeight: '600' },
  iconButton: { width: 44, height: 44, borderRadius: 15, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  pickerWrap: { marginTop: 18, zIndex: 20 },
  storePicker: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CCFBF1', borderRadius: 18, padding: 14 },
  storePickerText: { flex: 1 },
  storePickerLabel: { fontSize: 10, color: '#64748B', fontWeight: '800', textTransform: 'uppercase' },
  storePickerValue: { marginTop: 2, fontSize: 15, color: '#0F172A', fontWeight: '900' },
  storeOptions: { marginTop: 8, backgroundColor: '#FFFFFF', borderRadius: 18, padding: 8, borderWidth: 1, borderColor: '#E2E8F0', elevation: 8 },
  storeOption: { padding: 13, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  storeOptionActive: { backgroundColor: '#F0FDFA' },
  storeOptionText: { color: '#475569', fontSize: 14, fontWeight: '700' },
  storeOptionTextActive: { color: '#0F766E', fontWeight: '900' },
  singleStoreBanner: { marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, backgroundColor: '#F0FDFA', borderWidth: 1, borderColor: '#CCFBF1', padding: 14 },
  singleStoreName: { color: '#134E4A', fontSize: 15, fontWeight: '900' },
  singleStoreAddress: { marginTop: 2, color: '#0F766E', fontSize: 11, fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  statCard: { flex: 1, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 12 },
  statLabel: { color: '#94A3B8', fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
  statValue: { marginTop: 5, color: '#0F172A', fontSize: 22, fontWeight: '900' },
  warningValue: { color: '#D97706' },
  tabs: { marginTop: 16, flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 17, padding: 5, borderWidth: 1, borderColor: '#E2E8F0' },
  tab: { flex: 1, minHeight: 45, borderRadius: 13, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' },
  tabActive: { backgroundColor: '#0F172A' },
  tabText: { color: '#64748B', fontSize: 12, fontWeight: '900' },
  tabTextActive: { color: '#FFFFFF' },
  loading: { paddingVertical: 64, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 12, color: '#64748B', fontSize: 13, fontWeight: '700' },
  emptyPage: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 36 },
  emptyCard: { marginTop: 16, alignItems: 'center', borderRadius: 24, backgroundColor: '#FFFFFF', borderWidth: 1, borderStyle: 'dashed', borderColor: '#CBD5E1', padding: 32 },
  emptyTitle: { marginTop: 15, color: '#0F172A', fontSize: 18, fontWeight: '900', textAlign: 'center' },
  emptyBody: { marginTop: 8, color: '#64748B', fontSize: 13, lineHeight: 19, fontWeight: '600', textAlign: 'center' },
  primaryButton: { marginTop: 18, borderRadius: 13, backgroundColor: '#0F172A', paddingHorizontal: 18, paddingVertical: 12 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  productCard: { marginTop: 14, borderRadius: 22, backgroundColor: '#FFFFFF', padding: 16, borderWidth: 1, borderColor: '#E2E8F0', elevation: 2 },
  productHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  productIcon: { width: 50, height: 50, borderRadius: 16, backgroundColor: '#F0FDFA', alignItems: 'center', justifyContent: 'center' },
  productCopy: { flex: 1, minWidth: 0 },
  category: { color: '#0F766E', fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  productName: { marginTop: 3, color: '#0F172A', fontSize: 16, fontWeight: '900' },
  productMeta: { marginTop: 4, color: '#94A3B8', fontSize: 11, fontWeight: '700' },
  stockBadge: { borderRadius: 999, backgroundColor: '#ECFDF5', paddingHorizontal: 9, paddingVertical: 6 },
  stockBadgeWarning: { backgroundColor: '#FFF7ED' },
  stockBadgeText: { color: '#047857', fontSize: 10, fontWeight: '900' },
  stockBadgeTextWarning: { color: '#B45309' },
  warningBanner: { marginTop: 13, flexDirection: 'row', gap: 8, alignItems: 'center', borderRadius: 13, backgroundColor: '#FFFBEB', paddingHorizontal: 11, paddingVertical: 9 },
  warningText: { flex: 1, color: '#B45309', fontSize: 11, fontWeight: '800' },
  fieldsRow: { marginTop: 15, flexDirection: 'row', gap: 10 },
  fieldWrap: { flex: 1 },
  fieldLabel: { color: '#64748B', fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  input: { marginTop: 6, height: 44, borderRadius: 13, borderWidth: 1, borderColor: '#CBD5E1', paddingHorizontal: 12, color: '#0F172A', fontSize: 14, fontWeight: '800', backgroundColor: '#FFFFFF' },
  actionRow: { marginTop: 13, flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepButton: { width: 42, height: 42, borderRadius: 13, borderWidth: 1, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
  saveButton: { flex: 1, minHeight: 42, borderRadius: 13, backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  saveButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  disabledButton: { opacity: 0.55 },
  policyRow: { marginTop: 10, flexDirection: 'row', gap: 8 },
  policyButton: { flex: 1, minHeight: 39, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  policyPositive: { backgroundColor: '#ECFDF5' },
  policyNeutral: { backgroundColor: '#F1F5F9' },
  policyAuto: { backgroundColor: '#F0FDFA' },
  policyText: { fontSize: 11, fontWeight: '900' },
  policyPositiveText: { color: '#047857' },
  policyNeutralText: { color: '#475569' },
  policyAutoText: { color: '#0F766E', fontSize: 11, fontWeight: '900' },
  searchRow: { marginTop: 14, flexDirection: 'row', gap: 8 },
  searchInputWrap: { flex: 1, minHeight: 48, borderRadius: 15, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1', flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13 },
  searchInput: { flex: 1, color: '#0F172A', fontSize: 13, fontWeight: '700' },
  searchButton: { minWidth: 76, borderRadius: 15, backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  searchButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  addButton: { marginTop: 14, minHeight: 46, borderRadius: 14, backgroundColor: '#0F766E', flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  addButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
});
