import { beforeAll, describe, it, expect } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, TEST_PASSWORD, SeededTenant } from '../helpers/seed';
import { generateTotp } from '../../src/utils/totp';

// Security-audit finding: setupTwoFactor let any authenticated request
// silently overwrite an already-enrolled user's otpSecret with zero proof of
// possessing the current password/code — a stolen session token (or the
// otp_challenge-token bug fixed alongside this) could re-provision 2FA
// undetected. Re-provisioning now requires currentPassword; initial
// enrollment (nothing to protect yet) still doesn't.
describe('2FA re-provisioning requires the current password', () => {
  let a: SeededTenant;

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant();
  });

  async function enroll() {
    const setup = await api.post('/api/auth/2fa/setup').set(auth(a.tokens.admin, a.restaurant.id));
    expect(setup.status).toBe(200);
    const code = generateTotp(setup.body.data.otpSecret);
    const confirm = await api.post('/api/auth/2fa/confirm').set(auth(a.tokens.admin, a.restaurant.id)).send({ code });
    expect(confirm.status).toBe(200);
    return setup.body.data.otpSecret as string;
  }

  it('initial enrollment needs no password', async () => {
    await enroll();
    const me = await api.get('/api/auth/me').set(auth(a.tokens.admin, a.restaurant.id));
    expect(me.body.data.otpEnrolled).toBe(true);
  });

  it('re-provisioning without currentPassword is rejected', async () => {
    const res = await api.post('/api/auth/2fa/setup').set(auth(a.tokens.admin, a.restaurant.id));
    expect(res.status).toBe(400);
  });

  it('re-provisioning with the wrong currentPassword is rejected', async () => {
    const res = await api
      .post('/api/auth/2fa/setup')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ currentPassword: 'not-the-password' });
    expect(res.status).toBe(400);
  });

  it('re-provisioning with the correct currentPassword succeeds and issues a new secret', async () => {
    const oldSecret = (await prisma.user.findUnique({ where: { id: a.users.admin.id } }))!.otpSecret;
    const res = await api
      .post('/api/auth/2fa/setup')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ currentPassword: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.otpSecret).toBeTruthy();
    expect(res.body.data.otpSecret).not.toBe(oldSecret);
  });
});
