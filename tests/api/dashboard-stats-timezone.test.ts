import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, SeededTenant } from '../helpers/seed';

// Bug-audit finding: getDashboardStats resolved "today" via
// `new Date(now.getFullYear(), now.getMonth(), now.getDate())` — server-local
// time — instead of the restaurant's configured timezone, the same
// anti-pattern already fixed in analyticsController.ts. On a UTC-clocked
// server, a moment that's already "tomorrow" in Istanbul local time (UTC+3,
// no DST) was still "today" server-side, mis-bucketing staffOnline and the
// weekly volume-by-day chart.
describe('Dashboard stats respect the restaurant timezone, not server-local time', () => {
  let a: SeededTenant;

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant();

    // 2026-03-10T22:30:00Z = 2026-03-11T01:30 Istanbul time — a different
    // calendar day AND day-of-week (Tue vs Wed) than a naive UTC/server-local
    // read of the same instant would produce.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-10T22:30:00.000Z'));

    const shift = await prisma.shift.create({
      data: { restaurantId: a.restaurant.id, name: 'Late', startTime: '20:00', endTime: '02:00' },
    });
    await prisma.shiftAssignment.create({
      data: { shiftId: shift.id, userId: a.users.staff.id, date: '2026-03-11' },
    });

    await prisma.reservation.create({
      data: {
        restaurantId: a.restaurant.id,
        customerName: 'Late Night Guest',
        customerPhone: '+905550004001',
        guestCount: 2,
        startTime: new Date('2026-03-10T22:30:00.000Z'),
        endTime: new Date('2026-03-10T23:30:00.000Z'),
        status: 'CONFIRMED',
      },
    });
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it('counts staffOnline using the Istanbul-local date (Mar 11), not the UTC date (Mar 10)', async () => {
    const res = await api.get('/api/restaurants/stats').set(auth(a.tokens.admin, a.restaurant.id));
    expect(res.status).toBe(200);
    expect(res.body.data.stats.staffOnline).toBe(1);
  });

  it('buckets weekly volume using the Istanbul-local day-of-week (Wed), not UTC (Tue)', async () => {
    const res = await api.get('/api/restaurants/stats').set(auth(a.tokens.admin, a.restaurant.id));
    const wed = res.body.data.volumeData.find((d: any) => d.name === 'Wed');
    const tue = res.body.data.volumeData.find((d: any) => d.name === 'Tue');
    expect(wed.total).toBe(1);
    expect(tue.total).toBe(0);
  });
});
