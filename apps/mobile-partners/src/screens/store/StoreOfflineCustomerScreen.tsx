import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ArrowLeft, Check, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { subscriptionOperationsService } from '../../api/subscriptionOperationsService';
import { storeService } from '../../api/storeService';

export const StoreOfflineCustomerScreen = ({ navigation }: { navigation: any }) => {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const submittingRef = useRef(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [landmark, setLandmark] = useState('');
  const [city, setCity] = useState('Anakapalle');
  const [state, setState] = useState('Andhra Pradesh');
  const [pincode, setPincode] = useState('531001');
  const [latitude, setLatitude] = useState(17.6913);
  const [longitude, setLongitude] = useState(83.0039);
  const [deliverySlot, setDeliverySlot] = useState('MORNING');
  const [frequency, setFrequency] = useState('DAILY');
  const [note, setNote] = useState('');

  const storesQuery = useQuery({
    queryKey: ['store-owner-dashboard-stores'],
    queryFn: storeService.getStoreDashboardSummaries,
    retry: 1,
  });
  const plansQuery = useQuery({
    queryKey: ['store-subscription-plans'],
    queryFn: subscriptionOperationsService.getPlans,
    retry: 1,
  });

  const stores = Array.isArray(storesQuery.data) ? storesQuery.data : [];
  const plans = Array.isArray(plansQuery.data) ? plansQuery.data : [];
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState('');

  useEffect(() => {
    // Single-store owners have no meaningful store choice; still default to
    // their store so the flow works without an extra tap.
    if (!selectedStoreId && stores.length > 0) setSelectedStoreId(stores[0].id);
  }, [stores, selectedStoreId]);

  // The plans endpoint returns every plan for the owner, plus unbound ACTIVE
  // plans. Narrow to plans the selected store is actually allowed by, using the
  // same rule the backend applies against the plan's applicability snapshot.
  // The plan itself is only ever chosen by the user: an implicit default could
  // silently commit the customer to a billing plan.
  const applicablePlans = useMemo(() => {
    if (!selectedStoreId) return [];
    return plans.filter((plan: any) => {
      const boundStoreIds = Array.isArray(plan.stores) ? plan.stores.map((entry: any) => entry?.store?.id || entry?.storeId) : [];
      if (boundStoreIds.length > 0) return boundStoreIds.includes(selectedStoreId);
      return plan.status === 'ACTIVE';
    });
  }, [plans, selectedStoreId]);

  const save = async () => {
    if (!name.trim()) {
      Toast.show({ type: 'error', text1: 'Please enter customer name', text2: '' });
      return;
    }
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      Toast.show({ type: 'error', text1: 'Invalid phone', text2: 'Phone must be 10 digits.' });
      return;
    }
    if (!address.trim()) {
      Toast.show({ type: 'error', text1: 'Please enter address', text2: '' });
      return;
    }
    if (!selectedStoreId) {
      Toast.show({ type: 'error', text1: 'No store found', text2: '' });
      return;
    }
    if (!selectedPlanId || !applicablePlans.some((plan: any) => plan.id === selectedPlanId)) {
      Toast.show({ type: 'error', text1: 'Please select a plan', text2: '' });
      return;
    }

    if (submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    setSaving(true);
    try {
      const custRes = await subscriptionOperationsService.createOfflineCustomer({
        name: name.trim(),
        phone: cleanPhone,
        line1: address.trim(),
        landmark: landmark.trim() || undefined,
        city: city.trim(),
        state: state.trim(),
        pincode: pincode.trim(),
        latitude,
        longitude,
        storeId: selectedStoreId,
      });
      const customer = custRes.customer;
      const addressData = custRes.address;

      const today = new Date();
      const startDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

      await subscriptionOperationsService.createManualSubscription({
        storeId: selectedStoreId,
        planId: selectedPlanId,
        customerId: customer.id,
        addressId: addressData.id,
        startDate,
        totalDeliveries: 30,
        deliverySlot,
        frequency,
        initialCashCollectedPaise: 0,
        storeDelivery: true,
        note,
      });

      Toast.show({ type: 'success', text1: 'Customer created', text2: 'Offline customer subscription created successfully.' });
      queryClient.invalidateQueries({ queryKey: ['store-subscribers'] });
      queryClient.invalidateQueries({ queryKey: ['store-milk-grid', new Date().getFullYear(), new Date().getMonth()] });
      navigation.goBack();
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message || 'Could not create customer.';
      Toast.show({ type: 'error', text1: 'Creation failed', text2: String(message) });
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#0F766E" />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 12) + 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
          <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
            <ArrowLeft size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.flex}>
            <Text style={styles.eyebrow}>SUBSCRIPTION MANAGEMENT</Text>
            <Text style={styles.title}>Add Offline Customer</Text>
          </View>
        </View>

        <View style={styles.body}>
          <Text style={styles.sectionTitle}>Customer details</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Customer name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Full name"
              placeholderTextColor="#94A3B8"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Phone number</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="10-digit number"
              placeholderTextColor="#94A3B8"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Delivery address</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={address}
              onChangeText={setAddress}
              placeholder="House no, street, area"
              placeholderTextColor="#94A3B8"
              multiline
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Landmark (optional)</Text>
            <TextInput
              style={styles.input}
              value={landmark}
              onChangeText={setLandmark}
              placeholder="Near temple, park"
              placeholderTextColor="#94A3B8"
            />
          </View>

          <View style={styles.row}>
            <View style={[styles.field, styles.half]}>
              <Text style={styles.label}>City</Text>
              <TextInput
                style={styles.input}
                value={city}
                onChangeText={setCity}
                placeholderTextColor="#94A3B8"
              />
            </View>
            <View style={[styles.field, styles.half]}>
              <Text style={styles.label}>State</Text>
              <TextInput
                style={styles.input}
                value={state}
                onChangeText={setState}
                placeholderTextColor="#94A3B8"
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={[styles.field, styles.half]}>
              <Text style={styles.label}>Pincode</Text>
              <TextInput
                style={styles.input}
                value={pincode}
                onChangeText={setPincode}
                keyboardType="numeric"
                placeholderTextColor="#94A3B8"
              />
            </View>
            <View style={[styles.field, styles.half]}>
              <Text style={styles.label}>Delivery slot</Text>
              <View style={styles.pillRow}>
                {['MORNING', 'EVENING', 'BOTH'].map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.pill, deliverySlot === s && styles.pillActive]}
                    onPress={() => setDeliverySlot(s)}
                  >
                    <Text style={[styles.pillText, deliverySlot === s && styles.pillTextActive]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Subscription</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Store</Text>
            <View style={styles.pillRow}>
              {stores.map((store: any) => (
                <TouchableOpacity
                  key={store.id}
                  style={[styles.pill, selectedStoreId === store.id && styles.pillActive]}
                  onPress={() => {
                    setSelectedStoreId(store.id);
                    setSelectedPlanId('');
                  }}
                >
                  <Text style={[styles.pillText, selectedStoreId === store.id && styles.pillTextActive]}>{store.name || store.id}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Plan</Text>
            {applicablePlans.length === 0 ? (
              <Text style={styles.muted}>No plans available for the selected store.</Text>
            ) : (
              <View style={styles.pillRow}>
                {applicablePlans.map((plan: any) => (
                  <TouchableOpacity
                    key={plan.id}
                    style={[styles.pill, selectedPlanId === plan.id && styles.pillActive]}
                    onPress={() => setSelectedPlanId(plan.id)}
                  >
                    <Text style={[styles.pillText, selectedPlanId === plan.id && styles.pillTextActive]}>{plan.name || plan.internalName || plan.code}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Frequency</Text>
            <View style={styles.pillRow}>
              {['DAILY', 'ALTERNATE_DAYS', 'WEEKDAYS'].map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.pill, frequency === f && styles.pillActive]}
                  onPress={() => setFrequency(f)}
                >
                  <Text style={[styles.pillText, frequency === f && styles.pillTextActive]}>{f}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Note (optional)</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={note}
              onChangeText={setNote}
              placeholder="Any special instructions"
              placeholderTextColor="#94A3B8"
              multiline
            />
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={() => void save()}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Check size={18} color="#FFFFFF" />
                <Text style={styles.saveBtnText}>Create Customer & Subscription</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { paddingBottom: 40 },
  header: { backgroundColor: '#0F766E', paddingHorizontal: 18, paddingBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  eyebrow: { color: '#A7F3D0', fontSize: 9, fontWeight: '600', letterSpacing: 1 },
  title: { color: '#FFFFFF', fontSize: 24, fontWeight: '600', marginTop: 2 },
  body: { padding: 16, gap: 12 },
  sectionTitle: { color: '#0F172A', fontSize: 16, fontWeight: '600', marginTop: 8 },
  field: { gap: 6 },
  half: { flex: 1 },
  row: { flexDirection: 'row', gap: 12 },
  label: { color: '#4E5953', fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.7 },
  input: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: '#D7DDDA', backgroundColor: '#FAFBFA', paddingHorizontal: 12, color: '#111417', fontSize: 14 },
  multiline: { minHeight: 90, paddingTop: 13, textAlignVertical: 'top' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  pillActive: { backgroundColor: '#CCFBF1', borderColor: '#0F766E' },
  pillText: { fontSize: 11, fontWeight: '600', color: '#64748B' },
  pillTextActive: { color: '#0F766E' },
  muted: { color: '#64748B', fontSize: 12 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 51, borderRadius: 14, backgroundColor: '#0F766E', marginTop: 8 },
  saveBtnDisabled: { opacity: 0.55 },
  saveBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
});
