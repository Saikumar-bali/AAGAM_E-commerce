import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  Box,
  Menu,
  Store,
} from 'lucide-react-native';
import { storeService } from '../../api/storeService';
import { notificationService } from '../../api/notificationService';
import { PARTNER_NOTIFICATION_QUERY_KEY } from '../PartnerNotificationsScreen';
import {
  StoreOrderTab,
  formatStoreMoney,
  orderCustomerName,
  orderCustomerPhone,
  orderPaymentMethod,
  orderStatusTab,
  shortStoreOrderId,
  summarizeStoreOrders,
} from '../../domain/storeReferenceUi';

const TABS: Array<{ key: StoreOrderTab; label: string }> = [
  { key: 'NEW', label: 'New' },
  { key: 'PREPARING', label: 'Preparing' },
  { key: 'READY', label: 'Ready' },
  { key: 'PICKUP', label: 'Pickup' },
  { key: 'DELIVERED', label: 'Delivered' },
];

function orderTone(status?: string | null) {
  if (status === 'PENDING' || status === 'PAYMENT_PENDING') return { label: 'New', color: '#0D7E41', backgroundColor: '#EAF9EE' };
  if (status === 'CONFIRMED' || status === 'PICKING') return { label: 'Preparing', color: '#0B7182', backgroundColor: '#E7F7FA' };
  if (status === 'PACKED') return { label: 'Ready', color: '#CB6F0C', backgroundColor: '#FFF2E5' };
  if (status === 'RIDER_ASSIGNED' || status === 'OUT_FOR_DELIVERY') return { label: 'Pickup', color: '#3266C7', backgroundColor: '#EAF1FF' };
  if (status === 'DELIVERED') return { label: 'Delivered', color: '#148A35', backgroundColor: '#E8F8E8' };
  return { label: String(status || 'Order').replaceAll('_', ' '), color: '#5E6670', backgroundColor: '#EEF1F4' };
}

function createdTime(value?: string | null) {
  if (!value) return 'Recently';
  return new Date(value).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

export const StoreOrdersScreen = ({ navigation, route }: { navigation?: any; route?: any }) => {
  const requestedStoreId = route?.params?.storeId as string | undefined;
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(requestedStoreId || null);
  const [activeTab, setActiveTab] = useState<StoreOrderTab>('NEW');

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

  const activeStoreId = selectedStoreId || stores[0]?.id || null;
  const ordersQuery = useQuery({
    queryKey: ['partner-store-orders', activeStoreId],
    queryFn: () => storeService.getStoreOrders(activeStoreId as string),
    enabled: Boolean(activeStoreId),
    refetchInterval: 15_000,
    retry: 1,
  });

  const orders = useMemo(() => {
    const value: any = ordersQuery.data;
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.orders)) return value.orders;
    return [];
  }, [ordersQuery.data]);
  const counts = useMemo(() => summarizeStoreOrders(orders), [orders]);
  const visibleOrders = useMemo(
    () => orders.filter((order: any) => orderStatusTab(order?.status) === activeTab),
    [activeTab, orders],
  );
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

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.header}>
        <TouchableOpacity accessibilityLabel="Open dashboard" style={styles.headerIcon} onPress={() => navigation?.getParent?.()?.navigate?.('Dashboard')}>
          <Menu size={30} color="#425B65" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Orders</Text>
        <TouchableOpacity accessibilityLabel="Open notifications" style={styles.headerIcon} onPress={openNotifications}>
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
            <TouchableOpacity key={tab.key} style={[styles.tab, selected && styles.tabActive]} onPress={() => setActiveTab(tab.key)}>
              <Text style={[styles.tabText, selected && styles.tabTextActive]}>{tab.label}</Text>
              <View style={[styles.tabCount, selected && styles.tabCountActive]}>
                <Text style={[styles.tabCountText, selected && styles.tabCountTextActive]}>{counts[tab.key]}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView
        style={styles.listScroll}
        contentContainerStyle={styles.content}
        refreshControl={(
          <RefreshControl
            refreshing={storesQuery.isFetching || ordersQuery.isFetching}
            onRefresh={() => void refresh()}
            tintColor="#078B61"
          />
        )}
      >
        {stores.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storeRail}>
            {stores.map((store: any) => {
              const selected = store.id === activeStoreId;
              return (
                <TouchableOpacity
                  key={store.id}
                  style={[styles.storeChip, selected && styles.storeChipActive]}
                  onPress={() => setSelectedStoreId(store.id)}
                >
                  <Store size={15} color={selected ? '#FFFFFF' : '#087B5A'} />
                  <Text style={[styles.storeChipText, selected && styles.storeChipTextActive]} numberOfLines={1}>{store.name || 'Store'}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : null}

        {storesQuery.isLoading || ordersQuery.isLoading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator size="large" color="#078B61" />
            <Text style={styles.stateText}>Loading orders…</Text>
          </View>
        ) : storesQuery.isError || ordersQuery.isError ? (
          <View style={styles.stateCard}>
            <Text style={styles.stateTitle}>Orders unavailable</Text>
            <Text style={styles.stateText}>Pull down to retry the selected store.</Text>
          </View>
        ) : stores.length === 0 ? (
          <View style={styles.stateCard}>
            <Store size={42} color="#A8B0B7" />
            <Text style={styles.stateTitle}>No assigned stores</Text>
            <Text style={styles.stateText}>Ask an administrator to assign this account to a store.</Text>
          </View>
        ) : visibleOrders.length === 0 ? (
          <View style={styles.stateCard}>
            <Box size={44} color="#A8B0B7" />
            <Text style={styles.stateTitle}>No {TABS.find((tab) => tab.key === activeTab)?.label.toLowerCase()} orders</Text>
            <Text style={styles.stateText}>Orders will appear here automatically when their status changes.</Text>
          </View>
        ) : (
          visibleOrders.map((order: any) => (
            <OrderCard
              key={order.id}
              order={order}
              onPress={() => navigation?.navigate?.('OrderDetails', { orderId: order.id, storeId: activeStoreId })}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
};

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
  tabs: { paddingHorizontal: 18, gap: 23, alignItems: 'stretch' },
  tab: { minWidth: 76, height: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderBottomWidth: 4, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#0C904A' },
  tabText: { color: '#5C626B', fontSize: 13, fontWeight: '700' },
  tabTextActive: { color: '#0A843E', fontWeight: '900' },
  tabCount: { minWidth: 28, height: 28, borderRadius: 14, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF1F3' },
  tabCountActive: { backgroundColor: '#1B934A' },
  tabCountText: { color: '#3F474F', fontSize: 12, fontWeight: '900' },
  tabCountTextActive: { color: '#FFFFFF' },
  listScroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 112 },
  storeRail: { gap: 8, paddingBottom: 6 },
  storeChip: { maxWidth: 190, height: 39, borderRadius: 13, borderWidth: 1, borderColor: '#CFE4DB', backgroundColor: '#FFFFFF', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 7 },
  storeChipActive: { backgroundColor: '#087B5A', borderColor: '#087B5A' },
  storeChipText: { color: '#087B5A', fontSize: 11, fontWeight: '800', flexShrink: 1 },
  storeChipTextActive: { color: '#FFFFFF' },
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
  stateCard: { minHeight: 330, alignItems: 'center', justifyContent: 'center', padding: 28 },
  stateTitle: { color: '#171A1D', fontSize: 18, fontWeight: '900', marginTop: 12, textAlign: 'center' },
  stateText: { color: '#6D747B', fontSize: 13, marginTop: 7, textAlign: 'center', lineHeight: 20 },
});
