import { beforeAll, describe, it, expect } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, SeededTenant } from '../helpers/seed';

// logAudit is fire-and-forget (never awaited at the call site, by design — see
// auditService.ts's doc comment), so the row may land a beat after the HTTP
// response. Poll briefly instead of asserting immediately.
async function waitForAuditLog(where: any, timeoutMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const row = await prisma.auditLog.findFirst({ where, orderBy: { createdAt: 'desc' } });
    if (row) return row;
    await new Promise((r) => setTimeout(r, 25));
  }
  return null;
}

// staffController's create/update/delete set role and permissions directly but
// never called logAudit, despite AuditCategory having a dedicated PERMISSIONS
// value used everywhere else for exactly this. An ADMIN could silently promote a
// STAFF to ADMIN or delete an account with zero trail.
describe('Staff mutations are audited', () => {
  let a: SeededTenant;

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant();
  });

  it('logs STAFF_CREATED with the assigned role', async () => {
    const res = await api
      .post('/api/staff')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ email: `newhire-${Date.now()}@test.dev`, firstName: 'New', lastName: 'Hire', role: 'STAFF' });
    expect(res.status).toBe(201);

    const row = await waitForAuditLog({ action: 'STAFF_CREATED', targetId: res.body.data.id });
    expect(row).toBeTruthy();
    expect(row!.category).toBe('PERMISSIONS');
    expect((row!.metadata as any).role).toBe('STAFF');
  });

  it('logs STAFF_UPDATED with before/after role on a promotion', async () => {
    const created = await api
      .post('/api/staff')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ email: `promote-${Date.now()}@test.dev`, firstName: 'To', lastName: 'Promote', role: 'STAFF' });
    const userId = created.body.data.id;

    const res = await api
      .put(`/api/staff/${userId}`)
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ firstName: 'To', lastName: 'Promote', role: 'ADMIN' });
    expect(res.status).toBe(200);

    const row = await waitForAuditLog({ action: 'STAFF_UPDATED', targetId: userId });
    expect(row).toBeTruthy();
    expect((row!.metadata as any).previousRole).toBe('STAFF');
    expect((row!.metadata as any).newRole).toBe('ADMIN');
  });

  it('logs STAFF_DELETED', async () => {
    const created = await api
      .post('/api/staff')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ email: `todelete-${Date.now()}@test.dev`, firstName: 'To', lastName: 'Delete', role: 'STAFF' });
    const userId = created.body.data.id;

    const res = await api.delete(`/api/staff/${userId}`).set(auth(a.tokens.admin, a.restaurant.id));
    expect(res.status).toBe(200);

    const row = await waitForAuditLog({ action: 'STAFF_DELETED', targetId: userId });
    expect(row).toBeTruthy();
  });
});

describe('Staff email uniqueness race returns a friendly error, not a 500', () => {
  let a: SeededTenant;

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant();
  });

  it('rejects a sequential duplicate email with a friendly 400 (the pre-check path)', async () => {
    const email = `dup-${Date.now()}@test.dev`;
    const first = await api
      .post('/api/staff')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ email, firstName: 'First', lastName: 'One', role: 'STAFF' });
    expect(first.status).toBe(201);

    const second = await api
      .post('/api/staff')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ email, firstName: 'Second', lastName: 'Two', role: 'STAFF' });
    expect(second.status).toBe(400);
    expect(second.body.details?.message).toMatch(/already in use/i);
  });

  it('rejects the loser of a genuine concurrent-create race with 400, not 500 (the P2002 path)', async () => {
    const email = `race-${Date.now()}@test.dev`;
    const payload = (last: string) => ({ email, firstName: 'Racer', lastName: last, role: 'STAFF' });

    // Both requests' pre-checks can pass before either write commits; the DB's
    // unique constraint on User.email is what actually decides the loser.
    const [r1, r2] = await Promise.all([
      api.post('/api/staff').set(auth(a.tokens.admin, a.restaurant.id)).send(payload('One')),
      api.post('/api/staff').set(auth(a.tokens.admin, a.restaurant.id)).send(payload('Two')),
    ]);

    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([201, 400]);
    const loser = r1.status === 400 ? r1 : r2;
    expect(loser.body.details?.message).toMatch(/already in use/i);
  });
});
