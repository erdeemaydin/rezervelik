import { beforeAll, describe, it, expect } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, SeededTenant } from '../helpers/seed';

// Fix: findTableConflict only checked for *overlapping reservations* scoped to
// restaurantId+tableId — it never confirmed the table itself belongs to that
// tenant. A foreign tableId naturally has zero conflicting reservations under
// the caller's own restaurantId, so the conflict check always reported "free"
// and the write proceeded, storing another tenant's BookableResource.id on
// this tenant's Reservation (and leaking that tenant's table via
// `include: { table: true }` on GET /api/reservations). Same shape for
// categoryId/ReservationCategory. verifyTableOwnership/verifyCategoryOwnership
// in reservationConflict.ts now close this for create/update/updateSchedule/
// updateStatus.
describe('Reservation tableId/categoryId cross-tenant IDOR', () => {
  let a: SeededTenant;
  let b: SeededTenant;
  let aTableId: string;
  let bTableId: string;
  let bCategoryId: string;

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant();
    b = await seedTenant();

    const zoneA = await prisma.zone.create({ data: { restaurantId: a.restaurant.id, name: 'Main' } });
    const tableA = await prisma.bookableResource.create({
      data: { restaurantId: a.restaurant.id, tableTypeId: zoneA.id, identifier: 'A-T1', capacity: 4 },
    });
    aTableId = tableA.id;

    const zone = await prisma.zone.create({ data: { restaurantId: b.restaurant.id, name: 'Main' } });
    const table = await prisma.bookableResource.create({
      data: { restaurantId: b.restaurant.id, tableTypeId: zone.id, identifier: 'B-T1', capacity: 4 },
    });
    bTableId = table.id;

    const category = await prisma.reservationCategory.create({
      data: { restaurantId: b.restaurant.id, name: 'B Category' },
    });
    bCategoryId = category.id;
  });

  it('rejects createReservation (staff) with another tenant\'s tableId', async () => {
    const res = await api
      .post('/api/reservations')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({
        tableId: bTableId, customerName: 'Attacker', customerPhone: '+905550009001',
        guestCount: 2, startTime: '2026-12-20T18:00:00.000Z',
      });
    expect(res.status).toBe(400);

    const leaked = await prisma.reservation.findFirst({ where: { restaurantId: a.restaurant.id, tableId: bTableId } });
    expect(leaked).toBeNull();
  });

  it('rejects createReservation with another tenant\'s categoryId', async () => {
    const res = await api
      .post('/api/reservations')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({
        categoryId: bCategoryId, customerName: 'Attacker2', customerPhone: '+905550009002',
        guestCount: 2, startTime: '2026-12-20T19:00:00.000Z',
      });
    expect(res.status).toBe(400);
  });

  it('rejects updateReservation pointing an existing reservation at another tenant\'s table', async () => {
    const created = await api
      .post('/api/reservations')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ tableId: aTableId, customerName: 'Victim', customerPhone: '+905550009003', guestCount: 2, startTime: '2026-12-21T18:00:00.000Z' });
    expect(created.status).toBe(201);

    const res = await api
      .put(`/api/reservations/${created.body.data.id}`)
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({
        tableId: bTableId, customerName: 'Victim', customerPhone: '+905550009003',
        guestCount: 2, startTime: '2026-12-21T18:00:00.000Z',
      });
    expect(res.status).toBe(400);

    const stored = await prisma.reservation.findUnique({ where: { id: created.body.data.id } });
    expect(stored?.tableId).toBe(aTableId);
  });

  it('rejects updateReservationSchedule (timeline drag) onto another tenant\'s table', async () => {
    const created = await api
      .post('/api/reservations')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ tableId: aTableId, customerName: 'Victim2', customerPhone: '+905550009004', guestCount: 2, startTime: '2026-12-22T18:00:00.000Z' });
    expect(created.status).toBe(201);

    const res = await api
      .patch(`/api/reservations/${created.body.data.id}/schedule`)
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ tableId: bTableId, startTime: '2026-12-22T18:00:00.000Z' });
    expect(res.status).toBe(400);
  });

  it('rejects updateReservationStatus assigning another tenant\'s table', async () => {
    const created = await api
      .post('/api/reservations')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ tableId: aTableId, customerName: 'Victim3', customerPhone: '+905550009005', guestCount: 2, startTime: '2026-12-23T18:00:00.000Z' });
    expect(created.status).toBe(201);

    const res = await api
      .put(`/api/reservations/${created.body.data.id}/status`)
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ status: 'CONFIRMED', tableId: bTableId, skipPayment: true });
    expect(res.status).toBe(400);
  });

  it('allows the same request with the caller\'s own tenant table', async () => {
    const res = await api
      .post('/api/reservations')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({
        tableId: aTableId, customerName: 'Legit', customerPhone: '+905550009006',
        guestCount: 2, startTime: '2026-12-24T18:00:00.000Z',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.tableId).toBe(aTableId);
  });
});
