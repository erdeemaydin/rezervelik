import { Router } from 'express';
import * as authController from '../controllers/authController';
import { authMiddleware } from '../middlewares/auth';

const router = Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.post('/login/otp', authController.loginVerifyOtp);
router.post('/verify-password', authMiddleware, authController.verifyPassword);
router.post('/setup', authController.completeSetup);
router.get('/reset-password/:token', authController.validateResetToken);
router.post('/reset-password', authController.resetPassword);

// Authenticated self-service account routes (universal to all roles)
router.get('/me', authMiddleware, authController.getMe);
router.post('/change-password', authMiddleware, authController.changePassword);
router.post('/2fa/setup', authMiddleware, authController.setupTwoFactor);
router.post('/2fa/confirm', authMiddleware, authController.confirmTwoFactor);

export default router;
