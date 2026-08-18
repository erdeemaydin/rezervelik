import { beforeAll, describe, it, expect } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, SeededTenant } from '../helpers/seed';

// Bug-audit finding: submitInvitationRsvp's dedup-by-name check (findFirst then
// create/update) wasn't wrapped in a transaction, so two concurrent submissions
// for the same name (double-tap on a slow connection, two people on one shared
// family device) could both miss the existing-guest check and create two Guest
// rows for one person — inflating headcount/seating math nothing else corrects.
describe('Public RSVP concurrent-submission race', () => {
  let a: SeededTenant;

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant({ businessType: 'WEDDING' });
  });

  const hdr = (t: SeededTenant) => auth(t.tokens.admin, t.restaurant.id);

  it('only creates one Guest row when two RSVPs for the same name race', async () => {
    const ev = await prisma.event.create({
      data: { restaurantId: a.restaurant.id, clientName: 'Couple', clientPhone: '+9', eventDate: '2026-10-10' },
    });
    const gen = await api.post(`/api/events/${ev.id}/invitation`).set(hdr(a)).send({});
    const token = gen.body.data.publicToken;

    const [r1, r2] = await Promise.all([
      api.post(`/api/public/invitation/${token}/rsvp`).send({ name: 'Aylin Kaya', partySize: 2, rsvp: 'YES' }),
      api.post(`/api/public/invitation/${token}/rsvp`).send({ name: 'aylin kaya', partySize: 3, rsvp: 'YES' }),
    ]);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    const guests = await prisma.guest.findMany({ where: { eventId: ev.id } });
    expect(guests).toHaveLength(1);
  });

  it('staff can still add two distinct guests who happen to share a name', async () => {
    const ev = await prisma.event.create({
      data: { restaurantId: a.restaurant.id, clientName: 'Couple', clientPhone: '+9', eventDate: '2026-10-11' },
    });
    const g1 = await api.post(`/api/events/${ev.id}/guests`).set(hdr(a)).send({ name: 'Mehmet Demir', partySize: 1 });
    const g2 = await api.post(`/api/events/${ev.id}/guests`).set(hdr(a)).send({ name: 'Mehmet Demir', partySize: 1 });
    expect(g1.status).toBe(201);
    expect(g2.status).toBe(201);

    const guests = await prisma.guest.findMany({ where: { eventId: ev.id } });
    expect(guests).toHaveLength(2);
  });
});
