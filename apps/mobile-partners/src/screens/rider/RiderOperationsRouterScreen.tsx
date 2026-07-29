import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { riderService } from '../../api/riderService';
import { RiderDeliveryOperationsScreen } from './RiderDeliveryOperationsScreen';
import { RiderPickupOperationsScreen } from './RiderPickupOperationsScreen';

const WORKSPACE_KEY = ['rider', 'delivery-workspace'] as const;

export const RiderOperationsRouterScreen = () => {
  const workspaceQuery = useQuery({
    queryKey: WORKSPACE_KEY,
    queryFn: riderService.getWorkspace,
    refetchInterval: 8_000,
  });

  if (workspaceQuery.isLoading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#0F766E" /><Text style={styles.text}>Loading rider operations…</Text></View>;
  }

  if (workspaceQuery.data?.activeJob?.status === 'RIDER_AT_STORE') {
    return <RiderPickupOperationsScreen />;
  }

  return <RiderDeliveryOperationsScreen />;
};

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC', gap: 12 },
  text: { color: '#64748B', fontWeight: '700' },
});
