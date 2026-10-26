import { beforeAll, describe, it, expect } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, SeededTenant } from '../helpers/seed';

// Critical fix: createStaffMember/updateStaffMember wrote `role`/`permissions`
// straight from req.body with no whitelist. `role` is a plain string column
// (not a Prisma enum), and this router is gated only by requirePermission
// ('manage_staff') — which the seeded MANAGER holds, not just ADMIN. Without
// this fix, a MANAGER holding manage_staff could set their own (or a new
// user's) role to ADMIN or SUPER_ADMIN directly via the API, minting a token
// that bypasses tenant scoping entirely (authMiddleware skips the tenant
// check for SUPER_ADMIN) and unlocks the whole /api/system/* surface.
describe('Staff role-grant escalation guard', () => {
  let a: SeededTenant;

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant();
  });

  it('blocks a MANAGER from self-promoting to SUPER_ADMIN via update', async () => {
    const res = await api
      .put(`/api/staff/${a.users.manager.id}`)
      .set(auth(a.tokens.manager, a.restaurant.id))
      .send({ firstName: a.users.manager.firstName, lastName: a.users.manager.lastName, role: 'SUPER_ADMIN' });
    expect(res.status).toBe(400);

    const stored = await prisma.user.findUnique({ where: { id: a.users.manager.id } });
    expect(stored?.role).toBe('MANAGER');
  });

  it('blocks a MANAGER from self-promoting to ADMIN via update', async () => {
    const res = await api
      .put(`/api/staff/${a.users.manager.id}`)
      .set(auth(a.tokens.manager, a.restaurant.id))
      .send({ firstName: a.users.manager.firstName, lastName: a.users.manager.lastName, role: 'ADMIN' });
    expect(res.status).toBe(400);

    const stored = await prisma.user.findUnique({ where: { id: a.users.manager.id } });
    expect(stored?.role).toBe('MANAGER');
  });

  it('blocks a MANAGER from minting a brand-new SUPER_ADMIN via create', async () => {
    const res = await api
      .post('/api/staff')
      .set(auth(a.tokens.manager, a.restaurant.id))
      .send({ email: `evil-${Date.now()}@test.dev`, firstName: 'Evil', lastName: 'New', role: 'SUPER_ADMIN' });
    expect(res.status).toBe(400);
  });

  it('blocks SUPER_ADMIN as a role grant even from an ADMIN caller', async () => {
    const res = await api
      .put(`/api/staff/${a.users.staff.id}`)
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ firstName: a.users.staff.firstName, lastName: a.users.staff.lastName, role: 'SUPER_ADMIN' });
    expect(res.status).toBe(400);
  });

  it('still allows an ADMIN to promote a STAFF member to ADMIN (existing supported flow)', async () => {
    const created = await api
      .post('/api/staff')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ email: `promotable-${Date.now()}@test.dev`, firstName: 'To', lastName: 'Promote', role: 'STAFF' });
    expect(created.status).toBe(201);

    const res = await api
      .put(`/api/staff/${created.body.data.id}`)
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ firstName: 'To', lastName: 'Promote', role: 'ADMIN' });
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('ADMIN');
  });

  it('still allows an ADMIN to self-edit while resubmitting their own unchanged ADMIN role', async () => {
    const res = await api
      .put(`/api/staff/${a.users.admin.id}`)
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ firstName: a.users.admin.firstName, lastName: a.users.admin.lastName, role: 'ADMIN' });
    expect(res.status).toBe(200);
  });

  it('still allows a MANAGER to create ordinary STAFF/HOST/MANAGER staff', async () => {
    const res = await api
      .post('/api/staff')
      .set(auth(a.tokens.manager, a.restaurant.id))
      .send({ email: `ok-${Date.now()}@test.dev`, firstName: 'Fine', lastName: 'Hire', role: 'HOST' });
    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe('HOST');
  });

  it('drops unrecognized permission strings instead of storing them verbatim', async () => {
    const res = await api
      .post('/api/staff')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({
        email: `permtest-${Date.now()}@test.dev`, firstName: 'Perm', lastName: 'Test', role: 'STAFF',
        permissions: ['manage_reservations', 'made_up_backdoor_permission'],
      });
    expect(res.status).toBe(201);
    expect(res.body.data.permissions).toBe('manage_reservations');
  });
});
