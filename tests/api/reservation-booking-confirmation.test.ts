import { beforeAll, describe, it, expect, vi, afterEach } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, SeededTenant } from '../helpers/seed';

// Guests never got any message once their booking was actually confirmed —
// sendPaymentRequest only covers the "pay a deposit" case. These verify the
// new sendBookingConfirmation trigger fires (as an SMS placeholder log, since
// no Netgsm/WhatsApp credentials are configured in tests) at each of the three
// moments a reservation becomes CONFIRMED: auto-confirm at creation, a staff
// direct accept, and a deposit being paid.
describe('Booking-confirmation message', () => {
  let a: SeededTenant;

  async function seedResource(t: SeededTenant) {
    const zone = await prisma.zone.create({ data: { restaurantId: t.restaurant.id, name: 'Main' } });
    return prisma.bookableResource.create({
      data: { restaurantId: t.restaurant.id, tableTypeId: zone.id, identifier: 'R1', capacity: 4 },
    });
  }

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant();
    await seedResource(a);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends a confirmation when a reservation auto-confirms at creation', async () => {
    const date = '2026-09-10';
    await prisma.daySetting.create({ data: { restaurantId: a.restaurant.id, date, autoConfirm: true } });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const res = await api
      .post('/api/reservations')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ customerName: 'Ada', customerPhone: '+905550000020', guestCount: 2, startTime: `${date}T10:00:00.000Z` });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('CONFIRMED');
    const smsLog = logSpy.mock.calls.map(c => c.join(' ')).find(l => l.includes('+905550000020'));
    expect(smsLog).toBeTruthy();
    expect(smsLog).toContain('onaylandı');
  });

  it('sends a confirmation when staff directly accept a pending reservation', async () => {
    const r = await prisma.reservation.create({
      data: {
        restaurantId: a.restaurant.id,
        customerName: 'Bo', customerPhone: '+905550000021', guestCount: 2,
        startTime: new Date('2026-09-11T12:00:00.000Z'), endTime: new Date('2026-09-11T14:00:00.000Z'),
        status: 'PENDING',
      },
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const res = await api
      .put(`/api/reservations/${r.id}/status`)
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ status: 'CONFIRMED', skipPayment: true });

    expect(res.status).toBe(200);
    const smsLog = logSpy.mock.calls.map(c => c.join(' ')).find(l => l.includes('+905550000021'));
    expect(smsLog).toBeTruthy();
    expect(smsLog).toContain('onaylandı');
  });

  it('sends a confirmation once a deposit is paid (Trigger A never sends an SMS at booking time — the guest is redirected in-browser)', async () => {
    await prisma.restaurantSettings.update({
      where: { restaurantId: a.restaurant.id },
      data: { isPaidReservationEnabled: true, depositAmount: 100 },
    });
    const date = '2026-09-12';
    await prisma.daySetting.create({ data: { restaurantId: a.restaurant.id, date, autoConfirm: true } });

    // No Authorization header -> isStaffRequest() is false -> this is treated as a
    // public/guest booking, which is what triggers requiresInstantPayment.
    const res = await api
      .post('/api/reservations')
      .set('X-Restaurant-ID', a.restaurant.id)
      .send({ customerName: 'Cy', customerPhone: '+905550000022', guestCount: 2, startTime: `${date}T10:00:00.000Z` });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('AWAITING_PAYMENT');

    const reservation = await prisma.reservation.findFirst({ where: { customerPhone: '+905550000022' } });
    const pay = await prisma.payment.findFirst({ where: { reservationId: reservation!.id } });
    expect(pay).toBeTruthy();

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const completeRes = await api
      .post('/api/public/payment/mock/complete')
      .send({ oid: pay!.merchantOid, outcome: 'success' });
    expect(completeRes.status).toBe(200);

    const confirmedReservation = await prisma.reservation.findUnique({ where: { id: reservation!.id } });
    expect(confirmedReservation!.status).toBe('CONFIRMED');
    const confirmLog = logSpy.mock.calls.map(c => c.join(' ')).find(l => l.includes('+905550000022') && l.includes('onaylandı'));
    expect(confirmLog).toBeTruthy();
  });
});
