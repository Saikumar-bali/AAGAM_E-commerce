import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, ExternalLink, LogOut, MapPin, Save, Store } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@aagam/mobile-shared';
import { storeService } from '../../api/storeService';

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
}

function coordinate(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue.toFixed(6) : null;
}

export const StoreSettingsScreen = () => {
  const queryClient = useQueryClient();
  const logout = useAuthStore((state) => state.logout);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const storesQuery = useQuery({ queryKey: ['store-owner-dashboard-stores'], queryFn: storeService.getStoreDashboardSummaries, retry: 1 });
  const stores = Array.isArray(storesQuery.data) ? storesQuery.data : [];
  const selected = stores.find((store: any) => store.id === selectedId) || stores[0];
  const latitude = coordinate(selected?.latitude ?? selected?.lat);
  const longitude = coordinate(selected?.longitude ?? selected?.lng);
  const coordinates = latitude && longitude ? `${latitude}, ${longitude}` : 'Location coordinates are not available for this store.';
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
      await storeService.updateOwnedStoreProfile(selected.id, { name: cleanName, address: cleanAddress, phone: cleanPhone });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['store-owner-dashboard-stores'] }),
        queryClient.invalidateQueries({ queryKey: ['my-stores'] }),
      ]);
      setPhone(cleanPhone);
      Toast.show({ type: 'success', text1: 'Store updated', text2: 'Profile details were saved securely.' });
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message || 'Could not update the store.';
      Toast.show({ type: 'error', text1: 'Update failed', text2: Array.isArray(message) ? message.join(', ') : String(message) });
    } finally { setSaving(false); }
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
        Toast.show({ type: 'error', text1: 'Settings unavailable', text2: 'Open Android Settings and enable notifications for AAGAM Partners.' });
      }
    }
  };

  const confirmLogout = () => {
    Alert.alert('Sign out of partner app?', 'You will stop receiving store alerts on this account until you sign in again.', [
      { text: 'Stay signed in', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void logout() },
    ]);
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.hero}><Store size={30} color="#5EEAD4" /><View style={styles.heroCopy}><Text style={styles.eyebrow}>STORE SETTINGS</Text><Text style={styles.title}>Store profile</Text><Text style={styles.subtitle}>Maintain customer-facing identity and the owner contact number.</Text></View></View>
      {storesQuery.isLoading ? <View style={styles.center}><ActivityIndicator color="#0F766E" /><Text style={styles.muted}>Loading assigned stores…</Text></View> : storesQuery.isError ? <View style={styles.card}><Text style={styles.cardTitle}>Could not load settings</Text><TouchableOpacity style={styles.primaryButton} onPress={() => void storesQuery.refetch()}><Text style={styles.primaryText}>Retry</Text></TouchableOpacity></View> : stores.length === 0 ? <View style={styles.card}><Text style={styles.cardTitle}>No assigned store</Text><Text style={styles.cardText}>An admin must assign a store before settings can be changed.</Text></View> : <>
        {stores.length > 1 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storeRow}>{stores.map((store: any) => <TouchableOpacity key={store.id} onPress={() => setSelectedId(store.id)} style={[styles.storeChip, selected?.id === store.id && styles.storeChipActive]}><Text style={[styles.storeChipText, selected?.id === store.id && styles.storeChipTextActive]}>{store.name}</Text></TouchableOpacity>)}</ScrollView> : null}
        <View style={styles.card}><Field testID="store_settings_name" label="Store name" value={name} onChangeText={setName} /><Field testID="store_settings_phone" label="Owner mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" /><Field testID="store_settings_address" label="Store address" value={address} onChangeText={setAddress} multiline /><TouchableOpacity testID="store_settings_save" onPress={() => void save()} disabled={saving} style={[styles.primaryButton, saving && styles.disabled]}>{saving ? <ActivityIndicator color="#FFFFFF" /> : <><Save size={18} color="#FFFFFF" /><Text style={styles.primaryText}>Save store profile</Text></>}</TouchableOpacity></View>
        <View style={styles.card}><View style={styles.infoRow}><MapPin size={21} color="#0F766E" /><View style={styles.infoCopy}><Text style={styles.cardTitle}>Store location</Text><Text testID="store_settings_coordinates" style={styles.cardText}>{coordinates}</Text></View></View></View>
        <View style={styles.card}><View style={styles.infoRow}><Store size={21} color="#0F766E" /><View style={styles.infoCopy}><Text style={styles.cardTitle}>Store snapshot</Text><Text style={styles.cardText}>All-time orders: {orderCount}</Text><Text style={styles.cardText}>Recorded revenue: ₹{totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</Text></View></View></View>
      </>}
      <TouchableOpacity testID="store_settings_notifications" style={styles.card} onPress={() => void openNotificationSettings()} activeOpacity={0.75}><View style={styles.infoRow}><BellRing size={21} color="#0F766E" /><View style={styles.infoCopy}><Text style={styles.cardTitle}>Operational notifications</Text><Text style={styles.cardText}>Open system notification settings for new orders, picking, dispatch and delivery alerts.</Text></View><ExternalLink size={18} color="#64748B" /></View></TouchableOpacity>
      <TouchableOpacity testID="store_settings_logout" onPress={confirmLogout} style={styles.logoutButton}><LogOut size={18} color="#B91C1C" /><Text style={styles.logoutText}>Sign out of partner app</Text></TouchableOpacity>
    </ScrollView>
  );
};

