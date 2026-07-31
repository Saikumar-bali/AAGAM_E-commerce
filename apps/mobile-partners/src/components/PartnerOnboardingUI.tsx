import React, { ReactElement, ReactNode } from 'react';
import { ActivityIndicator, RefreshControlProps, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TextInputProps, TouchableOpacity, View } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { AagamBrand } from './AagamBrand';

export const palette = {
  ink: '#111827',
  muted: '#64748B',
  line: '#E2E8F0',
  surface: '#FFFFFF',
  canvas: '#F4F7FB',
  teal: '#0F766E',
  tealSoft: '#CCFBF1',
  indigo: '#4338CA',
  indigoSoft: '#E0E7FF',
  amber: '#D97706',
  red: '#B91C1C',
  green: '#047857',
};

export function OnboardingShell({ title, subtitle, children, onBack, right, refreshControl }: { title: string; subtitle?: string; children: ReactNode; onBack?: () => void; right?: ReactNode; refreshControl?: ReactElement<RefreshControlProps> }) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.glowTeal} />
      <View style={styles.glowIndigo} />
      <ScrollView style={styles.safe} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} refreshControl={refreshControl}>
        <View style={styles.topRow}>{onBack ? <TouchableOpacity onPress={onBack} style={styles.backButton}><ChevronLeft size={20} color={palette.ink} /></TouchableOpacity> : <View style={styles.backPlaceholder} />}{right || <View />}</View>
        <View style={styles.hero}>
          <View style={styles.brandRow}><AagamBrand compact /></View>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        <View style={styles.body}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function FormField({ label, hint, multiline, ...props }: TextInputProps & { label: string; hint?: string }) {
  return <View style={styles.fieldWrap}><Text style={styles.label}>{label}</Text><TextInput {...props} multiline={multiline} placeholderTextColor="#94A3B8" style={[styles.input, multiline && styles.multiline, props.style]} />{hint ? <Text style={styles.hint}>{hint}</Text> : null}</View>;
}

export function PrimaryButton({ label, onPress, loading, disabled, secondary, danger, testID }: { label: string; onPress: () => void; loading?: boolean; disabled?: boolean; secondary?: boolean; danger?: boolean; testID?: string }) {
  return <TouchableOpacity testID={testID} onPress={onPress} disabled={disabled || loading} activeOpacity={0.82} style={[styles.primary, secondary && styles.secondary, danger && styles.danger, (disabled || loading) && styles.disabled]}>{loading ? <ActivityIndicator color={secondary ? palette.ink : '#FFFFFF'} /> : <Text style={[styles.primaryText, secondary && styles.secondaryText]}>{label}</Text>}</TouchableOpacity>;
}

export function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}<View style={styles.sectionBody}>{children}</View></View>;
}

export function ProgressBar({ value }: { value: number }) {
  const safe = Math.max(0, Math.min(100, value));
  return <View><View style={styles.progressTrack}><View style={[styles.progressValue, { width: `${safe}%` }]} /></View><Text style={styles.progressText}>{safe}% complete</Text></View>;
}

export function StatusPill({ status }: { status: string }) {
  const normalized = status.toUpperCase();
  const background = normalized === 'APPROVED' ? '#D1FAE5' : normalized === 'REJECTED' ? '#FEE2E2' : normalized === 'ACTION_REQUIRED' ? '#FEF3C7' : '#E0E7FF';
  const color = normalized === 'APPROVED' ? palette.green : normalized === 'REJECTED' ? palette.red : normalized === 'ACTION_REQUIRED' ? palette.amber : palette.indigo;
  return <View style={[styles.pill, { backgroundColor: background }]}><Text style={[styles.pillText, { color }]}>{normalized.replaceAll('_', ' ')}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.canvas },
  glowTeal: { position: 'absolute', width: 290, height: 290, borderRadius: 999, backgroundColor: '#CCFBF1', top: -145, right: -120, opacity: 0.82 },
  glowIndigo: { position: 'absolute', width: 260, height: 260, borderRadius: 999, backgroundColor: '#E0E7FF', bottom: -145, left: -120, opacity: 0.7 },
  content: { padding: 20, paddingBottom: 56 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 },
  backButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: palette.line, alignItems: 'center', justifyContent: 'center', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 2 },
  backPlaceholder: { width: 42, height: 42 },
  hero: { marginTop: 10, borderRadius: 30, padding: 22, backgroundColor: 'rgba(255,255,255,0.88)', borderWidth: 1, borderColor: '#FFFFFF', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.09, shadowRadius: 25, elevation: 5 },
  brandRow: { marginBottom: 22 },
  title: { color: palette.ink, fontSize: 31, lineHeight: 37, fontWeight: '900', letterSpacing: -1.1 },
  subtitle: { color: palette.muted, fontSize: 14, lineHeight: 22, marginTop: 9, fontWeight: '600' },
  body: { marginTop: 20, gap: 15 },
  fieldWrap: { gap: 7 },
  label: { color: '#334155', fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6 },
  input: { minHeight: 55, borderRadius: 17, borderWidth: 1.5, borderColor: palette.line, backgroundColor: '#FFFFFF', paddingHorizontal: 16, color: palette.ink, fontSize: 15, fontWeight: '700' },
  multiline: { minHeight: 100, paddingTop: 15, textAlignVertical: 'top' },
  hint: { color: '#94A3B8', fontSize: 11, lineHeight: 16 },
  primary: { minHeight: 57, borderRadius: 18, backgroundColor: palette.teal, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, shadowColor: palette.teal, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 15, elevation: 4 },
  secondary: { backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: palette.line, shadowOpacity: 0 },
  danger: { backgroundColor: palette.red },
  disabled: { opacity: 0.55 },
  primaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  secondaryText: { color: palette.ink },
  section: { borderRadius: 25, backgroundColor: '#FFFFFF', padding: 18, borderWidth: 1, borderColor: '#E8EEF4', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.06, shadowRadius: 18, elevation: 2 },
  sectionTitle: { color: palette.ink, fontSize: 18, fontWeight: '900' },
  sectionSubtitle: { color: palette.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  sectionBody: { gap: 15, marginTop: 18 },
  progressTrack: { height: 9, borderRadius: 9, backgroundColor: '#E2E8F0', overflow: 'hidden' },
  progressValue: { height: '100%', borderRadius: 9, backgroundColor: palette.teal },
  progressText: { color: palette.muted, fontSize: 11, fontWeight: '700', marginTop: 7 },
  pill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 },
  pillText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
});
