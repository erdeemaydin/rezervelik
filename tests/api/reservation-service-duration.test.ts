import { beforeAll, describe, it, expect } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, SeededTenant } from '../helpers/seed';

// Phase 3 (Tier-1 verticals): a booking that references a service (MenuItem) with an
// intrinsic durationMinutes derives its window from that service instead of the
// tenant's defaultDurationMinutes (default 90). A foreign-tenant serviceId must be
// ignored (tenant-scoping guard), falling back to the default.
describe('Reservation service-driven duration', () => {
  let a: SeededTenant;

  // Seed a tenant with one bookable resource (capacity 4) so auto-assignment works,
  // plus a service with a 45-minute duration.
  async function seedResource(t: SeededTenant) {
    const zone = await prisma.zone.create({ data: { restaurantId: t.restaurant.id, name: 'Main' } });
    await prisma.bookableResource.create({
      data: { restaurantId: t.restaurant.id, tableTypeId: zone.id, identifier: 'R1', capacity: 4 },
    });
  }
  async function seedService(t: SeededTenant, durationMinutes: number | null) {
    const menu = await prisma.menu.create({ data: { restaurantId: t.restaurant.id, name: 'Svc', isActive: true } });
    const cat = await prisma.menuCategory.create({ data: { menuId: menu.id, name: 'Cuts' } });
    return prisma.menuItem.create({ data: { categoryId: cat.id, name: 'Haircut', price: 200, durationMinutes } });
  }

  const durationMin = (r: { startTime: Date; endTime: Date | null }) =>
    (r.endTime!.getTime() - r.startTime.getTime()) / 60000;

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant();
    await seedResource(a);
  });

  it('derives the booking window from the service duration', async () => {
    const service = await seedService(a, 45);
    const res = await api
      .post('/api/reservations')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ serviceId: service.id, customerName: 'Ada', customerPhone: '+905550000001', guestCount: 2, startTime: '2026-08-01T10:00:00.000Z' });
    expect(res.status).toBe(201);

    const created = await prisma.reservation.findFirst({ where: { restaurantId: a.restaurant.id, serviceId: service.id } });
    expect(created).toBeTruthy();
    expect(durationMin(created!)).toBe(45);
  });

  it('falls back to the tenant default (90) when no service is given', async () => {
    const res = await api
      .post('/api/reservations')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ customerName: 'Bo', customerPhone: '+905550000002', guestCount: 2, startTime: '2026-08-02T10:00:00.000Z' });
    expect(res.status).toBe(201);

    const created = await prisma.reservation.findFirst({ where: { restaurantId: a.restaurant.id, customerPhone: '+905550000002' } });
    expect(durationMin(created!)).toBe(90);
  });

  it('ignores a service from another tenant and falls back to the default', async () => {
    const other = await seedTenant();
    const foreignService = await seedService(other, 30);

    const res = await api
      .post('/api/reservations')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ serviceId: foreignService.id, customerName: 'Cy', customerPhone: '+905550000003', guestCount: 2, startTime: '2026-08-03T10:00:00.000Z' });
    expect(res.status).toBe(201);

    const created = await prisma.reservation.findFirst({ where: { restaurantId: a.restaurant.id, customerPhone: '+905550000003' } });
    expect(created!.serviceId).toBeNull(); // foreign service rejected
    expect(durationMin(created!)).toBe(90); // and duration falls back to default
  });
});
