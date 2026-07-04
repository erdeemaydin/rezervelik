import { beforeAll, describe, it, expect } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, SeededTenant } from '../helpers/seed';

describe('RBAC permission guards', () => {
  let a: SeededTenant;
  beforeAll(async () => {
    await resetDb();
    a = await seedTenant();
  });

  it('blocks STAFF without view_analytics from analytics data', async () => {
    const res = await api.get('/api/restaurants/analytics').set(auth(a.tokens.staff, a.restaurant.id));
    expect(res.status).toBe(403);
  });

  it('allows STAFF granted view_analytics past the guard', async () => {
    const res = await api.get('/api/restaurants/analytics').set(auth(a.tokens.staffAnalytics, a.restaurant.id));
    expect(res.status).not.toBe(403);
  });

  it('allows MANAGER (role bypass) past the analytics guard', async () => {
    const res = await api.get('/api/restaurants/analytics').set(auth(a.tokens.manager, a.restaurant.id));
    expect(res.status).not.toBe(403);
  });

  it('gates payments: STAFF forbidden, MANAGER allowed', async () => {
    const staffRes = await api.get('/api/payments').set(auth(a.tokens.staff, a.restaurant.id));
    expect(staffRes.status).toBe(403);

    const mgrRes = await api.get('/api/payments').set(auth(a.tokens.manager, a.restaurant.id));
    expect(mgrRes.status).toBe(200);
  });
});
