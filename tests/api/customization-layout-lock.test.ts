import { beforeAll, describe, it, expect } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, SeededTenant } from '../helpers/seed';

// PROJECT_LOGIC.md §8: layoutStyle (which of the four public-page layout
// components a tenant gets) is a SysAdmin-exclusive decision, set only via
// PUT /api/system/tenants/:id/settings. The tenant-facing PUT /api/customization
// route (reachable by any ADMIN/MANAGER with manage_settings) used to accept and
// apply layoutStyle straight from the request body, so a tenant could flip its own
// layout with a direct API call even though the dashboard UI never exposes that
// control.
describe('Tenant customization endpoint cannot change layoutStyle', () => {
  let a: SeededTenant;

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant();
  });

  it('ignores a layoutStyle sent by a tenant admin', async () => {
    const before = await prisma.frontendCustomization.findUnique({ where: { restaurantId: a.restaurant.id } });
    const originalLayout = before?.layoutStyle ?? 'CLASSIC_LIST';

    const res = await api
      .put('/api/customization')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ layoutStyle: 'EDITORIAL_IMAGE', primaryColor: '#123456' });
    expect(res.status).toBe(200);
    expect(res.body.data.layoutStyle).toBe(originalLayout);
    expect(res.body.data.primaryColor).toBe('#123456');

    const after = await prisma.frontendCustomization.findUnique({ where: { restaurantId: a.restaurant.id } });
    expect(after!.layoutStyle).toBe(originalLayout);
  });
});
