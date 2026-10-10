import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ArrowLeft, RotateCcw, Search, Trash2, Users, UserPlus } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { subscriptionOperationsService } from '../../api/subscriptionOperationsService';
import { GradientSurface } from '../../components/GradientSurface';
import { goBackOrHome } from '../../navigation/partnerNavigationRef';

// Mirrors the web store portal's offline-customer directory: a searchable list
// with move-to-recycle-bin, restore, and permanent purge. Kept as a dedicated
// list because deletion is a lifecycle action the web exposes per customer, not
// a by-product of the subscription screens.
const summaryOf = (customer: any) => customer?.summary || {};

function money(paise: number) {
  return `₹${(Number(paise || 0) / 100).toLocaleString('en-IN')}`;
}

export const StoreOfflineCustomersScreen = ({ navigation }: { navigation: any }) => {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [showBin, setShowBin] = useState(false);

  const listKey = ['store-offline-customers', appliedSearch, showBin] as const;
  const query = useQuery({
    queryKey: listKey,
    queryFn: () => subscriptionOperationsService.getOfflineCustomers({ search: appliedSearch || undefined, recycleBin: showBin, pageSize: 100 }),
    retry: 1,
  });

  const customers = query.data?.customers || [];
  const binCount = query.data?.recycleBinCount || 0;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['store-offline-customers'] });
    void queryClient.invalidateQueries({ queryKey: ['store-subscribers'] });
  };

  const remove = useMutation({
    mutationFn: (id: string) => subscriptionOperationsService.deleteOfflineCustomer(id),
    onSuccess: () => { Toast.show({ type: 'success', text1: 'Moved to recycle bin' }); invalidate(); },
    onError: () => Toast.show({ type: 'error', text1: 'Could not delete customer' }),
  });
  const restore = useMutation({
    mutationFn: (id: string) => subscriptionOperationsService.restoreOfflineCustomer(id),
    onSuccess: () => { Toast.show({ type: 'success', text1: 'Customer restored' }); invalidate(); },
    onError: () => Toast.show({ type: 'error', text1: 'Could not restore customer' }),
  });
  const purge = useMutation({
    mutationFn: (id: string) => subscriptionOperationsService.purgeOfflineCustomer(id),
    onSuccess: () => { Toast.show({ type: 'success', text1: 'Customer permanently deleted' }); invalidate(); },
    onError: () => Toast.show({ type: 'error', text1: 'Could not purge customer' }),
  });

  const confirmDelete = (customer: any) => {
    const label = customer.name || 'this customer';
    if (showBin) {
      Alert.alert('Delete permanently', `Permanently delete ${label}? This cannot be undone.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete forever', style: 'destructive', onPress: () => purge.mutate(customer.id) },
      ]);
    } else {
      Alert.alert('Move to recycle bin', `Move ${label} to the recycle bin? You can restore them later.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Move to bin', style: 'destructive', onPress: () => remove.mutate(customer.id) },
      ]);
    }
  };

  const busy = remove.isPending || restore.isPending || purge.isPending;

  const counts = useMemo(() => ({ shown: customers.length }), [customers.length]);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#0F766E" />
      <GradientSurface preset="teal" style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <TouchableOpacity style={styles.back} onPress={() => goBackOrHome(navigation)} accessibilityLabel="Go back">
          <ArrowLeft size={21} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>CUSTOMER DIRECTORY</Text>
          <Text style={styles.title}>{showBin ? 'Recycle bin' : 'Offline customers'}</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => navigation.navigate('StoreOfflineCustomer')} accessibilityLabel="Add offline customer">
          <UserPlus size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </GradientSurface>

      <View style={styles.toolbar}>
        <View style={styles.searchBar}>
          <Search size={16} color="#94A3B8" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search name, phone or email"
            placeholderTextColor="#94A3B8"
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={() => setAppliedSearch(search.trim())}
            returnKeyType="search"
          />
          {search.length > 0 ? (
            <TouchableOpacity onPress={() => { setSearch(''); setAppliedSearch(''); }} accessibilityLabel="Clear search">
              <Text style={styles.clear}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity
          style={[styles.binToggle, showBin && styles.binToggleActive]}
          onPress={() => setShowBin((v) => !v)}
          accessibilityLabel={showBin ? 'Show active customers' : 'Show recycle bin'}
        >
          <RotateCcw size={15} color={showBin ? '#FFFFFF' : '#0F766E'} />
          <Text style={[styles.binToggleText, showBin && styles.binToggleTextActive]}>Bin {binCount > 0 ? binCount : ''}</Text>
        </TouchableOpacity>
      </View>

      {query.isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#0F766E" /><Text style={styles.muted}>Loading customers…</Text></View>
      ) : query.isError ? (
        <View style={styles.center}><Text style={styles.errorTitle}>Couldn't load customers</Text><Text style={styles.muted}>Pull down to retry.</Text></View>
      ) : (
        <FlatList
          data={customers}
          keyExtractor={(item: any) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Users size={40} color="#94A3B8" />
              <Text style={styles.emptyTitle}>{showBin ? 'Recycle bin is empty' : `No offline customers${appliedSearch ? ` for "${appliedSearch}"` : ''}`}</Text>
              <Text style={styles.emptyText}>{showBin ? 'Deleted customers appear here until permanently purged.' : 'Add offline customers to manage their subscriptions and cash.'}</Text>
            </View>
          }
          renderItem={({ item }: { item: any }) => {
            const s = summaryOf(item);
            return (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.avatar}><Text style={styles.avatarText}>{(item.name || 'C').slice(0, 1).toUpperCase()}</Text></View>
                  <View style={styles.flex}>
                    <Text style={styles.name} numberOfLines={1}>{item.name || 'Customer'}</Text>
                    <Text style={styles.phone} numberOfLines={1}>{item.phone || item.email || 'No contact'}</Text>
                  </View>
                  <View style={styles.subBadge}>
                    <Text style={styles.subBadgeValue}>{s.activeSubscriptions ?? 0}</Text>
                    <Text style={styles.subBadgeLabel}>ACTIVE</Text>
                  </View>
                </View>

                <View style={styles.metrics}>
                  <View style={styles.metric}><Text style={styles.metricValue}>{s.totalDelivered ?? 0}</Text><Text style={styles.metricLabel}>Delivered</Text></View>
                  <View style={styles.metric}><Text style={styles.metricValue}>{money(s.totalCollectedPaise)}</Text><Text style={styles.metricLabel}>Collected</Text></View>
                  <View style={styles.metric}><Text style={[styles.metricValue, (s.totalDuePaise || 0) > 0 && styles.dueValue]}>{money(s.totalDuePaise)}</Text><Text style={styles.metricLabel}>Due</Text></View>
                </View>

                <View style={styles.actions}>
                  {showBin ? (
                    <>
                      <TouchableOpacity style={[styles.action, styles.restore]} disabled={busy} onPress={() => restore.mutate(item.id)}>
                        <RotateCcw size={15} color="#0F766E" />
                        <Text style={styles.restoreText}>Restore</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.action, styles.danger]} disabled={busy} onPress={() => confirmDelete(item)}>
                        <Trash2 size={15} color="#FFFFFF" />
                        <Text style={styles.dangerText}>Delete forever</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <TouchableOpacity style={[styles.action, styles.dangerOutline]} disabled={busy} onPress={() => confirmDelete(item)}>
                      <Trash2 size={15} color="#B91C1C" />
                      <Text style={styles.dangerOutlineText}>Delete</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          }}
          ListFooterComponent={counts.shown ? <Text style={styles.footnote}>{counts.shown} customer{counts.shown === 1 ? '' : 's'}</Text> : null}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  flex: { flex: 1 },
  header: { paddingHorizontal: 18, paddingBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  addBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: '#A7F3D0', fontSize: 9, fontWeight: '600', letterSpacing: 1 },
  title: { color: '#FFFFFF', fontSize: 24, fontWeight: '600', marginTop: 2 },
  toolbar: { flexDirection: 'row', gap: 10, padding: 14, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F1F5F9', borderRadius: 12, paddingHorizontal: 12, minHeight: 42 },
  searchInput: { flex: 1, fontSize: 13, color: '#0F172A', paddingVertical: 8 },
  clear: { color: '#94A3B8', fontSize: 14, paddingHorizontal: 4 },
  binToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, borderWidth: 1, borderColor: '#99D8C8', paddingHorizontal: 12, minHeight: 42 },
  binToggleActive: { backgroundColor: '#0F766E', borderColor: '#0F766E' },
  binToggleText: { color: '#0F766E', fontSize: 12, fontWeight: '600' },
  binToggleTextActive: { color: '#FFFFFF' },
  list: { padding: 14, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  muted: { color: '#64748B', fontSize: 13 },
  errorTitle: { color: '#0F172A', fontSize: 18, fontWeight: '600' },
  empty: { alignItems: 'center', padding: 40, gap: 8 },
  emptyTitle: { color: '#0F172A', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  emptyText: { color: '#64748B', fontSize: 13, textAlign: 'center' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#E2E8F0', padding: 14, gap: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#CCFBF1', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#0F766E', fontSize: 17, fontWeight: '700' },
  name: { color: '#0F172A', fontSize: 15, fontWeight: '600' },
  phone: { color: '#64748B', fontSize: 11, marginTop: 2 },
  subBadge: { alignItems: 'center', backgroundColor: '#ECFDF5', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  subBadgeValue: { color: '#0F766E', fontSize: 15, fontWeight: '700' },
  subBadgeLabel: { color: '#0F766E', fontSize: 7, fontWeight: '600', letterSpacing: 0.5 },
  metrics: { flexDirection: 'row', backgroundColor: '#F8FAFC', borderRadius: 12, paddingVertical: 10 },
  metric: { flex: 1, alignItems: 'center' },
  metricValue: { color: '#0F172A', fontSize: 13, fontWeight: '600' },
  dueValue: { color: '#B91C1C' },
  metricLabel: { color: '#64748B', fontSize: 9, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1, minHeight: 42, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  restore: { borderWidth: 1, borderColor: '#99D8C8' },
  restoreText: { color: '#0F766E', fontSize: 12, fontWeight: '600' },
  danger: { backgroundColor: '#B91C1C' },
  dangerText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  dangerOutline: { borderWidth: 1, borderColor: '#FCA5A5' },
  dangerOutlineText: { color: '#B91C1C', fontSize: 12, fontWeight: '600' },
  footnote: { textAlign: 'center', color: '#94A3B8', fontSize: 11, paddingVertical: 12 },
});
