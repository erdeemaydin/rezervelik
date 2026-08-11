import { StorageProvider } from './types';
import { S3StorageProvider } from './S3Provider';
import { LocalDiskStorageProvider } from './LocalDiskProvider';

export * from './types';
export { S3StorageProvider } from './S3Provider';
export { LocalDiskStorageProvider } from './LocalDiskProvider';

let cached: StorageProvider | null = null;

// Single place that decides where uploaded files land. Set STORAGE_PROVIDER=s3
// (or simply set S3_BUCKET) to send uploads to S3-compatible object storage —
// AWS S3, Cloudflare R2, Backblaze B2, MinIO, etc. Leaving both unset falls
// back to local disk under public/uploads, which is fine for local dev but NOT
// for production (see LocalDiskProvider's doc comment). See .env.example for
// the full list of S3_* vars this reads.
export function getStorageProvider(): StorageProvider {
  if (cached) return cached;
  const explicit = (process.env.STORAGE_PROVIDER || '').toLowerCase();
  const useS3 = explicit === 's3' || (!explicit && !!process.env.S3_BUCKET);
  cached = useS3 ? new S3StorageProvider() : new LocalDiskStorageProvider();
  return cached;
}

// Test-only escape hatch: clears the cached singleton so tests can swap
// STORAGE_PROVIDER/S3_* env vars between cases and get a fresh provider.
export function __resetStorageProviderForTests() {
  cached = null;
}
