import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiClient, useAuthStore } from '@aagam/mobile-shared';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Headphones,
  MessageSquareText,
  Package,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react-native';
import { getUserSafeError, notify } from '../../ui/notify';

type CustomerOrder = {
  id: string;
  status: string;
  createdAt: string;
  grandTotal?: number;
  totalAmount?: number;
  store?: { name?: string | null } | null;
};

type SupportTicket = {
  id: string;
  createdAt?: string;
  metadata?: {
    status?: string;
    category?: string;
    message?: string;
    createdAt?: string;
  };
};

const issueCategories = [
  { value: 'ORDER_STATUS', label: 'Order status or delay' },
  { value: 'MISSING_ITEM', label: 'Missing item' },
  { value: 'WRONG_ITEM', label: 'Wrong item' },
  { value: 'DAMAGED_ITEM', label: 'Damaged item' },
  { value: 'PAYMENT', label: 'Payment or refund' },
  { value: 'DELIVERY_EXPERIENCE', label: 'Delivery experience' },
  { value: 'OTHER', label: 'Other issue' },
];

const formatTicketDate = (value?: string) => {
  if (!value) return 'Recently opened';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Recently opened' : date.toLocaleString();
};

export const CustomerSupportScreen = () => {
  const customerId = useAuthStore((state) => state.user?.id || '');
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [category, setCategory] = useState(issueCategories[0].value);
  const [message, setMessage] = useState('');
  const [requestedRefund, setRequestedRefund] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const selectedOrderRef = useRef('');
  const historyRequestVersion = useRef(0);

  const {
    data: orders = [],
    isLoading,
    isRefetching,
    isError,
    error,
    refetch,
  } = useQuery<CustomerOrder[]>({
    queryKey: ['customer-support-orders', customerId],
    enabled: Boolean(customerId),
    queryFn: async () => {
      const response = await apiClient.get('/orders/my');
      return Array.isArray(response.data) ? response.data : [];
    },
  });

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) || null,
    [orders, selectedOrderId],
  );

  const loadTicketHistory = useCallback(async (orderId: string) => {
    const requestVersion = ++historyRequestVersion.current;
    if (!orderId) {
      setTickets([]);
      setLoadingTickets(false);
      return;
    }
    setLoadingTickets(true);
    try {
      const response = await apiClient.get(`/orders/post-delivery/${orderId}`);
      if (requestVersion !== historyRequestVersion.current || selectedOrderRef.current !== orderId) return;
      setTickets(Array.isArray(response.data?.tickets) ? response.data.tickets : []);
    } catch {
      if (requestVersion === historyRequestVersion.current && selectedOrderRef.current === orderId) setTickets([]);
    } finally {
      if (requestVersion === historyRequestVersion.current && selectedOrderRef.current === orderId) setLoadingTickets(false);
    }
  }, []);

  useEffect(() => {
    historyRequestVersion.current += 1;
    selectedOrderRef.current = '';
    setSelectedOrderId('');
    setTickets([]);
    setLoadingTickets(false);
  }, [customerId]);

  useEffect(() => {
    setSelectedOrderId((current) => {
      const next = orders.some((order) => order.id === current) ? current : orders[0]?.id || '';
      selectedOrderRef.current = next;
      return next;
    });
  }, [orders]);

  useEffect(() => {
    selectedOrderRef.current = selectedOrderId;
    void loadTicketHistory(selectedOrderId);
    return () => {
      historyRequestVersion.current += 1;
    };
  }, [loadTicketHistory, selectedOrderId]);

  const selectOrder = (orderId: string) => {
    selectedOrderRef.current = orderId;
    setSelectedOrderId(orderId);
  };

  const submitTicket = async () => {
    const details = message.trim();
    const orderId = selectedOrderId;
    if (!orderId) {
      notify.warning('Select an order', 'Choose the order that needs support.');
      return;
    }
    if (details.length < 5) {
      notify.warning('Add more details', 'Describe what happened using at least 5 characters.');
      return;
    }
    if (submitting) return;

    setSubmitting(true);
    try {
      await apiClient.post(`/orders/post-delivery/${orderId}/support`, {
        category,
        message: details,
        priority: category === 'PAYMENT' || category === 'MISSING_ITEM' ? 'HIGH' : 'NORMAL',
        requestedRefund,
      });
      setMessage('');
      setRequestedRefund(false);
      notify.success('Support ticket opened', 'The Aagaam support team can now review your request.');
      await loadTicketHistory(orderId);
    } catch (requestError) {
      notify.error('Could not open support ticket', getUserSafeError(requestError, 'Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading && !isRefetching) {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#0F766E" /><Text style={styles.loadingText}>Loading your orders…</Text></View>;
  }

  if (isError && orders.length === 0) {
    return (
      <View style={styles.centered}>
        <View style={styles.errorIcon}><AlertCircle size={30} color="#B91C1C" /></View>
        <Text style={styles.errorTitle}>Could not load your orders</Text>
        <Text style={styles.errorText}>{getUserSafeError(error, 'Check your connection and try again.')}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => void refetch()}>
          <RefreshCw size={17} color="#FFFFFF" />
          <Text style={styles.retryText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
    >
      <View style={styles.hero}>
        <View style={styles.heroIcon}><Headphones size={26} color="#CCFBF1" /></View>
        <Text style={styles.kicker}>AAGAAM CUSTOMER CARE</Text>
        <Text style={styles.title}>How can we help?</Text>
        <Text style={styles.subtitle}>Select the affected order and send the details directly to the support team.</Text>
        <View style={styles.secureRow}><ShieldCheck size={16} color="#99F6E4" /><Text style={styles.secureText}>Tickets are linked only to orders from your verified account.</Text></View>
      </View>

      {orders.length === 0 ? (
        <View style={styles.emptyCard}>
          <Package size={34} color="#CBD5E1" />
          <Text style={styles.emptyTitle}>No orders available for support</Text>
          <Text style={styles.emptyText}>Place an order first. Support tickets use the order context to resolve store, payment, item and delivery issues.</Text>
        </View>
      ) : (
        <>
          <View style={styles.sectionCard}>
            <Text style={styles.step}>STEP 1</Text>
            <Text style={styles.sectionTitle}>Select an order</Text>
            <View style={styles.orderList}>
              {orders.map((order) => {
                const selected = order.id === selectedOrderId;
                return (
                  <TouchableOpacity key={order.id} style={[styles.orderCard, selected && styles.orderCardSelected]} onPress={() => selectOrder(order.id)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.orderTitle}>Order #{order.id.slice(-8).toUpperCase()}</Text>
                      <Text style={styles.orderMeta}>{order.store?.name || 'Aagaam store'} · {new Date(order.createdAt).toLocaleDateString()}</Text>
                      <View style={styles.orderFooter}><Text style={styles.status}>{order.status}</Text><Text style={styles.total}>₹{Number(order.grandTotal ?? order.totalAmount ?? 0).toLocaleString('en-IN')}</Text></View>
                    </View>
                    <ChevronRight size={20} color={selected ? '#0F766E' : '#CBD5E1'} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.step}>STEP 2</Text>
            <Text style={styles.sectionTitle}>Describe what happened</Text>
            {selectedOrder ? <View style={styles.selectedOrder}><Text style={styles.selectedLabel}>SELECTED ORDER</Text><Text style={styles.selectedValue}>#{selectedOrder.id.slice(-8).toUpperCase()} · {selectedOrder.status}</Text></View> : null}
            <Text style={styles.label}>Issue category</Text>
            <View style={styles.chipWrap}>{issueCategories.map((item) => <TouchableOpacity key={item.value} onPress={() => setCategory(item.value)} style={[styles.chip, category === item.value && styles.chipActive]}><Text style={[styles.chipText, category === item.value && styles.chipTextActive]}>{item.label}</Text></TouchableOpacity>)}</View>
            <Text style={styles.label}>Describe what happened</Text>
            <TextInput value={message} onChangeText={(value) => setMessage(value.slice(0, 1000))} placeholder="Include the item, payment, delivery or refund details that will help the support team investigate." placeholderTextColor="#94A3B8" multiline maxLength={1000} style={styles.messageInput} textAlignVertical="top" />
            <Text style={styles.counter}>{message.length}/1000</Text>
            <View style={styles.refundRow}><View style={{ flex: 1 }}><Text style={styles.refundTitle}>This request may need a refund</Text><Text style={styles.refundText}>Support will review eligibility. This does not automatically approve a refund.</Text></View><Switch value={requestedRefund} onValueChange={setRequestedRefund} trackColor={{ true: '#5EEAD4', false: '#CBD5E1' }} thumbColor={requestedRefund ? '#0F766E' : '#FFFFFF'} /></View>
            <TouchableOpacity disabled={submitting || message.trim().length < 5 || !selectedOrderId} style={[styles.submitButton, (submitting || message.trim().length < 5 || !selectedOrderId) && styles.disabled]} onPress={() => void submitTicket()}>{submitting ? <ActivityIndicator color="#FFFFFF" /> : <MessageSquareText size={19} color="#FFFFFF" />}<Text style={styles.submitText}>{submitting ? 'Opening ticket…' : 'Open support ticket'}</Text></TouchableOpacity>
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.historyHeader}><Text style={styles.sectionTitle}>Previous tickets</Text>{loadingTickets ? <ActivityIndicator size="small" color="#0F766E" /> : null}</View>
            {!loadingTickets && tickets.length === 0 ? <Text style={styles.noTickets}>No support ticket has been opened for this order.</Text> : null}
            {tickets.map((ticket) => <View key={ticket.id} style={styles.ticketCard}><View style={styles.ticketHeader}><View style={styles.openBadge}><CheckCircle2 size={14} color="#047857" /><Text style={styles.openBadgeText}>{ticket.metadata?.status || 'OPEN'}</Text></View><Text style={styles.ticketDate}>{formatTicketDate(ticket.createdAt || ticket.metadata?.createdAt)}</Text></View><Text style={styles.ticketCategory}>{issueCategories.find((item) => item.value === ticket.metadata?.category)?.label || ticket.metadata?.category || 'Support request'}</Text><Text style={styles.ticketMessage}>{ticket.metadata?.message || 'Support request submitted.'}</Text></View>)}
          </View>
        </>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7FB' }, content: { padding: 16, paddingBottom: 120 }, centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F4F7FB', padding: 28, gap: 12 }, loadingText: { color: '#64748B', fontWeight: '700' },
  errorIcon: { width: 58, height: 58, borderRadius: 20, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' }, errorTitle: { color: '#0F172A', fontSize: 20, fontWeight: '900', textAlign: 'center' }, errorText: { color: '#64748B', fontSize: 12, lineHeight: 18, fontWeight: '600', textAlign: 'center' }, retryButton: { marginTop: 5, minHeight: 48, borderRadius: 15, backgroundColor: '#0F766E', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 22 }, retryText: { color: '#FFFFFF', fontWeight: '900' },
  hero: { borderRadius: 28, backgroundColor: '#0F172A', padding: 20, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.18, shadowRadius: 22, elevation: 7 }, heroIcon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(20,184,166,0.22)' }, kicker: { marginTop: 16, color: '#5EEAD4', fontSize: 10, fontWeight: '900', letterSpacing: 1.4 }, title: { marginTop: 8, color: '#FFFFFF', fontSize: 30, lineHeight: 35, fontWeight: '900', letterSpacing: -0.9 }, subtitle: { marginTop: 9, color: '#CBD5E1', fontSize: 13, lineHeight: 20, fontWeight: '600' }, secureRow: { marginTop: 15, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)', padding: 11 }, secureText: { flex: 1, color: '#E2E8F0', fontSize: 11, lineHeight: 16, fontWeight: '700' },
  emptyCard: { marginTop: 16, borderRadius: 24, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 28, alignItems: 'center' }, emptyTitle: { marginTop: 12, color: '#0F172A', fontSize: 18, fontWeight: '900', textAlign: 'center' }, emptyText: { marginTop: 8, color: '#64748B', fontSize: 12, lineHeight: 18, fontWeight: '600', textAlign: 'center' },
  sectionCard: { marginTop: 16, borderRadius: 24, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 16 }, step: { color: '#0F766E', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 }, sectionTitle: { marginTop: 5, color: '#0F172A', fontSize: 19, fontWeight: '900' }, orderList: { marginTop: 13, gap: 9 }, orderCard: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 18, borderWidth: 1, borderColor: '#E2E8F0', padding: 14, backgroundColor: '#FFFFFF' }, orderCardSelected: { borderColor: '#14B8A6', backgroundColor: '#F0FDFA' }, orderTitle: { color: '#0F172A', fontSize: 14, fontWeight: '900' }, orderMeta: { marginTop: 4, color: '#64748B', fontSize: 11, fontWeight: '600' }, orderFooter: { marginTop: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, status: { borderRadius: 999, backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 4, color: '#475569', fontSize: 9, fontWeight: '900' }, total: { color: '#0F172A', fontSize: 12, fontWeight: '900' },
  selectedOrder: { marginTop: 14, borderRadius: 15, borderWidth: 1, borderColor: '#99F6E4', backgroundColor: '#F0FDFA', padding: 12 }, selectedLabel: { color: '#0F766E', fontSize: 9, fontWeight: '900', letterSpacing: 0.8 }, selectedValue: { marginTop: 3, color: '#134E4A', fontSize: 13, fontWeight: '900' }, label: { marginTop: 16, marginBottom: 8, color: '#334155', fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6 }, chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { borderRadius: 999, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC', paddingHorizontal: 11, paddingVertical: 8 }, chipActive: { borderColor: '#0F766E', backgroundColor: '#0F766E' }, chipText: { color: '#475569', fontSize: 11, fontWeight: '800' }, chipTextActive: { color: '#FFFFFF' },
  messageInput: { minHeight: 132, borderRadius: 17, borderWidth: 1.5, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC', paddingHorizontal: 14, paddingVertical: 13, color: '#0F172A', fontSize: 13, lineHeight: 19 }, counter: { marginTop: 5, color: '#94A3B8', fontSize: 10, fontWeight: '700', textAlign: 'right' }, refundRow: { marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 17, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC', padding: 13 }, refundTitle: { color: '#0F172A', fontSize: 12, fontWeight: '900' }, refundText: { marginTop: 3, color: '#64748B', fontSize: 10, lineHeight: 15, fontWeight: '600' }, submitButton: { marginTop: 16, minHeight: 56, borderRadius: 17, backgroundColor: '#0F766E', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, disabled: { opacity: 0.5 }, submitText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  historyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, noTickets: { marginTop: 12, borderRadius: 15, backgroundColor: '#F8FAFC', padding: 13, color: '#64748B', fontSize: 11, lineHeight: 17, fontWeight: '700' }, ticketCard: { marginTop: 11, borderRadius: 17, borderWidth: 1, borderColor: '#E2E8F0', padding: 13 }, ticketHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, openBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 }, openBadgeText: { color: '#047857', fontSize: 9, fontWeight: '900', letterSpacing: 0.7 }, ticketDate: { color: '#94A3B8', fontSize: 9, fontWeight: '600' }, ticketCategory: { marginTop: 8, color: '#0F172A', fontSize: 12, fontWeight: '900' }, ticketMessage: { marginTop: 4, color: '#64748B', fontSize: 11, lineHeight: 17, fontWeight: '600' },
});
