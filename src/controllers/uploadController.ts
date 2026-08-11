import { Request, Response } from 'express';
import { successResponse, errorResponse } from '../utils/response';
import { getStorageProvider } from '../services/storage';

// Magic-byte signatures for the image formats we accept. Sniffing the actual
// bytes — rather than trusting the client-supplied mimetype/filename — is
// what stops an attacker from uploading, say, an .html/.svg/.js file with a
// spoofed `Content-Type: image/png` and having it stored (and then served,
// same-origin, by express.static) as whatever extension they chose.
const SIGNATURES: { ext: string; matches: (b: Buffer) => boolean }[] = [
  { ext: 'png', matches: (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'jpg', matches: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'gif', matches: (b) => b.length >= 6 && (b.subarray(0, 6).toString('ascii') === 'GIF87a' || b.subarray(0, 6).toString('ascii') === 'GIF89a') },
  { ext: 'webp', matches: (b) => b.length >= 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
];

const sniffImageExtension = (buffer: Buffer): string | null => SIGNATURES.find((s) => s.matches(buffer))?.ext ?? null;

export const uploadImage = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'No file uploaded' });
    }

    const ext = sniffImageExtension(req.file.buffer);
    if (!ext) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'File content is not a recognized image format' });
    }

    // tenantMiddleware (mounted ahead of this route in app.ts) always sets
    // this, but guard it explicitly so a stored file can never end up
    // un-namespaced if that invariant is ever relaxed, and so TypeScript knows
    // it's a plain string below.
    if (!req.restaurantId) {
      return errorResponse(res, 'errors.unauthorized', 400);
    }

    const provider = getStorageProvider();
    const { url } = await provider.uploadFile({
      buffer: req.file.buffer,
      // Derived from the sniffed magic bytes, NOT the client-supplied
      // originalname/mimetype — storage providers use these to pick the
      // stored file's extension/content-type, so trusting client input here
      // would reopen the same spoofed-file-extension hole the sniffing above
      // exists to close (e.g. an .html/.svg upload stored and served,
      // same-origin, as whatever extension the client claimed).
      originalName: `upload.${ext}`,
      mimeType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
      restaurantId: req.restaurantId,
      requestBaseUrl: `${req.protocol}://${req.get('host')}`,
    });

    // Same response shape as before (`{ data: { url } }`) — dashboard callers
    // (menu item/category image uploads) just read res.data.data.url.
    return successResponse(res, { url });
  } catch (error) {
    console.error('Upload error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
