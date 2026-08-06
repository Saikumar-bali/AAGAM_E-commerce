import React, { useMemo } from 'react';
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
import { useQuery } from '@tanstack/react-query';
import type { NavigationProp } from '@react-navigation/native';
import { Banknote, CalendarDays, ChevronRight, MapPinned, PackageCheck, Route } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  DeliveryRunSummary,
  subscriptionOperationsService,
} from '../../api/subscriptionOperationsService';
import type { RiderTabParamList } from '../../navigation/partnerNavigationTypes';

export const RIDER_RUNS_QUERY_KEY = ['rider', 'subscription-delivery-runs'] as const;

function money(paise: number) {
  return `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function time(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

function statusLabel(status: string) {
  return status.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusTone(status: string) {
  if (status === 'IN_PROGRESS') return { text: '#075E45', bg: '#DFF7EC' };
  if (status === 'AWAITING_SETTLEMENT') return { text: '#8A4B00', bg: '#FFF2D9' };
  if (status === 'COMPLETED') return { text: '#276749', bg: '#E8F8EF' };
  if (status === 'PICKED_UP') return { text: '#155E75', bg: '#E0F2FE' };
  return { text: '#475569', bg: '#EEF2F6' };
}

function RunCard({ run, onPress }: { run: DeliveryRunSummary; onPress: () => void }) {
  const completed = Number(run.completedStopCount || 0);
  const total = Math.max(Number(run.totalStopCount || run._count?.stops || 0), 1);
  const percent = Math.min(100, Math.round((completed / total) * 100));
  const tone = statusTone(run.status);
  return (
    <TouchableOpacity accessibilityRole="button" activeOpacity={0.8} onPress={onPress} style={styles.runCard}>
      <View style={styles.cardTopRow}>
        <View style={styles.routeBadge}><Route size={21} color="#087B5A" /></View>
        <View style={styles.cardTitleCopy}>
          <Text style={styles.routeCode}>{run.routeCode}</Text>
          <Text style={styles.storeName} numberOfLines={1}>{run.store?.name || 'Assigned store'}</Text>
        </View>
        <View style={[styles.statusChip, { backgroundColor: tone.bg }]}>
          <Text style={[styles.statusChipText, { color: tone.text }]}>{statusLabel(run.status)}</Text>
        </View>
      </View>
      <View style={styles.windowRow}>
        <CalendarDays size={16} color="#64748B" />
        <Text style={styles.windowText}>{time(run.slotStart)} – {time(run.slotEnd)}</Text>
        <Text style={styles.windowDot}>•</Text>
        <MapPinned size={16} color="#64748B" />
        <Text style={styles.windowAddress} numberOfLines={1}>{run.store?.address || 'Store address unavailable'}</Text>
      </View>
      <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${percent}%` }]} /></View>
      <View style={styles.metricRow}>
        <View style={styles.metric}><PackageCheck size={18} color="#087B5A" /><Text style={styles.metricValue}>{completed}/{total}</Text><Text style={styles.metricLabel}>stops</Text></View>
        <View style={styles.metric}><Banknote size={18} color="#A15C00" /><Text style={styles.metricValue}>{money(run.collectedCashPaise)}</Text><Text style={styles.metricLabel}>collected</Text></View>
        <View style={styles.openAction}><Text style={styles.openActionText}>{run.status === 'IN_PROGRESS' ? 'Resume' : 'Open'}</Text><ChevronRight size={18} color="#FFFFFF" /></View>
      </View>
    </TouchableOpacity>
  );
}

