import crypto from 'crypto';
import prisma from '../config/prisma';
import { AppError } from '../utils/AppError';
import { sendSms } from './messaging';

// SMS-OTP for online-ordering customer identity (see OtpChallenge in
// schema.prisma and docs/packaging/online-ordering-spec.md §4). Hashed at
// rest, short expiry, attempt-capped, rate-limited per-phone (here) AND
// per-IP (the route-level `rateLimitOrNoop` middleware, same utility
// authRoutes.ts uses for login). The raw code is never logged, returned to
// the caller, or persisted anywhere — only its sha256 hash.

const OTP_LENGTH = 6;
const OTP_TTL_MS = 5 * 60_000; // 5 minutes
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60_000; // 60s between two requests for the same phone
const MAX_REQUESTS_PER_WINDOW = 5; // per-phone cap, independent of the per-IP limiter
const PER_PHONE_WINDOW_MS = 15 * 60_000;

function generateCode(): string {
  // crypto.randomInt, not Math.random — this gates account access.
  return crypto.randomInt(0, 1_000_000).toString().padStart(OTP_LENGTH, '0');
}

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export interface RequestOtpParams {
  restaurantId: string;
  phone: string;
  ip: string;
  purpose?: string;
}

export async function requestOtp(params: RequestOtpParams): Promise<{ expiresAt: Date }> {
  const { restaurantId, phone, ip } = params;
  const purpose = params.purpose || 'ORDER_LOGIN';

  const recentWindowStart = new Date(Date.now() - PER_PHONE_WINDOW_MS);
  const [mostRecent, recentCount] = await Promise.all([
    prisma.otpChallenge.findFirst({
      where: { restaurantId, phone },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    prisma.otpChallenge.count({
      where: { restaurantId, phone, createdAt: { gte: recentWindowStart } },
    }),
  ]);

  if (mostRecent && Date.now() - mostRecent.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    throw new AppError('errors.otp_resend_too_soon', 429);
  }
  if (recentCount >= MAX_REQUESTS_PER_WINDOW) {
    throw new AppError('errors.otp_rate_limited', 429);
  }

  const code = generateCode();
  const codeHash = hashCode(code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await prisma.otpChallenge.create({
    data: { restaurantId, phone, codeHash, purpose, expiresAt, ip },
  });

  // Never log/interpolate `code` anywhere except this one outbound send.
  await sendSms(phone, `Verification code: ${code}`);

  return { expiresAt };
}

export interface VerifyOtpParams {
  restaurantId: string;
  phone: string;
  code: string;
}

/** Verifies the most recent unconsumed challenge for this phone. Throws
 *  AppError on any failure (not found / expired / too many attempts / wrong
 *  code) — callers don't need to distinguish these beyond the i18n code. */
export async function verifyOtp(params: VerifyOtpParams): Promise<void> {
  const { restaurantId, phone, code } = params;

  const challenge = await prisma.otpChallenge.findFirst({
    where: { restaurantId, phone, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  if (!challenge) {
    throw new AppError('errors.otp_invalid', 400);
  }
  if (challenge.expiresAt.getTime() < Date.now()) {
    throw new AppError('errors.otp_expired', 400);
  }
  if (challenge.attempts >= MAX_ATTEMPTS) {
    throw new AppError('errors.otp_too_many_attempts', 429);
  }

  const providedHash = hashCode(code);
  if (!safeEqual(providedHash, challenge.codeHash)) {
    await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    throw new AppError('errors.otp_invalid', 400);
  }

  await prisma.otpChallenge.update({
    where: { id: challenge.id },
    data: { consumedAt: new Date() },
  });
}
