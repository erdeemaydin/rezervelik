import { Router } from 'express';
import * as authController from '../controllers/authController';
import { authMiddleware } from '../middlewares/auth';

const router = Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/verify-password', authMiddleware, authController.verifyPassword);
router.post('/setup', authController.completeSetup);

export default router;
