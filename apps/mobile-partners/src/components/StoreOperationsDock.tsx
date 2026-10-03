import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarClock, CheckCircle2, Truck } from 'lucide-react-native';
import { palette, radius, spacing } from '../design/tokens';
import { partnerNavigationRef } from '../navigation/partnerNavigationRef';
import { StoreSubscriptionPreparationModal, usePreparationSummary } from '../screens/store/StoreSubscriptionPreparationFab';

/**
 * Store operations dock.
 *
 * Replaces the old floating "Tomorrow" button. Rider assignment is the primary
 * daily action, so it leads the dock; the D-1 stock-readiness preparation is
 * the secondary action. Both live on one steady surface instead of a lone FAB.
 */
export function StoreOperationsDock() {
  const insets = useSafeAreaInsets();
  const [prepOpen, setPrepOpen] = useState(false);
  const { pending, shortages } = usePreparationSummary();
  const prepBadge = shortages || pending;

  return (
    <>
      <View style={[styles.dock, { bottom: 58 + insets.bottom + spacing.md }]}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Open rider assignments"
          testID="store_dock_rider_assignments"
          style={[styles.item, styles.itemPrimary]}
          onPress={() => {
            if (partnerNavigationRef.isReady()) partnerNavigationRef.navigate('StoreRiderAssignments');
          }}
        >
          <View style={styles.iconWrap}><Truck size={19} color={palette.white} /></View>
          <View style={styles.copy}>
            <Text style={styles.labelPrimary}>Rider assignments</Text>
            <Text style={styles.subPrimary}>Dispatch & audit today's routes</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Open subscription preparation"
          testID="store_dock_preparation"
          style={[styles.item, styles.itemSecondary]}
          onPress={() => setPrepOpen(true)}
        >
          <View style={[styles.iconWrap, styles.iconWrapSecondary]}><CalendarClock size={19} color={palette.teal700} /></View>
          <View style={styles.copy}>
            <Text style={styles.labelSecondary}>Preparation</Text>
            <Text style={styles.subSecondary}>D-1 stock readiness</Text>
          </View>
          {prepBadge > 0 ? (
            <View style={[styles.badge, shortages > 0 && styles.badgeDanger]}>
              <Text style={styles.badgeText}>{prepBadge}</Text>
            </View>
          ) : (
            <CheckCircle2 size={16} color={palette.green500} />
          )}
        </TouchableOpacity>
      </View>

      <StoreSubscriptionPreparationModal visible={prepOpen} onClose={() => setPrepOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.xl,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.slate200,
    shadowColor: '#0B3B36',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 10,
  },
  item: { flex: 1, minHeight: 54, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md },
  itemPrimary: { backgroundColor: palette.teal700 },
  itemSecondary: { backgroundColor: palette.teal050, borderWidth: 1, borderColor: palette.teal100 },
  iconWrap: { width: 34, height: 34, borderRadius: radius.sm, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  iconWrapSecondary: { backgroundColor: palette.white },
  copy: { flex: 1 },
  labelPrimary: { color: palette.white, fontSize: 13, fontWeight: '700' },
  subPrimary: { color: '#D1FAE5', fontSize: 9, fontWeight: '600', marginTop: 1 },
  labelSecondary: { color: palette.teal800, fontSize: 13, fontWeight: '700' },
  subSecondary: { color: palette.slate500, fontSize: 9, fontWeight: '600', marginTop: 1 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.amber500 },
  badgeDanger: { backgroundColor: palette.rose500 },
  badgeText: { color: palette.white, fontSize: 10, fontWeight: '700' },
});
