import { beforeAll, describe, it, expect } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, SeededTenant } from '../helpers/seed';

// WaitTimeConfig.peopleWaiting used to only ever increment (joinPublicWaitlist) and
// was never decremented when an entry left the active queue, so quoted wait times
// climbed indefinitely over a service. Verifies the counter now comes back down.
describe('WaitTimeConfig.peopleWaiting auto-decrements', () => {
  let a: SeededTenant;

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant();
    await prisma.waitTimeConfig.upsert({
      where: { restaurantId: a.restaurant.id },
      update: { isWaitlistOpen: true, isWaitTimeCalculated: true, peopleWaiting: 0, waitTimePerPersonUpper: 8 },
      create: { restaurantId: a.restaurant.id, isWaitlistOpen: true, isWaitTimeCalculated: true, peopleWaiting: 0, waitTimePerPersonUpper: 8 },
    });
  });

  const config = () => prisma.waitTimeConfig.findUnique({ where: { restaurantId: a.restaurant.id } });

  it('decrements when a party is seated', async () => {
    const join = await api
      .post(`/api/public/restaurant/${a.restaurant.slug}/waitlist`)
      .send({ customerName: 'Ada', customerPhone: '+905550000010', partySize: 4 });
    expect(join.status).toBe(201);
    expect((await config())!.peopleWaiting).toBe(4);

    const res = await api
      .put(`/api/wait-time/entries/${join.body.data.id}/status`)
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ status: 'SEATED' });
    expect(res.status).toBe(200);
    expect((await config())!.peopleWaiting).toBe(0);
  });

  it('decrements when a party cancels, and never goes negative', async () => {
    const join = await api
      .post(`/api/public/restaurant/${a.restaurant.slug}/waitlist`)
      .send({ customerName: 'Bo', customerPhone: '+905550000011', partySize: 2 });
    expect((await config())!.peopleWaiting).toBe(2);

    const res = await api
      .put(`/api/wait-time/entries/${join.body.data.id}/status`)
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ status: 'CANCELED' });
    expect(res.status).toBe(200);
    expect((await config())!.peopleWaiting).toBe(0);

    // Calling it again (already terminal -> terminal) must not drive it negative.
    const again = await api
      .put(`/api/wait-time/entries/${join.body.data.id}/status`)
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ status: 'NO_SHOW' });
    expect(again.status).toBe(200);
    expect((await config())!.peopleWaiting).toBe(0);
  });

  it('does not touch peopleWaiting for a WAITING -> NOTIFIED transition (still active)', async () => {
    const join = await api
      .post(`/api/public/restaurant/${a.restaurant.slug}/waitlist`)
      .send({ customerName: 'Cy', customerPhone: '+905550000012', partySize: 3 });
    const before = (await config())!.peopleWaiting;

    const res = await api
      .put(`/api/wait-time/entries/${join.body.data.id}/status`)
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ status: 'NOTIFIED' });
    expect(res.status).toBe(200);
    expect((await config())!.peopleWaiting).toBe(before);
  });
});
