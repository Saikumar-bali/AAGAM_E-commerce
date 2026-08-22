import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
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
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Headphones,
  MapPin,
  Pencil,
  Plus,
  ShieldCheck,
  Smartphone,
  ShoppingCart,
  Trash2,
} from 'lucide-react-native';
import {
  LeafletMap,
  apiClient,
  registerDeviceToken,
  useAuthStore,
} from '@aagam/mobile-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getUserSafeError, notify } from '../../ui/notify';
import { AagamBrand } from '../../components/AagamBrand';
import { CUSTOMER_ADDRESSES_QUERY_KEY } from '../../utils/addressQueries';

type LocationSource = 'LIVE_GPS' | 'MAP_PIN' | 'GEOCODED' | 'LEGACY_UNKNOWN';
type LocalityOption = {
  id: string; name: string; aliases: string[]; city: string; state: string; pincode: string;
  latitude: number | null; longitude: number | null;
};

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
  locationSource: 'GEOCODED' as LocationSource,
  locationAccuracyMetres: '',
  locationCapturedAt: '',
  instructions: '',
  isDefault: false,
  selectedLocalityId: '',
};

type AddressDraftKey = keyof typeof emptyDraft;
type AddressErrorKey = 'recipientName' | 'phoneE164' | 'alternatePhoneE164' | 'line1' | 'city' | 'state' | 'pincode' | 'locality' | 'location';
type AddressErrors = Partial<Record<AddressErrorKey, string>>;

const addressFields: Array<{ key: AddressDraftKey; label: string; required?: boolean }> = [
  { key: 'label', label: 'Label' },
  { key: 'recipientName', label: 'Recipient Name', required: true },
  { key: 'phoneE164', label: 'Phone', required: true },
  { key: 'alternatePhoneE164', label: 'Alternate Phone' },
  { key: 'line1', label: 'Address Line 1', required: true },
  { key: 'line2', label: 'Address Line 2' },
  { key: 'landmark', label: 'Landmark' },
  { key: 'city', label: 'City', required: true },
  { key: 'state', label: 'State', required: true },
  { key: 'pincode', label: 'Pincode', required: true },
  { key: 'instructions', label: 'Instructions' },
];

const draftFromAddress = (address: any) => ({
  ...emptyDraft,
  label: String(address?.label || emptyDraft.label),
  recipientName: String(address?.recipientName || ''),
  phoneE164: String(address?.phoneE164 || ''),
  alternatePhoneE164: String(address?.alternatePhoneE164 || ''),
  line1: String(address?.line1 || ''),
  line2: String(address?.line2 || ''),
  landmark: String(address?.landmark || ''),
  city: String(address?.city || ''),
  state: String(address?.state || ''),
  pincode: String(address?.pincode || ''),
  country: String(address?.country || 'IN'),
  latitude: address?.latitude == null ? '' : String(address.latitude),
  longitude: address?.longitude == null ? '' : String(address.longitude),
  locationSource: (['LIVE_GPS', 'MAP_PIN', 'GEOCODED', 'LEGACY_UNKNOWN'].includes(address?.locationSource)
    ? address.locationSource
    : 'LEGACY_UNKNOWN') as LocationSource,
  locationAccuracyMetres: address?.locationAccuracyMetres == null ? '' : String(address.locationAccuracyMetres),
  locationCapturedAt: String(address?.locationCapturedAt || ''),
  instructions: String(address?.instructions || ''),
  isDefault: Boolean(address?.isDefault),
  selectedLocalityId: '',
});

function validPhone(value: string) {
  const compact = value.trim().replace(/[\s().-]/g, '');
  return /^(\+?[1-9]\d{7,14}|\d{10})$/.test(compact);
}

function locationLabel(source?: LocationSource) {
  if (source === 'LIVE_GPS') return 'GPS verified';
  if (source === 'MAP_PIN') return 'Exact map pin';
  if (source === 'GEOCODED') return 'Manual address';
  return 'Legacy saved location';
}

