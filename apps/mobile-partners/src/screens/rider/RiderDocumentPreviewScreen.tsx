import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, FileClock, RefreshCw } from 'lucide-react-native';
import React from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { riderService } from '../../api/riderService';

function label(value: unknown) {
  return String(value || 'UNKNOWN').replaceAll('_', ' ');
}

function date(value: unknown) {
  return value ? new Date(String(value)).toLocaleString('en-IN') : 'Not recorded';
}

export const RiderDocumentPreviewScreen = ({ route, navigation }: { route: any; navigation: any }) => {
  const insets = useSafeAreaInsets();
  const documentId = String(route.params?.documentId || '');
  const query = useQuery({
    queryKey: ['rider', 'document-preview', documentId],
    queryFn: () => riderService.getDocumentPreview(documentId),
    enabled: Boolean(documentId),
    retry: 1,
  });
  const data: any = query.data;
  const document = data?.document;
  const previewUrl = data?.preview?.url || data?.preview?.signedUrl || null;
  const isPdf = document?.mimeType === 'application/pdf';

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#067B5C" />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to Rider documents" style={styles.headerButton} onPress={() => navigation.goBack()}><ArrowLeft size={23} color="#FFFFFF" /></TouchableOpacity>
        <View style={styles.flex}><Text style={styles.eyebrow}>SIGNED PRIVATE PREVIEW</Text><Text style={styles.title}>{document ? label(document.type) : 'Document preview'}</Text></View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Refresh document preview" style={styles.headerButton} onPress={() => void query.refetch()}><RefreshCw size={20} color="#FFFFFF" /></TouchableOpacity>
      </View>

      {query.isLoading ? (
        <View style={styles.state}><ActivityIndicator size="large" color="#0F766E" /><Text style={styles.stateText}>Creating a short-lived preview…</Text></View>
      ) : query.isError || !document || !previewUrl ? (
        <View style={styles.state}><Text style={styles.stateTitle}>Preview unavailable</Text><Text style={styles.stateText}>{(query.error as Error)?.message || 'This private file could not be opened.'}</Text></View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          <View style={styles.previewFrame}>
            {isPdf ? (
              <View style={styles.pdfState}><FileClock size={48} color="#0F766E" /><Text style={styles.pdfTitle}>Private PDF preview</Text><Text style={styles.pdfText}>Open the short-lived signed URL in the system viewer. The URL expires automatically.</Text><TouchableOpacity accessibilityRole="button" style={styles.primary} onPress={() => void Linking.openURL(previewUrl)}><ExternalLink size={19} color="#FFFFFF" /><Text style={styles.primaryText}>Open PDF securely</Text></TouchableOpacity></View>
            ) : (
              <WebView source={{ uri: previewUrl }} style={styles.webview} originWhitelist={['https://*']} incognito cacheEnabled={false} sharedCookiesEnabled={false} />
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Review details</Text>
            <Fact label="Status" value={label(document.status)} />
            <Fact label="Last four" value={`••••${document.documentNumberLast4 || '—'}`} />
            <Fact label="Submitted" value={date(document.createdAt)} />
            <Fact label="Reviewed" value={date(document.reviewedAt)} />
            <Fact label="Review note" value={document.reviewNote || 'No review note'} />
            <Fact label="Expiry" value={date(document.expiresAt)} />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Replacement history</Text>
            {(data.replacementHistory || []).map((entry: any) => (
              <View key={entry.id} style={styles.historyRow}>
                <View style={styles.dot} />
                <View style={styles.flex}><Text style={styles.historyTitle}>{label(entry.status)}</Text><Text style={styles.historyMeta}>Submitted {date(entry.createdAt)} · reviewed {date(entry.reviewedAt)}</Text>{entry.reviewNote ? <Text style={styles.historyNote}>{entry.reviewNote}</Text> : null}</View>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
};

function Fact({ label: factLabel, value }: { label: string; value: string }) {
  return <View style={styles.fact}><Text style={styles.factLabel}>{factLabel}</Text><Text selectable style={styles.factValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' }, flex: { flex: 1 },
  header: { backgroundColor: '#067B5C', paddingHorizontal: 16, paddingBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 12 }, headerButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: '#A7F3D0', fontSize: 9, fontWeight: '900', letterSpacing: 1 }, title: { color: '#FFFFFF', fontSize: 21, fontWeight: '900' },
  previewFrame: { height: 430, margin: 14, borderRadius: 18, overflow: 'hidden', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1' }, webview: { flex: 1, backgroundColor: '#FFFFFF' },
  pdfState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 }, pdfTitle: { color: '#0F172A', fontSize: 19, fontWeight: '900', marginTop: 12 }, pdfText: { color: '#64748B', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 7 },
  primary: { minHeight: 50, borderRadius: 14, backgroundColor: '#067B5C', marginTop: 17, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, primaryText: { color: '#FFFFFF', fontWeight: '900' },
  card: { marginHorizontal: 14, marginBottom: 12, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 15 }, cardTitle: { color: '#0F172A', fontSize: 16, fontWeight: '900', marginBottom: 6 },
  fact: { paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' }, factLabel: { color: '#64748B', fontSize: 10, fontWeight: '800' }, factValue: { color: '#0F172A', fontSize: 13, fontWeight: '700', marginTop: 3 },
  historyRow: { flexDirection: 'row', gap: 10, paddingVertical: 10 }, dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#0F766E', marginTop: 4 }, historyTitle: { color: '#0F172A', fontSize: 12, fontWeight: '900' }, historyMeta: { color: '#64748B', fontSize: 10, marginTop: 3 }, historyNote: { color: '#7F1D1D', fontSize: 10, lineHeight: 15, marginTop: 4 },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 }, stateTitle: { color: '#0F172A', fontSize: 19, fontWeight: '900' }, stateText: { color: '#64748B', textAlign: 'center', marginTop: 8 },
});
