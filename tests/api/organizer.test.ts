import { beforeAll, describe, it, expect } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, SeededTenant } from '../helpers/seed';

// Phase 5 — organizer/vendor + e-davetiye. Vendor directory, event↔vendor links,
// the invitation token, and public RSVP. Focus on domain rules + tenant isolation.
describe('Organizer / vendors / invitation', () => {
  let a: SeededTenant;
  let b: SeededTenant;

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant();
    b = await seedTenant();
  });

  const hdr = (t: SeededTenant) => auth(t.tokens.admin, t.restaurant.id);
  const newEvent = (t: SeededTenant, date = '2026-10-01') =>
    prisma.event.create({ data: { restaurantId: t.restaurant.id, clientName: 'Couple', clientPhone: '+9', eventDate: date } });

  it('creates a vendor and lists it', async () => {
    const res = await api.post('/api/vendors').set(hdr(a)).send({ name: 'Studio Işık', category: 'PHOTOGRAPHER', phone: '+90555' });
    expect(res.status).toBe(201);
    expect(res.body.data.category).toBe('PHOTOGRAPHER');

    const list = await api.get('/api/vendors').set(hdr(a));
    expect(list.body.data).toHaveLength(1);
  });

  it('rejects an invalid vendor category', async () => {
    const res = await api.post('/api/vendors').set(hdr(a)).send({ name: 'X', category: 'BOGUS' });
    expect(res.status).toBe(400);
  });

  it('isolates vendors across tenants', async () => {
    const mine = await api.post('/api/vendors').set(hdr(a)).send({ name: 'Only A', category: 'DJ' });
    const readByB = await api.get('/api/vendors').set(hdr(b));
    expect(readByB.body.data.find((v: any) => v.id === mine.body.data.id)).toBeUndefined();
  });

  it('links a vendor to an event, rejecting a foreign vendor and duplicates', async () => {
    const ev = await newEvent(a);
    const vendor = await api.post('/api/vendors').set(hdr(a)).send({ name: 'Çiçek', category: 'FLORIST' });
    const foreign = await api.post('/api/vendors').set(hdr(b)).send({ name: 'Foreign', category: 'DJ' });

    const link = await api.post(`/api/events/${ev.id}/vendors`).set(hdr(a)).send({ vendorId: vendor.body.data.id, cost: 250000, status: 'CONFIRMED' });
    expect(link.status).toBe(201);
    expect(link.body.data.cost).toBe(250000);
    expect(link.body.data.vendor.name).toBe('Çiçek');

    // Foreign vendor cannot be linked to tenant A's event.
    const bad = await api.post(`/api/events/${ev.id}/vendors`).set(hdr(a)).send({ vendorId: foreign.body.data.id });
    expect(bad.status).toBe(400);

    // Same vendor twice is rejected.
    const dup = await api.post(`/api/events/${ev.id}/vendors`).set(hdr(a)).send({ vendorId: vendor.body.data.id });
    expect(dup.status).toBe(400);

    // The event detail carries the vendor link.
    const detail = await api.get(`/api/events/${ev.id}`).set(hdr(a));
    expect(detail.body.data.vendors).toHaveLength(1);
  });

  it('mints an invitation token and serves a display-safe public payload', async () => {
    const ev = await newEvent(a, '2026-10-02');
    await api.put(`/api/events/${ev.id}`).set(hdr(a)).send({ venueName: 'Sahil Balo', invitationMessage: 'Şeref verin', quotedTotal: 999999 });

    const gen = await api.post(`/api/events/${ev.id}/invitation`).set(hdr(a)).send({});
    expect(gen.status).toBe(200);
    const token = gen.body.data.publicToken;
    expect(token).toBeTruthy();

    const pub = await api.get(`/api/public/invitation/${token}`);
    expect(pub.status).toBe(200);
    expect(pub.body.data.venueName).toBe('Sahil Balo');
    // Financials must never leak to the public invitation.
    expect(pub.body.data.quotedTotal).toBeUndefined();
  });

  it('accepts a public RSVP into the guest list and dedupes on name', async () => {
    const ev = await newEvent(a, '2026-10-03');
    const gen = await api.post(`/api/events/${ev.id}/invitation`).set(hdr(a)).send({});
    const token = gen.body.data.publicToken;

    const r1 = await api.post(`/api/public/invitation/${token}/rsvp`).send({ name: 'Deniz', partySize: 2, rsvp: 'YES' });
    expect(r1.status).toBe(200);
    // Same name again updates rather than stacking.
    const r2 = await api.post(`/api/public/invitation/${token}/rsvp`).send({ name: 'deniz', partySize: 4, rsvp: 'MAYBE' });
    expect(r2.status).toBe(200);

    const guests = await api.get(`/api/events/${ev.id}/guests`).set(hdr(a));
    expect(guests.body.data).toHaveLength(1);
    expect(guests.body.data[0].partySize).toBe(4);
    expect(guests.body.data[0].rsvp).toBe('MAYBE');
    expect(guests.body.data[0].respondedAt).toBeTruthy();
  });

  it('rejects a public RSVP for an unknown token', async () => {
    const res = await api.post('/api/public/invitation/nope/rsvp').send({ name: 'Ghost' });
    expect(res.status).toBe(404);
  });
});
