import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BriefcaseBusiness,
  MapPin,
  Menu,
  SlidersHorizontal,
} from 'lucide-react-native';
import React, { useMemo } from 'react';
import Toast from 'react-native-toast-message';
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
import { useAuthStore } from '@aagam/mobile-shared';
import { riderService } from '../../api/riderService';
import {
  RiderJobListItem,
  buildTodayJobList,
  shortPartnerOrderId,
  summarizeTodayJobs,
} from '../../domain/riderReferenceUi';
import { RiderOnlineService } from '../../services/RiderOnlineService';

const WORKSPACE_KEY = ['rider', 'delivery-workspace'] as const;

function statusVisual(status: RiderJobListItem['status']) {
  if (status === 'COMPLETED') return { label: 'Completed', color: '#128A35', background: '#E8F8E8', dot: '#15A83B' };
  if (status === 'IN_PROGRESS') return { label: 'In Progress', color: '#176AD0', background: '#EAF3FF', dot: '#2879F3' };
  if (status === 'PENDING') return { label: 'Pending', color: '#ED7607', background: '#FFF2E5', dot: '#FF8500' };
  if (status === 'CANCELLED') return { label: 'Cancelled', color: '#D51D25', background: '#FFE9EA', dot: '#E6212A' };
  if (status === 'RETURNED') return { label: 'Returned', color: '#E97607', background: '#FFF1E4', dot: '#EF7E0A' };
  return { label: 'Assigned', color: '#168530', background: '#EAF8E8', dot: '#1CB238' };
}

function errorMessage(error: any) {
  const value = error?.response?.data?.message;
  if (Array.isArray(value)) return value.join(', ');
  return value || error?.message || 'Could not update availability.';
}

