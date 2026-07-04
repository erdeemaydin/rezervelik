import { beforeAll, describe, it, expect } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, SeededTenant } from '../helpers/seed';

describe('Multi-tenant isolation', () => {
  let a: SeededTenant;
  let b: SeededTenant;

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant();
    b = await seedTenant();
    await prisma.menu.create({ data: { restaurantId: a.restaurant.id, name: 'A-menu', isActive: true } });
    await prisma.menu.create({ data: { restaurantId: b.restaurant.id, name: 'B-menu', isActive: true } });
  });

  it('only returns menus for the requested tenant', async () => {
    const res = await api.get('/api/menus').set(auth(a.tokens.admin, a.restaurant.id));
    expect(res.status).toBe(200);
    const names = res.body.data.map((m: any) => m.name);
    expect(names).toContain('A-menu');
    expect(names).not.toContain('B-menu');
    expect(res.body.data.every((m: any) => m.restaurantId === a.restaurant.id)).toBe(true);
  });

  it('400s when the tenant header is missing', async () => {
    const res = await api.get('/api/menus');
    expect(res.status).toBe(400);
  });
});
