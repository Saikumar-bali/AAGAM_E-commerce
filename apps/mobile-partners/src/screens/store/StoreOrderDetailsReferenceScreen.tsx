import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { ArrowLeft, ChevronRight, ImageOff, Phone, UserRound } from 'lucide-react-native';
import { storeService, StoreOrderStatus } from '../../api/storeService';
import {
  formatStoreMoney,
  orderCustomerName,
  orderCustomerPhone,
  orderPaymentMethod,
  shortStoreOrderId,
} from '../../domain/storeReferenceUi';

const STATUS_ACTIONS: Record<string, Array<{ status: StoreOrderStatus; label: string; destructive?: boolean }>> = {
  PENDING: [
    { status: 'CANCELLED', label: 'Reject', destructive: true },
    { status: 'CONFIRMED', label: 'Accept Order' },
  ],
  PAYMENT_PENDING: [
    { status: 'CANCELLED', label: 'Reject', destructive: true },
    { status: 'CONFIRMED', label: 'Accept Order' },
  ],
  CONFIRMED: [
    { status: 'CANCELLED', label: 'Cancel', destructive: true },
    { status: 'PICKING', label: 'Start Preparing' },
  ],
  PICKING: [
    { status: 'CANCELLED', label: 'Cancel', destructive: true },
    { status: 'PACKED', label: 'Ready for Pickup' },
  ],
};

function statusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    PENDING: 'New',
    PAYMENT_PENDING: 'New',
    CONFIRMED: 'Accepted',
    PICKING: 'Preparing',
    PACKED: 'Ready',
    RIDER_ASSIGNED: 'Rider Assigned',
    OUT_FOR_DELIVERY: 'Out for Delivery',
    DELIVERED: 'Delivered',
    CANCELLED: 'Cancelled',
  };
  return labels[String(status || '')] || String(status || 'Order').replaceAll('_', ' ');
}

function statusTone(status?: string | null) {
  if (status === 'CANCELLED') return { color: '#D51D25', backgroundColor: '#FFE8E9' };
  if (status === 'DELIVERED') return { color: '#148A35', backgroundColor: '#E8F8E8' };
  if (status === 'PICKING') return { color: '#0B7182', backgroundColor: '#E7F7FA' };
  if (status === 'PACKED') return { color: '#CB6F0C', backgroundColor: '#FFF2E5' };
  return { color: '#0D7E41', backgroundColor: '#EAF9EE' };
}

function errorMessage(error: any) {
  const message = error?.response?.data?.message;
  return Array.isArray(message) ? message.join(', ') : message || error?.message || 'The order could not be updated.';
}

