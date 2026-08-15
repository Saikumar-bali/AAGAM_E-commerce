import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Clock3, Crosshair, ExternalLink, Map, Navigation, Route, X } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Linking, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { riderService } from '../../api/riderService';
import {
  createRiderNavigationSession,
  navigationPhaseLabel,
  NavigationCoordinate,
} from '../../domain/riderNavigationSession';
import type { RiderDeliveryJob } from '../../domain/riderWorkspace';
import { RiderRouteMap } from './RiderRouteMap';

const NATIVE_TRACKING_STATUS_KEY = ['rider', 'native-tracking-status'] as const;

export const RiderNavigationPanel = ({
  job,
  workspaceLocation,
}: {
  job: RiderDeliveryJob;
  workspaceLocation?: NavigationCoordinate | null;
}) => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [mapOpen, setMapOpen] = useState(false);
  const healthQuery = useQuery({
    queryKey: NATIVE_TRACKING_STATUS_KEY,
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
  const openTurnByTurn = () => session.destination && Linking.openURL(
    `https://www.google.com/maps/dir/?api=1&destination=${session.destination.latitude},${session.destination.longitude}&travelmode=driving`,
  );

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
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open live route map" style={styles.mapButton} onPress={() => setMapOpen(true)}><Map size={18} color="#0F766E" /><Text style={styles.mapButtonText}>Map</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open turn-by-turn navigation" disabled={!session.destination} style={[styles.navigateButton, !session.destination && styles.disabled]} onPress={() => void openTurnByTurn()}><Navigation size={18} color="#FFFFFF" /><ExternalLink size={11} color="#FFFFFF" /></TouchableOpacity>
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

      <Modal visible={mapOpen} animationType="slide" onRequestClose={() => setMapOpen(false)}>
        <View style={[styles.mapModal, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.mapModalHeader}><View style={styles.flex}><Text style={styles.mapModalEyebrow}>LIVE NAVIGATION</Text><Text style={styles.mapModalTitle} numberOfLines={1}>{session.destinationLabel}</Text></View><TouchableOpacity accessibilityRole="button" accessibilityLabel="Close live route map" style={styles.closeButton} onPress={() => setMapOpen(false)}><X size={22} color="#0F172A" /></TouchableOpacity></View>
          <RiderRouteMap destination={session.destination} destinationLabel={session.destinationLabel} active={session.phase !== 'INACTIVE'} riderLocation={riderLocation} expanded />
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { backgroundColor: '#F4F7FB', paddingHorizontal: 12, paddingTop: 10 },
  flex: { flex: 1 },
  summary: { minHeight: 64, borderRadius: 17, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#B7E4D7', padding: 9, flexDirection: 'row', alignItems: 'center', gap: 7 },
  phaseIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#CCFBF1', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: '#0F766E', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  title: { color: '#0F172A', fontSize: 14, fontWeight: '900', marginTop: 2 },
  destination: { color: '#64748B', fontSize: 10, marginTop: 2 },
  metric: { minWidth: 34, alignItems: 'center' },
  metricValue: { color: '#0F172A', fontSize: 14, fontWeight: '900' },
  metricLabel: { color: '#64748B', fontSize: 7, fontWeight: '900', marginTop: 1 },
  warning: { marginTop: 8, borderRadius: 14, backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA', padding: 10, flexDirection: 'row', alignItems: 'center', gap: 9 },
  warningTitle: { color: '#92400E', fontSize: 11, fontWeight: '900' },
  warningText: { color: '#B45309', fontSize: 9, lineHeight: 13, marginTop: 2 },
  liveStrip: { marginTop: 8, minHeight: 36, borderRadius: 12, backgroundColor: '#ECFDF5', paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveText: { color: '#047857', fontSize: 10, fontWeight: '900', flex: 1 },
  liveDetail: { color: '#64748B', fontSize: 9, fontWeight: '700' },
  mapButton: { height: 38, borderRadius: 11, backgroundColor: '#ECFDF5', paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center' }, mapButtonText: { color: '#0F766E', fontSize: 8, fontWeight: '900', marginTop: 1 }, navigateButton: { width: 38, height: 38, borderRadius: 11, backgroundColor: '#008C68', alignItems: 'center', justifyContent: 'center' }, disabled: { opacity: 0.45 },
  mapModal: { flex: 1, backgroundColor: '#F4F7FB', paddingHorizontal: 12 }, mapModalHeader: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10 }, mapModalEyebrow: { color: '#0F766E', fontSize: 9, fontWeight: '900', letterSpacing: 1 }, mapModalTitle: { color: '#0F172A', fontSize: 17, fontWeight: '900', marginTop: 2 }, closeButton: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
});
