import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import type { RiderJobsStackParamList } from './partnerNavigationTypes';
import { riderService } from '../api/riderService';
import { RiderJobsScreen } from '../screens/rider/RiderJobsScreen';
import { RiderOfferDetailScreen } from '../screens/rider/RiderOfferDetailScreen';
import { RiderJobRouteScreen } from '../screens/rider/RiderJobRouteScreen';
import { RiderHistoryScreen } from '../screens/rider/RiderHistoryScreen';
import { RiderDeliveryCompletedScreen } from '../screens/rider/RiderDeliveryCompletedScreen';

const Stack = createNativeStackNavigator<RiderJobsStackParamList>();

function Jobs({ navigation }: { navigation: any }) {
  return <RiderJobsScreen onOpenActive={() => navigation.navigate('RiderActiveJob', { deliveryJobId: 'current' })} onOpenHistory={() => navigation.navigate('RiderJobHistory')} onOpenDashboard={() => navigation.getParent()?.navigate('Dashboard')} />;
}
function Active(props: any) { return <RiderJobRouteScreen {...props} expected="ACTIVE" />; }
function Pickup(props: any) { return <RiderJobRouteScreen {...props} expected="PICKUP" />; }
function Delivery(props: any) { return <RiderJobRouteScreen {...props} expected="DELIVERY" />; }
function Return(props: any) { return <RiderJobRouteScreen {...props} expected="RETURN" />; }
function History({ navigation }: { navigation: any }) {
  return <RiderHistoryScreen onBack={() => navigation.goBack()} onOpenReceipt={(deliveryJobId) => navigation.navigate('RiderJobHistoryDetail', { deliveryJobId })} />;
}
function HistoryDetail({ navigation, route }: { navigation: any; route: any }) {
  const deliveryJobId = String(route.params?.deliveryJobId || '');
  const query = useQuery({ queryKey: ['rider', 'delivery-receipt', deliveryJobId], queryFn: () => riderService.getReceipt(deliveryJobId), enabled: Boolean(deliveryJobId), retry: 2 });
  if (query.isLoading) return <View style={styles.state}><ActivityIndicator color="#087B5B" /><Text style={styles.hint}>Loading secure receipt…</Text></View>;
  if (!query.data) return <View style={styles.state}><Text style={styles.title}>Receipt unavailable</Text><Text style={styles.hint}>The authoritative receipt could not be loaded.</Text><TouchableOpacity style={styles.button} onPress={() => navigation.goBack()}><Text style={styles.buttonText}>Back</Text></TouchableOpacity></View>;
  return <RiderDeliveryCompletedScreen receipt={query.data} onHome={() => navigation.goBack()} />;
}

export const RiderJobsNavigator = () => (
  <Stack.Navigator initialRouteName="RiderJobs" screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F4F7FB' }, animation: 'slide_from_right' }}>
    <Stack.Screen name="RiderJobs" component={Jobs} />
    <Stack.Screen name="RiderOfferDetail" component={RiderOfferDetailScreen} />
    <Stack.Screen name="RiderActiveJob" component={Active} />
    <Stack.Screen name="RiderPickup" component={Pickup} />
    <Stack.Screen name="RiderDelivery" component={Delivery} />
    <Stack.Screen name="RiderReturn" component={Return} />
    <Stack.Screen name="RiderJobHistory" component={History} />
    <Stack.Screen name="RiderJobHistoryDetail" component={HistoryDetail} />
  </Stack.Navigator>
);

const styles = StyleSheet.create({
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10 },
  title: { color: '#0F172A', fontSize: 20, fontWeight: '900' },
  hint: { color: '#64748B', textAlign: 'center' },
  button: { minHeight: 46, borderRadius: 14, backgroundColor: '#087B5B', paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#FFFFFF', fontWeight: '900' },
});
