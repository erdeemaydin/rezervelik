import { Router } from 'express';
import { uploadImage } from '../controllers/uploadController';
import { upload } from '../middlewares/upload';

const router = Router();

router.post('/image', upload.single('image'), uploadImage);

export default router;
