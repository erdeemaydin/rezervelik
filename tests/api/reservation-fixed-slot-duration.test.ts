import { beforeAll, describe, it, expect } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, SeededTenant } from '../helpers/seed';

// Regression test: FIXED_SLOTS and MANUAL_AVAILABILITY logic modes used to hardcode
// the table-occupancy window to a flat 120 minutes, ignoring the tenant's own
// defaultDurationMinutes setting entirely. Restaurants must be able to configure how
// long a table sits occupied regardless of which reservation logic mode they use.
describe('Reservation duration respects tenant setting across all logic modes', () => {
  let a: SeededTenant;

  async function seedResource(t: SeededTenant) {
    const zone = await prisma.zone.create({ data: { restaurantId: t.restaurant.id, name: 'Main' } });
    await prisma.bookableResource.create({
      data: { restaurantId: t.restaurant.id, tableTypeId: zone.id, identifier: 'R1', capacity: 4 },
    });
  }

  const durationMin = (r: { startTime: Date; endTime: Date | null }) =>
    (r.endTime!.getTime() - r.startTime.getTime()) / 60000;

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant();
    await seedResource(a);
  });

  it('uses the configured defaultDurationMinutes in FIXED_SLOTS mode, not a hardcoded 120', async () => {
    await prisma.restaurantSettings.update({
      where: { restaurantId: a.restaurant.id },
      data: { logic: 'FIXED_SLOTS', defaultDurationMinutes: 45 },
    });

    const res = await api
      .post('/api/reservations')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ customerName: 'Ada', customerPhone: '+905550000010', guestCount: 2, startTime: '2026-08-10T10:00:00.000Z' });
    expect(res.status).toBe(201);

    const created = await prisma.reservation.findFirst({ where: { restaurantId: a.restaurant.id, customerPhone: '+905550000010' } });
    expect(durationMin(created!)).toBe(45);
  });

  it('uses the configured defaultDurationMinutes in MANUAL_AVAILABILITY mode, not a hardcoded 120', async () => {
    await prisma.restaurantSettings.update({
      where: { restaurantId: a.restaurant.id },
      data: { logic: 'MANUAL_AVAILABILITY', defaultDurationMinutes: 150 },
    });

    const res = await api
      .post('/api/reservations')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ customerName: 'Bo', customerPhone: '+905550000011', guestCount: 2, startTime: '2026-08-11T10:00:00.000Z' });
    expect(res.status).toBe(201);

    const created = await prisma.reservation.findFirst({ where: { restaurantId: a.restaurant.id, customerPhone: '+905550000011' } });
    expect(durationMin(created!)).toBe(150);
  });

  it('editing a FIXED_SLOTS reservation keeps using the configured duration, not 120', async () => {
    await prisma.restaurantSettings.update({
      where: { restaurantId: a.restaurant.id },
      data: { logic: 'FIXED_SLOTS', defaultDurationMinutes: 60 },
    });

    const created = await prisma.reservation.findFirst({ where: { restaurantId: a.restaurant.id, customerPhone: '+905550000010' } });
    const res = await api
      .put(`/api/reservations/${created!.id}`)
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ customerName: 'Ada', customerPhone: '+905550000010', guestCount: 2, startTime: '2026-08-10T11:00:00.000Z' });
    expect(res.status).toBe(200);

    const updated = await prisma.reservation.findFirst({ where: { id: created!.id } });
    expect(durationMin(updated!)).toBe(60);
  });
});
