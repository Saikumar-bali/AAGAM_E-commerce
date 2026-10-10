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
  ArrowLeft,
  Bell,
  BellRing,
  Box,
  ChartNoAxesCombined,
  ChevronRight,
  Clock3,
  Gift,
  Inbox,
  Truck,
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

type AlertVisual = {
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  color: string;
  background: string;
  label: string;
};

function errorMessage(error: any) {
  const message = error?.response?.data?.message;
  if (Array.isArray(message)) return message.join(', ');
  return message || error?.message || 'Could not load notifications.';
}

function notificationVisual(item: PartnerNotification): AlertVisual {
  const type = String(item.type || item.metadata?.eventType || '').toUpperCase();
  if (type.includes('DELAY')) return { Icon: Clock3, color: '#EA580C', background: '#FFF4EC', label: 'Delay' };
  if (type.includes('CUSTOMER') || type.includes('ADDRESS')) return { Icon: UserRound, color: '#2563EB', background: '#EDF3FF', label: 'Customer' };
  if (type.includes('DEMAND') || type.includes('SURGE')) return { Icon: ChartNoAxesCombined, color: '#7C3AED', background: '#F4EFFF', label: 'Demand' };
  if (type.includes('INCENTIVE') || type.includes('BONUS')) return { Icon: Gift, color: '#15803D', background: '#EAF8EE', label: 'Reward' };
  if (type.includes('MAINTENANCE') || type.includes('SYSTEM')) return { Icon: Wrench, color: '#475569', background: '#EEF1F4', label: 'System' };
  if (type.includes('ASSIGNMENT') || type.includes('TRIP')) return { Icon: Truck, color: '#0891B2', background: '#E6F7FB', label: 'Trip' };
  if (type.includes('DELIVERY') || type.includes('ORDER')) return { Icon: Box, color: '#0F766E', background: '#E7F5F2', label: 'Delivery' };
  return { Icon: Bell, color: '#0F766E', background: '#E7F5F2', label: 'Update' };
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
  const updatesCount = useMemo(() => items.filter((item) => isNotificationUpdate(item)).length, [items]);

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
  const subtitle = unreadCount > 0
    ? `${unreadCount} unread ${unreadCount === 1 ? 'update' : 'updates'}`
    : 'You are all caught up';

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#0F766E" />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <View style={styles.brandRow}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back" style={styles.backButton} onPress={() => navigation?.goBack?.()}>
            <ArrowLeft size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <PartnerTabBrand inverse caption={brandCaption} />
        </View>
        <View style={styles.headerTitleRow}>
          <View style={styles.titleCopy}>
            <Text style={styles.eyebrow}>NOTIFICATIONS</Text>
            <Text style={styles.title}>Alerts</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>
          <View style={styles.bellWrap}>
            <BellRing size={28} color="#FFFFFF" strokeWidth={2} />
            {unreadCount > 0 ? (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>{unreadCount > 99 ? '99+' : String(unreadCount)}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={styles.segmented}>
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
            count={updatesCount}
            onPress={() => setFilter('UPDATES')}
          />
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={(
          <RefreshControl
            refreshing={inboxQuery.isRefetching}
            onRefresh={() => void inboxQuery.refetch()}
            tintColor="#0F766E"
          />
        )}
      >
        {inboxQuery.isLoading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator size="large" color="#0F766E" />
            <Text style={styles.stateText}>Loading alerts…</Text>
          </View>
        ) : inboxQuery.isError ? (
          <View style={styles.stateCard}>
            <View style={[styles.stateIcon, { backgroundColor: '#FDECEC' }]}>
              <Bell size={30} color="#DC2626" strokeWidth={2} />
            </View>
            <Text style={styles.stateTitle}>Alerts unavailable</Text>
            <Text style={styles.stateText}>{errorMessage(inboxQuery.error)}</Text>
            <TouchableOpacity style={styles.retry} onPress={() => void inboxQuery.refetch()}>
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : filteredItems.length === 0 ? (
          <View style={styles.stateCard}>
            <View style={[styles.stateIcon, { backgroundColor: '#E7F5F2' }]}>
              <Inbox size={30} color="#0F766E" strokeWidth={2} />
            </View>
            <Text style={styles.stateTitle}>No alerts in this view</Text>
            <Text style={styles.stateText}>
              {filter === 'UNREAD'
                ? 'Every alert here has been read. Switch to All to review the history.'
                : 'New jobs and rider updates will appear here.'}
            </Text>
          </View>
        ) : (
          (['TODAY', 'YESTERDAY', 'OLDER'] as const).map((section) => (
            groupedItems[section].length ? (
              <View key={section} style={styles.section}>
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionTitle}>{sectionTitle(section)}</Text>
                  <View style={styles.sectionCount}>
                    <Text style={styles.sectionCountText}>{groupedItems[section].length}</Text>
                  </View>
                </View>
                <View style={styles.sectionCards}>
                  {groupedItems[section].map((item) => (
                    <AlertCard
                      key={item.id}
                      item={item}
                      busy={markReadMutation.isPending}
                      onPress={() => markReadMutation.mutate(item)}
                    />
                  ))}
                </View>
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
      accessibilityState={{ selected: active }}
      style={[styles.filterButton, active && styles.filterButtonActive]}
      onPress={onPress}
    >
      <Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text>
      {typeof count === 'number' ? (
        <View style={[styles.filterCount, active && styles.filterCountActive]}>
          <Text style={[styles.filterCountText, active && styles.filterCountTextActive]}>{count}</Text>
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
  const unread = !item.readAt;
  return (
    <TouchableOpacity
      testID={`partner_notification_${item.id}`}
      activeOpacity={0.8}
      disabled={busy}
      style={[styles.alertCard, unread && styles.alertCardUnread]}
      onPress={onPress}
    >
      {unread ? <View style={[styles.unreadAccent, { backgroundColor: visual.color }]} /> : null}
      <View style={[styles.alertIcon, { backgroundColor: visual.background }]}>
        <Icon size={22} color={visual.color} strokeWidth={2.2} />
      </View>
      <View style={styles.alertCopy}>
        <View style={styles.alertTopRow}>
          <Text style={[styles.alertCategory, { color: visual.color }]} numberOfLines={1}>
            {visual.label.toUpperCase()}
          </Text>
          <Text style={styles.alertTime}>{formatAlertTime(item.createdAt)}</Text>
        </View>
        <Text style={styles.alertTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.alertBody} numberOfLines={2}>{item.body}</Text>
      </View>
      <View style={styles.alertTail}>
        {unread ? <View style={styles.unreadDot} /> : <ChevronRight size={18} color="#C3C9CF" />}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F6F8F7' },
  header: {
    backgroundColor: '#0F766E',
    paddingHorizontal: 18,
    paddingBottom: 16,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
  },
      brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
    backButton: { width: 40, height: 40, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  titleCopy: { flex: 1 },
  eyebrow: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  title: { color: '#FFFFFF', fontSize: 30, fontWeight: '700', letterSpacing: -0.5, marginTop: 2 },
  subtitle: { color: 'rgba(255,255,255,0.86)', fontSize: 13, fontWeight: '500', marginTop: 4 },
  bellWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  bellBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 5,
    borderRadius: 11,
    backgroundColor: '#EF1D25',
    borderWidth: 2,
    borderColor: '#0F766E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  segmented: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 16,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 15,
    padding: 4,
  },
  filterButton: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  filterButtonActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#003C2A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 6,
    elevation: 3,
  },
  filterText: { color: 'rgba(255,255,255,0.94)', fontSize: 14, fontWeight: '600' },
  filterTextActive: { color: '#0F766E' },
  filterCount: {
    minWidth: 24,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 7,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterCountActive: { backgroundColor: '#E7F5F2' },
  filterCountText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  filterCountTextActive: { color: '#0F766E' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 116 },
  section: { marginBottom: 18 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  sectionTitle: { color: '#0F172A', fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  sectionCount: {
    minWidth: 22,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 7,
    backgroundColor: '#E7EDEA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionCountText: { color: '#556059', fontSize: 11, fontWeight: '700' },
  sectionCards: { gap: 9 },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E6EAE8',
    backgroundColor: '#FFFFFF',
    padding: 13,
    overflow: 'hidden',
    shadowColor: '#1D2C27',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  alertCardUnread: {
    borderColor: '#D3E9E3',
    backgroundColor: '#F3FAF8',
  },
  unreadAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  alertIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertCopy: { flex: 1, paddingHorizontal: 12 },
  alertTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  alertCategory: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.7 },
  alertTime: { color: '#7A828B', fontSize: 11.5, fontWeight: '500' },
  alertTitle: { color: '#0B1210', fontSize: 15, fontWeight: '700', marginTop: 3, letterSpacing: -0.2 },
  alertBody: { color: '#5A626B', fontSize: 12.5, lineHeight: 18, marginTop: 3 },
  alertTail: { width: 20, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#16A34A' },
  stateCard: {
    minHeight: 320,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  stateIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  stateTitle: { color: '#0F172A', fontSize: 17, fontWeight: '700' },
  stateText: { color: '#69717B', textAlign: 'center', marginTop: 8, lineHeight: 20, maxWidth: 280 },
  retry: {
    marginTop: 18,
    height: 42,
    paddingHorizontal: 22,
    borderRadius: 12,
    backgroundColor: '#0F766E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
