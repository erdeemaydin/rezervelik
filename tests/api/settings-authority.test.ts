import { beforeAll, describe, it, expect } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, SeededTenant } from '../helpers/seed';

describe('Settings authority (currency is root-admin-only)', () => {
  let a: SeededTenant;
  beforeAll(async () => {
    await resetDb();
    a = await seedTenant();
  });

  it('ignores currency but applies other fields on the tenant settings endpoint', async () => {
    const before = await prisma.restaurantSettings.findUnique({ where: { restaurantId: a.restaurant.id } });

    const res = await api
      .put('/api/settings')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ currency: 'USD', maxPartySize: 12 });
    expect(res.status).toBe(200);

    const after = await prisma.restaurantSettings.findUnique({ where: { restaurantId: a.restaurant.id } });
    expect(after!.currency).toBe(before!.currency); // currency unchanged (root-only)
    expect(after!.maxPartySize).toBe(12); // other settings did update
  });
});
