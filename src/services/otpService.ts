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
const MAX_ATTEMPTS = 5; // per individual challenge row
const RESEND_COOLDOWN_MS = 60_000; // 60s between two requests for the same phone
const MAX_REQUESTS_PER_WINDOW = 5; // per-phone cap, independent of the per-IP limiter
const PER_PHONE_WINDOW_MS = 15 * 60_000;
// Cumulative wrong-code guesses allowed across ALL challenges for a phone
// within PER_PHONE_WINDOW_MS — not just the single most-recent row. Without
// this, a resend (gated only by the 60s cooldown / 5-requests cap above)
// mints a fresh attempts=0 row, so an attacker could get MAX_ATTEMPTS fresh
// guesses per resend — up to 5x the per-request cap — before hitting
// MAX_REQUESTS_PER_WINDOW. This cap is checked independently of, and in
// addition to, the per-row MAX_ATTEMPTS check below.
const MAX_ATTEMPTS_PER_WINDOW = 5;

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

/**
 * Validates the most recent unconsumed challenge for this phone WITHOUT
 * consuming it — returns the challenge id on success. Throws AppError on any
 * failure (not found / expired / too many attempts / wrong code), identically
 * regardless of whether a Customer already exists for this phone: callers
 * must run this before branching on any phone-specific state (e.g. "is this
 * a new customer, so we need a name"), otherwise a caller that checks
 * customer-existence before calling this creates a phone-enumeration oracle
 * — an attacker who doesn't have a valid code could tell registered phones
 * apart from unregistered ones purely from which error comes back, without
 * ever proving they received the SMS. Split from consumeOtp() below
 * specifically so a caller can validate the code, decide it needs more
 * information from the user (see customerOrderController.verifyOtp), and let
 * the user resubmit the *same* code again rather than burning it. */
export async function checkOtp(params: VerifyOtpParams): Promise<{ challengeId: string }> {
  const { restaurantId, phone, code } = params;

  const recentWindowStart = new Date(Date.now() - PER_PHONE_WINDOW_MS);
  const windowAttempts = await prisma.otpChallenge.aggregate({
    where: { restaurantId, phone, createdAt: { gte: recentWindowStart } },
    _sum: { attempts: true },
  });
  if ((windowAttempts._sum.attempts || 0) >= MAX_ATTEMPTS_PER_WINDOW) {
    throw new AppError('errors.otp_too_many_attempts', 429);
  }

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

  return { challengeId: challenge.id };
}

/** Marks a challenge validated by checkOtp() as consumed — call once the
 *  caller has decided it will actually act on the verified phone (not just
 *  ask the user for more information). */
export async function consumeOtp(challengeId: string): Promise<void> {
  await prisma.otpChallenge.update({
    where: { id: challengeId },
    data: { consumedAt: new Date() },
  });
}

/** Convenience wrapper: validates and immediately consumes in one call. Use
 *  checkOtp()/consumeOtp() separately instead when the caller needs to make
 *  a decision (e.g. "do I have enough info to proceed") between validating
 *  the code and committing to having used it. */
export async function verifyOtp(params: VerifyOtpParams): Promise<void> {
  const { challengeId } = await checkOtp(params);
  await consumeOtp(challengeId);
}
