import { beforeAll, describe, it, expect } from 'vitest';
import bcrypt from 'bcrypt';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, TEST_PASSWORD, SeededTenant } from '../helpers/seed';

// Security-audit finding: the session token lived in localStorage — readable
// by any successful XSS. Session storage moved to an httpOnly cookie the
// browser sends automatically but JS can never read. Verifies the cookie is
// actually set on login, works as the sole credential (no Authorization
// header), and is cleared on logout. Login/impersonate still also return the
// token in the JSON body (kept for non-browser API callers, e.g.
// scripts/smoke-test.mjs) — that's a deliberate, separate concern from what
// the browser SPA itself stores.
describe('Cookie-based session', () => {
  let a: SeededTenant;

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant();
  });

  // supertest's default (non-agent) client doesn't persist cookies across
  // calls like a browser would — extract Set-Cookie manually and pass it
  // forward explicitly so each test is self-contained about what it's using.
  function tokenCookie(res: any): string {
    const raw: string[] = res.headers['set-cookie'] || [];
    const found = raw.find((c) => c.startsWith('token='));
    expect(found).toBeTruthy();
    return found!.split(';')[0];
  }

  it('login sets an httpOnly session cookie', async () => {
    const res = await api.post('/api/auth/login').send({ email: a.users.admin.email, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    const raw: string[] = res.headers['set-cookie'] || [];
    const cookie = raw.find((c) => c.startsWith('token='));
    expect(cookie).toBeTruthy();
    expect(cookie!.toLowerCase()).toContain('httponly');
  });

  it('the cookie alone authenticates a request — no Authorization header needed', async () => {
    const login = await api.post('/api/auth/login').send({ email: a.users.admin.email, password: TEST_PASSWORD });
    const cookie = tokenCookie(login);

    const me = await api.get('/api/auth/me').set('Cookie', cookie);
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe(a.users.admin.email);
  });

  it('logout clears the cookie', async () => {
    const login = await api.post('/api/auth/login').send({ email: a.users.admin.email, password: TEST_PASSWORD });
    const cookie = tokenCookie(login);

    const logout = await api.post('/api/auth/logout').set('Cookie', cookie);
    expect(logout.status).toBe(200);
    const raw: string[] = logout.headers['set-cookie'] || [];
    const cleared = raw.find((c) => c.startsWith('token='));
    expect(cleared).toBeTruthy();
    // clearCookie sends an empty value with an immediate expiry.
    expect(cleared!.split(';')[0]).toBe('token=');
  });

  it('a Bearer header still works as a fallback for non-browser callers', async () => {
    const login = await api.post('/api/auth/login').send({ email: a.users.admin.email, password: TEST_PASSWORD });
    expect(login.body.data.token).toBeTruthy(); // still in the JSON body

    const me = await api.get('/api/auth/me').set('Authorization', `Bearer ${login.body.data.token}`);
    expect(me.status).toBe(200);
  });
});

describe('Impersonation cookie stash/restore', () => {
  let superAdminCookie: string;
  let superAdmin: { id: string; email: string };
  let tenant: SeededTenant;

  function extractCookie(res: any, name: string): string | undefined {
    const raw: string[] = res.headers['set-cookie'] || [];
    return raw.find((c) => c.startsWith(`${name}=`))?.split(';')[0];
  }

  beforeAll(async () => {
    await resetDb();
    tenant = await seedTenant();
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 4);
    superAdmin = await prisma.user.create({
      data: { email: `super-${Date.now()}@test.dev`, passwordHash, firstName: 'Super', lastName: 'Admin', role: 'SUPER_ADMIN' },
    });
    const login = await api.post('/api/auth/login').send({ email: superAdmin.email, password: TEST_PASSWORD });
    superAdminCookie = extractCookie(login, 'token')!;
    expect(superAdminCookie).toBeTruthy();
  });

  it('impersonating stashes the admin token and switches the session cookie to the tenant admin', async () => {
    const res = await api
      .post(`/api/system/tenants/${tenant.restaurant.id}/impersonate`)
      .set('Cookie', superAdminCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('ADMIN');

    const newToken = extractCookie(res, 'token');
    const stash = extractCookie(res, 'adminToken');
    expect(newToken).toBeTruthy();
    expect(stash).toBeTruthy();

    // The new cookie really does authenticate as the tenant admin now.
    const me = await api.get('/api/auth/me').set('Cookie', newToken!);
    expect(me.status).toBe(200);
    expect(me.body.data.role).toBe('ADMIN');
    expect(me.body.data.email).toBe(tenant.users.admin.email);
  });

  it('stop-impersonation restores the original SUPER_ADMIN session from the stash', async () => {
    const impersonate = await api
      .post(`/api/system/tenants/${tenant.restaurant.id}/impersonate`)
      .set('Cookie', superAdminCookie);
    const impersonatedToken = extractCookie(impersonate, 'token')!;
    const stash = extractCookie(impersonate, 'adminToken')!;

    const stop = await api
      .post('/api/system/stop-impersonation')
      .set('Cookie', [impersonatedToken, stash].join('; '));
    expect(stop.status).toBe(200);
    expect(stop.body.data.user.role).toBe('SUPER_ADMIN');
    expect(stop.body.data.user.email).toBe(superAdmin.email);

    const restoredToken = extractCookie(stop, 'token')!;
    const clearedStash = extractCookie(stop, 'adminToken');
    expect(clearedStash!.split(';')[0]).toBe('adminToken=');

    // The restored cookie really does work as a full SUPER_ADMIN session again.
    const tenants = await api.get('/api/system/tenants').set('Cookie', restoredToken);
    expect(tenants.status).toBe(200);
  });

  it('rejects stop-impersonation when there is no stash to restore', async () => {
    const login = await api.post('/api/auth/login').send({ email: tenant.users.admin.email, password: TEST_PASSWORD });
    const cookie = login.headers['set-cookie'].find((c: string) => c.startsWith('token=')).split(';')[0];
    const res = await api.post('/api/system/stop-impersonation').set('Cookie', cookie);
    expect(res.status).toBe(400);
  });

  it('every audit entry written while impersonating is traceable back to the real SUPER_ADMIN', async () => {
    const impersonate = await api
      .post(`/api/system/tenants/${tenant.restaurant.id}/impersonate`)
      .set('Cookie', superAdminCookie);
    const impersonatedToken = extractCookie(impersonate, 'token')!;

    // Any authenticated, audited action taken as the impersonated admin —
    // updating restaurant settings is a simple one already wired to logAudit.
    const settingsRes = await api
      .put('/api/settings')
      .set('Cookie', impersonatedToken)
      .set('X-Restaurant-ID', tenant.restaurant.id)
      .send({ maxPartySize: 6 });
    expect(settingsRes.status).toBe(200);

    // logAudit is deliberately fire-and-forget (never awaited by the
    // controller, so a logging failure can't break the request) — it can
    // still be writing (it does an extra actor-snapshot lookup here) after
    // the HTTP response already came back. Poll briefly instead of assuming
    // it landed the instant the request resolved.
    let log: Awaited<ReturnType<typeof prisma.auditLog.findFirst>> = null;
    for (let i = 0; i < 20 && !log; i++) {
      log = await prisma.auditLog.findFirst({
        where: { restaurantId: tenant.restaurant.id, category: 'SETTINGS' },
        orderBy: { createdAt: 'desc' },
      });
      if (!log) await new Promise((r) => setTimeout(r, 25));
    }
    expect(log).toBeTruthy();
    expect((log!.metadata as any)?.impersonatedBy).toBe(superAdmin.id);
  });
});
