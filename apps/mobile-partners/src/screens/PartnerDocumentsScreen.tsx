import React, { useMemo, useState } from 'react';
import {
  Alert,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Camera,
  CheckCircle2,
  FileCheck2,
  FilePlus2,
  FolderOpen,
  RefreshCw,
  Trash2,
} from 'lucide-react-native';
import {
  FormField,
  OnboardingShell,
  palette,
  PrimaryButton,
  ProgressBar,
  Section,
  StatusPill,
} from '../components/PartnerOnboardingUI';
import { PartnerDocumentPicker, PartnerPickedDocument } from '../native/PartnerDocumentPicker';
import { editableApplication } from '../onboarding/types';
import { usePartnerOnboardingStore } from '../onboarding/usePartnerOnboardingStore';

const DOCUMENT_HELP: Record<string, string> = {
  IDENTITY: 'Aadhaar, voter ID, passport or another government identity document.',
  PROFILE_PHOTO: 'A recent clear photo of your face without filters.',
  DRIVING_LICENSE: 'Front and back, readable and not expired.',
  VEHICLE_REGISTRATION: 'Registration certificate matching the delivery vehicle.',
  VEHICLE_INSURANCE: 'Active insurance certificate for the delivery vehicle.',
  BANK_PROOF: 'Cancelled cheque or passbook page showing account holder and account number.',
  OWNER_IDENTITY: 'Government identity document of the store owner.',
  STORE_FRONT_PHOTO: 'Clear photo showing the store entrance and signboard.',
  STORE_INTERIOR_PHOTO: 'Clear photo showing the operating and packing area.',
  BUSINESS_REGISTRATION: 'Registration, trade licence or other business proof.',
  TAX_OR_LICENSE: 'GST, FSSAI or another licence when applicable.',
};

const NUMBER_TYPES = new Set([
  'IDENTITY',
  'DRIVING_LICENSE',
  'VEHICLE_REGISTRATION',
  'VEHICLE_INSURANCE',
  'OWNER_IDENTITY',
  'BUSINESS_REGISTRATION',
  'TAX_OR_LICENSE',
]);
const EXPIRY_TYPES = new Set(['DRIVING_LICENSE', 'VEHICLE_INSURANCE', 'TAX_OR_LICENSE']);

const title = (value: string) =>
  value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

