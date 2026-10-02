import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { palette, radius, spacing, toneTokens, type StatusTone } from '../../design/tokens';

export function StatusPill({
  label,
  tone = 'neutral',
  style,
}: {
  label: string;
  tone?: StatusTone;
  style?: StyleProp<ViewStyle>;
}) {
  const tokens = toneTokens[tone];
  return (
    <View style={[styles.pill, { backgroundColor: tokens.bg, borderColor: tokens.border }, style]}>
      <Text style={[styles.pillText, { color: tokens.fg }]}>{label}</Text>
    </View>
  );
}

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionHeading({
  title,
  subtitle,
  accessory,
}: {
  title: string;
  subtitle?: string;
  accessory?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionHeading}>
      <View style={styles.flex}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {accessory}
    </View>
  );
}

export function KeyValueRow({
  label,
  value,
  tone,
  last = false,
}: {
  label: string;
  value: string;
  tone?: StatusTone;
  last?: boolean;
}) {
  return (
    <View style={[styles.kvRow, last && styles.kvRowLast]}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={[styles.kvValue, tone ? { color: toneTokens[tone].fg } : null]}>{value}</Text>
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pill: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  pillText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  card: {
    backgroundColor: palette.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.slate200,
    padding: spacing.lg,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  sectionTitle: { color: palette.slate900, fontSize: 17, fontWeight: '700' },
  sectionSubtitle: { color: palette.slate500, fontSize: 11, marginTop: 2, fontWeight: '500' },
  kvRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.slate200,
  },
  kvRowLast: { borderBottomWidth: 0 },
  kvLabel: { color: palette.slate500, fontSize: 11, fontWeight: '600' },
  kvValue: { color: palette.slate900, fontSize: 12, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: palette.slate200, marginVertical: spacing.md },
});
