import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { palette, radius, spacing, typography } from '../design/tokens';

/**
 * Shared chrome for the store hub screens (Operations, More). Keeps the two
 * drill-down hubs visually identical to the rest of the partner workspace.
 */
export function StoreHubHeader({
  eyebrow,
  title,
  subtitle,
  accessory,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  accessory?: React.ReactNode;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerGlow} />
      <View style={styles.headerRow}>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        {accessory}
      </View>
    </View>
  );
}

export function StoreHubSection({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      <View style={styles.card}>{children}</View>
    </View>
  );
}

export function StoreHubTile({
  icon,
  title,
  subtitle,
  badge,
  tone = 'default',
  testID,
  onPress,
  last = false,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  badge?: number | string;
  tone?: 'default' | 'primary' | 'danger';
  testID?: string;
  onPress: () => void;
  last?: boolean;
}) {
  const iconBg = tone === 'primary' ? palette.teal700 : tone === 'danger' ? palette.rose050 : palette.teal050;
  const iconColor = tone === 'danger' ? palette.rose700 : palette.teal700;
  const showBadge = badge !== undefined && badge !== null && Number(badge) > 0;
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={title}
      testID={testID}
      onPress={onPress}
      style={[styles.tile, !last && styles.tileDivider]}
      activeOpacity={0.7}
    >
      <View style={[styles.tileIcon, { backgroundColor: iconBg }]}>
        {React.isValidElement(icon)
          ? React.cloneElement(icon as React.ReactElement<any>, { color: iconColor })
          : icon}
      </View>
      <View style={styles.flex}>
        <Text style={styles.tileTitle}>{title}</Text>
        {subtitle ? <Text style={styles.tileSubtitle}>{subtitle}</Text> : null}
      </View>
      {showBadge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
      <ChevronRight size={20} color={palette.slate400} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  header: {
    backgroundColor: palette.teal700,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    overflow: 'hidden',
    position: 'relative',
  },
  headerGlow: {
    position: 'absolute',
    top: -70,
    right: -60,
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', paddingTop: 56 },
  eyebrow: { color: '#A7F3D0', ...typography.eyebrow },
  title: { color: palette.white, fontSize: 24, fontWeight: '600', marginTop: 2 },
  subtitle: { color: '#D1FAE5', fontSize: 11, lineHeight: 16, marginTop: 4, maxWidth: 280 },

  section: { marginTop: spacing.lg },
  sectionTitle: {
    ...typography.eyebrow,
    color: palette.slate500,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  card: {
    backgroundColor: palette.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.slate200,
    overflow: 'hidden',
  },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 64,
  },
  tileDivider: { borderBottomWidth: 1, borderBottomColor: palette.slate100 },
  tileIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  tileTitle: { color: palette.slate900, fontSize: 15, fontWeight: '600' },
  tileSubtitle: { color: palette.slate500, fontSize: 11.5, marginTop: 2, lineHeight: 15 },
  badge: {
    minWidth: 24,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 7,
    backgroundColor: '#E1262F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: palette.white, fontSize: 11, fontWeight: '700' },
});
