import { describe, it, expect, vi } from 'vitest';
import { api } from '../helpers/app';
import { resetDb, prisma } from '../helpers/seed';

// Bug-audit finding: minting a platform-level SUPER_ADMIN via the token-gated
// bootstrap endpoint left no audit trail at all, unlike its sibling
// createSystemAdmin (used for every subsequent admin added from the console).
describe('setup-super-admin bootstrap is audit-logged', () => {
  it('writes a SYSTEM/SUPER_ADMIN_BOOTSTRAPPED audit row', async () => {
    await resetDb();
    const res = await api.post('/api/system/setup-super-admin').send({
      email: 'root@test.dev',
      password: 'Password123!',
      firstName: 'Root',
      lastName: 'Admin',
      secretToken: 'test-setup-secret',
    });
    expect(res.status).toBe(201);

    // logAudit is fire-and-forget, so the row can land just after the response.
    const log = await vi.waitFor(async () => {
      const row = await prisma.auditLog.findFirst({ where: { action: 'SUPER_ADMIN_BOOTSTRAPPED' } });
      expect(row).toBeTruthy();
      return row;
    });
    expect(log!.category).toBe('SYSTEM');
    expect(log!.targetLabel).toBe('root@test.dev');
  });
});
