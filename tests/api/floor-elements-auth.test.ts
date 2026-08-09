import { beforeAll, describe, it, expect } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, SeededTenant } from '../helpers/seed';

// Security-audit finding: floorElementRoutes.ts had no authMiddleware at
// all — only tenantMiddleware (app.ts, just an X-Restaurant-ID header) gated
// it. Since a restaurant's real id is exposed as the public `id` field on
// GET /api/public/restaurant/:slug, anyone who knew a tenant's slug could
// read/write/delete their floor plan with no session whatsoever.
describe('Floor element routes require authentication', () => {
  let a: SeededTenant;

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant();
  });

  it('rejects GET with no session', async () => {
    const res = await api.get('/api/floor-elements').set('X-Restaurant-ID', a.restaurant.id);
    expect(res.status).toBe(401);
  });

  it('rejects POST with no session', async () => {
    const res = await api
      .post('/api/floor-elements')
      .set('X-Restaurant-ID', a.restaurant.id)
      .send({ tableTypeId: 'whatever', type: 'box' });
    expect(res.status).toBe(401);
  });

  it('rejects PUT/DELETE with no session', async () => {
    const put = await api.put('/api/floor-elements/some-id').set('X-Restaurant-ID', a.restaurant.id).send({ label: 'x' });
    expect(put.status).toBe(401);
    const del = await api.delete('/api/floor-elements/some-id').set('X-Restaurant-ID', a.restaurant.id);
    expect(del.status).toBe(401);
  });

  it('allows a real authenticated staff member with manage_tables permission', async () => {
    const zone = await prisma.zone.create({ data: { restaurantId: a.restaurant.id, name: 'Main Floor' } });
    const res = await api
      .post('/api/floor-elements')
      .set(auth(a.tokens.admin, a.restaurant.id))
      .send({ tableTypeId: zone.id, type: 'box', label: 'Wall' });
    expect(res.status).toBe(201);
  });
});
