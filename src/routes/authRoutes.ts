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

// Same brute-force/DoS shape as login, but none of these three have a
// legitimate "staff acting within their own tenant" case to exempt — unlike
// e.g. POST /api/reservations (shared by guests and staff on one path), so
// `exemptAuthenticated: false` throttles purely by IP:
//  - /register: unauthenticated; bcrypt.hash is expensive and the
//    errors.email_in_use response leaks account existence, so it's both a
//    CPU-exhaustion DoS vector and an enumeration oracle if left unthrottled.
//  - /2fa/confirm: guesses a 6-digit TOTP against an *already-authenticated*
//    session — the attacker holds a valid token by construction, so the
//    default exemptAuthenticated behavior (which treats any valid token on an
//    unscoped route as staff-exempt, per rateLimit.ts) would bypass the
//    throttle entirely for exactly the caller it's meant to slow down. Same
//    class of gap as the setup-super-admin fix below, just on a sibling route.
//  - /verify-password: re-checks the caller's own password before sensitive
//    actions (PasswordConfirmDialog) — same reasoning as /2fa/confirm.
const sensitiveActionRateLimit = (keyPrefix: string, max = 10) =>
  rateLimitOrNoop({ windowMs: 15 * 60_000, max, keyPrefix, exemptAuthenticated: false });

router.post('/register', sensitiveActionRateLimit('register', 20), authController.register);
router.post('/login', loginRateLimit('login'), authController.login);
router.post('/logout', authController.logout);
router.post('/login/otp', loginRateLimit('login-otp'), authController.loginVerifyOtp);
router.post('/verify-password', authMiddleware, sensitiveActionRateLimit('verify-password'), authController.verifyPassword);
router.post('/setup', authController.completeSetup);
router.get('/reset-password/:token', authController.validateResetToken);
router.post('/reset-password', authController.resetPassword);

// Authenticated self-service account routes (universal to all roles)
router.get('/me', authMiddleware, authController.getMe);
router.post('/change-password', authMiddleware, authController.changePassword);
router.post('/2fa/setup', authMiddleware, authController.setupTwoFactor);
router.post('/2fa/confirm', authMiddleware, sensitiveActionRateLimit('2fa-confirm'), authController.confirmTwoFactor);

export default router;
