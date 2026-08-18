import { beforeAll, describe, it, expect } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, SeededTenant } from '../helpers/seed';

// Bug-audit finding: acceptOffer always created a CONFIRMED reservation
// regardless of whether a table was actually assigned, and never checked
// DaySetting.maxCapacityOverride — both enforced on the regular public
// booking path (createReservation) but silently skippable by routing a
// booking through a waitlist offer instead.
describe('Waitlist offer-accept respects table assignment and day-capacity cap', () => {
  let a: SeededTenant;
  const date = '2026-12-01';

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant();
  });

  it('creates a PENDING, unassigned reservation (not CONFIRMED) when no table is free, and still issues a confirmationCode', async () => {
    // No BookableResource exists at all for this tenant yet.
    const entry = await prisma.waitlistEntry.create({
      data: {
        restaurantId: a.restaurant.id,
        customerName: 'No Table Guest',
        customerPhone: '+905550003001',
        partySize: 2,
        status: 'WAITING',
        targetDate: date,
      },
    });

    const offerRes = await api
      .post(`/api/wait-time/entries/${entry.id}/offer`)
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ offeredTime: '19:00' });
    expect(offerRes.status).toBe(200);
    const token = offerRes.body.data.offerToken;

    const acceptRes = await api.post(`/api/public/offer/${token}/accept`);
    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.data.confirmationCode).toMatch(/^[1-9]\d{5}$/);

    const reservation = await prisma.reservation.findFirst({ where: { restaurantId: a.restaurant.id, customerPhone: '+905550003001' } });
    expect(reservation).toBeTruthy();
    expect(reservation!.status).toBe('PENDING');
    expect(reservation!.tableId).toBeNull();
    expect(reservation!.confirmationCode).toBe(acceptRes.body.data.confirmationCode);
  });

  it('confirms outright when a table is actually free', async () => {
    const zone = await prisma.zone.create({ data: { restaurantId: a.restaurant.id, name: 'Main' } });
    await prisma.bookableResource.create({
      data: { restaurantId: a.restaurant.id, tableTypeId: zone.id, identifier: 'W1', capacity: 4 },
    });

    const entry = await prisma.waitlistEntry.create({
      data: {
        restaurantId: a.restaurant.id,
        customerName: 'Table Guest',
        customerPhone: '+905550003002',
        partySize: 2,
        status: 'WAITING',
        targetDate: date,
      },
    });
    const offerRes = await api
      .post(`/api/wait-time/entries/${entry.id}/offer`)
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ offeredTime: '20:00' });
    const token = offerRes.body.data.offerToken;

    const acceptRes = await api.post(`/api/public/offer/${token}/accept`);
    expect(acceptRes.status).toBe(200);

    const reservation = await prisma.reservation.findFirst({ where: { restaurantId: a.restaurant.id, customerPhone: '+905550003002' } });
    expect(reservation!.status).toBe('CONFIRMED');
    expect(reservation!.tableId).toBeTruthy();
  });

  it('rejects an offer accept that would push a capacity-capped day over its limit', async () => {
    const cappedDate = '2026-12-02';
    await prisma.daySetting.create({
      data: { restaurantId: a.restaurant.id, date: cappedDate, maxCapacityOverride: 4 },
    });
    // Already-booked covers for the day, at the cap.
    await prisma.reservation.create({
      data: {
        restaurantId: a.restaurant.id, customerName: 'Filler', customerPhone: '+905550003099', guestCount: 4,
        startTime: new Date(`${cappedDate}T12:00:00.000Z`), endTime: new Date(`${cappedDate}T14:00:00.000Z`), status: 'CONFIRMED',
      },
    });

    const entry = await prisma.waitlistEntry.create({
      data: {
        restaurantId: a.restaurant.id,
        customerName: 'Over Cap Guest',
        customerPhone: '+905550003003',
        partySize: 2,
        status: 'WAITING',
        targetDate: cappedDate,
      },
    });
    const offerRes = await api
      .post(`/api/wait-time/entries/${entry.id}/offer`)
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ offeredTime: '19:00' });
    const token = offerRes.body.data.offerToken;

    const acceptRes = await api.post(`/api/public/offer/${token}/accept`);
    expect(acceptRes.status).toBe(409);
    expect(acceptRes.body.details?.code).toBe('DAY_CAPACITY_EXCEEDED');

    // Rolled back entirely: no reservation created, and the offer is still
    // acceptable (not stuck ACCEPTED with nothing to show for it).
    const reservation = await prisma.reservation.findFirst({ where: { restaurantId: a.restaurant.id, customerPhone: '+905550003003' } });
    expect(reservation).toBeNull();
    const updatedEntry = await prisma.waitlistEntry.findUnique({ where: { id: entry.id } });
    expect(updatedEntry!.status).toBe('OFFERED');
  });
});
