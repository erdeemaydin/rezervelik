import { beforeAll, describe, it, expect } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, SeededTenant } from '../helpers/seed';

// Bug fix: updateStaffMember's self-lockout guard was `targetUser.id ===
// req.user?.userId && role !== 'ADMIN'` — this blocked ANY self-edit unless
// the submitted role was literally 'ADMIN', regardless of the caller's
// actual current role or whether role was even being changed. A MANAGER
// updating their own phone number, or an ADMIN updating an unrelated field
// without resubmitting role, was wrongly rejected as "Cannot demote
// yourself". The real intent — an ADMIN can't demote themselves away from
// ADMIN — now checks the target's current role and only fires when role is
// actually being changed to something else.
describe('Staff self-edit lockout guard', () => {
  let a: SeededTenant;

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant();
  });

  it('lets a MANAGER edit their own phone number without touching role', async () => {
    const res = await api
      .put(`/api/staff/${a.users.manager.id}`)
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ firstName: a.users.manager.firstName, lastName: a.users.manager.lastName, phone: '+905551112233' });
    expect(res.status).toBe(200);
    expect(res.body.data.phone).toBe('+905551112233');
  });

  it('lets a STAFF member edit their own record while resubmitting their own unchanged role', async () => {
    const res = await api
      .put(`/api/staff/${a.users.staff.id}`)
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ firstName: 'Updated', lastName: a.users.staff.lastName, role: 'STAFF' });
    expect(res.status).toBe(200);
    expect(res.body.data.firstName).toBe('Updated');
  });

  it('lets an ADMIN edit their own record when resubmitting role: ADMIN', async () => {
    const res = await api
      .put(`/api/staff/${a.users.admin.id}`)
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ firstName: a.users.admin.firstName, lastName: a.users.admin.lastName, role: 'ADMIN' });
    expect(res.status).toBe(200);
  });

  it('lets an ADMIN edit their own record without resubmitting role at all', async () => {
    const res = await api
      .put(`/api/staff/${a.users.admin.id}`)
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ firstName: 'StillAdmin', lastName: a.users.admin.lastName });
    expect(res.status).toBe(200);
    expect(res.body.data.firstName).toBe('StillAdmin');
  });

  it('still blocks an ADMIN from demoting themselves away from ADMIN', async () => {
    const res = await api
      .put(`/api/staff/${a.users.admin.id}`)
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ firstName: a.users.admin.firstName, lastName: a.users.admin.lastName, role: 'MANAGER' });
    expect(res.status).toBe(403);
  });
});

describe('Staff mutation tenant isolation', () => {
  let a: SeededTenant;
  let b: SeededTenant;

  beforeAll(async () => {
    a = await seedTenant();
    b = await seedTenant();
  });

  it('blocks tenant A admin from updating tenant B staff by id', async () => {
    const res = await api
      .put(`/api/staff/${b.users.staff.id}`)
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ firstName: 'Hijacked', lastName: 'X' });
    expect(res.status).toBe(403);
  });

  it('blocks tenant A admin from deleting tenant B staff by id', async () => {
    const res = await api.delete(`/api/staff/${b.users.staff.id}`).set(auth(a.tokens.admin, a.restaurant.id));
    expect(res.status).toBe(403);
  });
});
