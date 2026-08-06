import React from 'react';
import {
  Image,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

type AagamMarkProps = {
  size?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function AagamMark({
  size = 48,
  radius = Math.round(size * 0.28),
  style,
  accessibilityLabel = 'Aagaam',
}: AagamMarkProps) {
  return (
    <View
      testID="aagaam_mark_frame"
      style={[
        styles.frame,
        { width: size, height: size, borderRadius: radius },
        style,
      ]}
    >
      <Image
        source={require('../assets/aagam-mark.png')}
        resizeMode="cover"
        style={styles.image}
        accessibilityLabel={accessibilityLabel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    backgroundColor: '#061B36',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
