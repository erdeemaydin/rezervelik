import { Router } from 'express';
import * as authController from '../controllers/authController';
import { authMiddleware } from '../middlewares/auth';
import { rateLimitOrNoop } from '../middlewares/rateLimit';

const router = Router();

// Security-audit finding: /login and /login/otp had no throttling at all, so
// a password (or 6-digit OTP) could be brute-forced at unlimited speed from
// a single IP. Per-IP fixed window, same pattern as the other public write
// endpoints (rateLimit.ts) — tighter than those (15 min, not 60s) since a
// credential-guessing attempt is worth far less budget than a real guest
// action like joining a waitlist.
const loginRateLimit = (keyPrefix: string) => rateLimitOrNoop({ windowMs: 15 * 60_000, max: 10, keyPrefix });

router.post('/register', authController.register);
router.post('/login', loginRateLimit('login'), authController.login);
router.post('/logout', authController.logout);
router.post('/login/otp', loginRateLimit('login-otp'), authController.loginVerifyOtp);
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
