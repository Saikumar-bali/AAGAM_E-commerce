import React from 'react';
import {SafeAreaView, StyleSheet, Text, View} from 'react-native';

type Props = {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
};

export function ScreenContainer({title, subtitle, children}: Props) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        <View style={styles.body}>{children}</View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f7fb',
  },
  container: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    color: '#4b5563',
  },
  body: {
    flex: 1,
    marginTop: 20,
  },
});

