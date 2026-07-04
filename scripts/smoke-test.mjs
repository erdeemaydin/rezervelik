#!/usr/bin/env node
// Post-deploy smoke test — run against a LIVE instance after deploying, before
// trusting it with traffic. Dependency-free (needs only Node 18+ global fetch).
//
// Env:
//   SMOKE_BASE_URL       (default http://localhost:3000)  — API origin
//   SMOKE_EMAIL, SMOKE_PASSWORD                            — optional login check
//   SMOKE_RESTAURANT_ID                                    — optional tenant read check
//
// Exits non-zero on the first failed check (so CD can halt / roll back).

const base = (process.env.SMOKE_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

function ok(cond, msg) {
  if (!cond) {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
  console.log(`✓ ${msg}`);
}

async function main() {
  // 1. Liveness
  let res;
  try {
    res = await fetch(`${base}/health`);
  } catch (e) {
    ok(false, `reach ${base}/health (${e.message})`);
    return;
  }
  ok(res.ok, `GET /health → ${res.status}`);
  const health = await res.json().catch(() => ({}));
  ok(health.status === 'ok', 'health payload is { status: "ok" }');

  // 2. Login round-trip (optional)
  const email = process.env.SMOKE_EMAIL;
  const password = process.env.SMOKE_PASSWORD;
  if (email && password) {
    const login = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const body = await login.json().catch(() => ({}));
    ok(login.ok && !!body?.data?.token, 'login returns a session token');

    // 3. Authenticated, tenant-scoped read (optional)
    const restaurantId = process.env.SMOKE_RESTAURANT_ID;
    if (restaurantId && body?.data?.token) {
      const settings = await fetch(`${base}/api/settings`, {
        headers: { Authorization: `Bearer ${body.data.token}`, 'X-Restaurant-ID': restaurantId },
      });
      ok(settings.ok, `authenticated GET /api/settings → ${settings.status}`);
    }
  } else {
    console.log('· skipping login checks (SMOKE_EMAIL/SMOKE_PASSWORD not set)');
  }

  console.log('\nSmoke test passed.');
}

main().catch((e) => {
  console.error('Smoke test crashed:', e);
  process.exit(1);
});
