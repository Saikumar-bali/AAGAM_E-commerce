import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, PermissionsAndroid, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import Geolocation from 'react-native-geolocation-service';
import { useNavigation } from '@react-navigation/native';
import { LeafletMap, useAuthStore, apiClient, registerDeviceToken } from '@aagam/mobile-shared';
import { useMutation, useQuery } from '@tanstack/react-query';

const emptyDraft = { label: 'Home', recipientName: '', phoneE164: '', alternatePhoneE164: '', line1: '', line2: '', landmark: '', city: '', state: '', pincode: '', country: 'IN', latitude: '', longitude: '', instructions: '', isDefault: false };

export const CustomerProfileScreen = () => {
  const navigation = useNavigation<any>();
  const { user, logout } = useAuthStore();
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);

  const { data: addresses = [], isLoading, refetch } = useQuery({ queryKey: ['profile-addresses'], queryFn: async () => (await apiClient.get('/customer/addresses')).data || [] });
  const { data: orders = [] } = useQuery({ queryKey: ['profile-orders-summary'], queryFn: async () => (await apiClient.get('/orders/my')).data || [] });
  const { data: notifications } = useQuery({ queryKey: ['profile-notifications-summary'], queryFn: async () => (await apiClient.get('/notifications/inbox')).data || { unreadCount: 0 } });
  const activeOrders = useMemo(() => orders.filter((order: any) => !['DELIVERED', 'CANCELLED'].includes(order.status)).length, [orders]);

  const saveAddressMutation = useMutation({
    mutationFn: async () => apiClient.post('/customer/addresses', { ...draft, latitude: Number(draft.latitude), longitude: Number(draft.longitude) }),
    onSuccess: async () => { setDraft(emptyDraft); setShowForm(false); await refetch(); Toast.show({ type: 'success', text1: 'Address saved' }); },
    onError: (error: any) => Toast.show({ type: 'error', text1: 'Could not save address', text2: error.response?.data?.message || 'Please check the form.' }),
  });
  const deleteAddressMutation = useMutation({ mutationFn: async (id: string) => apiClient.delete(`/customer/addresses/${id}`), onSuccess: async () => { await refetch(); Toast.show({ type: 'success', text1: 'Address removed' }); } });
  const setDefaultMutation = useMutation({ mutationFn: async (id: string) => apiClient.patch(`/customer/addresses/${id}`, { isDefault: true }), onSuccess: async () => { await refetch(); Toast.show({ type: 'success', text1: 'Default address updated' }); } });

  const requestLocationPermission = async () => {
    if (Platform.OS !== 'android') return true;
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, { title: 'Allow delivery location', message: 'AAGAM uses your location to pin delivery addresses accurately.', buttonPositive: 'Allow', buttonNegative: 'Not now' });
    return result === PermissionsAndroid.RESULTS.GRANTED;
  };
  const reverseGeocode = async (latitude: number, longitude: number) => { try { const response = await apiClient.get('/geo/reverse', { params: { lat: latitude, lng: longitude } }); const address = response.data?.address; if (response.data?.ok && address) setDraft((prev) => ({ ...prev, line1: prev.line1 || address.line1 || '', landmark: prev.landmark || address.landmark || '', city: prev.city || address.city || '', state: prev.state || address.state || '', pincode: prev.pincode || '' })); } catch {} };
  const setPinnedLocation = async (latitude: number, longitude: number) => { setDraft((prev) => ({ ...prev, latitude: String(latitude), longitude: String(longitude) })); await reverseGeocode(latitude, longitude); };
  const useCurrentLocation = async () => { const ok = await requestLocationPermission(); if (!ok) return Alert.alert('Location permission needed', 'Allow location permission or tap the map to pin manually.'); Geolocation.getCurrentPosition((position) => setPinnedLocation(position.coords.latitude, position.coords.longitude), () => Alert.alert('Location error', 'Could not get current location.'), { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }); };
  const confirmDeleteAddress = (address: any) => Alert.alert('Delete address?', `Remove ${address.label || 'this address'} from your profile?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteAddressMutation.mutate(address.id) }]);
  const confirmLogout = () => Alert.alert('Sign out?', 'You will need to sign in again to continue shopping.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: logout }]);
  const enablePush = async () => { await registerDeviceToken(); Toast.show({ type: 'success', text1: 'Notification setup checked' }); };

  const pinnedLatitude = Number(draft.latitude) || 17.385;
  const pinnedLongitude = Number(draft.longitude) || 78.4867;
  const hasPinnedLocation = Boolean(draft.latitude && draft.longitude);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.heroCard}>
        <TouchableOpacity style={styles.headerLogout} onPress={confirmLogout}><Text style={styles.headerLogoutText}>↪</Text></TouchableOpacity>
        <View style={styles.avatar}><Text style={styles.avatarText}>{(user?.name || user?.email || 'C').slice(0, 1).toUpperCase()}</Text></View>
        <View style={{ flex: 1, paddingRight: 42 }}><Text style={styles.name}>{user?.name || 'Customer'}</Text><Text style={styles.email}>{user?.email}</Text></View>
      </View>

      <View style={styles.statsRow}><View style={styles.statCard}><Text style={styles.statValue}>{orders.length}</Text><Text style={styles.statLabel}>Orders</Text></View><View style={styles.statCard}><Text style={styles.statValue}>{activeOrders}</Text><Text style={styles.statLabel}>Active</Text></View><View style={styles.statCard}><Text style={styles.statValue}>{notifications?.unreadCount || 0}</Text><Text style={styles.statLabel}>Alerts</Text></View></View>

      <View style={styles.menuCard}>
        <MenuRow title="My Orders" subtitle="Track, reorder, and review deliveries" onPress={() => navigation.navigate('Orders')} />
        <MenuRow title="Alerts" subtitle="Order and support notifications" onPress={() => navigation.navigate('Alerts')} />
        <MenuRow title="Push Notifications" subtitle="Register this device for updates" onPress={enablePush} />
        <MenuRow title="Customer Support" subtitle="Open support from delivered order details" onPress={() => navigation.navigate('Orders')} />
        <MenuRow title="Account Security" subtitle="Google OAuth primary, email password fallback" onPress={() => Alert.alert('Account security', 'Google sign-in is the preferred customer login. Email/password remains available as fallback.')} />
      </View>

      <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Saved Addresses</Text><TouchableOpacity style={styles.linkButton} onPress={() => setShowForm((value) => !value)}><Text style={styles.linkButtonText}>{showForm ? 'Close' : 'Add New'}</Text></TouchableOpacity></View>
      {isLoading ? <View style={styles.centered}><ActivityIndicator size="large" color="#0F766E" /></View> : addresses.length === 0 ? <View style={styles.emptyCard}><Text style={styles.emptyTitle}>No saved address</Text><Text style={styles.emptyText}>Add a delivery address before checkout.</Text></View> : addresses.map((address: any) => <View key={address.id} style={styles.addressCard}><View style={styles.addressTop}><Text style={styles.addressLabel}>{address.label || 'Address'} {address.isDefault ? '• Default' : ''}</Text>{!address.isDefault ? <TouchableOpacity onPress={() => setDefaultMutation.mutate(address.id)}><Text style={styles.smallAction}>Make default</Text></TouchableOpacity> : null}</View><Text style={styles.addressName}>{address.recipientName}</Text><Text style={styles.addressText}>{address.phoneE164}</Text><Text style={styles.addressText}>{address.line1}{address.line2 ? `, ${address.line2}` : ''}</Text><Text style={styles.addressText}>{address.city}, {address.state} - {address.pincode}</Text><TouchableOpacity style={styles.deleteLink} onPress={() => confirmDeleteAddress(address)}><Text style={styles.deleteText}>Delete address</Text></TouchableOpacity></View>)}

      {showForm ? <View style={styles.formCard}><Text style={styles.formTitle}>Add Address</Text><View style={styles.locationPanel}><TouchableOpacity style={styles.locationButton} onPress={useCurrentLocation}><Text style={styles.locationButtonText}>Use current location</Text></TouchableOpacity><LeafletMap latitude={pinnedLatitude} longitude={pinnedLongitude} onPinChange={(lat, lng) => setPinnedLocation(lat, lng)} /><Text style={styles.locationHelp}>{hasPinnedLocation ? `Pinned: ${pinnedLatitude.toFixed(5)}, ${pinnedLongitude.toFixed(5)}` : 'Tap the map or use current location to pin delivery point.'}</Text></View>{[['label', 'Label'], ['recipientName', 'Recipient Name'], ['phoneE164', 'Phone'], ['alternatePhoneE164', 'Alternate Phone'], ['line1', 'Address Line 1'], ['line2', 'Address Line 2'], ['landmark', 'Landmark'], ['city', 'City'], ['state', 'State'], ['pincode', 'Pincode'], ['instructions', 'Instructions'], ['latitude', 'Latitude'], ['longitude', 'Longitude']].map(([key, label]) => <TextInput key={key} value={(draft as any)[key]} onChangeText={(value) => setDraft((prev) => ({ ...prev, [key]: value }))} placeholder={label} placeholderTextColor="#94A3B8" style={styles.input} />)}<View style={styles.switchRow}><Text style={styles.switchText}>Set as default</Text><Switch value={draft.isDefault} onValueChange={(value) => setDraft((prev) => ({ ...prev, isDefault: value }))} /></View><TouchableOpacity style={styles.saveButton} onPress={() => saveAddressMutation.mutate()}><Text style={styles.saveButtonText}>{saveAddressMutation.isPending ? 'Saving...' : 'Save Address'}</Text></TouchableOpacity></View> : null}
    </ScrollView>
  );
};

function MenuRow({ title, subtitle, onPress }: { title: string; subtitle: string; onPress: () => void }) { return <TouchableOpacity style={styles.menuRow} onPress={onPress}><View style={{ flex: 1 }}><Text style={styles.menuTitle}>{title}</Text><Text style={styles.menuSubtitle}>{subtitle}</Text></View><Text style={styles.chevron}>›</Text></TouchableOpacity>; }

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' }, content: { padding: 16, paddingBottom: 170 }, centered: { paddingVertical: 24 },
  heroCard: { position: 'relative', flexDirection: 'row', gap: 14, alignItems: 'center', borderRadius: 26, backgroundColor: '#0F766E', padding: 20 },
  headerLogout: { position: 'absolute', right: 14, top: 14, width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#CCFBF1' }, headerLogoutText: { color: '#115E59', fontSize: 22, fontWeight: '900' },
  avatar: { width: 56, height: 56, borderRadius: 20, backgroundColor: '#CCFBF1', alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#115E59', fontSize: 24, fontWeight: '900' }, name: { fontSize: 24, fontWeight: '900', color: '#FFFFFF' }, email: { marginTop: 6, color: '#CCFBF1', fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 14 }, statCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 18, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' }, statValue: { fontSize: 22, fontWeight: '900', color: '#0F172A' }, statLabel: { marginTop: 4, color: '#64748B', fontSize: 12, fontWeight: '800' },
  menuCard: { marginTop: 16, backgroundColor: '#FFFFFF', borderRadius: 22, borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden' }, menuRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }, menuTitle: { color: '#0F172A', fontWeight: '900', fontSize: 15 }, menuSubtitle: { marginTop: 4, color: '#64748B', fontWeight: '700', fontSize: 12 }, chevron: { fontSize: 28, color: '#94A3B8', fontWeight: '300' },
  sectionHeader: { marginTop: 22, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, sectionTitle: { fontSize: 20, fontWeight: '900', color: '#0F172A' }, linkButton: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: '#CCFBF1' }, linkButtonText: { color: '#115E59', fontWeight: '900' },
  emptyCard: { marginTop: 12, borderRadius: 18, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', padding: 16 }, emptyTitle: { color: '#0F172A', fontWeight: '900' }, emptyText: { marginTop: 4, color: '#64748B' },
  addressCard: { marginTop: 12, backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#E2E8F0', padding: 16 }, addressTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }, addressLabel: { fontSize: 12, fontWeight: '900', color: '#0F766E', textTransform: 'uppercase', flex: 1 }, smallAction: { color: '#0F766E', fontWeight: '900', fontSize: 12 }, addressName: { marginTop: 6, fontSize: 16, fontWeight: '900', color: '#0F172A' }, addressText: { marginTop: 4, color: '#475569' }, deleteLink: { marginTop: 10, alignSelf: 'flex-start' }, deleteText: { color: '#DC2626', fontWeight: '900', fontSize: 12 },
  formCard: { marginTop: 16, backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#E2E8F0' }, formTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A', marginBottom: 12 }, locationPanel: { borderRadius: 18, backgroundColor: '#F0FDFA', borderWidth: 1, borderColor: '#CCFBF1', padding: 10, marginBottom: 12 }, locationButton: { alignItems: 'center', borderRadius: 14, backgroundColor: '#0F766E', paddingVertical: 12, marginBottom: 10 }, locationButtonText: { color: '#FFFFFF', fontWeight: '900' }, locationHelp: { marginTop: 8, color: '#115E59', fontWeight: '700', fontSize: 12, textAlign: 'center' }, input: { borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, color: '#0F172A', marginBottom: 10 }, switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, marginBottom: 12 }, switchText: { color: '#0F172A', fontWeight: '700' }, saveButton: { backgroundColor: '#0F766E', borderRadius: 16, paddingVertical: 15, alignItems: 'center' }, saveButtonText: { color: '#FFFFFF', fontWeight: '900' },
});