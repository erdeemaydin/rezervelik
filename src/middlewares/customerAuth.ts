import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import prisma from '../config/prisma';
import { errorResponse } from '../utils/response';
import { parseCookies } from '../utils/cookies';
import { generateCustomerToken, verifyCustomerToken } from '../utils/jwt';

declare global {
  namespace Express {
    interface Request {
      customer?: {
        id: string;
        restaurantId: string;
        phone: string;
      };
    }
  }
}

// Cookie names for the customer-facing auth path. Deliberately distinct from
// utils/authCookie.ts's TOKEN_COOKIE ('token') / ADMIN_STASH_COOKIE so a
// customer and a staff session can coexist in the same browser (e.g. a staff
// member previewing the ordering page) without clobbering each other.
export const CUSTOMER_TOKEN_COOKIE = 'customerToken';
export const CUSTOMER_DEVICE_COOKIE = 'customerDevice';

const isProd = process.env.NODE_ENV === 'production';
const sameSite = (process.env.COOKIE_SAME_SITE as 'lax' | 'none' | 'strict' | undefined) || 'lax';
const secure = process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : (isProd || sameSite === 'none');

const SESSION_COOKIE_MAX_AGE_MS = 12 * 60 * 60 * 1000; // matches CUSTOMER_JWT_EXPIRES_IN default
const TRUSTED_DEVICE_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000; // 180 days

function cookieOptions(maxAgeMs: number) {
  return { httpOnly: true, sameSite, secure, path: '/', maxAge: maxAgeMs } as const;
}

/** Hash a raw trusted-device token the same way TrustedDevice.tokenHash /
 *  User.setupTokenHash-style fields are hashed elsewhere — sha256, never the
 *  raw value at rest. Not bcrypt: this is a random 256-bit token, not a
 *  low-entropy secret, so a fast hash is fine and lets lookup be a plain
 *  unique-index equality check instead of a per-row bcrypt.compare. */
export function hashDeviceToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function setCustomerSessionCookie(res: Response, token: string) {
  res.cookie(CUSTOMER_TOKEN_COOKIE, token, cookieOptions(SESSION_COOKIE_MAX_AGE_MS));
}

export function setTrustedDeviceCookie(res: Response, rawToken: string) {
  res.cookie(CUSTOMER_DEVICE_COOKIE, rawToken, cookieOptions(TRUSTED_DEVICE_MAX_AGE_MS));
}

export function clearCustomerCookies(res: Response) {
  res.clearCookie(CUSTOMER_TOKEN_COOKIE, { path: '/' });
  res.clearCookie(CUSTOMER_DEVICE_COOKIE, { path: '/' });
}

/** Mints a brand-new trusted-device token, stores its hash, and sets the
 *  httpOnly cookie. Returns nothing — callers don't need the raw value once
 *  the cookie is set (only the hash is ever persisted). */
export async function issueTrustedDevice(res: Response, customerId: string, userAgent?: string) {
  const raw = crypto.randomBytes(32).toString('hex');
  await prisma.trustedDevice.create({
    data: { customerId, tokenHash: hashDeviceToken(raw), userAgent: userAgent || null },
  });
  setTrustedDeviceCookie(res, raw);
}

/**
 * Customer-session auth — the online-ordering counterpart to
 * src/middlewares/auth.ts's authMiddleware, but a deliberately separate code
 * path: customers are never staff `User` rows (see Customer model comment in
 * schema.prisma), and a customer token must never be usable against a staff
 * route or vice versa (see utils/jwt.ts's CustomerTokenPayload comment).
 *
 * Two ways in, tried in order:
 *   1. A short-lived customer session token (issued by POST /otp/verify),
 *      via the httpOnly cookie or an Authorization: Bearer header (same
 *      fallback pattern as authMiddleware, for non-browser callers).
 *   2. A long-lived, revocable trusted-device token (httpOnly cookie only —
 *      never accepted via header, since it's meant to be silently replayed
 *      by the browser alone) that skips the OTP step entirely on a
 *      previously-verified device.
 *
 * Mount after tenantMiddleware so req.restaurantId is already set; when it
 * is, the resolved customer/device must belong to that tenant or the request
 * is rejected — closes the same cross-tenant spoofing gap authMiddleware
 * guards against for staff tokens.
 */
export const customerAuthMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const cookies = parseCookies(req.headers.cookie);
  const authHeader = req.headers.authorization;
  const headerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;
  const sessionToken = cookies[CUSTOMER_TOKEN_COOKIE] || headerToken;

  if (sessionToken) {
    try {
      const decoded = verifyCustomerToken(sessionToken);
      if (req.restaurantId && decoded.restaurantId !== req.restaurantId) {
        return errorResponse(res, 'errors.unauthorized', 403);
      }
      req.customer = { id: decoded.customerId, restaurantId: decoded.restaurantId, phone: decoded.phone };
      return next();
    } catch {
      // Fall through to the trusted-device path below — an expired/garbled
      // session token shouldn't be a hard failure if a valid device cookie
      // is also present.
    }
  }

  const deviceToken = cookies[CUSTOMER_DEVICE_COOKIE];
  if (deviceToken) {
    try {
      const tokenHash = hashDeviceToken(deviceToken);
      const device = await prisma.trustedDevice.findUnique({
        where: { tokenHash },
        include: { customer: true },
      });
      if (device && !device.revokedAt && (!req.restaurantId || device.customer.restaurantId === req.restaurantId)) {
        // Best-effort freshness stamp; never block the request on it.
        prisma.trustedDevice.update({ where: { id: device.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
        req.customer = { id: device.customer.id, restaurantId: device.customer.restaurantId, phone: device.customer.phone };
        return next();
      }
    } catch (error) {
      console.error('[customerAuth] trusted-device lookup failed:', (error as Error)?.message);
    }
  }

  return errorResponse(res, 'errors.unauthorized', 401);
};
