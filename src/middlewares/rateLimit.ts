import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { errorResponse } from '../utils/response';

// Simple in-process fixed-window per-IP limiter for public/unauthenticated
// write endpoints — joinPublicWaitlist, createReservation (guest path), and
// submitInvitationRsvp had zero throttling, so a scripted loop could flood
// WaitlistEntry/Reservation/Guest rows and, via this session's new
// confirmation-SMS triggers, spam the paid Netgsm/WhatsApp account.
//
// In-process rather than a new dependency, matching this app's existing
// single-instance patterns (priceUpdater, the shift-publish setTimeout) —
// PRODUCTION_ROADMAP.md already documents that the backend must run as a
// single PM2 instance for exactly that reason. If the app ever scales to
// multiple instances, swap the Map below for a shared store (Redis) rather
// than assuming this still works.
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Periodic sweep so IPs that stop sending traffic don't sit in memory forever.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 5 * 60 * 1000).unref();

const clientIp = (req: Request): string =>
  ((req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || 'unknown').trim();

// Some of the gated routes (e.g. POST /api/reservations) are shared by staff
// and public guests on the same path — staff traffic (a valid Bearer token)
// is never throttled here.
const isStaffRequest = (req: Request): boolean => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  try {
    verifyToken(authHeader.split(' ')[1]);
    return true;
  } catch {
    return false;
  }
};

export const publicRateLimit = (opts: { windowMs: number; max: number; keyPrefix: string }) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (isStaffRequest(req)) return next();

    const key = `${opts.keyPrefix}:${clientIp(req)}`;
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
      return next();
    }
    if (bucket.count >= opts.max) {
      return errorResponse(res, 'errors.validation_error', 429, { message: 'Too many requests — please try again shortly.' });
    }
    bucket.count += 1;
    next();
  };
};

// Route-wiring helper: no-ops in the test environment. The integration suite
// runs with `fileParallelism: false` (shared Postgres DB), so every test file
// shares one Node process and one client IP — many files legitimately make
// well over `max` unauthenticated requests to the same route across a single
// run, which would otherwise start failing unrelated tests with 429s. The
// limiter's own logic (window expiry, the count cap, the staff bypass) is
// covered directly against `publicRateLimit` in tests/api/public-rate-limit.test.ts.
export const rateLimitOrNoop = (opts: { windowMs: number; max: number; keyPrefix: string }) =>
  process.env.NODE_ENV === 'test'
    ? (_req: Request, _res: Response, next: NextFunction) => next()
    : publicRateLimit(opts);
