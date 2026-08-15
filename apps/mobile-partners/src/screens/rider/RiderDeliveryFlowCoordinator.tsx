import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { riderService, RIDER_WORKSPACE_QUERY_KEY } from '../../api/riderService';
import { RiderNavigationPanel } from '../../components/rider/RiderNavigationPanel';
import type { RiderWorkspace } from '../../domain/riderWorkspace';
import { RiderDeliveryFlowScreen } from './RiderDeliveryFlowScreen';

export const RiderDeliveryFlowCoordinator = ({ deliveryJobId }: { deliveryJobId: string }) => {
  const workspaceQuery = useQuery<RiderWorkspace>({
    queryKey: RIDER_WORKSPACE_QUERY_KEY,
    queryFn: riderService.getWorkspace,
    refetchInterval: 8_000,
  });
  const activeJob = workspaceQuery.data?.activeJobs?.find((job) => job.id === deliveryJobId) || null;
  const rider = workspaceQuery.data?.rider;
  const workspaceLocation = typeof rider?.latitude === 'number' && typeof rider?.longitude === 'number'
    ? { latitude: rider.latitude, longitude: rider.longitude }
    : null;

  return (
    <View style={styles.screen}>
      {activeJob ? <RiderNavigationPanel job={activeJob} workspaceLocation={workspaceLocation} /> : null}
      <View style={styles.flow}><RiderDeliveryFlowScreen deliveryJobId={deliveryJobId} /></View>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F4F7FB' },
  flow: { flex: 1, minHeight: 320 },
});
