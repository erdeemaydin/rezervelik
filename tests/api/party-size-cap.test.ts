import { beforeAll, describe, it, expect } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, SeededTenant } from '../helpers/seed';

// Bug-audit finding: settings.maxPartySize was only ever enforced client-side
// (a bounded dropdown on the public booking form / waitlist join). A direct API
// call could send any integer, inflating peopleWaiting or creating reservations
// staff never sanity-check against the tenant's own configured maximum.
describe('Server-side party-size cap', () => {
  let a: SeededTenant;

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant();
    await prisma.restaurantSettings.update({ where: { restaurantId: a.restaurant.id }, data: { maxPartySize: 8 } });
    const zone = await prisma.zone.create({ data: { restaurantId: a.restaurant.id, name: 'Banquet' } });
    await prisma.bookableResource.create({
      data: { restaurantId: a.restaurant.id, tableTypeId: zone.id, identifier: 'B1', capacity: 40 },
    });
  });

  it('rejects a public reservation request over maxPartySize', async () => {
    const res = await api
      .post('/api/reservations')
      .set('X-Restaurant-ID', a.restaurant.id)
      .send({ customerName: 'Big Group', customerPhone: '+905550000070', guestCount: 500, startTime: '2026-10-15T10:00:00.000Z' });
    expect(res.status).toBe(400);
  });

  it('rejects a non-positive or non-integer guestCount', async () => {
    const res = await api
      .post('/api/reservations')
      .set('X-Restaurant-ID', a.restaurant.id)
      .send({ customerName: 'Ghost', customerPhone: '+905550000071', guestCount: -3, startTime: '2026-10-15T10:00:00.000Z' });
    expect(res.status).toBe(400);
  });

  it('still lets staff book a larger party manually', async () => {
    const res = await api
      .post('/api/reservations')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ customerName: 'VIP Party', customerPhone: '+905550000072', guestCount: 40, startTime: '2026-10-16T10:00:00.000Z' });
    expect(res.status).toBe(201);
  });

  it('rejects a waitlist join over maxPartySize', async () => {
    const res = await api
      .post(`/api/public/restaurant/${a.restaurant.slug}/waitlist`)
      .send({ customerName: 'Big Group', customerPhone: '+905550000073', partySize: 500 });
    expect(res.status).toBe(400);
  });
});
