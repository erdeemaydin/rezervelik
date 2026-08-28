import { describe, it, expect } from 'vitest';
import { SYSTEM_PERMISSIONS as BACKEND_PERMISSIONS } from '../../src/config/systemPermissions';
import { SYSTEM_PERMISSIONS as FRONTEND_PERMISSIONS } from '../../frontend/src/lib/systemPermissions';

// frontend/src/lib/systemPermissions.ts is a hand-maintained mirror of this
// file for rendering the Add/Edit Administrator picker — see the comment on
// that file. Nothing enforces the two stay in sync except this test: a key
// added/renamed on one side without the other leaves the picker either
// missing a real capability or offering one the backend will silently drop
// (sanitizeSystemPermissions filters unknown keys).
describe('SYSTEM_PERMISSIONS backend/frontend sync', () => {
  it('frontend mirror has exactly the same keys as the backend whitelist', () => {
    const backendKeys = [...BACKEND_PERMISSIONS].sort();
    const frontendKeys = FRONTEND_PERMISSIONS.map((p) => p.key).sort();
    expect(frontendKeys).toEqual(backendKeys);
  });
});
