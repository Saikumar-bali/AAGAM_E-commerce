import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import {
  Bell,
  Box,
  ChartNoAxesCombined,
  Clock3,
  Gift,
  UserRound,
  Wrench,
} from 'lucide-react-native';
import { useAuthStore } from '@aagam/mobile-shared';
import { notificationService, PartnerNotification } from '../api/notificationService';
import { PartnerTabBrand } from '../components/PartnerTabBrand';
import {
  isNotificationUpdate,
  notificationSection,
} from '../domain/riderReferenceUi';
import {
  navigationCommandForNotification,
  normalizeNotificationNavigation,
} from '../domain/partnerNotifications';
import { navigatePartnerCommand } from '../navigation/partnerNavigationCommands';

export const PARTNER_NOTIFICATION_QUERY_KEY = ['partner-notifications'] as const;

type AlertFilter = 'ALL' | 'UNREAD' | 'UPDATES';

function errorMessage(error: any) {
  const message = error?.response?.data?.message;
  if (Array.isArray(message)) return message.join(', ');
  return message || error?.message || 'Could not load notifications.';
}

function notificationVisual(item: PartnerNotification) {
  const type = String(item.type || item.metadata?.eventType || '').toUpperCase();
  if (type.includes('DELAY')) return { Icon: Clock3, color: '#F97316', background: '#FFF1E7' };
  if (type.includes('CUSTOMER') || type.includes('ADDRESS')) return { Icon: UserRound, color: '#2879F3', background: '#EAF3FF' };
  if (type.includes('DEMAND') || type.includes('SURGE')) return { Icon: ChartNoAxesCombined, color: '#7C3AED', background: '#F2ECFF' };
  if (type.includes('INCENTIVE') || type.includes('BONUS')) return { Icon: Gift, color: '#28A32B', background: '#EAF8E8' };
  if (type.includes('MAINTENANCE') || type.includes('SYSTEM')) return { Icon: Wrench, color: '#59636F', background: '#EEF1F4' };
  return { Icon: Box, color: '#078D63', background: '#E9F9EC' };
}

