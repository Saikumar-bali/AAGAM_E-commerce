import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FileCheck2, FilePlus2, Trash2 } from 'lucide-react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import {
  FormField,
  OnboardingShell,
  palette,
  PrimaryButton,
  ProgressBar,
  Section,
  StatusPill,
} from '../components/PartnerOnboardingUI';
import { editableApplication } from '../onboarding/types';
import { usePartnerOnboardingStore } from '../onboarding/usePartnerOnboardingStore';

const pickerHtml = `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
body{margin:0;font-family:Arial,sans-serif;background:#fff}
label{height:54px;border:2px dashed #94a3b8;border-radius:16px;display:flex;align-items:center;justify-content:center;color:#0f766e;font-weight:800;background:#f8fafc}
input{display:none}
</style></head><body>
<label for="file">Choose image or PDF</label>
<input id="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" />
<script>
const input=document.getElementById('file');
input.addEventListener('change',()=>{
 const file=input.files&&input.files[0];
 if(!file)return;
 const reader=new FileReader();
 reader.onload=()=>window.ReactNativeWebView.postMessage(JSON.stringify({
  filename:file.name,mimeType:file.type,size:file.size,dataUrl:reader.result
 }));
 reader.onerror=()=>window.ReactNativeWebView.postMessage(JSON.stringify({error:'Could not read selected file'}));
 reader.readAsDataURL(file);
});
</script></body></html>`;

