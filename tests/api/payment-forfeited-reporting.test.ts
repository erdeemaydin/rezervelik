import { beforeAll, describe, it, expect } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, SeededTenant } from '../helpers/seed';

// docs/architecture/PAYMENTS.md documents "the deposit can be forfeited on NO_SHOW; reporting
// hook" — nothing auto-refunds a no-show, but staff had no visibility into how
// much money that actually was. GET /api/payments now includes the linked
// reservation's status so the dashboard can total forfeited deposits.
describe('No-show deposit-forfeiture reporting', () => {
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

  it('a paid reservation marked NO_SHOW shows up as a forfeited deposit in the payments list', async () => {
    await prisma.restaurantSettings.update({
      where: { restaurantId: a.restaurant.id },
      data: { isPaidReservationEnabled: true, depositAmount: 200 },
    });
    const date = '2026-09-25';
    await prisma.daySetting.create({ data: { restaurantId: a.restaurant.id, date, autoConfirm: true } });

    const created = await api
      .post('/api/reservations')
      .set('X-Restaurant-ID', a.restaurant.id)
      .send({ customerName: 'Guest', customerPhone: '+905550000040', guestCount: 2, startTime: `${date}T10:00:00.000Z`, consentAccepted: true });
    expect(created.status).toBe(201);

    const reservation = await prisma.reservation.findFirst({ where: { customerPhone: '+905550000040' } });
    const payment = await prisma.payment.findFirst({ where: { reservationId: reservation!.id } });

    const complete = await api
      .post('/api/public/payment/mock/complete')
      .send({ oid: payment!.merchantOid, outcome: 'success' });
    expect(complete.status).toBe(200);

    const noShow = await api
      .put(`/api/reservations/${reservation!.id}/status`)
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ status: 'NO_SHOW' });
    expect(noShow.status).toBe(200);

    const list = await api.get('/api/payments').set(auth(a.tokens.admin, a.restaurant.id));
    expect(list.status).toBe(200);
    const row = list.body.data.find((p: any) => p.id === payment!.id);
    expect(row).toBeTruthy();
    expect(row.status).toBe('PAID');
    expect(row.reservation.status).toBe('NO_SHOW');
  });
});
