import React, { useMemo } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type NavigationProp, type RouteProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, CheckCircle2, PackageCheck, ShieldCheck } from 'lucide-react-native';
import { subscriptionService, type SubscriptionPlan, type SubscriptionPlanItem } from '../../api/subscriptionService';
import type { CustomerStackParamList } from '../../navigation/customerNavigationTypes';

const money = (paise: number) => `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export const SubscriptionPlansScreen = () => {
  const navigation = useNavigation<NavigationProp<CustomerStackParamList>>();
  const route = useRoute<RouteProp<CustomerStackParamList, 'SubscriptionPlans'>>();
  const productId = route.params?.productId;
  const query = useQuery({ queryKey: ['subscription-plans'], queryFn: subscriptionService.plans, staleTime: 60_000 });
  const plans = useMemo(() => {
    const rows = Array.isArray(query.data) ? query.data : [];
    return productId ? rows.filter((plan: SubscriptionPlan) => plan.items.some((item: SubscriptionPlanItem) => item.productId === productId)) : rows;
  }, [productId, query.data]);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Go back" onPress={() => navigation.goBack()} style={styles.iconButton}><ArrowLeft size={22} color="#123D32" /></Pressable>
        <View style={styles.headerCopy}><Text style={styles.eyebrow}>RECURRING ESSENTIALS</Text><Text style={styles.title}>Subscribe & Save</Text></View>
        <Pressable onPress={() => navigation.navigate('MySubscriptions')} style={styles.myButton}><Text style={styles.myButtonText}>My plans</Text></Pressable>
      </View>
      <View style={styles.hero}>
        <View style={styles.heroIcon}><CalendarDays size={30} color="#FFFFFF" /></View>
        <View style={styles.heroCopy}><Text style={styles.heroTitle}>Fresh essentials, right on schedule</Text><Text style={styles.heroText}>Pay cash only on the first or weekly funding delivery. Funded deliveries show ₹0 due.</Text></View>
      </View>
      {query.isLoading ? <View style={styles.center}><ActivityIndicator size="large" color="#087B5B" /><Text style={styles.muted}>Loading subscription plans…</Text></View> : null}
      {query.isError ? <View style={styles.center}><Text style={styles.errorTitle}>Plans could not be loaded</Text><Text style={styles.muted}>Check your connection and try again.</Text><Pressable style={styles.retry} onPress={() => void query.refetch()}><Text style={styles.retryText}>Try again</Text></Pressable></View> : null}
      {!query.isLoading && !query.isError && plans.length === 0 ? <View style={styles.center}><PackageCheck size={42} color="#94A3B8" /><Text style={styles.errorTitle}>No matching subscription yet</Text><Text style={styles.muted}>New milk, fruit and bundle plans will appear here when published.</Text></View> : null}
      <FlatList
        data={plans}
        keyExtractor={(item: SubscriptionPlan) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }: { item: SubscriptionPlan }) => {
          const savings = Math.max(0, Number(item.mrpPaise || 0) - Number(item.pricePaise || 0));
          return <View style={styles.card}>
            <View style={styles.cardTop}>
              {item.mobileImageUrl || item.imageUrl ? <Image source={{ uri: item.mobileImageUrl || item.imageUrl }} style={styles.image} /> : <View style={[styles.image, styles.imageFallback]}><PackageCheck size={34} color="#087B5B" /></View>}
              <View style={styles.cardCopy}>
                <View style={styles.badge}><Text style={styles.badgeText}>{item.totalDeliveries} DELIVERIES</Text></View>
                <Text style={styles.planName}>{item.name}</Text>
                <Text style={styles.description} numberOfLines={2}>{item.description || 'A flexible recurring essentials plan.'}</Text>
              </View>
            </View>
            <View style={styles.itemStrip}>{item.items.slice(0, 3).map((entry: SubscriptionPlanItem) => <View key={entry.productId} style={styles.itemChip}><Text style={styles.itemChipText}>{entry.quantityPerDelivery}× {entry.product?.name || entry.name}</Text></View>)}</View>
            <View style={styles.priceRow}><Text style={styles.price}>{money(item.pricePaise)}</Text>{Number(item.mrpPaise) > Number(item.pricePaise) ? <Text style={styles.mrp}>{money(item.mrpPaise)}</Text> : null}{savings > 0 ? <Text style={styles.save}>Save {money(savings)}</Text> : null}</View>
            <View style={styles.factRow}><ShieldCheck size={16} color="#087B5B" /><Text style={styles.factText}>{item.fundingCycle === 'WEEKLY' ? 'Weekly cash funding' : 'Full-plan cash on first delivery'}</Text><CheckCircle2 size={16} color="#087B5B" /><Text style={styles.factText}>Skip & pause controls</Text></View>
            <Pressable testID={`subscription_plan_${item.id}`} style={styles.cta} onPress={() => navigation.navigate('SubscriptionReview', { planId: item.id })}><Text style={styles.ctaText}>Choose this plan</Text></Pressable>
          </View>;
        }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F4F8F6' }, header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, gap: 12, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E3ECE7' }, iconButton: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFF7F3' }, headerCopy: { flex: 1 }, eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.2, color: '#087B5B' }, title: { fontSize: 24, fontWeight: '900', color: '#123D32' }, myButton: { minHeight: 44, paddingHorizontal: 14, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#A9D4C3' }, myButtonText: { color: '#087B5B', fontWeight: '800' }, hero: { margin: 16, padding: 18, borderRadius: 24, backgroundColor: '#087B5B', flexDirection: 'row', gap: 14, alignItems: 'center' }, heroIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }, heroCopy: { flex: 1 }, heroTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' }, heroText: { color: '#D8F6E9', fontSize: 12, lineHeight: 18, marginTop: 4 }, list: { paddingHorizontal: 16, paddingBottom: 36, gap: 14 }, card: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 16, borderWidth: 1, borderColor: '#E2EBE6', shadowColor: '#0F3D2E', shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 3 }, cardTop: { flexDirection: 'row', gap: 14 }, image: { width: 98, height: 98, borderRadius: 20, backgroundColor: '#E8F4EE' }, imageFallback: { alignItems: 'center', justifyContent: 'center' }, cardCopy: { flex: 1 }, badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, backgroundColor: '#E4F7ED' }, badgeText: { fontSize: 9, fontWeight: '900', color: '#087B5B', letterSpacing: .5 }, planName: { fontSize: 19, fontWeight: '900', color: '#142F28', marginTop: 8 }, description: { color: '#64746D', fontSize: 12, lineHeight: 17, marginTop: 4 }, itemStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 14 }, itemChip: { borderRadius: 999, backgroundColor: '#F1F5F3', paddingHorizontal: 10, paddingVertical: 6 }, itemChipText: { color: '#39554B', fontSize: 11, fontWeight: '700' }, priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 15 }, price: { fontSize: 22, fontWeight: '900', color: '#123D32' }, mrp: { color: '#8A9993', textDecorationLine: 'line-through', fontWeight: '700' }, save: { color: '#D36A00', fontWeight: '900', fontSize: 12 }, factRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 12 }, factText: { color: '#516860', fontSize: 11, fontWeight: '700', marginRight: 4 }, cta: { minHeight: 50, backgroundColor: '#087B5B', borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginTop: 16 }, ctaText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10 }, muted: { color: '#6B7D75', textAlign: 'center', lineHeight: 20 }, errorTitle: { color: '#203D33', fontSize: 18, fontWeight: '900', textAlign: 'center' }, retry: { minHeight: 46, paddingHorizontal: 22, borderRadius: 15, backgroundColor: '#087B5B', justifyContent: 'center' }, retryText: { color: '#FFFFFF', fontWeight: '900' },
});
