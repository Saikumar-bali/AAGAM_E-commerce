import { useQuery } from '@tanstack/react-query';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { deliveryOperationsService, DeliveryOperationsSummary } from '../../api/deliveryOperationsService';
import { riderService, RIDER_WORKSPACE_QUERY_KEY } from '../../api/riderService';
import { RiderNavigationPanel } from '../../components/rider/RiderNavigationPanel';
import {
  RiderCompletionReceipt,
  buildRiderCompletionReceipt,
} from '../../domain/riderDeliveryFlow';
import type { RiderDeliveryJob, RiderWorkspace } from '../../domain/riderWorkspace';
import { RiderDeliveryCompletedScreen } from './RiderDeliveryCompletedScreen';
import { RiderDeliveryFlowScreen } from './RiderDeliveryFlowScreen';

const SUMMARY_KEY = ['rider', 'delivery-operations'] as const;

export const RiderDeliveryFlowCoordinator = () => {
  const workspaceQuery = useQuery<RiderWorkspace>({
    queryKey: RIDER_WORKSPACE_QUERY_KEY,
    queryFn: riderService.getWorkspace,
    refetchInterval: 8_000,
  });
  const activeJob = workspaceQuery.data?.activeJob || null;
  const summaryQuery = useQuery<DeliveryOperationsSummary>({
    queryKey: [...SUMMARY_KEY, activeJob?.id],
    queryFn: () => deliveryOperationsService.getSummary(activeJob!.id),
    enabled: Boolean(activeJob?.id),
    refetchInterval: activeJob ? 10_000 : false,
  });

  const lastJobRef = useRef<RiderDeliveryJob | null>(null);
  const lastSummaryRef = useRef<DeliveryOperationsSummary | null>(null);
  const [receipt, setReceipt] = useState<RiderCompletionReceipt | null>(null);

  useEffect(() => {
    if (activeJob) {
      lastJobRef.current = activeJob;
      if (summaryQuery.data) lastSummaryRef.current = summaryQuery.data;
      return;
    }
    const previousJob = lastJobRef.current;
    if (!previousJob || previousJob.status !== 'RIDER_AT_CUSTOMER' || receipt) return;
    setReceipt(buildRiderCompletionReceipt(previousJob, lastSummaryRef.current));
  }, [activeJob, receipt, summaryQuery.data]);

  if (receipt) {
    return (
      <RiderDeliveryCompletedScreen
        receipt={receipt}
        onHome={() => {
          setReceipt(null);
          lastJobRef.current = null;
          lastSummaryRef.current = null;
        }}
      />
    );
  }

  const rider = workspaceQuery.data?.rider;
  const workspaceLocation = typeof rider?.latitude === 'number' && typeof rider?.longitude === 'number'
    ? { latitude: rider.latitude, longitude: rider.longitude }
    : null;

  return (
    <View style={styles.screen}>
      {activeJob ? <RiderNavigationPanel job={activeJob} workspaceLocation={workspaceLocation} /> : null}
      <View style={styles.flow}><RiderDeliveryFlowScreen /></View>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F4F7FB' },
  flow: { flex: 1, minHeight: 320 },
});
