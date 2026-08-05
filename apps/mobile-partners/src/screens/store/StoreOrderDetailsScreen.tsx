import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import {
  ArrowLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  ImageOff,
  MapPin,
  Package,
  Phone,
  RefreshCw,
  ShoppingBag,
  User,
  XCircle,
} from 'lucide-react-native';
import { storeService } from '../../api/storeService';
import type { StoreOrderStatus } from '../../api/storeService';

const EDITABLE_ITEM_STATUSES = new Set(['PENDING', 'PAYMENT_PENDING', 'CONFIRMED', 'PICKING']);
const STATUS_LABELS: Record<string, string> = {
  PENDING: 'New order',
  PAYMENT_PENDING: 'Payment pending',
  PAYMENT_FAILED: 'Payment failed',
  CONFIRMED: 'Accepted',
  PICKING: 'Preparing',
  PACKED: 'Ready for pickup',
  RIDER_ASSIGNED: 'Rider assigned',
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

function errorMessage(error: any) {
  const value = error?.response?.data?.message;
  if (Array.isArray(value)) return value.join(', ');
  return value || error?.message || 'The order could not be updated.';
}

function shortId(value?: string | null) {
  return value ? value.slice(-8).toUpperCase() : 'UNKNOWN';
}

function money(value: unknown, paise?: unknown) {
  const paiseValue = Number(paise);
  if (Number.isFinite(paiseValue) && paise !== null && paise !== undefined) return paiseValue / 100;
  const numberValue = Number(value || 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function imageUri(product: any) {
  if (typeof product?.image === 'string' && product.image.trim()) return product.image.trim();
  if (Array.isArray(product?.images)) {
    return product.images.find((entry: unknown) => typeof entry === 'string' && entry.trim()) || null;
  }
  return null;
}

function statusTone(status?: string | null) {
  if (status === 'CANCELLED' || status === 'PAYMENT_FAILED') {
    return { color: '#B91C1C', backgroundColor: '#FEECEC' };
  }
  if (status === 'PACKED' || status === 'RIDER_ASSIGNED' || status === 'OUT_FOR_DELIVERY') {
    return { color: '#B45A08', backgroundColor: '#FFF2E4' };
  }
  return { color: '#087B5A', backgroundColor: '#E8F8EE' };
}

export const StoreOrderDetailsScreen = ({ navigation, route }: { navigation?: any; route?: any }) => {
  const insets = useSafeAreaInsets();
  const storeId = String(route?.params?.storeId || '');
  const orderId = String(route?.params?.orderId || '');
  const initialOrder = route?.params?.order?.id === orderId ? route.params.order : undefined;
  const queryClient = useQueryClient();
  const [substitutes, setSubstitutes] = useState<Record<string, any[]>>({});
  const [loadingSubstitutes, setLoadingSubstitutes] = useState<string | null>(null);

  const orderQueryKey = ['partner-store-order', storeId, orderId] as const;
  const orderQuery = useQuery({
    queryKey: orderQueryKey,
    queryFn: () => storeService.getStoreOrder(storeId, orderId),
    enabled: Boolean(storeId && orderId),
    initialData: initialOrder,
    refetchInterval: 15_000,
    retry: 1,
  });
  const order: any = orderQuery.data || null;

  const refreshOrder = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: orderQueryKey }),
      queryClient.invalidateQueries({ queryKey: ['partner-store-orders', storeId] }),
      queryClient.invalidateQueries({ queryKey: ['store-owner-dashboard-stores'] }),
    ]);
  };

  const statusMutation = useMutation({
    mutationFn: async (status: StoreOrderStatus) => status === 'PACKED'
      ? storeService.markOrderReady(orderId)
      : storeService.updateOrderStatus(orderId, status),
    onSuccess: async (_data, status) => {
      await refreshOrder();
      Toast.show({
        type: 'success',
        text1: STATUS_LABELS[status] || 'Order updated',
        text2: status === 'PACKED'
          ? 'The order is ready for rider pickup.'
          : 'The fulfillment queue has been refreshed.',
      });
    },
    onError: (error: any) => Toast.show({
      type: 'error',
      text1: 'Order update failed',
      text2: errorMessage(error),
    }),
  });

  const unavailableMutation = useMutation({
    mutationFn: (itemId: string) => storeService.markOrderItemUnavailable(orderId, itemId),
    onSuccess: async () => {
      await refreshOrder();
      Toast.show({ type: 'success', text1: 'Item marked unavailable', text2: 'Review substitutes before continuing.' });
    },
    onError: (error: any) => Toast.show({
      type: 'error',
      text1: 'Could not update item',
      text2: errorMessage(error),
    }),
  });

  const loadSubstitutes = async (itemId: string) => {
    setLoadingSubstitutes(itemId);
    try {
      const response = await storeService.getOrderItemSubstitutes(orderId, itemId);
      setSubstitutes((current) => ({
        ...current,
        [itemId]: Array.isArray(response) ? response : [],
      }));
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
      Toast.show({ type: 'success', text1: 'Substitute applied', text2: 'The picking list now reflects the replacement.' });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Could not apply substitute', text2: errorMessage(error) });
    } finally {
      setLoadingSubstitutes(null);
    }
  };

  const confirmStatus = (action: { status: StoreOrderStatus; label: string; destructive?: boolean }) => {
    Alert.alert(
      `${action.label}?`,
      action.status === 'PACKED'
        ? 'Confirm that all available items are packed for rider handoff.'
        : action.status === 'CANCELLED'
          ? 'This customer-facing action is recorded in the audit trail.'
          : 'The customer and operations timeline will be updated.',
      [
        { text: 'Back', style: 'cancel' },
        {
          text: action.label,
          style: action.destructive ? 'destructive' : 'default',
          onPress: () => statusMutation.mutate(action.status),
        },
      ],
    );
  };

  if (!storeId || !orderId) {
    return (
      <StateCard
        title="Order context unavailable"
        text="Return to Orders and open the record again."
        onPress={() => navigation?.goBack?.()}
      />
    );
  }

  const tone = statusTone(order?.status);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#057A55" />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 18) + 8 }]}>
        <View style={styles.headerShape} />
        <TouchableOpacity
          testID="store_order_details_back"
          accessibilityLabel="Back to orders"
          style={styles.headerButton}
          onPress={() => navigation?.goBack?.()}
        >
          <ArrowLeft size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>STORE ORDER</Text>
          <Text style={styles.headerTitle}>Order #{shortId(orderId)}</Text>
        </View>
        <TouchableOpacity
          accessibilityLabel="Refresh order"
          style={styles.headerButton}
          onPress={() => void orderQuery.refetch()}
        >
          <RefreshCw size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 8) + 104 }]}
        refreshControl={(
          <RefreshControl
            refreshing={orderQuery.isRefetching}
            onRefresh={() => void orderQuery.refetch()}
            tintColor="#078B4D"
          />
        )}
      >
        {orderQuery.isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color="#078B4D" />
            <Text style={styles.muted}>Loading order details…</Text>
          </View>
        ) : orderQuery.isError ? (
          <StateCard
            title="Could not load this order"
            text={errorMessage(orderQuery.error)}
            onPress={() => void orderQuery.refetch()}
            action="Retry"
          />
        ) : !order ? (
          <StateCard
            title="Order no longer available"
            text="It may have changed stores or moved outside your access."
            onPress={() => navigation?.goBack?.()}
          />
        ) : (
          <>
            <View style={styles.overview}>
              <View style={styles.overviewTop}>
                <View style={styles.flex}>
                  <Text style={styles.customerName}>{order.customer?.name || order.addressSnapshot?.recipientName || 'Customer'}</Text>
                  <Text style={styles.muted}>{order.createdAt ? new Date(order.createdAt).toLocaleString('en-IN') : 'Recently created'}</Text>
                </View>
                <View style={[styles.statusChip, { backgroundColor: tone.backgroundColor }]}>
                  <Text style={[styles.statusText, { color: tone.color }]}>{STATUS_LABELS[order.status] || String(order.status).replaceAll('_', ' ')}</Text>
                </View>
              </View>
              <View style={styles.metaRow}>
                <View style={styles.meta}><Package size={18} color="#087B5A" /><Text style={styles.metaText}>{order.items?.length || 0} lines</Text></View>
                <View style={styles.meta}><CircleDollarSign size={18} color="#087B5A" /><Text style={styles.metaText}>₹{money(order.grandTotal, order.grandTotalPaise).toFixed(2)}</Text></View>
              </View>
            </View>

            <Section icon={<ClipboardCheck size={21} color="#087B5A" />} title="Picking list">
              {(order.items || []).length === 0 ? (
                <Text style={styles.emptyText}>No product lines were returned for this order.</Text>
              ) : (order.items || []).map((item: any) => {
                const uri = imageUri(item.product);
                const quantity = Number(item.quantity || 0);
                const unitPrice = money(item.price, item.unitPricePaise);
                const lineTotal = money(quantity * unitPrice, item.lineTotalPaise);
                const replacements = substitutes[item.id] || [];
                const editable = EDITABLE_ITEM_STATUSES.has(order.status);
                return (
                  <View testID={`store_order_item_${item.id}`} key={item.id} style={styles.itemCard}>
                    <View style={styles.itemMain}>
                      {uri ? (
                        <Image source={{ uri }} style={styles.productImage} />
                      ) : (
                        <View style={styles.imageFallback}><ImageOff size={21} color="#94A3B8" /></View>
                      )}
                      <View style={styles.flex}>
                        <Text style={styles.itemName}>{item.product?.name || 'Product'}</Text>
                        <Text style={styles.muted}>₹{unitPrice.toFixed(2)} each · {quantity} unit{quantity === 1 ? '' : 's'}</Text>
                        <Text style={styles.lineTotal}>Line total ₹{lineTotal.toFixed(2)}</Text>
                      </View>
                      <View style={styles.quantityBadge}><Text style={styles.quantityText}>×{quantity}</Text></View>
                    </View>
                    {editable ? (
                      <View style={styles.itemActions}>
                        <TouchableOpacity
                          disabled={unavailableMutation.isPending}
                          style={styles.dangerOutline}
                          onPress={() => Alert.alert(
                            'Mark item unavailable?',
                            item.product?.name || 'This product',
                            [
                              { text: 'Back', style: 'cancel' },
                              { text: 'Mark unavailable', style: 'destructive', onPress: () => unavailableMutation.mutate(item.id) },
                            ],
                          )}
                        >
                          <Text style={styles.dangerText}>Unavailable</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.neutralButton} onPress={() => void loadSubstitutes(item.id)}>
                          {loadingSubstitutes === item.id
                            ? <ActivityIndicator color="#087B5A" />
                            : <Text style={styles.neutralText}>Substitutes</Text>}
                        </TouchableOpacity>
                      </View>
                    ) : null}
                    {replacements.length ? (
                      <View style={styles.replacements}>
                        <Text style={styles.replacementLabel}>Available replacements</Text>
                        {replacements.map((product: any) => (
                          <TouchableOpacity
                            key={product.id}
                            style={styles.replacement}
                            onPress={() => void applySubstitute(item.id, product.id)}
                          >
                            <View style={styles.flex}>
                              <Text style={styles.replacementName}>{product.name}</Text>
                              <Text style={styles.muted}>₹{money(product.price, product.pricePaise).toFixed(2)}</Text>
                            </View>
                            <ChevronRight size={18} color="#087B5A" />
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </Section>

            <Section icon={<User size={21} color="#087B5A" />} title="Customer & delivery">
              <Info
                icon={<Phone size={18} color="#697078" />}
                text={order.customer?.phone || order.addressSnapshot?.phoneE164 || order.customer?.email || 'Contact unavailable'}
              />
              <Info
                icon={<MapPin size={18} color="#697078" />}
                text={[order.addressSnapshot?.line1, order.addressSnapshot?.line2, order.addressSnapshot?.landmark, order.addressSnapshot?.city, order.addressSnapshot?.pincode].filter(Boolean).join(', ') || 'Delivery address unavailable'}
              />
            </Section>

            <Section icon={<ShoppingBag size={21} color="#087B5A" />} title="Order total">
              <PriceRow label="Subtotal" value={money(order.subtotal, order.subtotalPaise)} />
              <PriceRow label="Delivery" value={money(order.deliveryFee, order.deliveryFeePaise)} />
              <PriceRow label="Discount" value={-Math.abs(money(order.discount, order.discountPaise))} />
              <View style={styles.priceDivider} />
              <PriceRow label="Grand total" value={money(order.grandTotal, order.grandTotalPaise)} strong />
            </Section>

            {(STATUS_ACTIONS[order.status] || []).length ? (
              <View style={styles.actionsCard}>
                <Text style={styles.actionsTitle}>Order actions</Text>
                {(STATUS_ACTIONS[order.status] || []).map((action) => (
                  <TouchableOpacity
                    key={action.status}
                    testID={`store_order_action_${action.status.toLowerCase()}`}
                    disabled={statusMutation.isPending}
                    style={[
                      styles.actionButton,
                      action.destructive && styles.destructiveButton,
                      statusMutation.isPending && styles.disabled,
                    ]}
                    onPress={() => confirmStatus(action)}
                  >
                    {statusMutation.isPending
                      ? <ActivityIndicator color="#FFFFFF" />
                      : <Text style={styles.actionText}>{action.label}</Text>}
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

function StateCard({
  title,
  text,
  onPress,
  action = 'Back to orders',
}: {
  title: string;
  text: string;
  onPress: () => void;
  action?: string;
}) {
  return (
    <View style={styles.stateCard}>
      <View style={styles.stateIcon}><XCircle size={39} color="#B91C1C" /></View>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateText}>{text}</Text>
      <TouchableOpacity style={styles.stateButton} onPress={onPress}>
        <Text style={styles.stateButtonText}>{action}</Text>
      </TouchableOpacity>
    </View>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>{icon}<Text style={styles.sectionTitle}>{title}</Text></View>
      {children}
    </View>
  );
}

function Info({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <View style={styles.info}>{icon}<Text style={styles.infoText}>{text}</Text></View>;
}

function PriceRow({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  const prefix = value < 0 ? '-₹' : '₹';
  return (
    <View style={styles.priceRow}>
      <Text style={[styles.priceLabel, strong && styles.strong]}>{label}</Text>
      <Text style={[styles.priceValue, strong && styles.strong]}>{prefix}{Math.abs(value).toFixed(2)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F8F7' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 16 },
  flex: { flex: 1 },
  header: {
    minHeight: 126,
    paddingHorizontal: 16,
    paddingBottom: 18,
    backgroundColor: '#057A55',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    overflow: 'hidden',
  },
  headerShape: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    right: -68,
    top: -75,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  headerButton: { width: 43, height: 43, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: '#BDF6DD', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  headerTitle: { color: '#FFFFFF', fontSize: 21, fontWeight: '900', marginTop: 4 },
  loading: { minHeight: 300, alignItems: 'center', justifyContent: 'center', gap: 10 },
  muted: { color: '#697078', fontSize: 11, marginTop: 4 },
  overview: { borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E0E3E2', padding: 16, shadowColor: '#10241D', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  overviewTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  customerName: { color: '#15181C', fontSize: 19, fontWeight: '900' },
  statusChip: { maxWidth: 132, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  statusText: { fontSize: 9, fontWeight: '900', textAlign: 'center' },
  metaRow: { marginTop: 15, flexDirection: 'row', gap: 15 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { color: '#44504A', fontSize: 12, fontWeight: '800' },
  section: { marginTop: 14, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E0E3E2', padding: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 13 },
  sectionTitle: { color: '#15181C', fontSize: 16, fontWeight: '900' },
  itemCard: { borderRadius: 16, backgroundColor: '#FAFBFA', borderWidth: 1, borderColor: '#E2E5E3', padding: 12, marginTop: 9 },
  itemMain: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  productImage: { width: 52, height: 52, borderRadius: 12, backgroundColor: '#E5E9E7' },
  imageFallback: { width: 52, height: 52, borderRadius: 12, backgroundColor: '#E5E9E7', alignItems: 'center', justifyContent: 'center' },
  itemName: { color: '#15181C', fontSize: 13, fontWeight: '900' },
  lineTotal: { color: '#15181C', fontSize: 11, fontWeight: '900', marginTop: 4 },
  quantityBadge: { minWidth: 35, height: 35, borderRadius: 12, backgroundColor: '#E8F8EE', alignItems: 'center', justifyContent: 'center' },
  quantityText: { color: '#087B5A', fontWeight: '900' },
  itemActions: { flexDirection: 'row', gap: 8, marginTop: 11 },
  dangerOutline: { flex: 1, minHeight: 41, borderRadius: 12, borderWidth: 1, borderColor: '#F2BABA', backgroundColor: '#FFF8F8', alignItems: 'center', justifyContent: 'center' },
  dangerText: { color: '#B91C1C', fontSize: 11, fontWeight: '900' },
  neutralButton: { flex: 1, minHeight: 41, borderRadius: 12, backgroundColor: '#E8F8EE', alignItems: 'center', justifyContent: 'center' },
  neutralText: { color: '#087B5A', fontSize: 11, fontWeight: '900' },
  replacements: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E0E3E2' },
  replacementLabel: { color: '#697078', fontSize: 10, fontWeight: '900', marginBottom: 5 },
  replacement: { minHeight: 48, flexDirection: 'row', alignItems: 'center', borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E6E9E7', paddingHorizontal: 10, marginTop: 6 },
  replacementName: { color: '#15181C', fontSize: 12, fontWeight: '900' },
  info: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginTop: 10 },
  infoText: { flex: 1, color: '#56605B', fontSize: 12, lineHeight: 18, fontWeight: '700' },
  priceRow: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  priceLabel: { color: '#697078', fontSize: 12 },
  priceValue: { color: '#44504A', fontSize: 12, fontWeight: '800' },
  priceDivider: { height: 1, backgroundColor: '#E5E8E6', marginVertical: 5 },
  strong: { color: '#15181C', fontSize: 15, fontWeight: '900' },
  emptyText: { color: '#697078', textAlign: 'center', paddingVertical: 18 },
  actionsCard: { marginTop: 14, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E0E3E2', padding: 14, gap: 9 },
  actionsTitle: { color: '#15181C', fontSize: 15, fontWeight: '900', marginBottom: 2 },
  actionButton: { minHeight: 52, borderRadius: 14, backgroundColor: '#078B4D', alignItems: 'center', justifyContent: 'center' },
  destructiveButton: { backgroundColor: '#B91C1C' },
  actionText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  disabled: { opacity: 0.5 },
  stateCard: { flex: 1, minHeight: 420, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F8F7', padding: 28 },
  stateIcon: { width: 68, height: 68, borderRadius: 34, backgroundColor: '#FEECEC', alignItems: 'center', justifyContent: 'center' },
  stateTitle: { color: '#15181C', fontSize: 20, fontWeight: '900', marginTop: 13, textAlign: 'center' },
  stateText: { color: '#697078', lineHeight: 20, textAlign: 'center', marginTop: 8 },
  stateButton: { minHeight: 48, borderRadius: 14, backgroundColor: '#078B4D', paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  stateButtonText: { color: '#FFFFFF', fontWeight: '900' },
});
