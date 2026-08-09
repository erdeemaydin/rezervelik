import { beforeAll, describe, it, expect } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, SeededTenant } from '../helpers/seed';

// Security-audit finding: updateMenu/deleteMenu/createCategory/updateCategory/
// deleteCategory/createMenuItem/updateMenuItem/deleteMenuItem all mutated rows
// by `where: { id }` alone with no restaurantId/ownership check — any
// authenticated tenant admin (valid session, just for a DIFFERENT restaurant)
// could read/write/delete another tenant's menu data by guessing an id.
describe('Menu controller — cross-tenant isolation', () => {
  let a: SeededTenant;
  let b: SeededTenant;
  let menuB: { id: string };
  let catB: { id: string; menuId: string };
  let itemB: { id: string };

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant();
    b = await seedTenant();
    menuB = await prisma.menu.create({ data: { restaurantId: b.restaurant.id, name: 'B Menu', isActive: false } });
    catB = await prisma.menuCategory.create({ data: { menuId: menuB.id, name: 'B Category' } });
    itemB = await prisma.menuItem.create({ data: { categoryId: catB.id, name: 'B Dish', price: 42 } });
  });

  it('blocks tenant A from renaming/activating tenant B menu by id', async () => {
    const res = await api
      .put(`/api/menus/${menuB.id}`)
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ name: 'Hijacked', isActive: true });
    expect(res.status).toBe(404);
    expect((await prisma.menu.findUnique({ where: { id: menuB.id } }))!.name).toBe('B Menu');
  });

  it('blocks tenant A from deleting tenant B menu by id', async () => {
    const res = await api.delete(`/api/menus/${menuB.id}`).set(auth(a.tokens.admin, a.restaurant.id));
    expect(res.status).toBe(404);
    expect(await prisma.menu.findUnique({ where: { id: menuB.id } })).toBeTruthy();
  });

  it('blocks tenant A from attaching a category to tenant B menu', async () => {
    const res = await api
      .post('/api/menus/categories')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ menuId: menuB.id, name: 'Hijacked Category' });
    expect(res.status).toBe(400);
  });

  it('blocks tenant A from editing tenant B category by id', async () => {
    const res = await api
      .put(`/api/menus/categories/${catB.id}`)
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ name: 'Hijacked' });
    expect(res.status).toBe(404);
    expect((await prisma.menuCategory.findUnique({ where: { id: catB.id } }))!.name).toBe('B Category');
  });

  it('blocks tenant A from deleting tenant B category by id', async () => {
    const res = await api.delete(`/api/menus/categories/${catB.id}`).set(auth(a.tokens.admin, a.restaurant.id));
    expect(res.status).toBe(404);
    expect(await prisma.menuCategory.findUnique({ where: { id: catB.id } })).toBeTruthy();
  });

  it('blocks tenant A from creating an item under tenant B category', async () => {
    const res = await api
      .post('/api/menus/items')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ categoryId: catB.id, name: 'Hijacked Item', price: 10 });
    expect(res.status).toBe(400);
  });

  it('blocks tenant A from editing tenant B item by id', async () => {
    const res = await api
      .put(`/api/menus/items/${itemB.id}`)
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ name: 'Hijacked' });
    expect(res.status).toBe(404);
    expect((await prisma.menuItem.findUnique({ where: { id: itemB.id } }))!.name).toBe('B Dish');
  });

  it('blocks tenant A from moving their own item into tenant B category', async () => {
    const ownMenu = await prisma.menu.create({ data: { restaurantId: a.restaurant.id, name: 'A Menu', isActive: false } });
    const ownCat = await prisma.menuCategory.create({ data: { menuId: ownMenu.id, name: 'A Category' } });
    const ownItem = await prisma.menuItem.create({ data: { categoryId: ownCat.id, name: 'A Dish', price: 5 } });

    const res = await api
      .put(`/api/menus/items/${ownItem.id}`)
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ categoryId: catB.id });
    expect(res.status).toBe(400);
    expect((await prisma.menuItem.findUnique({ where: { id: ownItem.id } }))!.categoryId).toBe(ownCat.id);
  });

  it('blocks tenant A from deleting tenant B item by id', async () => {
    const res = await api.delete(`/api/menus/items/${itemB.id}`).set(auth(a.tokens.admin, a.restaurant.id));
    expect(res.status).toBe(404);
    expect(await prisma.menuItem.findUnique({ where: { id: itemB.id } })).toBeTruthy();
  });

  it('rejects a category cycle: setting parentId to one of its own descendants', async () => {
    const menu = await prisma.menu.create({ data: { restaurantId: a.restaurant.id, name: 'Cycle Menu', isActive: false } });
    const parent = await prisma.menuCategory.create({ data: { menuId: menu.id, name: 'Parent' } });
    const child = await prisma.menuCategory.create({ data: { menuId: menu.id, name: 'Child', parentId: parent.id } });

    const res = await api
      .put(`/api/menus/categories/${parent.id}`)
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ parentId: child.id });
    expect(res.status).toBe(400);
  });

  it('rejects a category being set as its own parent', async () => {
    const menu = await prisma.menu.create({ data: { restaurantId: a.restaurant.id, name: 'Self Menu', isActive: false } });
    const cat = await prisma.menuCategory.create({ data: { menuId: menu.id, name: 'Solo' } });

    const res = await api
      .put(`/api/menus/categories/${cat.id}`)
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ parentId: cat.id });
    expect(res.status).toBe(400);
  });
});

describe('Menu item price validation', () => {
  let a: SeededTenant;
  let categoryId: string;

  beforeAll(async () => {
    a = await seedTenant();
    const menu = await prisma.menu.create({ data: { restaurantId: a.restaurant.id, name: 'Price Menu', isActive: false } });
    const cat = await prisma.menuCategory.create({ data: { menuId: menu.id, name: 'Mains' } });
    categoryId = cat.id;
  });

  it('rejects creating an item with a negative price', async () => {
    const res = await api
      .post('/api/menus/items')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ categoryId, name: 'Bad Price', price: -5 });
    expect(res.status).toBe(400);
  });

  it('rejects creating an item with a non-numeric price', async () => {
    const res = await api
      .post('/api/menus/items')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ categoryId, name: 'NaN Price', price: 'not-a-number' });
    expect(res.status).toBe(400);
  });

  it('rejects updating an item to a negative price', async () => {
    const item = await prisma.menuItem.create({ data: { categoryId, name: 'Dish', price: 20 } });
    const res = await api
      .put(`/api/menus/items/${item.id}`)
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ price: -1 });
    expect(res.status).toBe(400);
    expect((await prisma.menuItem.findUnique({ where: { id: item.id } }))!.price).toBe(20);
  });
});
