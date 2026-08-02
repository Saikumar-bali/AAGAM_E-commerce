import {
  ArrowLeft,
  Check,
  PackageCheck,
  ShieldCheck,
} from 'lucide-react-native';
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
  RiderCompletionReceipt,
  formatRupees,
  shortRiderOrderId,
} from '../../domain/riderDeliveryFlow';

function ReceiptRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.receiptRow}>
      <Text style={styles.receiptLabel}>{label}</Text>
      <Text style={[styles.receiptValue, strong && styles.receiptValueStrong]}>{value}</Text>
    </View>
  );
}

function Card({ children, earnings }: { children: React.ReactNode; earnings?: boolean }) {
  return <View style={[styles.card, earnings && styles.earningsCard]}>{children}</View>;
}

export const RiderDeliveryCompletedScreen = ({
  receipt,
  onHome,
}: {
  receipt: RiderCompletionReceipt;
  onHome: () => void;
}) => (
  <View style={styles.screen}>
    <StatusBar barStyle="light-content" backgroundColor="#078E67" />
    <View style={styles.header}>
      <TouchableOpacity testID="rider_completed_back_button" style={styles.headerSide} onPress={onHome}>
        <ArrowLeft size={31} color="#FFFFFF" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Delivery Completed</Text>
      <View style={styles.headerSide}><ShieldCheck size={30} color="#FFFFFF" /></View>
    </View>

    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.celebrationArea}>
        <Text style={[styles.confetti, { left: 48, top: 26 }]}>◆</Text>
        <Text style={[styles.confetti, { right: 55, top: 62, color: '#F59E0B' }]}>◆</Text>
        <Text style={[styles.confetti, { left: 105, top: 90, color: '#2563EB' }]}>◆</Text>
        <View style={styles.successCircle}><Check size={62} color="#FFFFFF" strokeWidth={3.3} /></View>
        <View style={styles.packageArt}>
          <PackageCheck size={100} color="#F59E0B" fill="#FFC247" />
          <View style={styles.medicalBag}>
            <View style={styles.bagHandle} />
            <Text style={styles.bagPlus}>+</Text>
          </View>
        </View>
        <Text style={styles.successTitle}>Successfully Delivered!</Text>
        <Text style={styles.successSubtitle}>Thank you for delivering with care.</Text>
      </View>

      <Card>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Order Summary</Text>
          <Text style={styles.orderId}>#{shortRiderOrderId(receipt.orderId)}</Text>
        </View>
        <ReceiptRow label="Items Delivered" value={`${receipt.itemCount} Items`} strong />
        <ReceiptRow label="Payment Method" value={receipt.paymentMethod} strong />
        <ReceiptRow label="Order Amount" value={formatRupees(receipt.orderAmount)} strong />
        <ReceiptRow label="Customer Paid" value={formatRupees(receipt.customerPaid)} strong />
      </Card>

      <Card earnings>
        <View style={styles.earningsHeader}>
          <Text style={styles.earningsTitle}>Your Earnings</Text>
          <Text style={styles.earningsTotal}>{formatRupees(receipt.earnings)}</Text>
        </View>
        {receipt.baseFare != null || receipt.distanceIncentive != null || receipt.surgeOther != null ? (
          <>
            <ReceiptRow label="Base Fare" value={formatRupees(receipt.baseFare)} strong />
            <ReceiptRow label="Distance Incentive" value={formatRupees(receipt.distanceIncentive)} strong />
            <ReceiptRow label="Surge / Other" value={formatRupees(receipt.surgeOther)} strong />
          </>
        ) : (
          <ReceiptRow label="Delivery payout" value={formatRupees(receipt.earnings)} strong />
        )}
      </Card>

      <TouchableOpacity testID="rider_completed_home_button" style={styles.homeButton} onPress={onHome}>
        <Text style={styles.homeButtonText}>Continue to Home</Text>
      </TouchableOpacity>
    </ScrollView>
  </View>
);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { height: 82, paddingTop: 18, paddingHorizontal: 18, backgroundColor: '#078E67', flexDirection: 'row', alignItems: 'center' },
  headerSide: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, color: '#FFFFFF', fontSize: 21, fontWeight: '800', textAlign: 'center' },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 112, gap: 16 },
  celebrationArea: { minHeight: 420, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  confetti: { position: 'absolute', color: '#16A34A', fontSize: 19 },
  successCircle: { width: 152, height: 152, borderRadius: 76, backgroundColor: '#07966D', alignItems: 'center', justifyContent: 'center' },
  packageArt: { marginTop: -12, width: 220, height: 122, alignItems: 'center', justifyContent: 'center' },
  medicalBag: { position: 'absolute', right: 42, bottom: 13, width: 75, height: 80, borderRadius: 13, backgroundColor: '#0AA46A', alignItems: 'center', justifyContent: 'center' },
  bagHandle: { position: 'absolute', top: -20, width: 45, height: 28, borderWidth: 8, borderColor: '#0AA46A', borderBottomWidth: 0, borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  bagPlus: { color: '#FFFFFF', fontSize: 42, fontWeight: '900' },
  successTitle: { color: '#07966D', fontSize: 27, fontWeight: '900', marginTop: 16 },
  successSubtitle: { color: '#667085', fontSize: 17, marginTop: 10 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 20, borderWidth: 1, borderColor: '#E4E7EB', padding: 17, shadowColor: '#111827', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  cardTitle: { color: '#111827', fontSize: 21, fontWeight: '900' },
  orderId: { color: '#667085', fontSize: 18, fontWeight: '700' },
  receiptRow: { minHeight: 56, borderBottomWidth: 1, borderBottomColor: '#EAECF0', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  receiptLabel: { color: '#667085', fontSize: 16 },
  receiptValue: { color: '#111827', fontSize: 16, fontWeight: '600' },
  receiptValueStrong: { fontWeight: '900' },
  earningsCard: { backgroundColor: '#F0FAF6', borderColor: '#CBE8DC' },
  earningsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  earningsTitle: { color: '#07966D', fontSize: 21, fontWeight: '900' },
  earningsTotal: { color: '#07966D', fontSize: 22, fontWeight: '900' },
  homeButton: { minHeight: 66, borderRadius: 17, backgroundColor: '#078E67', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  homeButtonText: { color: '#FFFFFF', fontSize: 21, fontWeight: '800' },
});
