import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  GetObjectCommand,
  S3Client,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private s3Client?: S3Client;
  private bucketName?: string;
  private publicUrl?: string;
  private evidenceClient?: S3Client;
  private evidenceBucketName?: string;

  constructor(private configService: ConfigService) {
    const bucketName = this.configService.get<string>("R2_BUCKET_NAME");
    const basePublicUrl = this.configService.get<string>("R2_PUBLIC_URL");
    const accessKeyId = this.configService.get<string>("R2_ACCESS_KEY_ID");
    const secretAccessKey = this.configService.get<string>(
      "R2_SECRET_ACCESS_KEY"
    );
    const endpoint = this.configService.get<string>("R2_ENDPOINT");

    if (
      !bucketName ||
      !basePublicUrl ||
      !accessKeyId ||
      !secretAccessKey ||
      !endpoint
    ) {
      this.logger.warn(
        "R2 upload storage is not configured; image uploads will be disabled."
      );
    } else {
      this.bucketName = bucketName;
      this.publicUrl = basePublicUrl.replace(/\/$/, "");
      this.s3Client = new S3Client({
        region: "auto",
        endpoint,
        forcePathStyle: true,
        credentials: { accessKeyId, secretAccessKey },
      });
      this.logger.log(
        `Public product image storage initialized for bucket ${this.bucketName}`
      );
    }

    const evidenceBucket = this.configService.get<string>(
      "R2_EVIDENCE_BUCKET_NAME"
    );
    if (evidenceBucket && accessKeyId && secretAccessKey && endpoint) {
      this.evidenceBucketName = evidenceBucket;
      this.evidenceClient = new S3Client({
        region: "auto",
        endpoint,
        forcePathStyle: true,
        credentials: { accessKeyId, secretAccessKey },
      });
      this.logger.log(
        `Private Rider evidence storage initialized for bucket ${evidenceBucket}`
      );
    } else {
      this.logger.warn(
        "Private Rider evidence storage is not configured; evidence uploads will be disabled."
      );
    }
  }

  async uploadImage(
    buffer: Buffer,
    originalFilename: string,
    folder: "products" | "promotions" = "products"
  ): Promise<{ publicUrl: string }> {
    if (!this.s3Client || !this.bucketName || !this.publicUrl) {
      throw new Error("Image upload storage is not configured");
    }

    const ext = originalFilename.split(".").pop() || "jpg";
    const key = `${folder}/${uuidv4()}.${ext}`;
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

      this.logger.log(
        `[R2 DEBUG] Sending PutObjectCommand to bucket: ${this.bucketName}`
      );
      await this.s3Client.send(command);

      const publicUrl = `${this.publicUrl}/${key}`;
      this.logger.log(
        `[R2 DEBUG] Upload Successful. Generated Public URL: ${publicUrl}`
      );

      return { publicUrl };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`R2 upload error: ${errorMessage}`, errorStack);
      throw error;
    }
  }

  async uploadImages(
    files: Express.Multer.File[]
  ): Promise<{ publicUrls: string[]; images: { publicUrl: string }[] }> {
    const images = await Promise.all(
      files.map((file) => this.uploadImage(file.buffer, file.originalname))
    );
    return {
      publicUrls: images.map((image) => image.publicUrl),
      images,
    };
  }

  async uploadEvidence(
    file: Express.Multer.File,
    userId: string
  ): Promise<{ storageKey: string }> {
    if (!this.evidenceClient || !this.evidenceBucketName)
      throw new Error("Private evidence storage is not configured");
    const extensionByType: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "application/pdf": "pdf",
    };
    const extension = extensionByType[file.mimetype];
    if (!extension) throw new Error("Unsupported evidence type");
    const storageKey = `evidence/${userId}/${uuidv4()}.${extension}`;
    await this.evidenceClient.send(
      new PutObjectCommand({
        Bucket: this.evidenceBucketName,
        Key: storageKey,
        Body: file.buffer,
        ContentType: file.mimetype,
        Metadata: { ownerUserId: userId },
      })
    );
    return { storageKey };
  }

  async signedEvidenceUrl(
    storageKey: string
  ): Promise<{ url: string; expiresInSeconds: number }> {
    if (!this.evidenceClient || !this.evidenceBucketName)
      throw new Error("Private evidence storage is not configured");
    const expiresInSeconds = 300;
    const url = await getSignedUrl(
      this.evidenceClient,
      new GetObjectCommand({
        Bucket: this.evidenceBucketName,
        Key: storageKey,
      }),
      { expiresIn: expiresInSeconds }
    );
    return { url, expiresInSeconds };
  }

  private getContentType(ext: string): string {
    const types: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      gif: "image/gif",
      pdf: "application/pdf",
    };
    return types[ext.toLowerCase()] || "image/jpeg";
  }
}
