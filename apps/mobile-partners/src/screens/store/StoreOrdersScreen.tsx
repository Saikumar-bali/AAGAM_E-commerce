import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  Box,
  ChevronLeft,
  ChevronRight,
  Menu,
  Search,
  Store,
} from 'lucide-react-native';
import { storeService } from '../../api/storeService';
import type { StoreOrderStatus } from '../../api/storeService';
import { notificationService } from '../../api/notificationService';
import { PARTNER_NOTIFICATION_QUERY_KEY } from '../PartnerNotificationsScreen';
import {
  StoreOrderTab,
  formatStoreMoney,
  orderCustomerName,
  orderCustomerPhone,
  orderPaymentMethod,
  shortStoreOrderId,
} from '../../domain/storeReferenceUi';

const PAGE_SIZE = 15;
const TABS: Array<{ key: StoreOrderTab; label: string; statuses: StoreOrderStatus[] }> = [
  { key: 'NEW', label: 'New', statuses: ['PENDING', 'PAYMENT_PENDING'] },
  { key: 'PREPARING', label: 'Preparing', statuses: ['CONFIRMED', 'PICKING'] },
  { key: 'READY', label: 'Ready', statuses: ['PACKED'] },
  { key: 'PICKUP', label: 'Pickup', statuses: ['RIDER_ASSIGNED', 'OUT_FOR_DELIVERY'] },
  { key: 'DELIVERED', label: 'Delivered', statuses: ['DELIVERED'] },
  { key: 'ISSUES', label: 'Issues', statuses: ['PAYMENT_FAILED', 'CANCELLED'] },
];

function orderTone(status?: string | null) {
  if (status === 'PENDING' || status === 'PAYMENT_PENDING') {
    return { label: 'New', color: '#0D7E41', backgroundColor: '#EAF9EE' };
  }
  if (status === 'PAYMENT_FAILED') {
    return { label: 'Payment failed', color: '#B45309', backgroundColor: '#FFF7E6' };
  }
  if (status === 'CANCELLED') {
    return { label: 'Cancelled', color: '#B91C1C', backgroundColor: '#FEE2E2' };
  }
  if (status === 'CONFIRMED' || status === 'PICKING') {
    return { label: 'Preparing', color: '#0B7182', backgroundColor: '#E7F7FA' };
  }
  if (status === 'PACKED') {
    return { label: 'Ready', color: '#CB6F0C', backgroundColor: '#FFF2E5' };
  }
  if (status === 'RIDER_ASSIGNED' || status === 'OUT_FOR_DELIVERY') {
    return { label: 'Pickup', color: '#3266C7', backgroundColor: '#EAF1FF' };
  }
  if (status === 'DELIVERED') {
    return { label: 'Delivered', color: '#148A35', backgroundColor: '#E8F8E8' };
  }
  return {
    label: String(status || 'Order').replaceAll('_', ' '),
    color: '#5E6670',
    backgroundColor: '#EEF1F4',
  };
}

