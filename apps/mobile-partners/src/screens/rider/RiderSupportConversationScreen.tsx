import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Camera, FilePlus2, LockKeyhole, RefreshCw, Send } from 'lucide-react-native';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { riderService } from '../../api/riderService';
import { PartnerDocumentPicker, PartnerPickedDocument } from '../../native/PartnerDocumentPicker';

function label(value: unknown) {
  return String(value || 'UNKNOWN').replaceAll('_', ' ');
}

function errorMessage(error: any) {
  const value = error?.response?.data?.message;
  return Array.isArray(value) ? value.join(', ') : value || error?.message || 'Support reply failed.';
}

export const RiderSupportConversationScreen = ({ route, navigation }: { route: any; navigation: any }) => {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const ticketId = String(route.params?.ticketId || '');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<PartnerPickedDocument[]>([]);
  const query = useQuery({
    queryKey: ['rider', 'support-ticket', ticketId],
    queryFn: () => riderService.getSupportTicket(ticketId),
    enabled: Boolean(ticketId),
    retry: 1,
    refetchInterval: 15_000,
  });
  const ticket: any = query.data;
  const closed = ticket ? ['RESOLVED', 'CLOSED'].includes(ticket.status) : false;

  const replyMutation = useMutation({
    mutationFn: async () => {
      if (body.trim().length < 1) throw new Error('Enter a reply.');
      const keys: string[] = [];
      for (const file of files) keys.push((await riderService.uploadEvidence(file)).storageKey);
      return riderService.replySupportTicket(ticketId, body.trim(), keys);
    },
    onSuccess: async () => {
      setBody('');
      setFiles([]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['rider', 'support-ticket', ticketId] }),
        queryClient.invalidateQueries({ queryKey: ['rider', 'support'] }),
      ]);
      Toast.show({ type: 'success', text1: 'Reply sent' });
    },
    onError: (error: any) => Toast.show({ type: 'error', text1: 'Reply failed', text2: errorMessage(error) }),
  });

  const pick = async (source: 'DOCUMENT' | 'CAMERA') => {
    try {
      const file = source === 'CAMERA' ? await PartnerDocumentPicker.captureImage() : await PartnerDocumentPicker.pickDocument();
      setFiles((current) => current.length >= 8 ? current : [...current, file]);
    } catch (error: any) {
      if (!String(error?.message || '').toLowerCase().includes('cancel')) Toast.show({ type: 'error', text1: 'Evidence selection failed', text2: errorMessage(error) });
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="light-content" backgroundColor="#067B5C" />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to support tickets" style={styles.headerButton} onPress={() => navigation.goBack()}><ArrowLeft size={23} color="#FFFFFF" /></TouchableOpacity>
        <View style={styles.flex}><Text style={styles.eyebrow}>SUPPORT CONVERSATION</Text><Text numberOfLines={1} style={styles.title}>{ticket?.subject || 'Ticket'}</Text></View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Refresh support conversation" style={styles.headerButton} onPress={() => void query.refetch()}><RefreshCw size={20} color="#FFFFFF" /></TouchableOpacity>
      </View>

      <ScrollView
        style={styles.messages}
        contentContainerStyle={styles.messagesContent}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
      >
        {query.isLoading ? (
          <View style={styles.state}><ActivityIndicator size="large" color="#0F766E" /></View>
        ) : query.isError || !ticket ? (
          <View style={styles.state}><Text style={styles.stateTitle}>Conversation unavailable</Text><Text style={styles.stateText}>{(query.error as Error)?.message || 'The ticket could not be loaded.'}</Text></View>
        ) : (
          <>
            <View style={styles.ticketSummary}>
              <Text style={styles.ticketStatus}>{label(ticket.status)}</Text>
              <Text style={styles.ticketSubject}>{ticket.subject}</Text>
              <Text style={styles.ticketMeta}>{label(ticket.category)} · opened {new Date(ticket.createdAt).toLocaleString('en-IN')}</Text>
              {ticket.deliveryJobId ? <Text selectable style={styles.jobId}>Delivery job {ticket.deliveryJobId}</Text> : null}
            </View>
            {(ticket.messages || []).map((message: any) => {
              const rider = message.senderRole === 'RIDER';
              return (
                <View key={message.id} style={[styles.messageRow, rider && styles.messageRowMine]}>
                  <View style={[styles.bubble, rider ? styles.bubbleMine : styles.bubbleSupport]}>
                    <Text style={[styles.sender, rider && styles.senderMine]}>{rider ? 'You' : label(message.senderRole)}</Text>
                    <Text selectable style={[styles.body, rider && styles.bodyMine]}>{message.body}</Text>
                    {(message.evidenceKeys || []).map((key: string) => <Text key={key} selectable style={[styles.attachment, rider && styles.attachmentMine]}>Evidence: {key.split('/').pop()}</Text>)}
                    <Text style={[styles.time, rider && styles.timeMine]}>{new Date(message.createdAt).toLocaleString('en-IN')}</Text>
                  </View>
                </View>
              );
            })}
            {closed ? (
              <View style={styles.closedCard}><LockKeyhole size={21} color="#64748B" /><View style={styles.flex}><Text style={styles.closedTitle}>Conversation closed</Text><Text style={styles.closedText}>Resolved and closed tickets are read-only. Create a new ticket if the issue returns.</Text></View></View>
            ) : null}
          </>
        )}
      </ScrollView>

      {!closed && ticket ? (
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          {files.map((file, index) => (
            <TouchableOpacity key={`${file.uri}-${index}`} accessibilityRole="button" accessibilityLabel={`Remove evidence ${file.name}`} style={styles.fileChip} onPress={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
              <Text numberOfLines={1} style={styles.fileName}>{file.name}</Text><Text style={styles.remove}>×</Text>
            </TouchableOpacity>
          ))}
          <View style={styles.composerRow}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Attach support evidence" style={styles.attach} onPress={() => void pick('DOCUMENT')}><FilePlus2 size={20} color="#0F766E" /></TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Capture support evidence" style={styles.attach} onPress={() => void pick('CAMERA')}><Camera size={20} color="#0F766E" /></TouchableOpacity>
            <TextInput value={body} onChangeText={setBody} placeholder="Reply to support" placeholderTextColor="#94A3B8" maxLength={2000} multiline style={styles.input} />
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Send support reply" accessibilityState={{ disabled: replyMutation.isPending || !body.trim() }} disabled={replyMutation.isPending || !body.trim()} style={[styles.send, (!body.trim() || replyMutation.isPending) && styles.disabled]} onPress={() => replyMutation.mutate()}>
              {replyMutation.isPending ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Send size={20} color="#FFFFFF" />}
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' }, flex: { flex: 1 },
  header: { backgroundColor: '#067B5C', paddingHorizontal: 16, paddingBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 12 }, headerButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: '#A7F3D0', fontSize: 9, fontWeight: '900', letterSpacing: 1 }, title: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
  messages: { flex: 1 }, messagesContent: { padding: 14, paddingBottom: 24 }, ticketSummary: { borderRadius: 17, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 14, marginBottom: 13 }, ticketStatus: { color: '#0F766E', fontSize: 10, fontWeight: '900' }, ticketSubject: { color: '#0F172A', fontSize: 16, fontWeight: '900', marginTop: 4 }, ticketMeta: { color: '#64748B', fontSize: 10, marginTop: 4 }, jobId: { color: '#0F766E', fontSize: 9, fontWeight: '800', marginTop: 4 },
  messageRow: { alignItems: 'flex-start', marginBottom: 9 }, messageRowMine: { alignItems: 'flex-end' }, bubble: { maxWidth: '86%', borderRadius: 17, padding: 12 }, bubbleMine: { backgroundColor: '#067B5C', borderBottomRightRadius: 5 }, bubbleSupport: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderBottomLeftRadius: 5 }, sender: { color: '#0F766E', fontSize: 9, fontWeight: '900' }, senderMine: { color: '#A7F3D0' }, body: { color: '#0F172A', fontSize: 13, lineHeight: 19, marginTop: 4 }, bodyMine: { color: '#FFFFFF' }, attachment: { color: '#0F766E', fontSize: 9, fontWeight: '800', marginTop: 6 }, attachmentMine: { color: '#D1FAE5' }, time: { color: '#94A3B8', fontSize: 8, marginTop: 6 }, timeMine: { color: '#A7F3D0' },
  closedCard: { borderRadius: 15, backgroundColor: '#E2E8F0', padding: 13, marginTop: 8, flexDirection: 'row', gap: 9 }, closedTitle: { color: '#334155', fontSize: 12, fontWeight: '900' }, closedText: { color: '#64748B', fontSize: 10, lineHeight: 15, marginTop: 3 },
  composer: { backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingHorizontal: 10, paddingTop: 9 }, composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 7 }, attach: { width: 42, height: 46, borderRadius: 13, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center' }, input: { flex: 1, minHeight: 46, maxHeight: 112, borderRadius: 15, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC', paddingHorizontal: 12, paddingVertical: 10, color: '#0F172A' }, send: { width: 46, height: 46, borderRadius: 14, backgroundColor: '#067B5C', alignItems: 'center', justifyContent: 'center' }, disabled: { opacity: 0.45 },
  fileChip: { alignSelf: 'flex-start', maxWidth: '88%', minHeight: 32, borderRadius: 10, backgroundColor: '#ECFDF5', paddingHorizontal: 10, marginBottom: 7, flexDirection: 'row', alignItems: 'center', gap: 7 }, fileName: { flexShrink: 1, color: '#0F766E', fontSize: 10, fontWeight: '800' }, remove: { color: '#B91C1C', fontSize: 18, fontWeight: '900' },
  state: { minHeight: 420, alignItems: 'center', justifyContent: 'center', padding: 28 }, stateTitle: { color: '#0F172A', fontSize: 18, fontWeight: '900' }, stateText: { color: '#64748B', textAlign: 'center', marginTop: 7 },
});
