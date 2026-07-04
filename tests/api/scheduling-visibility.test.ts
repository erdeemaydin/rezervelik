import { beforeAll, describe, it, expect } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, SeededTenant } from '../helpers/seed';

const RANGE = 'startDate=2026-01-01&endDate=2026-12-31';

describe('Scheduling visibility (OWN_ONLY privacy is enforced server-side)', () => {
  let a: SeededTenant;

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant({ staffScheduleView: 'OWN_ONLY' });
    const shift = await prisma.shift.create({
      data: { restaurantId: a.restaurant.id, name: 'Morning', startTime: '08:00', endTime: '16:00' },
    });
    const date = '2026-06-01';
    await prisma.shiftAssignment.create({ data: { shiftId: shift.id, userId: a.users.staff.id, date, isPublished: true } });
    await prisma.shiftAssignment.create({ data: { shiftId: shift.id, userId: a.users.staffAnalytics.id, date, isPublished: true } });
  });

  it('a STAFF member only sees their own assignments', async () => {
    const res = await api.get(`/api/scheduling/assignments?${RANGE}`).set(auth(a.tokens.staff, a.restaurant.id));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((r: any) => r.userId === a.users.staff.id)).toBe(true);
  });

  it('ignores a spoofed userId query param', async () => {
    const res = await api
      .get(`/api/scheduling/assignments?${RANGE}&userId=${a.users.staffAnalytics.id}`)
      .set(auth(a.tokens.staff, a.restaurant.id));
    expect(res.status).toBe(200);
    expect(res.body.data.every((r: any) => r.userId === a.users.staff.id)).toBe(true);
  });

  it('an ADMIN sees every assignment', async () => {
    const res = await api.get(`/api/scheduling/assignments?${RANGE}`).set(auth(a.tokens.admin, a.restaurant.id));
    const userIds = new Set(res.body.data.map((r: any) => r.userId));
    expect(userIds.has(a.users.staff.id)).toBe(true);
    expect(userIds.has(a.users.staffAnalytics.id)).toBe(true);
  });
});