function formatAlertTime(value: string) {
  return new Date(value).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function sectionTitle(section: 'TODAY' | 'YESTERDAY' | 'OLDER') {
  if (section === 'TODAY') return 'Today';
  if (section === 'YESTERDAY') return 'Yesterday';
  return 'Earlier';
}

function notificationNavigationData(item: PartnerNotification): Record<string, unknown> {
  const metadata = item.metadata || {};
  return {
    ...metadata,
    id: item.id,
    notificationId: item.id,
    recipientId: item.recipientId || item.id,
    eventType: item.type,
    target: item.target,
    action: item.action,
    deepLink: item.deepLink,
    orderId: item.orderId ?? metadata.orderId,
    deliveryJobId: item.deliveryJobId ?? metadata.deliveryJobId,
    assignmentId: item.assignmentId ?? metadata.assignmentId,
    ticketId: item.ticketId ?? metadata.ticketId,
    storeId: item.storeId ?? metadata.storeId,
  };
}

function openTypedWorkspace(item: PartnerNotification): boolean {
  const payload = normalizeNotificationNavigation(notificationNavigationData(item));
  return navigatePartnerCommand(navigationCommandForNotification(payload));
}

export const PartnerNotificationsScreen = ({ navigation }: { navigation?: any }) => {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<AlertFilter>('ALL');
  const inboxQuery = useQuery({
    queryKey: PARTNER_NOTIFICATION_QUERY_KEY,
    queryFn: () => notificationService.getInbox(100),
    refetchInterval: 15_000,
    retry: 1,
  });
  const items = inboxQuery.data?.items || [];
  const unreadCount = Number(inboxQuery.data?.unreadCount || 0);

  const openRoleWorkspace = (item: PartnerNotification) => {
    const eventType = String(item.type || item.metadata?.eventType || '');
    const rootNavigation = navigation?.getParent?.() || navigation;
    if (user?.role === 'STORE_OWNER') {
      if (eventType === 'RIDER_AT_STORE' || eventType === 'PICKUP_VERIFIED') {
        rootNavigation?.navigate?.('StoreTabs', { screen: 'StorePickupVerification' });
        return;
      }
    }
    if (openTypedWorkspace(item)) return;
    if (user?.role === 'STORE_OWNER') {
      if (eventType === 'ORDER_PLACED' || eventType.startsWith('ORDER_')) {
        rootNavigation?.navigate?.('StoreTabs', {
          screen: 'Orders',
          params: {
            screen: 'OrderQueue',
            params: { storeId: item.metadata?.storeId ? String(item.metadata.storeId) : undefined },
          },
        });
        return;
      }
    }
    if (user?.role === 'RIDER' && (
      eventType === 'ASSIGNMENT_OFFERED'
      || eventType.startsWith('ASSIGNMENT_')
      || eventType.startsWith('DELIVERY_')
    )) {
      rootNavigation?.navigate?.('RiderTabs', { screen: 'Operations' });
    }
  };

  const markReadMutation = useMutation({
    mutationFn: async (item: PartnerNotification) => {
      if (!item.readAt) await notificationService.markRead(item.sourceHistoryId || item.id);
      if (item.recipientId) await notificationService.markOpened(item.recipientId).catch(() => undefined);
      return item;
    },
    onSuccess: async (item) => {
      await queryClient.invalidateQueries({ queryKey: PARTNER_NOTIFICATION_QUERY_KEY });
      openRoleWorkspace(item);
    },
    onError: (error: any) => Toast.show({
      type: 'error',
      text1: 'Could not open notification',
      text2: errorMessage(error),
    }),
  });

  const filteredItems = useMemo(() => items.filter((item) => {
    if (filter === 'UNREAD') return !item.readAt;
    if (filter === 'UPDATES') return isNotificationUpdate(item);
    return true;
  }), [filter, items]);

  const groupedItems = useMemo(() => {
    const groups: Record<'TODAY' | 'YESTERDAY' | 'OLDER', PartnerNotification[]> = {
      TODAY: [],
      YESTERDAY: [],
      OLDER: [],
    };
    filteredItems.forEach((item) => groups[notificationSection(item.createdAt)].push(item));
    return groups;
  }, [filteredItems]);

  const brandCaption = user?.role === 'STORE_OWNER' ? 'STORE PARTNER' : 'RIDER PARTNER';

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#067B5C" />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <PartnerTabBrand inverse caption={brandCaption} style={styles.brandRow} />
        <View style={styles.headerTitleRow}>
          <Text style={styles.title}>Alerts</Text>
          <Bell size={34} color="#FFFFFF" strokeWidth={2} />
        </View>
        <View style={styles.filters}>
          <FilterButton
            active={filter === 'ALL'}
            label="All"
            count={items.length}
            onPress={() => setFilter('ALL')}
          />
          <FilterButton
            active={filter === 'UNREAD'}
            label="Unread"
            count={unreadCount}
            onPress={() => setFilter('UNREAD')}
          />
          <FilterButton
            active={filter === 'UPDATES'}
            label="Updates"
            onPress={() => setFilter('UPDATES')}
          />
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={(
          <RefreshControl
            refreshing={inboxQuery.isRefetching}
            onRefresh={() => void inboxQuery.refetch()}
            tintColor="#078D63"
          />
        )}
      >
        {inboxQuery.isLoading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator size="large" color="#078D63" />
            <Text style={styles.stateText}>Loading alerts…</Text>
          </View>
        ) : inboxQuery.isError ? (
          <View style={styles.stateCard}>
            <Bell size={42} color="#DC2626" />
            <Text style={styles.stateTitle}>Alerts unavailable</Text>
            <Text style={styles.stateText}>{errorMessage(inboxQuery.error)}</Text>
          </View>
        ) : filteredItems.length === 0 ? (
          <View style={styles.stateCard}>
            <Bell size={45} color="#AAB2BC" />
            <Text style={styles.stateTitle}>No alerts in this view</Text>
            <Text style={styles.stateText}>New jobs and rider updates will appear here.</Text>
          </View>
        ) : (
          (['TODAY', 'YESTERDAY', 'OLDER'] as const).map((section) => (
            groupedItems[section].length ? (
              <View key={section} style={styles.section}>
                <Text style={styles.sectionTitle}>{sectionTitle(section)}</Text>
                {groupedItems[section].map((item) => (
                  <AlertCard
                    key={item.id}
                    item={item}
                    busy={markReadMutation.isPending}
                    onPress={() => markReadMutation.mutate(item)}
                  />
                ))}
              </View>
            ) : null
          ))
        )}
      </ScrollView>
    </View>
  );
};

