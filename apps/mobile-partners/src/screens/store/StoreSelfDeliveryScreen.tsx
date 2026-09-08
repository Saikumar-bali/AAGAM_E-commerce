import React, { useEffect, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  CheckCircle,
  ChevronLeft,
  Clock,
  MapPin,
  Navigation,
  Phone,
  Truck,
  XCircle,
} from 'lucide-react-native';
import { apiClient } from '@aagam/utils';
import { partnerNavigationRef } from '../../navigation/partnerNavigationRef';
import { AagamBrand } from '../../components/AagamBrand';

type DeliveryItem = {
  id: string;
  sequenceNumber: number;
  deliverySlot: string;
  status: string;
  serviceDate: string;
  window: string;
  customer: { id: string; name: string; phone: string };
  address: {
    line1: string;
    line2: string;
    city: string;
    pincode: string;
    latitude: number;
    longitude: number;
    landmark: string;
  };
  order: {
    id: string;
    status: string;
    grandTotalPaise: number;
    items: Array<{ name: string; quantity: number; pricePaise: number }>;
  } | null;
  deliveryJobId: string | null;
};

const slotColor = (slot: string) => {
  if (slot === 'AM') return { bg: '#FEF3C7', text: '#92400E' };
  if (slot === 'PM') return { bg: '#E0E7FF', text: '#3730A3' };
  return { bg: '#F3F4F6', text: '#374151' };
};

const statusColor = (status: string) => {
  if (status === 'DELIVERED') return { bg: '#D1FAE5', text: '#065F46' };
  if (status === 'STORE_DELIVERING') return { bg: '#FFEDD5', text: '#9A3412' };
  if (status === 'FAILED') return { bg: '#FEE2E2', text: '#991B1B' };
  if (['SCHEDULED', 'ORDER_GENERATED', 'PREPARING', 'PACKED'].includes(status)) return { bg: '#DBEAFE', text: '#1E40AF' };
  return { bg: '#F3F4F6', text: '#6B7280' };
};

