import React, { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

export const RiderDashboardHero = ({ children }: { children: ReactNode }) => (
  <View style={styles.hero}>
    <Svg
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      width="100%"
      height="100%"
      viewBox="0 0 390 190"
      preserveAspectRatio="none"
    >
      <Defs>
        <LinearGradient id="riderHeroGradient" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#10A86E" />
          <Stop offset="0.56" stopColor="#008C62" />
          <Stop offset="1" stopColor="#006C52" />
        </LinearGradient>
      </Defs>
      <Path
        d="M0 0H390V126C294 164 98 164 0 126Z"
        fill="url(#riderHeroGradient)"
      />
    </Svg>
    {children}
  </View>
);

const styles = StyleSheet.create({
  hero: {
    height: 190,
    width: '100%',
  },
});
