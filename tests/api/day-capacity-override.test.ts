import { beforeAll, describe, it, expect } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, SeededTenant } from '../helpers/seed';

// Feature: DaySetting.maxCapacityOverride was stored/returned but never
// enforced anywhere — staff could set a total-covers cap for a date (e.g. a
// private event or reduced staffing) and it had zero effect on the booking
// flow. Now enforced in createReservation (public bookings only — staff keep
// full discretion, same convention as maxPartySize) and surfaced on the
// public GET /api/public/day-status endpoint.
describe('DaySetting.maxCapacityOverride enforcement', () => {
  let a: SeededTenant;
  const date = '2026-11-10';

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant();
    const zone = await prisma.zone.create({ data: { restaurantId: a.restaurant.id, name: 'Main' } });
    // Two separate tables, both generously sized — enough that table
    // *availability* is never what blocks these requests; only the day cap
    // should (a single shared table would otherwise reject a second
    // same-time-slot booking on table-conflict grounds, which isn't what
    // this feature is testing).
    await prisma.bookableResource.create({
      data: { restaurantId: a.restaurant.id, tableTypeId: zone.id, identifier: 'T1', capacity: 20 },
    });
    await prisma.bookableResource.create({
      data: { restaurantId: a.restaurant.id, tableTypeId: zone.id, identifier: 'T2', capacity: 20 },
    });
    await prisma.restaurantSettings.update({ where: { restaurantId: a.restaurant.id }, data: { maxPartySize: 50 } });
    await prisma.daySetting.create({
      data: { restaurantId: a.restaurant.id, date, autoConfirm: true, maxCapacityOverride: 10 },
    });
  });

  async function bookPublic(guestCount: number, phone: string) {
    return api
      .post('/api/reservations')
      .set('X-Restaurant-ID', a.restaurant.id)
      .send({ customerName: 'Guest', customerPhone: phone, guestCount, startTime: `${date}T12:00:00.000Z`, consentAccepted: true });
  }

  it('allows public bookings that stay within the cap', async () => {
    const res = await bookPublic(6, '+905550001001');
    expect(res.status).toBe(201);
  });

  it('rejects a public booking that would push the day over the cap', async () => {
    // 6 already booked above; +6 more would be 12 > cap of 10.
    const res = await bookPublic(6, '+905550001002');
    expect(res.status).toBe(409);
    expect(res.body.details?.code).toBe('DAY_CAPACITY_EXCEEDED');
  });

  it('allows a public booking that exactly fills the remaining capacity', async () => {
    // 6 booked so far; exactly 4 more reaches the cap of 10, not over it.
    const res = await bookPublic(4, '+905550001003');
    expect(res.status).toBe(201);
  });

  it('still lets staff exceed the cap deliberately', async () => {
    const res = await api
      .post('/api/reservations')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ customerName: 'VIP Override', customerPhone: '+905550001004', guestCount: 5, startTime: `${date}T12:00:00.000Z` });
    expect(res.status).toBe(201);
  });

  it('a canceled reservation frees up capacity for a new public booking', async () => {
    const otherDate = '2026-11-11';
    await prisma.daySetting.create({
      data: { restaurantId: a.restaurant.id, date: otherDate, autoConfirm: true, maxCapacityOverride: 4 },
    });
    const first = await api
      .post('/api/reservations')
      .set('X-Restaurant-ID', a.restaurant.id)
      .send({ customerName: 'Guest', customerPhone: '+905550001005', guestCount: 4, startTime: `${otherDate}T12:00:00.000Z`, consentAccepted: true });
    expect(first.status).toBe(201);

    const blocked = await api
      .post('/api/reservations')
      .set('X-Restaurant-ID', a.restaurant.id)
      .send({ customerName: 'Guest2', customerPhone: '+905550001006', guestCount: 2, startTime: `${otherDate}T12:00:00.000Z`, consentAccepted: true });
    expect(blocked.status).toBe(409);

    await api
      .put(`/api/reservations/${first.body.data.id}/status`)
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ status: 'CANCELLED' });

    const afterCancel = await api
      .post('/api/reservations')
      .set('X-Restaurant-ID', a.restaurant.id)
      .send({ customerName: 'Guest3', customerPhone: '+905550001007', guestCount: 2, startTime: `${otherDate}T12:00:00.000Z`, consentAccepted: true });
    expect(afterCancel.status).toBe(201);
  });

  it('a date with no maxCapacityOverride is never capped', async () => {
    const uncappedDate = '2026-11-12';
    const res = await api
      .post('/api/reservations')
      .set('X-Restaurant-ID', a.restaurant.id)
      .send({ customerName: 'Guest', customerPhone: '+905550001008', guestCount: 15, startTime: `${uncappedDate}T12:00:00.000Z`, consentAccepted: true });
    expect(res.status).toBe(201);
  });
});

describe('GET /api/public/day-status surfaces remaining capacity', () => {
  let a: SeededTenant;
  const date = '2026-11-20';

  beforeAll(async () => {
    a = await seedTenant();
    const zone = await prisma.zone.create({ data: { restaurantId: a.restaurant.id, name: 'Main' } });
    await prisma.bookableResource.create({
      data: { restaurantId: a.restaurant.id, tableTypeId: zone.id, identifier: 'T1', capacity: 20 },
    });
    await prisma.daySetting.create({
      data: { restaurantId: a.restaurant.id, date, autoConfirm: true, maxCapacityOverride: 10 },
    });
  });

  it('reports full remaining capacity with no bookings yet', async () => {
    const res = await api.get('/api/public/day-status').query({ slug: a.restaurant.slug, date });
    expect(res.status).toBe(200);
    expect(res.body.data.daySetting.remainingCapacity).toBe(10);
    expect(res.body.data.daySetting.isCapacityFull).toBe(false);
  });

  it('reports reduced remaining capacity and isCapacityFull once the cap is reached', async () => {
    await prisma.reservation.create({
      data: {
        restaurantId: a.restaurant.id, customerName: 'X', customerPhone: '+900', guestCount: 10,
        startTime: new Date(`${date}T12:00:00.000Z`), endTime: new Date(`${date}T14:00:00.000Z`), status: 'CONFIRMED',
      },
    });
    const res = await api.get('/api/public/day-status').query({ slug: a.restaurant.slug, date });
    expect(res.status).toBe(200);
    expect(res.body.data.daySetting.remainingCapacity).toBe(0);
    expect(res.body.data.daySetting.isCapacityFull).toBe(true);
  });

  it('omits capacity fields entirely for a date with no override set', async () => {
    const otherDate = '2026-11-21';
    const res = await api.get('/api/public/day-status').query({ slug: a.restaurant.slug, date: otherDate });
    expect(res.status).toBe(200);
    expect(res.body.data.daySetting.remainingCapacity).toBeUndefined();
    expect(res.body.data.daySetting.isCapacityFull).toBeUndefined();
  });
});
