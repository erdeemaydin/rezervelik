import { beforeAll, describe, it, expect } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, TEST_PASSWORD, SeededTenant } from '../helpers/seed';

describe('Auth & session boundaries', () => {
  let a: SeededTenant;
  let b: SeededTenant;

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant();
    b = await seedTenant();
  });

  it('logs in with correct credentials', async () => {
    const res = await api.post('/api/auth/login').send({ email: a.users.admin.email, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.user.role).toBe('ADMIN');
  });

  // A wrong-credentials login must be a normal 401 JSON response the login
  // page can show inline (getApiErrorMessage reads .message/.error) — never a
  // redirect. The axios interceptor explicitly skips its "clear session and
  // send to /auth/login" handling when the failing request was itself made
  // from an /auth/ page (see lib/api.ts), so the login form doesn't reset
  // itself on a bad attempt; it just displays this response's message.
  it('rejects a wrong password with a normal error response, not a redirect signal', async () => {
    const res = await api.post('/api/auth/login').send({ email: a.users.admin.email, password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(typeof res.body.message).toBe('string');
    expect(res.body.message.length).toBeGreaterThan(0);
    expect(res.headers['set-cookie']).toBeFalsy();
  });

  // Security-audit finding: login used to return immediately for a nonexistent
  // email (skipping bcrypt entirely) but ran a real bcrypt.compare for a wrong
  // password on an existing account — a measurable timing difference an
  // attacker could use to enumerate valid emails. Both paths now run
  // bcrypt.compare unconditionally (see DUMMY_PASSWORD_HASH in
  // authController.ts) and must be indistinguishable in status/body; a
  // response-time assertion would be flaky across environments, so this
  // covers the behavioral half of the fix.
  it('a nonexistent email fails with the exact same response as a wrong password', async () => {
    const wrongPassword = await api.post('/api/auth/login').send({ email: a.users.admin.email, password: 'wrong-password' });
    const noSuchUser = await api.post('/api/auth/login').send({ email: 'nobody-here@test.dev', password: 'whatever123' });

    expect(noSuchUser.status).toBe(wrongPassword.status);
    expect(noSuchUser.body.code).toBe(wrongPassword.body.code);
    expect(noSuchUser.body.error).toBe(wrongPassword.body.error);
  });

  it("rejects tenant A's token when used against tenant B", async () => {
    const res = await api.get('/api/settings').set(auth(a.tokens.admin, b.restaurant.id));
    expect(res.status).toBe(403);
  });

  // Bug: verifyPassword read req.userId (never set — authMiddleware sets
  // req.user.userId), so this always 500'd, breaking every
  // PasswordConfirmDialog-gated action (e.g. re-confirming before a
  // sensitive settings change).
  it('POST /auth/verify-password correctly verifies the caller\'s own password', async () => {
    const ok = await api.post('/api/auth/verify-password').set(auth(a.tokens.admin, a.restaurant.id)).send({ password: TEST_PASSWORD });
    expect(ok.status).toBe(200);
    expect(ok.body.data.verified).toBe(true);

    const bad = await api.post('/api/auth/verify-password').set(auth(a.tokens.admin, a.restaurant.id)).send({ password: 'wrong' });
    expect(bad.status).toBe(401);
  });

  it('gates login with role-based 2FA and lets excluded roles through', async () => {
    await prisma.restaurantSettings.update({
      where: { restaurantId: a.restaurant.id },
      data: { twoFactorEnabled: true, twoFactorRoles: 'ADMIN' },
    });

    // ADMIN is in the required-roles list → OTP challenge, no session token.
    const adminRes = await api.post('/api/auth/login').send({ email: a.users.admin.email, password: TEST_PASSWORD });
    expect(adminRes.status).toBe(200);
    expect(adminRes.body.data.otpRequired).toBe(true);
    expect(adminRes.body.data.token).toBeFalsy();

    // STAFF is not in the list → normal session.
    const staffRes = await api.post('/api/auth/login').send({ email: a.users.staff.email, password: TEST_PASSWORD });
    expect(staffRes.body.data.token).toBeTruthy();
  });
});
