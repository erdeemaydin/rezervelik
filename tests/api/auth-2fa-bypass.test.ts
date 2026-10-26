import { beforeAll, describe, it, expect } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, TEST_PASSWORD, SeededTenant } from '../helpers/seed';

// Critical vulnerability found in this session's security audit: authMiddleware
// accepted ANY validly-signed JWT as a full session, including the short-lived
// otp_challenge token minted after the password step but before the second
// factor. That token has no `role` claim and carries `purpose: 'otp_challenge'`
// — but nothing checked either, so an attacker who merely knew a user's
// password (no access to their authenticator) could use the challenge token as
// a Bearer token against non-tenant-scoped authenticated routes, most
// seriously POST /api/auth/2fa/setup, to silently re-provision that user's 2FA
// secret and then complete a real login with a code from their own secret —
// fully bypassing 2FA. Verifies the challenge token is now rejected outright,
// and that the legitimate two-step flow still works end to end.
describe('2FA challenge token cannot be used as a session token', () => {
  let a: SeededTenant;

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant();
    await prisma.restaurantSettings.update({
      where: { restaurantId: a.restaurant.id },
      data: { twoFactorEnabled: true, twoFactorRoles: 'ADMIN' },
    });
  });

  async function getChallengeToken() {
    const res = await api.post('/api/auth/login').send({ email: a.users.admin.email, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.otpRequired).toBe(true);
    return res.body.data.otpToken as string;
  }

  it('rejects the challenge token against /api/auth/me', async () => {
    const otpToken = await getChallengeToken();
    const res = await api.get('/api/auth/me').set('Authorization', `Bearer ${otpToken}`);
    expect(res.status).toBe(401);
  });

  it('rejects the challenge token against the 2FA re-provisioning endpoint (the actual bypass path)', async () => {
    const otpToken = await getChallengeToken();
    const res = await api.post('/api/auth/2fa/setup').set('Authorization', `Bearer ${otpToken}`);
    expect(res.status).toBe(401);
  });

  it('rejects the challenge token against a tenant-scoped route too', async () => {
    const otpToken = await getChallengeToken();
    const res = await api
      .get('/api/settings')
      .set('Authorization', `Bearer ${otpToken}`)
      .set('X-Restaurant-ID', a.restaurant.id);
    expect(res.status).toBe(401);
  });

  it('the legitimate two-step flow still issues a working session token', async () => {
    // Enroll: password step returns setupRequired with a fresh secret.
    const loginRes = await api.post('/api/auth/login').send({ email: a.users.admin.email, password: TEST_PASSWORD });
    expect(loginRes.body.data.setupRequired).toBe(true);
    const { otpToken, otpSecret } = loginRes.body.data;

    const { generateTotp } = await import('../../src/utils/totp');
    const code = generateTotp(otpSecret);

    const verifyRes = await api.post('/api/auth/login/otp').send({ otpToken, code });
    expect(verifyRes.status).toBe(200);
    const sessionToken = verifyRes.body.data.token;
    expect(sessionToken).toBeTruthy();

    const meRes = await api.get('/api/auth/me').set('Authorization', `Bearer ${sessionToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.email).toBe(a.users.admin.email);
  });
});
