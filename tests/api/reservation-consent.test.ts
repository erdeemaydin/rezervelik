import { beforeAll, describe, it, expect } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, SeededTenant } from '../helpers/seed';

// KVKK "açık rıza" (PRODUCTION_ROADMAP.md §7.3, PROJECT_LOGIC.md §14): the public
// booking form's required consent checkbox must be re-checked server-side, not
// just trusted from the client — and the separate WhatsApp/marketing opt-in
// must never substitute for it. Staff-entered bookings (dashboard/host) are
// exempt, same convention as maxPartySize/overrideConflict.
describe('POST /api/reservations — KVKK consent enforcement', () => {
  let a: SeededTenant;

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant();
    const zone = await prisma.zone.create({ data: { restaurantId: a.restaurant.id, name: 'Main' } });
    await prisma.bookableResource.create({
      data: { restaurantId: a.restaurant.id, tableTypeId: zone.id, identifier: 'T1', capacity: 4 },
    });
  });

  it('rejects a public booking with no consentAccepted field at all', async () => {
    const res = await api
      .post('/api/reservations')
      .set('X-Restaurant-ID', a.restaurant.id)
      .send({ customerName: 'Ada', customerPhone: '+905551110001', guestCount: 2, startTime: '2026-11-01T18:00:00.000Z' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('errors.consent_required');

    const stored = await prisma.reservation.findFirst({ where: { customerPhone: '+905551110001' } });
    expect(stored).toBeNull();
  });

  it('rejects a public booking with consentAccepted explicitly false', async () => {
    const res = await api
      .post('/api/reservations')
      .set('X-Restaurant-ID', a.restaurant.id)
      .send({ customerName: 'Bo', customerPhone: '+905551110002', guestCount: 2, startTime: '2026-11-01T18:30:00.000Z', consentAccepted: false });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('errors.consent_required');
  });

  it('rejects a public booking that only sets marketingConsent — the required and marketing consents are separate', async () => {
    const res = await api
      .post('/api/reservations')
      .set('X-Restaurant-ID', a.restaurant.id)
      .send({ customerName: 'Cy', customerPhone: '+905551110003', guestCount: 2, startTime: '2026-11-01T19:00:00.000Z', marketingConsent: true });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('errors.consent_required');
  });

  it('accepts a public booking with consentAccepted: true and records a consentTimestamp', async () => {
    const before = new Date();
    const res = await api
      .post('/api/reservations')
      .set('X-Restaurant-ID', a.restaurant.id)
      .send({ customerName: 'Deniz', customerPhone: '+905551110004', guestCount: 2, startTime: '2026-11-01T19:30:00.000Z', consentAccepted: true });

    expect(res.status).toBe(201);

    const stored = await prisma.reservation.findFirst({ where: { customerPhone: '+905551110004' } });
    expect(stored?.consentAccepted).toBe(true);
    expect(stored?.marketingConsent).toBe(false); // not opted in
    expect(stored?.consentTimestamp).toBeTruthy();
    expect(stored!.consentTimestamp!.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
  });

  it('records marketingConsent as a separate opt-in when both are accepted', async () => {
    const res = await api
      .post('/api/reservations')
      .set('X-Restaurant-ID', a.restaurant.id)
      .send({
        customerName: 'Ela', customerPhone: '+905551110005', guestCount: 2, startTime: '2026-11-02T19:30:00.000Z',
        consentAccepted: true, marketingConsent: true,
      });

    expect(res.status).toBe(201);
    const stored = await prisma.reservation.findFirst({ where: { customerPhone: '+905551110005' } });
    expect(stored?.consentAccepted).toBe(true);
    expect(stored?.marketingConsent).toBe(true);
  });

  it('exempts staff-initiated bookings from the consent requirement, and does not record a false consent', async () => {
    const res = await api
      .post('/api/reservations')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ customerName: 'Phone Booking', customerPhone: '+905551110006', guestCount: 2, startTime: '2026-11-03T19:30:00.000Z' });

    expect(res.status).toBe(201);
    const stored = await prisma.reservation.findFirst({ where: { customerPhone: '+905551110006' } });
    expect(stored?.consentAccepted).toBe(false);
    expect(stored?.marketingConsent).toBe(false);
    expect(stored?.consentTimestamp).toBeNull();
  });
});

