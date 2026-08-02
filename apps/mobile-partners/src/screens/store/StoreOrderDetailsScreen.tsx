import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Clock3,
  ImageOff,
  MapPin,
  Package,
  PackageCheck,
  Phone,
  RefreshCw,
  ShoppingBag,
  User,
  XCircle,
} from 'lucide-react-native';
import { deliveryOperationsService, STORE_DELIVERY_OPERATIONS_QUERY_KEY } from '../../api/deliveryOperationsService';
import { storeService, StoreOrderStatus } from '../../api/storeService';

const EDITABLE_ITEM_STATUSES = new Set(['PENDING', 'PAYMENT_PENDING', 'CONFIRMED', 'PICKING']);

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'New order',
  PAYMENT_PENDING: 'Payment pending',
  CONFIRMED: 'Accepted',
  PICKING: 'Preparing',
  PACKED: 'Ready for pickup',
  RIDER_ASSIGNED: 'Rider assigned',
  RIDER_AT_STORE: 'Rider waiting for pickup',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

const STATUS_ACTIONS: Record<string, Array<{ status: StoreOrderStatus; label: string; destructive?: boolean }>> = {
  PENDING: [
    { status: 'CONFIRMED', label: 'Accept order' },
    { status: 'CANCELLED', label: 'Reject order', destructive: true },
  ],
  PAYMENT_PENDING: [
    { status: 'CONFIRMED', label: 'Accept order' },
    { status: 'CANCELLED', label: 'Reject order', destructive: true },
  ],
  CONFIRMED: [
    { status: 'PICKING', label: 'Start preparing' },
    { status: 'PACKED', label: 'Ready for pickup' },
    { status: 'CANCELLED', label: 'Cancel', destructive: true },
  ],
  PICKING: [
    { status: 'PACKED', label: 'Ready for pickup' },
    { status: 'CANCELLED', label: 'Cancel', destructive: true },
  ],
};

function shortId(value?: string | null) {
  return value ? value.slice(-8).toUpperCase() : 'UNKNOWN';
}

