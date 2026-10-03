/**
 * Aagaam Partner design tokens.
 *
 * The rider and store workspaces share one visual language: a deep operational
 * teal for chrome and trust surfaces, warm amber for "needs attention", and a
 * calm slate neutral scale for everything else. Screens read these tokens
 * instead of hardcoding hex values so the two workspaces never drift apart.
 */

export const palette = {
  teal900: '#0B3B36',
  teal800: '#0F5148',
  teal700: '#0F766E',
  teal600: '#12897F',
  teal100: '#CCFBF1',
  teal050: '#F0FDFA',

  amber700: '#B45309',
  amber500: '#F59E0B',
  amber100: '#FEF3C7',
  amber050: '#FFFBEB',

  rose700: '#B91C1C',
  rose500: '#EF4444',
  rose100: '#FEE2E2',
  rose050: '#FEF2F2',

  green700: '#15803D',
  green500: '#22C55E',
  green100: '#DCFCE7',
  green050: '#F0FDF4',

  blue700: '#1D4ED8',
  blue500: '#3B82F6',
  blue100: '#DBEAFE',
  blue050: '#EFF6FF',

  slate900: '#0F172A',
  slate800: '#1E293B',
  slate700: '#334155',
  slate600: '#475569',
  slate500: '#64748B',
  slate400: '#94A3B8',
  slate300: '#CBD5E1',
  slate200: '#E2E8F0',
  slate100: '#F1F5F9',
  slate050: '#F8FAFC',
  white: '#FFFFFF',
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 40,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 27, fontWeight: '700' as const, letterSpacing: -0.4 },
  title: { fontSize: 21, fontWeight: '700' as const, letterSpacing: -0.2 },
  heading: { fontSize: 17, fontWeight: '600' as const },
  body: { fontSize: 13, fontWeight: '500' as const, lineHeight: 19 },
  label: { fontSize: 11, fontWeight: '600' as const },
  eyebrow: { fontSize: 10, fontWeight: '700' as const, letterSpacing: 1.4 },
  caption: { fontSize: 10, fontWeight: '500' as const },
  metric: { fontSize: 26, fontWeight: '700' as const, letterSpacing: -0.6 },
} as const;

export const elevation = {
  card: {
    shadowColor: '#0B3B36',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
  raised: {
    shadowColor: '#0B3B36',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 8,
  },
} as const;

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export const toneTokens: Record<StatusTone, { fg: string; bg: string; border: string }> = {
  neutral: { fg: palette.slate700, bg: palette.slate100, border: palette.slate200 },
  info: { fg: palette.blue700, bg: palette.blue050, border: palette.blue100 },
  success: { fg: palette.green700, bg: palette.green050, border: palette.green100 },
  warning: { fg: palette.amber700, bg: palette.amber050, border: palette.amber100 },
  danger: { fg: palette.rose700, bg: palette.rose050, border: palette.rose100 },
};

export function deliveryStatusTone(status?: string | null): StatusTone {
  const value = String(status || '').toUpperCase();
  if (['DELIVERED', 'RETURNED_TO_STORE', 'COMPLETED'].includes(value)) return 'success';
  if (['DELIVERY_FAILED', 'CANCELLED', 'FAILED'].includes(value)) return 'danger';
  if (['RETURNING_TO_STORE', 'RIDER_AT_STORE', 'PICKUP_VERIFIED'].includes(value)) return 'warning';
  if (['OUT_FOR_DELIVERY', 'RIDER_AT_CUSTOMER', 'RIDER_EN_ROUTE_TO_STORE', 'RIDER_ASSIGNED'].includes(value)) return 'info';
  return 'neutral';
}
