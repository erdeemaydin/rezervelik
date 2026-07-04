import { beforeAll, describe, it, expect } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, SeededTenant } from '../helpers/seed';

describe('Menu rules', () => {
  let a: SeededTenant;
  beforeAll(async () => {
    await resetDb();
    a = await seedTenant();
  });

  it('keeps only one menu live at a time', async () => {
    await api.post('/api/menus').set(auth(a.tokens.admin, a.restaurant.id)).send({ name: 'M1', isActive: true });
    await api.post('/api/menus').set(auth(a.tokens.admin, a.restaurant.id)).send({ name: 'M2', isActive: true });

    const active = await prisma.menu.findMany({ where: { restaurantId: a.restaurant.id, isActive: true } });
    expect(active).toHaveLength(1);
    expect(active[0].name).toBe('M2');
  });

  it('bulk price set applies immediately but defers a future-scheduled change', async () => {
    const menu = await prisma.menu.create({ data: { restaurantId: a.restaurant.id, name: 'Priced', isActive: false } });
    const cat = await prisma.menuCategory.create({ data: { menuId: menu.id, name: 'Mains' } });
    const item = await prisma.menuItem.create({ data: { categoryId: cat.id, name: 'Dish', price: 100 } });

    const immediate = await api
      .post('/api/menus/prices/set')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ items: [{ id: item.id, price: 150 }] });
    expect(immediate.status).toBe(200);
    expect((await prisma.menuItem.findUnique({ where: { id: item.id } }))!.price).toBe(150);

    const future = new Date(Date.now() + 3600_000).toISOString();
    const scheduled = await api
      .post('/api/menus/prices/set')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ items: [{ id: item.id, price: 222 }], scheduledFor: future });
    expect(scheduled.status).toBe(201);

    // Price is not changed yet, and a scheduled job now exists.
    expect((await prisma.menuItem.findUnique({ where: { id: item.id } }))!.price).toBe(150);
    const jobs = await prisma.scheduledPriceUpdate.findMany({
      where: { restaurantId: a.restaurant.id, updateType: 'EXPLICIT_SET' },
    });
    expect(jobs).toHaveLength(1);
  });

  it('rejects setting a price on an item from another tenant', async () => {
    const other = await seedTenant();
    const menu = await prisma.menu.create({ data: { restaurantId: other.restaurant.id, name: 'X', isActive: false } });
    const cat = await prisma.menuCategory.create({ data: { menuId: menu.id, name: 'C' } });
    const foreignItem = await prisma.menuItem.create({ data: { categoryId: cat.id, name: 'Foreign', price: 10 } });

    const res = await api
      .post('/api/menus/prices/set')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ items: [{ id: foreignItem.id, price: 999 }] });
    expect(res.status).toBe(404); // not owned by this tenant → nothing updated
    expect((await prisma.menuItem.findUnique({ where: { id: foreignItem.id } }))!.price).toBe(10);
  });
});
