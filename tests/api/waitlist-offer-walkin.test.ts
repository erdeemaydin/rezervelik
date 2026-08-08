import { beforeAll, describe, it, expect } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, SeededTenant } from '../helpers/seed';

// sendOffer never required targetDate before marking a waitlist entry OFFERED, but
// acceptOffer always built its reservation start time from
// `${entry.targetDate}T...` — for a real-time walk-in entry (joined with no
// targetDate), that produced the literal string "nullT19:00:00+03:00", an invalid
// date, and 500'd. Any "Send Offer" on a walk-in entry always crashed on accept.
describe('Accepting an offer sent to a walk-in (no targetDate) waitlist entry', () => {
  let a: SeededTenant;

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant();
  });

  it('succeeds instead of 500ing', async () => {
    const entry = await prisma.waitlistEntry.create({
      data: {
        restaurantId: a.restaurant.id,
        customerName: 'Walkin Guest',
        customerPhone: '+905550000030',
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
    expect(token).toBeTruthy();

    const acceptRes = await api.post(`/api/public/offer/${token}/accept`);
    expect(acceptRes.status).toBe(200);

    const updatedEntry = await prisma.waitlistEntry.findUnique({ where: { id: entry.id } });
    expect(updatedEntry!.status).toBe('ACCEPTED');

    const reservation = await prisma.reservation.findFirst({ where: { restaurantId: a.restaurant.id, customerPhone: '+905550000030' } });
    expect(reservation).toBeTruthy();
    expect(reservation!.startTime.getTime()).not.toBeNaN();
  });
});
