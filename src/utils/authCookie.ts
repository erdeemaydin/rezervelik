import { Response } from 'express';

// Session token storage: httpOnly cookies instead of a JS-readable store
// (localStorage). A JWT held in localStorage (or a non-httpOnly cookie) can be
// read and exfiltrated by any successful XSS — httpOnly cookies are simply
// invisible to JavaScript, closing that off. See docs/planning/PRODUCTION_ROADMAP.md §10 for
// the fuller writeup and CORS_ORIGIN/COOKIE_SAME_SITE/COOKIE_SECURE below.

export const TOKEN_COOKIE = 'token';
// Set only while a SUPER_ADMIN is impersonating a tenant — stashes their own
// token server-side (also httpOnly, so JS never touches it either) so
// stop-impersonation can restore it without requiring a fresh login. See
// systemController.impersonateTenant / stopImpersonation.
export const ADMIN_STASH_COOKIE = 'adminToken';

// Parses the small subset of the `ms`-style duration strings this app
// actually uses for JWT_EXPIRES_IN (e.g. "1d", "24h", "30m") into
// milliseconds, without pulling in a dependency for it. Falls back to 1 day
// (matching the default in src/utils/jwt.ts) on anything unrecognized.
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
export function parseDurationMs(value: string | undefined): number {
  const match = /^(\d+)\s*(ms|s|m|h|d)?$/i.exec((value || '').trim());
  if (!match) return ONE_DAY_MS;
  const amount = Number(match[1]);
  const unit = (match[2] || 'ms').toLowerCase();
  const multiplier = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit] ?? 1;
  return amount * multiplier;
}

const isProd = process.env.NODE_ENV === 'production';

// Cross-origin behavior differs by deployment topology:
//   - frontend/backend as different PORTS of the same host (dev, or a LAN IP
//     deployment) are the same "site" per the SameSite spec (port is ignored),
//     so SameSite=Lax is sent on the cross-port XHR requests axios makes —
//     this is the default and needs no HTTPS.
//   - frontend/backend on genuinely different hostnames/domains need
//     SameSite=None, which browsers only honor together with Secure (HTTPS).
// Override via env for that second case; docs/planning/PRODUCTION_ROADMAP.md §1 already
// establishes HTTPS as a pre-launch blocker regardless.
const sameSite = (process.env.COOKIE_SAME_SITE as 'lax' | 'none' | 'strict' | undefined) || 'lax';
const secure = process.env.COOKIE_SECURE
  ? process.env.COOKIE_SECURE === 'true'
  : (isProd || sameSite === 'none');

function cookieOptions(maxAgeMs: number) {
  return {
    httpOnly: true,
    sameSite,
    secure,
    path: '/',
    maxAge: maxAgeMs,
  } as const;
}

export function setAuthCookie(res: Response, token: string, maxAgeMs?: number) {
  res.cookie(TOKEN_COOKIE, token, cookieOptions(maxAgeMs ?? parseDurationMs(process.env.JWT_EXPIRES_IN)));
}

export function setAdminStashCookie(res: Response, token: string, maxAgeMs?: number) {
  res.cookie(ADMIN_STASH_COOKIE, token, cookieOptions(maxAgeMs ?? parseDurationMs(process.env.JWT_EXPIRES_IN)));
}

export function clearAuthCookies(res: Response) {
  res.clearCookie(TOKEN_COOKIE, { path: '/' });
  res.clearCookie(ADMIN_STASH_COOKIE, { path: '/' });
}

export function clearAdminStashCookie(res: Response) {
  res.clearCookie(ADMIN_STASH_COOKIE, { path: '/' });
}
