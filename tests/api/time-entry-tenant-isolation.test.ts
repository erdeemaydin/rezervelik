import { beforeAll, describe, it, expect } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, SeededTenant } from '../helpers/seed';

// Security-audit finding: resolveUserId trusted a manager-supplied `userId`
// verbatim with no check that it actually belonged to the caller's tenant —
// an ADMIN of tenant A could stamp a TimeEntry row (restaurantId: tenant A,
// userId: a guessed/known tenant-B user id), corrupting tenant A's own
// timesheet/worked-hours views with a foreign identity. It now falls back to
// the caller's own id when the requested id isn't a real member of this
// tenant.
describe('timeEntryController tenant isolation on manager-supplied userId', () => {
  let a: SeededTenant;
  let b: SeededTenant;

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant();
    b = await seedTenant();
  });

  it('falls back to the caller\'s own id when an ADMIN targets a foreign-tenant userId on upsert', async () => {
    const res = await api
      .put('/api/time-entries')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ date: '2026-09-01', userId: b.users.staff.id, checkIn: '09:00', checkOut: '17:00' });
    expect(res.status).toBe(200);
    expect(res.body.data.userId).toBe(a.users.admin.id);
    expect(res.body.data.userId).not.toBe(b.users.staff.id);

    const stored = await prisma.timeEntry.findFirst({ where: { restaurantId: a.restaurant.id, date: '2026-09-01' } });
    expect(stored!.userId).toBe(a.users.admin.id);
  });

  it('lets an ADMIN target a real member of their own tenant', async () => {
    const res = await api
      .put('/api/time-entries')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ date: '2026-09-02', userId: a.users.staff.id, checkIn: '09:00', checkOut: '17:00' });
    expect(res.status).toBe(200);
    expect(res.body.data.userId).toBe(a.users.staff.id);
  });

  it('logging time with no shiftId succeeds (was a 500 on the compound-unique upsert)', async () => {
    const res = await api
      .put('/api/time-entries')
      .set(auth(a.tokens.staff, a.restaurant.id))
      .send({ date: '2026-09-03', checkIn: '10:00', checkOut: '18:00' });
    expect(res.status).toBe(200);
    expect(res.body.data.shiftId).toBeNull();
  });

  it('a second no-shiftId submission for the same user/date updates in place, not a duplicate row', async () => {
    await api.put('/api/time-entries').set(auth(a.tokens.staff, a.restaurant.id)).send({ date: '2026-09-04', checkIn: '10:00', checkOut: '18:00' });
    const second = await api.put('/api/time-entries').set(auth(a.tokens.staff, a.restaurant.id)).send({ date: '2026-09-04', checkIn: '09:00', checkOut: '17:00' });
    expect(second.status).toBe(200);
    expect(second.body.data.checkIn).toBe('09:00');

    const rows = await prisma.timeEntry.findMany({ where: { userId: a.users.staff.id, date: '2026-09-04' } });
    expect(rows).toHaveLength(1);
  });

  it('never returns another tenant\'s entries when a manager requests a foreign-tenant userId', async () => {
    const res = await api
      .get('/api/time-entries')
      .query({ userId: b.users.staff.id })
      .set(auth(a.tokens.admin, a.restaurant.id));
    expect(res.status).toBe(200);
    // Falls back to the caller's own entries, none of which belong to tenant B.
    expect((res.body.data as any[]).every((e) => e.restaurantId === a.restaurant.id)).toBe(true);
  });
});
