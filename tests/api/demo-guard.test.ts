import { beforeAll, describe, it, expect } from 'vitest';
import bcrypt from 'bcrypt';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, TEST_PASSWORD, SeededTenant } from '../helpers/seed';
import { generateToken } from '../../src/utils/jwt';
import { DEMO_RESTAURANT_ID } from '../../src/config/demo';

// The public showcase tenant's logins are published, so a visitor must not be
// able to change what the next visitor relies on (password, 2FA, staff, tenant
// settings, branding) or fill the disk (uploads) — while everyday operations
// stay writable so the demo is actually explorable.
describe('Public demo tenant guard', () => {
  let demoAdmin: string;
  let demoAdminId: string;
  let other: SeededTenant;

  beforeAll(async () => {
    await resetDb();
    other = await seedTenant();
    await prisma.restaurant.create({
      data: { id: DEMO_RESTAURANT_ID, slug: 'harbour-and-vine-test', name: 'Demo', contactEmail: 'demo@test.dev', settings: { create: {} } },
    });
    const user = await prisma.user.create({
      data: {
        restaurantId: DEMO_RESTAURANT_ID, email: 'admin-demo@test.dev', firstName: 'Demo', lastName: 'Admin',
        role: 'ADMIN', passwordHash: await bcrypt.hash(TEST_PASSWORD, 4),
      },
    });
    demoAdminId = user.id;
    demoAdmin = generateToken(user.id, DEMO_RESTAURANT_ID, 'ADMIN');
  });

  const blocked: [string, string, object?][] = [
    ['post', '/api/auth/change-password', { currentPassword: TEST_PASSWORD, newPassword: 'Another-Passw0rd!' }],
    ['post', '/api/auth/2fa/setup'],
    ['post', '/api/staff', { email: 'x@test.dev', firstName: 'X', lastName: 'Y', role: 'STAFF' }],
    ['delete', '/api/staff/some-id'],
    ['put', '/api/settings', { twoFactorEnabled: true }],
    ['put', '/api/customization', { announcementText: 'defaced' }],
    ['post', '/api/uploads/image'],
    ['post', '/api/payments/some-id/refund'],
  ];

  it.each(blocked)('blocks %s %s for a demo session', async (method, path, body) => {
    const res = await (api as any)[method](path).set(auth(demoAdmin, DEMO_RESTAURANT_ID)).send(body ?? {});
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('errors.demo_read_only');
  });

  it('leaves the demo password unchanged after a blocked change-password', async () => {
    const res = await api.post('/api/auth/login').send({ email: 'admin-demo@test.dev', password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    const user = await prisma.user.findUnique({ where: { id: demoAdminId } });
    expect(user?.otpRequired).toBe(false);
  });

  it('still allows reads and everyday writes in the demo tenant', async () => {
    const read = await api.get('/api/settings').set(auth(demoAdmin, DEMO_RESTAURANT_ID));
    expect(read.status).toBe(200);
    const write = await api.post('/api/categories').set(auth(demoAdmin, DEMO_RESTAURANT_ID)).send({ name: 'Walk-in', color: '#f59e0b' });
    expect(write.body.code).not.toBe('errors.demo_read_only');
    expect(write.status).toBeLessThan(300);
  });

  it('does not affect other tenants', async () => {
    const res = await api.put('/api/customization').set(auth(other.tokens.admin, other.restaurant.id)).send({ announcementText: 'hello' });
    expect(res.body.code).not.toBe('errors.demo_read_only');
    expect(res.status).toBeLessThan(300);
  });
});
