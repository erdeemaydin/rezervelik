import { beforeAll, describe, it, expect } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, SeededTenant } from '../helpers/seed';

// Phase 4 — wedding/organization module: Event pipeline, installment payment plans,
// guest list. Focus on the domain rules and tenant isolation.
describe('Wedding module', () => {
  let a: SeededTenant;
  let b: SeededTenant;

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant({ businessType: 'WEDDING' });
    b = await seedTenant({ businessType: 'WEDDING' });
  });

  const hdr = (t: SeededTenant) => auth(t.tokens.admin, t.restaurant.id);

  async function makePackage(t: SeededTenant, price: number) {
    const menu = await prisma.menu.create({ data: { restaurantId: t.restaurant.id, name: 'Pkgs', isActive: true } });
    const cat = await prisma.menuCategory.create({ data: { menuId: menu.id, name: 'Tiers' } });
    return prisma.menuItem.create({ data: { categoryId: cat.id, name: 'Gold', price } });
  }

  it('creates an event defaulting to the LEAD stage', async () => {
    const res = await api.post('/api/events').set(hdr(a)).send({
      clientName: 'Ada & Bo', clientPhone: '+905550000001', eventDate: '2026-09-01', eventType: 'WEDDING',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.stage).toBe('LEAD');
  });

  it('rejects an invalid pipeline stage', async () => {
    const res = await api.post('/api/events').set(hdr(a)).send({
      clientName: 'X', clientPhone: '+900', eventDate: '2026-09-02', stage: 'BOGUS',
    });
    expect(res.status).toBe(400);
  });

  it('derives quotedTotal from a per-person package × guest count (minor units)', async () => {
    const pkg = await makePackage(a, 1000); // 1000 TRY per person
    const res = await api.post('/api/events').set(hdr(a)).send({
      clientName: 'Cem', clientPhone: '+905550000003', eventDate: '2026-09-03', guestCount: 100, packageId: pkg.id,
    });
    expect(res.status).toBe(201);
    // 1000 * 100 (to minor) * 100 guests = 10,000,000
    expect(res.body.data.quotedTotal).toBe(10_000_000);
  });

  it('ignores a package from another tenant (falls back, no crash)', async () => {
    const foreignPkg = await makePackage(b, 500);
    const res = await api.post('/api/events').set(hdr(a)).send({
      clientName: 'D', clientPhone: '+905550000004', eventDate: '2026-09-04', guestCount: 10, packageId: foreignPkg.id,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.packageId).toBeNull();
    expect(res.body.data.quotedTotal).toBeNull(); // no valid package → no derived total
  });

  it('adds an installment (creating the plan lazily) and stamps paidAt on PAID', async () => {
    const ev = await prisma.event.create({
      data: { restaurantId: a.restaurant.id, clientName: 'E', clientPhone: '+9', eventDate: '2026-09-05' },
    });
    const kapora = await api.post(`/api/events/${ev.id}/installments`).set(hdr(a)).send({
      label: 'Kapora', dueDate: '2026-06-01', amount: 500000, status: 'PAID',
    });
    expect(kapora.status).toBe(201);
    expect(kapora.body.data.paidAt).toBeTruthy();

    const plan = await prisma.paymentPlan.findUnique({ where: { eventId: ev.id }, include: { installments: true } });
    expect(plan).toBeTruthy();
    expect(plan!.installments).toHaveLength(1);
  });

  it('manages guests with RSVP', async () => {
    const ev = await prisma.event.create({
      data: { restaurantId: a.restaurant.id, clientName: 'F', clientPhone: '+9', eventDate: '2026-09-06' },
    });
    const g = await api.post(`/api/events/${ev.id}/guests`).set(hdr(a)).send({ name: 'Uncle', partySize: 3, rsvp: 'YES' });
    expect(g.status).toBe(201);
    expect(g.body.data.partySize).toBe(3);

    const list = await api.get(`/api/events/${ev.id}/guests`).set(hdr(a));
    expect(list.body.data).toHaveLength(1);
  });

  it('isolates events across tenants', async () => {
    const ev = await prisma.event.create({
      data: { restaurantId: a.restaurant.id, clientName: 'Secret', clientPhone: '+9', eventDate: '2026-09-07' },
    });
    // Tenant B cannot read tenant A's event...
    const read = await api.get(`/api/events/${ev.id}`).set(hdr(b));
    expect(read.status).toBe(404);
    // ...nor add guests to it.
    const write = await api.post(`/api/events/${ev.id}/guests`).set(hdr(b)).send({ name: 'Intruder' });
    expect(write.status).toBe(404);
  });
});
