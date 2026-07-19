import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

export type EvidenceOwner = {
  scope: 'partner-applications/riders' | 'partner-applications/stores' | 'riders' | 'stores';
  ownerId: string;
  documentType: string;
};

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private s3Client?: S3Client;
  private bucketName?: string;
  private publicUrl?: string;
  private evidenceClient?: S3Client;
  private evidenceBucketName?: string;

  constructor(private configService: ConfigService) {
    const bucketName = this.configService.get<string>('R2_BUCKET_NAME');
    const basePublicUrl = this.configService.get<string>('R2_PUBLIC_URL');
    const accessKeyId = this.configService.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('R2_SECRET_ACCESS_KEY');
    const endpoint = this.configService.get<string>('R2_ENDPOINT');

    if (!bucketName || !basePublicUrl || !accessKeyId || !secretAccessKey || !endpoint) {
      this.logger.warn('R2 upload storage is not configured; image uploads will be disabled.');
    } else {
      this.bucketName = bucketName;
      this.publicUrl = basePublicUrl.replace(/\/$/, '');
      this.s3Client = new S3Client({
        region: 'auto',
        endpoint,
        forcePathStyle: true,
        credentials: { accessKeyId, secretAccessKey },
      });
    }

    const evidenceBucket = this.configService.get<string>('R2_EVIDENCE_BUCKET_NAME');
    if (evidenceBucket && accessKeyId && secretAccessKey && endpoint) {
      this.evidenceBucketName = evidenceBucket;
      this.evidenceClient = new S3Client({
        region: 'auto',
        endpoint,
        forcePathStyle: true,
        credentials: { accessKeyId, secretAccessKey },
      });
      this.logger.log(`Private partner evidence storage initialized for bucket ${evidenceBucket}`);
    } else {
      this.logger.warn('Private Rider evidence storage is not configured; evidence uploads will be disabled.');
    }
  }

  async uploadImage(buffer: Buffer, originalFilename: string): Promise<{ publicUrl: string }> {
    if (!this.s3Client || !this.bucketName || !this.publicUrl) {
      throw new Error('Image upload storage is not configured');
    }
    const ext = originalFilename.split('.').pop() || 'jpg';
    const key = `products/${uuidv4()}.${ext}`;
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: this.getContentType(ext),
      }),
    );
    return { publicUrl: `${this.publicUrl}/${key}` };
  }

  async uploadImages(files: Express.Multer.File[]) {
    const images = await Promise.all(
      files.map((file) => this.uploadImage(file.buffer, file.originalname)),
    );
    return { publicUrls: images.map((image) => image.publicUrl), images };
  }

  async uploadEvidence(
    file: Express.Multer.File,
    owner: string | EvidenceOwner,
  ): Promise<{ storageKey: string }> {
    this.requireEvidenceStorage();
    const extension = this.evidenceExtension(file.mimetype);
    const storageKey =
      typeof owner === 'string'
        ? this.legacyEvidenceKey(owner, extension)
        : `${owner.scope}/${this.segment(owner.ownerId)}/${this.segment(owner.documentType)}/${uuidv4()}.${extension}`;
    const metadata =
      typeof owner === 'string'
        ? { ownerReference: owner.slice(0, 120) }
        : {
            ownerId: owner.ownerId,
            ownerScope: owner.scope,
            documentType: owner.documentType,
          };
    await this.evidenceClient!.send(
      new PutObjectCommand({
        Bucket: this.evidenceBucketName!,
        Key: storageKey,
        Body: file.buffer,
        ContentType: file.mimetype,
        Metadata: metadata,
      }),
    );
    return { storageKey };
  }

  async signedEvidenceUrl(
    storageKey: string,
    options?: { disposition?: 'inline' | 'attachment'; filename?: string },
  ): Promise<{ url: string; expiresInSeconds: number }> {
    this.requireEvidenceStorage();
    const expiresInSeconds = 300;
    const disposition = options?.disposition
      ? `${options.disposition}; filename="${this.safeFilename(options.filename || 'document')}"`
      : undefined;
    const url = await getSignedUrl(
      this.evidenceClient!,
      new GetObjectCommand({
        Bucket: this.evidenceBucketName!,
        Key: storageKey,
        ResponseContentDisposition: disposition,
      }),
      { expiresIn: expiresInSeconds },
    );
    return { url, expiresInSeconds };
  }

  async promoteEvidence(
    storageKey: string,
    target: EvidenceOwner,
  ): Promise<string> {
    this.requireEvidenceStorage();
    const extension = storageKey.split('.').pop()?.toLowerCase() || 'bin';
    const targetKey = `${target.scope}/${this.segment(target.ownerId)}/${this.segment(target.documentType)}/${uuidv4()}.${extension}`;
    await this.evidenceClient!.send(
      new CopyObjectCommand({
        Bucket: this.evidenceBucketName!,
        CopySource: this.copySource(storageKey),
        Key: targetKey,
        MetadataDirective: 'REPLACE',
        Metadata: {
          ownerId: target.ownerId,
          ownerScope: target.scope,
          documentType: target.documentType,
          promotedFrom: storageKey.slice(0, 900),
        },
      }),
    );
    return targetKey;
  }

  async deleteEvidence(storageKey?: string | null) {
    if (!storageKey || !this.evidenceClient || !this.evidenceBucketName) return;
    await this.evidenceClient.send(
      new DeleteObjectCommand({ Bucket: this.evidenceBucketName, Key: storageKey }),
    );
  }

  async deleteEvidenceMany(storageKeys: Array<string | null | undefined>) {
    for (const key of [...new Set(storageKeys.filter((value): value is string => Boolean(value)))]) {
      try {
        await this.deleteEvidence(key);
      } catch (error) {
        this.logger.error(`Private evidence cleanup failed for ${key}`, error as any);
      }
    }
  }

  private legacyEvidenceKey(owner: string, extension: string) {
    const partnerApplication = /^partner-(.+)$/i.exec(owner.trim());
    if (partnerApplication) {
      return `partner-applications/${this.segment(partnerApplication[1])}/documents/${uuidv4()}.${extension}`;
    }
    return `evidence/${this.segment(owner)}/${uuidv4()}.${extension}`;
  }

  private copySource(storageKey: string) {
    const encodedKey = storageKey
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    return `${this.evidenceBucketName!}/${encodedKey}`;
  }

  private requireEvidenceStorage() {
    if (!this.evidenceClient || !this.evidenceBucketName) {
      throw new Error('Private evidence storage is not configured');
    }
  }

  private evidenceExtension(mimeType: string) {
    const extensionByType: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'application/pdf': 'pdf',
    };
    const extension = extensionByType[mimeType];
    if (!extension) throw new Error('Unsupported evidence type');
    return extension;
  }

  private segment(value: string) {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120) || 'unknown';
  }

  private safeFilename(value: string) {
    return value.replace(/[\r\n"\\/]/g, '_').slice(0, 180) || 'document';
  }

  private getContentType(ext: string): string {
    const types: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      gif: 'image/gif',
      pdf: 'application/pdf',
    };
    return types[ext.toLowerCase()] || 'image/jpeg';
  }
}
