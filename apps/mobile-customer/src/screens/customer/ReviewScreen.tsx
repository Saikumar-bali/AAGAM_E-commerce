import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { apiClient } from '@aagam/mobile-shared';

export const ReviewScreen = () => {
  const route = useRoute<RouteProp<Record<string, { orderId: string }>, string>>();
  const orderId = route.params?.orderId;
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');

  const submit = async () => {
    try {
      await apiClient.post(`/orders/post-delivery/${orderId}/rating`, { orderRating: rating, storeRating: rating, riderRating: rating, comment });
      Alert.alert('Done', 'Thank you for the review.');
    } catch (error: any) {
      Alert.alert('Failed', error.response?.data?.message || 'Could not submit review');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Review order</Text>
      <Text style={styles.subtitle}>Order #{orderId?.slice(-8).toUpperCase()}</Text>
      <View style={styles.card}>
        <View style={styles.stars}>{[1, 2, 3, 4, 5].map((star) => <TouchableOpacity key={star} onPress={() => setRating(star)}><Text style={[styles.star, star <= rating && styles.starActive]}>★</Text></TouchableOpacity>)}</View>
        <TextInput style={styles.input} value={comment} onChangeText={setComment} placeholder="Comment optional" />
        <TouchableOpacity style={styles.button} onPress={submit}><Text style={styles.buttonText}>Submit review</Text></TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 16, paddingBottom: 32 },
  title: { fontSize: 30, fontWeight: '900', color: '#0F172A' },
  subtitle: { marginTop: 4, color: '#64748B', fontWeight: '700' },
  card: { marginTop: 16, backgroundColor: '#FFFFFF', borderRadius: 22, padding: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  stars: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  star: { color: '#CBD5E1', fontSize: 30 },
  starActive: { color: '#F59E0B' },
  input: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, color: '#0F172A' },
  button: { marginTop: 14, borderRadius: 16, backgroundColor: '#0F766E', paddingVertical: 15, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontWeight: '900' },
});
