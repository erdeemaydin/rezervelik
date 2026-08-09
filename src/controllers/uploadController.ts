import { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { successResponse, errorResponse } from '../utils/response';

const uploadDir = path.join(process.cwd(), 'public', 'uploads');

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

    // Filename is entirely server-generated — never derived from the
    // client-supplied originalname or mimetype.
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;
    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(path.join(uploadDir, filename), req.file.buffer);

    return successResponse(res, { url: `/uploads/${filename}` });
  } catch (error) {
    console.error('Upload error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
