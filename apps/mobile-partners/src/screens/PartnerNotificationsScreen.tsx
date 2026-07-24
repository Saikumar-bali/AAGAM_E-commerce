import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { ArrowLeft, Bell, CheckCheck, ChevronRight, RefreshCw } from 'lucide-react-native';
import { useAuthStore } from '@aagam/mobile-shared';
import { notificationService, PartnerNotification } from '../api/notificationService';

export const PARTNER_NOTIFICATION_QUERY_KEY = ['partner-notifications'] as const;

function eventLabel(value: string) {
  return String(value || 'UPDATE')
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function errorMessage(error: any) {
  const message = error?.response?.data?.message;
  if (Array.isArray(message)) return message.join(', ');
  return message || error?.message || 'Could not load notifications.';
}

export const PartnerNotificationsScreen = ({ navigation }: { navigation?: any }) => {
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const inboxQuery = useQuery({
    queryKey: PARTNER_NOTIFICATION_QUERY_KEY,
    queryFn: () => notificationService.getInbox(100),
    refetchInterval: 15_000,
    retry: 1,
  });
  const items = inboxQuery.data?.items || [];
  const unreadCount = Number(inboxQuery.data?.unreadCount || 0);

  const markReadMutation = useMutation({
    mutationFn: async (item: PartnerNotification) => {
      if (!item.readAt) await notificationService.markRead(item.sourceHistoryId || item.id);
      if (item.recipientId) await notificationService.markOpened(item.recipientId).catch(() => undefined);
      return item;
    },
    onSuccess: async (item) => {
      await queryClient.invalidateQueries({ queryKey: PARTNER_NOTIFICATION_QUERY_KEY });
      const eventType = String(item.type || item.metadata?.eventType || '');
      if (user?.role === 'STORE_OWNER' && eventType === 'ORDER_PLACED') {
        navigation?.navigate?.('StoreTabs', { screen: 'Orders', params: { screen: 'OrderQueue', params: { storeId: item.metadata?.storeId } } });
      } else if (user?.role === 'RIDER' && eventType === 'ASSIGNMENT_OFFERED') {
        navigation?.navigate?.('RiderTabs', { screen: 'Dashboard' });
      }
    },
    onError: (error: any) => Toast.show({ type: 'error', text1: 'Could not open notification', text2: errorMessage(error) }),
  });

  const recentCount = useMemo(() => items.filter((item) => Date.now() - new Date(item.createdAt).getTime() < 24 * 60 * 60 * 1000).length, [items]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity testID="partner_notifications_back" style={styles.backButton} onPress={() => navigation?.goBack?.()}>
          <ArrowLeft size={21} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>{user?.role === 'RIDER' ? 'RIDER ALERTS' : 'STORE ALERTS'}</Text>
          <Text style={styles.title}>Notifications</Text>
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={() => void inboxQuery.refetch()}><RefreshCw size={20} color="#FFFFFF" /></TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={inboxQuery.isRefetching} onRefresh={() => void inboxQuery.refetch()} />}
      >
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}><Text style={styles.summaryLabel}>Unread</Text><Text style={styles.summaryValue}>{unreadCount}</Text></View>
          <View style={styles.summaryCard}><Text style={styles.summaryLabel}>Last 24 hours</Text><Text style={styles.summaryValue}>{recentCount}</Text></View>
        </View>

        {inboxQuery.isLoading ? (
          <View style={styles.centerState}><ActivityIndicator size="large" color="#0F766E" /><Text style={styles.centerText}>Loading alerts…</Text></View>
        ) : inboxQuery.isError ? (
          <View style={styles.emptyCard}><Bell size={42} color="#B91C1C" /><Text style={styles.emptyTitle}>Notifications unavailable</Text><Text style={styles.emptyText}>{errorMessage(inboxQuery.error)}</Text></View>
        ) : !items.length ? (
          <View style={styles.emptyCard}><Bell size={48} color="#CBD5E1" /><Text style={styles.emptyTitle}>No notifications yet</Text><Text style={styles.emptyText}>{user?.role === 'RIDER' ? 'Addressed delivery offers and rider updates will appear here.' : 'New customer orders and rider handoff updates will appear here.'}</Text></View>
        ) : (
          items.map((item) => (
            <TouchableOpacity
              testID={`partner_notification_${item.id}`}
              key={item.id}
              style={[styles.notificationCard, !item.readAt && styles.unreadCard]}
              activeOpacity={0.75}
              onPress={() => markReadMutation.mutate(item)}
            >
              <View style={styles.notificationTop}>
                <View style={[styles.bellBox, !item.readAt && styles.bellUnread]}><Bell size={19} color={item.readAt ? '#64748B' : '#FFFFFF'} /></View>
                <View style={{ flex: 1 }}>
                  <View style={styles.typeRow}>
                    <Text style={styles.typeText}>{eventLabel(item.type)}</Text>
                    {!item.readAt ? <View style={styles.unreadDot} /> : null}
                  </View>
                  <Text style={styles.notificationTitle}>{item.title}</Text>
                  <Text style={styles.notificationBody}>{item.body}</Text>
                </View>
                <ChevronRight size={18} color="#64748B" />
              </View>
              <View style={styles.notificationFooter}>
                <Text style={styles.notificationTime}>{new Date(item.createdAt).toLocaleString('en-IN')}</Text>
                {!item.readAt ? <View style={styles.readAction}><CheckCheck size={13} color="#0F766E" /><Text style={styles.readActionText}>Open & mark read</Text></View> : null}
              </View>
            </TouchableOpacity>
          ))
        )}
        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { backgroundColor: '#0F172A', paddingTop: 52, paddingBottom: 18, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backButton: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  refreshButton: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  eyebrow: { color: '#5EEAD4', fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: '#FFFFFF', fontSize: 23, fontWeight: '900', marginTop: 3 },
  scroll: { flex: 1 },
  content: { padding: 16 },
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 15 },
  summaryCard: { flex: 1, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 16 },
  summaryLabel: { color: '#64748B', fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  summaryValue: { color: '#0F172A', fontSize: 26, fontWeight: '900', marginTop: 6 },
  centerState: { minHeight: 320, alignItems: 'center', justifyContent: 'center', gap: 12 },
  centerText: { color: '#64748B', fontWeight: '700' },
  emptyCard: { minHeight: 320, borderRadius: 24, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', padding: 28 },
  emptyTitle: { color: '#0F172A', fontSize: 18, fontWeight: '900', marginTop: 12 },
  emptyText: { color: '#64748B', textAlign: 'center', lineHeight: 20, marginTop: 6 },
  notificationCard: { borderRadius: 21, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', padding: 15, marginBottom: 11 },
  unreadCard: { borderColor: '#99F6E4', backgroundColor: '#F0FDFA' },
  notificationTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  bellBox: { width: 41, height: 41, borderRadius: 13, backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
  bellUnread: { backgroundColor: '#0F766E' },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  typeText: { color: '#0F766E', fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  unreadDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#EF4444' },
  notificationTitle: { color: '#0F172A', fontSize: 15, fontWeight: '900', marginTop: 5 },
  notificationBody: { color: '#475569', fontSize: 12, lineHeight: 18, marginTop: 4, fontWeight: '600' },
  notificationFooter: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E2E8F0', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  notificationTime: { color: '#94A3B8', fontSize: 9, flex: 1 },
  readAction: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  readActionText: { color: '#0F766E', fontSize: 9, fontWeight: '900' },
});
