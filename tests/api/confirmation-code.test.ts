import { beforeAll, afterEach, describe, it, expect, vi } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, SeededTenant } from '../helpers/seed';

// Reservation.confirmationCode: a short guest-facing lookup code (6 digits, no
// leading zero) generated at booking time so host-stand staff can pull up a
// reservation by code instead of a name search — see generateConfirmationCode
// in reservationController.ts.
describe('Reservation confirmationCode', () => {
  let a: SeededTenant;

  async function seedTable(restaurantId: string) {
    const zone = await prisma.zone.create({ data: { restaurantId, name: 'Main' } });
    await prisma.bookableResource.create({
      data: { restaurantId, tableTypeId: zone.id, identifier: 'T1', capacity: 20 },
    });
  }

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant();
    await prisma.restaurantSettings.update({ where: { restaurantId: a.restaurant.id }, data: { maxPartySize: 50 } });
    await seedTable(a.restaurant.id);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('generates a 6-digit code and returns it on the public booking response', async () => {
    const res = await api
      .post('/api/reservations')
      .set('X-Restaurant-ID', a.restaurant.id)
      .send({ customerName: 'Guest', customerPhone: '+905550002001', guestCount: 2, startTime: '2026-12-20T18:00:00.000Z' });

    expect(res.status).toBe(201);
    expect(res.body.data.confirmationCode).toMatch(/^[1-9]\d{5}$/);

    const stored = await prisma.reservation.findUnique({ where: { id: res.body.data.id } });
    expect(stored?.confirmationCode).toBe(res.body.data.confirmationCode);
  });

  it('is searchable by staff via GET /api/reservations', async () => {
    const created = await api
      .post('/api/reservations')
      .set('X-Restaurant-ID', a.restaurant.id)
      .send({ customerName: 'Findable Guest', customerPhone: '+905550002002', guestCount: 2, startTime: '2026-12-20T21:00:00.000Z' });
    expect(created.status).toBe(201);

    const list = await api.get('/api/reservations').set(auth(a.tokens.admin, a.restaurant.id));
    expect(list.status).toBe(200);
    const match = list.body.data.find((r: any) => r.id === created.body.data.id);
    expect(match?.confirmationCode).toBe(created.body.data.confirmationCode);
  });

  it('retries on a code collision and still succeeds with a different code', async () => {
    // Pre-seed a reservation holding the code that the first generation
    // attempt will produce (random() -> 0 => 100000 + floor(0*900000) = 100000).
    await prisma.reservation.create({
      data: {
        restaurantId: a.restaurant.id, customerName: 'Holder', customerPhone: '+905550002003', guestCount: 2,
        startTime: new Date('2026-12-21T18:00:00.000Z'), endTime: new Date('2026-12-21T19:30:00.000Z'),
        status: 'CONFIRMED', confirmationCode: '100000',
      },
    });

    const randomSpy = vi.spyOn(Math, 'random');
    randomSpy.mockReturnValueOnce(0); // 1st attempt -> "100000" (collides with the seeded row above)
    randomSpy.mockReturnValue(0.5); // every attempt after -> "550000"

    const res = await api
      .post('/api/reservations')
      .set('X-Restaurant-ID', a.restaurant.id)
      .send({ customerName: 'Retry Guest', customerPhone: '+905550002004', guestCount: 2, startTime: '2026-12-21T20:00:00.000Z' });

    expect(res.status).toBe(201);
    expect(res.body.data.confirmationCode).toBe('550000');
  });

  it('two different restaurants may independently use the same code (unique per-restaurant, not globally)', async () => {
    const b = await seedTenant();
    await prisma.restaurantSettings.update({ where: { restaurantId: b.restaurant.id }, data: { maxPartySize: 50 } });
    await seedTable(b.restaurant.id);

    const randomSpy = vi.spyOn(Math, 'random');
    randomSpy.mockReturnValue(0.1); // deterministic code for both

    const resA = await api
      .post('/api/reservations')
      .set('X-Restaurant-ID', a.restaurant.id)
      .send({ customerName: 'Tenant A Guest', customerPhone: '+905550002005', guestCount: 2, startTime: '2026-12-22T18:00:00.000Z' });
    const resB = await api
      .post('/api/reservations')
      .set('X-Restaurant-ID', b.restaurant.id)
      .send({ customerName: 'Tenant B Guest', customerPhone: '+905550002006', guestCount: 2, startTime: '2026-12-22T18:00:00.000Z' });

    expect(resA.status).toBe(201);
    expect(resB.status).toBe(201);
    expect(resA.body.data.confirmationCode).toBe(resB.body.data.confirmationCode);
  });
});
