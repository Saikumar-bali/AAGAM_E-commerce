import { useAuthStore } from '@aagam/mobile-shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { deliveryOperationsService, DeliveryOperationsSummary } from '../../api/deliveryOperationsService';
import { riderService, RIDER_WORKSPACE_QUERY_KEY } from '../../api/riderService';
import { RiderNavigationPanel } from '../../components/rider/RiderNavigationPanel';
import type { RiderWorkspace } from '../../domain/riderWorkspace';
import { RiderDeliveryCompletedScreen } from './RiderDeliveryCompletedScreen';
import { RiderDeliveryFlowScreen } from './RiderDeliveryFlowScreen';

const SUMMARY_KEY = ['rider', 'delivery-operations'] as const;

export const RiderDeliveryFlowCoordinator = ({ onCompleteDismiss }: { onCompleteDismiss?: () => void }) => {
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.user?.id || 'anonymous');
  const [receiptJobId, setReceiptJobId] = useState<string | null>(null);
  const lastActiveJobId = useRef<string | null>(null);
  const workspaceQuery = useQuery<RiderWorkspace>({ queryKey: RIDER_WORKSPACE_QUERY_KEY, queryFn: riderService.getWorkspace, refetchInterval: 5_000 });
  const activeJob = workspaceQuery.data?.activeJob || null;
  const summaryQuery = useQuery<DeliveryOperationsSummary>({
    queryKey: [...SUMMARY_KEY, activeJob?.id],
    queryFn: () => deliveryOperationsService.getSummary(activeJob!.id),
    enabled: Boolean(activeJob?.id),
    refetchInterval: activeJob ? 10_000 : false,
  });

  useEffect(() => {
    let active = true;
    void riderService.readLastCompletedJob(userId).then((jobId) => {
      if (active && !activeJob && jobId) setReceiptJobId(jobId);
    });
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    if (activeJob?.id) {
      lastActiveJobId.current = activeJob.id;
      if (receiptJobId === activeJob.id) setReceiptJobId(null);
      return;
    }
    const completedId = lastActiveJobId.current;
    if (!completedId || receiptJobId) return;
    lastActiveJobId.current = null;
    void riderService.cacheLastCompletedJob(userId, completedId).then(() => setReceiptJobId(completedId));
  }, [activeJob?.id, receiptJobId, userId]);

  const receipt = useQuery({
    queryKey: ['rider', 'delivery-receipt', receiptJobId],
    queryFn: () => riderService.getReceipt(receiptJobId!),
    enabled: Boolean(receiptJobId),
    retry: 2,
  });

  const dismissReceipt = async () => {
    await riderService.clearLastCompletedJob(userId);
    setReceiptJobId(null);
    await queryClient.invalidateQueries({ queryKey: RIDER_WORKSPACE_QUERY_KEY });
    onCompleteDismiss?.();
  };

  if (receiptJobId && receipt.isLoading) return <View style={styles.loading}><ActivityIndicator color="#067B5C" /><Text style={styles.loadingText}>Loading secure delivery receipt…</Text></View>;
  if (receiptJobId && receipt.data) return <RiderDeliveryCompletedScreen receipt={receipt.data} onHome={() => void dismissReceipt()} />;

  const rider = workspaceQuery.data?.rider;
  const workspaceLocation = typeof rider?.latitude === 'number' && typeof rider?.longitude === 'number'
    ? { latitude: rider.latitude, longitude: rider.longitude }
    : null;

  return (
    <View style={styles.screen}>
      {activeJob ? <RiderNavigationPanel job={activeJob} workspaceLocation={workspaceLocation} /> : null}
      <View style={styles.flow}><RiderDeliveryFlowScreen /></View>
      {summaryQuery.isError ? <Text style={styles.warning}>Delivery proof summary will retry automatically.</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F4F7FB' }, flow: { flex: 1, minHeight: 320 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F7F6', gap: 12 }, loadingText: { color: '#64748B', fontSize: 13, fontWeight: '700' },
  warning: { color: '#92400E', backgroundColor: '#FFF7ED', padding: 8, textAlign: 'center', fontSize: 11 },
});
