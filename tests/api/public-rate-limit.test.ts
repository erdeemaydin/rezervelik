import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';
import { publicRateLimit } from '../../src/middlewares/rateLimit';
import { generateToken } from '../../src/utils/jwt';

// Bug-audit finding: joinPublicWaitlist, createReservation (guest path), and
// submitInvitationRsvp had zero throttling — a scripted loop could flood rows
// and spam the paid SMS/WhatsApp account via this session's new confirmation
// triggers. Exercises publicRateLimit directly (not through the HTTP app):
// the integration suite runs single-process with `fileParallelism: false` and
// would otherwise share one IP's bucket across many unrelated test files.
describe('publicRateLimit', () => {
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

  it('allows up to `max` requests, then rejects with 429', () => {
    const limiter = publicRateLimit({ windowMs: 60_000, max: 3, keyPrefix: 'test-cap' });

    for (let i = 0; i < 3; i++) {
      const { req, res, next } = mockReqRes({ ip: '1.1.1.1' });
      limiter(req, res, next);
      expect(next).toHaveBeenCalledOnce();
      expect(res.status).not.toHaveBeenCalled();
    }

    const { req, res, next } = mockReqRes({ ip: '1.1.1.1' });
    limiter(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
  });

  it('tracks each IP independently', () => {
    const limiter = publicRateLimit({ windowMs: 60_000, max: 1, keyPrefix: 'test-per-ip' });

    const first = mockReqRes({ ip: '2.2.2.2' });
    limiter(first.req, first.res, first.next);
    expect(first.next).toHaveBeenCalledOnce();

    // Same IP again -> rejected.
    const firstAgain = mockReqRes({ ip: '2.2.2.2' });
    limiter(firstAgain.req, firstAgain.res, firstAgain.next);
    expect(firstAgain.next).not.toHaveBeenCalled();

    // A different IP has its own untouched bucket.
    const second = mockReqRes({ ip: '3.3.3.3' });
    limiter(second.req, second.res, second.next);
    expect(second.next).toHaveBeenCalledOnce();
  });

  it('resets once the window elapses', () => {
    const limiter = publicRateLimit({ windowMs: 1000, max: 1, keyPrefix: 'test-window' });

    const a = mockReqRes({ ip: '4.4.4.4' });
    limiter(a.req, a.res, a.next);
    expect(a.next).toHaveBeenCalledOnce();

    const b = mockReqRes({ ip: '4.4.4.4' });
    limiter(b.req, b.res, b.next);
    expect(b.next).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1001);

    const c = mockReqRes({ ip: '4.4.4.4' });
    limiter(c.req, c.res, c.next);
    expect(c.next).toHaveBeenCalledOnce();
  });

  it('never throttles a request carrying a valid staff Bearer token', () => {
    const limiter = publicRateLimit({ windowMs: 60_000, max: 1, keyPrefix: 'test-staff' });
    const token = generateToken('user-1', 'restaurant-1', 'ADMIN');

    for (let i = 0; i < 5; i++) {
      const { req, res, next } = mockReqRes({ ip: '5.5.5.5', bearer: token });
      limiter(req, res, next);
      expect(next).toHaveBeenCalledOnce();
      expect(res.status).not.toHaveBeenCalled();
    }
  });
});
