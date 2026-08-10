import { beforeAll, describe, it, expect } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, SeededTenant } from '../helpers/seed';

// Overbooking (RestaurantSettings.allowOverbooking / DaySetting override): when
// no table is free for a public request but the party could fit somewhere in
// the restaurant, admins can opt in to soft-accepting the reservation as
// PENDING (isOverbooked: true, exposed to callers as possiblyFullyBooked)
// instead of hard-rejecting it, up to two admin-configured caps (extra covers,
// extra reservations). The feature is inert unless both caps resolve to a
// positive integer.
describe('Overbooking settings validation', () => {
  let a: SeededTenant;

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant();
  });

  it('rejects enabling allowOverbooking without both caps', async () => {
    const res = await api
      .put('/api/settings')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ allowOverbooking: true });
    expect(res.status).toBe(400);
  });

  it('rejects enabling allowOverbooking with only one cap set', async () => {
    const res = await api
      .put('/api/settings')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ allowOverbooking: true, overbookingMaxExtraCovers: 10 });
    expect(res.status).toBe(400);
  });

  it('rejects a non-positive-integer cap', async () => {
    const res = await api
      .put('/api/settings')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ overbookingMaxExtraCovers: 0, overbookingMaxExtraReservations: 5 });
    expect(res.status).toBe(400);
  });

  it('accepts enabling allowOverbooking with both caps set', async () => {
    const res = await api
      .put('/api/settings')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ allowOverbooking: true, overbookingMaxExtraCovers: 10, overbookingMaxExtraReservations: 3 });
    expect(res.status).toBe(200);
    expect(res.body.data.allowOverbooking).toBe(true);
    expect(res.body.data.overbookingMaxExtraCovers).toBe(10);
    expect(res.body.data.overbookingMaxExtraReservations).toBe(3);
  });

  it('allows disabling without needing caps', async () => {
    const res = await api
      .put('/api/settings')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ allowOverbooking: false });
    expect(res.status).toBe(200);
    expect(res.body.data.allowOverbooking).toBe(false);
  });
});

describe('DaySetting overbooking override validation', () => {
  let a: SeededTenant;
  const date = '2026-12-01';

  beforeAll(async () => {
    a = await seedTenant();
  });

  it('rejects enabling the override without both override caps', async () => {
    const res = await api
      .post('/api/day-settings')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ date, allowOverbookingOverride: true });
    expect(res.status).toBe(400);
  });

  it('accepts enabling the override with both caps', async () => {
    const res = await api
      .post('/api/day-settings')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({
        date, allowOverbookingOverride: true,
        overbookingMaxExtraCoversOverride: 4, overbookingMaxExtraReservationsOverride: 1,
      });
    expect(res.status).toBe(200);
    expect(res.body.data.allowOverbookingOverride).toBe(true);
  });

  it('accepts explicitly disabling the override with no caps, and clears any stored caps', async () => {
    const res = await api
      .post('/api/day-settings')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ date, allowOverbookingOverride: false });
    expect(res.status).toBe(200);
    expect(res.body.data.allowOverbookingOverride).toBe(false);
    expect(res.body.data.overbookingMaxExtraCoversOverride).toBeNull();
  });
});

