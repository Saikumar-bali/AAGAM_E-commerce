import React from 'react';
import { ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  ClipboardCheck,
  PackageCheck,
  Truck,
  UserRound,
} from 'lucide-react-native';
import { StoreHubHeader, StoreHubSection, StoreHubTile } from '../../components/StoreHubKit';
import { StoreSubscriptionPreparationModal, usePreparationSummary } from './StoreSubscriptionPreparationFab';
import { deliveryOperationsService } from '../../api/deliveryOperationsService';
import { notificationService } from '../../api/notificationService';
import { PARTNER_NOTIFICATION_QUERY_KEY } from '../PartnerNotificationsScreen';
import { partnerNavigationRef } from '../../navigation/partnerNavigationRef';
import { palette, spacing } from '../../design/tokens';

/**
 * Operations hub — the single place a store runs its day. Home stays a summary;
 * everything operational (dispatch, pickup, returns, subscription runs) drills
 * down from here so the tab bar can stay to four professional destinations.
 */
export function StoreOperationsHubScreen() {
  const navigation = useNavigation<any>();
  const [prepOpen, setPrepOpen] = React.useState(false);
  const { pending, shortages } = usePreparationSummary();
  const prepBadge = shortages || pending;

  const pickupQuery = useQuery({
    queryKey: ['store', 'pickup-waiting-badge'],
    queryFn: async () => {
      const queue = await deliveryOperationsService.getQueue();
      return queue.filter((job: any) => job.status === 'RIDER_AT_STORE').length;
    },
    refetchInterval: 10_000,
    retry: 1,
  });
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

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={palette.teal700} />
      <StoreHubHeader
        eyebrow="STORE OPERATIONS"
        title="Operations"
        subtitle="Dispatch riders, clear pickups, and run the day's deliveries."
        accessory={
          <View style={styles.headerActions}>
            <StoreHubBell unread={unread} onPress={openNotifications} />
          </View>
        }
      />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <StoreHubSection title="Dispatch & delivery">
          <StoreHubTile
            icon={<Truck size={20} />}
            title="Rider assignments"
            subtitle="Assign today's stops and dispatch routes"
            tone="primary"
            testID="store_hub_rider_assignments"
            onPress={() => navigation.navigate('StoreRiderAssignments')}
          />
          <StoreHubTile
            icon={<UserRound size={20} />}
            title="Rider pickups"
            subtitle="Confirm handover when a rider reaches the store"
            badge={Number(pickupQuery.data || 0)}
            testID="store_hub_rider_pickups"
            onPress={() => navigation.navigate('StorePickupAlerts')}
          />
          <StoreHubTile
            icon={<PackageCheck size={20} />}
            title="Delivery operations"
            subtitle="Returns, stock inspection and COD settlement"
            testID="store_hub_delivery_operations"
            onPress={() => navigation.navigate('StoreReturnsCod')}
          />
        </StoreHubSection>

        <StoreHubSection title="Preparation">
          <StoreHubTile
            icon={<ClipboardCheck size={20} />}
            title="D-1 preparation"
            subtitle="Check tomorrow's stock readiness"
            badge={prepBadge}
            last
            testID="store_hub_preparation"
            onPress={() => setPrepOpen(true)}
          />
        </StoreHubSection>
      </ScrollView>

      <StoreSubscriptionPreparationModal visible={prepOpen} onClose={() => setPrepOpen(false)} />
    </View>
  );
}

function StoreHubBell({ unread, onPress }: { unread: number; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} testID="store_hub_notifications" style={styles.headerIcon}>
      <Bell size={22} color={palette.white} />
      {unread > 0 ? (
        <View style={styles.notificationBadge}>
          <Text style={styles.notificationBadgeText}>{unread > 99 ? '99+' : unread}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: 120 },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationBadge: {
    position: 'absolute',
    right: -4,
    top: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#EF1D25',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  notificationBadgeText: { color: palette.white, fontSize: 9, fontWeight: '600' },
});
