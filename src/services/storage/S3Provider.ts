import { S3Client, PutObjectCommand, ObjectCannedACL } from '@aws-sdk/client-s3';
import path from 'path';
import crypto from 'crypto';
import { StorageProvider, UploadFileInput, UploadFileResult } from './types';

// Talks to any S3-compatible object store — real AWS S3, Cloudflare R2,
// Backblaze B2, MinIO, etc. — via the AWS SDK's S3 client pointed at a custom
// endpoint. We deliberately don't use a vendor SDK: every one of those
// providers implements the same S3 PutObject API, so one client covers all of
// them (set S3_ENDPOINT for R2/B2/MinIO, leave it unset for real AWS S3).
export class S3StorageProvider implements StorageProvider {
  readonly name = 'S3';
  private client: S3Client;
  private bucket: string;
  private publicUrlBase: string;

  constructor() {
    const bucket = process.env.S3_BUCKET;
    const publicUrlBase = process.env.S3_PUBLIC_URL_BASE;

    if (!bucket) {
      throw new Error('S3_BUCKET is required to use the S3 storage provider (see .env.example).');
    }
    if (!publicUrlBase) {
      throw new Error('S3_PUBLIC_URL_BASE is required to use the S3 storage provider (see .env.example).');
    }

    this.bucket = bucket;
    this.publicUrlBase = publicUrlBase.replace(/\/+$/, '');

    const hasExplicitCreds = !!process.env.S3_ACCESS_KEY_ID && !!process.env.S3_SECRET_ACCESS_KEY;

    this.client = new S3Client({
      region: process.env.S3_REGION || 'auto',
      // Omit for real AWS S3 (it resolves the endpoint from the region);
      // required for R2/B2/MinIO, which are reached through a custom endpoint.
      endpoint: process.env.S3_ENDPOINT || undefined,
      // R2/MinIO/most non-AWS S3-compatible stores need path-style addressing
      // (https://endpoint/bucket/key) instead of AWS's virtual-hosted style.
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true' ? true : undefined,
      credentials: hasExplicitCreds
        ? {
            accessKeyId: process.env.S3_ACCESS_KEY_ID as string,
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY as string,
          }
        : undefined, // falls back to the default AWS credential chain (IAM role, etc.)
    });
  }

  async uploadFile(input: UploadFileInput): Promise<UploadFileResult> {
    const ext = path.extname(input.originalName);
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
    const key = `uploads/${input.restaurantId}/${uniqueSuffix}${ext}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: input.buffer,
        ContentType: input.mimeType,
        // Optional: some setups (bucket fronted by its own CDN, R2, B2 native
        // buckets) don't use or support object ACLs at all, so this is opt-in.
        ACL: (process.env.S3_ACL as ObjectCannedACL) || undefined,
      })
    );

    return { key, url: `${this.publicUrlBase}/${key}` };
  }
}
