import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

export function AagamBrand({ compact = false, size: requestedSize }: { caption?: string; inverse?: boolean; compact?: boolean; size?: number }) {
  const size = requestedSize ?? (compact ? 58 : 112);
  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: compact ? 17 : 30 }]}>
      <Image
        source={require('../assets/aagam-logo-full.png')}
        resizeMode="cover"
        style={styles.mark}
        accessibilityLabel="Aagaam fresh, quality and trust"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: '#061B36' },
  mark: { width: '100%', height: '100%' },
});
