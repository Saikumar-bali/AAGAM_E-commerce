import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { apiClient } from '@aagam/mobile-shared';
import { getUserSafeError, notify } from '../../ui/notify';

export const ReviewScreen = () => {
  const route = useRoute<RouteProp<Record<string, { orderId: string }>, string>>();
  const orderId = route.params?.orderId;
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [issue, setIssue] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [submittingSupport, setSubmittingSupport] = useState(false);

  const submitReview = async () => {
    if (submittingReview) return;
    setSubmittingReview(true);
    try {
      await apiClient.post(`/orders/post-delivery/${orderId}/rating`, { orderRating: rating, storeRating: rating, riderRating: rating, comment: comment.trim() || undefined });
      setComment('');
      notify.success('Review submitted', 'Thank you for sharing your experience.');
    } catch (error) {
      notify.error('Could not submit review', getUserSafeError(error, 'Please try again.'));
    } finally {
      setSubmittingReview(false);
    }
  };

  const openSupport = async () => {
    if (issue.trim().length < 5) {
      notify.warning('Add more details', 'Describe the issue using at least 5 characters.');
      return;
    }
    if (submittingSupport) return;
    setSubmittingSupport(true);
    try {
      await apiClient.post(`/orders/post-delivery/${orderId}/support`, { category: 'OTHER', message: issue.trim(), priority: 'NORMAL', requestedRefund: false });
      setIssue('');
      notify.success('Support ticket opened', 'The support team can now review your request.');
    } catch (error) {
      notify.error('Could not open support ticket', getUserSafeError(error, 'Please try again.'));
    } finally {
      setSubmittingSupport(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Review order</Text>
      <Text style={styles.subtitle}>Order #{orderId?.slice(-8).toUpperCase()}</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Rating</Text>
        <View style={styles.stars}>{[1, 2, 3, 4, 5].map((star) => <TouchableOpacity key={star} onPress={() => setRating(star)}><Text style={[styles.star, star <= rating && styles.starActive]}>★</Text></TouchableOpacity>)}</View>
        <TextInput style={styles.input} value={comment} onChangeText={setComment} placeholder="Comment optional" placeholderTextColor="#94A3B8" />
        <TouchableOpacity disabled={submittingReview} style={[styles.button, submittingReview && styles.disabled]} onPress={() => void submitReview()}><Text style={styles.buttonText}>{submittingReview ? 'Submitting…' : 'Submit review'}</Text></TouchableOpacity>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Need help?</Text>
        <TextInput style={[styles.input, styles.textArea]} value={issue} onChangeText={setIssue} placeholder="Describe the issue" placeholderTextColor="#94A3B8" multiline />
        <TouchableOpacity disabled={submittingSupport} style={[styles.supportButton, submittingSupport && styles.disabled]} onPress={() => void openSupport()}><Text style={styles.buttonText}>{submittingSupport ? 'Opening…' : 'Open support ticket'}</Text></TouchableOpacity>
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
  cardTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A', marginBottom: 12 },
  stars: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  star: { color: '#CBD5E1', fontSize: 30 },
  starActive: { color: '#F59E0B' },
  input: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, color: '#0F172A' },
  textArea: { minHeight: 90, textAlignVertical: 'top' },
  button: { marginTop: 14, borderRadius: 16, backgroundColor: '#0F766E', paddingVertical: 15, alignItems: 'center' },
  supportButton: { marginTop: 14, borderRadius: 16, backgroundColor: '#0F172A', paddingVertical: 15, alignItems: 'center' },
  disabled: { opacity: 0.55 },
  buttonText: { color: '#FFFFFF', fontWeight: '900' },
});
