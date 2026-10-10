/**
 * Store UI primitives.
 *
 * NOTE: this component set is required by `StoreDeliveriesScreen` and
 * `ManageSubscriberSheet`, but no `components/StoreKit` exists anywhere on this
 * branch or on `main`/`bugs` (verified with `git ls-tree` across refs). It was
 * added here as a harness-side compatibility shim so the store workspace builds
 * and can be previewed; the native app on this branch would not compile without
 * it. Replace with the real implementation once it lands upstream.
 */
import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { X } from 'lucide-react-native';
import { palette, radius, spacing, elevation, typography } from '../design/tokens';

export function money(paise?: number | null) {
  const value = Number(paise || 0) / 100;
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: value % 1 === 0 ? 0 : 2 })}`;
}

export function Button({
  label,
  onPress,
  tone = 'neutral',
  icon: Icon,
  loading,
  disabled,
}: {
  label: string;
  onPress?: () => void;
  tone?: 'primary' | 'success' | 'danger' | 'neutral';
  icon?: React.ComponentType<{ size?: number; color?: string }>;
  loading?: boolean;
  disabled?: boolean;
}) {
  const tones = {
    primary: { bg: palette.teal700, fg: palette.white },
    success: { bg: palette.green700, fg: palette.white },
    danger: { bg: palette.rose700, fg: palette.white },
    neutral: { bg: palette.slate100, fg: palette.slate700 },
  } as const;
  const t = tones[tone];
  return (
    <Pressable
      style={[styles.button, { backgroundColor: t.bg }, (disabled || loading) && styles.buttonDisabled]}
      disabled={disabled || loading}
      onPress={onPress}
    >
      {loading ? (
        <ActivityIndicator color={t.fg} />
      ) : (
        <>
          {Icon ? <Icon size={16} color={t.fg} /> : null}
          <Text style={[styles.buttonText, { color: t.fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

export function TextField(props: React.ComponentProps<typeof TextInput>) {
  const { style, ...rest } = props;
  return (
    <TextInput
      placeholderTextColor={palette.slate400}
      style={[styles.textField, rest.multiline && styles.textFieldMultiline, style]}
      {...rest}
    />
  );
}

export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  insetBottom,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  insetBottom?: number;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <View style={[styles.sheetCard, { paddingBottom: (insetBottom || 0) + spacing.lg }]}>
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1 }}>
              {title ? <Text style={styles.sheetTitle}>{title}</Text> : null}
              {subtitle ? <Text style={styles.sheetSubtitle}>{subtitle}</Text> : null}
            </View>
            <Pressable onPress={onClose} style={styles.sheetClose}>
              <X size={20} color={palette.slate600} />
            </Pressable>
          </View>
          <ScrollView style={styles.sheetBody} contentContainerStyle={{ paddingBottom: spacing.xxl }}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function StatTile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, tone ? { color: tone } : null]}>{value}</Text>
    </View>
  );
}

export function InfoRow({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, danger && { color: palette.rose700 }]}>{value}</Text>
    </View>
  );
}

export function OptionCard({
  title,
  subtitle,
  selected,
  onPress,
  icon: Icon,
}: {
  title: string;
  subtitle?: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: React.ComponentType<{ size?: number; color?: string }>;
}) {
  return (
    <Pressable style={[styles.optionCard, selected && styles.optionCardSelected]} onPress={onPress}>
      {Icon ? <Icon size={20} color={selected ? palette.teal700 : palette.slate500} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={styles.optionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.optionSubtitle}>{subtitle}</Text> : null}
      </View>
    </Pressable>
  );
}

export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => (
        <Pressable
          key={option}
          style={[styles.segment, value === option && styles.segmentActive]}
          onPress={() => onChange(option)}
        >
          <Text style={[styles.segmentText, value === option && styles.segmentTextActive]}>{option}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 44,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { ...typography.heading },
  field: { marginBottom: spacing.md, gap: spacing.xs },
  fieldLabel: { ...typography.label, color: palette.slate600 },
  fieldHint: { ...typography.caption, color: palette.slate500 },
  textField: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: palette.slate300,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: palette.slate900,
    backgroundColor: palette.white,
    ...typography.body,
  },
  textFieldMultiline: { minHeight: 84, textAlignVertical: 'top' },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  sheetCard: {
    backgroundColor: palette.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '88%',
    paddingTop: spacing.lg,
    ...elevation.raised,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  sheetTitle: { ...typography.title, color: palette.slate900 },
  sheetSubtitle: { ...typography.body, color: palette.slate500, marginTop: 2 },
  sheetClose: { padding: spacing.xs },
  sheetBody: { paddingHorizontal: spacing.lg },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: palette.slate100,
    borderWidth: 1,
    borderColor: palette.slate200,
  },
  chipActive: { backgroundColor: palette.teal100, borderColor: palette.teal700 },
  chipText: { ...typography.label, color: palette.slate600 },
  chipTextActive: { color: palette.teal800 },
  sectionTitle: { ...typography.heading, color: palette.slate900, marginTop: spacing.md, marginBottom: spacing.sm },
  statTile: {
    flex: 1,
    backgroundColor: palette.slate050,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  statLabel: { ...typography.caption, color: palette.slate500 },
  statValue: { ...typography.heading, color: palette.slate900 },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  infoLabel: { ...typography.body, color: palette.slate500 },
  infoValue: { ...typography.body, color: palette.slate900, fontWeight: '700' },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.slate200,
    backgroundColor: palette.white,
    marginBottom: spacing.sm,
  },
  optionCardSelected: { borderColor: palette.teal700, backgroundColor: palette.teal050 },
  optionTitle: { ...typography.heading, color: palette.slate900 },
  optionSubtitle: { ...typography.caption, color: palette.slate500 },
  segmented: {
    flexDirection: 'row',
    backgroundColor: palette.slate100,
    borderRadius: radius.pill,
    padding: 3,
    gap: 3,
  },
  segment: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.pill, alignItems: 'center' },
  segmentActive: { backgroundColor: palette.white, ...elevation.card },
  segmentText: { ...typography.label, color: palette.slate500 },
  segmentTextActive: { color: palette.teal800 },
});