function createdTime(value?: string | null) {
  if (!value) return 'Recently';
  return new Date(value).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function groupedCount(
  statusCounts: Partial<Record<StoreOrderStatus, number>> | undefined,
  statuses: StoreOrderStatus[],
) {
  return statuses.reduce(
    (total, status) => total + Number(statusCounts?.[status] || 0),
    0,
  );
}

export const StoreOrdersScreen = ({ navigation, route }: { navigation?: any; route?: any }) => {
  const requestedStoreId = route?.params?.storeId as string | undefined;
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(requestedStoreId || null);
  const [activeTab, setActiveTab] = useState<StoreOrderTab>('NEW');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);

  const storesQuery = useQuery({
    queryKey: ['partner-stores'],
    queryFn: storeService.getMyStores,
    retry: 1,
  });
  const inboxQuery = useQuery({
    queryKey: PARTNER_NOTIFICATION_QUERY_KEY,
    queryFn: () => notificationService.getInbox(1),
    refetchInterval: 15_000,
    retry: 1,
  });
  const stores = Array.isArray(storesQuery.data) ? storesQuery.data : [];

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (requestedStoreId && stores.some((store: any) => store.id === requestedStoreId)) {
      setSelectedStoreId(requestedStoreId);
      return;
    }
    setSelectedStoreId((current) => (
      current && stores.some((store: any) => store.id === current)
        ? current
        : stores[0]?.id || null
    ));
  }, [requestedStoreId, stores]);

  useEffect(() => {
    setPage(1);
  }, [selectedStoreId, activeTab, debouncedSearch]);

  const activeStoreId = selectedStoreId || stores[0]?.id || null;
  const activeStatuses = TABS.find((tab) => tab.key === activeTab)?.statuses || [];
  const ordersQuery = useQuery({
    queryKey: ['partner-store-orders', activeStoreId, activeTab, page, debouncedSearch],
    queryFn: () => storeService.getStoreOrders(activeStoreId as string, {
      page,
      pageSize: PAGE_SIZE,
      search: debouncedSearch,
      status: activeStatuses,
    }),
    enabled: Boolean(activeStoreId),
    refetchInterval: 15_000,
    retry: 1,
  });

  const orders = Array.isArray(ordersQuery.data?.items) ? ordersQuery.data.items : [];
  const total = Number(ordersQuery.data?.total || 0);
  const totalPages = Math.max(1, Number(ordersQuery.data?.totalPages || 1));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  const counts = useMemo(() => Object.fromEntries(
    TABS.map((tab) => [
      tab.key,
      groupedCount(ordersQuery.data?.statusCounts, tab.statuses),
    ]),
  ) as Record<StoreOrderTab, number>, [ordersQuery.data?.statusCounts]);
  const unreadCount = Number(inboxQuery.data?.unreadCount || 0);

  const refresh = async () => {
    await storesQuery.refetch();
    await Promise.all([ordersQuery.refetch(), inboxQuery.refetch()]);
  };

  const openNotifications = () => {
    const tabs = navigation?.getParent?.()?.getParent?.();
    const root = tabs?.getParent?.() || tabs || navigation;
    root?.navigate?.('Notifications');
  };

  const loading = storesQuery.isLoading || ordersQuery.isLoading;
  const hasError = storesQuery.isError || ordersQuery.isError;

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityLabel="Open dashboard"
          style={styles.headerIcon}
          onPress={() => navigation?.getParent?.()?.navigate?.('Dashboard')}
        >
          <Menu size={30} color="#425B65" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Orders</Text>
        <TouchableOpacity
          accessibilityLabel="Open notifications"
          style={styles.headerIcon}
          onPress={openNotifications}
        >
          <Bell size={29} color="#425B65" />
          {unreadCount > 0 ? (
            <View style={styles.notificationBadge}>
              <Text style={styles.notificationBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
        contentContainerStyle={styles.tabs}
      >
        {TABS.map((tab) => {
          const selected = tab.key === activeTab;
          return (
            <TouchableOpacity
              key={tab.key}
              testID={`store_orders_tab_${tab.key.toLowerCase()}`}
              style={[styles.tab, selected && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[styles.tabText, selected && styles.tabTextActive]}>{tab.label}</Text>
              <View style={[styles.tabCount, selected && styles.tabCountActive]}>
                <Text style={[styles.tabCountText, selected && styles.tabCountTextActive]}>{counts[tab.key]}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <FlatList
        data={orders}
        keyExtractor={(order: any) => String(order.id)}
        renderItem={({ item }) => (
          <OrderCard
            order={item}
            onPress={() => navigation?.navigate?.('OrderDetails', {
              orderId: item.id,
              storeId: activeStoreId,
              order: item,
            })}
          />
        )}
        contentContainerStyle={styles.content}
        refreshControl={(
          <RefreshControl
            refreshing={storesQuery.isFetching || ordersQuery.isFetching}
            onRefresh={() => void refresh()}
            tintColor="#078B61"
          />
        )}
        ListHeaderComponent={(
          <>
            {stores.length > 1 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.storeRail}
              >
                {stores.map((store: any) => {
                  const selected = store.id === activeStoreId;
                  return (
                    <TouchableOpacity
                      key={store.id}
                      style={[styles.storeChip, selected && styles.storeChipActive]}
                      onPress={() => setSelectedStoreId(store.id)}
                    >
                      <Store size={15} color={selected ? '#FFFFFF' : '#087B5A'} />
                      <Text
                        style={[styles.storeChipText, selected && styles.storeChipTextActive]}
                        numberOfLines={1}
                      >
                        {store.name || 'Store'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : null}

            <View style={styles.searchBox}>
              <Search size={19} color="#6B747B" />
              <TextInput
                testID="store_orders_search"
                value={search}
                onChangeText={setSearch}
                placeholder="Search order, customer, phone or email"
                placeholderTextColor="#9AA1A8"
                style={styles.searchInput}
                returnKeyType="search"
              />
            </View>

            {loading ? (
              <StateCard loading title="Loading orders…" text="Fetching the selected store queue." />
            ) : hasError ? (
              <StateCard title="Orders unavailable" text="Pull down to retry the selected store." />
            ) : stores.length === 0 ? (
              <StateCard title="No assigned stores" text="Ask an administrator to assign this account to a store." icon={<Store size={42} color="#A8B0B7" />} />
            ) : null}
          </>
        )}
        ListEmptyComponent={!loading && !hasError && stores.length > 0 ? (
          <StateCard
            title={`No ${TABS.find((tab) => tab.key === activeTab)?.label.toLowerCase()} orders`}
            text={activeTab === 'ISSUES'
              ? 'Cancelled and payment-failed orders will appear here.'
              : 'Try another status or search term.'}
            icon={<Box size={44} color="#A8B0B7" />}
          />
        ) : null}
        ListFooterComponent={(
          <>
            {totalPages > 1 || page > 1 ? (
              <View style={styles.pagination}>
                <TouchableOpacity
                  testID="store_orders_previous_page"
                  disabled={page <= 1 || ordersQuery.isFetching}
                  style={[styles.pageButton, page <= 1 && styles.disabled]}
                  onPress={() => setPage((current) => Math.max(1, current - 1))}
                >
                  <ChevronLeft size={17} color="#087B5A" />
                  <Text style={styles.pageButtonText}>Previous</Text>
                </TouchableOpacity>
                <Text style={styles.pageLabel}>Page {page} of {totalPages} · {total} orders</Text>
                <TouchableOpacity
                  testID="store_orders_next_page"
                  disabled={page >= totalPages || ordersQuery.isFetching}
                  style={[styles.pageButton, page >= totalPages && styles.disabled]}
                  onPress={() => setPage((current) => Math.min(totalPages, current + 1))}
                >
                  <Text style={styles.pageButtonText}>Next</Text>
                  <ChevronRight size={17} color="#087B5A" />
                </TouchableOpacity>
              </View>
            ) : null}
            <View style={{ height: 90 }} />
          </>
        )}
      />
    </View>
  );
};

function StateCard({
  title,
  text,
  loading = false,
  icon,
}: {
  title: string;
  text: string;
  loading?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <View style={styles.stateCard}>
      {loading ? <ActivityIndicator size="large" color="#078B61" /> : icon}
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateText}>{text}</Text>
    </View>
  );
}

function OrderCard({ order, onPress }: { order: any; onPress: () => void }) {
  const tone = orderTone(order.status);
  const phone = orderCustomerPhone(order);
  const total = order?.grandTotal ?? order?.totalAmount;
  const payment = orderPaymentMethod(order);
  const items = Array.isArray(order?.items) ? order.items : [];
  const totalUnits = items.reduce(
    (sum: number, item: any) => sum + Number(item.quantity || 0),
    0,
  );

  return (
    <TouchableOpacity
      testID={`store_order_card_${order.id}`}
      activeOpacity={0.76}
      style={styles.orderCard}
      onPress={onPress}
    >
      <View style={styles.orderTop}>
        <Text style={styles.orderId}>#ORD-{shortStoreOrderId(order.id)}</Text>
        <View style={[styles.statusPill, { backgroundColor: tone.backgroundColor }]}>
          <Text style={[styles.statusText, { color: tone.color }]}>{tone.label}</Text>
        </View>
        <Text style={styles.orderTime}>{createdTime(order.createdAt)}</Text>
      </View>
      <Text style={styles.customerName}>{orderCustomerName(order)}</Text>
      <Text style={styles.customerPhone}>{phone || 'Contact unavailable'}</Text>

      {items.length ? (
        <View style={styles.itemsPreview}>
          {items.slice(0, 3).map((item: any, index: number) => (
            <View key={item.id || index} style={styles.previewRow}>
              <Text style={styles.previewName} numberOfLines={1}>{item.product?.name || 'Product'}</Text>
              <Text style={styles.previewQuantity}>×{Number(item.quantity || 0)}</Text>
            </View>
          ))}
          {items.length > 3 ? <Text style={styles.moreItems}>+{items.length - 3} more</Text> : null}
        </View>
      ) : null}

      <View style={styles.orderMetaRow}>
        <Text style={styles.orderTotal}>{formatStoreMoney(total)}</Text>
        <Text style={styles.itemCount}>{totalUnits} Item{totalUnits === 1 ? '' : 's'}</Text>
      </View>
      <View style={styles.paymentRow}>
        <Text style={styles.paymentLabel}>Payment</Text>
        <View style={[styles.paymentPill, payment === 'COD' ? styles.codPill : styles.prepaidPill]}>
          <Text style={[styles.paymentText, payment === 'COD' ? styles.codText : styles.prepaidText]}>{payment}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FAFBFA' },
  header: { height: 115, paddingTop: 50, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF' },
  headerIcon: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', color: '#11131A', fontSize: 25, fontWeight: '900' },
  notificationBadge: { position: 'absolute', right: 1, top: 1, minWidth: 22, height: 22, borderRadius: 11, backgroundColor: '#F02525', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  notificationBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900' },
  tabsScroll: { maxHeight: 69, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E3E5E4' },
  tabs: { paddingHorizontal: 18, gap: 20, alignItems: 'stretch' },
  tab: { minWidth: 76, height: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderBottomWidth: 4, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#0C904A' },
  tabText: { color: '#5C626B', fontSize: 13, fontWeight: '700' },
  tabTextActive: { color: '#0A843E', fontWeight: '900' },
  tabCount: { minWidth: 28, height: 28, borderRadius: 14, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF1F3' },
  tabCountActive: { backgroundColor: '#1B934A' },
  tabCountText: { color: '#3F474F', fontSize: 12, fontWeight: '900' },
  tabCountTextActive: { color: '#FFFFFF' },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 20 },
  storeRail: { gap: 8, paddingBottom: 8 },
  storeChip: { maxWidth: 190, height: 39, borderRadius: 13, borderWidth: 1, borderColor: '#CFE4DB', backgroundColor: '#FFFFFF', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 7 },
  storeChipActive: { backgroundColor: '#087B5A', borderColor: '#087B5A' },
  storeChipText: { color: '#087B5A', fontSize: 11, fontWeight: '800', flexShrink: 1 },
  storeChipTextActive: { color: '#FFFFFF' },
  searchBox: { height: 48, borderRadius: 14, borderWidth: 1, borderColor: '#D9DEDC', backgroundColor: '#FFFFFF', paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 6, marginBottom: 2 },
  searchInput: { flex: 1, color: '#11131A', fontSize: 13, fontWeight: '700' },
  orderCard: { borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E4E3', padding: 17, marginTop: 13, shadowColor: '#1C2923', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  orderTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  orderId: { flex: 1, color: '#11131A', fontSize: 19, fontWeight: '900' },
  statusPill: { borderRadius: 8, paddingHorizontal: 11, paddingVertical: 7 },
  statusText: { fontSize: 11, fontWeight: '900' },
  orderTime: { color: '#5D6570', fontSize: 13 },
  customerName: { color: '#11131A', fontSize: 17, fontWeight: '900', marginTop: 13 },
  customerPhone: { color: '#5D6570', fontSize: 15, marginTop: 4 },
  itemsPreview: { borderRadius: 11, backgroundColor: '#F7F9F8', paddingHorizontal: 11, paddingVertical: 7, marginTop: 13 },
  previewRow: { minHeight: 27, flexDirection: 'row', alignItems: 'center' },
  previewName: { flex: 1, color: '#4B535C', fontSize: 11, fontWeight: '700' },
  previewQuantity: { color: '#161A1D', fontSize: 11, fontWeight: '900', marginLeft: 10 },
  moreItems: { color: '#078B4D', fontSize: 10, fontWeight: '900', marginTop: 3 },
  orderMetaRow: { marginTop: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orderTotal: { color: '#11131A', fontSize: 21, fontWeight: '900' },
  itemCount: { color: '#59616B', fontSize: 14 },
  paymentRow: { marginTop: 18, flexDirection: 'row', alignItems: 'center' },
  paymentLabel: { color: '#626A74', fontSize: 14, marginRight: 18 },
  paymentPill: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  prepaidPill: { backgroundColor: '#EAF9EE', borderWidth: 1, borderColor: '#C8EBCF' },
  codPill: { backgroundColor: '#FFF3E8', borderWidth: 1, borderColor: '#FFD7B4' },
  paymentText: { fontSize: 12, fontWeight: '900' },
  prepaidText: { color: '#087C35' },
  codText: { color: '#B85907' },
  stateCard: { minHeight: 250, alignItems: 'center', justifyContent: 'center', padding: 28 },
  stateTitle: { color: '#171A1D', fontSize: 18, fontWeight: '900', marginTop: 12, textAlign: 'center' },
  stateText: { color: '#6D747B', fontSize: 13, marginTop: 7, textAlign: 'center', lineHeight: 20 },
  pagination: { marginTop: 18, borderRadius: 16, borderWidth: 1, borderColor: '#E2E4E3', backgroundColor: '#FFFFFF', padding: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pageButton: { minHeight: 39, borderRadius: 11, backgroundColor: '#EAF9F1', paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 3 },
  pageButtonText: { color: '#087B5A', fontSize: 10, fontWeight: '900' },
  pageLabel: { color: '#5D6570', fontSize: 9, fontWeight: '800', textAlign: 'center' },
  disabled: { opacity: 0.38 },
});
