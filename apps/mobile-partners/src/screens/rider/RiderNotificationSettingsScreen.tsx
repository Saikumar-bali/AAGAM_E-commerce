import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, ChevronLeft, Smartphone, Trash2 } from 'lucide-react-native';
import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import {
  NotificationPreference,
  notificationService,
  PushSubscriptionSummary,
} from '../../api/notificationService';

const PREFERENCES_KEY = ['partner-notification-preferences'] as const;
const DEVICES_KEY = ['partner-push-subscriptions'] as const;

const RIDER_PREFERENCE_CATALOG: Array<NotificationPreference & { label: string }> = [
  { eventType: 'ASSIGNMENT_OFFERED', label: 'New delivery offers', pushEnabled: true, inAppEnabled: true, required: true },
  { eventType: 'RIDER_AT_STORE', label: 'Pickup workflow', pushEnabled: true, inAppEnabled: true, required: true },
  { eventType: 'PICKUP_VERIFIED', label: 'Pickup verified', pushEnabled: true, inAppEnabled: true, required: true },
  { eventType: 'OUT_FOR_DELIVERY', label: 'Delivery status', pushEnabled: true, inAppEnabled: true, required: true },
  { eventType: 'RIDER_AT_CUSTOMER', label: 'Customer handoff', pushEnabled: true, inAppEnabled: true, required: true },
  { eventType: 'RIDER_PAYOUT_UPDATED', label: 'Payout updates', pushEnabled: true, inAppEnabled: true },
  { eventType: 'RIDER_SUPPORT_REPLY', label: 'Support replies', pushEnabled: true, inAppEnabled: true },
  { eventType: 'RIDER_DOCUMENT_UPDATED', label: 'Document reviews', pushEnabled: true, inAppEnabled: true },
];

function displayDate(value?: string | null) {
  if (!value) return 'Not reported';
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    : 'Not reported';
}

export const RiderNotificationSettingsScreen = ({ navigation }: { navigation?: any }) => {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const preferencesQuery = useQuery({
    queryKey: PREFERENCES_KEY,
    queryFn: notificationService.getPreferences,
    retry: 1,
  });
  const devicesQuery = useQuery({
    queryKey: DEVICES_KEY,
    queryFn: notificationService.getPushSubscriptions,
    retry: 1,
  });
  const hasCachedPreferences = Array.isArray(preferencesQuery.data);
  const hasCachedDevices = Array.isArray(devicesQuery.data);
  const devices = devicesQuery.data || [];

  const preferences = useMemo(() => {
    const server = new Map(
      (preferencesQuery.data || []).map((item) => [item.eventType, item]),
    );
    return RIDER_PREFERENCE_CATALOG.map((catalog) => ({
      ...catalog,
      ...server.get(catalog.eventType),
      required: catalog.required,
      label: catalog.label,
    }));
  }, [preferencesQuery.data]);

  const updateMutation = useMutation({
    mutationFn: (input: { eventType: string; pushEnabled: boolean }) => (
      notificationService.updatePreference(input)
    ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PREFERENCES_KEY });
      Toast.show({ type: 'success', text1: 'Notification preference updated' });
    },
    onError: (error: any) => Toast.show({
      type: 'error',
      text1: 'Could not update notifications',
      text2: error?.response?.data?.message || error?.message,
    }),
  });

  const disableMutation = useMutation({
    mutationFn: (subscriptionId: string) => notificationService.disablePushSubscription(subscriptionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: DEVICES_KEY });
      Toast.show({ type: 'success', text1: 'Device deactivated' });
    },
    onError: (error: any) => Toast.show({
      type: 'error',
      text1: 'Could not deactivate device',
      text2: error?.response?.data?.message || error?.message,
    }),
  });

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity accessibilityLabel="Go back" style={styles.back} onPress={() => navigation?.goBack?.()}>
          <ChevronLeft size={25} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>RIDER ALERTS</Text>
          <Text style={styles.title}>Notification settings</Text>
        </View>
        <BellRing size={25} color="#FFFFFF" />
      </View>

      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={preferencesQuery.isRefetching || devicesQuery.isRefetching} onRefresh={() => void Promise.all([preferencesQuery.refetch(), devicesQuery.refetch()])} tintColor="#0F766E" />}>
        <Text style={styles.sectionTitle}>Alert preferences</Text>
        <Text style={styles.sectionHint}>Critical delivery alerts remain enabled so active work cannot be missed.</Text>
        {preferencesQuery.isError && hasCachedPreferences ? <InlineRetry title="Could not refresh preferences" message="Showing your last loaded settings." onRetry={() => void preferencesQuery.refetch()} /> : null}
        {preferencesQuery.isLoading && !hasCachedPreferences ? <ActivityIndicator color="#0F766E" /> : preferencesQuery.isError && !hasCachedPreferences ? <ErrorState title="Preferences unavailable" onRetry={() => void preferencesQuery.refetch()} /> : preferences.map((item) => (
          <View key={item.eventType} style={styles.rowCard}>
            <View style={styles.flex}>
              <Text style={styles.rowTitle}>{item.label}</Text>
              <Text style={styles.rowText}>
                {item.required ? 'Required operational alert' : 'You can turn push delivery on or off.'}
              </Text>
            </View>
            <Switch
              value={item.required ? true : item.pushEnabled}
              disabled={item.required || updateMutation.isPending}
              onValueChange={(pushEnabled) => updateMutation.mutate({
                eventType: item.eventType,
                pushEnabled,
              })}
              trackColor={{ false: '#CBD5E1', true: '#34D399' }}
              thumbColor="#FFFFFF"
            />
          </View>
        ))}

        <Text style={[styles.sectionTitle, styles.devicesTitle]}>Registered devices</Text>
        <Text style={styles.sectionHint}>Only device names and activity are shown. Push tokens are never exposed.</Text>
        {devicesQuery.isError && hasCachedDevices ? <InlineRetry title="Could not refresh devices" message="Showing your last loaded devices." onRetry={() => void devicesQuery.refetch()} /> : null}
        {devicesQuery.isLoading && !hasCachedDevices ? <ActivityIndicator color="#0F766E" /> : devicesQuery.isError && !hasCachedDevices ? <ErrorState title="Devices unavailable" onRetry={() => void devicesQuery.refetch()} /> : null}
        {devices.map((device: PushSubscriptionSummary) => (
          <View key={device.id} style={styles.deviceCard}>
            <View style={styles.deviceIcon}><Smartphone size={21} color="#0F766E" /></View>
            <View style={styles.flex}>
              <Text style={styles.rowTitle}>{device.deviceName || 'Aagaam partner device'}</Text>
              <Text style={styles.rowText}>Last seen {displayDate(device.lastSeenAt || device.createdAt)}</Text>
              {device.isCurrentDevice ? <Text style={styles.current}>Current device</Text> : null}
            </View>
            <TouchableOpacity
              accessibilityLabel="Deactivate device"
              disabled={disableMutation.isPending}
              style={styles.remove}
              onPress={() => disableMutation.mutate(device.id)}
            >
              {disableMutation.isPending
                ? <ActivityIndicator size="small" color="#B91C1C" />
                : <Trash2 size={18} color="#B91C1C" />}
            </TouchableOpacity>
          </View>
        ))}
        {!devicesQuery.isLoading && !(devicesQuery.isError && !hasCachedDevices) && devices.length === 0 ? (
          <View style={styles.empty}><Text style={styles.rowText}>No active push devices were returned.</Text></View>
        ) : null}
      </ScrollView>
    </View>
  );
};