describe('Overbooking booking flow', () => {
  let a: SeededTenant;

  // A single table (capacity 20), shared across every test in this describe.
  // Each test occupies it for its own date/time so "no table free, but the
  // party could fit somewhere" reliably holds — creating a fresh table per
  // test would leave earlier tests' tables sitting idle and free on later
  // tests' dates, defeating the precondition.
  let tableId: string;

  async function occupyTable(date: string, guestCount = 20) {
    return prisma.reservation.create({
      data: {
        restaurantId: a.restaurant.id, tableId, customerName: 'Occupant', customerPhone: '+905550009000', guestCount,
        startTime: new Date(`${date}T12:00:00.000Z`), endTime: new Date(`${date}T14:00:00.000Z`), status: 'CONFIRMED',
      },
    });
  }

  async function bookPublic(date: string, guestCount: number, phone: string) {
    return api
      .post('/api/reservations')
      .set('X-Restaurant-ID', a.restaurant.id)
      .send({ customerName: 'Guest', customerPhone: phone, guestCount, startTime: `${date}T12:00:00.000Z` });
  }

  beforeAll(async () => {
    a = await seedTenant();
    await prisma.restaurantSettings.update({ where: { restaurantId: a.restaurant.id }, data: { maxPartySize: 50 } });
    const zone = await prisma.zone.create({ data: { restaurantId: a.restaurant.id, name: 'Main' } });
    const table = await prisma.bookableResource.create({
      data: { restaurantId: a.restaurant.id, tableTypeId: zone.id, identifier: 'T1', capacity: 20 },
    });
    tableId = table.id;
  });

  it('hard-rejects with FULLY_BOOKED when overbooking is off (default)', async () => {
    const date = '2026-12-10';
    await occupyTable(date);
    const res = await bookPublic(date, 2, '+905550009001');
    expect(res.status).toBe(409);
    expect(res.body.details?.code).toBe('FULLY_BOOKED');
  });

  it('soft-accepts as PENDING with possiblyFullyBooked when overbooking is enabled and under caps', async () => {
    const date = '2026-12-11';
    await occupyTable(date);
    await prisma.restaurantSettings.update({
      where: { restaurantId: a.restaurant.id },
      data: { allowOverbooking: true, overbookingMaxExtraCovers: 10, overbookingMaxExtraReservations: 2 },
    });

    const res = await bookPublic(date, 3, '+905550009002');
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data.tableId).toBeNull();
    expect(res.body.data.possiblyFullyBooked).toBe(true);

    const stored = await prisma.reservation.findUnique({ where: { id: res.body.data.id } });
    expect(stored?.isOverbooked).toBe(true);
  });

  it('hard-rejects once the extra-reservations cap is reached', async () => {
    const date = '2026-12-12';
    await occupyTable(date);
    await prisma.restaurantSettings.update({
      where: { restaurantId: a.restaurant.id },
      data: { allowOverbooking: true, overbookingMaxExtraCovers: 100, overbookingMaxExtraReservations: 1 },
    });

    const first = await bookPublic(date, 2, '+905550009003');
    expect(first.status).toBe(201);
    expect(first.body.data.possiblyFullyBooked).toBe(true);

    const second = await bookPublic(date, 2, '+905550009004');
    expect(second.status).toBe(409);
    expect(second.body.details?.code).toBe('FULLY_BOOKED');
  });

  it('hard-rejects once the extra-covers cap would be exceeded, even under the reservations cap', async () => {
    const date = '2026-12-13';
    await occupyTable(date, 20);
    await prisma.restaurantSettings.update({
      where: { restaurantId: a.restaurant.id },
      data: { allowOverbooking: true, overbookingMaxExtraCovers: 5, overbookingMaxExtraReservations: 10 },
    });

    const res = await bookPublic(date, 6, '+905550009005');
    expect(res.status).toBe(409);
    expect(res.body.details?.code).toBe('FULLY_BOOKED');
  });

  it('a DaySetting override disables overbooking for a specific day even though the global setting is on', async () => {
    const date = '2026-12-14';
    await occupyTable(date);
    await prisma.restaurantSettings.update({
      where: { restaurantId: a.restaurant.id },
      data: { allowOverbooking: true, overbookingMaxExtraCovers: 10, overbookingMaxExtraReservations: 10 },
    });
    await prisma.daySetting.create({
      data: { restaurantId: a.restaurant.id, date, allowOverbookingOverride: false },
    });

    const res = await bookPublic(date, 2, '+905550009006');
    expect(res.status).toBe(409);
    expect(res.body.details?.code).toBe('FULLY_BOOKED');
  });

  it('a DaySetting override can enable overbooking with its own caps for a specific day even when the global setting is off', async () => {
    const date = '2026-12-15';
    await occupyTable(date);
    await prisma.restaurantSettings.update({
      where: { restaurantId: a.restaurant.id },
      data: { allowOverbooking: false },
    });
    await prisma.daySetting.create({
      data: {
        restaurantId: a.restaurant.id, date,
        allowOverbookingOverride: true, overbookingMaxExtraCoversOverride: 3, overbookingMaxExtraReservationsOverride: 1,
      },
    });

    const res = await bookPublic(date, 2, '+905550009007');
    expect(res.status).toBe(201);
    expect(res.body.data.possiblyFullyBooked).toBe(true);
  });

  it('staff can still force an unassigned pending booking regardless of overbooking config, without counting as overbooked', async () => {
    const date = '2026-12-16';
    await occupyTable(date);
    await prisma.restaurantSettings.update({
      where: { restaurantId: a.restaurant.id },
      data: { allowOverbooking: false },
    });

    const res = await api
      .post('/api/reservations')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ customerName: 'Staff Booking', customerPhone: '+905550009008', guestCount: 2, startTime: `${date}T12:00:00.000Z` });
    expect(res.status).toBe(201);
    expect(res.body.data.tableId).toBeNull();
    const stored = await prisma.reservation.findUnique({ where: { id: res.body.data.id } });
    expect(stored?.isOverbooked).toBe(false);
  });
});
