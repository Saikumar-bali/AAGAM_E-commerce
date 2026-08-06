import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { AagamMark } from './AagamMark';

type PartnerTabBrandProps = {
  inverse?: boolean;
  caption?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export function PartnerTabBrand({
  inverse = false,
  caption = 'PARTNERS',
  size = 38,
  style,
}: PartnerTabBrandProps) {
  return (
    <View testID="partner_tab_brand" style={[styles.row, style]}>
      <View style={styles.shadow}>
        <AagamMark size={size} radius={Math.round(size * 0.29)} />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.name, inverse && styles.nameInverse]}>Aagaam</Text>
        <Text style={[styles.caption, inverse && styles.captionInverse]}>{caption}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  shadow: {
    borderRadius: 12,
    shadowColor: '#003C2A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },
  copy: {
    marginLeft: 9,
  },
  name: {
    color: '#0F172A',
    fontSize: 16,
    lineHeight: 18,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  nameInverse: {
    color: '#FFFFFF',
  },
  caption: {
    color: '#087B5A',
    fontSize: 7,
    lineHeight: 10,
    fontWeight: '900',
    letterSpacing: 1.35,
    marginTop: 1,
  },
  captionInverse: {
    color: '#BDF6DD',
  },
});