function FilterButton({
  active,
  label,
  count,
  onPress,
}: {
  active: boolean;
  label: string;
  count?: number;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      style={[styles.filterButton, active && styles.filterButtonActive]}
      onPress={onPress}
    >
      <Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text>
      {typeof count === 'number' ? (
        <View style={styles.filterCount}>
          <Text style={styles.filterCountText}>{count}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

function AlertCard({
  item,
  busy,
  onPress,
}: {
  item: PartnerNotification;
  busy: boolean;
  onPress: () => void;
}) {
  const visual = notificationVisual(item);
  const Icon = visual.Icon;
  return (
    <TouchableOpacity
      testID={`partner_notification_${item.id}`}
      activeOpacity={0.78}
      disabled={busy}
      style={styles.alertCard}
      onPress={onPress}
    >
      <View style={[styles.alertIcon, { backgroundColor: visual.background }]}>
        <Icon size={30} color={visual.color} strokeWidth={2.2} />
      </View>
      <View style={styles.alertCopy}>
        <Text style={styles.alertTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.alertBody} numberOfLines={2}>{item.body}</Text>
      </View>
      <View style={styles.alertMeta}>
        <Text style={styles.alertTime}>{formatAlertTime(item.createdAt)}</Text>
        {!item.readAt ? <View style={styles.unreadDot} /> : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8F9F8' },
  header: {
    backgroundColor: '#067B5C',
    paddingHorizontal: 18,
    paddingBottom: 18,
  },
  brandRow: { marginBottom: 17 },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { color: '#FFFFFF', fontSize: 31, fontWeight: '800' },
  filters: { flexDirection: 'row', gap: 9, marginTop: 22 },
  filterButton: {
    flex: 1,
    height: 50,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.36)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  filterButtonActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
    elevation: 3,
  },
  filterText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  filterTextActive: { color: '#086D51' },
  filterCount: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 7,
    backgroundColor: '#98E95D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterCountText: { color: '#076440', fontSize: 14, fontWeight: '900' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 17, paddingTop: 14, paddingBottom: 116 },
  section: { marginBottom: 13 },
  sectionTitle: { color: '#111111', fontSize: 17, fontWeight: '800', marginVertical: 10 },
  alertCard: {
    minHeight: 91,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E1E4E3',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 11,
    marginBottom: 9,
    shadowColor: '#1D2C27',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 7,
    elevation: 2,
  },
  alertIcon: {
    width: 54,
    height: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertCopy: { flex: 1, paddingHorizontal: 13 },
  alertTitle: { color: '#080808', fontSize: 16, fontWeight: '900' },
  alertBody: { color: '#555C64', fontSize: 13, lineHeight: 19, marginTop: 3 },
  alertMeta: { alignItems: 'flex-end', justifyContent: 'space-between', alignSelf: 'stretch', paddingVertical: 4 },
  alertTime: { color: '#5C636B', fontSize: 12 },
  unreadDot: { width: 13, height: 13, borderRadius: 7, backgroundColor: '#2DB72E' },
  stateCard: { minHeight: 330, alignItems: 'center', justifyContent: 'center', padding: 28 },
  stateTitle: { color: '#111827', fontSize: 18, fontWeight: '900', marginTop: 12 },
  stateText: { color: '#69717B', textAlign: 'center', marginTop: 7, lineHeight: 20 },
});
