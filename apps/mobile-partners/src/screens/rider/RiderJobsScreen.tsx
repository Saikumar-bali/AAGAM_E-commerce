import { useAuthStore } from '@aagam/mobile-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BriefcaseBusiness, CalendarClock, FileCheck2, MapPin, Menu, SlidersHorizontal } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { riderService, RIDER_WORKSPACE_QUERY_KEY } from '../../api/riderService';
import { PartnerTabBrand } from '../../components/PartnerTabBrand';
import {
  RiderJobListItem,
  buildTodayJobList,
  shortPartnerOrderId,
  summarizeTodayJobs,
} from '../../domain/riderReferenceUi';
import { RiderOnlineService } from '../../services/RiderOnlineService';

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
  return Array.isArray(value) ? value.join(', ') : value || error?.message || 'Could not update Rider jobs.';
}

function jobTime(value: string | null) {
  return value ? new Date(value).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '—';
}

export const RiderJobsScreen = ({
  onOpenActive,
  onOpenHistory,
  onOpenDashboard,
  onOpenReceipt,
}: {
  onOpenActive: (deliveryJobId: string) => void;
  onOpenHistory: () => void;
  onOpenDashboard: () => void;
  onOpenReceipt: (deliveryJobId: string) => void;
}) => {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const [lastCompleted, setLastCompleted] = useState<string | null>(null);
  const workspaceQuery = useQuery({
    queryKey: RIDER_WORKSPACE_QUERY_KEY,
    queryFn: riderService.getWorkspace,
    refetchInterval: 8_000,
  });
  const receiptQuery = useQuery({
    queryKey: ['rider', 'restorable-receipt', lastCompleted],
    queryFn: () => riderService.getReceipt(lastCompleted!),
    enabled: Boolean(lastCompleted),
    retry: 1,
  });

  useEffect(() => {
    if (!user?.id) return;
    let mounted = true;
    void riderService.readLastCompletedJob(user.id).then((value) => {
      if (mounted) setLastCompleted(value);
    });
    return () => { mounted = false; };
  }, [user?.id]);

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
      await queryClient.invalidateQueries({ queryKey: RIDER_WORKSPACE_QUERY_KEY });
      Toast.show({ type: 'success', text1: isOnline ? 'You are offline' : 'You are online' });
    },
    onError: (error: any) => Toast.show({ type: 'error', text1: 'Availability update failed', text2: errorMessage(error) }),
  });

  const openJob = (item: RiderJobListItem) => {
    if (item.job?.id && workspace?.activeJobs?.some((job) => job.id === item.job?.id)) return onOpenActive(item.job.id);
    if (item.offer?.status === 'OFFERED') return onOpenDashboard();
    onOpenHistory();
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#067B5C" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={workspaceQuery.isRefetching} onRefresh={() => void workspaceQuery.refetch()} tintColor="#FFFFFF" />}
      >
        <View style={[styles.hero, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
          <PartnerTabBrand inverse caption="RIDER PARTNER" style={styles.brandRow} />
          <View style={styles.headerRow}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open dashboard" style={styles.headerIcon} onPress={onOpenDashboard}><Menu size={29} color="#FFFFFF" /></TouchableOpacity>
            <View style={styles.headerCopy}><Text style={styles.title}>Today's Jobs</Text><Text style={styles.dateText}>{new Date().toLocaleDateString('en-IN', { month: 'long', day: 'numeric', year: 'numeric' })}</Text></View>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open delivery history" style={styles.headerIcon} onPress={onOpenHistory}><SlidersHorizontal size={27} color="#FFFFFF" /></TouchableOpacity>
          </View>
          <View style={styles.summaryCard}>
            <SummaryItem value={summary.assigned} label="Assigned" color="#078D32" />
            <SummaryItem value={summary.completed} label="Completed" color="#2469D8" />
            <SummaryItem value={summary.inProgress} label="In Progress" color="#F07A00" />
            <SummaryItem value={summary.pending} label="Pending" color="#D71923" />
          </View>
        </View>

        <View style={styles.listArea}>
          {lastCompleted && receiptQuery.data ? (
            <TouchableOpacity accessibilityRole="button" style={styles.receiptBanner} onPress={() => onOpenReceipt(lastCompleted)}>
              <FileCheck2 size={23} color="#0F766E" />
              <View style={styles.flex}><Text style={styles.receiptTitle}>Receipt restored after restart</Text><Text style={styles.receiptText}>Order #{String(receiptQuery.data.orderId || 'UNKNOWN').slice(-8).toUpperCase()} is available from the server.</Text></View>
              <Text style={styles.receiptOpen}>Open</Text>
            </TouchableOpacity>
          ) : null}

          {workspaceQuery.isLoading ? (
            <State loading title="Loading today's jobs" text="Reading current assignments from Aagaam." />
          ) : workspaceQuery.isError ? (
            <State title="Jobs unavailable" text={errorMessage(workspaceQuery.error)} />
          ) : jobs.length === 0 ? (
            <State title="No jobs assigned today" text="Stay online to receive delivery offers." />
          ) : jobs.map((item) => <JobCard key={item.key} item={item} onPress={() => openJob(item)} />)}

          <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: availabilityMutation.isPending }} disabled={availabilityMutation.isPending} style={styles.onlineButton} onPress={() => availabilityMutation.mutate()}>
            {availabilityMutation.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.onlineButtonText}>{isOnline ? 'Go Offline' : 'Go Online'}</Text>}
          </TouchableOpacity>
          <View style={styles.onlineStateRow}><View style={[styles.onlineStateDot, !isOnline && styles.offlineStateDot]} /><Text style={[styles.onlineStateText, !isOnline && styles.offlineStateText]}>You are currently {isOnline ? 'online' : 'offline'}</Text></View>
        </View>
      </ScrollView>
    </View>
  );
};

