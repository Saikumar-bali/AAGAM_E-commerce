import { ConfigService } from '@nestjs/config';
import { CopyObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { UploadService } from './upload.service';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://signed.example/private-document'),
}));

function serviceWithMockStorage() {
  const service = new UploadService({ get: jest.fn() } as unknown as ConfigService);
  const send = jest.fn().mockResolvedValue({});
  (service as any).evidenceClient = { send };
  (service as any).evidenceBucketName = 'private-partner-documents';
  return { service, send };
}

const file = {
  // Keep the fixture representative of a real PDF now that evidence uploads
  // validate file signatures instead of trusting Multer's declared MIME type.
  buffer: Buffer.from('%PDF-1.7\nprivate-evidence\n%%EOF'),
  mimetype: 'application/pdf',
  originalname: 'identity.pdf',
} as Express.Multer.File;

describe('private partner evidence storage', () => {
  it('stores a Rider application document under its application and document type', async () => {
    const { service, send } = serviceWithMockStorage();

    const result = await service.uploadEvidence(file, {
      scope: 'partner-applications/riders',
      ownerId: 'Application ABC',
      documentType: 'DRIVING_LICENSE',
    });

    expect(result.storageKey).toMatch(
      /^partner-applications\/riders\/application-abc\/driving_license\/[a-f0-9-]+\.pdf$/,
    );
    const command = send.mock.calls[0][0] as PutObjectCommand;
    expect(command.input.Bucket).toBe('private-partner-documents');
    expect(command.input.Key).toBe(result.storageKey);
    expect(command.input.ContentType).toBe('application/pdf');
    expect(command.input.Metadata).toEqual(
      expect.objectContaining({
        ownerId: 'Application ABC',
        ownerScope: 'partner-applications/riders',
        documentType: 'DRIVING_LICENSE',
      }),
    );
  });

  it('keeps legacy partner uploads inside the application prefix instead of a public folder', async () => {
    const { service } = serviceWithMockStorage();
    const result = await service.uploadEvidence(file, 'partner-App-123');
    expect(result.storageKey).toMatch(
      /^partner-applications\/app-123\/documents\/[a-f0-9-]+\.pdf$/,
    );
  });

  it('promotes approved evidence into the final Rider folder with a safely encoded copy source', async () => {
    const { service, send } = serviceWithMockStorage();

    const target = await service.promoteEvidence(
      'partner-applications/riders/app 123/driving_license/source file.pdf',
      { scope: 'riders', ownerId: 'Rider 99', documentType: 'DRIVING_LICENSE' },
    );

    expect(target).toMatch(/^riders\/rider-99\/driving_license\/[a-f0-9-]+\.pdf$/);
    const command = send.mock.calls[0][0] as CopyObjectCommand;
    expect(command.input.CopySource).toBe(
      'private-partner-documents/partner-applications/riders/app%20123/driving_license/source%20file.pdf',
    );
  });

  it('creates a five-minute attachment URL with a sanitized filename', async () => {
    const { service } = serviceWithMockStorage();

    const result = await service.signedEvidenceUrl('riders/rider-1/identity/id.pdf', {
      disposition: 'attachment',
      filename: '../Identity\nProof.pdf',
    });

    expect(result).toEqual({
      url: 'https://signed.example/private-document',
      expiresInSeconds: 300,
    });
    expect(getSignedUrl).toHaveBeenCalledTimes(1);
    const command = (getSignedUrl as jest.Mock).mock.calls[0][1] as GetObjectCommand;
    expect(command.input.ResponseContentDisposition).toBe(
      'attachment; filename=".._Identity_Proof.pdf"',
    );
  });
});
