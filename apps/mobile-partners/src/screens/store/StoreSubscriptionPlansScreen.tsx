import React from 'react';
import { ActivityIndicator, FlatList, Image, RefreshControl, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ArrowLeft, Box, CalendarDays, CheckCircle2, IndianRupee, ShieldCheck } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { subscriptionOperationsService } from '../../api/subscriptionOperationsService';

function money(paise: number) {
  return `₹${(Number(paise || 0) / 100).toLocaleString('en-IN')}`;
}

export const StoreSubscriptionPlansScreen = ({ navigation }: { navigation: any }) => {
  const insets = useSafeAreaInsets();
  const query = useQuery({
    queryKey: ['store-subscription-plans'],
    queryFn: subscriptionOperationsService.getPlans,
    retry: 1,
  });

  const plans = Array.isArray(query.data) ? query.data : [];

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#0F766E" />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
          <ArrowLeft size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>SUBSCRIPTION MANAGEMENT</Text>
          <Text style={styles.title}>Plans</Text>
        </View>
      </View>

      {query.isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#0F766E" /><Text style={styles.muted}>Loading plans…</Text></View>
      ) : query.isError ? (
        <View style={styles.center}><Text style={styles.errorTitle}>Couldn't load plans</Text><Text style={styles.muted}>Pull down to retry.</Text></View>
      ) : (
        <FlatList
          data={plans}
          keyExtractor={(item: any) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Box size={40} color="#94A3B8" />
              <Text style={styles.emptyTitle}>No plans available</Text>
              <Text style={styles.emptyText}>Subscription plans will appear here when created by admin.</Text>
            </View>
          }
          renderItem={({ item }: { item: any }) => (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                {item.mobileImageUrl || item.imageUrl ? (
                  <Image source={{ uri: item.mobileImageUrl || item.imageUrl }} style={styles.image} resizeMode="contain" />
                ) : (
                  <View style={styles.imageFallback}><Box size={28} color="#0F766E" /></View>
                )}
                <View style={styles.flex}>
                  <Text style={styles.planName}>{item.name}</Text>
                  <Text style={styles.planDesc} numberOfLines={2}>{item.description || 'Subscription plan'}</Text>
                </View>
              </View>

              <View style={styles.priceRow}>
                <View style={styles.priceBlock}>
                  <Text style={styles.priceLabel}>Price</Text>
                  <Text style={styles.price}>{money(item.pricePaise)}</Text>
                </View>
                {item.mrpPaise > item.pricePaise ? (
                  <View style={styles.priceBlock}>
                    <Text style={styles.priceLabel}>MRP</Text>
                    <Text style={styles.mrp}>{money(item.mrpPaise)}</Text>
                  </View>
                ) : null}
                <View style={styles.priceBlock}>
                  <Text style={styles.priceLabel}>Deliveries</Text>
                  <Text style={styles.price}>{item.totalDeliveries}</Text>
                </View>
              </View>

              <View style={styles.factRow}>
                <View style={styles.fact}>
                  <CalendarDays size={14} color="#0F766E" />
                  <Text style={styles.factText}>{item.deliveryFrequency || 'Daily'}</Text>
                </View>
                <View style={styles.fact}>
                  <IndianRupee size={14} color="#B45309" />
                  <Text style={styles.factText}>{item.fundingCycle === 'WEEKLY' ? 'Weekly pay' : 'Pay once'}</Text>
                </View>
                {item.allowSkip ? (
                  <View style={styles.fact}>
                    <CheckCircle2 size={14} color="#0F766E" />
                    <Text style={styles.factText}>Skip allowed</Text>
                  </View>
                ) : null}
              </View>

              {item.items?.length ? (
                <View style={styles.itemsSection}>
                  <Text style={styles.itemsTitle}>Items ({item.items.length})</Text>
                  {item.items.slice(0, 4).map((planItem: any, index: number) => (
                    <View key={planItem.productId || index} style={styles.itemRow}>
                      <Text style={styles.itemName}>{planItem.name || planItem.product?.name || 'Product'}</Text>
                      <Text style={styles.itemQty}>×{planItem.quantityPerDelivery}</Text>
                    </View>
                  ))}
                  {item.items.length > 4 ? <Text style={styles.moreItems}>+{item.items.length - 4} more</Text> : null}
                </View>
              ) : null}

              <View style={styles.statusRow}>
                <View style={[styles.statusPill, { backgroundColor: item.status === 'ACTIVE' ? '#D1FAE5' : '#FEF3C7' }]}>
                  <Text style={[styles.statusText, { color: item.status === 'ACTIVE' ? '#047857' : '#B45309' }]}>{item.status || 'ACTIVE'}</Text>
                </View>
                <View style={styles.fact}>
                  <ShieldCheck size={14} color="#64748B" />
                  <Text style={styles.factText}>{item.allowTrustedDrop ? 'Trusted drop' : 'Handover only'}</Text>
                </View>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  flex: { flex: 1 },
  header: { backgroundColor: '#0F766E', paddingHorizontal: 18, paddingBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: '#A7F3D0', fontSize: 9, fontWeight: '600', letterSpacing: 1 },
  title: { color: '#FFFFFF', fontSize: 24, fontWeight: '600', marginTop: 2 },
  list: { padding: 16, gap: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  muted: { color: '#64748B', fontSize: 13 },
  errorTitle: { color: '#0F172A', fontSize: 18, fontWeight: '600' },
  empty: { alignItems: 'center', padding: 40, gap: 8 },
  emptyTitle: { color: '#0F172A', fontSize: 16, fontWeight: '600' },
  emptyText: { color: '#64748B', fontSize: 13, textAlign: 'center' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#E2E8F0', gap: 12 },
  cardTop: { flexDirection: 'row', gap: 12 },
  image: { width: 64, height: 64, borderRadius: 16, backgroundColor: '#F0FDFA' },
  imageFallback: { width: 64, height: 64, borderRadius: 16, backgroundColor: '#F0FDFA', alignItems: 'center', justifyContent: 'center' },
  planName: { color: '#0F172A', fontSize: 18, fontWeight: '600' },
  planDesc: { color: '#64748B', fontSize: 12, marginTop: 4, lineHeight: 18 },
  priceRow: { flexDirection: 'row', gap: 16, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  priceBlock: { gap: 2 },
  priceLabel: { color: '#94A3B8', fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },
  price: { color: '#0F172A', fontSize: 18, fontWeight: '600' },
  mrp: { color: '#94A3B8', fontSize: 14, textDecorationLine: 'line-through' },
  factRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  factText: { color: '#475569', fontSize: 11 },
  itemsSection: { paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  itemsTitle: { color: '#0F172A', fontSize: 13, fontWeight: '600', marginBottom: 8 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  itemName: { color: '#475569', fontSize: 12 },
  itemQty: { color: '#0F172A', fontSize: 12, fontWeight: '600' },
  moreItems: { color: '#0F766E', fontSize: 11, fontWeight: '600', marginTop: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  statusPill: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 },
  statusText: { fontSize: 10, fontWeight: '600' },
});
