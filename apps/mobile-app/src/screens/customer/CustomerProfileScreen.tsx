import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { apiClient } from '../../api/client';

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
  latitude: '0',
  longitude: '0',
  instructions: '',
  isDefault: false,
};

export const CustomerProfileScreen = () => {
  const { user, logout } = useAuthStore();
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);

  const { data: addresses = [], isLoading, refetch } = useQuery({
    queryKey: ['profile-addresses'],
    queryFn: async () => {
      const response = await apiClient.get('/customer/addresses');
      return Array.isArray(response.data) ? response.data : [];
    },
  });

  const saveAddressMutation = useMutation({
    mutationFn: async () =>
      apiClient.post('/customer/addresses', {
        ...draft,
        latitude: Number(draft.latitude),
        longitude: Number(draft.longitude),
      }),
    onSuccess: async () => {
      setDraft(emptyDraft);
      setShowForm(false);
      await refetch();
      Alert.alert('Address saved', 'Your address has been added.');
    },
    onError: (error: any) => {
      Alert.alert('Could not save address', error.response?.data?.message || 'Please check the form.');
    },
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.heroCard}>
        <Text style={styles.name}>{user?.name || 'Customer'}</Text>
        <Text style={styles.email}>{user?.email}</Text>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Saved Addresses</Text>
        <TouchableOpacity style={styles.linkButton} onPress={() => setShowForm((value) => !value)}>
          <Text style={styles.linkButtonText}>{showForm ? 'Close' : 'Add New'}</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#0F766E" />
        </View>
      ) : (
        addresses.map((address: any) => (
          <View key={address.id} style={styles.addressCard}>
            <Text style={styles.addressLabel}>
              {address.label || 'Address'} {address.isDefault ? '• Default' : ''}
            </Text>
            <Text style={styles.addressName}>{address.recipientName}</Text>
            <Text style={styles.addressText}>{address.phoneE164}</Text>
            <Text style={styles.addressText}>
              {address.line1}
              {address.line2 ? `, ${address.line2}` : ''}
            </Text>
            <Text style={styles.addressText}>
              {address.city}, {address.state} - {address.pincode}
            </Text>
          </View>
        ))
      )}

      {showForm ? (
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Add Address</Text>
          {[
            ['label', 'Label'],
            ['recipientName', 'Recipient Name'],
            ['phoneE164', 'Phone'],
            ['alternatePhoneE164', 'Alternate Phone'],
            ['line1', 'Address Line 1'],
            ['line2', 'Address Line 2'],
            ['landmark', 'Landmark'],
            ['city', 'City'],
            ['state', 'State'],
            ['pincode', 'Pincode'],
            ['latitude', 'Latitude'],
            ['longitude', 'Longitude'],
            ['instructions', 'Instructions'],
          ].map(([key, label]) => (
            <TextInput
              key={key}
              value={(draft as any)[key]}
              onChangeText={(value) => setDraft((prev) => ({ ...prev, [key]: value }))}
              placeholder={label}
              placeholderTextColor="#94A3B8"
              style={styles.input}
            />
          ))}

          <View style={styles.switchRow}>
            <Text style={styles.switchText}>Set as default</Text>
            <Switch
              value={draft.isDefault}
              onValueChange={(value) => setDraft((prev) => ({ ...prev, isDefault: value }))}
            />
          </View>

          <TouchableOpacity style={styles.saveButton} onPress={() => saveAddressMutation.mutate()}>
            <Text style={styles.saveButtonText}>
              {saveAddressMutation.isPending ? 'Saving...' : 'Save Address'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <TouchableOpacity style={styles.logoutButton} onPress={logout}>
        <Text style={styles.logoutButtonText}>Logout</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 16, paddingBottom: 24 },
  centered: { paddingVertical: 24 },
  heroCard: { borderRadius: 24, backgroundColor: '#0F766E', padding: 20 },
  name: { fontSize: 24, fontWeight: '800', color: '#FFFFFF' },
  email: { marginTop: 6, color: '#CCFBF1' },
  sectionHeader: { marginTop: 22, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  linkButton: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: '#CCFBF1' },
  linkButtonText: { color: '#115E59', fontWeight: '800' },
  addressCard: {
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
  },
  addressLabel: { fontSize: 12, fontWeight: '800', color: '#0F766E', textTransform: 'uppercase' },
  addressName: { marginTop: 6, fontSize: 16, fontWeight: '800', color: '#0F172A' },
  addressText: { marginTop: 4, color: '#475569' },
  formCard: { marginTop: 16, backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  formTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#0F172A',
    marginBottom: 10,
  },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, marginBottom: 12 },
  switchText: { color: '#0F172A', fontWeight: '700' },
  saveButton: { backgroundColor: '#0F766E', borderRadius: 16, paddingVertical: 15, alignItems: 'center' },
  saveButtonText: { color: '#FFFFFF', fontWeight: '800' },
  logoutButton: { marginTop: 24, borderRadius: 16, backgroundColor: '#DC2626', paddingVertical: 15, alignItems: 'center' },
  logoutButtonText: { color: '#FFFFFF', fontWeight: '800' },
});
