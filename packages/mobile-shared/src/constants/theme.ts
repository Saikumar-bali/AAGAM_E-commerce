export const COLORS = {
  primary: '#0F766E',
  primaryLight: '#CCFBF1',
  primaryDark: '#115E59',
  accent: '#14B8A6',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  text: '#0F172A',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  border: '#E2E8F0',
  error: '#DC2626',
  success: '#10B981',
  warning: '#F59E0B',
  white: '#FFFFFF',
  dark: '#0F172A',
  darkCard: '#101827',
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const BORDER_RADIUS = {
  sm: 10,
  md: 16,
  lg: 20,
  xl: 28,
  pill: 999,
};

export const SHADOWS = {
  card: {
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 15,
  },
  elevated: {
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.15,
    shadowRadius: 15,
  },
};

export const FONTS = {
  regular: { fontWeight: '400' as const },
  medium: { fontWeight: '600' as const },
  bold: { fontWeight: '800' as const },
  heavy: { fontWeight: '900' as const },
};
