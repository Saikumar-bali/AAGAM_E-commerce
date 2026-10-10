import React, { useMemo } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StatusBar, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { ArrowLeft, BellRing, RefreshCw } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { GradientSurface } from '../../components/GradientSurface';
import { palette, radius, spacing } from '../../design/tokens';
import { NotificationPreference, notificationService } from '../../api/notificationService';

const PREFERENCES_KEY = ['store-notification-preferences'] as const;

const STORE_EVENTS: Array<{ eventType: string; label: string; critical?: boolean }> = [
  { eventType: 'ORDER_PLACED', label: 'New order placed', critical: true },
  { eventType: 'ASSIGNMENT_OFFERED', label: 'Rider assignment offered', critical: true },
  { eventType: 'ASSIGNMENT_ACCEPTED', label: 'Rider accepted' },
  { eventType: 'ASSIGNMENT_REJECTED', label: 'Rider rejected' },
  { eventType: 'ASSIGNMENT_EXPIRED', label: 'Assignment expired' },
  { eventType: 'RIDER_EN_ROUTE_TO_STORE', label: 'Rider en route to store' },
  { eventType: 'RIDER_AT_STORE', label: 'Rider at store', critical: true },
  { eventType: 'PICKUP_VERIFIED', label: 'Pickup verified', critical: true },
  { eventType: 'OUT_FOR_DELIVERY', label: 'Out for delivery', critical: true },
  { eventType: 'RIDER_AT_CUSTOMER', label: 'Rider at customer', critical: true },
  { eventType: 'DELIVERY_COMPLETED', label: 'Delivery completed' },
  { eventType: 'DELIVERY_FAILED', label: 'Delivery failed', critical: true },
  { eventType: 'DELIVERY_CANCELLED', label: 'Delivery cancelled', critical: true },
  { eventType: 'ADMIN_BROADCAST', label: 'Admin broadcasts' },
];

