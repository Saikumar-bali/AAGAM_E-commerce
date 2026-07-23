import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, LogOut, Save, Store } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuthStore } from '@aagam/mobile-shared';
import { storeService } from '../../api/storeService';

export const StoreSettingsScreen = () => {
  const queryClient = useQueryClient();
  const logout = useAuthStore((state) => state.logout);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const storesQuery = useQuery({
    queryKey: ['my-stores'],
    queryFn: storeService.getMyStores,
  });
  const stores = Array.isArray(storesQuery.data) ? storesQuery.data : [];
  const selected = stores.find((store: any) => store.id === selectedId) || stores[0];

  useEffect(() => {
    if (!selected) return;
    setSelectedId(selected.id);
    setName(selected.name || '');
    setAddress(selected.address || '');
    setPhone(selected.phone || '');
  }, [selected?.id]);

  const save = async () => {
    if (!selected) return;
    if (!name.trim() || !address.trim() || !phone.trim()) {
      Alert.alert('Missing details', 'Store name, address, and phone are required.');
      return;
    }
    const digitsOnly = phone.replace(/\D/g, '');
    if (!/^\d{10}$/.test(digitsOnly)) {
      Alert.alert('Invalid phone', 'Phone number must be exactly 10 digits.');
      return;
    }
    setSaving(true);
    try {
      await storeService.updateStore(selected.id, {
        name: name.trim(),
        address: address.trim(),
        phone: phone.trim(),
      });
      await queryClient.invalidateQueries({ queryKey: ['my-stores'] });
      Alert.alert('Store updated', 'The customer and operations apps now use the updated store details.');
    } catch (error: any) {
      Alert.alert('Update failed', error?.response?.data?.message || error?.message || 'Could not update the store.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Store size={30} color="#5EEAD4" />
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>STORE SETTINGS</Text>
          <Text style={styles.title}>Store profile</Text>
          <Text style={styles.subtitle}>Maintain customer-facing identity and operational contact details.</Text>
        </View>
      </View>

      {storesQuery.isLoading ? (
        <View style={styles.center}><ActivityIndicator color="#0F766E" /><Text style={styles.muted}>Loading assigned stores…</Text></View>
      ) : stores.length === 0 ? (
        <View style={styles.card}><Text style={styles.cardTitle}>No assigned store</Text><Text style={styles.cardText}>An admin must assign a store before settings can be changed.</Text></View>
      ) : (
        <>
          {stores.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storeRow}>
              {stores.map((store: any) => (
                <TouchableOpacity key={store.id} onPress={() => setSelectedId(store.id)} style={[styles.storeChip, selected?.id === store.id && styles.storeChipActive]}>
                  <Text style={[styles.storeChipText, selected?.id === store.id && styles.storeChipTextActive]}>{store.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : null}

          <View style={styles.card}>
            <Field label="Store name" value={name} onChangeText={setName} />
            <Field label="Store phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            <Field label="Store address" value={address} onChangeText={setAddress} multiline />
            <TouchableOpacity onPress={() => void save()} disabled={saving} style={[styles.primaryButton, saving && styles.disabled]}>
              {saving ? <ActivityIndicator color="#FFFFFF" /> : <><Save size={18} color="#FFFFFF" /><Text style={styles.primaryText}>Save store profile</Text></>}
            </TouchableOpacity>
          </View>
        </>
      )}

      <View style={styles.card}>
        <View style={styles.infoRow}><BellRing size={21} color="#0F766E" /><View style={styles.infoCopy}><Text style={styles.cardTitle}>Operational notifications</Text><Text style={styles.cardText}>After login, this device registers for new-order, picking, dispatch, failure, and delivery alerts. Android notification permission must remain enabled.</Text></View></View>
      </View>

      <TouchableOpacity onPress={() => void logout()} style={styles.logoutButton}><LogOut size={18} color="#B91C1C" /><Text style={styles.logoutText}>Sign out of partner app</Text></TouchableOpacity>
    </ScrollView>
  );
};

function Field({ label, value, onChangeText, keyboardType, multiline }: { label: string; value: string; onChangeText: (value: string) => void; keyboardType?: any; multiline?: boolean }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} keyboardType={keyboardType} multiline={multiline} style={[styles.input, multiline && styles.multiline]} placeholderTextColor="#94A3B8" /></View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F8FAFC' }, content: { padding: 18, paddingTop: 54, paddingBottom: 120 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 24, backgroundColor: '#0F172A', padding: 20, marginBottom: 16 }, heroCopy: { flex: 1 }, eyebrow: { color: '#5EEAD4', fontSize: 11, fontWeight: '900', letterSpacing: 1.3 }, title: { marginTop: 5, color: '#FFFFFF', fontSize: 24, fontWeight: '900' }, subtitle: { marginTop: 5, color: '#CBD5E1', fontSize: 12, lineHeight: 18 },
  center: { padding: 36, alignItems: 'center', gap: 10 }, muted: { color: '#64748B', fontWeight: '700' },
  storeRow: { gap: 8, paddingBottom: 12 }, storeChip: { borderRadius: 999, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', paddingHorizontal: 14, paddingVertical: 10 }, storeChipActive: { borderColor: '#0F766E', backgroundColor: '#F0FDFA' }, storeChipText: { color: '#475569', fontWeight: '800' }, storeChipTextActive: { color: '#0F766E' },
  card: { borderRadius: 22, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 18, marginBottom: 14 }, cardTitle: { color: '#0F172A', fontSize: 16, fontWeight: '900' }, cardText: { marginTop: 5, color: '#64748B', fontSize: 12, lineHeight: 18 },
  field: { marginBottom: 13 }, label: { marginBottom: 6, color: '#475569', fontSize: 11, fontWeight: '900', letterSpacing: 0.7, textTransform: 'uppercase' }, input: { borderRadius: 14, borderWidth: 1, borderColor: '#CBD5E1', paddingHorizontal: 14, paddingVertical: 12, color: '#0F172A', fontWeight: '700' }, multiline: { minHeight: 90, textAlignVertical: 'top' },
  primaryButton: { minHeight: 50, borderRadius: 15, backgroundColor: '#0F766E', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 }, primaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' }, disabled: { opacity: 0.5 },
  infoRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' }, infoCopy: { flex: 1 },
  logoutButton: { minHeight: 50, borderRadius: 15, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 }, logoutText: { color: '#B91C1C', fontWeight: '900' },
});
