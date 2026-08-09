import { beforeAll, describe, it, expect } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, SeededTenant } from '../helpers/seed';

// Security-audit finding: bulkUpdatePrices accepted a non-numeric `value`
// (parseFloat -> NaN, no guard), an arbitrary `updateType` string, a
// non-boolean `isIncrease`, and an unparseable `scheduledFor` — all of which
// reached the ScheduledPriceUpdate row and, for a bad `value`, would corrupt
// every menu item's price to NaN the next time priceUpdater.ts's worker
// ticks (Postgres' float type happily stores NaN).
describe('POST /api/menus/prices/bulk validation', () => {
  let a: SeededTenant;

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant();
  });

  it('rejects a non-numeric value', async () => {
    const res = await api
      .post('/api/menus/prices/bulk')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ updateType: 'PERCENTAGE', value: 'not-a-number', isIncrease: true });
    expect(res.status).toBe(400);
    expect(await prisma.scheduledPriceUpdate.count({ where: { restaurantId: a.restaurant.id } })).toBe(0);
  });

  it('rejects a negative value', async () => {
    const res = await api
      .post('/api/menus/prices/bulk')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ updateType: 'PERCENTAGE', value: -10, isIncrease: true });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid updateType', async () => {
    const res = await api
      .post('/api/menus/prices/bulk')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ updateType: 'SOMETHING_ELSE', value: 10, isIncrease: true });
    expect(res.status).toBe(400);
  });

  it('rejects a non-boolean isIncrease', async () => {
    const res = await api
      .post('/api/menus/prices/bulk')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ updateType: 'PERCENTAGE', value: 10, isIncrease: 'yes' });
    expect(res.status).toBe(400);
  });

  it('rejects an unparseable scheduledFor', async () => {
    const res = await api
      .post('/api/menus/prices/bulk')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ updateType: 'PERCENTAGE', value: 10, isIncrease: true, scheduledFor: 'not-a-date' });
    expect(res.status).toBe(400);
  });

  it('accepts a valid PERCENTAGE update', async () => {
    const res = await api
      .post('/api/menus/prices/bulk')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ updateType: 'PERCENTAGE', value: 10, isIncrease: true });
    expect(res.status).toBe(201);
    expect(res.body.data.value).toBe(10);
  });
});
