import multer from 'multer';

// Files are buffered in memory, not written to local disk here — the
// controller streams the buffer straight to object storage (S3-compatible, or
// a local-disk fallback) via src/services/storage. See that module for where
// the file actually ends up.
const storage = multer.memoryStorage();

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Not an image! Please upload an image.'));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
  }
});
