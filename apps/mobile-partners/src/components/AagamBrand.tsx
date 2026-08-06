import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AagamMark } from './AagamMark';

export function AagamBrand({
  caption = 'Fast Quality and Trust',
  inverse = false,
  compact = false,
}: {
  caption?: string;
  inverse?: boolean;
  compact?: boolean;
}) {
  const size = compact ? 44 : 58;
  return (
    <View style={styles.row}>
      <View style={[styles.markShadow, { borderRadius: compact ? 14 : 19 }]}>
        <AagamMark size={size} radius={compact ? 14 : 19} />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.name, compact && styles.nameCompact, inverse && styles.inverse]}>Aagaam</Text>
        <Text style={[styles.caption, inverse && styles.captionInverse]} numberOfLines={1}>{caption}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginRight: 'auto',
  },
  markShadow: {
    backgroundColor: '#061B36',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 5,
  },
  copy: {
    minWidth: 0,
    flexShrink: 1,
  },
  name: {
    color: '#0F172A',
    fontSize: 27,
    lineHeight: 30,
    fontWeight: '900',
    letterSpacing: -1.2,
  },
  nameCompact: {
    fontSize: 22,
    lineHeight: 24,
  },
  caption: {
    marginTop: 2,
    color: '#0F766E',
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  inverse: {
    color: '#FFFFFF',
  },
  captionInverse: {
    color: '#99F6E4',
  },
});