function jobTime(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

export const RiderJobsScreen = ({
  onOpenActive,
  onOpenHistory,
  onOpenDashboard,
}: {
  onOpenActive: () => void;
  onOpenHistory: () => void;
  onOpenDashboard: () => void;
}) => {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const workspaceQuery = useQuery({
    queryKey: WORKSPACE_KEY,
    queryFn: riderService.getWorkspace,
    refetchInterval: 8_000,
  });
  const workspace = workspaceQuery.data;
  const jobs = useMemo(() => buildTodayJobList(workspace), [workspace]);
  const summary = useMemo(() => summarizeTodayJobs(jobs), [jobs]);
  const isOnline = Boolean(workspace?.rider && workspace.rider.status !== 'OFFLINE');

  const availabilityMutation = useMutation({
    mutationFn: async () => {
      if (isOnline) {
        await RiderOnlineService.stop().catch(() => false);
        return riderService.updateMyStatus('OFFLINE');
      }
      const result = await riderService.updateMyStatus('ONLINE');
      await RiderOnlineService.start(user?.name || 'Aagaam Rider');
      return result;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY });
      Toast.show({
        type: 'success',
        text1: isOnline ? 'You are offline' : 'You are online',
        text2: isOnline ? 'New delivery offers are paused.' : 'You can now receive delivery offers.',
      });
    },
    onError: (error: any) => Toast.show({
      type: 'error',
      text1: 'Availability update failed',
      text2: errorMessage(error),
    }),
  });

  const openJob = (item: RiderJobListItem) => {
    if (workspace?.activeJob?.id && item.job?.id === workspace.activeJob.id) {
      onOpenActive();
      return;
    }
    if (item.offer?.status === 'OFFERED') {
      onOpenDashboard();
      return;
    }
    onOpenHistory();
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#067B5C" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={(
          <RefreshControl
            refreshing={workspaceQuery.isRefetching}
            onRefresh={() => void workspaceQuery.refetch()}
            tintColor="#FFFFFF"
          />
        )}
      >
        <View style={styles.hero}>
          <View style={styles.headerRow}>
            <TouchableOpacity accessibilityLabel="Open dashboard" style={styles.headerIcon} onPress={onOpenDashboard}>
              <Menu size={30} color="#FFFFFF" />
            </TouchableOpacity>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>Today's Jobs</Text>
              <Text style={styles.dateText}>
                {new Date().toLocaleDateString('en-IN', { month: 'long', day: 'numeric', year: 'numeric' })}
              </Text>
            </View>
            <TouchableOpacity accessibilityLabel="Open delivery history" style={styles.headerIcon} onPress={onOpenHistory}>
              <SlidersHorizontal size={28} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <View style={styles.summaryCard}>
            <SummaryItem value={summary.assigned} label="Assigned" color="#078D32" />
            <SummaryDivider />
            <SummaryItem value={summary.completed} label="Completed" color="#2469D8" />
            <SummaryDivider />
            <SummaryItem value={summary.inProgress} label="In Progress" color="#F07A00" />
            <SummaryDivider />
            <SummaryItem value={summary.pending} label="Pending" color="#D71923" />
          </View>
          <Text style={styles.jobListTitle}>Job List</Text>
        </View>

        <View style={styles.listArea}>
          {workspaceQuery.isLoading ? (
            <View style={styles.stateCard}>
              <ActivityIndicator size="large" color="#078D63" />
              <Text style={styles.stateText}>Loading today's jobs…</Text>
            </View>
          ) : workspaceQuery.isError ? (
            <View style={styles.stateCard}>
              <Text style={styles.stateTitle}>Jobs unavailable</Text>
              <Text style={styles.stateText}>{errorMessage(workspaceQuery.error)}</Text>
            </View>
          ) : jobs.length === 0 ? (
            <View style={styles.stateCard}>
              <BriefcaseBusiness size={42} color="#8E9894" />
              <Text style={styles.stateTitle}>No jobs assigned today</Text>
              <Text style={styles.stateText}>Stay online to receive delivery offers.</Text>
            </View>
          ) : (
            jobs.map((item) => <JobCard key={item.key} item={item} onPress={() => openJob(item)} />)
          )}

          <TouchableOpacity
            testID="rider_jobs_availability_button"
            disabled={availabilityMutation.isPending}
            style={styles.onlineButton}
            onPress={() => availabilityMutation.mutate()}
          >
            {availabilityMutation.isPending
              ? <ActivityIndicator color="#FFFFFF" />
              : <Text style={styles.onlineButtonText}>{isOnline ? 'Go Offline' : 'Go Online'}</Text>}
          </TouchableOpacity>
          <View style={styles.onlineStateRow}>
            <View style={[styles.onlineStateDot, !isOnline && styles.offlineStateDot]} />
            <Text style={[styles.onlineStateText, !isOnline && styles.offlineStateText]}>
              You are currently {isOnline ? 'online' : 'offline'}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

