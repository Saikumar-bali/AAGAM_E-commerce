import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  BatteryCharging,
  ChevronLeft,
  Crosshair,
  MapPin,
  RefreshCw,
  Satellite,
  Settings,
  UploadCloud,
} from 'lucide-react-native';
import React from 'react';
import {
  ActivityIndicator,
  Linking,
  PermissionsAndroid,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { riderService } from '../../api/riderService';
import type { NativeTrackingStatus } from '../../services/NativeRiderTracking';

const TRACKING_HEALTH_KEY = ['rider', 'tracking-health'] as const;

type PermissionHealth = {
  foreground: 'GRANTED' | 'MISSING';
  background: 'GRANTED' | 'MISSING';
};

type TrackingHealth = NativeTrackingStatus & {
  permission: PermissionHealth;
  checkedAt: string;
};

async function permissionState(): Promise<PermissionHealth> {
  if (Platform.OS !== 'android') return { foreground: 'GRANTED', background: 'GRANTED' };
  const foreground = await PermissionsAndroid.check(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  );
  const background = Number(Platform.Version) < 29
    ? true
    : await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
      );
  return {
    foreground: foreground ? 'GRANTED' : 'MISSING',
    background: background ? 'GRANTED' : 'MISSING',
  };
}

async function trackingHealth(): Promise<TrackingHealth> {
  const fallback: NativeTrackingStatus = {
    supported: false,
    active: false,
    queuedCount: 0,
    error: 'Native tracking status is unavailable.',
  };
  const [native, permission] = await Promise.all([
    riderService.getNativeTrackingStatus().catch((error: any): NativeTrackingStatus => ({
      ...fallback,
      error: error?.message || fallback.error,
    })),
    permissionState(),
  ]);
  return { ...native, permission, checkedAt: new Date().toISOString() };
}

function dateText(value?: string | null) {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    : 'Unknown';
}

