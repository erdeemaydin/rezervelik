import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { uploadImage } from '../controllers/uploadController';
import { upload } from '../middlewares/upload';
import { authMiddleware } from '../middlewares/auth';
import { errorResponse } from '../utils/response';

const router = Router();

// Security-audit finding: this route had no authMiddleware at all — only
// tenantMiddleware (mounted in app.ts, just requires an X-Restaurant-ID
// header) gated it, so anyone could upload files with no session. Every
// caller of this endpoint (frontend/src/app/dashboard/menus/*) is already an
// authenticated staff page; there's no legitimate unauthenticated use.
router.use(authMiddleware);

// multer's fileFilter rejection reaches here as a plain Error (not an
// AppError), which the global error handler would otherwise turn into an
// opaque 500. Surface it as the 400 it actually is.
const handleUpload = (req: Request, res: Response, next: NextFunction) => {
  upload.single('image')(req, res, (err: unknown) => {
    if (!err) return next();
    const message = err instanceof multer.MulterError ? err.message : (err as Error)?.message || 'Upload failed';
    return errorResponse(res, 'errors.validation_error', 400, { message });
  });
};

router.post('/image', handleUpload, uploadImage);

export default router;