function SummaryItem({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={[styles.summaryValue, { color }]}>{String(value).padStart(2, '0')}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function SummaryDivider() {
  return <View style={styles.summaryDivider} />;
}

function JobCard({ item, onPress }: { item: RiderJobListItem; onPress: () => void }) {
  const visual = statusVisual(item.status);
  return (
    <TouchableOpacity
      testID="rider_jobs_card"
      activeOpacity={0.78}
      style={styles.jobCard}
      onPress={onPress}
    >
      <View style={styles.cardTopRow}>
        <View style={[styles.timelineDot, { backgroundColor: visual.dot }]} />
        <Text style={styles.timeText}>{jobTime(item.time)}</Text>
        <Text style={styles.orderId}>#J-{shortPartnerOrderId(item.orderId)}</Text>
        <View style={[styles.statusPill, { backgroundColor: visual.background }]}>
          <Text style={[styles.statusPillText, { color: visual.color }]}>{visual.label}</Text>
        </View>
      </View>

      <View style={styles.routeRow}>
        <View style={styles.routeTimeline}>
          <View style={styles.locationCircle}><MapPin size={18} color="#078D32" fill="#078D32" /></View>
          <View style={styles.routeLine} />
          <View style={styles.locationCircle}><MapPin size={18} color="#078D32" fill="#078D32" /></View>
        </View>
        <View style={styles.routeCopy}>
          <View style={styles.routeBlock}>
            <Text style={styles.routeLabel}>Pickup</Text>
            <Text style={styles.routeName}>{item.pickupName}</Text>
            <Text style={styles.routeAddress}>{item.pickupAddress}</Text>
          </View>
          <View style={styles.routeBlock}>
            <Text style={styles.routeLabel}>Delivery</Text>
            <Text style={styles.routeName}>{item.deliveryAddress}</Text>
          </View>
        </View>
        {item.distanceKm != null ? (
          <Text style={styles.distance}>{item.distanceKm.toFixed(1)} km</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F8F7' },
  scroll: { flex: 1 },
  content: { paddingBottom: 112 },
  hero: { backgroundColor: '#067B5C', paddingTop: 52, paddingHorizontal: 16, paddingBottom: 34 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  headerIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, paddingLeft: 8 },
  title: { color: '#FFFFFF', fontSize: 23, fontWeight: '900' },
  dateText: { color: '#FFFFFF', fontSize: 16, marginTop: 4 },
  summaryCard: {
    marginTop: 16,
    height: 102,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    elevation: 4,
  },
  summaryItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  summaryValue: { fontSize: 27, fontWeight: '900' },
  summaryLabel: { color: '#454A4D', fontSize: 12, marginTop: 4, textAlign: 'center' },
  summaryDivider: { width: 1, height: 58, backgroundColor: '#E2E4E3' },
  jobListTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', marginTop: 19, marginLeft: 4 },
  listArea: { marginTop: -21, paddingHorizontal: 16 },
  jobCard: {
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E1E4E3',
    padding: 15,
    marginBottom: 12,
    elevation: 3,
    shadowColor: '#1B2A25',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timelineDot: { width: 8, height: 8, borderRadius: 4 },
  timeText: { color: '#424A50', fontSize: 13 },
  orderId: { color: '#111111', fontSize: 14, fontWeight: '900', flex: 1 },
  statusPill: { borderRadius: 999, paddingHorizontal: 13, paddingVertical: 7 },
  statusPillText: { fontSize: 12, fontWeight: '900' },
  routeRow: { flexDirection: 'row', marginTop: 14, minHeight: 112 },
  routeTimeline: { width: 48, alignItems: 'center', paddingVertical: 2 },
  locationCircle: { width: 31, height: 31, borderRadius: 16, backgroundColor: '#EFFCEF', borderWidth: 1, borderColor: '#CCEACC', alignItems: 'center', justifyContent: 'center' },
  routeLine: { width: 1, flex: 1, borderLeftWidth: 1, borderStyle: 'dashed', borderColor: '#B7C2BC' },
  routeCopy: { flex: 1, justifyContent: 'space-between', paddingVertical: 2 },
  routeBlock: { minHeight: 45 },
  routeLabel: { color: '#078D32', fontSize: 11, fontWeight: '800' },
  routeName: { color: '#111111', fontSize: 14, fontWeight: '800', marginTop: 2 },
  routeAddress: { color: '#333B40', fontSize: 12, lineHeight: 17, marginTop: 1 },
  distance: { alignSelf: 'flex-end', color: '#3B4145', fontSize: 13, marginBottom: 7 },
  stateCard: { minHeight: 220, borderRadius: 18, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', padding: 24, marginBottom: 12 },
  stateTitle: { color: '#101513', fontSize: 17, fontWeight: '900', marginTop: 10 },
  stateText: { color: '#6B7470', textAlign: 'center', marginTop: 6 },
  onlineButton: { height: 50, borderRadius: 12, backgroundColor: '#067B5C', alignItems: 'center', justifyContent: 'center', marginTop: 3 },
  onlineButtonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  onlineStateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 8 },
  onlineStateDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#1CB238' },
  offlineStateDot: { backgroundColor: '#A8AFAC' },
  onlineStateText: { color: '#078D32', fontSize: 12, fontWeight: '700' },
  offlineStateText: { color: '#707975' },
});