export const RiderTrackingDiagnosticsScreen = ({ navigation }: { navigation?: any }) => {
  const insets = useSafeAreaInsets();
  const healthQuery = useQuery<TrackingHealth>({
    queryKey: TRACKING_HEALTH_KEY,
    queryFn: trackingHealth,
    refetchInterval: 5_000,
    retry: 1,
  });
  const health = healthQuery.data;
  const lastSentMs = health?.lastSentAt ? new Date(health.lastSentAt).getTime() : 0;
  const stale = Boolean(health?.active && (!lastSentMs || Date.now() - lastSentMs > 60_000));
  const healthy = Boolean(
    health?.active
    && !health.error
    && health.permission.foreground === 'GRANTED'
    && health.permission.background === 'GRANTED'
    && !stale,
  );

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity accessibilityLabel="Go back" style={styles.back} onPress={() => navigation?.goBack?.()}>
          <ChevronLeft size={25} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>LOCATION SERVICE</Text>
          <Text style={styles.title}>Tracking diagnostics</Text>
        </View>
        <Satellite size={25} color="#FFFFFF" />
      </View>

      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={healthQuery.isRefetching} onRefresh={() => void healthQuery.refetch()} tintColor="#0F766E" />}>
        {healthQuery.isLoading ? <ActivityIndicator color="#0F766E" /> : healthQuery.isError ? (
          <View style={[styles.healthCard, styles.warnCard]}><AlertTriangle size={28} color="#B45309" /><View style={styles.flex}><Text style={styles.healthTitle}>Health check unavailable</Text><Text style={styles.healthText}>{(healthQuery.error as Error)?.message || 'Check GPS and your network, then retry.'}</Text></View><TouchableOpacity accessibilityLabel="Retry tracking health" onPress={() => void healthQuery.refetch()}><RefreshCw size={22} color="#B45309" /></TouchableOpacity></View>
        ) : (
          <View style={[styles.healthCard, healthy ? styles.goodCard : styles.warnCard]}>
            {healthy
              ? <Crosshair size={28} color="#047857" />
              : <AlertTriangle size={28} color="#B45309" />}
            <View style={styles.flex}>
              <Text style={styles.healthTitle}>{healthy ? 'Tracking is healthy' : 'Tracking needs attention'}</Text>
              <Text style={styles.healthText}>
                {health?.error || (stale
                  ? 'No recent upload was reported. Check GPS, network and battery restrictions.'
                  : health?.active ? 'Review the permission state below.' : health?.stopReason || 'Tracking is not active.')}
              </Text>
            </View>
          </View>
        )}

        <Metric icon={<Satellite size={19} color="#0F766E" />} label="Service" value={health?.active ? 'Active' : `Stopped${health?.stopReason ? ` · ${health.stopReason}` : ''}`} />
        <Metric icon={<UploadCloud size={19} color="#0F766E" />} label="Last uploaded" value={dateText(health?.lastSentAt)} />
        <Metric icon={<MapPin size={19} color="#0F766E" />} label="Latest accuracy" value={health?.lastAccuracy != null ? `${Math.round(Number(health.lastAccuracy))} m` : 'No fix'} />
        <Metric icon={<RefreshCw size={19} color="#0F766E" />} label="Offline queue" value={`${Number(health?.queuedCount || 0)} pending`} />
        <Metric icon={<Crosshair size={19} color="#0F766E" />} label="Foreground location" value={health?.permission.foreground || 'Unknown'} />
        <Metric icon={<Crosshair size={19} color="#0F766E" />} label="Background location" value={health?.permission.background || 'Unknown'} />
        <Metric icon={<Satellite size={19} color="#0F766E" />} label="Current session" value={health?.deliveryJobId || health?.orderId || 'No active job'} />

        <TouchableOpacity style={styles.action} onPress={() => Linking.openSettings().catch(() => undefined)}>
          <Settings size={20} color="#FFFFFF" />
          <Text style={styles.actionText}>Open location permissions</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryAction}
          onPress={() => {
            if (Platform.OS === 'android' && Linking.sendIntent) {
              void Linking.sendIntent('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS').catch(() => Linking.openSettings());
            } else {
              void Linking.openSettings();
            }
          }}
        >
          <BatteryCharging size={20} color="#0F766E" />
          <Text style={styles.secondaryActionText}>Open battery optimisation</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryAction} onPress={() => void healthQuery.refetch()}>
          {healthQuery.isRefetching
            ? <ActivityIndicator size="small" color="#0F766E" />
            : <RefreshCw size={20} color="#0F766E" />}
          <Text style={styles.secondaryActionText}>Retry health check</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <View style={styles.metricIcon}>{icon}</View>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F4F7FB' },
  flex: { flex: 1 },
  header: { minHeight: 116, paddingHorizontal: 18, paddingBottom: 18, backgroundColor: '#067B5C', flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { width: 38, height: 38, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: '#A7F3D0', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', marginTop: 3 },
  content: { padding: 16, paddingBottom: 110 },
  healthCard: { borderRadius: 19, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, marginBottom: 12 },
  goodCard: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
  warnCard: { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' },
  healthTitle: { color: '#0F172A', fontSize: 16, fontWeight: '900' },
  healthText: { color: '#64748B', fontSize: 11, lineHeight: 17, marginTop: 4 },
  metric: { minHeight: 64, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  metricIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#CCFBF1', alignItems: 'center', justifyContent: 'center' },
  metricLabel: { color: '#475569', fontSize: 12, fontWeight: '800', flex: 1 },
  metricValue: { color: '#0F172A', fontSize: 11, fontWeight: '900', maxWidth: '48%', textAlign: 'right' },
  action: { minHeight: 50, borderRadius: 15, backgroundColor: '#067B5C', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 },
  actionText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  secondaryAction: { minHeight: 50, borderRadius: 15, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#99D8C8', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 9 },
  secondaryActionText: { color: '#0F766E', fontSize: 14, fontWeight: '900' },
});