export default function StoreSelfDeliveryScreen() {
  const [deliveries, setDeliveries] = useState<DeliveryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [storeId, setStoreId] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  const [verifyModal, setVerifyModal] = useState<DeliveryItem | null>(null);
  const [verifyName, setVerifyName] = useState('');
  const [verifyPhone, setVerifyPhone] = useState('');
  const [verifyCash, setVerifyCash] = useState('');
  const [verifyNotes, setVerifyNotes] = useState('');

  const loadDeliveries = useCallback(async (sid?: string) => {
    const targetStoreId = sid || storeId;
    if (!targetStoreId) return;
    try {
      const res = await apiClient.get(`/store-self-delivery/queue/${targetStoreId}`);
      setDeliveries(res.data);
    } catch (err: any) {
      console.error('Failed to load deliveries:', err);
    }
  }, [storeId]);

  const loadStore = useCallback(async () => {
    try {
      const res = await apiClient.get('/store-owner/stores');
      const stores = res.data.stores || res.data || [];
      if (stores.length > 0) {
        setStoreId(stores[0].id);
        await loadDeliveries(stores[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load stores:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStore(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDeliveries();
    setRefreshing(false);
  };

  const startDelivery = async (deliveryId: string) => {
    setProcessingId(deliveryId);
    try {
      await apiClient.post(`/store-self-delivery/start/${deliveryId}`);
      Alert.alert('Started', 'Delivery is now in progress.');
      await loadDeliveries();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'Failed to start delivery');
    } finally {
      setProcessingId(null);
    }
  };

  const openVerify = (delivery: DeliveryItem) => {
    setVerifyModal(delivery);
    setVerifyName(delivery.customer.name || '');
    setVerifyPhone(delivery.customer.phone || '');
    setVerifyCash('');
    setVerifyNotes('');
  };

  const recordFailure = async (deliveryId: string) => {
    Alert.prompt(
      'Failure Reason',
      'Why did this delivery fail?',
      async (reason) => {
        if (!reason?.trim()) return;
        try {
          await apiClient.post(`/store-self-delivery/fail/${deliveryId}`, { reason: reason.trim() });
          await loadDeliveries();
        } catch (err: any) {
          Alert.alert('Error', err?.response?.data?.message || 'Failed to record failure');
        }
      },
      'plain-text',
    );
  };

  const completeDelivery = async () => {
    if (!verifyModal || !verifyName.trim() || !verifyPhone.trim()) {
      Alert.alert('Required', 'Please enter customer name and phone');
      return;
    }
    if (verifyCash) {
      const cashNum = parseFloat(verifyCash);
      if (!Number.isFinite(cashNum) || cashNum < 0) {
        Alert.alert('Invalid', 'Enter a valid non-negative cash amount');
        return;
      }
    }
    setProcessingId(verifyModal.id);
    try {
      await apiClient.post(`/store-self-delivery/complete/${verifyModal.id}`, {
        verifiedCustomerName: verifyName.trim(),
        verifiedCustomerPhone: verifyPhone.trim(),
        cashCollectedPaise: verifyCash ? Math.round(parseFloat(verifyCash) * 100) : undefined,
        notes: verifyNotes.trim() || undefined,
      });
      Alert.alert('Delivered', 'Delivery completed and verified!');
      setVerifyModal(null);
      await loadDeliveries();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'Failed to complete delivery');
    } finally {
      setProcessingId(null);
    }
  };

  const openNavigation = (lat: number, lng: number) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    (partnerNavigationRef.current as any)?.navigate('Web', { url });
  };

  const formatPaise = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;

  const grouped = {
    scheduled: deliveries.filter((d) => ['ORDER_GENERATED', 'PREPARING', 'PACKED'].includes(d.status)),
    inProgress: deliveries.filter((d) => d.status === 'STORE_DELIVERING'),
    completed: deliveries.filter((d) => d.status === 'DELIVERED'),
    failed: deliveries.filter((d) => d.status === 'FAILED'),
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0D7E41" />
      </View>
    );
  }

  if (verifyModal) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setVerifyModal(null)} style={styles.backBtn}>
            <ChevronLeft size={24} color="#1E293B" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Verify Customer</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Customer Info</Text>
          <View style={styles.infoRow}>
            <Phone size={14} color="#94A3B8" />
            <Text style={styles.infoText}>{verifyModal.customer.name} - {verifyModal.customer.phone}</Text>
          </View>
          <View style={styles.infoRow}>
            <MapPin size={14} color="#94A3B8" />
            <Text style={styles.infoText}>{verifyModal.address.line1}, {verifyModal.address.city}</Text>
          </View>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Verified Customer Name</Text>
          <TextInput value={verifyName} onChangeText={setVerifyName} style={styles.input} placeholder="Confirm name" />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Verified Phone</Text>
          <TextInput value={verifyPhone} onChangeText={setVerifyPhone} style={styles.input} placeholder="Confirm phone" keyboardType="phone-pad" />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Cash Collected (₹)</Text>
          <TextInput value={verifyCash} onChangeText={setVerifyCash} style={styles.input} placeholder="0" keyboardType="numeric" />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Notes (optional)</Text>
          <TextInput value={verifyNotes} onChangeText={setVerifyNotes} style={styles.input} placeholder="Delivery notes" />
        </View>

        <TouchableOpacity
          style={[styles.primaryBtn, (!verifyName.trim() || !verifyPhone.trim() || processingId === verifyModal.id) && styles.disabledBtn]}
          disabled={!verifyName.trim() || !verifyPhone.trim() || processingId === verifyModal.id}
          onPress={completeDelivery}
        >
          {processingId === verifyModal.id ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <CheckCircle size={18} color="#FFF" />
              <Text style={styles.primaryBtnText}>Confirm & Complete</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  const renderSection = (title: string, icon: React.ReactNode, items: DeliveryItem[], color: string) => {
    if (items.length === 0) return null;
    return (
      <View style={styles.section}>
        <View style={[styles.sectionHeader, { borderLeftColor: color }]}>
          {icon}
          <Text style={[styles.sectionTitle, { color }]}>{title} ({items.length})</Text>
        </View>
        {items.map((d) => (
          <View key={d.id} style={[styles.deliveryCard, d.status === 'DELIVERED' && styles.completedCard]}>
            <View style={styles.cardTop}>
              <View>
                <Text style={styles.customerName}>{d.customer.name}</Text>
                <Text style={styles.customerPhone}>{d.customer.phone}</Text>
              </View>
              <View style={styles.badges}>
                <View style={[styles.slotBadge, { backgroundColor: slotColor(d.deliverySlot).bg }]}>
                  <Text style={[styles.slotBadgeText, { color: slotColor(d.deliverySlot).text }]}>{d.deliverySlot}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: statusColor(d.status).bg }]}>
                  <Text style={[styles.statusBadgeText, { color: statusColor(d.status).text }]}>{d.status.replace('STORE_DELIVERING', 'Out')}</Text>
                </View>
              </View>
            </View>

            <View style={styles.addressRow}>
              <MapPin size={12} color="#94A3B8" />
              <Text style={styles.addressText} numberOfLines={1}>{d.address.line1}, {d.address.city}</Text>
            </View>

            {d.order && (
              <View style={styles.orderSummary}>
                {d.order.items.slice(0, 2).map((i, idx) => (
                  <Text key={idx} style={styles.itemText}>{i.quantity}x {i.name}</Text>
                ))}
                <Text style={styles.totalText}>Total: {formatPaise(d.order.grandTotalPaise)}</Text>
              </View>
            )}

            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.navBtn} onPress={() => openNavigation(d.address.latitude, d.address.longitude)}>
                <Navigation size={14} color="#3B82F6" />
                <Text style={styles.navBtnText}>Navigate</Text>
              </TouchableOpacity>

              {['ORDER_GENERATED', 'PREPARING', 'PACKED'].includes(d.status) && (
                <TouchableOpacity
                  style={styles.startBtn}
                  disabled={processingId === d.id}
                  onPress={() => startDelivery(d.id)}
                >
                  {processingId === d.id ? <ActivityIndicator color="#FFF" size="small" /> : (
                    <>
                      <Truck size={14} color="#FFF" />
                      <Text style={styles.startBtnText}>Start</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              {d.status === 'STORE_DELIVERING' && (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity style={styles.completeBtn} onPress={() => openVerify(d)}>
                    <CheckCircle size={14} color="#FFF" />
                    <Text style={styles.completeBtnText}>Verify & Deliver</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.failBtn} onPress={() => recordFailure(d.id)}>
                    <XCircle size={14} color="#FFF" />
                    <Text style={styles.failBtnText}>Fail</Text>
                  </TouchableOpacity>
                </View>
              )}

              {d.status === 'DELIVERED' && (
                <View style={styles.deliveredBadge}>
                  <CheckCircle size={14} color="#065F46" />
                  <Text style={styles.deliveredText}>Done</Text>
                </View>
              )}
            </View>
          </View>
        ))}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => partnerNavigationRef.current?.goBack()} style={styles.backBtn}>
          <ChevronLeft size={24} color="#1E293B" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Store Delivery</Text>
        <Text style={styles.countBadge}>{deliveries.length}</Text>
      </View>

      <FlatList
        data={[1]}
        keyExtractor={() => 'content'}
        renderItem={() => (
          <View style={styles.content}>
            {grouped.inProgress.length > 0 && renderSection('In Progress', <Truck size={16} color="#EA580C" />, grouped.inProgress, '#EA580C')}
            {grouped.scheduled.length > 0 && renderSection('Ready to Deliver', <Clock size={16} color="#2563EB" />, grouped.scheduled, '#2563EB')}
            {grouped.completed.length > 0 && renderSection('Completed', <CheckCircle size={16} color="#059669" />, grouped.completed, '#059669')}
            {grouped.failed.length > 0 && renderSection('Failed', <XCircle size={16} color="#DC2626" />, grouped.failed, '#DC2626')}

            {deliveries.length === 0 && (
              <View style={styles.emptyContainer}>
                <CheckCircle size={48} color="#D1D5DB" />
                <Text style={styles.emptyTitle}>All done!</Text>
                <Text style={styles.emptySubtitle}>No store deliveries today</Text>
              </View>
            )}
          </View>
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 48, paddingBottom: 12, backgroundColor: '#FFF',
    borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
  },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  countBadge: { fontSize: 12, fontWeight: '900', color: '#FFF', backgroundColor: '#0D7E41', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  content: { padding: 16 },
  section: { marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, borderLeftWidth: 3, paddingLeft: 10, marginBottom: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '900' },
  deliveryCard: {
    backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  completedCard: { borderColor: '#D1FAE5', backgroundColor: '#F0FDF4' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  customerName: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  customerPhone: { fontSize: 13, color: '#64748B', marginTop: 2 },
  badges: { flexDirection: 'row', gap: 6 },
  slotBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  slotBadgeText: { fontSize: 11, fontWeight: '800' },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  statusBadgeText: { fontSize: 10, fontWeight: '800' },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  addressText: { fontSize: 12, color: '#64748B', flex: 1 },
  orderSummary: {
    marginTop: 10, padding: 10, backgroundColor: '#F8FAFC', borderRadius: 10,
  },
  itemText: { fontSize: 12, color: '#475569', marginBottom: 2 },
  totalText: { fontSize: 13, fontWeight: '800', color: '#0F172A', marginTop: 6 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  navBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 12, paddingVertical: 8 },
  navBtnText: { fontSize: 12, fontWeight: '700', color: '#3B82F6' },
  startBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, backgroundColor: '#2563EB', paddingVertical: 10 },
  startBtnText: { fontSize: 13, fontWeight: '800', color: '#FFF' },
  completeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, backgroundColor: '#059669', paddingVertical: 10 },
  completeBtnText: { fontSize: 13, fontWeight: '800', color: '#FFF' },
  failBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 10, backgroundColor: '#DC2626', paddingVertical: 10, paddingHorizontal: 12 },
  failBtnText: { fontSize: 13, fontWeight: '800', color: '#FFF' },
  deliveredBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, backgroundColor: '#D1FAE5', paddingHorizontal: 12, paddingVertical: 8 },
  deliveredText: { fontSize: 12, fontWeight: '800', color: '#065F46' },
  card: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  cardLabel: { fontSize: 11, fontWeight: '900', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  infoText: { fontSize: 13, color: '#475569', flex: 1 },
  formGroup: { marginBottom: 16, paddingHorizontal: 16 },
  label: { fontSize: 13, fontWeight: '800', color: '#334155', marginBottom: 6 },
  input: {
    backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0',
    paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, fontWeight: '600',
  },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#059669', borderRadius: 16, marginHorizontal: 16, marginTop: 16,
    paddingVertical: 16,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '900', color: '#FFF' },
  disabledBtn: { opacity: 0.5 },
  emptyContainer: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 18, fontWeight: '900', color: '#94A3B8', marginTop: 16 },
  emptySubtitle: { fontSize: 13, color: '#CBD5E1', marginTop: 4 },
});