function Field({ testID, label, value, onChangeText, keyboardType, multiline }: { testID: string; label: string; value: string; onChangeText: (value: string) => void; keyboardType?: any; multiline?: boolean }) { return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput testID={testID} value={value} onChangeText={onChangeText} keyboardType={keyboardType} multiline={multiline} style={[styles.input, multiline && styles.multiline]} placeholderTextColor="#94A3B8" /></View>; }

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F8FAFC' }, content: { padding: 18, paddingTop: 54, paddingBottom: 120 }, hero: { backgroundColor: '#0F172A', borderRadius: 24, padding: 20, flexDirection: 'row', alignItems: 'center', marginBottom: 18 }, heroCopy: { flex: 1, marginLeft: 13 }, eyebrow: { color: '#5EEAD4', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 }, title: { color: '#FFFFFF', fontSize: 24, fontWeight: '900', marginTop: 3 }, subtitle: { color: '#CBD5E1', fontSize: 12, lineHeight: 18, marginTop: 4 }, center: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 10 }, muted: { color: '#64748B' }, storeRow: { gap: 8, paddingBottom: 12 }, storeChip: { paddingHorizontal: 15, paddingVertical: 10, borderRadius: 14, backgroundColor: '#E2E8F0' }, storeChipActive: { backgroundColor: '#0F766E' }, storeChipText: { color: '#334155', fontWeight: '800' }, storeChipTextActive: { color: '#FFFFFF' }, card: { backgroundColor: '#FFFFFF', borderRadius: 22, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: '#E2E8F0' }, cardTitle: { color: '#0F172A', fontSize: 16, fontWeight: '900' }, cardText: { color: '#64748B', fontSize: 12, lineHeight: 18, marginTop: 5 }, field: { marginBottom: 14 }, label: { color: '#475569', fontSize: 11, fontWeight: '900', marginBottom: 6, textTransform: 'uppercase' }, input: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC', paddingHorizontal: 13, color: '#0F172A' }, multiline: { minHeight: 90, paddingTop: 13, textAlignVertical: 'top' }, primaryButton: { minHeight: 50, borderRadius: 15, backgroundColor: '#0F766E', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 }, primaryText: { color: '#FFFFFF', fontWeight: '900' }, disabled: { opacity: 0.55 }, infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, infoCopy: { flex: 1 }, logoutButton: { minHeight: 50, borderRadius: 15, backgroundColor: '#FEF2F2', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, logoutText: { color: '#B91C1C', fontWeight: '900' },
});