export const CustomerProfileScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const queryClient = useQueryClient();
  const { user, logout } = useAuthStore();
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [addressErrors, setAddressErrors] = useState<AddressErrors>({});
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [localities, setLocalities] = useState<LocalityOption[]>([]);
  const [localitiesLoading, setLocalitiesLoading] = useState(false);
  const [localityModalVisible, setLocalityModalVisible] = useState(false);

  useEffect(() => {
    let active = true;
    setLocalitiesLoading(true);
    apiClient
      .get('/localities')
      .then((response) => {
        if (active) setLocalities(Array.isArray(response.data) ? response.data : []);
      })
      .catch(() => {})
      .finally(() => active && setLocalitiesLoading(false));
    return () => { active = false; };
  }, []);

  const applyLocality = (localityId: string) => {
    setLocalityModalVisible(false);
    setDraft((d) => ({ ...d, selectedLocalityId: localityId }));
    const locality = localities.find((entry) => entry.id === localityId);
    if (!locality) return;
    setDraft((d) => ({
      ...d,
      selectedLocalityId: localityId,
      city: locality.city,
      state: locality.state,
      pincode: locality.pincode,
      latitude: locality.latitude != null ? String(locality.latitude) : d.latitude,
      longitude: locality.longitude != null ? String(locality.longitude) : d.longitude,
    }));
  };

  const filteredLocalities = useMemo(() => {
    const pincodeFilter = /^\d{6}$/.test(draft.pincode.trim()) ? draft.pincode.trim() : null;
    const cityFilter = draft.city.trim().toLowerCase();
    return localities.filter((entry) => {
      if (pincodeFilter && entry.pincode !== pincodeFilter) return false;
      if (cityFilter && !entry.city.toLowerCase().includes(cityFilter)) return false;
      return true;
    });
  }, [draft.pincode, draft.city, localities]);

  const selectedLocalityName = useMemo(() => {
    const match = localities.find((l) => l.id === draft.selectedLocalityId);
    return match ? `${match.name} — ${match.pincode}` : '';
  }, [localities, draft.selectedLocalityId]);

  useEffect(() => {
    if (!route.params?.openAddressForm) return;
    const address = route.params.address;
    setEditingAddressId(address?.id || null);
    setDraft(address ? draftFromAddress(address) : emptyDraft);
    setAddressErrors({});
    setShowForm(true);
    navigation.setParams({ openAddressForm: undefined, address: undefined });
  }, [navigation, route.params?.openAddressForm, route.params?.address?.id]);

  const { data: profile } = useQuery<any>({
    queryKey: ['customer-profile'],
    queryFn: async () => (await apiClient.get('/auth/me')).data,
    initialData: user || undefined,
    staleTime: 30_000,
  });
  const displayProfile = profile || user;

  const { data: addresses = [], isLoading } = useQuery({
    queryKey: CUSTOMER_ADDRESSES_QUERY_KEY,
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
    mutationFn: async () => {
      const basePayload: any = {
        label: draft.label,
        recipientName: draft.recipientName,
        phoneE164: draft.phoneE164,
        ...(editingAddressId
          ? { alternatePhoneE164: draft.alternatePhoneE164.trim() || null }
          : draft.alternatePhoneE164.trim()
            ? { alternatePhoneE164: draft.alternatePhoneE164.trim() }
            : {}),
        line1: draft.line1,
        line2: draft.line2,
        landmark: draft.landmark,
        city: draft.city,
        state: draft.state,
        pincode: draft.pincode,
        country: draft.country,
        instructions: draft.instructions,
        isDefault: draft.isDefault,
      };
      if (draft.locationSource === 'LIVE_GPS') {
        basePayload.locationSource = 'LIVE_GPS';
        basePayload.latitude = Number(draft.latitude);
        basePayload.longitude = Number(draft.longitude);
        basePayload.locationAccuracyMetres = Number(draft.locationAccuracyMetres);
        basePayload.locationCapturedAt = draft.locationCapturedAt;
      } else if (draft.locationSource === 'MAP_PIN') {
        basePayload.locationSource = 'MAP_PIN';
        basePayload.latitude = Number(draft.latitude);
        basePayload.longitude = Number(draft.longitude);
      } else if (draft.locationSource === 'GEOCODED') {
        basePayload.locationSource = 'GEOCODED';
      }
      return editingAddressId
        ? apiClient.patch(`/customer/addresses/${editingAddressId}`, basePayload)
        : apiClient.post('/customer/addresses', basePayload);
    },
    onSuccess: async () => {
      setDraft(emptyDraft);
      setAddressErrors({});
      setShowForm(false);
      setEditingAddressId(null);
      await queryClient.invalidateQueries({ queryKey: CUSTOMER_ADDRESSES_QUERY_KEY });
      notify.success(editingAddressId ? 'Address updated' : 'Address saved', 'Your delivery address is ready to use.');
    },
    onError: (error: unknown) => notify.error('Could not save address', getUserSafeError(error, 'Please check the form.')),
  });
  const deleteAddressMutation = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/customer/addresses/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CUSTOMER_ADDRESSES_QUERY_KEY });
      notify.success('Address removed');
    },
    onError: (error: unknown) => notify.error('Could not remove address', getUserSafeError(error, 'Please try again.')),
  });
  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => apiClient.patch(`/customer/addresses/${id}`, { isDefault: true }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CUSTOMER_ADDRESSES_QUERY_KEY });
      notify.success('Default address updated');
    },
    onError: (error: unknown) => notify.error('Could not update address', getUserSafeError(error, 'Please try again.')),
  });

  const clearAddressError = (key: AddressDraftKey | 'location') => {
    setAddressErrors((current) => ({ ...current, [key]: undefined }));
  };

  const validateAddress = () => {
    const next: AddressErrors = {};
    if (draft.recipientName.trim().length < 2) next.recipientName = 'Recipient name is required (at least 2 characters).';
    if (!validPhone(draft.phoneE164)) next.phoneE164 = 'Enter a valid required phone number.';
    if (draft.alternatePhoneE164.trim() && !validPhone(draft.alternatePhoneE164)) next.alternatePhoneE164 = 'Enter a valid alternate phone number or leave it blank.';
    if (draft.line1.trim().length < 3) next.line1 = 'Address Line 1 is required (at least 3 characters).';
    if (draft.city.trim().length < 2) next.city = 'City is required.';
    if (draft.state.trim().length < 2) next.state = 'State is required.';
    if (!/^\d{6}$/.test(draft.pincode.trim())) next.pincode = 'A valid 6 digit pincode is required.';
    if (draft.locationSource === 'GEOCODED' && !draft.selectedLocalityId) {
      next.locality = 'Select a serviceable locality for your delivery area.';
    }
    if (draft.locationSource === 'LIVE_GPS' || draft.locationSource === 'MAP_PIN') {
      const latitude = Number(draft.latitude);
      const longitude = Number(draft.longitude);
      if (!draft.latitude.trim() || !draft.longitude.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        next.location = 'Capture live GPS or choose an exact point on the map.';
      }
    }
    if (draft.locationSource === 'LIVE_GPS' && (!draft.locationAccuracyMetres || !draft.locationCapturedAt)) {
      next.location = 'Capture your current location again to save a GPS-verified address.';
    }
    setAddressErrors(next);
    return Object.keys(next).length === 0;
  };

  const saveAddress = () => {
    if (!validateAddress()) {
      notify.warning('Complete required address fields', 'Fields marked in red must be corrected before saving.');
      return;
    }
    saveAddressMutation.mutate();
  };

  const requestLocationPermission = async () => {
    if (Platform.OS !== 'android') return true;
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: 'Allow delivery location',
        message: 'Aagaam uses your location to pin delivery addresses accurately.',
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
      notify.info('Address details unavailable', 'The delivery point was saved. Enter the address details manually.');
    }
  };

  const setPinnedLocation = async (
    latitude: number,
    longitude: number,
    source: 'LIVE_GPS' | 'MAP_PIN',
    accuracyMetres?: number,
  ) => {
    clearAddressError('location');
    setDraft((previous) => ({
      ...previous,
      latitude: String(latitude),
      longitude: String(longitude),
      locationSource: source,
      locationAccuracyMetres: source === 'LIVE_GPS' && accuracyMetres != null ? String(accuracyMetres) : '',
      locationCapturedAt: source === 'LIVE_GPS' ? new Date().toISOString() : '',
    }));
    await reverseGeocode(latitude, longitude);
  };

  const useCurrentLocation = async () => {
    const granted = await requestLocationPermission();
    if (!granted) {
      notify.warning('Location permission needed', 'Allow location permission, pin the map, or enter the address manually.');
      return;
    }
    Geolocation.getCurrentPosition(
      (position) => void setPinnedLocation(
        position.coords.latitude,
        position.coords.longitude,
        'LIVE_GPS',
        position.coords.accuracy,
      ),
      () => notify.error('Location unavailable', 'Pin the map or use manual address mode instead.'),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 10_000 },
    );
  };

  const useManualAddress = () => {
    clearAddressError('location');
    setDraft((previous) => ({
      ...previous,
      locationSource: 'GEOCODED',
      latitude: '',
      longitude: '',
      locationAccuracyMetres: '',
      locationCapturedAt: '',
    }));
  };

  const confirmDeleteAddress = (address: any) => Alert.alert(
    'Delete address?',
    `Remove ${address.label || 'this address'} from your profile?`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteAddressMutation.mutate(address.id) },
    ],
  );

  const editAddress = (address: any) => {
    setEditingAddressId(address.id);
    const draft = draftFromAddress(address);
    const matchedLocality = localities.find(
      (loc) => loc.city.toLowerCase() === (address?.city || '').toLowerCase() && loc.pincode === (address?.pincode || ''),
    );
    setDraft({ ...draft, selectedLocalityId: matchedLocality?.id || '' });
    setAddressErrors({});
    setShowForm(true);
  };

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
      notify.success('Notifications enabled', 'This device can receive Aagaam updates.');
    } catch (error) {
      notify.error('Could not enable notifications', getUserSafeError(error, 'Check notification permission and try again.'));
    }
  };

  const showAccountSecurity = () => notify.info(
    'Account security',
    isGoogleProfile
      ? 'Your Google account profile, name, email, and photo are connected to Aagaam.'
      : 'Google sign-in is preferred. Email/password remains available as a fallback.',
  );

  const pinnedLatitude = Number(draft.latitude) || 17.385;
  const pinnedLongitude = Number(draft.longitude) || 78.4867;
  const hasPinnedLocation = Boolean(draft.latitude && draft.longitude);
  const avatarUrl = displayProfile?.avatarUrl;
  const profileInitial = (displayProfile?.name || displayProfile?.email || 'C').slice(0, 1).toUpperCase();
  const isGoogleProfile = Boolean(avatarUrl);
  const locationHasError = Boolean(addressErrors.location);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.topHeader}><AagamBrand compact /><View style={styles.headerActions}><TouchableOpacity style={styles.topIcon} onPress={() => navigation.navigate('Alerts')} accessibilityLabel="Open notifications"><Bell size={21} color="#0F766E" /></TouchableOpacity><TouchableOpacity style={styles.topCart} onPress={() => navigation.navigate('Cart')} accessibilityLabel="Open cart"><ShoppingCart size={22} color="#115E59" /></TouchableOpacity></View></View>
      <Text style={styles.profileHeading}>My Profile</Text>
      <Text style={styles.profileSubtitle}>Manage your account and preferences</Text>
      <View style={styles.heroCard}>
        <TouchableOpacity style={styles.headerLogout} onPress={confirmLogout}><Text style={styles.headerLogoutText}>↪</Text></TouchableOpacity>
        {avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.avatarImage} /> : <View style={styles.avatar}><Text style={styles.avatarText}>{profileInitial}</Text></View>}
        <View style={styles.profileCopy}><Text style={styles.name}>{displayProfile?.name || 'Customer'}</Text><Text style={styles.email}>{displayProfile?.email}</Text><View style={styles.accountBadge}><Text style={styles.accountBadgeText}>{isGoogleProfile ? 'Google profile connected' : displayProfile?.emailVerified ? 'Verified customer account' : 'Customer account'}</Text></View></View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}><View style={styles.statIcon}><ShoppingCart size={20} color="#0F766E" /></View><View><Text style={styles.statValue}>{orders.length}</Text><Text style={styles.statLabel}>Orders</Text></View></View>
        <View style={styles.statCard}><View style={styles.statIcon}><ClipboardList size={20} color="#0F766E" /></View><View><Text style={styles.statValue}>{activeOrders}</Text><Text style={styles.statLabel}>Active</Text></View></View>
        <View style={styles.statCard}><View style={styles.statIcon}><Bell size={20} color="#0F766E" /></View><View><Text style={styles.statValue}>{notifications?.unreadCount || 0}</Text><Text style={styles.statLabel}>Alerts</Text></View></View>
      </View>

      <View style={styles.menuCard}>
        <MenuRow icon={ClipboardList} title="My Orders" subtitle="Track, reorder, and review deliveries" onPress={() => navigation.navigate('Orders')} />
        <MenuRow icon={CalendarDays} title="My Subscriptions" subtitle="Manage recurring deliveries, skips, funding and proofs" onPress={() => navigation.navigate('MySubscriptions')} />
        <MenuRow icon={Bell} title="Alerts" subtitle="Order and support notifications" onPress={() => navigation.navigate('Alerts')} />
        <MenuRow icon={Smartphone} title="Push Notifications" subtitle="Register this device for updates" onPress={() => void enablePush()} />
        <MenuRow icon={Headphones} title="Customer Support" subtitle="Open a ticket for an order, item, payment, or delivery issue" onPress={() => navigation.navigate('Support')} />
        <MenuRow icon={ShieldCheck} title="Account Security" subtitle={isGoogleProfile ? 'Google account is connected to this customer profile' : 'Google OAuth primary, email password fallback'} onPress={showAccountSecurity} />
      </View>

      <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Saved Addresses</Text><TouchableOpacity style={styles.linkButton} onPress={() => { if (showForm) { setEditingAddressId(null); setDraft(emptyDraft); setAddressErrors({}); } setShowForm((value) => !value); }}><Plus size={16} color="#0F766E" /><Text style={styles.linkButtonText}>{showForm ? 'Close' : 'Add New'}</Text></TouchableOpacity></View>

      {isLoading ? <View style={styles.centered}><ActivityIndicator size="large" color="#0F766E" /></View> : addresses.length === 0 ? <TouchableOpacity style={styles.emptyCard} onPress={() => { setAddressErrors({}); setShowForm(true); }}><View style={styles.emptyAddressIcon}><MapPinIcon /></View><View style={styles.emptyAddressCopy}><Text style={styles.emptyTitle}>No saved address yet</Text><Text style={styles.emptyText}>Add a delivery address before checkout for faster order delivery.</Text></View><ChevronRight size={20} color="#64748B" /></TouchableOpacity> : addresses.slice(0, 2).map((address: any) => (
        <View key={address.id} style={styles.addressCard}>
          <View style={styles.addressTop}><View style={styles.addressLabelRow}><BriefcaseBusiness size={18} color="#0F766E" /><Text style={styles.addressLabel}>{address.label || 'Address'} {address.isDefault ? '• Default' : ''}</Text></View>{!address.isDefault ? <TouchableOpacity onPress={() => setDefaultMutation.mutate(address.id)}><Text style={styles.smallAction}>Make default</Text></TouchableOpacity> : null}</View>
          <Text style={styles.addressName}>{address.recipientName}</Text>
          <Text style={styles.addressText}>{address.phoneE164}</Text>
          <Text style={styles.addressText}>{address.line1}{address.line2 ? `, ${address.line2}` : ''}</Text>
          <Text style={styles.addressText}>{address.city}, {address.state} - {address.pincode}</Text>
          <Text style={styles.locationBadge}>{locationLabel(address.locationSource)}</Text>
          <View style={styles.addressActions}><TouchableOpacity style={styles.addressAction} onPress={() => editAddress(address)}><Pencil size={15} color="#0F766E" /><Text style={styles.smallAction}>Edit</Text></TouchableOpacity><TouchableOpacity style={styles.addressAction} onPress={() => confirmDeleteAddress(address)}><Trash2 size={15} color="#DC2626" /><Text style={styles.deleteText}>Delete</Text></TouchableOpacity><TouchableOpacity style={styles.deliverHere} onPress={() => setDefaultMutation.mutate(address.id)}><Text style={styles.deliverHereText}>Deliver here</Text></TouchableOpacity></View>
        </View>
      ))}
      {addresses.length > 0 ? <TouchableOpacity style={styles.viewAddresses} onPress={() => navigation.navigate('SavedAddresses')}><Text style={styles.viewAddressesText}>View all saved addresses</Text><ChevronRight size={17} color="#0F766E" /></TouchableOpacity> : null}

      {showForm ? <View style={styles.formCard}>
        <Text style={styles.formTitle}>{editingAddressId ? 'Edit Address' : 'Add Address'}</Text>
        <View style={[styles.locationPanel, locationHasError && styles.locationPanelError]}>
          <View style={styles.locationChoiceRow}>
            <TouchableOpacity style={[styles.locationChoice, draft.locationSource === 'LIVE_GPS' && styles.locationChoiceActive]} onPress={() => void useCurrentLocation()}><Text style={[styles.locationChoiceText, draft.locationSource === 'LIVE_GPS' && styles.locationChoiceTextActive]}>Use current location</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.locationChoice, draft.locationSource === 'GEOCODED' && styles.locationChoiceActive]} onPress={useManualAddress}><Text style={[styles.locationChoiceText, draft.locationSource === 'GEOCODED' && styles.locationChoiceTextActive]}>Enter manually</Text></TouchableOpacity>
          </View>
          <Text style={styles.locationModeTitle}>{locationLabel(draft.locationSource)}</Text>
          <Text style={styles.locationModeText}>{draft.locationSource === 'LIVE_GPS' ? 'Rider arrival will use strict GPS verification at this saved point.' : draft.locationSource === 'MAP_PIN' ? 'This exact map pin helps navigation; delivery can fall back to OTP/photo proof when needed.' : draft.locationSource === 'GEOCODED' ? 'No location permission is required. The server estimates a routing pin from the written address; OTP remains the primary delivery proof.' : 'This older saved location has unknown provenance. Re-verify with current location or a map pin for stronger location proof.'}</Text>
          {draft.locationSource !== 'GEOCODED' ? <LeafletMap latitude={pinnedLatitude} longitude={pinnedLongitude} onPinChange={(latitude, longitude) => void setPinnedLocation(latitude, longitude, 'MAP_PIN')} /> : null}
          <Text style={[styles.locationHelp, locationHasError && styles.locationHelpError]}>{locationHasError ? addressErrors.location : draft.locationSource === 'GEOCODED' ? 'Enter the full address below. A routing coordinate will be estimated automatically.' : hasPinnedLocation ? `Pinned: ${pinnedLatitude.toFixed(5)}, ${pinnedLongitude.toFixed(5)}` : 'Use current location or tap the map to pin the delivery point.'}</Text>
        </View>
        {draft.locationSource === 'GEOCODED' && (
          <>
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, addressErrors.locality && styles.inputLabelError]}>
                Locality <Text style={{ color: '#EF4444' }}>*</Text>
              </Text>
              <TouchableOpacity
                style={[styles.input, addressErrors.locality && styles.inputError]}
                onPress={() => setLocalityModalVisible(true)}
                activeOpacity={0.7}
              >
                <Text style={selectedLocalityName ? styles.inputText : styles.inputPlaceholder}>
                  {localitiesLoading ? 'Loading localities…' : selectedLocalityName || 'Select your locality'}
                </Text>
              </TouchableOpacity>
              {addressErrors.locality ? <Text style={styles.inputErrorText}>{addressErrors.locality}</Text> : null}
              {!addressErrors.locality && !draft.selectedLocalityId && (
                <Text style={{ marginTop: 5, color: '#64748B', fontSize: 11, fontWeight: '700' }}>
                  Select your locality to auto-fill city, state and pincode.
                </Text>
              )}
            </View>
            <Modal visible={localityModalVisible} animationType="slide" transparent>
              <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Select Locality</Text>
                    <TouchableOpacity onPress={() => setLocalityModalVisible(false)} style={styles.modalClose}>
                      <Text style={styles.modalCloseText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                  {localitiesLoading ? (
                    <ActivityIndicator size="large" color="#0F766E" style={{ marginVertical: 30 }} />
                  ) : (
                    <FlatList
                      data={filteredLocalities}
                      keyExtractor={(item) => item.id}
                      renderItem={({ item }) => (
                        <TouchableOpacity style={styles.localityItem} onPress={() => applyLocality(item.id)}>
                          <Text style={styles.localityName}>{item.name}</Text>
                          <Text style={styles.localityDetail}>{item.city} — {item.pincode}</Text>
                        </TouchableOpacity>
                      )}
                      ListEmptyComponent={<Text style={styles.localityEmpty}>No localities match your address. You can still type the address below.</Text>}
                    />
                  )}
                </View>
              </View>
            </Modal>
          </>
        )}
        {addressFields.map(({ key, label, required }) => {
          const error = addressErrors[key as AddressErrorKey];
          return <View key={key} style={styles.inputGroup}>
            <Text style={[styles.inputLabel, error && styles.inputLabelError]}>{label}{required ? ' *' : ''}</Text>
            <TextInput value={String((draft as any)[key] ?? '')} onChangeText={(value) => { clearAddressError(key); setDraft((previous) => ({ ...previous, [key]: value })); }} placeholder={required ? `${label} (required)` : label} placeholderTextColor="#94A3B8" style={[styles.input, error && styles.inputError]} accessibilityLabel={label} />
            {error ? <Text style={styles.inputErrorText}>{error}</Text> : null}
          </View>;
        })}
        <View style={styles.switchRow}><Text style={styles.switchText}>Set as default</Text><Switch value={draft.isDefault} onValueChange={(value) => setDraft((previous) => ({ ...previous, isDefault: value }))} /></View>
        <TouchableOpacity disabled={saveAddressMutation.isPending} style={[styles.saveButton, saveAddressMutation.isPending && styles.disabled]} onPress={saveAddress}><Text style={styles.saveButtonText}>{saveAddressMutation.isPending ? 'Saving...' : editingAddressId ? 'Update Address' : 'Save Address'}</Text></TouchableOpacity>
      </View> : null}
    </ScrollView>
  );
};

