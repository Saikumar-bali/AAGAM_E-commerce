import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

export function AagamBrand({ caption = 'fresh, quality and trust', inverse = false, compact = false }: { caption?: string; inverse?: boolean; compact?: boolean }) {
  const size = compact ? 44 : 58;
  return (
    <View style={styles.row}>
      <View style={[styles.markWrap, { width: size, height: size, borderRadius: compact ? 14 : 19 }]}>
        <Image source={require('../assets/aagam-mark.png')} resizeMode="contain" style={styles.mark} accessibilityLabel="Aagam" />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.name, compact && styles.nameCompact, inverse && styles.inverse]}>Aagam</Text>
        <Text style={[styles.caption, inverse && styles.captionInverse]} numberOfLines={1}>{caption}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  markWrap: { backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', padding: 3, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.14, shadowRadius: 10, elevation: 5 },
  mark: { width: '100%', height: '100%' },
  copy: { minWidth: 0 },
  name: { color: '#0F172A', fontSize: 27, lineHeight: 30, fontWeight: '900', letterSpacing: -1.2 },
  nameCompact: { fontSize: 22, lineHeight: 24 },
  caption: { marginTop: 2, color: '#0F766E', fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  inverse: { color: '#FFFFFF' },
  captionInverse: { color: '#99F6E4' },
});
