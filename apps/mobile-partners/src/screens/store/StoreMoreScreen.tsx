import React from 'react';
import { Alert, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Bell,
  BellRing,
  CalendarDays,
  Clock,
  IndianRupee,
  LogOut,
  Package,
  Store,
  Truck,
  UserCog,
  Users,
} from 'lucide-react-native';
import { StoreHubHeader, StoreHubSection, StoreHubTile } from '../../components/StoreHubKit';
import { useAuthStore } from '@aagam/mobile-shared';
import { notificationService } from '../../api/notificationService';
import { PARTNER_NOTIFICATION_QUERY_KEY } from '../PartnerNotificationsScreen';
import { partnerNavigationRef } from '../../navigation/partnerNavigationRef';
import { palette, radius, spacing } from '../../design/tokens';

/**
 * More hub — store profile, account and catalog management. Keeps secondary
 * destinations one tap away without crowding the four-destination tab bar.
 */
export function StoreMoreScreen() {
  const navigation = useNavigation<any>();
  const user = useAuthStore((state) => state.user) as any;
  const logout = useAuthStore((state) => state.logout);

  const inboxQuery = useQuery({
    queryKey: PARTNER_NOTIFICATION_QUERY_KEY,
    queryFn: () => notificationService.getInbox(1),
    refetchInterval: 15_000,
    retry: 1,
  });
  const unread = Number(inboxQuery.data?.unreadCount || 0);

  const openNotifications = () => {
    if (partnerNavigationRef.isReady()) partnerNavigationRef.navigate('Notifications');
  };

  const confirmLogout = () => {
    Alert.alert('Sign out?', 'You will need to sign in again to manage your store.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void logout() },
    ]);
  };

  const displayName = user?.name || 'Store partner';
  const displayEmail = user?.email || user?.phone || '';

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={palette.teal700} />
      <StoreHubHeader eyebrow="ACCOUNT" title="More" subtitle="Store profile, catalog and account settings." />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Store size={24} color={palette.teal700} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.profileName} numberOfLines={1}>{displayName}</Text>
            {displayEmail ? <Text style={styles.profileEmail} numberOfLines={1}>{displayEmail}</Text> : null}
          </View>
        </View>

        <StoreHubSection title="Catalog">
          <StoreHubTile
            icon={<Package size={20} />}
            title="Inventory"
            subtitle="Stock levels and product availability"
            testID="store_more_inventory"
            onPress={() => navigation.navigate('StoreInventory')}
          />
          <StoreHubTile
            icon={<Users size={20} />}
            title="Subscribers"
            subtitle="Active, paused and cancelled subscriptions"
            testID="store_more_subscribers"
            onPress={() => navigation.navigate('StoreSubscribers')}
          />
          <StoreHubTile
            icon={<IndianRupee size={20} />}
            title="Subscription plans"
            subtitle="Published milk plans and pricing"
            last
            testID="store_more_plans"
            onPress={() => navigation.navigate('StoreSubscriptionPlans')}
          />
        </StoreHubSection>

        <StoreHubSection title="Operations">
          <StoreHubTile
            icon={<Truck size={20} />}
            title="Store deliveries"
            subtitle="Self-deliver, collect cash and record failures"
            testID="store_more_deliveries"
            onPress={() => navigation.navigate('StoreDeliveries')}
          />
          <StoreHubTile
            icon={<CalendarDays size={20} />}
            title="Delivery calendar"
            subtitle="Scheduled deliveries by day"
            testID="store_more_calendar"
            onPress={() => navigation.navigate('StoreCalendar')}
          />
          <StoreHubTile
            icon={<BarChart3 size={20} />}
            title="Analytics"
            subtitle="Subscriptions, deliveries and cash by status"
            last
            testID="store_more_analytics"
            onPress={() => navigation.navigate('StoreAnalytics')}
          />
        </StoreHubSection>

        <StoreHubSection title="Account">
          <StoreHubTile
            icon={<UserCog size={20} />}
            title="Store profile & settings"
            subtitle="Update store name, address and phone"
            testID="store_more_settings"
            onPress={() => navigation.navigate('StoreSettings')}
          />
          <StoreHubTile
            icon={<Clock size={20} />}
            title="Operating hours"
            subtitle="Weekly schedule and timezone"
            testID="store_more_hours"
            onPress={() => navigation.navigate('StoreOperatingHours')}
          />
          <StoreHubTile
            icon={<Bell size={20} />}
            title="Notifications"
            subtitle="Alerts, pickups and subscription updates"
            badge={unread}
            testID="store_more_notifications"
            onPress={openNotifications}
          />
          <StoreHubTile
            icon={<BellRing size={20} />}
            title="Notification preferences"
            subtitle="Choose which events alert you"
            testID="store_more_notification_settings"
            onPress={() => navigation.navigate('StoreNotificationSettings')}
          />
          <StoreHubTile
            icon={<LogOut size={20} />}
            title="Sign out"
            subtitle="End this session"
            tone="danger"
            last
            testID="store_more_logout"
            onPress={confirmLogout}
          />
        </StoreHubSection>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: 120 },
  flex: { flex: 1, minWidth: 0 },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: palette.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.slate200,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  avatar: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: palette.teal050, alignItems: 'center', justifyContent: 'center' },
  profileName: { color: palette.slate900, fontSize: 16, fontWeight: '700' },
  profileEmail: { color: palette.slate500, fontSize: 12, marginTop: 2 },
});
