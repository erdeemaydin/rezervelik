import multer from 'multer';

// Security-audit finding: this used to write straight to disk with
// diskStorage, choosing the stored filename's extension from the
// attacker-controlled `originalname` and only pre-filtering on the equally
// attacker-controlled `mimetype` header — neither is verified against the
// actual file bytes. Combined with the route previously having no auth at
// all, that was an unauthenticated arbitrary-extension upload, publicly
// served from the app's own trusted origin (see uploadController.ts, which
// now sniffs the real file type from content and picks the extension
// itself). Buffering in memory here — rather than diskStorage — is what
// makes that content-sniffing possible before anything touches disk.
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Not an image! Please upload an image.'));
  }
};

export const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
  }
});
