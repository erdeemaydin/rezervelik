import { beforeAll, describe, it, expect } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, SeededTenant } from '../helpers/seed';

// DaySetting.isFullyBooked is set automatically when a public request can't find a
// free table, but was never cleared automatically — a cancellation used to leave the
// day hard-blocked on the public booking page until a staff member noticed and
// manually unchecked it. These verify the auto-clear added to delete/status/reschedule.
describe('DaySetting.isFullyBooked auto-clear', () => {
  let a: SeededTenant;

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant();
  });

  async function makeReservation(status: string, date: string) {
    return prisma.reservation.create({
      data: {
        restaurantId: a.restaurant.id,
        customerName: 'Guest', customerPhone: '+905550000000', guestCount: 2,
        startTime: new Date(`${date}T12:00:00.000Z`), endTime: new Date(`${date}T14:00:00.000Z`),
        status,
      },
    });
  }

  async function fullyBooked(date: string) {
    const ds = await prisma.daySetting.findUnique({
      where: { restaurantId_date: { restaurantId: a.restaurant.id, date } },
    });
    return ds?.isFullyBooked;
  }

  it('clears the flag when a reservation holding a table is deleted', async () => {
    const date = '2026-09-01';
    await prisma.daySetting.create({ data: { restaurantId: a.restaurant.id, date, isFullyBooked: true } });
    const r = await makeReservation('CONFIRMED', date);

    const res = await api.delete(`/api/reservations/${r.id}`).set(auth(a.tokens.admin, a.restaurant.id));
    expect(res.status).toBe(200);
    expect(await fullyBooked(date)).toBe(false);
  });

  it('clears the flag when a reservation transitions to CANCELLED', async () => {
    const date = '2026-09-02';
    await prisma.daySetting.create({ data: { restaurantId: a.restaurant.id, date, isFullyBooked: true } });
    const r = await makeReservation('CONFIRMED', date);

    const res = await api
      .put(`/api/reservations/${r.id}/status`)
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ status: 'CANCELLED' });
    expect(res.status).toBe(200);
    expect(await fullyBooked(date)).toBe(false);
  });

  it('does not clear the flag on a transition that keeps the table blocked', async () => {
    const date = '2026-09-03';
    await prisma.daySetting.create({ data: { restaurantId: a.restaurant.id, date, isFullyBooked: true } });
    const r = await makeReservation('PENDING', date);

    const res = await api
      .put(`/api/reservations/${r.id}/status`)
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ status: 'CONFIRMED', skipPayment: true });
    expect(res.status).toBe(200);
    expect(await fullyBooked(date)).toBe(true);
  });

  it('clears the original day when a reservation is rescheduled off it', async () => {
    const date = '2026-09-04';
    const newDate = '2026-09-05';
    await prisma.daySetting.create({ data: { restaurantId: a.restaurant.id, date, isFullyBooked: true } });
    const r = await makeReservation('CONFIRMED', date);

    const res = await api
      .patch(`/api/reservations/${r.id}/schedule`)
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ startTime: `${newDate}T12:00:00.000Z` });
    expect(res.status).toBe(200);
    expect(await fullyBooked(date)).toBe(false);
  });
});
