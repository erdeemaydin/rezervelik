import { beforeAll, describe, it, expect } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, SeededTenant } from '../helpers/seed';

// Critical bug-audit finding: /api/wait-time/* had NO auth check at all — only
// tenantMiddleware (which just requires an X-Restaurant-ID header the caller
// supplies themselves). The live waitlist (customer names/phones), wait-time
// config, and sendOffer were reachable by anyone who knew a tenant's
// restaurant UUID — which isn't secret, since GET /api/public/restaurant/:slug
// returns it to any visitor of the public booking page.
describe('Wait-time routes require authentication + manage_settings', () => {
  let a: SeededTenant;

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant();
  });

  it('rejects a request with no Authorization header at all', async () => {
    const res = await api.get('/api/wait-time/entries').set('X-Restaurant-ID', a.restaurant.id);
    expect(res.status).toBe(401);
  });

  it('rejects a request from a staff member without manage_settings', async () => {
    const res = await api.get('/api/wait-time/entries').set(auth(a.tokens.staff, a.restaurant.id));
    expect(res.status).toBe(403);
  });

  it('allows an ADMIN through', async () => {
    const res = await api.get('/api/wait-time/entries').set(auth(a.tokens.admin, a.restaurant.id));
    expect(res.status).toBe(200);
  });

  it('the restaurant UUID used to gate these routes is not itself a secret', async () => {
    const res = await api.get(`/api/public/restaurant/${a.restaurant.slug}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(a.restaurant.id);
  });
});
