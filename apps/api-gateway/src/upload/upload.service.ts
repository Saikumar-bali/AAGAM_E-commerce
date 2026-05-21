import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private s3Client?: S3Client;
  private bucketName?: string;
  private publicUrl?: string;

  constructor(private configService: ConfigService) {
    const bucketName = this.configService.get<string>('R2_BUCKET_NAME');
    const basePublicUrl = this.configService.get<string>('R2_PUBLIC_URL');
    const accessKeyId = this.configService.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('R2_SECRET_ACCESS_KEY');
    const endpoint = this.configService.get<string>('R2_ENDPOINT');

    if (!bucketName || !basePublicUrl || !accessKeyId || !secretAccessKey || !endpoint) {
      this.logger.warn('R2 upload storage is not configured; image uploads will be disabled.');
      return;
    }

    this.bucketName = bucketName;
    this.publicUrl = basePublicUrl.replace(/\/$/, '');
    this.logger.log(`[R2 DEBUG] Initialized with: 
      - Endpoint: ${endpoint}
      - Bucket: ${this.bucketName}
      - Public Base URL: ${this.publicUrl}
      - Force Path Style: true`);

    this.s3Client = new S3Client({
      region: 'auto',
      endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  async uploadImage(buffer: Buffer, originalFilename: string): Promise<{ publicUrl: string }> {
    if (!this.s3Client || !this.bucketName || !this.publicUrl) {
      throw new Error('Image upload storage is not configured');
    }

    const ext = originalFilename.split('.').pop() || 'jpg';
    const key = `products/${uuidv4()}.${ext}`;
    const contentType = this.getContentType(ext);

    this.logger.log(`[R2 DEBUG] Starting upload:
      - Key: ${key}
      - Content-Type: ${contentType}
      - Buffer Size: ${buffer.length} bytes`);

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      });

      this.logger.log(`[R2 DEBUG] Sending PutObjectCommand to bucket: ${this.bucketName}`);
      await this.s3Client.send(command);

      const publicUrl = `${this.publicUrl}/${key}`;
      this.logger.log(`[R2 DEBUG] Upload Successful. Generated Public URL: ${publicUrl}`);

      return { publicUrl };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`R2 upload error: ${errorMessage}`, errorStack);
      throw error;
    }
  }

  private getContentType(ext: string): string {
    const types: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      gif: 'image/gif',
    };
    return types[ext.toLowerCase()] || 'image/jpeg';
  }
}
