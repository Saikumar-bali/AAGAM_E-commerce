import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Camera,
  ChevronRight,
  FilePlus2,
  LifeBuoy,
  Link2,
  MessageCircle,
  RefreshCw,
} from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
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

const CATEGORIES = ['DELIVERY', 'PICKUP', 'CUSTOMER', 'STORE', 'PAYMENT', 'SAFETY', 'APP', 'OTHER'] as const;

function label(value: unknown) {
  return String(value || 'UNKNOWN').replaceAll('_', ' ');
}

function errorMessage(error: any) {
  const value = error?.response?.data?.message;
  return Array.isArray(value) ? value.join(', ') : value || error?.message || 'Support action failed.';
}

export const RiderSupportScreen = ({ route, navigation }: { route: any; navigation: any }) => {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const linkedJobId = String(route.params?.deliveryJobId || '');
  const [showCreate, setShowCreate] = useState(Boolean(linkedJobId));
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>(linkedJobId ? 'DELIVERY' : 'OTHER');
  const [subject, setSubject] = useState(linkedJobId ? 'Support needed for delivery job' : '');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<PartnerPickedDocument[]>([]);
  const query = useQuery({ queryKey: ['rider', 'support'], queryFn: riderService.getSupportTickets, retry: 1 });
  const tickets: any[] = Array.isArray(query.data) ? query.data : [];

  useEffect(() => {
    if (!linkedJobId) return;
    setShowCreate(true);
    setCategory('DELIVERY');
  }, [linkedJobId]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (subject.trim().length < 4) throw new Error('Enter a clear subject.');
      if (description.trim().length < 10) throw new Error('Describe the issue in at least 10 characters.');
      const evidenceKeys: string[] = [];
      for (const file of files) {
        evidenceKeys.push((await riderService.uploadEvidence(file)).storageKey);
      }
      return riderService.createSupportTicket({
        deliveryJobId: linkedJobId || undefined,
        category,
        subject: subject.trim(),
        description: description.trim(),
        evidenceKeys,
      });
    },
    onSuccess: async (ticket: any) => {
      setDescription('');
      setSubject('');
      setFiles([]);
      setShowCreate(false);
      await queryClient.invalidateQueries({ queryKey: ['rider', 'support'] });
      Toast.show({ type: 'success', text1: 'Support ticket created', text2: 'Your conversation is ready.' });
      navigation.navigate('RiderSupportConversation', { ticketId: ticket.id });
    },
    onError: (error: any) => Toast.show({ type: 'error', text1: 'Ticket creation failed', text2: errorMessage(error) }),
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
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to Rider profile" style={styles.headerButton} onPress={() => navigation.goBack()}><ArrowLeft size={23} color="#FFFFFF" /></TouchableOpacity>
        <View style={styles.flex}><Text style={styles.eyebrow}>RIDER SUPPORT</Text><Text style={styles.title}>Conversations</Text></View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Refresh support tickets" style={styles.headerButton} onPress={() => void query.refetch()}><RefreshCw size={20} color="#FFFFFF" /></TouchableOpacity>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
      >
        {linkedJobId ? (
          <View style={styles.linkedCard}><Link2 size={20} color="#0F766E" /><View style={styles.flex}><Text style={styles.linkedTitle}>Job-linked support</Text><Text selectable style={styles.linkedText}>Delivery job {linkedJobId}</Text></View></View>
        ) : null}

        <TouchableOpacity accessibilityRole="button" style={styles.newButton} onPress={() => setShowCreate((value) => !value)}>
          <FilePlus2 size={20} color="#FFFFFF" /><Text style={styles.newButtonText}>{showCreate ? 'Close new ticket form' : 'Create support ticket'}</Text>
        </TouchableOpacity>

        {showCreate ? (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>New support request</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>
              {CATEGORIES.map((value) => (
                <TouchableOpacity key={value} accessibilityRole="button" accessibilityState={{ selected: category === value }} style={[styles.category, category === value && styles.categoryActive]} onPress={() => setCategory(value)}>
                  <Text style={[styles.categoryText, category === value && styles.categoryTextActive]}>{label(value)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TextInput value={subject} onChangeText={setSubject} placeholder="Subject" placeholderTextColor="#94A3B8" maxLength={160} style={styles.input} />
            <TextInput value={description} onChangeText={setDescription} placeholder="Describe what happened, what you expected, and what help you need" placeholderTextColor="#94A3B8" maxLength={2000} multiline style={[styles.input, styles.multiline]} />
            <View style={styles.evidenceActions}>
              <TouchableOpacity accessibilityRole="button" style={styles.evidenceButton} onPress={() => void pick('DOCUMENT')}><FilePlus2 size={18} color="#0F766E" /><Text style={styles.evidenceText}>Attach file</Text></TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" style={styles.evidenceButton} onPress={() => void pick('CAMERA')}><Camera size={18} color="#0F766E" /><Text style={styles.evidenceText}>Take photo</Text></TouchableOpacity>
            </View>
            {files.map((file, index) => (
              <TouchableOpacity key={`${file.uri}-${index}`} accessibilityRole="button" accessibilityLabel={`Remove evidence ${file.name}`} style={styles.fileRow} onPress={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                <Text style={styles.fileName}>{file.name}</Text><Text style={styles.removeText}>Remove</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: createMutation.isPending }} disabled={createMutation.isPending} style={styles.submit} onPress={() => createMutation.mutate()}>
              {createMutation.isPending ? <ActivityIndicator color="#FFFFFF" /> : <MessageCircle size={19} color="#FFFFFF" />}
              <Text style={styles.submitText}>Create conversation</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Your tickets</Text>
        {query.isLoading ? (
          <View style={styles.state}><ActivityIndicator size="large" color="#0F766E" /><Text style={styles.stateText}>Loading conversations…</Text></View>
        ) : query.isError ? (
          <View style={styles.state}><Text style={styles.stateTitle}>Support unavailable</Text><Text style={styles.stateText}>{(query.error as Error)?.message || 'Pull down to retry.'}</Text></View>
        ) : tickets.length === 0 ? (
          <View style={styles.state}><LifeBuoy size={44} color="#94A3B8" /><Text style={styles.stateTitle}>No support tickets</Text><Text style={styles.stateText}>Create a job-linked or general support conversation above.</Text></View>
        ) : tickets.map((ticket) => {
          const closed = ['RESOLVED', 'CLOSED'].includes(ticket.status);
          const messages = Array.isArray(ticket.messages) ? ticket.messages : [];
          return (
            <TouchableOpacity key={ticket.id} accessibilityRole="button" style={styles.ticketCard} onPress={() => navigation.navigate('RiderSupportConversation', { ticketId: ticket.id })}>
              <View style={[styles.ticketIcon, closed && styles.ticketIconClosed]}><MessageCircle size={21} color={closed ? '#64748B' : '#0F766E'} /></View>
              <View style={styles.flex}>
                <Text style={styles.ticketSubject}>{ticket.subject}</Text>
                <Text style={styles.ticketMeta}>{label(ticket.category)} · {label(ticket.status)} · {messages.length} message{messages.length === 1 ? '' : 's'}</Text>
                <Text style={styles.ticketMeta}>Updated {new Date(ticket.updatedAt).toLocaleString('en-IN')}</Text>
                {ticket.deliveryJobId ? <Text selectable style={styles.jobLink}>Job #{String(ticket.deliveryJobId).slice(-8).toUpperCase()}</Text> : null}
              </View>
              <ChevronRight size={21} color="#64748B" />
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' }, flex: { flex: 1 },
  header: { backgroundColor: '#067B5C', paddingHorizontal: 16, paddingBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 12 }, headerButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: '#A7F3D0', fontSize: 9, fontWeight: '900', letterSpacing: 1 }, title: { color: '#FFFFFF', fontSize: 24, fontWeight: '900' }, content: { padding: 14 },
  linkedCard: { borderRadius: 15, backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#99F6E4', padding: 13, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 10 }, linkedTitle: { color: '#0F172A', fontSize: 12, fontWeight: '900' }, linkedText: { color: '#475569', fontSize: 9, marginTop: 3 },
  newButton: { minHeight: 51, borderRadius: 14, backgroundColor: '#067B5C', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, newButtonText: { color: '#FFFFFF', fontWeight: '900' },
  formCard: { marginTop: 10, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 14 }, formTitle: { color: '#0F172A', fontSize: 16, fontWeight: '900' }, categories: { gap: 7, paddingVertical: 11 }, category: { minHeight: 36, borderRadius: 11, backgroundColor: '#F1F5F9', paddingHorizontal: 11, justifyContent: 'center' }, categoryActive: { backgroundColor: '#0F766E' }, categoryText: { color: '#475569', fontSize: 9, fontWeight: '800' }, categoryTextActive: { color: '#FFFFFF' },
  input: { minHeight: 50, borderRadius: 13, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC', paddingHorizontal: 12, color: '#0F172A', marginTop: 9 }, multiline: { minHeight: 115, paddingTop: 12, textAlignVertical: 'top' },
  evidenceActions: { flexDirection: 'row', gap: 8, marginTop: 9 }, evidenceButton: { flex: 1, minHeight: 44, borderRadius: 12, backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#99F6E4', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, evidenceText: { color: '#0F766E', fontSize: 11, fontWeight: '900' }, fileRow: { minHeight: 42, borderRadius: 10, backgroundColor: '#F8FAFC', marginTop: 7, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center' }, fileName: { flex: 1, color: '#334155', fontSize: 10 }, removeText: { color: '#B91C1C', fontSize: 10, fontWeight: '900' },
  submit: { minHeight: 49, borderRadius: 13, backgroundColor: '#0F172A', marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, submitText: { color: '#FFFFFF', fontWeight: '900' },
  sectionTitle: { color: '#0F172A', fontSize: 17, fontWeight: '900', marginTop: 18, marginBottom: 9 }, ticketCard: { minHeight: 82, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 13, marginBottom: 9, flexDirection: 'row', alignItems: 'center', gap: 10 }, ticketIcon: { width: 43, height: 43, borderRadius: 13, backgroundColor: '#CCFBF1', alignItems: 'center', justifyContent: 'center' }, ticketIconClosed: { backgroundColor: '#E2E8F0' }, ticketSubject: { color: '#0F172A', fontSize: 12, fontWeight: '900' }, ticketMeta: { color: '#64748B', fontSize: 9, lineHeight: 14, marginTop: 3 }, jobLink: { color: '#0F766E', fontSize: 9, fontWeight: '800', marginTop: 3 },
  state: { minHeight: 260, alignItems: 'center', justifyContent: 'center', padding: 28 }, stateTitle: { color: '#0F172A', fontSize: 18, fontWeight: '900', marginTop: 10 }, stateText: { color: '#64748B', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 6 },
});
