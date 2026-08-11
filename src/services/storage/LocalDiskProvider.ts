import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { StorageProvider, UploadFileInput, UploadFileResult } from './types';

const uploadRoot = path.join(process.cwd(), 'public', 'uploads');

// Fallback used when no S3_* env vars are configured, e.g. a local dev sandbox
// with no cloud credentials (this repo's own dev environment included). Writes
// to the local `public/uploads/<restaurantId>/...` directory (served statically
// by src/app.ts) and returns an absolute URL built from the incoming request's
// own host, or API_PUBLIC_URL if set, so it resolves correctly regardless of
// which origin the frontend happens to be served from.
//
// NOT suitable for production: most hosts (containers, PaaS, serverless, or
// anything with more than one instance) don't persist or share local disk
// across redeploys/restarts/instances, so files written here silently
// disappear or 404 for some users. Set the S3_* vars for anything beyond local
// dev — see .env.example.
export class LocalDiskStorageProvider implements StorageProvider {
  readonly name = 'LOCAL_DISK';

  async uploadFile(input: UploadFileInput): Promise<UploadFileResult> {
    const ext = path.extname(input.originalName);
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
    const relativeKey = path.posix.join(input.restaurantId, `${uniqueSuffix}${ext}`);
    const destDir = path.join(uploadRoot, input.restaurantId);
    const destPath = path.join(uploadRoot, ...relativeKey.split('/'));

    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(destPath, input.buffer);

    const base = (process.env.API_PUBLIC_URL || input.requestBaseUrl || 'http://localhost:3000').replace(/\/+$/, '');
    return { key: relativeKey, url: `${base}/uploads/${relativeKey}` };
  }
}
