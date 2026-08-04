import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { riderService, RIDER_WORKSPACE_QUERY_KEY } from '../../api/riderService';
import { RiderNavigationPanel } from '../../components/rider/RiderNavigationPanel';
import { RiderDeliveryFlowCoordinator } from './RiderDeliveryFlowCoordinator';
import { RiderPickupOperationsScreen } from './RiderPickupOperationsScreen';

type ExactJobRoute = 'ACTIVE' | 'PICKUP' | 'DELIVERY' | 'RETURN';

export const RiderJobRouteScreen = ({ route, navigation, expected: _expected }: { route: any; navigation: any; expected: ExactJobRoute }) => {
  const requestedId = String(route.params?.deliveryJobId || '');
  const workspaceQuery = useQuery({
    queryKey: RIDER_WORKSPACE_QUERY_KEY,
    queryFn: riderService.getWorkspace,
    refetchInterval: 8_000,
    retry: 1,
  });
  const activeJob = workspaceQuery.data?.activeJob || null;
  const exact = requestedId === 'current' || activeJob?.id === requestedId;

  if (workspaceQuery.isLoading) {
    return <View style={styles.state}><ActivityIndicator size="large" color="#0F766E" /><Text style={styles.hint}>Resolving current delivery…</Text></View>;
  }
  if (!activeJob || !exact) {
    return (
      <View style={styles.state}>
        <AlertTriangle size={46} color="#B45309" />
        <Text style={styles.title}>This job is no longer active</Text>
        <Text style={styles.hint}>The assignment may have completed, expired, been cancelled or moved to another Rider.</Text>
        <TouchableOpacity accessibilityRole="button" style={styles.primary} onPress={() => void workspaceQuery.refetch()}><RefreshCw size={18} color="#FFFFFF" /><Text style={styles.primaryText}>Refresh current job</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" testID="rider_back_to_jobs" style={styles.secondary} onPress={() => navigation.reset({ index: 0, routes: [{ name: 'RiderJobs' }] })}><ArrowLeft size={18} color="#0F766E" /><Text style={styles.secondaryText}>Back to jobs</Text></TouchableOpacity>
      </View>
    );
  }

  // Route from canonical status so store confirmation immediately replaces the
  // pickup route without asking the Rider to return through Dashboard.
  if (activeJob.status === 'RIDER_AT_STORE') {
    const rider = workspaceQuery.data?.rider;
    const location = typeof rider?.latitude === 'number' && typeof rider?.longitude === 'number'
      ? { latitude: rider.latitude, longitude: rider.longitude }
      : null;
    return (
      <View style={styles.screen}>
        <RiderNavigationPanel job={activeJob} workspaceLocation={location} />
        <View style={styles.flow}>
          <RiderPickupOperationsScreen navigation={navigation} deliveryJobId={activeJob.id} />
        </View>
      </View>
    );
  }

  return <RiderDeliveryFlowCoordinator navigation={navigation} />;
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F4F7FB' },
  flow: { flex: 1, minHeight: 320 },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: '#F4F7FB' },
  title: { color: '#0F172A', fontSize: 20, fontWeight: '900', marginTop: 12, textAlign: 'center' },
  hint: { color: '#64748B', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 7 },
  primary: { marginTop: 18, minHeight: 48, borderRadius: 14, backgroundColor: '#067B5C', paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryText: { color: '#FFFFFF', fontWeight: '900' },
  secondary: { marginTop: 9, minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: '#99D8C8', paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondaryText: { color: '#0F766E', fontWeight: '900' },
});
