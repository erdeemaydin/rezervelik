import { beforeAll, describe, it, expect } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, SeededTenant } from '../helpers/seed';

// Bug-audit finding: addEventVendor's findFirst dedup check races the DB's own
// @@unique([eventId, vendorId]) constraint — two concurrent "Add vendor" clicks
// for the same pair used to have the loser hit an unhandled P2002 and surface an
// opaque 500 instead of the friendly "already added" 400 the sequential path
// already returns.
describe('addEventVendor concurrent-add race', () => {
  let a: SeededTenant;

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant();
  });

  const hdr = () => auth(a.tokens.admin, a.restaurant.id);

  it('never surfaces a raw 500 when two requests race to link the same vendor', async () => {
    const ev = await prisma.event.create({
      data: { restaurantId: a.restaurant.id, clientName: 'Couple', clientPhone: '+9', eventDate: '2026-10-12' },
    });
    const vendor = await api.post('/api/vendors').set(hdr()).send({ name: 'DJ Set', category: 'DJ' });

    const [r1, r2] = await Promise.all([
      api.post(`/api/events/${ev.id}/vendors`).set(hdr()).send({ vendorId: vendor.body.data.id }),
      api.post(`/api/events/${ev.id}/vendors`).set(hdr()).send({ vendorId: vendor.body.data.id }),
    ]);

    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([201, 400]);

    const links = await prisma.eventVendor.findMany({ where: { eventId: ev.id } });
    expect(links).toHaveLength(1);
  });
});
