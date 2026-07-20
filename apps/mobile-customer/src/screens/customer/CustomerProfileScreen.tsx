import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import { useNavigation } from '@react-navigation/native';
import {
  LeafletMap,
  apiClient,
  registerDeviceToken,
  useAuthStore,
} from '@aagam/mobile-shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getUserSafeError, notify } from '../../ui/notify';

const emptyDraft = {
  label: 'Home',
  recipientName: '',
  phoneE164: '',
  alternatePhoneE164: '',
  line1: '',
  line2: '',
  landmark: '',
  city: '',
  state: '',
  pincode: '',
  country: 'IN',
  latitude: '',
  longitude: '',
  instructions: '',
  isDefault: false,
};

export const CustomerProfileScreen = () => {
  const navigation = useNavigation<any>();
  const { user, logout } = useAuthStore();
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);

  const { data: profile } = useQuery<any>({
    queryKey: ['customer-profile'],
    queryFn: async () => (await apiClient.get('/auth/me')).data,
    initialData: user || undefined,
    staleTime: 30_000,
  });
  const displayProfile = profile || user;

  const {
    data: addresses = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['profile-addresses'],
    queryFn: async () => (await apiClient.get('/customer/addresses')).data || [],
  });
  const { data: orders = [] } = useQuery({
    queryKey: ['profile-orders-summary'],
    queryFn: async () => (await apiClient.get('/orders/my')).data || [],
  });
  const { data: notifications } = useQuery({
    queryKey: ['profile-notifications-summary'],
    queryFn: async () => (await apiClient.get('/notifications/inbox')).data || { unreadCount: 0 },
  });

  const activeOrders = useMemo(
    () => orders.filter((order: any) => !['DELIVERED', 'CANCELLED'].includes(order.status)).length,
    [orders],
  );

  const saveAddressMutation = useMutation({
    mutationFn: async () => apiClient.post('/customer/addresses', {
      ...draft,
      latitude: Number(draft.latitude),
      longitude: Number(draft.longitude),
    }),
    onSuccess: async () => {
      setDraft(emptyDraft);
      setShowForm(false);
      await refetch();
      notify.success('Address saved', 'Your delivery address is ready to use.');
    },
    onError: (error: unknown) => notify.error('Could not save address', getUserSafeError(error, 'Please check the form.')),
  });
  const deleteAddressMutation = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/customer/addresses/${id}`),
    onSuccess: async () => {
      await refetch();
      notify.success('Address removed');
    },
    onError: (error: unknown) => notify.error('Could not remove address', getUserSafeError(error, 'Please try again.')),
  });
  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => apiClient.patch(`/customer/addresses/${id}`, { isDefault: true }),
    onSuccess: async () => {
      await refetch();
      notify.success('Default address updated');
    },
    onError: (error: unknown) => notify.error('Could not update address', getUserSafeError(error, 'Please try again.')),
  });

  const requestLocationPermission = async () => {
    if (Platform.OS !== 'android') return true;
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: 'Allow delivery location',
        message: 'AAGAM uses your location to pin delivery addresses accurately.',
        buttonPositive: 'Allow',
        buttonNegative: 'Not now',
      },
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  };

  const reverseGeocode = async (latitude: number, longitude: number) => {
    try {
      const response = await apiClient.get('/geo/reverse', { params: { lat: latitude, lng: longitude } });
      const address = response.data?.address;
      if (response.data?.ok && address) {
        setDraft((previous) => ({
          ...previous,
          line1: previous.line1 || address.line1 || '',
          landmark: previous.landmark || address.landmark || '',
          city: previous.city || address.city || '',
          state: previous.state || address.state || '',
          pincode: previous.pincode || address.pincode || '',
        }));
      }
    } catch {
      notify.info('Address details unavailable', 'The pin was saved. Enter the address details manually.');
    }
  };

  const setPinnedLocation = async (latitude: number, longitude: number) => {
    setDraft((previous) => ({ ...previous, latitude: String(latitude), longitude: String(longitude) }));
    await reverseGeocode(latitude, longitude);
  };

  const useCurrentLocation = async () => {
    const granted = await requestLocationPermission();
    if (!granted) {
      notify.warning('Location permission needed', 'Allow location permission or tap the map to pin manually.');
      return;
    }
    Geolocation.getCurrentPosition(
      (position) => void setPinnedLocation(position.coords.latitude, position.coords.longitude),
      () => notify.error('Location unavailable', 'Could not get your current location. Tap the map to pin manually.'),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 10_000 },
    );
  };

  const confirmDeleteAddress = (address: any) => Alert.alert(
    'Delete address?',
    `Remove ${address.label || 'this address'} from your profile?`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteAddressMutation.mutate(address.id) },
    ],
  );

  const confirmLogout = () => Alert.alert(
    'Sign out?',
    'You will need to sign in again to continue shopping.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void logout() },
    ],
  );

  const enablePush = async () => {
    try {
      await registerDeviceToken();
      notify.success('Notifications enabled', 'This device can receive AAGAM updates.');
    } catch (error) {
      notify.error('Could not enable notifications', getUserSafeError(error, 'Check notification permission and try again.'));
    }
  };

  const showAccountSecurity = () => notify.info(
    'Account security',
    isGoogleProfile
      ? 'Your Google account profile, name, email, and photo are connected to AAGAM.'
      : 'Google sign-in is preferred. Email/password remains available as a fallback.',
  );

  const pinnedLatitude = Number(draft.latitude) || 17.385;
  const pinnedLongitude = Number(draft.longitude) || 78.4867;
  const hasPinnedLocation = Boolean(draft.latitude && draft.longitude);
  const avatarUrl = displayProfile?.avatarUrl;
  const profileInitial = (displayProfile?.name || displayProfile?.email || 'C').slice(0, 1).toUpperCase();
  const isGoogleProfile = Boolean(avatarUrl);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.heroCard}>
        <TouchableOpacity style={styles.headerLogout} onPress={confirmLogout}><Text style={styles.headerLogoutText}>↪</Text></TouchableOpacity>
        {avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.avatarImage} /> : <View style={styles.avatar}><Text style={styles.avatarText}>{profileInitial}</Text></View>}
        <View style={styles.profileCopy}>
          <Text style={styles.name}>{displayProfile?.name || 'Customer'}</Text>
          <Text style={styles.email}>{displayProfile?.email}</Text>
          <View style={styles.accountBadge}><Text style={styles.accountBadgeText}>{isGoogleProfile ? 'Google profile connected' : displayProfile?.emailVerified ? 'Verified customer account' : 'Customer account'}</Text></View>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}><Text style={styles.statValue}>{orders.length}</Text><Text style={styles.statLabel}>Orders</Text></View>
        <View style={styles.statCard}><Text style={styles.statValue}>{activeOrders}</Text><Text style={styles.statLabel}>Active</Text></View>
        <View style={styles.statCard}><Text style={styles.statValue}>{notifications?.unreadCount || 0}</Text><Text style={styles.statLabel}>Alerts</Text></View>
      </View>

      <View style={styles.menuCard}>
        <MenuRow title="My Orders" subtitle="Track, reorder, and review deliveries" onPress={() => navigation.navigate('Orders')} />
        <MenuRow title="Alerts" subtitle="Order and support notifications" onPress={() => navigation.navigate('Alerts')} />
        <MenuRow title="Push Notifications" subtitle="Register this device for updates" onPress={() => void enablePush()} />
        <MenuRow title="Customer Support" subtitle="Open support from delivered order details" onPress={() => navigation.navigate('Orders')} />
        <MenuRow title="Account Security" subtitle={isGoogleProfile ? 'Google account is connected to this customer profile' : 'Google OAuth primary, email password fallback'} onPress={showAccountSecurity} />
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Saved Addresses</Text>
        <TouchableOpacity style={styles.linkButton} onPress={() => setShowForm((value) => !value)}><Text style={styles.linkButtonText}>{showForm ? 'Close' : 'Add New'}</Text></TouchableOpacity>
      </View>

      {isLoading ? <View style={styles.centered}><ActivityIndicator size="large" color="#0F766E" /></View> : addresses.length === 0 ? <View style={styles.emptyCard}><Text style={styles.emptyTitle}>No saved address</Text><Text style={styles.emptyText}>Add a delivery address before checkout.</Text></View> : addresses.map((address: any) => (
        <View key={address.id} style={styles.addressCard}>
          <View style={styles.addressTop}><Text style={styles.addressLabel}>{address.label || 'Address'} {address.isDefault ? '• Default' : ''}</Text>{!address.isDefault ? <TouchableOpacity onPress={() => setDefaultMutation.mutate(address.id)}><Text style={styles.smallAction}>Make default</Text></TouchableOpacity> : null}</View>
          <Text style={styles.addressName}>{address.recipientName}</Text>
          <Text style={styles.addressText}>{address.phoneE164}</Text>
          <Text style={styles.addressText}>{address.line1}{address.line2 ? `, ${address.line2}` : ''}</Text>
          <Text style={styles.addressText}>{address.city}, {address.state} - {address.pincode}</Text>
          <TouchableOpacity style={styles.deleteLink} onPress={() => confirmDeleteAddress(address)}><Text style={styles.deleteText}>Delete address</Text></TouchableOpacity>
        </View>
      ))}

      {showForm ? <View style={styles.formCard}>
        <Text style={styles.formTitle}>Add Address</Text>
        <View style={styles.locationPanel}>
          <TouchableOpacity style={styles.locationButton} onPress={() => void useCurrentLocation()}><Text style={styles.locationButtonText}>Use current location</Text></TouchableOpacity>
          <LeafletMap latitude={pinnedLatitude} longitude={pinnedLongitude} onPinChange={(latitude, longitude) => void setPinnedLocation(latitude, longitude)} />
          <Text style={styles.locationHelp}>{hasPinnedLocation ? `Pinned: ${pinnedLatitude.toFixed(5)}, ${pinnedLongitude.toFixed(5)}` : 'Tap the map or use current location to pin delivery point.'}</Text>
        </View>
        {[
          ['label', 'Label'], ['recipientName', 'Recipient Name'], ['phoneE164', 'Phone'], ['alternatePhoneE164', 'Alternate Phone'], ['line1', 'Address Line 1'], ['line2', 'Address Line 2'], ['landmark', 'Landmark'], ['city', 'City'], ['state', 'State'], ['pincode', 'Pincode'], ['instructions', 'Instructions'], ['latitude', 'Latitude'], ['longitude', 'Longitude'],
        ].map(([key, label]) => <TextInput key={key} value={(draft as any)[key]} onChangeText={(value) => setDraft((previous) => ({ ...previous, [key]: value }))} placeholder={label} placeholderTextColor="#94A3B8" style={styles.input} />)}
        <View style={styles.switchRow}><Text style={styles.switchText}>Set as default</Text><Switch value={draft.isDefault} onValueChange={(value) => setDraft((previous) => ({ ...previous, isDefault: value }))} /></View>
        <TouchableOpacity disabled={saveAddressMutation.isPending} style={[styles.saveButton, saveAddressMutation.isPending && styles.disabled]} onPress={() => saveAddressMutation.mutate()}><Text style={styles.saveButtonText}>{saveAddressMutation.isPending ? 'Saving...' : 'Save Address'}</Text></TouchableOpacity>
      </View> : null}
    </ScrollView>
  );
};

function MenuRow({ title, subtitle, onPress }: { title: string; subtitle: string; onPress: () => void }) {
  return <TouchableOpacity style={styles.menuRow} onPress={onPress}><View style={{ flex: 1 }}><Text style={styles.menuTitle}>{title}</Text><Text style={styles.menuSubtitle}>{subtitle}</Text></View><Text style={styles.chevron}>›</Text></TouchableOpacity>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' }, content: { padding: 16, paddingBottom: 170 }, centered: { paddingVertical: 24 }, disabled: { opacity: 0.55 },
  heroCard: { position: 'relative', flexDirection: 'row', gap: 14, alignItems: 'center', borderRadius: 26, backgroundColor: '#0F766E', padding: 20 }, headerLogout: { position: 'absolute', right: 14, top: 14, width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#CCFBF1', zIndex: 2 }, headerLogoutText: { color: '#115E59', fontSize: 22, fontWeight: '900' },
  avatar: { width: 64, height: 64, borderRadius: 22, backgroundColor: '#CCFBF1', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF' }, avatarImage: { width: 64, height: 64, borderRadius: 22, backgroundColor: '#CCFBF1', borderWidth: 2, borderColor: '#FFFFFF' }, avatarText: { color: '#115E59', fontSize: 26, fontWeight: '900' }, profileCopy: { flex: 1, paddingRight: 42 }, name: { fontSize: 24, fontWeight: '900', color: '#FFFFFF' }, email: { marginTop: 6, color: '#CCFBF1', fontWeight: '700' }, accountBadge: { alignSelf: 'flex-start', marginTop: 9, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.16)', paddingHorizontal: 10, paddingVertical: 5 }, accountBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 14 }, statCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 18, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' }, statValue: { fontSize: 22, fontWeight: '900', color: '#0F172A' }, statLabel: { marginTop: 4, color: '#64748B', fontSize: 12, fontWeight: '800' },
  menuCard: { marginTop: 16, backgroundColor: '#FFFFFF', borderRadius: 22, borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden' }, menuRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }, menuTitle: { color: '#0F172A', fontWeight: '900', fontSize: 15 }, menuSubtitle: { marginTop: 4, color: '#64748B', fontWeight: '700', fontSize: 12 }, chevron: { fontSize: 28, color: '#94A3B8', fontWeight: '300' },
  sectionHeader: { marginTop: 22, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, sectionTitle: { fontSize: 20, fontWeight: '900', color: '#0F172A' }, linkButton: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: '#CCFBF1' }, linkButtonText: { color: '#115E59', fontWeight: '900' },
  emptyCard: { marginTop: 12, borderRadius: 18, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', padding: 16 }, emptyTitle: { color: '#0F172A', fontWeight: '900' }, emptyText: { marginTop: 4, color: '#64748B' },
  addressCard: { marginTop: 12, backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#E2E8F0', padding: 16 }, addressTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }, addressLabel: { fontSize: 12, fontWeight: '900', color: '#0F766E', textTransform: 'uppercase', flex: 1 }, smallAction: { color: '#0F766E', fontWeight: '900', fontSize: 12 }, addressName: { marginTop: 6, fontSize: 16, fontWeight: '900', color: '#0F172A' }, addressText: { marginTop: 4, color: '#475569' }, deleteLink: { marginTop: 10, alignSelf: 'flex-start' }, deleteText: { color: '#DC2626', fontWeight: '900', fontSize: 12 },
  formCard: { marginTop: 16, backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#E2E8F0' }, formTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A', marginBottom: 12 }, locationPanel: { borderRadius: 18, backgroundColor: '#F0FDFA', borderWidth: 1, borderColor: '#CCFBF1', padding: 10, marginBottom: 12 }, locationButton: { alignItems: 'center', borderRadius: 14, backgroundColor: '#0F766E', paddingVertical: 12, marginBottom: 10 }, locationButtonText: { color: '#FFFFFF', fontWeight: '900' }, locationHelp: { marginTop: 8, color: '#115E59', fontWeight: '700', fontSize: 12, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, color: '#0F172A', marginBottom: 10 }, switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, marginBottom: 12 }, switchText: { color: '#0F172A', fontWeight: '700' }, saveButton: { backgroundColor: '#0F766E', borderRadius: 16, paddingVertical: 15, alignItems: 'center' }, saveButtonText: { color: '#FFFFFF', fontWeight: '900' },
});