export const StoreNotificationSettingsScreen = ({ navigation }: { navigation: any }) => {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: PREFERENCES_KEY,
    queryFn: notificationService.getPreferences,
    retry: 1,
  });

  const server = useMemo(() => {
    const map = new Map<string, NotificationPreference>();
    for (const p of query.data || []) map.set(p.eventType, p);
    return map;
  }, [query.data]);

  const globalPush = server.get('*')?.pushEnabled ?? true;
  const globalInApp = server.get('*')?.inAppEnabled ?? true;

  const update = useMutation({
    mutationFn: (input: { eventType: string; pushEnabled?: boolean; inAppEnabled?: boolean }) =>
      notificationService.updatePreference(input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: PREFERENCES_KEY }),
    onError: () => Toast.show({ type: 'error', text1: 'Could not save preference', text2: 'Please retry.' }),
  });

  const prefFor = (eventType: string) => {
    const p = server.get(eventType);
    return { push: p?.pushEnabled ?? globalPush, inApp: p?.inAppEnabled ?? globalInApp };
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={palette.teal700} />
      <GradientSurface preset="teal" style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()} accessibilityLabel="Go back">
          <ArrowLeft size={21} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>NOTIFICATIONS</Text>
          <Text style={styles.title}>Preferences</Text>
        </View>
        <TouchableOpacity style={styles.back} onPress={() => void query.refetch()} accessibilityLabel="Refresh">
          <RefreshCw size={19} color="#FFFFFF" />
        </TouchableOpacity>
      </GradientSurface>

      {query.isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={palette.teal700} /><Text style={styles.muted}>Loading preferences…</Text></View>
      ) : query.isError ? (
        <View style={styles.center}><Text style={styles.errorTitle}>Couldn't load preferences</Text><TouchableOpacity onPress={() => void query.refetch()}><Text style={styles.muted}>Tap to retry.</Text></TouchableOpacity></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
        >
          <View style={styles.card}>
            <View style={styles.globalRow}>
              <BellRing size={18} color={palette.teal700} />
              <View style={styles.flex}>
                <Text style={styles.globalTitle}>Device push</Text>
                <Text style={styles.globalHint}>Alerts on this phone</Text>
              </View>
              <Switch
                value={globalPush}
                onValueChange={(v) => update.mutate({ eventType: '*', pushEnabled: v, inAppEnabled: globalInApp })}
                trackColor={{ true: palette.teal700, false: palette.slate300 }}
                thumbColor={palette.white}
              />
            </View>
            <View style={[styles.globalRow, styles.divider]}>
              <BellRing size={18} color={palette.slate500} />
              <View style={styles.flex}>
                <Text style={styles.globalTitle}>In-app inbox</Text>
                <Text style={styles.globalHint}>Keep notifications in the app</Text>
              </View>
              <Switch
                value={globalInApp}
                onValueChange={(v) => update.mutate({ eventType: '*', inAppEnabled: v, pushEnabled: globalPush })}
                trackColor={{ true: palette.teal700, false: palette.slate300 }}
                thumbColor={palette.white}
              />
            </View>
          </View>

          <Text style={styles.sectionLabel}>By event</Text>
          <View style={styles.card}>
            {STORE_EVENTS.map((e, i) => {
              const p = prefFor(e.eventType);
              return (
                <View key={e.eventType} style={[styles.eventRow, i < STORE_EVENTS.length - 1 && styles.divider]}>
                  <View style={styles.flex}>
                    <View style={styles.eventTitleRow}>
                      <Text style={styles.eventTitle}>{e.label}</Text>
                      {e.critical ? <View style={styles.criticalBadge}><Text style={styles.criticalText}>CRITICAL</Text></View> : null}
                    </View>
                  </View>
                  <View style={styles.switchCol}>
                    <Text style={styles.switchName}>Push</Text>
                    <Switch
                      value={p.push}
                      onValueChange={(v) => update.mutate({ eventType: e.eventType, pushEnabled: v })}
                      trackColor={{ true: palette.teal700, false: palette.slate300 }}
                      thumbColor={palette.white}
                    />
                  </View>
                  <View style={styles.switchCol}>
                    <Text style={styles.switchName}>In-app</Text>
                    <Switch
                      value={p.inApp}
                      onValueChange={(v) => update.mutate({ eventType: e.eventType, inAppEnabled: v })}
                      trackColor={{ true: palette.teal700, false: palette.slate300 }}
                      thumbColor={palette.white}
                    />
                  </View>
                </View>
              );
            })}
          </View>
          <Text style={styles.footNote}>In-app and device preferences are stored separately for your account.</Text>
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.slate050 },
  flex: { flex: 1, minWidth: 0 },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  back: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: '#A7F3D0', fontSize: 9, fontWeight: '700', letterSpacing: 1.2 },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '600', marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxxl, gap: spacing.sm },
  muted: { color: palette.slate500, fontSize: 13 },
  errorTitle: { color: palette.slate900, fontSize: 18, fontWeight: '600' },
  list: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 60 },
  card: { backgroundColor: palette.white, borderRadius: radius.md, borderWidth: 1, borderColor: palette.slate200, overflow: 'hidden' },
  globalRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  divider: { borderTopWidth: 1, borderTopColor: palette.slate100 },
  globalTitle: { color: palette.slate900, fontSize: 14, fontWeight: '600' },
  globalHint: { color: palette.slate500, fontSize: 11, marginTop: 1 },
  sectionLabel: { ...({ fontSize: 11, fontWeight: '700', letterSpacing: 0.6 } as any), color: palette.slate500, textTransform: 'uppercase', marginLeft: spacing.xs, marginBottom: -spacing.sm },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  eventTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  eventTitle: { color: palette.slate800, fontSize: 12.5, fontWeight: '600', flexShrink: 1 },
  criticalBadge: { backgroundColor: palette.amber100, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  criticalText: { color: palette.amber700, fontSize: 8, fontWeight: '800', letterSpacing: 0.4 },
  switchCol: { alignItems: 'center', gap: 2 },
  switchName: { fontSize: 8.5, color: palette.slate400, fontWeight: '600' },
  footNote: { color: palette.slate400, fontSize: 11, textAlign: 'center' },
});
