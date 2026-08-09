import { beforeAll, describe, it, expect } from 'vitest';
import bcrypt from 'bcrypt';
import { api, auth } from '../helpers/app';
import { resetDb, prisma, TEST_PASSWORD } from '../helpers/seed';

// Security-audit finding: there was no way to revoke a compromised/offboarded
// SUPER_ADMIN credential through the product at all, only directly in the DB.
// Deactivating must block both new logins AND an already-issued token on its
// very next request — SUPER_ADMIN tokens are otherwise stateless like every
// other role's, which would mean a revoked admin keeps working until their
// token happens to expire.
describe('SUPER_ADMIN account deactivation', () => {
  let rootToken: string;
  let targetId: string;
  let targetToken: string;

  beforeAll(async () => {
    await resetDb();
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 4);
    const root = await prisma.user.create({
      data: { email: `root-${Date.now()}@test.dev`, passwordHash, firstName: 'Root', lastName: 'Admin', role: 'SUPER_ADMIN' },
    });
    const target = await prisma.user.create({
      data: { email: `target-${Date.now()}@test.dev`, passwordHash, firstName: 'Target', lastName: 'Admin', role: 'SUPER_ADMIN' },
    });
    targetId = target.id;

    const rootLogin = await api.post('/api/auth/login').send({ email: root.email, password: TEST_PASSWORD });
    rootToken = rootLogin.body.data.token;
    const targetLogin = await api.post('/api/auth/login').send({ email: target.email, password: TEST_PASSWORD });
    targetToken = targetLogin.body.data.token;
  });

  it('an admin cannot deactivate their own account', async () => {
    const rootId = (await prisma.user.findFirst({ where: { email: { contains: 'root-' } } }))!.id;
    const res = await api.put(`/api/system/admins/${rootId}/active`).set(auth(rootToken)).send({ isActive: false });
    expect(res.status).toBe(400);
  });

  it('deactivating revokes an already-issued token on its very next request — not just future logins', async () => {
    // The target's token is valid before deactivation.
    const before = await api.get('/api/system/tenants').set(auth(targetToken));
    expect(before.status).toBe(200);

    const deactivate = await api.put(`/api/system/admins/${targetId}/active`).set(auth(rootToken)).send({ isActive: false });
    expect(deactivate.status).toBe(200);
    expect(deactivate.body.data.isActive).toBe(false);

    // Same, still-unexpired token — now rejected live.
    const after = await api.get('/api/system/tenants').set(auth(targetToken));
    expect(after.status).toBe(401);
  });

  it('a deactivated account cannot log in — same generic error as a wrong password', async () => {
    const target = await prisma.user.findUnique({ where: { id: targetId } });
    const res = await api.post('/api/auth/login').send({ email: target!.email, password: TEST_PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('errors.invalid_credentials');
  });

  it('reactivating restores login access', async () => {
    const reactivate = await api.put(`/api/system/admins/${targetId}/active`).set(auth(rootToken)).send({ isActive: true });
    expect(reactivate.status).toBe(200);
    expect(reactivate.body.data.isActive).toBe(true);

    const target = await prisma.user.findUnique({ where: { id: targetId } });
    const login = await api.post('/api/auth/login').send({ email: target!.email, password: TEST_PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.data.token).toBeTruthy();
  });
});