function MenuRow({ icon: Icon, title, subtitle, onPress }: { icon: React.ComponentType<{ size?: number; color?: string }>; title: string; subtitle: string; onPress: () => void }) {
  return <TouchableOpacity style={styles.menuRow} onPress={onPress}><View style={styles.menuIcon}><Icon size={21} color="#0F766E" /></View><View style={{ flex: 1 }}><Text style={styles.menuTitle}>{title}</Text><Text style={styles.menuSubtitle}>{subtitle}</Text></View><ChevronRight size={22} color="#64748B" /></TouchableOpacity>;
}

function MapPinIcon() { return <MapPin size={30} color="#0F766E" />; }

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' }, content: { padding: 16, paddingBottom: 170 }, centered: { paddingVertical: 24 }, disabled: { opacity: 0.55 },
  topHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 17 }, headerActions: { flexDirection: 'row', alignItems: 'center', gap: 9 }, topIcon: { width: 46, height: 46, borderRadius: 16, borderWidth: 1, borderColor: '#DDE7EA', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }, topCart: { width: 48, height: 48, borderRadius: 17, backgroundColor: '#CCFBF1', alignItems: 'center', justifyContent: 'center' }, profileHeading: { color: '#0F172A', fontSize: 28, fontWeight: '900', letterSpacing: -0.7 }, profileSubtitle: { marginTop: 3, marginBottom: 17, color: '#64748B', fontSize: 14, fontWeight: '600' },
  heroCard: { position: 'relative', flexDirection: 'row', gap: 14, alignItems: 'center', borderRadius: 26, backgroundColor: '#0F766E', padding: 20 }, headerLogout: { position: 'absolute', right: 14, top: 14, width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#CCFBF1', zIndex: 2 }, headerLogoutText: { color: '#115E59', fontSize: 22, fontWeight: '900' },
  avatar: { width: 64, height: 64, borderRadius: 22, backgroundColor: '#CCFBF1', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF' }, avatarImage: { width: 64, height: 64, borderRadius: 22, backgroundColor: '#CCFBF1', borderWidth: 2, borderColor: '#FFFFFF' }, avatarText: { color: '#115E59', fontSize: 26, fontWeight: '900' }, profileCopy: { flex: 1, paddingRight: 42 }, name: { fontSize: 24, fontWeight: '900', color: '#FFFFFF' }, email: { marginTop: 6, color: '#CCFBF1', fontWeight: '700' }, accountBadge: { alignSelf: 'flex-start', marginTop: 9, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.16)', paddingHorizontal: 10, paddingVertical: 5 }, accountBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  statsRow: { flexDirection: 'row', gap: 9, marginTop: 14 }, statCard: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFFFF', borderRadius: 18, padding: 10, borderWidth: 1, borderColor: '#E2E8F0' }, statIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#E6FFFA', alignItems: 'center', justifyContent: 'center' }, statValue: { fontSize: 21, fontWeight: '900', color: '#0F172A' }, statLabel: { marginTop: 2, color: '#64748B', fontSize: 11, fontWeight: '800' },
  menuCard: { marginTop: 16, backgroundColor: '#FFFFFF', borderRadius: 22, borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden' }, menuRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 11, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }, menuIcon: { width: 40, height: 40, borderRadius: 15, backgroundColor: '#E6FFFA', alignItems: 'center', justifyContent: 'center' }, menuTitle: { color: '#0F172A', fontWeight: '900', fontSize: 15 }, menuSubtitle: { marginTop: 4, color: '#64748B', fontWeight: '700', fontSize: 12 },
  sectionHeader: { marginTop: 22, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, sectionTitle: { fontSize: 20, fontWeight: '900', color: '#0F172A' }, linkButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: '#CCFBF1' }, linkButtonText: { color: '#115E59', fontWeight: '900' },
  emptyCard: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#99F6E4', backgroundColor: '#FFFFFF', padding: 14 }, emptyAddressIcon: { width: 62, height: 62, borderRadius: 22, backgroundColor: '#E6FFFA', alignItems: 'center', justifyContent: 'center' }, emptyAddressCopy: { flex: 1 }, emptyTitle: { color: '#0F172A', fontWeight: '900' }, emptyText: { marginTop: 4, color: '#64748B', lineHeight: 18 },
  addressCard: { marginTop: 12, backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#E2E8F0', padding: 14 }, addressTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }, addressLabelRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 }, addressLabel: { fontSize: 12, fontWeight: '900', color: '#0F766E', textTransform: 'uppercase' }, smallAction: { color: '#0F766E', fontWeight: '900', fontSize: 12 }, addressName: { marginTop: 7, fontSize: 16, fontWeight: '900', color: '#0F172A' }, addressText: { marginTop: 4, color: '#475569' }, locationBadge: { marginTop: 7, alignSelf: 'flex-start', borderRadius: 999, backgroundColor: '#F0FDFA', color: '#0F766E', paddingHorizontal: 9, paddingVertical: 4, fontSize: 10, fontWeight: '900' }, deleteText: { color: '#DC2626', fontWeight: '900', fontSize: 12 }, addressActions: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 10 }, addressAction: { flexDirection: 'row', alignItems: 'center', gap: 4 }, deliverHere: { flex: 1, alignItems: 'center', borderRadius: 999, backgroundColor: '#0F766E', paddingVertical: 9 }, deliverHereText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' }, viewAddresses: { marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }, viewAddressesText: { color: '#0F766E', fontWeight: '900', fontSize: 12 },
  formCard: { marginTop: 16, backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#E2E8F0' }, formTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A', marginBottom: 12 },
  inputText: { color: '#0F172A', fontSize: 14 }, inputPlaceholder: { color: '#94A3B8', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }, modalContent: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '70%', paddingBottom: 30 }, modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' }, modalTitle: { fontSize: 17, fontWeight: '900', color: '#0F172A' }, modalClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' }, modalCloseText: { fontSize: 16, fontWeight: '900', color: '#64748B' },
  localityItem: { paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }, localityName: { fontSize: 15, fontWeight: '800', color: '#0F172A' }, localityDetail: { fontSize: 12, fontWeight: '600', color: '#64748B', marginTop: 3 }, localityEmpty: { padding: 24, textAlign: 'center', color: '#64748B', fontSize: 13 }, locationPanel: { borderRadius: 18, backgroundColor: '#F0FDFA', borderWidth: 1, borderColor: '#CCFBF1', padding: 10, marginBottom: 12 }, locationPanelError: { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' }, locationChoiceRow: { flexDirection: 'row', gap: 8, marginBottom: 10 }, locationChoice: { flex: 1, alignItems: 'center', borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#99F6E4', paddingVertical: 10 }, locationChoiceActive: { backgroundColor: '#0F766E', borderColor: '#0F766E' }, locationChoiceText: { color: '#0F766E', fontSize: 11, fontWeight: '900' }, locationChoiceTextActive: { color: '#FFFFFF' }, locationModeTitle: { color: '#0F172A', fontSize: 13, fontWeight: '900', marginBottom: 3 }, locationModeText: { color: '#475569', fontSize: 11, lineHeight: 16, marginBottom: 10 }, locationHelp: { marginTop: 8, color: '#115E59', fontWeight: '700', fontSize: 12, textAlign: 'center' }, locationHelpError: { color: '#B91C1C' },
  inputGroup: { marginBottom: 10 }, inputLabel: { marginBottom: 5, color: '#475569', fontSize: 12, fontWeight: '900' }, inputLabelError: { color: '#B91C1C' }, input: { borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, color: '#0F172A' }, inputError: { borderColor: '#EF4444', backgroundColor: '#FEF2F2' }, inputErrorText: { marginTop: 5, color: '#B91C1C', fontSize: 11, lineHeight: 16, fontWeight: '800' }, switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, marginBottom: 12 }, switchText: { color: '#0F172A', fontWeight: '700' }, saveButton: { backgroundColor: '#0F766E', borderRadius: 16, paddingVertical: 15, alignItems: 'center' }, saveButtonText: { color: '#FFFFFF', fontWeight: '900' },
});
