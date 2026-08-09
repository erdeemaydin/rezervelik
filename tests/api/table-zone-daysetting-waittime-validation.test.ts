import { beforeAll, describe, it, expect } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, SeededTenant } from '../helpers/seed';

describe('Table capacity validation', () => {
  let a: SeededTenant;
  let zoneId: string;

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant();
    const zone = await prisma.zone.create({ data: { restaurantId: a.restaurant.id, name: 'Main' } });
    zoneId = zone.id;
  });

  it('rejects a negative capacity on create', async () => {
    const res = await api
      .post('/api/tables')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ tableTypeId: zoneId, identifier: 'T1', capacity: -5 });
    expect(res.status).toBe(400);
  });

  it('rejects a non-numeric capacity on create', async () => {
    const res = await api
      .post('/api/tables')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ tableTypeId: zoneId, identifier: 'T2', capacity: 'lots' });
    expect(res.status).toBe(400);
  });

  it('accepts a valid positive capacity', async () => {
    const res = await api
      .post('/api/tables')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ tableTypeId: zoneId, identifier: 'T3', capacity: 4 });
    expect(res.status).toBe(201);
  });

  it('rejects updating a table to a negative capacity', async () => {
    const created = await api
      .post('/api/tables')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ tableTypeId: zoneId, identifier: 'T4', capacity: 2 });
    const res = await api
      .put(`/api/tables/${created.body.data.id}`)
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ capacity: -1 });
    expect(res.status).toBe(400);
  });
});

describe('Zone (table type) deletion and cycle validation', () => {
  let a: SeededTenant;

  beforeAll(async () => {
    a = await seedTenant();
  });

  it('returns a clean 400 (not 500) deleting a zone that still has tables assigned', async () => {
    const zone = await prisma.zone.create({ data: { restaurantId: a.restaurant.id, name: 'Occupied' } });
    await prisma.bookableResource.create({
      data: { restaurantId: a.restaurant.id, tableTypeId: zone.id, identifier: 'X1', capacity: 2 },
    });

    const res = await api.delete(`/api/table-types/${zone.id}`).set(auth(a.tokens.admin, a.restaurant.id));
    expect(res.status).toBe(400);
  });

  it('deleting a zone with child zones orphans them (parentId set null) rather than erroring', async () => {
    // Zone.parentId is a nullable FK with Prisma's default SetNull behavior
    // (unlike BookableResource.tableTypeId, which is required and correctly
    // blocks via the P2003 handler above) — pinning the actual current
    // behavior here rather than assuming both cases fail the same way.
    const parent = await prisma.zone.create({ data: { restaurantId: a.restaurant.id, name: 'Parent' } });
    const child = await prisma.zone.create({ data: { restaurantId: a.restaurant.id, name: 'Child', parentId: parent.id } });

    const res = await api.delete(`/api/table-types/${parent.id}`).set(auth(a.tokens.admin, a.restaurant.id));
    expect(res.status).toBe(200);

    const orphan = await prisma.zone.findUnique({ where: { id: child.id } });
    expect(orphan!.parentId).toBeNull();
  });

  it('rejects a deep zone cycle (A -> B -> A), not just a direct self-parent', async () => {
    const zoneA = await prisma.zone.create({ data: { restaurantId: a.restaurant.id, name: 'ZoneA' } });
    const zoneB = await prisma.zone.create({ data: { restaurantId: a.restaurant.id, name: 'ZoneB', parentId: zoneA.id } });

    const res = await api
      .put(`/api/table-types/${zoneA.id}`)
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ parentId: zoneB.id });
    expect(res.status).toBe(400);
  });
});

describe('DaySetting deletion', () => {
  let a: SeededTenant;

  beforeAll(async () => {
    a = await seedTenant();
  });

  it('returns 404 (not 500) deleting a date with no existing DaySetting row', async () => {
    const res = await api.delete('/api/day-settings/2026-12-25').set(auth(a.tokens.admin, a.restaurant.id));
    expect(res.status).toBe(404);
  });

  it('deletes a real DaySetting row successfully', async () => {
    await api.post('/api/day-settings').set(auth(a.tokens.admin, a.restaurant.id)).send({ date: '2026-12-26', isFullyBooked: true });
    const res = await api.delete('/api/day-settings/2026-12-26').set(auth(a.tokens.admin, a.restaurant.id));
    expect(res.status).toBe(200);
  });
});

describe('WaitTime config and offer validation', () => {
  let a: SeededTenant;

  beforeAll(async () => {
    a = await seedTenant();
  });

  it('rejects a negative peopleWaiting', async () => {
    const res = await api.put('/api/wait-time/config').set(auth(a.tokens.admin, a.restaurant.id)).send({ peopleWaiting: -5 });
    expect(res.status).toBe(400);
  });

  it('rejects a non-numeric peopleWaiting', async () => {
    const res = await api.put('/api/wait-time/config').set(auth(a.tokens.admin, a.restaurant.id)).send({ peopleWaiting: 'lots' });
    expect(res.status).toBe(400);
  });

  it('rejects a negative expiresInHours when sending an offer', async () => {
    const entry = await prisma.waitlistEntry.create({
      data: { restaurantId: a.restaurant.id, customerName: 'X', customerPhone: '+900', partySize: 2 },
    });
    const res = await api
      .post(`/api/wait-time/entries/${entry.id}/offer`)
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ offeredTime: '19:30', expiresInHours: -1 });
    expect(res.status).toBe(400);
  });

  it('rejects a non-numeric expiresInHours when sending an offer', async () => {
    const entry = await prisma.waitlistEntry.create({
      data: { restaurantId: a.restaurant.id, customerName: 'Y', customerPhone: '+900', partySize: 2 },
    });
    const res = await api
      .post(`/api/wait-time/entries/${entry.id}/offer`)
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ offeredTime: '19:30', expiresInHours: 'a while' });
    expect(res.status).toBe(400);
  });

  it('staff-added walk-in increments peopleWaiting like the public join does, and seating it decrements back', async () => {
    await prisma.waitTimeConfig.upsert({
      where: { restaurantId: a.restaurant.id },
      update: { isWaitTimeCalculated: true, peopleWaiting: 0 },
      create: { restaurantId: a.restaurant.id, isWaitTimeCalculated: true, peopleWaiting: 0 },
    });

    const joined = await api
      .post('/api/wait-time/entries')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ customerName: 'Walkin', customerPhone: '+905550000000', partySize: 4 });
    expect(joined.status).toBe(201);

    const afterJoin = await prisma.waitTimeConfig.findUnique({ where: { restaurantId: a.restaurant.id } });
    expect(afterJoin!.peopleWaiting).toBe(4);

    const seated = await api
      .put(`/api/wait-time/entries/${joined.body.data.id}/status`)
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ status: 'SEATED' });
    expect(seated.status).toBe(200);

    const afterSeat = await prisma.waitTimeConfig.findUnique({ where: { restaurantId: a.restaurant.id } });
    expect(afterSeat!.peopleWaiting).toBe(0);
  });
});
