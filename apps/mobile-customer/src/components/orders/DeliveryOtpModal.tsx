import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { KeyRound, RefreshCw, ShieldCheck, X } from 'lucide-react-native';
import { apiClient } from '@aagam/mobile-shared';

type DeliveryOtp = { code: string; expiresAt: string; orderId: string };

function secondsUntilExpiry(expiresAt?: string | null, now = Date.now()) {
  if (!expiresAt) return 0;
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000));
}

function message(error: any) {
  const value = error?.response?.data?.message;
  if (Array.isArray(value)) return value.join(', ');
  return typeof value === 'string' ? value : 'The delivery code is not available yet.';
}

export function DeliveryOtpModal({
  deliveryJobId,
  visible,
  onClose,
}: {
  deliveryJobId: string | null;
  visible: boolean;
  onClose: () => void;
}) {
  const [data, setData] = useState<DeliveryOtp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const remaining = useMemo(() => secondsUntilExpiry(data?.expiresAt, now), [data?.expiresAt, now]);

  const load = async () => {
    if (!deliveryJobId || !visible || loading) return;
    setLoading(true);
    setError('');
    try {
      const response = await apiClient.get(
        `/orders/delivery-operations/jobs/${encodeURIComponent(deliveryJobId)}/otp/customer`,
      );
      setData(response.data as DeliveryOtp);
      setNow(Date.now());
    } catch (err: any) {
      setData(null);
      setError(message(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!visible || !deliveryJobId) return;
    setData(null);
    setError('');
    void load();
    const refresh = setInterval(() => void load(), 15_000);
    return () => clearInterval(refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, deliveryJobId]);

  useEffect(() => {
    if (!visible || !data) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [visible, data]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close delivery code" style={styles.close} onPress={onClose}>
            <X size={20} color="#475569" />
          </TouchableOpacity>
          <View style={styles.icon}><ShieldCheck size={28} color="#0F766E" /></View>
          <Text style={styles.eyebrow}>RIDER IS AT YOUR DOOR</Text>
          <Text style={styles.title}>Delivery verification code</Text>
          <Text style={styles.subtitle}>Check the parcel first, then share this code with the rider.</Text>

          {data?.code ? (
            <View style={styles.codeBox}>
              <KeyRound size={20} color="#0F766E" />
              <Text testID="global_delivery_otp_code" style={styles.code}>{String(data.code).replace(/\D/g, '').slice(0, 6).split('').join(' ')}</Text>
              <Text style={[styles.expiry, remaining === 0 && styles.expired]}>
                {remaining > 0 ? `Expires in ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}` : 'Code expired — ask the rider for a new one'}
              </Text>
            </View>
          ) : (
            <View style={styles.waiting}>
              {loading ? <ActivityIndicator color="#0F766E" /> : <Text style={styles.error}>{error || 'Checking for the delivery code…'}</Text>}
            </View>
          )}

          <TouchableOpacity accessibilityRole="button" style={styles.refresh} disabled={loading} onPress={() => void load()}>
            {loading ? <ActivityIndicator color="#0F766E" /> : <RefreshCw size={18} color="#0F766E" />}
            <Text style={styles.refreshText}>Refresh code</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" style={styles.done} onPress={onClose}>
            <Text style={styles.doneText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.72)', padding: 20, justifyContent: 'center' },
  card: { borderRadius: 26, backgroundColor: '#FFFFFF', padding: 22, alignItems: 'center' },
  close: { position: 'absolute', right: 14, top: 14, width: 38, height: 38, borderRadius: 19, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  icon: { width: 58, height: 58, borderRadius: 20, backgroundColor: '#CCFBF1', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { marginTop: 14, color: '#0F766E', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  title: { marginTop: 6, color: '#0F172A', fontSize: 23, fontWeight: '900', textAlign: 'center' },
  subtitle: { marginTop: 8, color: '#64748B', fontSize: 13, lineHeight: 19, fontWeight: '600', textAlign: 'center' },
  codeBox: { width: '100%', marginTop: 20, borderRadius: 20, borderWidth: 1, borderColor: '#99F6E4', backgroundColor: '#F0FDFA', padding: 18, alignItems: 'center' },
  code: { marginTop: 8, color: '#0F172A', fontSize: 36, fontWeight: '900', letterSpacing: 3 },
  expiry: { marginTop: 8, color: '#92400E', fontSize: 12, fontWeight: '900' },
  expired: { color: '#B91C1C' },
  waiting: { width: '100%', minHeight: 92, marginTop: 20, borderRadius: 18, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center', padding: 16 },
  error: { color: '#B91C1C', fontSize: 12, lineHeight: 18, fontWeight: '800', textAlign: 'center' },
  refresh: { width: '100%', minHeight: 48, marginTop: 16, borderRadius: 14, borderWidth: 1, borderColor: '#99F6E4', backgroundColor: '#F0FDFA', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  refreshText: { color: '#0F766E', fontSize: 13, fontWeight: '900' },
  done: { width: '100%', minHeight: 50, marginTop: 10, borderRadius: 14, backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center' },
  doneText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
});
