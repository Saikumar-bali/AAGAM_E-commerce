import React from 'react';
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  ShieldCheck,
  Star,
  UserRound,
} from 'lucide-react-native';
import type { StorePickupReceipt } from '../../domain/storeReferenceUi';
import { shortStoreOrderId } from '../../domain/storeReferenceUi';

export const StorePickupSuccessScreen = ({ navigation, route }: { navigation?: any; route?: any }) => {
  const receipt = route?.params?.receipt as StorePickupReceipt | undefined;
  const storeId = route?.params?.storeId as string | undefined;

  if (!receipt) {
    return (
      <View style={styles.missing}>
        <Text style={styles.missingTitle}>Pickup receipt unavailable</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => navigation?.navigate?.('StoreTabs', { screen: 'Orders' })}>
          <Text style={styles.primaryButtonText}>Back to Orders</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const pickupTime = new Date(receipt.pickupTime).toLocaleString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const backToOrders = () => navigation?.navigate?.('StoreTabs', {
    screen: 'Orders',
    params: { screen: 'OrderQueue', params: storeId ? { storeId } : undefined },
  });

  const viewOrder = () => navigation?.navigate?.('StoreTabs', {
    screen: 'Orders',
    params: {
      screen: 'OrderDetails',
      params: { orderId: receipt.orderId, storeId },
    },
  });

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#057A55" />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <TouchableOpacity style={styles.backButton} onPress={backToOrders}>
            <ArrowLeft size={32} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={[styles.confetti, { left: 80, top: 84, color: '#F4756C' }]}>◆</Text>
          <Text style={[styles.confetti, { right: 73, top: 118, color: '#F5B400' }]}>◆</Text>
          <Text style={[styles.confetti, { left: 144, top: 53, color: '#D583D4' }]}>◆</Text>
          <Text style={[styles.confetti, { right: 122, top: 78, color: '#4FCB66' }]}>◆</Text>
          <View style={styles.shieldCircle}>
            <ShieldCheck size={92} color="#FFFFFF" strokeWidth={2.4} />
            <View style={styles.checkOverlay}><Check size={42} color="#FFFFFF" strokeWidth={3.2} /></View>
          </View>
          <Text style={styles.successTitle}>Pickup Successful!</Text>
          <Text style={styles.successSubtitle}>Verification Complete</Text>
        </View>

        <View style={styles.receiptCard}>
          <View style={styles.riderRow}>
            <View style={styles.avatar}><UserRound size={38} color="#078B4D" fill="#078B4D" /></View>
            <View style={styles.riderCopy}>
              <Text style={styles.riderName}>{receipt.riderName}</Text>
              <Text style={styles.riderPhone}>{receipt.riderPhone || 'Phone unavailable'}</Text>
            </View>
            <View style={styles.verifiedColumn}>
              <View style={styles.verifiedPill}><Text style={styles.verifiedText}>Verified</Text></View>
              {receipt.riderRating != null ? (
                <View style={styles.rating}><Star size={20} color="#FFB300" fill="#FFB300" /><Text style={styles.ratingText}>{receipt.riderRating.toFixed(1)}</Text></View>
              ) : null}
            </View>
          </View>
          <View style={styles.divider} />
          <ReceiptRow label="Order ID" value={`#ORD-${shortStoreOrderId(receipt.orderId)}`} />
          <ReceiptRow label="Customer" value={receipt.customerName} />
          <View style={styles.receiptRow}>
            <Text style={styles.receiptLabel}>Payment</Text>
            <View style={[styles.paymentPill, receipt.paymentMethod === 'COD' ? styles.codPill : styles.prepaidPill]}>
              <Text style={[styles.paymentText, receipt.paymentMethod === 'COD' ? styles.codText : styles.prepaidText]}>{receipt.paymentMethod}</Text>
            </View>
          </View>
          <ReceiptRow label="Parcels Handed Over" value={String(receipt.parcelCount)} />
          <View style={styles.divider} />
          <ReceiptRow label="Pickup Time" value={pickupTime} />
        </View>

        <View style={styles.successBanner}>
          <View style={styles.successIcon}><CheckCircle2 size={32} color="#FFFFFF" fill="#078B4D" /></View>
          <Text style={styles.successBannerText}>Order has been successfully handed over</Text>
        </View>

        <TouchableOpacity style={styles.primaryButton} onPress={backToOrders}>
          <Text style={styles.primaryButtonText}>Back to Orders</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.detailsButton} onPress={viewOrder}>
          <Text style={styles.detailsText}>View Order Details</Text>
          <ChevronRight size={25} color="#087B4E" />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.receiptRow}>
      <Text style={styles.receiptLabel}>{label}</Text>
      <Text style={styles.receiptValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8F9F8' },
  scroll: { flex: 1 },
  content: { paddingBottom: 40 },
  hero: { height: 355, backgroundColor: '#057A55', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  backButton: { position: 'absolute', top: 60, left: 25, width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  confetti: { position: 'absolute', fontSize: 14 },
  shieldCircle: { height: 125, alignItems: 'center', justifyContent: 'center' },
  checkOverlay: { position: 'absolute', top: 42 },
  successTitle: { color: '#FFFFFF', fontSize: 29, fontWeight: '900', marginTop: 22 },
  successSubtitle: { color: '#FFFFFF', fontSize: 21, marginTop: 8 },
  receiptCard: { marginHorizontal: 17, marginTop: -35, borderRadius: 22, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DFE3E1', padding: 20, elevation: 5, shadowColor: '#17261F', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12 },
  riderRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#EAF9EE', alignItems: 'center', justifyContent: 'center' },
  riderCopy: { flex: 1, marginLeft: 13 },
  riderName: { color: '#151820', fontSize: 20, fontWeight: '900' },
  riderPhone: { color: '#626B74', fontSize: 15, marginTop: 5 },
  verifiedColumn: { alignItems: 'flex-end' },
  verifiedPill: { borderRadius: 9, backgroundColor: '#EAF9EE', borderWidth: 1, borderColor: '#CBECCF', paddingHorizontal: 12, paddingVertical: 8 },
  verifiedText: { color: '#087C35', fontSize: 13, fontWeight: '900' },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 9 },
  ratingText: { color: '#151820', fontSize: 15, fontWeight: '900' },
  divider: { height: 1, backgroundColor: '#E6E8E7', marginVertical: 16 },
  receiptRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center' },
  receiptLabel: { flex: 1, color: '#626B74', fontSize: 15 },
  receiptValue: { color: '#151820', fontSize: 15, fontWeight: '900', textAlign: 'right', maxWidth: '58%' },
  paymentPill: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  prepaidPill: { backgroundColor: '#EAF9EE' },
  codPill: { backgroundColor: '#FFF1E5' },
  paymentText: { fontSize: 12, fontWeight: '900' },
  prepaidText: { color: '#087C35' },
  codText: { color: '#BE5B09' },
  successBanner: { minHeight: 92, marginHorizontal: 17, marginTop: 18, borderRadius: 16, borderWidth: 1, borderColor: '#BFE7CE', backgroundColor: '#EAF9EE', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, gap: 14 },
  successIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#078B4D', alignItems: 'center', justifyContent: 'center' },
  successBannerText: { flex: 1, color: '#08723F', fontSize: 16, lineHeight: 23, fontWeight: '700' },
  primaryButton: { height: 62, borderRadius: 13, backgroundColor: '#078B4D', marginHorizontal: 17, marginTop: 20, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
  detailsButton: { height: 65, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  detailsText: { color: '#087B4E', fontSize: 18, fontWeight: '900' },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8F9F8', padding: 24 },
  missingTitle: { color: '#151820', fontSize: 20, fontWeight: '900', marginBottom: 20 },
});
