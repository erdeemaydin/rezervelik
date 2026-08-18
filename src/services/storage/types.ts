// Provider-agnostic object-storage abstraction for uploaded files (menu photos,
// logos, ...). Everything that needs to persist an uploaded file goes through
// the `StorageProvider` interface, so swapping where files land (local disk in
// dev → S3-compatible bucket in production, or between S3/R2/B2) means writing
// one adapter and changing an env var — no controller/route changes. See
// src/services/storage/index.ts for the selection logic.

export interface UploadFileInput {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  /** Tenant the file belongs to — used to namespace the storage key so one
   *  tenant's uploads can never collide with or be confused for another's. */
  restaurantId: string;
  /** Origin of the incoming request (`req.protocol://req.get('host')`), used only
   *  by providers that need to build an absolute URL from the request itself
   *  (the local-disk fallback). S3-backed providers ignore this and build the
   *  URL from S3_PUBLIC_URL_BASE instead. */
  requestBaseUrl?: string;
}

export interface UploadFileResult {
  /** Public URL the frontend can use directly as an <img src>. */
  url: string;
  /** Storage key/relative path the file was written under, for debugging or
   *  future deletion support. */
  key: string;
}

export interface StorageProvider {
  readonly name: string;
  uploadFile(input: UploadFileInput): Promise<UploadFileResult>;
}
