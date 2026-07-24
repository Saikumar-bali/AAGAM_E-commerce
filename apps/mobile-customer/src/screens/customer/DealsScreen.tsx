import React from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { BadgePercent, CalendarClock, Gift, Tag, Truck } from 'lucide-react-native';
import { apiClient } from '@aagam/mobile-shared';
import { PromotionCarousel } from '../../components/promotions/PromotionCarousel';
import { useCartStore } from '../../store/cartStore';
import {
  couponLabel,
  type PromotionCampaign,
  type PublicCoupon,
} from '../../promotions/types';

const endsLabel = (endsAt?: string | null) => {
  if (!endsAt) return 'No fixed end date';
  const remaining = new Date(endsAt).getTime() - Date.now();
  if (remaining <= 0) return 'Expired';
  const hours = Math.ceil(remaining / 3_600_000);
  return hours < 48
    ? `Ends in ${hours}h`
    : `Ends ${new Date(endsAt).toLocaleDateString()}`;
};

export const DealsScreen = () => {
  const navigation = useNavigation<any>();
  const setCouponCode = useCartStore((state) => state.setCouponCode);
  const {
    data = { campaigns: [] as PromotionCampaign[], coupons: [] as PublicCoupon[] },
    isLoading,
    isRefetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ['promotions', 'deals'],
    queryFn: async () => {
      const response = await apiClient.get('/promotions/deals');
      return {
        campaigns: Array.isArray(response.data?.campaigns) ? response.data.campaigns : [],
        coupons: Array.isArray(response.data?.coupons) ? response.data.coupons : [],
      };
    },
  });

  const openCampaign = (campaign: PromotionCampaign) => {
    const target = campaign.targetUrl || '';
    const product = target.match(/^\/shop\/products\/([^/?#]+)/);
    if (product) return navigation.navigate('ProductDetail', { productId: product[1] });
    const category = target.match(/[?&]category=([^&#]+)/);
    if (category) {
      return navigation.navigate('MainTabs', {
        screen: 'Shop',
        params: { categoryId: decodeURIComponent(category[1]) },
      });
    }
    if (target.startsWith('/shop/checkout')) return navigation.navigate('Checkout');
  };

  const useCoupon = (coupon: PublicCoupon) => {
    if (!coupon.eligible || !coupon.code) return;
    setCouponCode(coupon.code);
    navigation.navigate('Checkout', { couponCode: coupon.code });
  };

  if (isLoading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#0F766E" /></View>;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#0F766E" />}
    >
      <Text style={styles.eyebrow}>LIVE FROM ADMIN</Text>
      <Text style={styles.heading}>Deals & Offers</Text>
      <Text style={styles.lead}>Published campaigns and coupons checked for your account.</Text>

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>Could not load current deals.</Text>
          <TouchableOpacity testID="deals_retry_button" onPress={() => refetch()}><Text style={styles.retry}>Try again</Text></TouchableOpacity>
        </View>
      ) : null}

      {data.campaigns.length ? (
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}><Gift size={18} color="#0F766E" /><Text style={styles.sectionTitle}>Featured campaigns</Text></View>
          <PromotionCarousel campaigns={data.campaigns} onPress={openCampaign} compact />
        </View>
      ) : null}

      <View style={styles.section}>
        <View style={styles.sectionTitleRow}><Tag size={18} color="#0F766E" /><Text style={styles.sectionTitle}>Available coupons</Text></View>
        {!data.coupons.length ? (
          <View style={styles.emptyCard}>
            <BadgePercent size={28} color="#94A3B8" />
            <Text style={styles.emptyTitle}>No coupons are active</Text>
            <Text style={styles.emptyText}>Only currently published, server-validated offers appear here.</Text>
          </View>
        ) : data.coupons.map((coupon: PublicCoupon) => {
          const Icon = coupon.discountType === 'FREE_DELIVERY' ? Truck : BadgePercent;
          return (
            <View key={coupon.id} style={[styles.couponCard, !coupon.eligible && styles.couponDisabled]}>
              <View style={styles.couponTop}>
                <View style={styles.iconBox}><Icon size={20} color="#0F766E" /></View>
                <View style={styles.couponCopy}>
                  <Text style={styles.couponValue}>{couponLabel(coupon)}</Text>
                  <Text style={styles.couponName}>{coupon.name}</Text>
                </View>
                {coupon.code ? <Text style={styles.code}>{coupon.code}</Text> : <Text style={styles.auto}>AUTO</Text>}
              </View>
              {coupon.description ? <Text style={styles.description}>{coupon.description}</Text> : null}
              <View style={styles.metaRow}>
                <CalendarClock size={13} color="#64748B" />
                <Text style={styles.meta}>{endsLabel(coupon.endsAt)}</Text>
                {coupon.minimumSubtotalPaise > 0 ? (
                  <Text style={styles.meta}>• Min ₹{coupon.minimumSubtotalPaise / 100}</Text>
                ) : null}
              </View>
              {!coupon.eligible ? (
                <Text style={styles.ineligible}>{coupon.ineligibleReason || 'Not eligible for this account'}</Text>
              ) : coupon.code ? (
                <TouchableOpacity testID="deals_use_at_checkout" style={styles.useButton} onPress={() => useCoupon(coupon)}>
                  <Text style={styles.useButtonText}>Use at checkout</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.autoMessage}>Applied automatically when your cart qualifies.</Text>
              )}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 16, paddingBottom: 42 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC' },
  eyebrow: { color: '#0F766E', fontSize: 11, fontWeight: '900', letterSpacing: 1.8 },
  heading: { marginTop: 7, color: '#0F172A', fontSize: 30, fontWeight: '900', letterSpacing: -0.8 },
  lead: { marginTop: 5, color: '#64748B', fontSize: 13, lineHeight: 19, fontWeight: '600' },
  section: { marginTop: 26 },
  sectionTitleRow: { marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { color: '#0F172A', fontSize: 15, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },
  errorCard: { marginTop: 18, padding: 16, borderRadius: 18, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
  errorText: { color: '#B91C1C', fontWeight: '800' },
  retry: { marginTop: 8, color: '#0F766E', fontWeight: '900' },
  emptyCard: { alignItems: 'center', borderRadius: 24, borderWidth: 1, borderStyle: 'dashed', borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', padding: 28 },
  emptyTitle: { marginTop: 9, color: '#0F172A', fontSize: 17, fontWeight: '900' },
  emptyText: { marginTop: 5, color: '#64748B', fontSize: 12, lineHeight: 17, textAlign: 'center' },
  couponCard: { marginBottom: 12, borderRadius: 22, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', padding: 16 },
  couponDisabled: { opacity: 0.62 },
  couponTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  iconBox: { width: 42, height: 42, borderRadius: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: '#CCFBF1' },
  couponCopy: { flex: 1 },
  couponValue: { color: '#0F172A', fontSize: 17, fontWeight: '900' },
  couponName: { marginTop: 2, color: '#64748B', fontSize: 12, fontWeight: '700' },
  code: { overflow: 'hidden', borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: '#94A3B8', paddingHorizontal: 9, paddingVertical: 7, color: '#0F172A', fontSize: 11, fontWeight: '900' },
  auto: { overflow: 'hidden', borderRadius: 999, backgroundColor: '#EDE9FE', paddingHorizontal: 9, paddingVertical: 5, color: '#6D28D9', fontSize: 10, fontWeight: '900' },
  description: { marginTop: 12, color: '#475569', fontSize: 12, lineHeight: 18 },
  metaRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 5 },
  meta: { color: '#64748B', fontSize: 11, fontWeight: '700' },
  ineligible: { marginTop: 12, color: '#B45309', fontSize: 12, fontWeight: '800' },
  useButton: { marginTop: 14, alignItems: 'center', borderRadius: 13, backgroundColor: '#0F172A', paddingVertical: 12 },
  useButtonText: { color: '#FFFFFF', fontWeight: '900' },
  autoMessage: { marginTop: 12, color: '#0F766E', fontSize: 12, fontWeight: '800' },
});
