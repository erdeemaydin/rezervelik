import { beforeAll, describe, it, expect } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, SeededTenant } from '../helpers/seed';

// MANUAL_AVAILABILITY mode (docs/architecture/PROJECT_LOGIC.md §3): staff manually toggle a table's
// isAvailable flag, and that's supposed to be the only thing gating new bookings on
// it — no strict end-time overlap check. The flag existed and was toggleable, but
// nothing in the booking path ever read it, so marking a table "Occupied" had zero
// effect: auto-assign and explicit selection would still book onto it.
describe('MANUAL_AVAILABILITY mode gates bookings on isAvailable', () => {
  let a: SeededTenant;
  let table: { id: string };

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant();
    await prisma.restaurantSettings.update({ where: { restaurantId: a.restaurant.id }, data: { logic: 'MANUAL_AVAILABILITY' } });
    const zone = await prisma.zone.create({ data: { restaurantId: a.restaurant.id, name: 'Main' } });
    table = await prisma.bookableResource.create({
      data: { restaurantId: a.restaurant.id, tableTypeId: zone.id, identifier: 'T1', capacity: 4, isAvailable: true },
    });
  });

  it('blocks explicit selection of a table marked unavailable', async () => {
    await prisma.bookableResource.update({ where: { id: table.id }, data: { isAvailable: false } });

    const res = await api
      .post('/api/reservations')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ tableId: table.id, customerName: 'Ada', customerPhone: '+905550000020', guestCount: 2, startTime: '2026-11-01T18:00:00.000Z' });
    expect(res.status).toBe(409);
    expect(res.body.details?.code).toBe('TABLE_CONFLICT');
  });

  it('excludes an unavailable table from auto-assignment (public booking)', async () => {
    // table is still isAvailable:false from the previous test. A public/customer
    // request (no Authorization header) can't fall back to an unassigned booking
    // the way a staff request can, so it hits the same FULLY_BOOKED rejection as
    // "every table taken" in the other reservation modes.
    const res = await api
      .post('/api/reservations')
      .set('X-Restaurant-ID', a.restaurant.id)
      .send({ customerName: 'Bo', customerPhone: '+905550000021', guestCount: 2, startTime: '2026-11-01T18:00:00.000Z', consentAccepted: true });
    expect(res.status).toBe(409);
    expect(res.body.details?.code).toBe('FULLY_BOOKED');
  });

  it('allows booking once staff mark the table available again, ignoring any time overlap', async () => {
    await prisma.bookableResource.update({ where: { id: table.id }, data: { isAvailable: true } });

    const first = await api
      .post('/api/reservations')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ tableId: table.id, customerName: 'Cy', customerPhone: '+905550000022', guestCount: 2, startTime: '2026-11-01T18:00:00.000Z' });
    expect(first.status).toBe(201);

    // MANUAL_AVAILABILITY has no strict end-time concept — a second booking on the
    // same still-"available" table at an overlapping time is allowed (staff, not
    // the timeline, are responsible for clearing the table between parties).
    const second = await api
      .post('/api/reservations')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ tableId: table.id, customerName: 'Deniz', customerPhone: '+905550000023', guestCount: 2, startTime: '2026-11-01T18:30:00.000Z' });
    expect(second.status).toBe(201);
  });
});
