import { beforeAll, describe, it, expect } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, SeededTenant } from '../helpers/seed';

// Staff could see a paid deposit in dashboard/payments but had no way to actually
// give it back (e.g. cancelling a paid reservation within policy) — the provider
// abstraction had no refund() at all. Covers the new refund flow end-to-end
// against the Mock provider (createCheckout/verifyCallback were already exercised
// elsewhere; refund() is new).
describe('Payment refunds', () => {
  let a: SeededTenant;
  let b: SeededTenant;

  async function seedResource(t: SeededTenant) {
    const zone = await prisma.zone.create({ data: { restaurantId: t.restaurant.id, name: 'Main' } });
    return prisma.bookableResource.create({
      data: { restaurantId: t.restaurant.id, tableTypeId: zone.id, identifier: 'R1', capacity: 4 },
    });
  }

  async function createPaidPayment(t: SeededTenant, phone: string, date: string) {
    await prisma.restaurantSettings.update({
      where: { restaurantId: t.restaurant.id },
      data: { isPaidReservationEnabled: true, depositAmount: 150 },
    });
    await prisma.daySetting.create({ data: { restaurantId: t.restaurant.id, date, autoConfirm: true } });

    const created = await api
      .post('/api/reservations')
      .set('X-Restaurant-ID', t.restaurant.id)
      .send({ customerName: 'Guest', customerPhone: phone, guestCount: 2, startTime: `${date}T10:00:00.000Z` });
    expect(created.status).toBe(201);

    const reservation = await prisma.reservation.findFirst({ where: { customerPhone: phone } });
    const payment = await prisma.payment.findFirst({ where: { reservationId: reservation!.id } });

    const complete = await api
      .post('/api/public/payment/mock/complete')
      .send({ oid: payment!.merchantOid, outcome: 'success' });
    expect(complete.status).toBe(200);

    return prisma.payment.findUniqueOrThrow({ where: { id: payment!.id } });
  }

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant();
    b = await seedTenant();
    await seedResource(a);
    await seedResource(b);
  });

  it('refunds a paid deposit', async () => {
    const payment = await createPaidPayment(a, '+905550000030', '2026-09-20');
    expect(payment.status).toBe('PAID');

    const res = await api
      .post(`/api/payments/${payment.id}/refund`)
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ reason: 'Customer cancelled within policy' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('REFUNDED');
    expect(res.body.data.refundedAt).toBeTruthy();

    const reloaded = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(reloaded!.status).toBe('REFUNDED');
    expect(reloaded!.refundReason).toBe('Customer cancelled within policy');
  });

  it('rejects refunding the same payment twice', async () => {
    const payment = await createPaidPayment(a, '+905550000031', '2026-09-21');
    const first = await api
      .post(`/api/payments/${payment.id}/refund`)
      .set(auth(a.tokens.admin, a.restaurant.id));
    expect(first.status).toBe(200);

    const second = await api
      .post(`/api/payments/${payment.id}/refund`)
      .set(auth(a.tokens.admin, a.restaurant.id));
    expect(second.status).toBe(400);
  });

  it('rejects refunding a payment that was never paid', async () => {
    await prisma.restaurantSettings.update({
      where: { restaurantId: a.restaurant.id },
      data: { isPaidReservationEnabled: true, depositAmount: 150 },
    });
    const date = '2026-09-22';
    await prisma.daySetting.create({ data: { restaurantId: a.restaurant.id, date, autoConfirm: true } });
    const created = await api
      .post('/api/reservations')
      .set('X-Restaurant-ID', a.restaurant.id)
      .send({ customerName: 'Guest', customerPhone: '+905550000032', guestCount: 2, startTime: `${date}T10:00:00.000Z` });
    const reservation = await prisma.reservation.findFirst({ where: { customerPhone: '+905550000032' } });
    const payment = await prisma.payment.findFirst({ where: { reservationId: reservation!.id } });
    expect(payment!.status).toBe('PENDING');

    const res = await api
      .post(`/api/payments/${payment!.id}/refund`)
      .set(auth(a.tokens.admin, a.restaurant.id));
    expect(res.status).toBe(400);
  });

  it('a STAFF user (no manage_payments grant) cannot issue a refund', async () => {
    const payment = await createPaidPayment(a, '+905550000033', '2026-09-23');
    const res = await api
      .post(`/api/payments/${payment.id}/refund`)
      .set(auth(a.tokens.staff, a.restaurant.id));
    expect(res.status).toBe(403);
  });

  it('tenant isolation: restaurant B cannot refund restaurant A\'s payment', async () => {
    const payment = await createPaidPayment(a, '+905550000034', '2026-09-24');
    const res = await api
      .post(`/api/payments/${payment.id}/refund`)
      .set(auth(b.tokens.admin, b.restaurant.id));
    expect(res.status).toBe(404);
  });
});