export function PartnerDocumentsScreen({ navigation }: any) {
  const {
    response,
    uploadDocument,
    removeDocument,
    isLoading,
    uploadProgress,
  } = usePartnerOnboardingStore();
  const application = response?.application;
  const requirements = response?.requirements;
  const documents = response?.documents || [];
  const allowed = requirements?.allowedDocuments || [];
  const required = requirements?.requiredDocuments || [];
  const [type, setType] = useState(allowed[0] || 'IDENTITY');
  const [documentNumber, setDocumentNumber] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [selectedFile, setSelectedFile] = useState<PartnerPickedDocument | null>(null);

  const editable = editableApplication(application?.status);
  const missing = useMemo(
    () => required.filter((item) => !requirements?.completedRequired?.includes(item)),
    [required, requirements?.completedRequired],
  );

  const selectType = (nextType: string) => {
    setType(nextType);
    setSelectedFile(null);
    setDocumentNumber('');
    setExpiresAt('');
  };

  const choose = async (source: 'CAMERA' | 'DOCUMENT') => {
    try {
      const file =
        source === 'CAMERA'
          ? await PartnerDocumentPicker.captureImage()
          : await PartnerDocumentPicker.pickDocument();
      if (file.size > 10 * 1024 * 1024) {
        throw new Error('Document exceeds the 10 MB limit');
      }
      if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)) {
        throw new Error('Choose a JPG, PNG, WebP or PDF document');
      }
      setSelectedFile(file);
    } catch (error: any) {
      if (error?.code === 'DOCUMENT_PICKER_CANCELLED') return;
      Alert.alert('Document could not be selected', error.message || 'Try again.');
    }
  };

  const upload = async () => {
    if (!selectedFile) {
      Alert.alert('Choose a document', 'Take a clear photo or choose an image/PDF first.');
      return;
    }
    try {
      await uploadDocument({
        type,
        uri: selectedFile.uri,
        filename: selectedFile.name,
        mimeType: selectedFile.type,
        fileSize: selectedFile.size,
        documentNumber: documentNumber.trim() || undefined,
        expiresAt: expiresAt.trim() || undefined,
      });
      setSelectedFile(null);
      setDocumentNumber('');
      setExpiresAt('');
      Alert.alert('Upload complete', `${title(type)} is ready for AAGAM review.`);
    } catch (error: any) {
      Alert.alert('Upload failed', error.message || 'Check your network and try again.');
    }
  };

  const remove = (documentId: string, documentType: string) => {
    Alert.alert('Remove document?', `${title(documentType)} will need to be uploaded again.`, [
      { text: 'Keep', style: 'cancel' },
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
    ]);
  };

  return (
    <OnboardingShell
      title="Documents"
      subtitle="Upload each requirement separately. Clear photos are usually faster to review than screenshots."
      onBack={() => navigation.goBack()}
    >
      <Section title="Application progress">
        <ProgressBar value={requirements?.completionPercent || 0} />
        <Text style={missing.length ? styles.missing : styles.complete}>
          {missing.length
            ? `${missing.length} required document${missing.length === 1 ? '' : 's'} remaining`
            : 'All required documents are uploaded.'}
        </Text>
      </Section>

      <Section title="Required documents" subtitle="Tap a card to upload or replace that document.">
        <View style={styles.requirementList}>
          {allowed.map((item) => {
            const document = documents.find((entry) => entry.type === item);
            const isRequired = required.includes(item);
            return (
              <TouchableOpacity
                key={item}
                onPress={() => selectType(item)}
                style={[styles.requirementCard, type === item && styles.requirementCardActive]}
              >
                <View style={styles.requirementIcon}>
                  {document ? (
                    <CheckCircle2 size={21} color={palette.green} />
                  ) : (
                    <FilePlus2 size={21} color={palette.teal} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.requirementTitleRow}>
                    <Text style={styles.requirementTitle}>{title(item)}</Text>
                    <Text style={isRequired ? styles.required : styles.optional}>
                      {isRequired ? 'Required' : 'Optional'}
                    </Text>
                  </View>
                  <Text style={styles.requirementHelp}>{DOCUMENT_HELP[item] || 'Upload a clear supporting document.'}</Text>
                  {document ? (
                    <View style={styles.uploadedRow}>
                      <StatusPill status={document.status} />
                      <Text style={styles.uploadedName} numberOfLines={1}>{document.originalFilename}</Text>
                    </View>
                  ) : (
                    <Text style={styles.notUploaded}>Not uploaded</Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </Section>

      {editable ? (
        <Section
          title={`Upload ${title(type)}`}
          subtitle={DOCUMENT_HELP[type] || 'Choose a clear image or PDF.'}
        >
          <View style={styles.sourceRow}>
            <TouchableOpacity style={styles.sourceButton} onPress={() => choose('CAMERA')}>
              <Camera size={22} color={palette.teal} />
              <Text style={styles.sourceTitle}>Take photo</Text>
              <Text style={styles.sourceSubtitle}>Use camera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sourceButton} onPress={() => choose('DOCUMENT')}>
              <FolderOpen size={22} color={palette.teal} />
              <Text style={styles.sourceTitle}>Choose file</Text>
              <Text style={styles.sourceSubtitle}>Image or PDF</Text>
            </TouchableOpacity>
          </View>

          {selectedFile ? (
            <View style={styles.selected}>
              {selectedFile.type.startsWith('image/') ? (
                <Image source={{ uri: selectedFile.uri }} style={styles.preview} />
              ) : (
                <View style={styles.pdfPreview}><FileCheck2 size={26} color={palette.teal} /></View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.selectedName} numberOfLines={2}>{selectedFile.name}</Text>
                <Text style={styles.selectedMeta}>
                  {Math.max(1, Math.ceil(selectedFile.size / 1024))} KB · {selectedFile.type}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedFile(null)} style={styles.clearButton}>
                <RefreshCw size={16} color={palette.muted} />
              </TouchableOpacity>
            </View>
          ) : null}

          {NUMBER_TYPES.has(type) ? (
            <FormField
              label="Document number"
              value={documentNumber}
              onChangeText={setDocumentNumber}
              placeholder="Optional; only the last four digits are retained"
              secureTextEntry
            />
          ) : null}
          {EXPIRY_TYPES.has(type) ? (
            <FormField
              label="Expiry date"
              value={expiresAt}
              onChangeText={setExpiresAt}
              placeholder="YYYY-MM-DD"
            />
          ) : null}
          {uploadProgress !== null ? (
            <View style={styles.uploadProgress}>
              <ProgressBar value={uploadProgress} />
              <Text style={styles.uploadProgressText}>Uploading {uploadProgress}%</Text>
            </View>
          ) : null}
          <PrimaryButton
            label={documents.some((entry) => entry.type === type) ? 'Replace document' : 'Upload document'}
            onPress={upload}
            loading={isLoading}
            disabled={!selectedFile}
          />
        </Section>
      ) : null}

      {documents.length ? (
        <Section title="Uploaded documents">
          {documents.map((document) => (
            <View key={document.id} style={styles.documentCard}>
              <FileCheck2 size={21} color={palette.teal} />
              <View style={{ flex: 1 }}>
                <Text style={styles.documentType}>{title(document.type)}</Text>
                <Text style={styles.documentName}>{document.originalFilename}</Text>
                {document.reviewNote ? <Text style={styles.reviewNote}>{document.reviewNote}</Text> : null}
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
          ))}
        </Section>
      ) : null}

      <PrimaryButton
        label={missing.length ? 'Save and review progress' : 'Review and submit application'}
        onPress={() => navigation.navigate('ApplicationStatus')}
        secondary={missing.length > 0}
      />
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  missing: { color: palette.amber, fontSize: 12, fontWeight: '800' },
  complete: { color: palette.green, fontSize: 12, fontWeight: '800' },
  requirementList: { gap: 10 },
  requirementCard: { flexDirection: 'row', gap: 12, borderRadius: 18, borderWidth: 1, borderColor: '#E2E8F0', padding: 14, backgroundColor: '#FFFFFF' },
  requirementCardActive: { borderColor: '#2DD4BF', backgroundColor: '#F0FDFA' },
  requirementIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#ECFEFF', alignItems: 'center', justifyContent: 'center' },
  requirementTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  requirementTitle: { color: palette.ink, fontSize: 14, fontWeight: '900', flex: 1 },
  required: { color: palette.red, fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },
  optional: { color: palette.muted, fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },
  requirementHelp: { color: palette.muted, fontSize: 11, lineHeight: 17, marginTop: 4 },
  uploadedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 9 },
  uploadedName: { color: '#475569', fontSize: 10, fontWeight: '700', flex: 1 },
  notUploaded: { color: palette.amber, fontSize: 10, fontWeight: '900', marginTop: 8 },
  sourceRow: { flexDirection: 'row', gap: 10 },
  sourceButton: { flex: 1, minHeight: 112, borderRadius: 18, borderWidth: 1, borderColor: '#99F6E4', backgroundColor: '#F0FDFA', alignItems: 'center', justifyContent: 'center', padding: 12 },
  sourceTitle: { color: palette.ink, fontSize: 13, fontWeight: '900', marginTop: 8 },
  sourceSubtitle: { color: palette.muted, fontSize: 10, fontWeight: '700', marginTop: 3 },
  selected: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: '#F8FAFC', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', padding: 11 },
  preview: { width: 58, height: 58, borderRadius: 12, backgroundColor: '#E2E8F0' },
  pdfPreview: { width: 58, height: 58, borderRadius: 12, backgroundColor: '#ECFEFF', alignItems: 'center', justifyContent: 'center' },
  selectedName: { color: palette.ink, fontSize: 12, fontWeight: '800' },
  selectedMeta: { color: palette.muted, fontSize: 10, marginTop: 4 },
  clearButton: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
  uploadProgress: { gap: 6 },
  uploadProgressText: { color: palette.teal, fontSize: 11, fontWeight: '800', textAlign: 'center' },
  documentCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 17, borderWidth: 1, borderColor: '#E2E8F0', padding: 14 },
  documentType: { color: palette.ink, fontSize: 13, fontWeight: '900' },
  documentName: { color: palette.muted, fontSize: 11, marginTop: 3 },
  reviewNote: { color: palette.red, fontSize: 11, lineHeight: 16, marginTop: 7 },
  documentActions: { alignItems: 'flex-end', gap: 8 },
  deleteButton: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' },
});
