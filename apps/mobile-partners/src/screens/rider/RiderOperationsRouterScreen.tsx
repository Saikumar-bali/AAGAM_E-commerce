import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { riderService } from '../../api/riderService';
import { RiderDeliveryOperationsScreen } from './RiderDeliveryOperationsScreen';
import { RiderPickupOperationsScreen } from './RiderPickupOperationsScreen';
import { RiderHistoryScreen } from './RiderHistoryScreen';

const WORKSPACE_KEY = ['rider', 'delivery-workspace'] as const;

export const RiderOperationsRouterScreen = () => {
  const [view, setView] = useState<'ACTIVE' | 'HISTORY'>('ACTIVE');
  const workspaceQuery = useQuery({
    queryKey: WORKSPACE_KEY,
    queryFn: riderService.getWorkspace,
    refetchInterval: 8_000,
  });

  if (workspaceQuery.isLoading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#0F766E" /><Text style={styles.text}>Loading rider operations…</Text></View>;
  }

  const ActiveScreen = workspaceQuery.data?.activeJob?.status === 'RIDER_AT_STORE'
    ? RiderPickupOperationsScreen
    : RiderDeliveryOperationsScreen;
  return <View style={styles.page}>
    <View style={styles.switcher}>
      <TouchableOpacity testID="rider_jobs_active" onPress={() => setView('ACTIVE')} style={[styles.switchButton, view === 'ACTIVE' && styles.switchActive]}><Text style={[styles.switchText, view === 'ACTIVE' && styles.switchTextActive]}>Today's jobs</Text></TouchableOpacity>
      <TouchableOpacity testID="rider_jobs_history" onPress={() => setView('HISTORY')} style={[styles.switchButton, view === 'HISTORY' && styles.switchActive]}><Text style={[styles.switchText, view === 'HISTORY' && styles.switchTextActive]}>Delivery history</Text></TouchableOpacity>
    </View>
    <View style={styles.body}>{view === 'ACTIVE' ? <ActiveScreen /> : <RiderHistoryScreen />}</View>
  </View>;
};

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC', gap: 12 },
  text: { color: '#64748B', fontWeight: '700' },
  page: { flex: 1, backgroundColor: '#F8FAFC' },
  body: { flex: 1 },
  switcher: { paddingTop: 49, paddingHorizontal: 16, paddingBottom: 10, backgroundColor: '#007A5C', flexDirection: 'row', gap: 8 },
  switchButton: { flex: 1, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,.35)' },
  switchActive: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },
  switchText: { color: '#D1FAE5', fontSize: 11, fontWeight: '900' },
  switchTextActive: { color: '#007A5C' },
});
