import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StoreDeliveryOperationsScreen } from './StoreDeliveryOperationsScreen';

export const StoreOperationsRouteScreen = ({ route }: { route?: any }) => {
  const orderId = route?.params?.orderId as string | undefined;
  return (
    <View style={styles.page}>
      {orderId ? (
        <View style={styles.contextBanner}>
          <Text style={styles.contextLabel}>OPENED FROM ORDERS</Text>
          <Text style={styles.contextText}>Order #{orderId.slice(-8).toUpperCase()} is prioritized for operational review.</Text>
        </View>
      ) : null}
      <StoreDeliveryOperationsScreen />
    </View>
  );
};

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F5F3EE' },
  contextBanner: { backgroundColor: '#ECFDF5', borderBottomWidth: 1, borderBottomColor: '#A7F3D0', paddingHorizontal: 18, paddingVertical: 10 },
  contextLabel: { color: '#047857', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  contextText: { color: '#065F46', fontSize: 12, fontWeight: '800', marginTop: 2 },
});
