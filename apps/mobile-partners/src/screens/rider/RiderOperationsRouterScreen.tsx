import { ArrowLeft } from 'lucide-react-native';
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { riderService } from '../../api/riderService';
import { RiderDeliveryFlowCoordinator } from './RiderDeliveryFlowCoordinator';
import { RiderPickupOperationsScreen } from './RiderPickupOperationsScreen';
import { RiderHistoryScreen } from './RiderHistoryScreen';
import { RiderJobsScreen } from './RiderJobsScreen';

const WORKSPACE_KEY = ['rider', 'delivery-workspace'] as const;
type OperationsView = 'JOBS' | 'ACTIVE' | 'HISTORY';

export const RiderOperationsRouterScreen = ({ navigation }: { navigation?: any }) => {
  const [view, setView] = useState<OperationsView>('JOBS');
  const workspaceQuery = useQuery({
    queryKey: WORKSPACE_KEY,
    queryFn: riderService.getWorkspace,
    refetchInterval: 8_000,
  });
  const ActiveScreen = workspaceQuery.data?.activeJob?.status === 'RIDER_AT_STORE'
    ? RiderPickupOperationsScreen
    : RiderDeliveryFlowCoordinator;

  if (view === 'HISTORY') {
    return <RiderHistoryScreen onBack={() => setView('JOBS')} />;
  }

  if (view === 'ACTIVE') {
    return (
      <View style={styles.activePage}>
        <ActiveScreen />
        <TouchableOpacity
          testID="rider_active_back_to_jobs"
          style={styles.backToJobs}
          onPress={() => setView('JOBS')}
        >
          <ArrowLeft size={17} color="#067B5C" />
          <Text style={styles.backToJobsText}>Jobs</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <RiderJobsScreen
      onOpenActive={() => setView('ACTIVE')}
      onOpenHistory={() => setView('HISTORY')}
      onOpenDashboard={() => navigation?.navigate?.('Dashboard')}
    />
  );
};

const styles = StyleSheet.create({
  activePage: { flex: 1, backgroundColor: '#FFFFFF' },
  backToJobs: {
    position: 'absolute',
    top: 49,
    right: 14,
    zIndex: 50,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDE5E1',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    elevation: 5,
  },
  backToJobsText: { color: '#067B5C', fontSize: 12, fontWeight: '900' },
});