// KVKK data-subject deletion request (PROJECT_LOGIC.md §14): staff-triggered,
// tenant-scoped, identified by phone (the natural key phoneHistory already uses).
describe('DELETE /api/reservations/customer/:phone — data-subject deletion', () => {
  let a: SeededTenant;
  let b: SeededTenant;
  const phone = '+905552220001';

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant();
    b = await seedTenant();

    await prisma.reservation.create({
      data: {
        restaurantId: a.restaurant.id, customerName: 'Target Guest', customerPhone: phone, customerEmail: 'target@test.dev',
        guestCount: 2, startTime: new Date('2026-11-05T18:00:00.000Z'), endTime: new Date('2026-11-05T19:30:00.000Z'),
        status: 'CONFIRMED', notes: 'window seat please', internalNote: 'regular',
      },
    });
    await prisma.waitlistEntry.create({
      data: { restaurantId: a.restaurant.id, customerName: 'Target Guest', customerPhone: phone, partySize: 2, notes: 'call on arrival' },
    });
    // Same phone at a DIFFERENT tenant — must be untouched (tenant isolation).
    await prisma.reservation.create({
      data: {
        restaurantId: b.restaurant.id, customerName: 'Same Phone Other Tenant', customerPhone: phone,
        guestCount: 2, startTime: new Date('2026-11-05T18:00:00.000Z'), endTime: new Date('2026-11-05T19:30:00.000Z'),
        status: 'CONFIRMED',
      },
    });
  });

  it('requires staff auth', async () => {
    const res = await api.delete(`/api/reservations/customer/${encodeURIComponent(phone)}`).set('X-Restaurant-ID', a.restaurant.id);
    expect(res.status).toBe(401);
  });

  it('anonymizes every Reservation and WaitlistEntry row for the phone within the caller\'s tenant only', async () => {
    const res = await api
      .delete(`/api/reservations/customer/${encodeURIComponent(phone)}`)
      .set(auth(a.tokens.admin, a.restaurant.id));

    expect(res.status).toBe(200);
    expect(res.body.data.reservationsAnonymized).toBe(1);
    expect(res.body.data.waitlistEntriesAnonymized).toBe(1);

    const reservation = await prisma.reservation.findFirst({ where: { restaurantId: a.restaurant.id, notes: null, internalNote: null } });
    expect(reservation).toBeTruthy();
    expect(reservation!.customerName).toBeNull();
    expect(reservation!.customerPhone).toBeNull();
    expect(reservation!.customerEmail).toBeNull();
    expect(reservation!.anonymizedAt).toBeTruthy();
    // Aggregate fields survive.
    expect(reservation!.guestCount).toBe(2);
    expect(reservation!.status).toBe('CONFIRMED');

    const waitlistEntry = await prisma.waitlistEntry.findFirst({ where: { restaurantId: a.restaurant.id } });
    expect(waitlistEntry!.customerName).toBeNull();
    expect(waitlistEntry!.customerPhone).toBeNull();
    expect(waitlistEntry!.anonymizedAt).toBeTruthy();

    // The other tenant's row with the same phone is untouched.
    const otherTenantReservation = await prisma.reservation.findFirst({ where: { restaurantId: b.restaurant.id } });
    expect(otherTenantReservation!.customerPhone).toBe(phone);
    expect(otherTenantReservation!.anonymizedAt).toBeNull();
  });

  it('is idempotent — re-running it finds nothing left to anonymize', async () => {
    const res = await api
      .delete(`/api/reservations/customer/${encodeURIComponent(phone)}`)
      .set(auth(a.tokens.admin, a.restaurant.id));

    expect(res.status).toBe(200);
    expect(res.body.data.reservationsAnonymized).toBe(0);
    expect(res.body.data.waitlistEntriesAnonymized).toBe(0);
  });
});
