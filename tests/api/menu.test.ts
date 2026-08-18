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

  // Regression: POST /menus/items is the flat route (no :categoryId in the
  // path — see src/routes/menuRoutes.ts), but createMenuItem used to read
  // categoryId from req.params instead of req.body, so it was always
  // undefined and every create 400'd as "Invalid categoryId" — no test ever
  // asserted the happy path actually returns 201, so this went unnoticed.
  it('creates a menu item under its category', async () => {
    const menu = await prisma.menu.create({ data: { restaurantId: a.restaurant.id, name: 'Create Test', isActive: false } });
    const cat = await prisma.menuCategory.create({ data: { menuId: menu.id, name: 'Starters' } });

    const res = await api
      .post('/api/menus/items')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ categoryId: cat.id, name: 'Soup', price: 12.5 });

    expect(res.status).toBe(201);
    expect(res.body.data.categoryId).toBe(cat.id);
    const item = await prisma.menuItem.findUnique({ where: { id: res.body.data.id } });
    expect(item).toMatchObject({ categoryId: cat.id, name: 'Soup', price: 12.5 });
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

    // Price is not changed yet, and a scheduled (PENDING) job now exists.
    // The immediate apply above also writes its own EXPLICIT_SET row (status
    // APPLIED, added so immediate changes show up in history/undo the same as
    // worker-applied ones) — filter to PENDING so this only counts the actual
    // not-yet-applied scheduled job, not that unrelated history entry.
    expect((await prisma.menuItem.findUnique({ where: { id: item.id } }))!.price).toBe(150);
    const jobs = await prisma.scheduledPriceUpdate.findMany({
      where: { restaurantId: a.restaurant.id, updateType: 'EXPLICIT_SET', status: 'PENDING' },
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
