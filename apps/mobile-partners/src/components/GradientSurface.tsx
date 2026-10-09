import React, { ReactNode } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

export type GradientPreset = 'hero' | 'emerald' | 'azure' | 'violet' | 'amber' | 'rose';

/**
 * One place for every gradient in the partner workspace. Each preset is a
 * diagonal sweep with a matched light-mode companion, so chrome, cards and
 * accents always feel like one palette instead of a pile of one-off hex values.
 */
export const gradients: Record<GradientPreset, { id: string; stops: [string, string, string] }> = {
  hero: { id: 'aagamHero', stops: ['#0B3B36', '#0F766E', '#10A86E'] },
  emerald: { id: 'aagamEmerald', stops: ['#0F766E', '#0FA37F', '#34D399'] },
  azure: { id: 'aagamAzure', stops: ['#0C4A6E', '#0E7490', '#22D3EE'] },
  violet: { id: 'aagamViolet', stops: ['#3B1D8F', '#6D28D9', '#A78BFA'] },
  amber: { id: 'aagamAmber', stops: ['#92400E', '#D97706', '#FBBF24'] },
  rose: { id: 'aagamRose', stops: ['#7F1D1D', '#DC2626', '#FB7185'] },
};

/**
 * Absolute-fill SVG gradient backdrop. Drop it behind any View as the first
 * child; content renders on top because the SVG is not interactive.
 */
export function GradientSurface({
  preset = 'hero',
  style,
  radius,
  children,
}: {
  preset?: GradientPreset;
  style?: ViewStyle;
  radius?: number;
  children?: ReactNode;
}) {
  const { id, stops } = gradients[preset];
  return (
    <View style={[styles.wrap, radius !== undefined && { borderRadius: radius }, style]}>
      <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={stops[0]} />
            <Stop offset="0.55" stopColor={stops[1]} />
            <Stop offset="1" stopColor={stops[2]} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
});
