import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, ChevronRight, ExternalLink, LogOut, MapPin, Save, Store } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@aagam/mobile-shared';
import { storeService } from '../../api/storeService';
import { AagamBrand } from '../../components/AagamBrand';

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
}

function coordinate(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue.toFixed(6) : null;
}

export const StoreSettingsScreen = () => {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const logout = useAuthStore((state) => state.logout);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const storesQuery = useQuery({
    queryKey: ['store-owner-dashboard-stores'],
    queryFn: storeService.getStoreDashboardSummaries,
    retry: 1,
  });
  const stores = Array.isArray(storesQuery.data) ? storesQuery.data : [];
  const selected = stores.find((store: any) => store.id === selectedId) || stores[0];
  const latitude = coordinate(selected?.latitude ?? selected?.lat);
  const longitude = coordinate(selected?.longitude ?? selected?.lng);
  const coordinates = latitude && longitude
    ? `${latitude}, ${longitude}`
    : 'Location coordinates are not available for this store.';
  const orderCount = Number(selected?.orderCount || 0);
  const totalRevenue = Number(selected?.totalRevenue || 0);

  useEffect(() => {
    if (!selected) return;
    setSelectedId(selected.id);
    setName(selected.name || '');
    setAddress(selected.address || '');
    setPhone(selected.phone || '');
  }, [selected?.id, selected?.updatedAt]);

  const save = async () => {
    if (!selected || saving) return;
    const cleanName = name.trim();
    const cleanAddress = address.trim();
    const cleanPhone = normalizePhone(phone);
    if (cleanName.length < 2 || cleanAddress.length < 5) {
      Toast.show({ type: 'error', text1: 'Check store details', text2: 'Enter a valid store name and address.' });
      return;
    }
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      Toast.show({ type: 'error', text1: 'Invalid phone', text2: 'Enter a valid 10-digit Indian mobile number.' });
      return;
    }
    setSaving(true);
    try {
      await storeService.updateOwnedStoreProfile(selected.id, {
        name: cleanName,
        address: cleanAddress,
        phone: cleanPhone,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['store-owner-dashboard-stores'] }),
        queryClient.invalidateQueries({ queryKey: ['my-stores'] }),
      ]);
      setPhone(cleanPhone);
      Toast.show({ type: 'success', text1: 'Store updated', text2: 'Profile details were saved securely.' });
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message || 'Could not update the store.';
      Toast.show({
        type: 'error',
        text1: 'Update failed',
        text2: Array.isArray(message) ? message.join(', ') : String(message),
      });
    } finally {
      setSaving(false);
    }
  };

  const openNotificationSettings = async () => {
    try {
      if (Platform.OS === 'android') {
        await Linking.sendIntent('android.settings.APP_NOTIFICATION_SETTINGS', [
          { key: 'android.provider.extra.APP_PACKAGE', value: 'com.aagampartners' },
        ]);
        return;
      }
      await Linking.openSettings();
    } catch {
      try {
        await Linking.openSettings();
      } catch {
        Toast.show({
          type: 'error',
          text1: 'Settings unavailable',
          text2: 'Open Android Settings and enable notifications for the partner app.',
        });
      }
    }
  };

  const confirmLogout = () => {
    Alert.alert(
      'Sign out of partner app?',
      'You will stop receiving store alerts on this account until you sign in again.',
      [
        { text: 'Stay signed in', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: () => void logout() },
      ],
    );
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#057A55" />
      <ScrollView
        style={styles.page}
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 12) + 100 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, { paddingTop: Math.max(insets.top, 20) + 12 }]}>
          <View style={styles.heroShape} />
          <AagamBrand compact caption="Fast Quality and Trust" inverse />
          <Text style={styles.eyebrow}>STORE WORKSPACE</Text>
          <Text style={styles.title}>More</Text>
          <Text style={styles.subtitle}>Profile, location, alerts and secure account controls.</Text>
        </View>

        <View style={styles.bodySheet}>
          {storesQuery.isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#078B4D" />
              <Text style={styles.muted}>Loading assigned stores…</Text>
            </View>
          ) : storesQuery.isError ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Could not load settings</Text>
              <Text style={styles.cardText}>Check your connection and try again.</Text>
              <TouchableOpacity style={styles.primaryButton} onPress={() => void storesQuery.refetch()}>
                <Text style={styles.primaryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : stores.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>No assigned store</Text>
              <Text style={styles.cardText}>An admin must assign a store before settings can be changed.</Text>
            </View>
          ) : (
            <>
              {stores.length > 1 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storeRow}>
                  {stores.map((store: any) => (
                    <TouchableOpacity
                      key={store.id}
                      onPress={() => setSelectedId(store.id)}
                      style={[styles.storeChip, selected?.id === store.id && styles.storeChipActive]}
                    >
                      <Text style={[styles.storeChipText, selected?.id === store.id && styles.storeChipTextActive]}>{store.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              ) : null}

              <View style={styles.sectionHeading}>
                <Text style={styles.sectionTitle}>Store profile</Text>
                <Text style={styles.sectionCaption}>Customer-facing details</Text>
              </View>
              <View style={styles.card}>
                <Field testID="store_settings_name" label="Store name" value={name} onChangeText={setName} />
                <Field testID="store_settings_phone" label="Owner mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
                <Field testID="store_settings_address" label="Store address" value={address} onChangeText={setAddress} multiline />
                <TouchableOpacity
                  testID="store_settings_save"
                  onPress={() => void save()}
                  disabled={saving}
                  style={[styles.primaryButton, saving && styles.disabled]}
                >
                  {saving ? <ActivityIndicator color="#FFFFFF" /> : <><Save size={18} color="#FFFFFF" /><Text style={styles.primaryText}>Save store profile</Text></>}
                </TouchableOpacity>
              </View>

              <View style={styles.summaryGrid}>
                <View style={styles.summaryCard}>
                  <View style={styles.summaryIcon}><MapPin size={21} color="#087B5A" /></View>
                  <Text style={styles.summaryTitle}>Store location</Text>
                  <Text testID="store_settings_coordinates" style={styles.summaryText}>{coordinates}</Text>
                </View>
                <View style={styles.summaryCard}>
                  <View style={styles.summaryIcon}><Store size={21} color="#087B5A" /></View>
                  <Text style={styles.summaryTitle}>Store snapshot</Text>
                  <Text style={styles.summaryMetric}>{orderCount}</Text>
                  <Text style={styles.summaryText}>All-time orders</Text>
                  <Text style={styles.summaryRevenue}>₹{totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</Text>
                </View>
              </View>
            </>
          )}

          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>App & account</Text>
            <Text style={styles.sectionCaption}>Notifications and access</Text>
          </View>
          <TouchableOpacity
            testID="store_settings_notifications"
            style={styles.actionCard}
            onPress={() => void openNotificationSettings()}
            activeOpacity={0.75}
          >
            <View style={styles.actionIcon}><BellRing size={22} color="#087B5A" /></View>
            <View style={styles.actionCopy}>
              <Text style={styles.cardTitle}>Operational notifications</Text>
              <Text style={styles.cardText}>Manage new order, picking, dispatch and delivery alerts.</Text>
            </View>
            {Platform.OS === 'android' ? <ExternalLink size={18} color="#697078" /> : <ChevronRight size={20} color="#697078" />}
          </TouchableOpacity>

          <TouchableOpacity testID="store_settings_logout" onPress={confirmLogout} style={styles.logoutButton}>
            <LogOut size={19} color="#B91C1C" />
            <Text style={styles.logoutText}>Sign out of partner app</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

function Field({
  testID,
  label,
  value,
  onChangeText,
  keyboardType,
  multiline,
}: {
  testID: string;
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: any;
  multiline?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        multiline={multiline}
        style={[styles.input, multiline && styles.multiline]}
        placeholderTextColor="#94A3B8"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F8F7' },
  page: { flex: 1 },
  content: { flexGrow: 1 },
  hero: {
    minHeight: 238,
    backgroundColor: '#057A55',
    paddingHorizontal: 20,
    paddingBottom: 30,
    overflow: 'hidden',
  },
  heroShape: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    right: -85,
    top: -92,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  eyebrow: { color: '#BDF6DD', fontSize: 10, fontWeight: '900', letterSpacing: 1.4, marginTop: 24 },
  title: { color: '#FFFFFF', fontSize: 31, fontWeight: '900', marginTop: 4 },
  subtitle: { color: '#E9FFF6', fontSize: 14, lineHeight: 20, marginTop: 6, maxWidth: 310 },
  bodySheet: {
    marginTop: -22,
    minHeight: 540,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: '#F7F8F7',
    paddingHorizontal: 18,
    paddingTop: 25,
  },
  center: { minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: 10 },
  muted: { color: '#697078', fontSize: 13 },
  storeRow: { gap: 8, paddingBottom: 15 },
  storeChip: { paddingHorizontal: 15, paddingVertical: 10, borderRadius: 14, backgroundColor: '#E5E9E7', borderWidth: 1, borderColor: '#D9DEDC' },
  storeChipActive: { backgroundColor: '#078B4D', borderColor: '#078B4D' },
  storeChipText: { color: '#44504A', fontWeight: '800' },
  storeChipTextActive: { color: '#FFFFFF' },
  sectionHeading: { marginTop: 5, marginBottom: 11 },
  sectionTitle: { color: '#111417', fontSize: 19, fontWeight: '900' },
  sectionCaption: { color: '#697078', fontSize: 12, marginTop: 2 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 19, padding: 17, marginBottom: 14, borderWidth: 1, borderColor: '#E0E3E2', shadowColor: '#10241D', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  cardTitle: { color: '#15181C', fontSize: 15, fontWeight: '900' },
  cardText: { color: '#697078', fontSize: 12, lineHeight: 18, marginTop: 4 },
  field: { marginBottom: 14 },
  label: { color: '#4E5953', fontSize: 10, fontWeight: '900', marginBottom: 7, textTransform: 'uppercase', letterSpacing: 0.7 },
  input: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: '#D7DDDA', backgroundColor: '#FAFBFA', paddingHorizontal: 13, color: '#111417', fontSize: 14 },
  multiline: { minHeight: 90, paddingTop: 13, textAlignVertical: 'top' },
  primaryButton: { minHeight: 51, borderRadius: 14, backgroundColor: '#078B4D', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 3 },
  primaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  disabled: { opacity: 0.55 },
  summaryGrid: { flexDirection: 'row', gap: 11, marginBottom: 15 },
  summaryCard: { flex: 1, minHeight: 160, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E0E3E2', padding: 14 },
  summaryIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#E8F8EE', alignItems: 'center', justifyContent: 'center' },
  summaryTitle: { color: '#15181C', fontSize: 13, fontWeight: '900', marginTop: 12 },
  summaryText: { color: '#697078', fontSize: 10, lineHeight: 15, marginTop: 5 },
  summaryMetric: { color: '#111417', fontSize: 25, fontWeight: '900', marginTop: 9 },
  summaryRevenue: { color: '#087B5A', fontSize: 12, fontWeight: '900', marginTop: 7 },
  actionCard: { minHeight: 86, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E0E3E2', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 13 },
  actionIcon: { width: 45, height: 45, borderRadius: 14, backgroundColor: '#E8F8EE', alignItems: 'center', justifyContent: 'center' },
  actionCopy: { flex: 1 },
  logoutButton: { minHeight: 52, borderRadius: 15, borderWidth: 1, borderColor: '#F2C7C7', backgroundColor: '#FFF7F7', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 2 },
  logoutText: { color: '#B91C1C', fontWeight: '900' },
});