function ErrorState({ title, onRetry }: { title: string; onRetry: () => void }) {
  return <View style={styles.errorCard}><Text style={styles.errorTitle}>{title}</Text><Text style={styles.errorText}>Check your connection and try again.</Text><TouchableOpacity style={styles.errorButton} onPress={onRetry}><Text style={styles.errorButtonText}>Try again</Text></TouchableOpacity></View>;
}

function InlineRetry({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return <View style={styles.inlineError}><View style={styles.flex}><Text style={styles.inlineErrorTitle}>{title}</Text><Text style={styles.inlineErrorText}>{message}</Text></View><TouchableOpacity onPress={onRetry}><Text style={styles.inlineRetry}>Retry</Text></TouchableOpacity></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F4F7FB' },
  flex: { flex: 1 },
  header: { minHeight: 116, paddingHorizontal: 18, paddingBottom: 18, backgroundColor: '#067B5C', flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { width: 38, height: 38, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: '#A7F3D0', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', marginTop: 3 },
  content: { padding: 16, paddingBottom: 110 },
  sectionTitle: { color: '#0F172A', fontSize: 17, fontWeight: '900' },
  sectionHint: { color: '#64748B', fontSize: 12, lineHeight: 18, marginTop: 4, marginBottom: 11 },
  rowCard: { minHeight: 76, borderRadius: 17, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 14, marginBottom: 9, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowTitle: { color: '#0F172A', fontSize: 14, fontWeight: '900' },
  rowText: { color: '#64748B', fontSize: 11, lineHeight: 16, marginTop: 3 },
  devicesTitle: { marginTop: 18 },
  deviceCard: { minHeight: 82, borderRadius: 17, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 13, marginBottom: 9, flexDirection: 'row', alignItems: 'center', gap: 11 },
  deviceIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#CCFBF1', alignItems: 'center', justifyContent: 'center' },
  current: { color: '#047857', fontSize: 10, fontWeight: '900', marginTop: 4 },
  remove: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' },
  empty: { minHeight: 84, borderRadius: 17, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', padding: 16 },
  errorCard: { borderRadius: 17, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', padding: 16, marginBottom: 10, alignItems: 'center' },
  errorTitle: { color: '#991B1B', fontSize: 14, fontWeight: '900' },
  errorText: { color: '#B91C1C', fontSize: 11, marginTop: 4 },
  errorButton: { marginTop: 12, borderRadius: 12, backgroundColor: '#B91C1C', paddingHorizontal: 15, paddingVertical: 10 },
  errorButtonText: { color: '#FFFFFF', fontWeight: '900' },
  inlineError: { marginBottom: 10, borderRadius: 15, borderWidth: 1, borderColor: '#FCD34D', backgroundColor: '#FFFBEB', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  inlineErrorTitle: { color: '#92400E', fontSize: 11, fontWeight: '900' },
  inlineErrorText: { color: '#B45309', fontSize: 10, marginTop: 3 },
  inlineRetry: { color: '#0F766E', fontWeight: '900' },
});
