import { beforeAll, describe, it, expect } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, SeededTenant } from '../helpers/seed';

// Security-audit finding: eventController.ts (and publicController's RSVP
// endpoint) parsed several client-supplied numbers with parseInt/Number and
// no isNaN guard — a non-numeric string produced NaN, which either threw an
// unhandled Prisma error on an Int column (500 instead of 400) or, for a
// nullable Float-ish Int column, got written as-is. Every one of these now
// goes through utils/numeric.ts's parseCount/parseAmount and returns a clean
// 400 on invalid input.
describe('Event/guest/payment numeric validation', () => {
  let a: SeededTenant;
  const hdr = (t: SeededTenant) => auth(t.tokens.admin, t.restaurant.id);

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant({ businessType: 'WEDDING' });
  });

  async function makeEvent() {
    const res = await api.post('/api/events').set(hdr(a)).send({
      clientName: 'Test Client', clientPhone: '+905550000099', eventDate: '2026-10-01',
    });
    return res.body.data.id as string;
  }

  it('rejects a non-numeric guestCount on create', async () => {
    const res = await api.post('/api/events').set(hdr(a)).send({
      clientName: 'X', clientPhone: '+900', eventDate: '2026-10-02', guestCount: 'a lot',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a non-numeric guestCount on update', async () => {
    const eventId = await makeEvent();
    const res = await api.put(`/api/events/${eventId}`).set(hdr(a)).send({ guestCount: 'many' });
    expect(res.status).toBe(400);
  });

  it('rejects a non-numeric quotedTotal on create', async () => {
    const res = await api.post('/api/events').set(hdr(a)).send({
      clientName: 'X', clientPhone: '+900', eventDate: '2026-10-03', quotedTotal: 'free',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a non-numeric quotedTotal on update', async () => {
    const eventId = await makeEvent();
    const res = await api.put(`/api/events/${eventId}`).set(hdr(a)).send({ quotedTotal: 'lots' });
    expect(res.status).toBe(400);
  });

  it('rejects a non-numeric totalAmount on the payment plan', async () => {
    const eventId = await makeEvent();
    const res = await api.put(`/api/events/${eventId}/payment-plan`).set(hdr(a)).send({ totalAmount: 'nope' });
    expect(res.status).toBe(400);
  });

  it('rejects a non-numeric amount when adding an installment', async () => {
    const eventId = await makeEvent();
    const res = await api.post(`/api/events/${eventId}/installments`).set(hdr(a)).send({
      dueDate: '2026-10-10', amount: 'a hundred',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a non-numeric amount when updating an installment', async () => {
    const eventId = await makeEvent();
    const created = await api.post(`/api/events/${eventId}/installments`).set(hdr(a)).send({
      dueDate: '2026-10-10', amount: 5000,
    });
    const res = await api
      .put(`/api/events/installments/${created.body.data.id}`)
      .set(hdr(a))
      .send({ amount: 'more' });
    expect(res.status).toBe(400);
  });

  it('rejects a non-numeric partySize when creating a guest', async () => {
    const eventId = await makeEvent();
    const res = await api.post(`/api/events/${eventId}/guests`).set(hdr(a)).send({ name: 'Guest', partySize: 'two' });
    expect(res.status).toBe(400);
  });

  it('rejects a zero or negative partySize when creating a guest', async () => {
    const eventId = await makeEvent();
    const zero = await api.post(`/api/events/${eventId}/guests`).set(hdr(a)).send({ name: 'Guest', partySize: 0 });
    expect(zero.status).toBe(400);
    const negative = await api.post(`/api/events/${eventId}/guests`).set(hdr(a)).send({ name: 'Guest', partySize: -1 });
    expect(negative.status).toBe(400);
  });

  it('rejects a non-numeric partySize when updating a guest', async () => {
    const eventId = await makeEvent();
    const created = await api.post(`/api/events/${eventId}/guests`).set(hdr(a)).send({ name: 'Guest', partySize: 2 });
    const res = await api
      .put(`/api/events/guests/${created.body.data.id}`)
      .set(hdr(a))
      .send({ partySize: 'three' });
    expect(res.status).toBe(400);
  });

  it('rejects a non-numeric cost when adding an event vendor', async () => {
    const eventId = await makeEvent();
    const vendor = await prisma.vendor.create({ data: { restaurantId: a.restaurant.id, name: 'Florist', category: 'FLORIST' } });
    const res = await api
      .post(`/api/events/${eventId}/vendors`)
      .set(hdr(a))
      .send({ vendorId: vendor.id, cost: 'a bouquet' });
    expect(res.status).toBe(400);
  });

  it('rejects a non-numeric cost when updating an event vendor link', async () => {
    const eventId = await makeEvent();
    const vendor = await prisma.vendor.create({ data: { restaurantId: a.restaurant.id, name: 'DJ', category: 'MUSIC' } });
    const created = await api.post(`/api/events/${eventId}/vendors`).set(hdr(a)).send({ vendorId: vendor.id, cost: 500 });
    const res = await api
      .put(`/api/events/vendors/${created.body.data.id}`)
      .set(hdr(a))
      .send({ cost: 'more music' });
    expect(res.status).toBe(400);
  });

  it('public RSVP rejects a non-numeric partySize with 400, not a 500', async () => {
    const eventId = await makeEvent();
    const gen = await api.post(`/api/events/${eventId}/invitation`).set(hdr(a)).send({});
    const token = gen.body.data.publicToken;

    const res = await api.post(`/api/public/invitation/${token}/rsvp`).send({ name: 'Guest Name', partySize: 'abc' });
    expect(res.status).toBe(400);
  });

  it('public RSVP still accepts a valid numeric partySize', async () => {
    const eventId = await makeEvent();
    const gen = await api.post(`/api/events/${eventId}/invitation`).set(hdr(a)).send({});
    const token = gen.body.data.publicToken;

    const res = await api.post(`/api/public/invitation/${token}/rsvp`).send({ name: 'Real Guest', partySize: 3, rsvp: 'YES' });
    expect(res.status).toBe(200);
  });
});
