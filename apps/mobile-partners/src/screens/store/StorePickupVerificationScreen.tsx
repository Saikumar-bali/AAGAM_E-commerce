import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Package,
  Phone,
  RefreshCw,
  RotateCw,
  Star,
  UserRound,
} from 'lucide-react-native';
import { deliveryOperationsService } from '../../api/deliveryOperationsService';
import { pickupOperationsService } from '../../api/pickupOperationsService';
import {
  buildStorePickupReceipt,
  formatStoreMoney,
  orderCustomerName,
  orderPaymentMethod,
  pickupParcelCount,
  riderProfile,
  shortStoreOrderId,
} from '../../domain/storeReferenceUi';

const QUEUE_KEY = ['store', 'pickup-verification'] as const;

type IssuedPin = {
  code: string;
  expiresAt: string;
  parcelCount: number;
};

function errorMessage(error: any) {
  const value = error?.response?.data?.message;
  if (Array.isArray(value)) return value.join(', ');
  return value || error?.message || 'The pickup operation could not be completed.';
}

function pickupTime(job: any) {
  const value = job?.arrivedAt || job?.updatedAt || job?.createdAt;
  return value
    ? new Date(value).toLocaleString('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
    : 'Time unavailable';
}

export const StorePickupVerificationScreen = ({ navigation, route }: { navigation?: any; route?: any }) => {
  const deliveryJobId = String(route?.params?.deliveryJobId || '');
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<'PIN' | 'HANDOFF' | null>(null);
  const [issuedPin, setIssuedPin] = useState<IssuedPin | null>(null);

  const jobQuery = useQuery({
    queryKey: [...QUEUE_KEY, deliveryJobId],
    queryFn: async () => {
      const queue = await deliveryOperationsService.getQueue();
      const job = queue.find((entry: any) => entry.id === deliveryJobId)
        || queue.find((entry: any) => entry.status === 'RIDER_AT_STORE')
        || null;
      if (!job) return null;
      return {
        ...job,
        pickupReadiness: await pickupOperationsService.getReadiness(job.id),
      };
    },
    enabled: Boolean(deliveryJobId),
    refetchInterval: 8_000,
    retry: 1,
  });

  const job = jobQuery.data;
  const order = job?.order || {};
  const rider = riderProfile(job);
  const items = Array.isArray(order?.items) ? order.items : [];
  const parcelCount = pickupParcelCount(job);
  const ready = Boolean(job?.pickupReadiness?.ready);
  const payment = orderPaymentMethod(order);
  const total = Number(order?.grandTotal ?? order?.totalAmount);
  const totalUnits = useMemo(
    () => items.reduce((sum: number, item: any) => sum + Number(item?.quantity || 0), 0),
    [items],
  );

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: QUEUE_KEY });
    await jobQuery.refetch();
  };

  const issuePin = async () => {
    if (!job) return;
    if (!ready) {
      Alert.alert('Rider checklist pending', 'The rider must verify every packed item before a pickup PIN can be issued.');
      return;
    }
    setBusy('PIN');
    try {
      const result = await deliveryOperationsService.issuePickupChallenge(job.id, {
        method: 'STORE_PICKUP_PIN',
        parcelCount,
      });
      setIssuedPin({
        code: String(result.code || ''),
        expiresAt: String(result.expiresAt || ''),
        parcelCount: Number(result.parcelCount || parcelCount),
      });
    } catch (error: any) {
      Alert.alert('Could not issue rider PIN', errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const confirmHandoff = () => {
    if (!job) return;
    if (!ready) {
      Alert.alert('Rider checklist pending', 'Confirm handoff only after the rider verifies all packed items.');
      return;
    }
    Alert.alert(
      'Confirm physical handoff?',
      `Confirm that ${parcelCount} parcel${parcelCount === 1 ? '' : 's'} were handed to ${rider.name}.`,
      [
        { text: 'Back', style: 'cancel' },
        {
          text: 'Confirm Handoff',
          onPress: async () => {
            setBusy('HANDOFF');
            try {
              await deliveryOperationsService.confirmStoreHandoff(job.id, { parcelCount });
              const receipt = buildStorePickupReceipt(job, parcelCount);
              await refresh();
              navigation?.replace?.('StorePickupSuccess', { receipt });
            } catch (error: any) {
              Alert.alert('Handoff failed', errorMessage(error));
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );
  };

  const callRider = async () => {
    if (!rider.phone) {
      Alert.alert('Rider phone unavailable', 'The assigned rider did not provide a callable number.');
      return;
    }
    try {
      await Linking.openURL(`tel:${rider.phone}`);
    } catch {
      Alert.alert('Could not open phone app', rider.phone);
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerIcon} onPress={() => navigation?.goBack?.()}>
          <ArrowLeft size={31} color="#151922" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Store Pickup Verification</Text>
        <TouchableOpacity style={styles.headerIcon} onPress={() => void refresh()}>
          <RefreshCw size={22} color="#59616B" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={jobQuery.isRefetching} onRefresh={() => void refresh()} tintColor="#078B4D" />}
      >
        {jobQuery.isLoading ? (
          <View style={styles.stateCard}><ActivityIndicator size="large" color="#078B4D" /><Text style={styles.stateText}>Loading pickup verification…</Text></View>
        ) : jobQuery.isError ? (
          <View style={styles.stateCard}><Text style={styles.stateTitle}>Pickup verification unavailable</Text><Text style={styles.stateText}>{errorMessage(jobQuery.error)}</Text></View>
        ) : !job ? (
          <View style={styles.stateCard}><Package size={45} color="#A8B0B7" /><Text style={styles.stateTitle}>Rider is no longer waiting</Text><Text style={styles.stateText}>The pickup may already be completed or reassigned.</Text></View>
        ) : (
          <>
            <View style={styles.riderCard}>
              <View style={styles.riderTopRow}>
                <View style={styles.riderAvatar}><UserRound size={42} color="#078B4D" fill="#078B4D" /></View>
                <View style={styles.riderCopy}>
                  <Text style={styles.riderName}>{rider.name}</Text>
                  <Text style={styles.riderPhone}>{rider.phone || 'Phone unavailable'}</Text>
                </View>
                {rider.rating != null ? (
                  <View style={styles.rating}><Star size={20} color="#FFB300" fill="#FFB300" /><Text style={styles.ratingText}>{rider.rating.toFixed(1)}</Text></View>
                ) : null}
              </View>
              <Text style={styles.metaLabel}>Arrived at</Text>
              <Text style={styles.metaValue}>{pickupTime(job)}</Text>
              <View style={styles.vehicleCallRow}>
                <View style={styles.flex}>
                  <Text style={styles.metaLabel}>Vehicle</Text>
                  <Text style={styles.metaValue}>{rider.vehicleNumber || 'Vehicle unavailable'}</Text>
                </View>
                <TouchableOpacity style={styles.callButton} onPress={() => void callRider()}>
                  <Phone size={27} color="#078B4D" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.orderCard}>
              <InfoRow label="Order ID" value={`#ORD-${shortStoreOrderId(order.id || job.orderId)}`} />
              <InfoRow label="Customer" value={orderCustomerName(order)} />
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Payment</Text>
                <View style={[styles.paymentPill, payment === 'COD' ? styles.codPill : styles.prepaidPill]}>
                  <Text style={[styles.paymentText, payment === 'COD' ? styles.codText : styles.prepaidText]}>{payment}</Text>
                </View>
              </View>
              <InfoRow label="Total" value={formatStoreMoney(total)} />
            </View>

            <View style={styles.checklistCard}>
              <Text style={styles.checklistTitle}>Packed Items Checklist</Text>
              {items.map((item: any, index: number) => (
                <View key={item.id || index} style={[styles.itemRow, index < items.length - 1 && styles.itemBorder]}>
                  <View style={styles.checkBox}><Check size={18} color="#FFFFFF" strokeWidth={3} /></View>
                  <Text style={styles.itemName} numberOfLines={1}>{item.product?.name || 'Product'}</Text>
                  <Text style={styles.itemQuantity}>{Number(item.quantity || 0)}</Text>
                </View>
              ))}
              {!items.length ? <Text style={styles.emptyItems}>No packed item lines were returned for this order.</Text> : null}
              <View style={styles.parcelSummary}>
                <Text style={styles.parcelLabel}>Total Parcels</Text>
                <Text style={styles.parcelCount}>{parcelCount}</Text>
                <Package size={39} color="#5C6972" />
              </View>
              <View style={[styles.readinessBanner, ready ? styles.readyBanner : styles.waitingBanner]}>
                <CheckCircle2 size={19} color={ready ? '#16833A' : '#B56A12'} />
                <Text style={[styles.readinessText, { color: ready ? '#16833A' : '#B56A12' }]}>
                  {ready ? `Rider verified ${totalUnits} packed unit${totalUnits === 1 ? '' : 's'}` : 'Waiting for rider checklist verification'}
                </Text>
              </View>
            </View>

            <View style={styles.pinArea}>
              <Text style={styles.pinTitle}>Issue 6-Digit Rider PIN</Text>
              <Text style={styles.pinSubtitle}>Share this PIN with the rider for verification</Text>
              {issuedPin ? (
                <View style={styles.pinRow}>
                  {issuedPin.code.slice(0, 6).split('').map((digit, index) => (
                    <View key={`${digit}-${index}`} style={styles.pinBox}><Text style={styles.pinDigit}>{digit}</Text></View>
                  ))}
                  <TouchableOpacity style={styles.regenerateButton} disabled={busy === 'PIN'} onPress={() => void issuePin()}>
                    {busy === 'PIN' ? <ActivityIndicator color="#078B4D" /> : <RotateCw size={29} color="#078B4D" />}
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={[styles.issuePinButton, (!ready || busy) && styles.disabled]} disabled={!ready || Boolean(busy)} onPress={() => void issuePin()}>
                  {busy === 'PIN' ? <ActivityIndicator color="#078B4D" /> : <Text style={styles.issuePinText}>Generate Rider PIN</Text>}
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              testID="store_pickup_confirm_handoff"
              style={[styles.confirmButton, (!ready || busy) && styles.disabled]}
              disabled={!ready || Boolean(busy)}
              onPress={confirmHandoff}
            >
              {busy === 'HANDOFF' ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.confirmText}>Confirm Handoff</Text>}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
};

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FAFBFA' },
  flex: { flex: 1 },
  header: { height: 114, paddingTop: 50, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF' },
  headerIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, color: '#151922', fontSize: 22, fontWeight: '900', textAlign: 'center' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 17, paddingBottom: 44 },
  riderCard: { borderRadius: 18, borderWidth: 1, borderColor: '#E0E3E2', backgroundColor: '#FFFFFF', padding: 17 },
  riderTopRow: { flexDirection: 'row', alignItems: 'center' },
  riderAvatar: { width: 65, height: 65, borderRadius: 33, backgroundColor: '#E9F9EE', alignItems: 'center', justifyContent: 'center' },
  riderCopy: { flex: 1, marginLeft: 13 },
  riderName: { color: '#151922', fontSize: 19, fontWeight: '900' },
  riderPhone: { color: '#5F6872', fontSize: 15, marginTop: 5 },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ratingText: { color: '#151922', fontSize: 17, fontWeight: '900' },
  metaLabel: { color: '#626B74', fontSize: 14, marginTop: 15 },
  metaValue: { color: '#151922', fontSize: 16, fontWeight: '800', marginTop: 5 },
  vehicleCallRow: { flexDirection: 'row', alignItems: 'center' },
  callButton: { width: 58, height: 58, borderRadius: 29, borderWidth: 1, borderColor: '#D9DDDB', alignItems: 'center', justifyContent: 'center' },
  orderCard: { borderRadius: 17, borderWidth: 1, borderColor: '#E0E3E2', backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingVertical: 10, marginTop: 13 },
  infoRow: { minHeight: 51, flexDirection: 'row', alignItems: 'center' },
  infoLabel: { flex: 1, color: '#65707A', fontSize: 15 },
  infoValue: { color: '#151922', fontSize: 15, fontWeight: '900' },
  paymentPill: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  prepaidPill: { backgroundColor: '#EAF9EE' },
  codPill: { backgroundColor: '#FFF1E5' },
  paymentText: { fontSize: 12, fontWeight: '900' },
  prepaidText: { color: '#087C35' },
  codText: { color: '#BE5B09' },
  checklistCard: { borderRadius: 17, borderWidth: 1, borderColor: '#E0E3E2', backgroundColor: '#FFFFFF', padding: 16, marginTop: 13 },
  checklistTitle: { color: '#087B4E', fontSize: 17, fontWeight: '900', marginBottom: 8 },
  itemRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center' },
  itemBorder: { borderBottomWidth: 1, borderBottomColor: '#E8EAE9' },
  checkBox: { width: 28, height: 28, borderRadius: 5, backgroundColor: '#0A9A50', alignItems: 'center', justifyContent: 'center' },
  itemName: { flex: 1, color: '#151922', fontSize: 15, marginLeft: 12 },
  itemQuantity: { color: '#151922', fontSize: 16, fontWeight: '900' },
  emptyItems: { color: '#777F86', fontSize: 13, paddingVertical: 18 },
  parcelSummary: { minHeight: 68, borderTopWidth: 1, borderTopColor: '#E7E9E8', flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  parcelLabel: { color: '#087B4E', fontSize: 17, fontWeight: '900' },
  parcelCount: { flex: 1, color: '#151922', fontSize: 28, fontWeight: '900', marginLeft: 22 },
  readinessBanner: { borderRadius: 10, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 8 },
  readyBanner: { backgroundColor: '#EAF9EE' },
  waitingBanner: { backgroundColor: '#FFF5E7' },
  readinessText: { flex: 1, fontSize: 12, fontWeight: '800' },
  pinArea: { alignItems: 'center', marginTop: 22 },
  pinTitle: { color: '#151922', fontSize: 18, fontWeight: '900' },
  pinSubtitle: { color: '#626B74', fontSize: 13, marginTop: 6, textAlign: 'center' },
  pinRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 15 },
  pinBox: { width: 45, height: 55, borderRadius: 9, borderWidth: 1, borderColor: '#CCD2CF', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  pinDigit: { color: '#087B4E', fontSize: 25, fontWeight: '900' },
  regenerateButton: { width: 45, height: 55, alignItems: 'center', justifyContent: 'center' },
  issuePinButton: { height: 52, minWidth: 210, borderRadius: 10, borderWidth: 1, borderColor: '#078B4D', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginTop: 15 },
  issuePinText: { color: '#078B4D', fontSize: 15, fontWeight: '900' },
  confirmButton: { height: 62, borderRadius: 13, backgroundColor: '#078B4D', alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  confirmText: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
  disabled: { opacity: 0.45 },
  stateCard: { minHeight: 440, alignItems: 'center', justifyContent: 'center', padding: 28 },
  stateTitle: { color: '#171A1D', fontSize: 18, fontWeight: '900', marginTop: 12, textAlign: 'center' },
  stateText: { color: '#6D747B', fontSize: 13, marginTop: 7, textAlign: 'center', lineHeight: 20 },
});
