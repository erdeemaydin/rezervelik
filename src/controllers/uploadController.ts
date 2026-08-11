import { Request, Response } from 'express';
import { successResponse, errorResponse } from '../utils/response';
import { getStorageProvider } from '../services/storage';

export const uploadImage = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return errorResponse(res, 'No file uploaded', 400);
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
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
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
