import { beforeAll, describe, it, expect } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, SeededTenant } from '../helpers/seed';

// Regression: createReservation/updateReservation/updateReservationSchedule all did
// `new Date(startTime)` (and updateReservation also `parseInt(guestCount)`) with no
// validation that the result was actually a valid Date/number. A malformed value
// produced an Invalid Date (or NaN), which blew up downstream — restaurantDateStr's
// Intl.DateTimeFormat throws a RangeError on an Invalid Date, and Prisma rejects
// NaN/Invalid Date for Int/DateTime columns — so both fell through to the generic
// 500 handler instead of a clean 400. createReservation is the *public,
// unauthenticated* booking endpoint, so any anonymous caller could trigger this.
describe('Reservation endpoints reject invalid startTime/guestCount with 400, not 500', () => {
  let a: SeededTenant;

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant();
  });

  it('createReservation (public) returns 400 on a non-parseable startTime', async () => {
    const res = await api
      .post('/api/reservations')
      .set('X-Restaurant-ID', a.restaurant.id)
      .send({ customerName: 'Ada', customerPhone: '+905550000020', guestCount: 2, startTime: 'not-a-date', consentAccepted: true });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('updateReservation returns 400 on a non-parseable startTime', async () => {
    const created = await prisma.reservation.create({
      data: {
        restaurantId: a.restaurant.id,
        customerName: 'Bo', customerPhone: '+905550000021', guestCount: 2,
        startTime: new Date('2026-08-10T10:00:00Z'), endTime: new Date('2026-08-10T11:00:00Z'),
        status: 'PENDING', consentAccepted: true,
      },
    });

    const res = await api
      .put(`/api/reservations/${created.id}`)
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ customerName: 'Bo', customerPhone: '+905550000021', guestCount: 2, startTime: 'garbage' });
    expect(res.status).toBe(400);

    // The row must be untouched — a would-be crash must not partially write.
    const unchanged = await prisma.reservation.findUnique({ where: { id: created.id } });
    expect(unchanged!.startTime.toISOString()).toBe('2026-08-10T10:00:00.000Z');
  });

  it('updateReservation returns 400 on a non-numeric guestCount', async () => {
    const created = await prisma.reservation.create({
      data: {
        restaurantId: a.restaurant.id,
        customerName: 'Cy', customerPhone: '+905550000022', guestCount: 2,
        startTime: new Date('2026-08-10T10:00:00Z'), endTime: new Date('2026-08-10T11:00:00Z'),
        status: 'PENDING', consentAccepted: true,
      },
    });

    const res = await api
      .put(`/api/reservations/${created.id}`)
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ customerName: 'Cy', customerPhone: '+905550000022', guestCount: 'not-a-number', startTime: '2026-08-10T11:00:00.000Z' });
    expect(res.status).toBe(400);
  });

  it('updateReservationSchedule returns 400 on a non-parseable startTime', async () => {
    const created = await prisma.reservation.create({
      data: {
        restaurantId: a.restaurant.id,
        customerName: 'Di', customerPhone: '+905550000023', guestCount: 2,
        startTime: new Date('2026-08-10T10:00:00Z'), endTime: new Date('2026-08-10T11:00:00Z'),
        status: 'PENDING', consentAccepted: true,
      },
    });

    const res = await api
      .patch(`/api/reservations/${created.id}/schedule`)
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ startTime: 'still-garbage' });
    expect(res.status).toBe(400);
  });

  it('updateReservationSchedule returns 400 on a non-parseable endTime', async () => {
    const created = await prisma.reservation.create({
      data: {
        restaurantId: a.restaurant.id,
        customerName: 'Eli', customerPhone: '+905550000024', guestCount: 2,
        startTime: new Date('2026-08-10T10:00:00Z'), endTime: new Date('2026-08-10T11:00:00Z'),
        status: 'PENDING', consentAccepted: true,
      },
    });

    const res = await api
      .patch(`/api/reservations/${created.id}/schedule`)
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ startTime: '2026-08-10T10:00:00.000Z', endTime: 'not-valid-either' });
    expect(res.status).toBe(400);
  });
});
