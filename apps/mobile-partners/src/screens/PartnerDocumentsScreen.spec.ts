import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(
  path.join(__dirname, 'PartnerDocumentsScreen.tsx'),
  'utf8',
);

describe('PartnerDocumentsScreen contracts', () => {
  it('renders the document requirements and completion progress from the onboarding response', () => {
    expect(source).toContain('requirements?.allowedDocuments || []');
    expect(source).toContain('requirements?.requiredDocuments || []');
    expect(source).toContain('requirements?.completedRequired?.includes(item)');
    expect(source).toContain('All required documents are uploaded.');
    expect(source).toContain('required document${missing.length === 1');
  });

  it('supports both camera capture and local document selection', () => {
    expect(source).toContain('PartnerDocumentPicker.captureImage()');
    expect(source).toContain('PartnerDocumentPicker.pickDocument()');
    expect(source).toContain("source === 'CAMERA'");
    expect(source).toContain("error?.code === 'DOCUMENT_PICKER_CANCELLED'");
  });

  it('blocks oversized and unsupported files before upload', () => {
    expect(source).toContain('file.size > 10 * 1024 * 1024');
    expect(source).toContain('Document exceeds the 10 MB limit');
    expect(source).toContain("'image/jpeg', 'image/png', 'image/webp', 'application/pdf'");
    expect(source).toContain('Choose a JPG, PNG, WebP or PDF document');
  });

  it('submits the selected file with document metadata', () => {
    expect(source).toContain('await uploadDocument({');
    expect(source).toContain('uri: selectedFile.uri');
    expect(source).toContain('filename: selectedFile.name');
    expect(source).toContain('mimeType: selectedFile.type');
    expect(source).toContain('fileSize: selectedFile.size');
    expect(source).toContain('documentNumber: documentNumber.trim() || undefined');
    expect(source).toContain('expiresAt: expiresAt.trim() || undefined');
  });

  it('clears sensitive form state after a successful upload', () => {
    expect(source).toContain('setSelectedFile(null)');
    expect(source).toContain("setDocumentNumber('')");
    expect(source).toContain("setExpiresAt('')");
    expect(source).toContain("Alert.alert('Upload complete'");
  });

  it('requires confirmation before deleting an uploaded document', () => {
    expect(source).toContain("Alert.alert('Remove document?'");
    expect(source).toContain("text: 'Remove'");
    expect(source).toContain("style: 'destructive'");
    expect(source).toContain('await removeDocument(documentId)');
  });

  it('continues to application review through the registered status route', () => {
    expect(source).toContain("navigation.navigate('ApplicationStatus')");
    expect(source).toContain("'Review and submit application'");
    expect(source).toContain("'Save and review progress'");
  });
});
