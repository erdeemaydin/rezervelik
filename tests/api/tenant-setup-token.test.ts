import { beforeAll, describe, it, expect } from 'vitest';
import bcrypt from 'bcrypt';
import { api, auth } from '../helpers/app';
import { resetDb, prisma, TEST_PASSWORD } from '../helpers/seed';
import { generateToken } from '../../src/utils/jwt';

// The tenant setup-invite token used to be Math.random().toString(36) stored in
// plaintext (User.setupToken) — a predictable, at-rest-readable credential that
// alone lets anyone set a brand-new tenant admin's password for up to 7 days.
// Now only a SHA-256 hash is stored (User.setupTokenHash), same as password reset.
describe('Tenant setup-invite token security', () => {
  let superAdminToken: string;

  beforeAll(async () => {
    await resetDb();
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 4);
    const superAdmin = await prisma.user.create({
      data: {
        email: `super-${Date.now()}@test.dev`,
        passwordHash,
        firstName: 'Super',
        lastName: 'Admin',
        role: 'SUPER_ADMIN',
      },
    });
    superAdminToken = generateToken(superAdmin.id, null, 'SUPER_ADMIN');
  });

  it('never stores the raw setup token, only its hash', async () => {
    const res = await api
      .post('/api/system/tenants')
      .set(auth(superAdminToken))
      .send({
        name: `Tenant ${Date.now()}`,
        slug: `tenant-${Date.now()}`,
        contactEmail: `owner-${Date.now()}@test.dev`,
        adminFirstName: 'New',
        adminLastName: 'Owner',
        // no adminPassword -> triggers the invite/setup-token path
      });
    expect(res.status).toBe(201);
    expect(res.body.data.setupLink).toBeTruthy();

    const rawToken = res.body.data.setupLink.split('/').pop();
    const user = await prisma.user.findUnique({ where: { id: res.body.data.adminUser.id } });

    // The raw token must never appear verbatim anywhere in the persisted row.
    expect(user!.setupTokenHash).toBeTruthy();
    expect(user!.setupTokenHash).not.toBe(rawToken);
    expect(JSON.stringify(user)).not.toContain(rawToken);
  });

  it('lets the new admin complete setup with the raw token from the link', async () => {
    const res = await api
      .post('/api/system/tenants')
      .set(auth(superAdminToken))
      .send({
        name: `Tenant2 ${Date.now()}`,
        slug: `tenant2-${Date.now()}`,
        contactEmail: `owner2-${Date.now()}@test.dev`,
        adminFirstName: 'New',
        adminLastName: 'Owner',
      });
    const rawToken = res.body.data.setupLink.split('/').pop();

    const complete = await api.post('/api/auth/setup').send({ token: rawToken, password: 'NewPassw0rd!23' });
    expect(complete.status).toBe(200);

    const user = await prisma.user.findUnique({ where: { id: res.body.data.adminUser.id } });
    expect(user!.setupTokenHash).toBeNull();
  });

  it('rejects a bogus/guessed setup token', async () => {
    const res = await api.post('/api/auth/setup').send({ token: 'guessed-token-not-real', password: 'NewPassw0rd!23' });
    expect(res.status).toBe(400);
  });
});