export const RiderRunsScreen = ({ navigation }: { navigation: NavigationProp<RiderTabParamList> }) => {
  const insets = useSafeAreaInsets();
  const runsQuery = useQuery({
    queryKey: RIDER_RUNS_QUERY_KEY,
    queryFn: subscriptionOperationsService.getTodayRuns,
    refetchInterval: 12_000,
    retry: 1,
  });
  const runs = runsQuery.data || [];
  const active = useMemo(() => runs.find((run) => ['IN_PROGRESS', 'PICKED_UP', 'AWAITING_SETTLEMENT'].includes(run.status)), [runs]);
  const totalStops = runs.reduce((sum, run) => sum + Number(run.totalStopCount || run._count?.stops || 0), 0);
  const completedStops = runs.reduce((sum, run) => sum + Number(run.completedStopCount || 0), 0);
  const cashHeld = runs.reduce((sum, run) => sum + Math.max(0, Number(run.collectedCashPaise || 0) - Number(run.depositedCashPaise || 0)), 0);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#057A55" />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 14) + 8, paddingBottom: 110 }]}
        refreshControl={<RefreshControl refreshing={runsQuery.isRefetching} onRefresh={() => void runsQuery.refetch()} tintColor="#FFFFFF" />}
      >
        <View style={styles.hero}>
          <View style={styles.heroGlow} />
          <View style={styles.heroTitleRow}><View><Text style={styles.eyebrow}>MORNING OPERATIONS</Text><Text style={styles.heroTitle}>Delivery Runs</Text></View><View style={styles.heroIcon}><Route size={30} color="#057A55" /></View></View>
          <Text style={styles.heroSubtitle}>Complete every customer stop individually. Cash is collected only where the route explicitly shows an amount due.</Text>
          <View style={styles.heroMetrics}>
            <View style={styles.heroMetric}><Text style={styles.heroMetricValue}>{completedStops}/{totalStops}</Text><Text style={styles.heroMetricLabel}>Stops complete</Text></View>
            <View style={styles.heroDivider} />
            <View style={styles.heroMetric}><Text style={styles.heroMetricValue}>{money(cashHeld)}</Text><Text style={styles.heroMetricLabel}>Cash held</Text></View>
          </View>
          {active ? (
            <TouchableOpacity style={styles.resumeButton} onPress={() => navigation.navigate('RiderRunDetail', { runId: active.id })}>
              <Text style={styles.resumeButtonText}>{active.status === 'AWAITING_SETTLEMENT' ? 'Open cash settlement' : 'Resume active run'}</Text><ChevronRight size={20} color="#057A55" />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Today’s assigned routes</Text><Text style={styles.sectionCount}>{runs.length}</Text></View>
        {runsQuery.isLoading ? (
          <View style={styles.stateCard}><ActivityIndicator size="large" color="#087B5A" /><Text style={styles.stateText}>Loading assigned runs…</Text></View>
        ) : runsQuery.isError ? (
          <View style={styles.stateCard}><Text style={styles.stateTitle}>Runs unavailable</Text><Text style={styles.stateText}>Pull down to retry. Existing jobs remain available in the Jobs tab.</Text></View>
        ) : runs.length ? runs.map((run) => (
          <RunCard key={run.id} run={run} onPress={() => navigation.navigate('RiderRunDetail', { runId: run.id })} />
        )) : (
          <View style={styles.stateCard}><Route size={42} color="#94A3B8" /><Text style={styles.stateTitle}>No subscription runs today</Text><Text style={styles.stateText}>Newly assigned runs will appear here after the store finishes route preparation.</Text></View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F3F7F5' },
  content: { paddingHorizontal: 16 },
  hero: { backgroundColor: '#057A55', borderRadius: 26, padding: 20, overflow: 'hidden', shadowColor: '#064E3B', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 16, elevation: 7 },
  heroGlow: { position: 'absolute', width: 210, height: 210, borderRadius: 105, right: -80, top: -95, backgroundColor: '#34D399', opacity: 0.24 },
  heroTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { color: '#B9F6DF', fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  heroTitle: { color: '#FFFFFF', fontSize: 30, fontWeight: '900', marginTop: 3 },
  heroIcon: { width: 52, height: 52, borderRadius: 17, backgroundColor: '#ECFFF7', alignItems: 'center', justifyContent: 'center' },
  heroSubtitle: { color: '#D7F8EA', fontSize: 13, lineHeight: 19, marginTop: 12, maxWidth: 310 },
  heroMetrics: { flexDirection: 'row', alignItems: 'center', marginTop: 19, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.12)', paddingVertical: 13 },
  heroMetric: { flex: 1, alignItems: 'center' },
  heroMetricValue: { color: '#FFFFFF', fontSize: 19, fontWeight: '900' },
  heroMetricLabel: { color: '#CFF7E6', fontSize: 11, fontWeight: '700', marginTop: 2 },
  heroDivider: { width: 1, height: 33, backgroundColor: 'rgba(255,255,255,0.25)' },
  resumeButton: { minHeight: 50, marginTop: 14, backgroundColor: '#FFFFFF', borderRadius: 16, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resumeButtonText: { color: '#057A55', fontSize: 14, fontWeight: '900' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 24, marginBottom: 12 },
  sectionTitle: { color: '#17211D', fontSize: 19, fontWeight: '900' },
  sectionCount: { minWidth: 24, height: 24, borderRadius: 12, backgroundColor: '#DCEDE6', color: '#087B5A', textAlign: 'center', lineHeight: 24, fontWeight: '900' },
  runCard: { backgroundColor: '#FFFFFF', borderRadius: 22, padding: 16, marginBottom: 13, borderWidth: 1, borderColor: '#E2EBE7', shadowColor: '#0F2A20', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 3 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center' },
  routeBadge: { width: 44, height: 44, borderRadius: 15, backgroundColor: '#E7F7EF', alignItems: 'center', justifyContent: 'center' },
  cardTitleCopy: { flex: 1, marginLeft: 11 },
  routeCode: { color: '#17211D', fontSize: 16, fontWeight: '900' },
  storeName: { color: '#64748B', fontSize: 12, marginTop: 2 },
  statusChip: { borderRadius: 12, paddingHorizontal: 9, paddingVertical: 6, maxWidth: 115 },
  statusChipText: { fontSize: 9, fontWeight: '900', textAlign: 'center' },
  windowRow: { flexDirection: 'row', alignItems: 'center', marginTop: 13, gap: 6 },
  windowText: { color: '#475569', fontSize: 12, fontWeight: '700' },
  windowDot: { color: '#CBD5E1' },
  windowAddress: { flex: 1, color: '#64748B', fontSize: 12 },
  progressTrack: { height: 7, borderRadius: 4, backgroundColor: '#E9EFEC', overflow: 'hidden', marginTop: 14 },
  progressFill: { height: 7, borderRadius: 4, backgroundColor: '#10A36F' },
  metricRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14, gap: 12 },
  metric: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metricValue: { color: '#17211D', fontSize: 13, fontWeight: '900' },
  metricLabel: { color: '#7A8580', fontSize: 10 },
  openAction: { marginLeft: 'auto', minHeight: 40, borderRadius: 13, backgroundColor: '#087B5A', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 3 },
  openActionText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  stateCard: { minHeight: 190, borderRadius: 22, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2EBE7', alignItems: 'center', justifyContent: 'center', padding: 25, gap: 10 },
  stateTitle: { color: '#17211D', fontSize: 17, fontWeight: '900', textAlign: 'center' },
  stateText: { color: '#64748B', fontSize: 13, lineHeight: 19, textAlign: 'center' },
});
