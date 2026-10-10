import React from 'react';
import { ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { Box, CalendarDays, Contact, IndianRupee, PackageCheck, Route, Users } from 'lucide-react-native';
import { StoreHubSection, StoreHubTile } from '../../components/StoreHubKit';
import { GradientSurface } from '../../components/GradientSurface';
import { subscriptionOperationsService } from '../../api/subscriptionOperationsService';
import { palette, radius, spacing, typography } from '../../design/tokens';

/**
 * Subscriptions hub — its own store destination. Subscriber management,
 * published plans, the delivery-run console and the monthly milk grid all live
 * one tap from here.
 */
export function StoreSubscriptionsHubScreen() {
  const navigation = useNavigation<any>();

  const subscribersQuery = useQuery({
    queryKey: ['store-subscriptions-hub-subscribers'],
    queryFn: subscriptionOperationsService.getSubscriberSnapshot,
    refetchInterval: 30_000,
    retry: 1,
  });
  const plansQuery = useQuery({
    queryKey: ['store-subscriptions-hub-plans'],
    queryFn: subscriptionOperationsService.getPlans,
    retry: 1,
  });

  const subscribers = Array.isArray(subscribersQuery.data?.subscribers) ? subscribersQuery.data!.subscribers : [];
  const plans = Array.isArray(plansQuery.data) ? plansQuery.data : [];
  const activeCount = Number(subscribersQuery.data?.counts?.active ?? 0);
  const pausedCount = Number(subscribersQuery.data?.counts?.paused ?? 0);
  const totalCount = Number(subscribersQuery.data?.counts?.total ?? subscribers.length);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={palette.teal900} />
      <GradientSurface preset="emerald" style={styles.hero}>
        <View style={styles.glow} />
        <Text style={styles.eyebrow}>SUBSCRIPTION CONTROL</Text>
        <Text style={styles.title}>Subscriptions</Text>
        <Text style={styles.subtitle}>Plans, subscribers and every milk run in one place.</Text>

        <View style={styles.metrics}>
          <HubMetric label="Active" value={String(activeCount)} />
          <View style={styles.metricDivider} />
          <HubMetric label="Subscribers" value={String(totalCount)} />
          <View style={styles.metricDivider} />
          <HubMetric label="Paused" value={String(pausedCount)} />
        </View>
      </GradientSurface>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <StoreHubSection title="Subscriptions">
          <StoreHubTile
            icon={<Users size={20} />}
            title="Subscribers"
            subtitle="Active, paused and cancelled subscriptions"
            badge={activeCount}
            tone="primary"
            testID="store_subscriptions_subscribers"
            onPress={() => navigation.navigate('StoreSubscribers')}
          />
          <StoreHubTile
            icon={<Box size={20} />}
            title="Plans"
            subtitle="Published milk plans and pricing"
            badge={plans.length}
            testID="store_subscriptions_plans"
            onPress={() => navigation.navigate('StoreSubscriptionPlans')}
          />
          <StoreHubTile
            icon={<Contact size={20} />}
            title="Offline customers"
            subtitle="Manage and delete manually added customers"
            last
            testID="store_subscriptions_offline_customers"
            onPress={() => navigation.navigate('StoreOfflineCustomers')}
          />
        </StoreHubSection>

        <StoreHubSection title="Operations">
          <StoreHubTile
            icon={<Route size={20} />}
            title="Delivery runs"
            subtitle="Pack, dispatch and settle today's runs"
            testID="store_subscriptions_runs"
            onPress={() => navigation.navigate('StoreSubscriptionOperations')}
          />
          <StoreHubTile
            icon={<CalendarDays size={20} />}
            title="Milk grid"
            subtitle="Month view of every subscriber delivery"
            testID="store_subscriptions_milk_grid"
            onPress={() => navigation.navigate('StoreMilkGrid')}
          />
          <StoreHubTile
            icon={<PackageCheck size={20} />}
            title="Delivery operations"
            subtitle="Returns, stock inspection and COD settlement"
            last
            testID="store_subscriptions_delivery_ops"
            onPress={() => navigation.navigate('StoreReturnsCod')}
          />
        </StoreHubSection>

        <View style={styles.footnote}>
          <IndianRupee size={14} color={palette.slate400} />
          <Text style={styles.footnoteText}>
            Cash due is collected by riders on delivery and settled in Delivery operations.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function HubMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.slate050 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: 120 },
  hero: {
    paddingHorizontal: spacing.xl,
    paddingTop: 56,
    paddingBottom: spacing.xl,
  },
  glow: {
    position: 'absolute',
    top: -80,
    right: -50,
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  eyebrow: { color: '#A7F3D0', ...typography.eyebrow },
  title: { color: palette.white, fontSize: 26, fontWeight: '700', marginTop: 4, letterSpacing: -0.3 },
  subtitle: { color: '#D1FAE5', fontSize: 12, lineHeight: 17, marginTop: 6, maxWidth: 300 },
  metrics: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  metric: { flex: 1, alignItems: 'center' },
  metricValue: { color: palette.white, fontSize: 20, fontWeight: '700', letterSpacing: -0.4 },
  metricLabel: { color: '#D1FAE5', fontSize: 10, fontWeight: '600', marginTop: 2, letterSpacing: 0.5 },
  metricDivider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.22)' },
  footnote: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg, paddingHorizontal: spacing.xs },
  footnoteText: { flex: 1, color: palette.slate400, fontSize: 11, lineHeight: 16 },
});
