import { beforeAll, describe, it, expect } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, SeededTenant } from '../helpers/seed';

// PROJECT_LOGIC.md §10's DOUBLE_SHIFT / CONSECUTIVE_REST (min 11h) / UNAVAILABLE rules
// used to be computed only in the frontend (ShiftAssigner.tsx) purely for display —
// the API accepted any assignment regardless. These verify the server now blocks
// (and force:true still allows) all three.
describe('assignShift server-side violation enforcement', () => {
  let a: SeededTenant;
  let morning: { id: string };
  let evening: { id: string };
  let lateNight: { id: string };

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant();
    morning = await prisma.shift.create({
      data: { restaurantId: a.restaurant.id, name: 'Morning', startTime: '08:00', endTime: '16:00' },
    });
    evening = await prisma.shift.create({
      data: { restaurantId: a.restaurant.id, name: 'Evening', startTime: '17:00', endTime: '23:00' },
    });
    lateNight = await prisma.shift.create({
      data: { restaurantId: a.restaurant.id, name: 'LateNight', startTime: '20:00', endTime: '23:59' },
    });
  });

  it('blocks a double shift on the same day, allows it with force', async () => {
    const date = '2026-10-01';
    await prisma.shiftAssignment.create({ data: { shiftId: morning.id, userId: a.users.staff.id, date } });

    const blocked = await api
      .post('/api/scheduling/assignments')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ shiftId: evening.id, userId: a.users.staff.id, date });
    expect(blocked.status).toBe(409);
    expect(blocked.body.details.violations.some((v: any) => v.type === 'DOUBLE_SHIFT')).toBe(true);

    const stillOne = await prisma.shiftAssignment.count({ where: { userId: a.users.staff.id, date } });
    expect(stillOne).toBe(1);

    const forced = await api
      .post('/api/scheduling/assignments')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ shiftId: evening.id, userId: a.users.staff.id, date, force: true });
    expect(forced.status).toBe(201);
  });

  it('blocks under 11h rest between consecutive days, allows it with force', async () => {
    const day1 = '2026-10-05';
    const day2 = '2026-10-06';
    // LateNight ends 23:59 on day1; Morning starts 08:00 on day2 — ~8h gap, under 11h.
    await prisma.shiftAssignment.create({ data: { shiftId: lateNight.id, userId: a.users.manager.id, date: day1 } });

    const blocked = await api
      .post('/api/scheduling/assignments')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ shiftId: morning.id, userId: a.users.manager.id, date: day2 });
    expect(blocked.status).toBe(409);
    expect(blocked.body.details.violations.some((v: any) => v.type === 'CONSECUTIVE_REST')).toBe(true);

    const forced = await api
      .post('/api/scheduling/assignments')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ shiftId: morning.id, userId: a.users.manager.id, date: day2, force: true });
    expect(forced.status).toBe(201);
  });

  it('blocks assigning a staffer marked unavailable, allows it with force', async () => {
    const date = '2026-10-10';
    await prisma.employeeAvailability.create({
      data: { userId: a.users.staffAnalytics.id, shiftId: morning.id, date, isAvailable: false },
    });

    const blocked = await api
      .post('/api/scheduling/assignments')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ shiftId: morning.id, userId: a.users.staffAnalytics.id, date });
    expect(blocked.status).toBe(409);
    expect(blocked.body.details.violations.some((v: any) => v.type === 'UNAVAILABLE')).toBe(true);

    const forced = await api
      .post('/api/scheduling/assignments')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ shiftId: morning.id, userId: a.users.staffAnalytics.id, date, force: true });
    expect(forced.status).toBe(201);
  });

  it('allows a normal assignment with no rule conflicts', async () => {
    const date = '2026-10-15';
    const res = await api
      .post('/api/scheduling/assignments')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ shiftId: morning.id, userId: a.users.host.id, date });
    expect(res.status).toBe(201);
  });
});
