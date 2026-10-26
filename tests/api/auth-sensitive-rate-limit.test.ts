import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';
import { publicRateLimit } from '../../src/middlewares/rateLimit';
import { generateToken } from '../../src/utils/jwt';

// Security-audit finding: /auth/login and /auth/login/otp were throttled, but
// three sibling endpoints that guess-or-verify a secret the same way were not:
// POST /register (unauthenticated, bcrypt.hash + account-existence oracle),
// POST /2fa/confirm (guesses a 6-digit TOTP against an *already-authenticated*
// session), and POST /verify-password (re-verifies the caller's own password).
// authRoutes.ts now wraps all three with `exemptAuthenticated: false` — unlike
// the default staff-bypass (any valid Bearer token exempts a request), these
// three have no legitimate "staff acting within their own tenant" case to
// exempt, and for /2fa/confirm + /verify-password specifically, the attacker
// holds a valid token *by construction* (that's how they reached an
// authMiddleware-gated route at all), so the default bypass would have
// defeated the throttle for exactly the caller it's meant to slow down.
//
// Exercises publicRateLimit directly with exemptAuthenticated: false (not
// through the HTTP app — rateLimitOrNoop no-ops under NODE_ENV=test, same
// reasoning as public-rate-limit.test.ts).
describe('publicRateLimit with exemptAuthenticated: false', () => {
  const mockReqRes = (opts: { ip?: string; bearer?: string } = {}) => {
    const req = {
      headers: opts.bearer ? { authorization: `Bearer ${opts.bearer}` } : {},
      socket: { remoteAddress: opts.ip || '10.0.0.1' },
    } as unknown as Request;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;
    const next = vi.fn();
    return { req, res, next };
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('still throttles a request carrying a valid Bearer token, unlike the default behavior', () => {
    const limiter = publicRateLimit({ windowMs: 60_000, max: 1, keyPrefix: 'test-exempt-off', exemptAuthenticated: false });
    const token = generateToken('user-1', 'restaurant-1', 'ADMIN');

    const first = mockReqRes({ ip: '6.6.6.6', bearer: token });
    limiter(first.req, first.res, first.next);
    expect(first.next).toHaveBeenCalledOnce();

    // A second request from the same IP, same valid token — must be blocked.
    // The default (exemptAuthenticated: true) would let this through forever;
    // this is exactly the gap that made setup-super-admin/2fa-confirm/
    // verify-password/register unthrottled for any already-authenticated caller.
    const second = mockReqRes({ ip: '6.6.6.6', bearer: token });
    limiter(second.req, second.res, second.next);
    expect(second.next).not.toHaveBeenCalled();
    expect(second.res.status).toHaveBeenCalledWith(429);
  });

  it('a SUPER_ADMIN token is also throttled when exemptAuthenticated is false', () => {
    const limiter = publicRateLimit({ windowMs: 60_000, max: 1, keyPrefix: 'test-exempt-off-super', exemptAuthenticated: false });
    const token = generateToken('super-1', null, 'SUPER_ADMIN');

    const first = mockReqRes({ ip: '7.7.7.7', bearer: token });
    limiter(first.req, first.res, first.next);
    expect(first.next).toHaveBeenCalledOnce();

    const second = mockReqRes({ ip: '7.7.7.7', bearer: token });
    limiter(second.req, second.res, second.next);
    expect(second.next).not.toHaveBeenCalled();
    expect(second.res.status).toHaveBeenCalledWith(429);
  });

  it('still throttles per-IP (unauthenticated) the same as the default', () => {
    const limiter = publicRateLimit({ windowMs: 60_000, max: 1, keyPrefix: 'test-exempt-off-anon', exemptAuthenticated: false });

    const first = mockReqRes({ ip: '8.8.8.8' });
    limiter(first.req, first.res, first.next);
    expect(first.next).toHaveBeenCalledOnce();

    const second = mockReqRes({ ip: '8.8.8.8' });
    limiter(second.req, second.res, second.next);
    expect(second.next).not.toHaveBeenCalled();
    expect(second.res.status).toHaveBeenCalledWith(429);
  });
});
