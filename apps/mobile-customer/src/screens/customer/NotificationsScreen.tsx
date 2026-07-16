import React from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@aagam/mobile-shared';

type NotificationItem = { id: string; sourceHistoryId: string; orderId: string; title: string; body: string; createdAt: string; readAt?: string | null };

export const NotificationsScreen = () => {
  const queryClient = useQueryClient();
  const { data, isLoading, refetch, isRefetching } = useQuery({ queryKey: ['customer-notifications'], queryFn: async () => (await apiClient.get('/notifications/inbox')).data || { items: [], unreadCount: 0 } });
  const markRead = useMutation({ mutationFn: async (sourceHistoryId: string) => apiClient.patch(`/notifications/${sourceHistoryId}/read`), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customer-notifications'] }) });
  if (isLoading) return <View style={styles.centered}><ActivityIndicator size="large" color="#0F766E" /></View>;
  const items: NotificationItem[] = data?.items || [];
  return <View style={styles.container}><View style={styles.header}><Text style={styles.kicker}>Communication center</Text><Text style={styles.title}>Alerts</Text><Text style={styles.subtitle}>{data?.unreadCount || 0} unread update{data?.unreadCount === 1 ? '' : 's'}</Text></View><FlatList data={items} keyExtractor={(item) => item.id} contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />} ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyTitle}>No alerts yet</Text><Text style={styles.emptyText}>Order updates, support replies, and delivery alerts will appear here.</Text></View>} renderItem={({ item }) => <View style={[styles.card, item.readAt && styles.cardRead]}><Text style={styles.cardTitle}>{item.title}</Text><Text style={styles.cardBody}>{item.body}</Text><Text style={styles.cardMeta}>#{item.orderId?.slice(-8)?.toUpperCase()} · {new Date(item.createdAt).toLocaleString()}</Text>{!item.readAt ? <TouchableOpacity style={styles.readButton} onPress={() => markRead.mutate(item.sourceHistoryId)} disabled={markRead.isPending}><Text style={styles.readButtonText}>Mark read</Text></TouchableOpacity> : <Text style={styles.readMeta}>Read</Text>}</View>} /></View>;
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8 },
  kicker: { color: '#0F766E', fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.4 },
  title: { marginTop: 6, fontSize: 30, fontWeight: '900', color: '#0F172A', letterSpacing: -1 },
  subtitle: { marginTop: 4, color: '#64748B', fontWeight: '700' },
  list: { padding: 16, paddingBottom: 170 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 22, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#CCFBF1' },
  cardRead: { opacity: 0.68, borderColor: '#E2E8F0' },
  cardTitle: { fontSize: 16, fontWeight: '900', color: '#0F172A' },
  cardBody: { marginTop: 6, color: '#475569', fontWeight: '700', lineHeight: 20 },
  cardMeta: { marginTop: 10, color: '#94A3B8', fontSize: 12, fontWeight: '800' },
  readButton: { marginTop: 12, alignSelf: 'flex-start', backgroundColor: '#0F766E', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  readButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  readMeta: { marginTop: 12, color: '#64748B', fontWeight: '800', fontSize: 12 },
  empty: { paddingTop: 80, alignItems: 'center' },
  emptyTitle: { fontSize: 20, color: '#0F172A', fontWeight: '900' },
  emptyText: { marginTop: 8, color: '#64748B', textAlign: 'center', paddingHorizontal: 24 },
});