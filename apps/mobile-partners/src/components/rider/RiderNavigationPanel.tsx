import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Clock3, Crosshair, Route } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { riderService } from '../../api/riderService';
import {
  createRiderNavigationSession,
  navigationPhaseLabel,
  NavigationCoordinate,
} from '../../domain/riderNavigationSession';
import type { RiderDeliveryJob } from '../../domain/riderWorkspace';
import { RiderRouteMap } from './RiderRouteMap';

const TRACKING_HEALTH_KEY = ['rider', 'tracking-health'] as const;

export const RiderNavigationPanel = ({
  job,
  workspaceLocation,
}: {
  job: RiderDeliveryJob;
  workspaceLocation?: NavigationCoordinate | null;
}) => {
  const navigation = useNavigation<any>();
  const healthQuery = useQuery({
    queryKey: TRACKING_HEALTH_KEY,
    queryFn: riderService.getNativeTrackingStatus,
    refetchInterval: 5_000,
    retry: 1,
  });
  const native = healthQuery.data;
  const nativeLocation = typeof native?.latitude === 'number' && typeof native?.longitude === 'number'
    ? { latitude: native.latitude, longitude: native.longitude }
    : null;
  const riderLocation = nativeLocation || workspaceLocation || null;
  const session = useMemo(() => createRiderNavigationSession({
    job,
    riderLocation,
    routeUpdatedAt: native?.lastSentAt || job.updatedAt || null,
  }), [job, native?.lastSentAt, riderLocation?.latitude, riderLocation?.longitude]);

  return (
    <View style={styles.container}>
      <View style={styles.summary}>
        <View style={styles.phaseIcon}><Route size={21} color="#0F766E" /></View>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>NAVIGATION SESSION</Text>
          <Text style={styles.title}>{navigationPhaseLabel(session.phase)}</Text>
          <Text style={styles.destination} numberOfLines={1}>{session.destinationLabel}</Text>
        </View>
        <View style={styles.metric}><Text style={styles.metricValue}>{session.etaMinutes == null ? '—' : session.etaMinutes}</Text><Text style={styles.metricLabel}>MIN</Text></View>
        <View style={styles.metric}><Text style={styles.metricValue}>{session.remainingDistanceKm == null ? '—' : session.remainingDistanceKm.toFixed(1)}</Text><Text style={styles.metricLabel}>KM</Text></View>
      </View>

      {session.stale || native?.error ? (
        <TouchableOpacity style={styles.warning} onPress={() => navigation.navigate('TrackingDiagnostics')}>
          <AlertTriangle size={18} color="#B45309" />
          <View style={styles.flex}>
            <Text style={styles.warningTitle}>Route data needs attention</Text>
            <Text style={styles.warningText}>{native?.error || 'The latest route update is stale. Open diagnostics before relying on arrival actions.'}</Text>
          </View>
        </TouchableOpacity>
      ) : (
        <View style={styles.liveStrip}>
          <Crosshair size={16} color="#047857" />
          <Text style={styles.liveText}>Live tracking active</Text>
          <Clock3 size={15} color="#64748B" />
          <Text style={styles.liveDetail}>{native?.lastSentAt ? new Date(native.lastSentAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'Waiting for first upload'}</Text>
        </View>
      )}

      <RiderRouteMap
        destination={session.destination}
        destinationLabel={session.destinationLabel}
        active={session.phase !== 'INACTIVE'}
        riderLocation={riderLocation}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { backgroundColor: '#F4F7FB', paddingHorizontal: 12, paddingTop: 10 },
  flex: { flex: 1 },
  summary: { minHeight: 74, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#B7E4D7', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  phaseIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#CCFBF1', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: '#0F766E', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  title: { color: '#0F172A', fontSize: 14, fontWeight: '900', marginTop: 2 },
  destination: { color: '#64748B', fontSize: 10, marginTop: 2 },
  metric: { minWidth: 45, alignItems: 'center' },
  metricValue: { color: '#0F172A', fontSize: 17, fontWeight: '900' },
  metricLabel: { color: '#64748B', fontSize: 7, fontWeight: '900', marginTop: 1 },
  warning: { marginTop: 8, borderRadius: 14, backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA', padding: 10, flexDirection: 'row', alignItems: 'center', gap: 9 },
  warningTitle: { color: '#92400E', fontSize: 11, fontWeight: '900' },
  warningText: { color: '#B45309', fontSize: 9, lineHeight: 13, marginTop: 2 },
  liveStrip: { marginTop: 8, minHeight: 36, borderRadius: 12, backgroundColor: '#ECFDF5', paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveText: { color: '#047857', fontSize: 10, fontWeight: '900', flex: 1 },
  liveDetail: { color: '#64748B', fontSize: 9, fontWeight: '700' },
});
