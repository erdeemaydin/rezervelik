import { beforeAll, describe, it, expect } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, SeededTenant } from '../helpers/seed';

// analyticsController resolved "today" and peak-hours buckets using server-local
// time (.getHours()/.getDate()) instead of the restaurant's configured timezone.
// Restaurants default to Europe/Istanbul (UTC+3); on a UTC-deployed server, a
// reservation just after Istanbul local midnight was still "yesterday" server-side,
// and every hour bucket was off by ~3.
describe('Analytics respects the restaurant timezone, not server-local time', () => {
  let a: SeededTenant;

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant();
    // Default RestaurantSettings.timezone is Europe/Istanbul (UTC+3).

    // 2026-01-15T22:00:00Z = 2026-01-16T01:00 Istanbul time — a different calendar
    // day, and a different hour (1am, not 22:00), than naive UTC/server-local
    // reading would produce.
    await prisma.reservation.create({
      data: {
        restaurantId: a.restaurant.id,
        customerName: 'Late Night Guest',
        customerPhone: '+905550000040',
        guestCount: 2,
        startTime: new Date('2026-01-15T22:00:00.000Z'),
        endTime: new Date('2026-01-15T23:30:00.000Z'),
        status: 'CONFIRMED',
      },
    });
  });

  it('buckets the reservation into the Istanbul-local day (Jan 16), not the UTC day (Jan 15)', async () => {
    const jan16 = await api
      .get('/api/restaurants/today?date=2026-01-16')
      .set(auth(a.tokens.admin, a.restaurant.id));
    expect(jan16.status).toBe(200);
    expect(jan16.body.data.todayReservations).toBe(1);
    expect(jan16.body.data.date).toBe('2026-01-16');

    const jan15 = await api
      .get('/api/restaurants/today?date=2026-01-15')
      .set(auth(a.tokens.admin, a.restaurant.id));
    expect(jan15.body.data.todayReservations).toBe(0);
  });

  it('buckets today-by-hour using the Istanbul-local hour (1am), not the UTC hour (22)', async () => {
    const res = await api
      .get('/api/restaurants/today?date=2026-01-16')
      .set(auth(a.tokens.admin, a.restaurant.id));
    const hour1 = res.body.data.todayByHour.find((h: any) => h.hour === 1);
    const hour22 = res.body.data.todayByHour.find((h: any) => h.hour === 22);
    expect(hour1.count).toBe(1);
    expect(hour22.count).toBe(0);
  });

  it('buckets analytics peak-hours using the Istanbul-local day-of-week and hour', async () => {
    const res = await api
      .get('/api/restaurants/analytics?from=2026-01-01&to=2026-01-31')
      .set(auth(a.tokens.admin, a.restaurant.id));
    expect(res.status).toBe(200);
    // 2026-01-16 is a Friday (dayOfWeek 5) in local Istanbul time; the UTC instant
    // (Jan 15, still Thursday=4 at hour 22) would give a different key entirely.
    const peak = res.body.data.peakHours.find((p: any) => p.dayOfWeek === 5 && p.hour === 1);
    expect(peak).toBeTruthy();
    expect(peak.count).toBe(1);

    const wrongBucket = res.body.data.peakHours.find((p: any) => p.dayOfWeek === 4 && p.hour === 22);
    expect(wrongBucket).toBeUndefined();

    const dailyEntry = res.body.data.dailyTrend.find((d: any) => d.date === '2026-01-16');
    expect(dailyEntry?.reservations).toBe(1);
  });
});
