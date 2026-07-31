import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  BriefcaseBusiness,
  ChevronRight,
  Home,
  MapPin,
  MoreVertical,
  Pencil,
  Phone,
  Plus,
  Trash2,
} from 'lucide-react-native';
import { apiClient } from '@aagam/mobile-shared';
import { getUserSafeError, notify } from '../../ui/notify';

const iconFor = (label?: string) => {
  if (label?.toLowerCase() === 'work') return BriefcaseBusiness;
  if (label?.toLowerCase() === 'home') return Home;
  return MapPin;
};

export const SavedAddressesScreen = () => {
  const navigation = useNavigation<any>();
  const { data: addresses = [], isLoading, refetch } = useQuery({
    queryKey: ['saved-addresses'],
    queryFn: async () => {
      const response = await apiClient.get('/customer/addresses');
      return Array.isArray(response.data) ? response.data : [];
    },
  });
  const setDefault = useMutation({
    mutationFn: async (id: string) => apiClient.patch(`/customer/addresses/${id}`, { isDefault: true }),
    onSuccess: async () => {
      await refetch();
      notify.success('Delivery address updated', 'New orders will use this address.');
    },
    onError: (error: unknown) => notify.error('Could not update address', getUserSafeError(error, 'Please try again.')),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/customer/addresses/${id}`),
    onSuccess: async () => {
      await refetch();
      notify.success('Address removed');
    },
    onError: (error: unknown) => notify.error('Could not remove address', getUserSafeError(error, 'Please try again.')),
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={() => navigation.goBack()} accessibilityLabel="Go back">
          <ArrowLeft size={22} color="#0F172A" />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Saved Addresses</Text>
          <Text style={styles.subtitle}>Manage your delivery addresses</Text>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={() => navigation.navigate('Profile')} accessibilityLabel="Add a new address">
          <Plus size={24} color="#0F766E" />
        </TouchableOpacity>
      </View>

      {addresses.length > 0 ? (
        <View style={styles.deliveringCard}>
          <View style={styles.locationCircle}><MapPin size={24} color="#0F766E" /></View>
          <View style={styles.deliveringCopy}>
            <Text style={styles.deliveringLabel}>Delivering to</Text>
            <Text style={styles.deliveringTitle}>{(addresses.find((address: any) => address.isDefault) || addresses[0]).label || 'Saved address'}</Text>
            <Text style={styles.deliveringText}>{(addresses.find((address: any) => address.isDefault) || addresses[0]).city || 'Your selected delivery location'}</Text>
          </View>
          <ChevronRight size={22} color="#0F766E" />
        </View>
      ) : null}

      {isLoading ? <View style={styles.centered}><ActivityIndicator size="large" color="#0F766E" /></View> : (
        <FlatList
          data={addresses}
          keyExtractor={(item: any) => item.id}
          contentContainerStyle={styles.list}
          refreshing={false}
          onRefresh={() => void refetch()}
          ListEmptyComponent={(
            <View style={styles.empty}>
              <View style={styles.emptyIcon}><MapPin size={30} color="#0F766E" /></View>
              <Text style={styles.emptyTitle}>No saved address yet</Text>
              <Text style={styles.emptyText}>Add a delivery address before checkout for faster order delivery.</Text>
              <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('Profile')}>
                <Plus size={18} color="#FFFFFF" />
                <Text style={styles.primaryButtonText}>Add New Address</Text>
              </TouchableOpacity>
            </View>
          )}
          renderItem={({ item }: { item: any }) => {
            const Icon = iconFor(item.label);
            return (
              <View style={styles.addressCard}>
                <View style={styles.addressBody}>
                  <View style={styles.addressIcon}><Icon size={24} color="#0F766E" /></View>
                  <View style={styles.addressCopy}>
                    <View style={styles.addressTitleRow}>
                      <Text style={styles.addressTitle}>{item.label || 'Address'}</Text>
                      {item.isDefault ? <Text style={styles.defaultBadge}>★ Default</Text> : null}
                    </View>
                    <Text style={styles.addressText}>{item.line1}{item.line2 ? `, ${item.line2}` : ''}</Text>
                    <Text style={styles.addressText}>{item.city}, {item.state} {item.pincode}</Text>
                    <View style={styles.phoneRow}><Phone size={15} color="#64748B" /><Text style={styles.phoneText}>{item.phoneE164}</Text></View>
                  </View>
                  <TouchableOpacity accessibilityLabel={`More options for ${item.label || 'address'}`}><MoreVertical size={21} color="#64748B" /></TouchableOpacity>
                </View>
                <View style={styles.actions}>
                  <TouchableOpacity style={styles.action} onPress={() => navigation.navigate('Profile')}>
                    <Pencil size={17} color="#0F766E" /><Text style={styles.actionText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.action} onPress={() => remove.mutate(item.id)} disabled={remove.isPending}>
                    <Trash2 size={17} color="#DC2626" /><Text style={[styles.actionText, styles.deleteText]}>Delete</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.deliverButton, item.isDefault && styles.deliverButtonActive]} onPress={() => setDefault.mutate(item.id)} disabled={item.isDefault || setDefault.isPending}>
                    <Text style={[styles.deliverText, item.isDefault && styles.deliverTextActive]}>{item.isDefault ? 'Deliver here' : 'Deliver Here'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 18, paddingBottom: 12, gap: 12 },
  headerButton: { width: 52, height: 52, borderRadius: 17, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1 },
  title: { color: '#0F172A', fontSize: 23, fontWeight: '900', letterSpacing: -0.5 },
  subtitle: { marginTop: 3, color: '#64748B', fontSize: 13, fontWeight: '700' },
  addButton: { width: 52, height: 52, borderRadius: 17, backgroundColor: '#E6FFFA', alignItems: 'center', justifyContent: 'center' },
  deliveringCard: { marginHorizontal: 16, marginBottom: 8, flexDirection: 'row', alignItems: 'center', borderRadius: 24, borderWidth: 1, borderColor: '#99F6E4', backgroundColor: '#F0FDFA', padding: 17, gap: 13 },
  locationCircle: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#CCFBF1', alignItems: 'center', justifyContent: 'center' },
  deliveringCopy: { flex: 1 }, deliveringLabel: { color: '#64748B', fontWeight: '700', fontSize: 12 }, deliveringTitle: { marginTop: 4, color: '#0F172A', fontSize: 16, fontWeight: '900' }, deliveringText: { marginTop: 3, color: '#64748B', fontWeight: '700' },
  list: { padding: 16, paddingBottom: 160 }, centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  addressCard: { marginBottom: 14, borderRadius: 24, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden' },
  addressBody: { flexDirection: 'row', alignItems: 'flex-start', padding: 16, gap: 12 }, addressIcon: { width: 58, height: 58, borderRadius: 18, backgroundColor: '#E6FFFA', alignItems: 'center', justifyContent: 'center' }, addressCopy: { flex: 1 }, addressTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }, addressTitle: { color: '#0F172A', fontSize: 18, fontWeight: '900' }, defaultBadge: { color: '#0F766E', backgroundColor: '#E6FFFA', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, fontSize: 10, fontWeight: '900' }, addressText: { marginTop: 5, color: '#64748B', fontSize: 13, lineHeight: 19, fontWeight: '600' }, phoneRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }, phoneText: { color: '#475569', fontWeight: '700', fontSize: 12 },
  actions: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingHorizontal: 12, paddingVertical: 10, gap: 10 }, action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 38 }, actionText: { color: '#0F766E', fontWeight: '900' }, deleteText: { color: '#DC2626' }, deliverButton: { minWidth: 126, alignItems: 'center', borderRadius: 999, borderWidth: 1.5, borderColor: '#0F766E', paddingHorizontal: 14, paddingVertical: 10 }, deliverButtonActive: { backgroundColor: '#0F766E' }, deliverText: { color: '#0F766E', fontWeight: '900' }, deliverTextActive: { color: '#FFFFFF' },
  empty: { marginTop: 18, alignItems: 'center', borderRadius: 24, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#99F6E4', backgroundColor: '#FFFFFF', padding: 28 }, emptyIcon: { width: 68, height: 68, borderRadius: 22, backgroundColor: '#E6FFFA', alignItems: 'center', justifyContent: 'center' }, emptyTitle: { marginTop: 14, color: '#0F172A', fontSize: 18, fontWeight: '900' }, emptyText: { marginTop: 6, color: '#64748B', lineHeight: 20, textAlign: 'center', fontWeight: '600' }, primaryButton: { marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 15, backgroundColor: '#0F766E', paddingHorizontal: 17, paddingVertical: 12 }, primaryButtonText: { color: '#FFFFFF', fontWeight: '900' },
});