export function PartnerDocumentsScreen({ navigation }: any) {
  const { response, uploadDocument, removeDocument, isLoading } = usePartnerOnboardingStore();
  const application = response?.application;
  const requirements = response?.requirements;
  const documents = response?.documents || [];
  const allowed = requirements?.allowedDocuments || [];
  const [type, setType] = useState(allowed[0] || 'IDENTITY');
  const [documentNumber, setDocumentNumber] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [selectedFile, setSelectedFile] = useState<{
    filename: string;
    mimeType: string;
    size: number;
    dataUrl: string;
  } | null>(null);

  const editable = editableApplication(application?.status);
  const missing = useMemo(
    () =>
      (requirements?.requiredDocuments || []).filter(
        (required) => !requirements?.completedRequired?.includes(required),
      ),
    [requirements],
  );

  const onFileMessage = (event: WebViewMessageEvent) => {
    try {
      const payload = JSON.parse(event.nativeEvent.data);
      if (payload.error) throw new Error(payload.error);
      if (payload.size > 10 * 1024 * 1024) {
        throw new Error('Document exceeds the 10 MB limit');
      }
      setSelectedFile(payload);
    } catch (error: any) {
      Alert.alert('File could not be selected', error.message);
    }
  };

  const upload = async () => {
    if (!selectedFile) {
      Alert.alert('Choose a document', 'Select an image or PDF first.');
      return;
    }
    try {
      await uploadDocument({
        type,
        filename: selectedFile.filename,
        mimeType: selectedFile.mimeType,
        dataUrl: selectedFile.dataUrl,
        documentNumber: documentNumber.trim() || undefined,
        expiresAt: expiresAt.trim() || undefined,
      });
      setSelectedFile(null);
      setDocumentNumber('');
      setExpiresAt('');
      Alert.alert('Document uploaded', `${type.replaceAll('_', ' ')} is ready for review.`);
    } catch (error: any) {
      Alert.alert('Upload failed', error.message);
    }
  };

  const remove = (documentId: string, documentType: string) => {
    Alert.alert(
      'Remove document?',
      `${documentType.replaceAll('_', ' ')} will need to be uploaded again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeDocument(documentId);
            } catch (error: any) {
              Alert.alert('Could not remove document', error.message);
            }
          },
        },
      ],
    );
  };

  return (
    <OnboardingShell
      title="Documents and evidence"
      subtitle="Upload clear, complete files. Admin reviews every mandatory document separately and can request a replacement."
      onBack={() => navigation.goBack()}
    >
      <Section title="Completion">
        <ProgressBar value={requirements?.completionPercent || 0} />
        {missing.length ? (
          <Text style={styles.missing}>Still required: {missing.join(', ').replaceAll('_', ' ')}</Text>
        ) : (
          <Text style={styles.complete}>All required document types are present.</Text>
        )}
      </Section>

      {editable ? (
        <Section title="Upload or replace a document" subtitle="Replacing a file resets its review status to Pending.">
          <View style={styles.chips}>
            {allowed.map((item) => (
              <TouchableOpacity
                key={item}
                style={[styles.chip, type === item && styles.chipActive]}
                onPress={() => setType(item)}
              >
                <Text style={[styles.chipText, type === item && styles.chipTextActive]}>
                  {item.replaceAll('_', ' ')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.webPicker}>
            <WebView
              originWhitelist={['*']}
              source={{ html: pickerHtml }}
              onMessage={onFileMessage}
              scrollEnabled={false}
              javaScriptEnabled
              style={styles.web}
            />
          </View>
          {selectedFile ? (
            <View style={styles.selected}>
              <FilePlus2 size={19} color={palette.teal} />
              <View style={{ flex: 1 }}>
                <Text style={styles.selectedName}>{selectedFile.filename}</Text>
                <Text style={styles.selectedMeta}>{Math.ceil(selectedFile.size / 1024)} KB · {selectedFile.mimeType}</Text>
              </View>
            </View>
          ) : null}
          <FormField label="Document number" value={documentNumber} onChangeText={setDocumentNumber} placeholder="Optional; only last four are retained" secureTextEntry />
          <FormField label="Expiry date" value={expiresAt} onChangeText={setExpiresAt} placeholder="YYYY-MM-DD, when applicable" />
          <PrimaryButton label="Upload document" onPress={upload} loading={isLoading} disabled={!selectedFile} />
        </Section>
      ) : null}

      <Section title="Submitted documents">
        {documents.length === 0 ? (
          <Text style={styles.empty}>No documents uploaded yet.</Text>
        ) : (
          documents.map((document) => (
            <View key={document.id} style={styles.documentCard}>
              <FileCheck2 size={21} color={palette.teal} />
              <View style={{ flex: 1 }}>
                <Text style={styles.documentType}>{document.type.replaceAll('_', ' ')}</Text>
                <Text style={styles.documentName}>{document.originalFilename}</Text>
                {document.documentNumberLast4 ? (
                  <Text style={styles.documentMeta}>Number •••• {document.documentNumberLast4}</Text>
                ) : null}
                {document.reviewNote ? (
                  <Text style={styles.reviewNote}>{document.reviewNote}</Text>
                ) : null}
              </View>
              <View style={styles.documentActions}>
                <StatusPill status={document.status} />
                {editable ? (
                  <TouchableOpacity onPress={() => remove(document.id, document.type)} style={styles.deleteButton}>
                    <Trash2 size={16} color={palette.red} />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          ))
        )}
      </Section>

      <PrimaryButton label="Review application status" onPress={() => navigation.navigate('ApplicationStatus')} secondary />
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  missing: { color: palette.amber, fontSize: 12, fontWeight: '800', lineHeight: 18 },
  complete: { color: palette.green, fontSize: 12, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: '#CBD5E1', paddingHorizontal: 11, paddingVertical: 8, backgroundColor: '#F8FAFC' },
  chipActive: { backgroundColor: '#CCFBF1', borderColor: '#2DD4BF' },
  chipText: { color: palette.muted, fontSize: 10, fontWeight: '900' },
  chipTextActive: { color: palette.teal },
  webPicker: { height: 58, overflow: 'hidden', borderRadius: 16 },
  web: { backgroundColor: '#FFFFFF' },
  selected: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: '#F0FDFA', borderRadius: 15, padding: 13 },
  selectedName: { color: palette.ink, fontSize: 13, fontWeight: '800' },
  selectedMeta: { color: palette.muted, fontSize: 10, marginTop: 3 },
  empty: { color: palette.muted, fontSize: 13, textAlign: 'center', paddingVertical: 18 },
  documentCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 17, borderWidth: 1, borderColor: '#E2E8F0', padding: 14 },
  documentType: { color: palette.ink, fontSize: 13, fontWeight: '900' },
  documentName: { color: palette.muted, fontSize: 11, marginTop: 3 },
  documentMeta: { color: '#475569', fontSize: 10, fontWeight: '700', marginTop: 4 },
  reviewNote: { color: palette.red, fontSize: 11, lineHeight: 16, marginTop: 7 },
  documentActions: { alignItems: 'flex-end', gap: 8 },
  deleteButton: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' },
});