function amount(value: unknown, paise?: unknown) {
  const paiseNumber = Number(paise);
  if (Number.isFinite(paiseNumber)) return paiseNumber / 100;
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function imageUri(product: any) {
  if (typeof product?.image === 'string' && product.image.trim()) return product.image.trim();
  if (Array.isArray(product?.images)) return product.images.find((entry: any) => typeof entry === 'string' && entry.trim()) || null;
  return null;
}

export const StoreOrderDetailsReferenceScreen = ({ navigation, route }: { navigation?: any; route?: any }) => {
  const storeId = String(route?.params?.storeId || '');
  const orderId = String(route?.params?.orderId || '');
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['partner-store-orders', storeId],
    queryFn: () => storeService.getStoreOrders(storeId),
    enabled: Boolean(storeId && orderId),
    refetchInterval: 15_000,
    retry: 1,
  });
  const orders = useMemo(() => {
    const value: any = query.data;
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.orders)) return value.orders;
    return [];
  }, [query.data]);
  const order = orders.find((entry: any) => String(entry.id) === orderId) || null;

  const mutation = useMutation({
    mutationFn: (status: StoreOrderStatus) => status === 'PACKED'
      ? storeService.markOrderReady(orderId)
      : storeService.updateOrderStatus(orderId, status),
    onSuccess: async (_response, status) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['partner-store-orders', storeId] }),
        queryClient.invalidateQueries({ queryKey: ['store-owner-dashboard-stores'] }),
      ]);
      Toast.show({ type: 'success', text1: statusLabel(status), text2: 'The store order queue was updated.' });
    },
    onError: (error: any) => Toast.show({ type: 'error', text1: 'Order update failed', text2: errorMessage(error) }),
  });

  const updateStatus = (action: { status: StoreOrderStatus; label: string; destructive?: boolean }) => Alert.alert(
    `${action.label}?`,
    action.status === 'CANCELLED'
      ? 'This changes the customer order and is recorded in the audit trail.'
      : action.status === 'PACKED'
        ? 'Confirm that the order is packed for rider pickup.'
        : 'The customer and store queue will be updated.',
    [
      { text: 'Back', style: 'cancel' },
      { text: action.label, style: action.destructive ? 'destructive' : 'default', onPress: () => mutation.mutate(action.status) },
    ],
  );

  const callCustomer = async () => {
    const phone = orderCustomerPhone(order);
    if (!phone) return Alert.alert('Customer phone unavailable');
    try { await Linking.openURL(`tel:${phone}`); } catch { Alert.alert('Could not open phone app', phone); }
  };

  const tone = statusTone(order?.status);
  const payment = orderPaymentMethod(order);
  const subtotal = amount(order?.subtotal, order?.subtotalPaise);
  const deliveryFee = amount(order?.deliveryFee, order?.deliveryFeePaise);
  const discount = amount(order?.discount, order?.discountPaise);
  const total = amount(order?.grandTotal ?? order?.totalAmount, order?.grandTotalPaise ?? order?.totalAmountPaise);
  const actions = order ? STATUS_ACTIONS[order.status] || [] : [];

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerIcon} onPress={() => navigation?.goBack?.()}><ArrowLeft size={31} color="#151922" /></TouchableOpacity>
        <Text style={styles.headerTitle}>Order Details</Text>
        <View style={styles.headerIcon} />
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor="#078B4D" />}
      >
        {query.isLoading ? (
          <State loading text="Loading order details…" />
        ) : query.isError ? (
          <State title="Order unavailable" text={errorMessage(query.error)} />
        ) : !order ? (
          <State title="Order no longer available" text="It may have moved stores or changed while this screen was open." />
        ) : (
          <>
            <View style={styles.orderHeading}>
              <View style={styles.flex}>
                <Text style={styles.orderCode}>#ORD-{shortStoreOrderId(order.id)}</Text>
                <Text style={styles.orderDate}>{order.createdAt ? new Date(order.createdAt).toLocaleString('en-IN') : 'Time unavailable'}</Text>
              </View>
              <View style={[styles.statusPill, { backgroundColor: tone.backgroundColor }]}><Text style={[styles.statusText, { color: tone.color }]}>{statusLabel(order.status)}</Text></View>
            </View>

            <View style={styles.customerCard}>
              <View style={styles.avatar}><UserRound size={40} color="#078B4D" fill="#078B4D" /></View>
              <View style={styles.customerCopy}>
                <Text style={styles.customerName}>{orderCustomerName(order)}</Text>
                <Text style={styles.customerPhone}>{orderCustomerPhone(order) || 'Contact unavailable'}</Text>
              </View>
              <TouchableOpacity style={styles.callButton} onPress={() => void callCustomer()}><Phone size={29} color="#078B4D" /></TouchableOpacity>
            </View>

            <View style={styles.itemsCard}>
              <Text style={styles.itemsTitle}>Items ({order.items?.length || 0})</Text>
              {(order.items || []).map((item: any, index: number) => {
                const uri = imageUri(item.product);
                const price = amount(item.price, item.unitPricePaise);
                return (
                  <View key={item.id || index} style={[styles.itemRow, index < order.items.length - 1 && styles.itemBorder]}>
                    {uri ? <Image source={{ uri }} style={styles.productImage} /> : <View style={styles.imageFallback}><ImageOff size={20} color="#9DA6AE" /></View>}
                    <Text style={styles.itemName} numberOfLines={2}>{item.product?.name || 'Product'}</Text>
                    <Text style={styles.itemPrice}>{Number(item.quantity || 0)} × {formatStoreMoney(price)}</Text>
                  </View>
                );
              })}
              {!order.items?.length ? <Text style={styles.emptyItems}>No item lines were returned for this order.</Text> : null}
              <View style={styles.divider} />
              <PriceRow label="Subtotal" value={formatStoreMoney(subtotal)} />
              <PriceRow label="Delivery Fee" value={deliveryFee === 0 ? 'FREE' : formatStoreMoney(deliveryFee)} green={deliveryFee === 0} />
              <PriceRow label="Discount" value={`- ${formatStoreMoney(discount)}`} />
              <View style={styles.divider} />
              <PriceRow label="Total Amount" value={formatStoreMoney(total)} strong />
            </View>

            <View style={styles.statusRows}>
              <StatusRow label="Payment Method" value={payment} payment />
              <StatusRow label="Preparation Status" value={statusLabel(order.status)} tone={tone} />
            </View>

            {['PENDING', 'PAYMENT_PENDING', 'CONFIRMED', 'PICKING'].includes(order.status) ? (
              <TouchableOpacity style={styles.advancedButton} onPress={() => navigation?.navigate?.('AdvancedOrderDetails', { orderId, storeId })}>
                <Text style={styles.advancedText}>Item availability & substitutes</Text>
                <ChevronRight size={20} color="#078B4D" />
              </TouchableOpacity>
            ) : null}

            {actions.length ? (
              <View style={styles.actionRow}>
                {actions.map((action) => (
                  <TouchableOpacity
                    key={action.status}
                    style={[styles.actionButton, action.destructive ? styles.rejectButton : styles.acceptButton, mutation.isPending && styles.disabled]}
                    disabled={mutation.isPending}
                    onPress={() => updateStatus(action)}
                  >
                    {mutation.isPending ? <ActivityIndicator color={action.destructive ? '#D51D25' : '#FFFFFF'} /> : <Text style={[styles.actionText, action.destructive ? styles.rejectText : styles.acceptText]}>{action.label}</Text>}
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
};

function State({ title, text, loading = false }: { title?: string; text: string; loading?: boolean }) {
  return <View style={styles.state}>{loading ? <ActivityIndicator size="large" color="#078B4D" /> : null}{title ? <Text style={styles.stateTitle}>{title}</Text> : null}<Text style={styles.stateText}>{text}</Text></View>;
}

function PriceRow({ label, value, strong = false, green = false }: { label: string; value: string; strong?: boolean; green?: boolean }) {
  return <View style={styles.priceRow}><Text style={[styles.priceLabel, strong && styles.priceStrong]}>{label}</Text><Text style={[styles.priceValue, strong && styles.priceStrong, green && styles.green]}>{value}</Text></View>;
}

function StatusRow({ label, value, payment = false, tone }: { label: string; value: string; payment?: boolean; tone?: { color: string; backgroundColor: string } }) {
  const cod = value === 'COD';
  const visual = payment ? { color: cod ? '#BE5B09' : '#087C35', backgroundColor: cod ? '#FFF1E5' : '#EAF9EE' } : tone!;
  return <View style={styles.statusRow}><Text style={styles.statusRowLabel}>{label}</Text><View style={[styles.statusPill, { backgroundColor: visual.backgroundColor }]}><Text style={[styles.statusText, { color: visual.color }]}>{value}</Text></View></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FAFBFA' },
  flex: { flex: 1 },
  header: { height: 112, paddingTop: 48, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF' },
  headerIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', color: '#151922', fontSize: 24, fontWeight: '900' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 19, paddingBottom: 44 },
  orderHeading: { flexDirection: 'row', alignItems: 'center', marginTop: 3, marginBottom: 18 },
  orderCode: { color: '#151922', fontSize: 25, fontWeight: '900' },
  orderDate: { color: '#616A74', fontSize: 15, marginTop: 8 },
  statusPill: { borderRadius: 10, paddingHorizontal: 15, paddingVertical: 9 },
  statusText: { fontSize: 13, fontWeight: '900' },
  customerCard: { minHeight: 116, borderRadius: 16, borderWidth: 1, borderColor: '#E0E3E2', backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15 },
  avatar: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#EAF9EE', alignItems: 'center', justifyContent: 'center' },
  customerCopy: { flex: 1, marginLeft: 14 },
  customerName: { color: '#151922', fontSize: 19, fontWeight: '900' },
  customerPhone: { color: '#626B74', fontSize: 15, marginTop: 7 },
  callButton: { width: 62, height: 62, borderRadius: 31, borderWidth: 1, borderColor: '#D9DDDB', alignItems: 'center', justifyContent: 'center' },
  itemsCard: { borderRadius: 16, borderWidth: 1, borderColor: '#E0E3E2', backgroundColor: '#FFFFFF', padding: 16, marginTop: 14 },
  itemsTitle: { color: '#151922', fontSize: 18, fontWeight: '900', marginBottom: 8 },
  itemRow: { minHeight: 78, flexDirection: 'row', alignItems: 'center' },
  itemBorder: { borderBottomWidth: 1, borderBottomColor: '#E9EBEA' },
  productImage: { width: 42, height: 52, borderRadius: 7, backgroundColor: '#F0F2F1' },
  imageFallback: { width: 42, height: 52, borderRadius: 7, backgroundColor: '#F0F2F1', alignItems: 'center', justifyContent: 'center' },
  itemName: { flex: 1, color: '#151922', fontSize: 15, fontWeight: '800', marginHorizontal: 12 },
  itemPrice: { color: '#151922', fontSize: 15, fontWeight: '800' },
  emptyItems: { color: '#747C83', paddingVertical: 20, textAlign: 'center' },
  divider: { height: 1, backgroundColor: '#E7E9E8', marginVertical: 10 },
  priceRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center' },
  priceLabel: { flex: 1, color: '#616A74', fontSize: 15 },
  priceValue: { color: '#4C555F', fontSize: 15 },
  priceStrong: { color: '#151922', fontSize: 17, fontWeight: '900' },
  green: { color: '#138C37', fontWeight: '900' },
  statusRows: { paddingHorizontal: 12, marginTop: 17 },
  statusRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center' },
  statusRowLabel: { flex: 1, color: '#616A74', fontSize: 15 },
  advancedButton: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  advancedText: { color: '#078B4D', fontSize: 14, fontWeight: '900' },
  actionRow: { flexDirection: 'row', gap: 14, marginTop: 18 },
  actionButton: { flex: 1, height: 62, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  rejectButton: { backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#E3262E' },
  acceptButton: { backgroundColor: '#078B4D' },
  actionText: { fontSize: 18, fontWeight: '900' },
  rejectText: { color: '#D51D25' },
  acceptText: { color: '#FFFFFF' },
  disabled: { opacity: 0.5 },
  state: { minHeight: 500, alignItems: 'center', justifyContent: 'center', padding: 28 },
  stateTitle: { color: '#171A1D', fontSize: 19, fontWeight: '900', textAlign: 'center', marginTop: 12 },
  stateText: { color: '#6D747B', fontSize: 13, marginTop: 7, textAlign: 'center', lineHeight: 20 },
});
