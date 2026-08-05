import DateTimePicker from '@react-native-community/datetimepicker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Camera, ChevronRight, FileCheck2, FilePlus2, FolderOpen, RefreshCw } from 'lucide-react-native';
import React, { useState } from 'react';
import {
  ActivityIndicator,
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

const TYPES = [
  'DRIVING_LICENSE',
  'IDENTITY',
  'VEHICLE_REGISTRATION',
  'VEHICLE_INSURANCE',
  'OTHER',
] as const;

function label(value: unknown) {
  return String(value || 'UNKNOWN').replaceAll('_', ' ');
}

function errorMessage(error: any) {
  const value = error?.response?.data?.message;
  return Array.isArray(value) ? value.join(', ') : value || error?.message || 'Document action failed.';
}

export const RiderDocumentsScreen = ({ navigation }: { navigation: any }) => {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['rider', 'profile'], queryFn: riderService.getProfile, retry: 1 });
  const documents: any[] = Array.isArray(query.data?.documents) ? query.data.documents : [];
  const [type, setType] = useState<(typeof TYPES)[number]>('DRIVING_LICENSE');
  const [last4, setLast4] = useState('');
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [showDate, setShowDate] = useState(false);
  const [file, setFile] = useState<PartnerPickedDocument | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Choose a document or capture a private image first.');
      return riderService.uploadAndSubmitDocument(file, {
        type,
        documentNumberLast4: last4.trim() || undefined,
        expiresAt: expiresAt?.toISOString(),
      });
    },
    onSuccess: async () => {
      setFile(null);
      setLast4('');
      setExpiresAt(null);
      await queryClient.invalidateQueries({ queryKey: ['rider', 'profile'] });
      Toast.show({ type: 'success', text1: 'Document submitted', text2: 'The replacement is now in the review history.' });
    },
    onError: (error: any) => Toast.show({ type: 'error', text1: 'Document submission failed', text2: errorMessage(error) }),
  });

  const pick = async (source: 'DOCUMENT' | 'CAMERA') => {
    try {
      setFile(source === 'CAMERA' ? await PartnerDocumentPicker.captureImage() : await PartnerDocumentPicker.pickDocument());
    } catch (error: any) {
      if (!String(error?.message || '').toLowerCase().includes('cancel')) Toast.show({ type: 'error', text1: 'File selection failed', text2: errorMessage(error) });
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#067B5C" />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to Rider profile" style={styles.back} onPress={() => navigation.goBack()}><ArrowLeft size={23} color="#FFFFFF" /></TouchableOpacity>
        <View style={styles.flex}><Text style={styles.eyebrow}>PRIVATE DOCUMENT VAULT</Text><Text style={styles.title}>Documents and renewals</Text></View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Refresh Rider documents" style={styles.back} onPress={() => void query.refetch()}><RefreshCw size={20} color="#FFFFFF" /></TouchableOpacity>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
      >
        <View style={styles.card}>
          <View style={styles.sectionHeader}><FilePlus2 size={21} color="#0F766E" /><Text style={styles.sectionTitle}>Submit or replace a document</Text></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {TYPES.map((value) => <TouchableOpacity key={value} accessibilityRole="button" accessibilityState={{ selected: type === value }} style={[styles.chip, type === value && styles.chipActive]} onPress={() => setType(value)}><Text style={[styles.chipText, type === value && styles.chipTextActive]}>{label(value)}</Text></TouchableOpacity>)}
          </ScrollView>
          <TextInput value={last4} onChangeText={(value) => setLast4(value.replace(/[^A-Za-z0-9]/g, '').slice(0, 4))} placeholder="Last 4 characters (optional)" placeholderTextColor="#94A3B8" autoCapitalize="characters" style={styles.input} />
          <TouchableOpacity accessibilityRole="button" style={styles.dateButton} onPress={() => setShowDate(true)}><Text style={styles.dateLabel}>Expiry</Text><Text style={styles.dateValue}>{expiresAt ? expiresAt.toLocaleDateString('en-IN') : 'Not specified'}</Text></TouchableOpacity>
          {showDate ? <DateTimePicker value={expiresAt || new Date()} mode="date" minimumDate={new Date()} onChange={(_, value) => { setShowDate(Platform.OS === 'ios'); if (value) setExpiresAt(value); }} /> : null}
          <View style={styles.pickRow}>
            <TouchableOpacity accessibilityRole="button" style={styles.pickButton} onPress={() => void pick('DOCUMENT')}><FolderOpen size={19} color="#0F766E" /><Text style={styles.pickText}>Choose file</Text></TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" style={styles.pickButton} onPress={() => void pick('CAMERA')}><Camera size={19} color="#0F766E" /><Text style={styles.pickText}>Use camera</Text></TouchableOpacity>
          </View>
          {file ? <View style={styles.fileRow}><FileCheck2 size={19} color="#15803D" /><View style={styles.flex}><Text style={styles.fileName}>{file.name}</Text><Text style={styles.fileMeta}>{file.type} · {Math.max(1, Math.round(file.size / 1024))} KB</Text></View></View> : null}
          <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: mutation.isPending || !file }} disabled={mutation.isPending || !file} style={[styles.primary, (!file || mutation.isPending) && styles.disabled]} onPress={() => mutation.mutate()}>{mutation.isPending ? <ActivityIndicator color="#FFFFFF" /> : <FilePlus2 size={19} color="#FFFFFF" />}<Text style={styles.primaryText}>Submit for review</Text></TouchableOpacity>
        </View>

        <Text style={styles.listTitle}>Submitted documents</Text>
        {query.isLoading ? <View style={styles.state}><ActivityIndicator size="large" color="#0F766E" /></View> : documents.length === 0 ? <View style={styles.state}><FolderOpen size={44} color="#94A3B8" /><Text style={styles.stateTitle}>No documents submitted</Text></View> : documents.map((document) => {
          const warning = document.isExpired || document.expiresSoon || document.status === 'REJECTED';
          return (
            <TouchableOpacity key={document.id} accessibilityRole="button" style={[styles.documentCard, warning && styles.documentWarning]} onPress={() => navigation.navigate('RiderDocumentPreview', { documentId: document.id })}>
              <View style={[styles.documentIcon, warning && styles.warningIcon]}>{warning ? <AlertTriangle size={21} color="#B45309" /> : <FileCheck2 size={21} color="#0F766E" />}</View>
              <View style={styles.flex}>
                <Text style={styles.documentTitle}>{label(document.type)}</Text>
                <Text style={styles.documentMeta}>••••{document.documentNumberLast4 || '—'} · {label(document.status)}</Text>
                <Text style={styles.documentMeta}>Submitted {new Date(document.createdAt).toLocaleDateString('en-IN')} · reviewed {document.reviewedAt ? new Date(document.reviewedAt).toLocaleDateString('en-IN') : 'not yet'}</Text>
                {document.expiresAt ? <Text style={[styles.documentMeta, warning && styles.warningText]}>Expires {new Date(document.expiresAt).toLocaleDateString('en-IN')}{document.isExpired ? ' · EXPIRED' : document.expiresSoon ? ' · RENEW SOON' : ''}</Text> : null}
                {document.reviewNote ? <Text style={styles.reviewNote}>{document.reviewNote}</Text> : null}
              </View>
              <ChevronRight size={21} color="#64748B" />
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' }, flex: { flex: 1 },
  header: { backgroundColor: '#067B5C', paddingHorizontal: 16, paddingBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 12 }, back: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: '#A7F3D0', fontSize: 9, fontWeight: '900', letterSpacing: 1 }, title: { color: '#FFFFFF', fontSize: 21, fontWeight: '900' },
  content: { padding: 14 }, card: { borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 15 }, sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 }, sectionTitle: { color: '#0F172A', fontSize: 16, fontWeight: '900' },
  chips: { gap: 7, paddingVertical: 12 }, chip: { minHeight: 36, borderRadius: 11, backgroundColor: '#F1F5F9', paddingHorizontal: 12, justifyContent: 'center' }, chipActive: { backgroundColor: '#0F766E' }, chipText: { color: '#475569', fontSize: 10, fontWeight: '800' }, chipTextActive: { color: '#FFFFFF' },
  input: { minHeight: 50, borderRadius: 13, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC', paddingHorizontal: 13, color: '#0F172A' },
  dateButton: { minHeight: 52, borderRadius: 13, borderWidth: 1, borderColor: '#CBD5E1', marginTop: 10, paddingHorizontal: 13, justifyContent: 'center' }, dateLabel: { color: '#64748B', fontSize: 9, fontWeight: '800' }, dateValue: { color: '#0F172A', fontSize: 13, fontWeight: '800', marginTop: 2 },
  pickRow: { flexDirection: 'row', gap: 9, marginTop: 10 }, pickButton: { flex: 1, minHeight: 48, borderRadius: 13, backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#99F6E4', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, pickText: { color: '#0F766E', fontWeight: '900' },
  fileRow: { borderRadius: 13, backgroundColor: '#F0FDF4', padding: 12, marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 9 }, fileName: { color: '#166534', fontSize: 12, fontWeight: '900' }, fileMeta: { color: '#15803D', fontSize: 9, marginTop: 2 },
  primary: { minHeight: 50, borderRadius: 14, backgroundColor: '#067B5C', marginTop: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, primaryText: { color: '#FFFFFF', fontWeight: '900' }, disabled: { opacity: 0.45 },
  listTitle: { color: '#0F172A', fontSize: 17, fontWeight: '900', marginTop: 18, marginBottom: 9 }, documentCard: { borderRadius: 17, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 13, marginBottom: 9, flexDirection: 'row', alignItems: 'center', gap: 10 }, documentWarning: { borderColor: '#FCD34D', backgroundColor: '#FFFBEB' },
  documentIcon: { width: 43, height: 43, borderRadius: 13, backgroundColor: '#CCFBF1', alignItems: 'center', justifyContent: 'center' }, warningIcon: { backgroundColor: '#FEF3C7' }, documentTitle: { color: '#0F172A', fontSize: 12, fontWeight: '900' }, documentMeta: { color: '#64748B', fontSize: 9, lineHeight: 14, marginTop: 3 }, warningText: { color: '#B45309', fontWeight: '800' }, reviewNote: { color: '#7F1D1D', fontSize: 10, lineHeight: 15, marginTop: 5 },
  state: { minHeight: 220, alignItems: 'center', justifyContent: 'center' }, stateTitle: { color: '#0F172A', fontSize: 17, fontWeight: '900', marginTop: 9 },
});
