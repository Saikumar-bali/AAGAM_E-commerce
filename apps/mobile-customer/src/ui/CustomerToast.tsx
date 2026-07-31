import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const variants = {
  success: { accent: '#15803D', surface: '#F0FDF4', title: '#14532D' },
  error: { accent: '#DC2626', surface: '#FEF2F2', title: '#7F1D1D' },
  info: { accent: '#0F766E', surface: '#F0FDFA', title: '#134E4A' },
  warning: { accent: '#D97706', surface: '#FFFBEB', title: '#78350F' },
} as const;

type Variant = keyof typeof variants;

type ToastCardProps = {
  type: Variant;
  text1?: string;
  text2?: string;
};

const ToastCard = ({ type, text1, text2 }: ToastCardProps) => {
  const palette = variants[type];
  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.card,
        { backgroundColor: palette.surface, borderLeftColor: palette.accent },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: palette.accent }]} />
      <View style={styles.copy}>
        <Text style={[styles.title, { color: palette.title }]}>{text1 || 'AAGAAM'}</Text>
        {text2 ? <Text style={styles.message}>{text2}</Text> : null}
      </View>
    </View>
  );
};

export const customerToastConfig = {
  success: ({ text1, text2 }: any) => <ToastCard type="success" text1={text1} text2={text2} />,
  error: ({ text1, text2 }: any) => <ToastCard type="error" text1={text1} text2={text2} />,
  info: ({ text1, text2 }: any) => <ToastCard type="info" text1={text1} text2={text2} />,
  warning: ({ text1, text2 }: any) => <ToastCard type="warning" text1={text1} text2={text2} />,
};

export const CustomerToast = () => {
  const insets = useSafeAreaInsets();
  return (
    <Toast
      config={customerToastConfig}
      position="top"
      topOffset={Math.max(insets.top, 12) + 8}
    />
  );
};

const styles = StyleSheet.create({
  card: {
    width: '92%',
    maxWidth: 520,
    minHeight: 66,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 18,
    borderLeftWidth: 5,
    paddingHorizontal: 16,
    paddingVertical: 13,
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 7,
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 5, marginRight: 11 },
  copy: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, lineHeight: 20, fontWeight: '900' },
  message: { marginTop: 3, color: '#334155', fontSize: 13, lineHeight: 18, fontWeight: '600' },
});