function SummaryItem({ value, label, color }: { value: number; label: string; color: string }) {
  return <View style={styles.summaryItem}><Text style={[styles.summaryValue, { color }]}>{String(value).padStart(2, '0')}</Text><Text style={styles.summaryLabel}>{label}</Text></View>;
}

function State({ loading, title, text }: { loading?: boolean; title: string; text: string }) {
  return <View style={styles.stateCard}>{loading ? <ActivityIndicator size="large" color="#078D63" /> : <BriefcaseBusiness size={42} color="#8E9894" />}<Text style={styles.stateTitle}>{title}</Text><Text style={styles.stateText}>{text}</Text></View>;
}

function JobCard({ item, onPress }: { item: RiderJobListItem; onPress: () => void }) {
  const visual = statusVisual(item.status);
  const windowStart = item.deliveryWindowStart ? new Date(item.deliveryWindowStart) : null;
  const windowEnd = item.deliveryWindowEnd ? new Date(item.deliveryWindowEnd) : null;
  return (
    <TouchableOpacity accessibilityRole="button" testID="rider_jobs_card" activeOpacity={0.78} style={styles.jobCard} onPress={onPress}>
      <View style={styles.cardTopRow}><View style={[styles.timelineDot, { backgroundColor: visual.dot }]} /><Text style={styles.timeText}>{jobTime(item.time)}</Text><Text style={styles.orderId}>#J-{shortPartnerOrderId(item.orderId)}</Text><View style={[styles.statusPill, { backgroundColor: visual.background }]}><Text style={[styles.statusPillText, { color: visual.color }]}>{visual.label}</Text></View></View>
      {windowStart && windowEnd ? <View style={styles.deliveryWindow}><CalendarClock size={17} color="#0F766E"/><View><Text style={styles.deliveryWindowLabel}>PROMISED DELIVERY WINDOW</Text><Text style={styles.deliveryWindowText}>{windowStart.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} · {windowStart.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}–{windowEnd.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</Text></View></View> : null}
      <View style={styles.routeRow}>
        <View style={styles.routeTimeline}><MapPin size={20} color="#078D32" /><View style={styles.routeLine} /><MapPin size={20} color="#078D32" /></View>
        <View style={styles.routeCopy}><View><Text style={styles.routeLabel}>Pickup</Text><Text style={styles.routeName}>{item.pickupName}</Text><Text style={styles.routeAddress}>{item.pickupAddress}</Text></View><View><Text style={styles.routeLabel}>Delivery</Text><Text style={styles.routeName}>{item.deliveryAddress}</Text></View></View>
        {item.distanceKm != null ? <Text style={styles.distance}>{item.distanceKm.toFixed(1)} km</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F8F7' }, scroll: { flex: 1 }, flex: { flex: 1 },
  hero: { backgroundColor: '#067B5C', paddingHorizontal: 16, paddingBottom: 34 }, brandRow: { marginBottom: 15 }, headerRow: { flexDirection: 'row', alignItems: 'center' },
  headerIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }, headerCopy: { flex: 1, paddingLeft: 8 },
  title: { color: '#FFFFFF', fontSize: 23, fontWeight: '900' }, dateText: { color: '#FFFFFF', fontSize: 15, marginTop: 4 },
  summaryCard: { marginTop: 16, minHeight: 96, borderRadius: 18, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  summaryItem: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: '#E2E4E3' },
  summaryValue: { fontSize: 25, fontWeight: '900' }, summaryLabel: { color: '#454A4D', fontSize: 11, marginTop: 4, textAlign: 'center' },
  listArea: { marginTop: -20, paddingHorizontal: 16 },
  receiptBanner: { borderRadius: 17, backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#99F6E4', padding: 14, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  receiptTitle: { color: '#0F172A', fontSize: 13, fontWeight: '900' }, receiptText: { color: '#475569', fontSize: 11, lineHeight: 16, marginTop: 2 }, receiptOpen: { color: '#0F766E', fontWeight: '900' },
  jobCard: { borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E4E3', padding: 15, marginBottom: 12 },
  deliveryWindow: { marginTop: 12, borderRadius: 12, borderWidth: 1, borderColor: '#99F6E4', backgroundColor: '#ECFDF5', padding: 10, flexDirection: 'row', alignItems: 'center', gap: 9 },
  deliveryWindowLabel: { color: '#0F766E', fontSize: 8, fontWeight: '900', letterSpacing: 0.6 }, deliveryWindowText: { color: '#134E4A', fontSize: 11, fontWeight: '800', marginTop: 2 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 9 }, timelineDot: { width: 8, height: 8, borderRadius: 4 }, timeText: { color: '#424A50', fontSize: 12 }, orderId: { color: '#111111', fontSize: 13, fontWeight: '900', flex: 1 },
  statusPill: { borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 }, statusPillText: { fontSize: 10, fontWeight: '900' },
  routeRow: { flexDirection: 'row', marginTop: 14, minHeight: 108 }, routeTimeline: { width: 38, alignItems: 'center', paddingVertical: 3 }, routeLine: { width: 1, flex: 1, borderLeftWidth: 1, borderStyle: 'dashed', borderColor: '#B7C2BC' },
  routeCopy: { flex: 1, justifyContent: 'space-between' }, routeLabel: { color: '#078D32', fontSize: 10, fontWeight: '800' }, routeName: { color: '#111111', fontSize: 13, fontWeight: '800', marginTop: 2 }, routeAddress: { color: '#475569', fontSize: 11, lineHeight: 16 }, distance: { alignSelf: 'flex-end', color: '#3B4145', fontSize: 12 },
  stateCard: { minHeight: 220, borderRadius: 18, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', padding: 24, marginBottom: 12 }, stateTitle: { color: '#101513', fontSize: 17, fontWeight: '900', marginTop: 10 }, stateText: { color: '#6B7470', textAlign: 'center', marginTop: 6 },
  onlineButton: { minHeight: 50, borderRadius: 12, backgroundColor: '#067B5C', alignItems: 'center', justifyContent: 'center', marginTop: 3 }, onlineButtonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  onlineStateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 8 }, onlineStateDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#1CB238' }, offlineStateDot: { backgroundColor: '#A8AFAC' }, onlineStateText: { color: '#078D32', fontSize: 12, fontWeight: '700' }, offlineStateText: { color: '#707975' },
});
