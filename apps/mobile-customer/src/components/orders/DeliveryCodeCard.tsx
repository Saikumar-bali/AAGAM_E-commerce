import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { KeyRound, RefreshCw, ShieldCheck } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@aagam/mobile-shared';
import {
  CustomerDeliveryContext,
  formatDeliveryCode,
  secondsUntilExpiry,
  shouldShowDeliveryCode,
} from '../../domain/deliveryCode';

type DeliveryCodeResponse = {
  code: string;
  expiresAt: string;
  orderId: string;
};

function userMessage(error: any) {
  const message = error?.response?.data?.message;
  if (Array.isArray(message)) return message.join(', ');
  if (typeof message === 'string') return message;
  return 'The rider has not issued a delivery code yet. Ask the rider to issue it from the Operations tab.';
}

export const DeliveryCodeCard = ({ orderId }: { orderId: string }) => {
  const [codeInfo, setCodeInfo] = useState<DeliveryCodeResponse | null>(null);
  const [loadingCode, setLoadingCode] = useState(false);
  const [codeError, setCodeError] = useState('');
  const [now, setNow] = useState(Date.now());

  const contextQuery = useQuery<CustomerDeliveryContext>({
    queryKey: ['customer-delivery-context', orderId],
    queryFn: async () => (await apiClient.get(`/orders/my/${encodeURIComponent(orderId)}/delivery-context`)).data,
    enabled: Boolean(orderId),
    refetchInterval: 10_000,
    retry: 1,
  });

  const deliveryJobId = contextQuery.data?.deliveryJobId || null;
  const visible = shouldShowDeliveryCode(contextQuery.data?.deliveryStatus);
  const secondsRemaining = useMemo(
    () => secondsUntilExpiry(codeInfo?.expiresAt, now),
    [codeInfo?.expiresAt, now],
  );

  useEffect(() => {
    if (!codeInfo) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [codeInfo]);

  useEffect(() => {
    if (codeInfo && secondsRemaining === 0) {
      setCodeInfo(null);
      setCodeError('This code expired. Ask the rider to issue a fresh code.');
    }
  }, [codeInfo, secondsRemaining]);

  useEffect(() => {
    if (!visible) {
      setCodeInfo(null);
      setCodeError('');
    }
  }, [visible]);

  const loadCode = async () => {
    if (!deliveryJobId || loadingCode) return;
    setLoadingCode(true);
    setCodeError('');
    try {
      const response = await apiClient.get(
        `/orders/delivery-operations/jobs/${encodeURIComponent(deliveryJobId)}/otp/customer`,
      );
      setCodeInfo(response.data);
      setNow(Date.now());
    } catch (error: any) {
      setCodeInfo(null);
      setCodeError(userMessage(error));
    } finally {
      setLoadingCode(false);
    }
  };

  if (!visible || !deliveryJobId) return null;

  return (
    <View testID="order_detail_delivery_code_card" style={styles.card}>
      <View style={styles.headingRow}>
        <View style={styles.iconBox}><KeyRound size={22} color="#0F766E" /></View>
        <View style={styles.headingCopy}>
          <Text style={styles.title}>Delivery verification code</Text>
          <Text style={styles.subtitle}>Share it only after checking and receiving the parcel.</Text>
        </View>
        <ShieldCheck size={22} color="#15803D" />
      </View>

      {contextQuery.isFetching ? <Text style={styles.syncText}>Checking rider arrival…</Text> : null}

      {codeInfo ? (
        <View style={styles.codePanel}>
          <Text testID="order_detail_delivery_code" style={styles.code}>{formatDeliveryCode(codeInfo.code)}</Text>
          <Text style={styles.expiry}>Expires in {secondsRemaining}s</Text>
          <TouchableOpacity
            testID="order_detail_refresh_delivery_code"
            style={styles.secondaryButton}
            onPress={() => void loadCode()}
            disabled={loadingCode}
          >
            {loadingCode ? <ActivityIndicator color="#0F766E" /> : <RefreshCw size={17} color="#0F766E" />}
            <Text style={styles.secondaryButtonText}>Refresh code</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          testID="order_detail_show_delivery_code"
          style={styles.primaryButton}
          onPress={() => void loadCode()}
          disabled={loadingCode}
        >
          {loadingCode ? <ActivityIndicator color="#FFFFFF" /> : <KeyRound size={18} color="#FFFFFF" />}
          <Text style={styles.primaryButtonText}>{loadingCode ? 'Loading code…' : 'Show delivery code'}</Text>
        </TouchableOpacity>
      )}

      {codeError ? <Text testID="order_detail_delivery_code_error" style={styles.error}>{codeError}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    marginTop: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#99F6E4',
    backgroundColor: '#F0FDFA',
    padding: 16,
  },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBox: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#CCFBF1', alignItems: 'center', justifyContent: 'center' },
  headingCopy: { flex: 1 },
  title: { color: '#134E4A', fontSize: 17, fontWeight: '900' },
  subtitle: { marginTop: 4, color: '#0F766E', fontSize: 12, lineHeight: 17, fontWeight: '700' },
  syncText: { marginTop: 12, color: '#64748B', fontSize: 11, fontWeight: '700' },
  codePanel: { marginTop: 16, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#5EEAD4', padding: 16, alignItems: 'center' },
  code: { color: '#0F172A', fontSize: 34, fontWeight: '900', letterSpacing: 3 },
  expiry: { marginTop: 8, color: '#B45309', fontSize: 12, fontWeight: '900' },
  primaryButton: { minHeight: 50, marginTop: 16, borderRadius: 15, backgroundColor: '#0F766E', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  secondaryButton: { minHeight: 44, marginTop: 12, borderRadius: 13, borderWidth: 1, borderColor: '#5EEAD4', backgroundColor: '#F0FDFA', paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondaryButtonText: { color: '#0F766E', fontSize: 13, fontWeight: '900' },
  error: { marginTop: 12, color: '#B91C1C', fontSize: 12, lineHeight: 18, fontWeight: '800' },
});
