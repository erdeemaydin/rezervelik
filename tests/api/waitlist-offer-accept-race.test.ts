import { beforeAll, describe, it, expect } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, SeededTenant } from '../helpers/seed';

// Bug-audit finding: acceptOffer's `entry.status !== 'OFFERED'` pre-check ran
// before the transaction, with no guard on the write inside it — a double-tap
// on the public Accept button (or two browser tabs on the same offer link)
// could both pass the pre-check and each create a reservation + double-
// decrement waitlist capacity from one offer.
describe('Accepting a waitlist offer twice concurrently', () => {
  let a: SeededTenant;

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant();
  });

  it('only ever creates one reservation from the offer', async () => {
    const entry = await prisma.waitlistEntry.create({
      data: {
        restaurantId: a.restaurant.id,
        customerName: 'Race Guest',
        customerPhone: '+905550000060',
        partySize: 2,
        status: 'WAITING',
        targetDate: null,
      },
    });

    const offerRes = await api
      .post(`/api/wait-time/entries/${entry.id}/offer`)
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ offeredTime: '19:30' });
    expect(offerRes.status).toBe(200);
    const token = offerRes.body.data.offerToken;

    const [r1, r2] = await Promise.all([
      api.post(`/api/public/offer/${token}/accept`),
      api.post(`/api/public/offer/${token}/accept`),
    ]);

    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([200, 400]);

    const reservations = await prisma.reservation.findMany({ where: { restaurantId: a.restaurant.id, customerPhone: '+905550000060' } });
    expect(reservations).toHaveLength(1);

    const updatedEntry = await prisma.waitlistEntry.findUnique({ where: { id: entry.id } });
    expect(updatedEntry!.status).toBe('ACCEPTED');
  });
});
