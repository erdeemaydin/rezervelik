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

  it('rejects a wrong password', async () => {
    const res = await api.post('/api/auth/login').send({ email: a.users.admin.email, password: 'wrong-password' });
    expect(res.status).toBe(401);
  });

  it("rejects tenant A's token when used against tenant B", async () => {
    const res = await api.get('/api/settings').set(auth(a.tokens.admin, b.restaurant.id));
    expect(res.status).toBe(403);
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