function money(value: unknown, paise?: unknown) {
  const paiseNumber = Number(paise);
  if (Number.isFinite(paiseNumber) && paiseNumber > 0) return paiseNumber / 100;
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function imageUri(product: any) {
  if (typeof product?.image === 'string' && product.image.trim()) return product.image.trim();
  const images = product?.images;
  if (Array.isArray(images)) {
    const first = images.find((entry) => typeof entry === 'string' && entry.trim());
    if (first) return first;
  }
  return null;
}

function errorMessage(error: any) {
  const message = error?.response?.data?.message;
  if (Array.isArray(message)) return message.join(', ');
  return message || error?.message || 'The order could not be updated.';
}

export const StoreOrderDetailsScreen = ({ navigation, route }: { navigation?: any; route?: any }) => {
  const storeId = String(route?.params?.storeId || '');
  const orderId = String(route?.params?.orderId || '');
  const queryClient = useQueryClient();
  const [substitutes, setSubstitutes] = useState<Record<string, any[]>>({});
  const [loadingSubstitutes, setLoadingSubstitutes] = useState<string | null>(null);

  const ordersQuery = useQuery({
    queryKey: ['partner-store-orders', storeId],
    queryFn: () => storeService.getStoreOrders(storeId),
    enabled: Boolean(storeId && orderId),
    refetchInterval: 15_000,
    retry: 1,
  });

  const pickupQueueQuery = useQuery({
    queryKey: STORE_DELIVERY_OPERATIONS_QUERY_KEY,
    queryFn: deliveryOperationsService.getQueue,
    refetchInterval: 15_000,
    retry: 1,
  });

  const orders = useMemo(() => {
    const value: any = ordersQuery.data;
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.orders)) return value.orders;
    return [];
  }, [ordersQuery.data]);
  const order = orders.find((entry: any) => entry.id === orderId) || null;
  const pickupJob = useMemo(
    () => (Array.isArray(pickupQueueQuery.data) ? pickupQueueQuery.data : [])
      .find((job: any) => job.orderId === orderId && job.status === 'RIDER_AT_STORE'),
    [orderId, pickupQueueQuery.data],
  );
  const awaitingPickup = order?.status === 'RIDER_AT_STORE' || Boolean(pickupJob);

  const refreshOrder = async () => {
    await queryClient.invalidateQueries({ queryKey: ['partner-store-orders', storeId] });
    await queryClient.invalidateQueries({ queryKey: ['store-owner-dashboard-stores'] });
    await queryClient.invalidateQueries({ queryKey: STORE_DELIVERY_OPERATIONS_QUERY_KEY });
  };

  const statusMutation = useMutation({
    mutationFn: async (status: StoreOrderStatus) => {
      if (status === 'PACKED') return storeService.markOrderReady(orderId);
      return storeService.updateOrderStatus(orderId, status);
    },
    onSuccess: async (_data, status) => {
      await refreshOrder();
      Toast.show({
        type: 'success',
        text1: STATUS_LABELS[status] || 'Order updated',
        text2: status === 'PACKED' ? 'The order is ready for rider pickup.' : 'The fulfillment queue has been refreshed.',
      });
    },
    onError: (error: any) => Toast.show({ type: 'error', text1: 'Order update failed', text2: errorMessage(error) }),
  });

  const unavailableMutation = useMutation({
    mutationFn: ({ itemId }: { itemId: string }) => storeService.markOrderItemUnavailable(orderId, itemId),
    onSuccess: async () => {
      await refreshOrder();
      Toast.show({ type: 'success', text1: 'Item marked unavailable', text2: 'Review substitutes or the updated order before continuing.' });
    },
    onError: (error: any) => Toast.show({ type: 'error', text1: 'Could not update item', text2: errorMessage(error) }),
  });

  const loadSubstitutes = async (itemId: string) => {
    setLoadingSubstitutes(itemId);
    try {
      const response = await storeService.getOrderItemSubstitutes(orderId, itemId);
      setSubstitutes((current) => ({ ...current, [itemId]: Array.isArray(response) ? response : [] }));
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Could not load substitutes', text2: errorMessage(error) });
    } finally {
      setLoadingSubstitutes(null);
    }
  };

  const applySubstitute = async (itemId: string, productId: string) => {
    setLoadingSubstitutes(itemId);
    try {
      await storeService.applyOrderItemSubstitute(orderId, itemId, productId);
      setSubstitutes((current) => ({ ...current, [itemId]: [] }));
      await refreshOrder();
      Toast.show({ type: 'success', text1: 'Substitute applied', text2: 'The picking list now reflects the replacement product.' });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Could not apply substitute', text2: errorMessage(error) });
    } finally {
      setLoadingSubstitutes(null);
    }
  };

  const confirmStatus = (status: StoreOrderStatus, label: string, destructive?: boolean) => {
    Alert.alert(
      `${label}?`,
      status === 'PACKED'
        ? 'Confirm that every available item has been picked and the parcel is packed for rider handoff.'
        : status === 'CANCELLED'
          ? 'This action affects the customer order and is recorded in the audit trail.'
          : 'The customer and operations timeline will be updated.',
      [
        { text: 'Back', style: 'cancel' },
        {
          text: label,
          style: destructive ? 'destructive' : 'default',
          onPress: () => statusMutation.mutate(status),
        },
      ],
    );
  };

  if (!storeId || !orderId) {
    return (
      <View style={styles.centerState}>
        <XCircle size={42} color="#B91C1C" />
        <Text style={styles.centerTitle}>Order context unavailable</Text>
        <TouchableOpacity style={styles.darkButton} onPress={() => navigation?.goBack?.()}><Text style={styles.darkButtonText}>Back to orders</Text></TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity testID="store_order_details_back" style={styles.backButton} onPress={() => navigation?.goBack?.()}>
          <ArrowLeft size={21} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>STORE FULFILLMENT</Text>
          <Text style={styles.headerTitle}>Order #{shortId(orderId)}</Text>
        </View>
        <TouchableOpacity style={styles.headerRefresh} onPress={() => void ordersQuery.refetch()}>
          <RefreshCw size={19} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={ordersQuery.isRefetching} onRefresh={() => void ordersQuery.refetch()} />}
      >
        {ordersQuery.isLoading ? (
          <View style={styles.centerState}><ActivityIndicator size="large" color="#0F766E" /><Text style={styles.centerText}>Loading order details…</Text></View>
        ) : ordersQuery.isError ? (
          <View style={styles.errorCard}>
            <XCircle size={38} color="#B91C1C" />
            <Text style={styles.centerTitle}>Could not load this order</Text>
            <Text style={styles.errorText}>{errorMessage(ordersQuery.error)}</Text>
            <TouchableOpacity style={styles.darkButton} onPress={() => void ordersQuery.refetch()}><Text style={styles.darkButtonText}>Retry</Text></TouchableOpacity>
          </View>
        ) : !order ? (
          <View style={styles.errorCard}>
            <ShoppingBag size={42} color="#94A3B8" />
            <Text style={styles.centerTitle}>Order no longer available</Text>
            <Text style={styles.errorText}>It may have moved stores, been removed from your scope, or changed while this screen was open.</Text>
            <TouchableOpacity style={styles.darkButton} onPress={() => navigation?.goBack?.()}><Text style={styles.darkButtonText}>Back to queue</Text></TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.orderOverview}>
              <View style={styles.overviewTop}>
                <View>
                  <Text style={styles.customerName}>{order.customer?.name || order.addressSnapshot?.recipientName || 'Customer'}</Text>
                  <Text style={styles.orderTime}>{order.createdAt ? new Date(order.createdAt).toLocaleString('en-IN') : 'Recently created'}</Text>
                </View>
                <View style={styles.statusChip}><Text style={styles.statusText}>{STATUS_LABELS[order.status] || String(order.status).replaceAll('_', ' ')}</Text></View>
              </View>
              <View style={styles.overviewMeta}>
                <View style={styles.metaItem}><Package size={17} color="#0F766E" /><Text style={styles.metaText}>{order.items?.length || 0} product line(s)</Text></View>
                <View style={styles.metaItem}><CircleDollarSign size={17} color="#0F766E" /><Text style={styles.metaText}>{order.payment?.method || 'Payment'} · {order.payment?.status || 'Recorded'}</Text></View>
              </View>
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}><ClipboardCheck size={20} color="#0F766E" /><Text style={styles.sectionTitle}>Picking list</Text></View>
              {(order.items || []).length === 0 ? (
                <View style={styles.noItems}><Package size={36} color="#94A3B8" /><Text style={styles.noItemsText}>No product lines were returned for this order.</Text></View>
              ) : (order.items || []).map((item: any) => {
                const uri = imageUri(item.product);
                const unitPrice = money(item.price, item.unitPricePaise);
                const lineTotal = money(unitPrice * Number(item.quantity || 0), item.lineTotalPaise);
                const itemSubstitutes = substitutes[item.id] || [];
                const editable = EDITABLE_ITEM_STATUSES.has(order.status);
                return (
                  <View testID={`store_order_item_${item.id}`} key={item.id} style={styles.itemCard}>
                    <View style={styles.itemMain}>
                      {uri ? <Image source={{ uri }} style={styles.productImage} /> : <View style={styles.imageFallback}><ImageOff size={22} color="#94A3B8" /></View>}
                      <View style={styles.itemCopy}>
                        <Text style={styles.itemName}>{item.product?.name || 'Product'}</Text>
                        <Text style={styles.itemPrice}>₹{unitPrice.toFixed(2)} each · line ₹{lineTotal.toFixed(2)}</Text>
                      </View>
                      <View style={styles.quantityBadge}><Text style={styles.quantityText}>×{Number(item.quantity || 0)}</Text></View>
                    </View>

                    {editable ? (
                      <View style={styles.itemActions}>
                        <TouchableOpacity
                          style={styles.unavailableButton}
                          disabled={unavailableMutation.isPending}
                          onPress={() => Alert.alert('Mark item unavailable?', item.product?.name || 'This product', [
                            { text: 'Back', style: 'cancel' },
                            { text: 'Mark unavailable', style: 'destructive', onPress: () => unavailableMutation.mutate({ itemId: item.id }) },
                          ])}
                        >
                          <Text style={styles.unavailableText}>Unavailable</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.substituteButton} onPress={() => void loadSubstitutes(item.id)}>
                          {loadingSubstitutes === item.id ? <ActivityIndicator size="small" color="#334155" /> : <Text style={styles.substituteText}>Substitutes</Text>}
                        </TouchableOpacity>
                      </View>
                    ) : null}

                    {itemSubstitutes.length ? (
                      <View style={styles.substituteList}>
                        <Text style={styles.substituteLabel}>Available replacements</Text>
                        {itemSubstitutes.map((product: any) => (
                          <TouchableOpacity key={product.id} style={styles.substituteOption} onPress={() => void applySubstitute(item.id, product.id)}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.substituteName}>{product.name}</Text>
                              <Text style={styles.substituteStock}>Stock {product.availability?.availableQty ?? product.quantity ?? '—'} · ₹{money(product.price, product.pricePaise).toFixed(2)}</Text>
                            </View>
                            <ChevronRight size={17} color="#0F766E" />
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}><User size={20} color="#0F766E" /><Text style={styles.sectionTitle}>Customer & delivery</Text></View>
              <View style={styles.infoRow}><Phone size={17} color="#64748B" /><Text style={styles.infoText}>{order.customer?.phone || order.addressSnapshot?.phoneE164 || order.customer?.email || 'Contact unavailable'}</Text></View>
              <View style={styles.infoRow}><MapPin size={17} color="#64748B" /><Text style={styles.infoText}>{[order.addressSnapshot?.line1, order.addressSnapshot?.line2, order.addressSnapshot?.landmark, order.addressSnapshot?.city, order.addressSnapshot?.pincode].filter(Boolean).join(', ') || 'Delivery address unavailable'}</Text></View>
              {order.customerSnapshot?.note || order.addressSnapshot?.deliveryNote ? <Text style={styles.noteText}>Note: {order.customerSnapshot?.note || order.addressSnapshot?.deliveryNote}</Text> : null}
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}><Clock3 size={20} color="#0F766E" /><Text style={styles.sectionTitle}>Order total</Text></View>
              <PriceRow label="Subtotal" value={money(order.subtotal, order.subtotalPaise)} />
              <PriceRow label="Delivery fee" value={money(order.deliveryFee, order.deliveryFeePaise)} />
              <PriceRow label="Discount" value={-money(order.discountAmount, order.discountPaise)} />
              <PriceRow label="Tax" value={money(order.taxAmount, order.taxPaise)} />
              <View style={styles.totalDivider} />
              <PriceRow label="Grand total" value={money(order.grandTotal ?? order.totalAmount, order.grandTotalPaise)} strong />
            </View>

            {awaitingPickup ? (
              <View testID="store_order_pickup_verification_card" style={styles.pickupVerifyBanner}>
                <PackageCheck size={22} color="#0F766E" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickupVerifyTitle}>Rider is waiting at the store</Text>
                  <Text style={styles.pickupVerifyText}>Verify the parcel handoff before the rider leaves for the customer.</Text>
                </View>
                <TouchableOpacity
                  testID="store_order_verify_pickup"
                  style={styles.pickupVerifyButton}
                  onPress={() => {
                    const storeNavigator = navigation?.getParent?.()?.getParent?.();
                    if (storeNavigator?.navigate) storeNavigator.navigate('StorePickupVerification');
                    else navigation?.navigate?.('StorePickupVerification');
                  }}
                >
                  <Text style={styles.pickupVerifyButtonText}>Verify Pickup</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {order.status === 'PACKED' ? (
              <View style={styles.readyBanner}><CheckCircle2 size={21} color="#15803D" /><View style={{ flex: 1 }}><Text style={styles.readyTitle}>Ready for rider pickup</Text><Text style={styles.readyText}>Normal store preparation is complete. Returns and COD exceptions remain in the separate Operations tab.</Text></View></View>
            ) : null}

            {(STATUS_ACTIONS[order.status] || []).length ? (
              <View style={styles.actionCard}>
                {(STATUS_ACTIONS[order.status] || []).map((action) => (
                  <TouchableOpacity
                    testID={`store_order_action_${action.status}`}
                    key={action.status}
                    disabled={statusMutation.isPending}
                    style={[styles.fulfillmentButton, action.destructive && styles.destructiveButton, statusMutation.isPending && styles.disabled]}
                    onPress={() => confirmStatus(action.status, action.label, action.destructive)}
                  >
                    {statusMutation.isPending ? <ActivityIndicator color={action.destructive ? '#B91C1C' : '#FFFFFF'} /> : action.destructive ? <XCircle size={18} color="#B91C1C" /> : <CheckCircle2 size={18} color="#FFFFFF" />}
                    <Text style={[styles.fulfillmentText, action.destructive && styles.destructiveText]}>{action.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </>
        )}
        <View style={{ height: 110 }} />
      </ScrollView>
    </View>
  );
};

function PriceRow({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <View style={styles.priceRow}>
      <Text style={[styles.priceLabel, strong && styles.priceStrong]}>{label}</Text>
      <Text style={[styles.priceValue, strong && styles.priceStrong]}>{value < 0 ? '- ' : ''}₹{Math.abs(value).toFixed(2)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { backgroundColor: '#0F172A', paddingTop: 52, paddingBottom: 18, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backButton: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  headerCopy: { flex: 1 },
  eyebrow: { color: '#5EEAD4', fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  headerTitle: { color: '#FFFFFF', fontSize: 21, fontWeight: '900', marginTop: 3 },
  headerRefresh: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  scroll: { flex: 1 },
  content: { padding: 16 },
  centerState: { flex: 1, minHeight: 360, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC', padding: 28, gap: 12 },
  centerTitle: { color: '#0F172A', fontSize: 18, fontWeight: '900', textAlign: 'center' },
  centerText: { color: '#64748B', fontWeight: '700' },
  errorCard: { minHeight: 300, borderRadius: 24, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center', padding: 28 },
  errorText: { color: '#64748B', textAlign: 'center', lineHeight: 20, marginTop: 7 },
  darkButton: { marginTop: 12, borderRadius: 13, backgroundColor: '#0F172A', paddingHorizontal: 18, paddingVertical: 11 },
  darkButtonText: { color: '#FFFFFF', fontWeight: '900' },
  orderOverview: { borderRadius: 23, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 17 },
  overviewTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  customerName: { color: '#0F172A', fontSize: 18, fontWeight: '900' },
  orderTime: { color: '#64748B', fontSize: 11, marginTop: 4 },
  statusChip: { borderRadius: 999, backgroundColor: '#FEF3C7', paddingHorizontal: 10, paddingVertical: 6, maxWidth: 130 },
  statusText: { color: '#92400E', fontSize: 9, fontWeight: '900', textAlign: 'center', textTransform: 'uppercase' },
  overviewMeta: { marginTop: 15, paddingTop: 13, borderTopWidth: 1, borderTopColor: '#F1F5F9', gap: 8 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaText: { color: '#475569', fontSize: 12, fontWeight: '700' },
  sectionCard: { marginTop: 14, borderRadius: 23, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 13 },
  sectionTitle: { color: '#0F172A', fontSize: 16, fontWeight: '900' },
  noItems: { minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: 8 },
  noItemsText: { color: '#64748B', textAlign: 'center' },
  itemCard: { borderRadius: 18, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', padding: 12, marginBottom: 11 },
  itemMain: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  productImage: { width: 54, height: 54, borderRadius: 14, backgroundColor: '#FFFFFF' },
  imageFallback: { width: 54, height: 54, borderRadius: 14, backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
  itemCopy: { flex: 1 },
  itemName: { color: '#0F172A', fontSize: 14, fontWeight: '900' },
  itemPrice: { color: '#64748B', fontSize: 10, marginTop: 4, fontWeight: '600' },
  quantityBadge: { minWidth: 42, height: 34, paddingHorizontal: 9, borderRadius: 11, backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center' },
  quantityText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  itemActions: { marginTop: 11, flexDirection: 'row', gap: 8 },
  unavailableButton: { borderRadius: 10, borderWidth: 1, borderColor: '#F59E0B', backgroundColor: '#FFFBEB', paddingHorizontal: 11, paddingVertical: 8 },
  unavailableText: { color: '#B45309', fontSize: 11, fontWeight: '900' },
  substituteButton: { minWidth: 95, borderRadius: 10, backgroundColor: '#E2E8F0', paddingHorizontal: 11, paddingVertical: 8, alignItems: 'center' },
  substituteText: { color: '#334155', fontSize: 11, fontWeight: '900' },
  substituteList: { marginTop: 12, gap: 7 },
  substituteLabel: { color: '#64748B', fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  substituteOption: { borderRadius: 12, borderWidth: 1, borderColor: '#99F6E4', backgroundColor: '#F0FDFA', padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  substituteName: { color: '#115E59', fontSize: 12, fontWeight: '900' },
  substituteStock: { color: '#0F766E', fontSize: 10, marginTop: 3 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginTop: 8 },
  infoText: { flex: 1, color: '#475569', fontSize: 12, lineHeight: 18, fontWeight: '600' },
  noteText: { marginTop: 12, borderRadius: 12, backgroundColor: '#FFFBEB', color: '#92400E', padding: 11, fontSize: 11, fontWeight: '700' },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  priceLabel: { color: '#64748B', fontSize: 12, fontWeight: '700' },
  priceValue: { color: '#334155', fontSize: 12, fontWeight: '800' },
  totalDivider: { height: 1, backgroundColor: '#E2E8F0', marginTop: 12 },
  priceStrong: { color: '#0F172A', fontSize: 15, fontWeight: '900' },
  pickupVerifyBanner: { marginTop: 14, borderRadius: 20, borderWidth: 1, borderColor: '#99F6E4', backgroundColor: '#F0FDFA', padding: 14, gap: 12 },
  pickupVerifyTitle: { color: '#115E59', fontSize: 14, fontWeight: '900' },
  pickupVerifyText: { color: '#0F766E', fontSize: 11, lineHeight: 17, marginTop: 3, fontWeight: '700' },
  pickupVerifyButton: { minHeight: 45, borderRadius: 13, backgroundColor: '#0F766E', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  pickupVerifyButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  readyBanner: { marginTop: 14, borderRadius: 18, borderWidth: 1, borderColor: '#A7F3D0', backgroundColor: '#ECFDF5', padding: 14, flexDirection: 'row', gap: 10 },
  readyTitle: { color: '#166534', fontSize: 13, fontWeight: '900' },
  readyText: { color: '#15803D', fontSize: 10, lineHeight: 16, marginTop: 3 },
  actionCard: { marginTop: 14, gap: 9 },
  fulfillmentButton: { minHeight: 49, borderRadius: 14, backgroundColor: '#0F172A', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  fulfillmentText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  destructiveButton: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
  destructiveText: { color: '#B91C1C' },
  disabled: { opacity: 0.5 },
});
