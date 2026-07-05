import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { apiClient } from '../../api/client';

export const OrderFeedbackScreen = () => {
  const route = useRoute<RouteProp<Record<string, { orderId: string }>, string>>();
  const orderId = route.params?.orderId;
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [issue, setIssue] = useState('');
  const [saving, setSaving] = useState(false);

  const submitRating = async () => {
    setSaving(true);
    try {
      await apiClient.post(`/orders/post-delivery/${orderId}/rating`, { orderRating: rating, storeRating: rating, riderRating: rating, comment });
      Alert.alert('Rating submitted', 'Thank you for your feedback.');
    } catch (error: any) {
      Alert.alert('Rating failed', error.response?.data?.message || 'Could not submit rating');
    } finally {
      setSaving(false);
    }
  };

  const openSupport = async () => {
    if (issue.trim().length < 5) {
      Alert.alert('Add details', 'Please describe the issue.');
      return;
    }
    setSaving(true);
    try {
      await apiClient.post(`/orders/post-delivery/${orderId}/support`, { category: 'OTHER', message: issue, priority: 'NORMAL', requestedRefund: false });
      setIssue('');
      Alert.alert('Support ticket opened', 'Our team will review this order.');
    } catch (error: any) {
      Alert.alert('Support failed', error.response?.data?.message || 'Could not open support ticket');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>Post delivery</Text>
      <Text style={styles.title}>Rate or get support</Text>
      <Text style={styles.subtitle}>Order #{orderId?.slice(-8).toUpperCase()}</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Rating</Text>
        <View style={styles.starRow}>{[1, 2, 3, 4, 5].map((star) => <TouchableOpacity key={star} onPress={() => setRating(star)}><Text style={[styles.star, star <= rating && styles.starActive]}>★</Text></TouchableOpacity>)}</View>
        <TextInput value={comment} onChangeText={setComment} placeholder="Optional comment" placeholderTextColor="#94A3B8" style={styles.input} />
        <TouchableOpacity style={styles.primaryButton} onPress={submitRating} disabled={saving}><Text style={styles.primaryButtonText}>{saving ? 'Saving...' : 'Submit rating'}</Text></TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Support</Text>
        <TextInput value={issue} onChangeText={setIssue} placeholder="What went wrong?" placeholderTextColor="#94A3B8" style={[styles.input, styles.textArea]} multiline />
        <TouchableOpacity style={styles.primaryButton} onPress={openSupport} disabled={saving}><Text style={styles.primaryButtonText}>{saving ? 'Opening...' : 'Open support ticket'}</Text></TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 16, paddingBottom: 32 },
  kicker: { color: '#0F766E', fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.4 },
  title: { marginTop: 6, fontSize: 30, fontWeight: '900', color: '#0F172A', letterSpacing: -1 },
  subtitle: { marginTop: 4, color: '#64748B', fontWeight: '700' },
  card: { marginTop: 16, backgroundColor: '#FFFFFF', borderRadius: 22, padding: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  cardTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A', marginBottom: 12 },
  starRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  star: { color: '#CBD5E1', fontSize: 30 },
  starActive: { color: '#F59E0B' },
  input: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, color: '#0F172A', backgroundColor: '#FFFFFF', marginTop: 8 },
  textArea: { minHeight: 96, textAlignVertical: 'top' },
  primaryButton: { marginTop: 14, borderRadius: 16, backgroundColor: '#0F766E', paddingVertical: 15, alignItems: 'center' },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '900' },
});
