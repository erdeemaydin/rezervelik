import { beforeAll, describe, it, expect } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, SeededTenant } from '../helpers/seed';

// Self-review finding: staff clicking "Accept" on the same PENDING reservation
// twice in quick succession (paid reservations enabled) both used to pass the
// `!existingRes.isPaid` check before either write landed, each generating its
// own Payment row + deposit link + SMS. Only one Payment row (and one SMS)
// should ever be created for a single manual-accept.
describe('updateReservationStatus concurrent-accept payment race', () => {
  let a: SeededTenant;

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant();
    await prisma.restaurantSettings.update({
      where: { restaurantId: a.restaurant.id },
      data: { isPaidReservationEnabled: true, depositAmount: 150 },
    });
  });

  it('only one Payment row is created when two Accept requests race', async () => {
    const r = await prisma.reservation.create({
      data: {
        restaurantId: a.restaurant.id,
        customerName: 'Race', customerPhone: '+905550000050', guestCount: 2,
        startTime: new Date('2026-09-30T12:00:00.000Z'), endTime: new Date('2026-09-30T14:00:00.000Z'),
        status: 'PENDING',
      },
    });

    const [r1, r2] = await Promise.all([
      api.put(`/api/reservations/${r.id}/status`).set(auth(a.tokens.admin, a.restaurant.id)).send({ status: 'CONFIRMED' }),
      api.put(`/api/reservations/${r.id}/status`).set(auth(a.tokens.admin, a.restaurant.id)).send({ status: 'CONFIRMED' }),
    ]);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    const payments = await prisma.payment.findMany({ where: { reservationId: r.id } });
    expect(payments.length).toBe(1);

    const reservation = await prisma.reservation.findUnique({ where: { id: r.id } });
    expect(reservation!.status).toBe('AWAITING_PAYMENT');
    expect(reservation!.paymentId).toBe(payments[0].id);
  });
});
