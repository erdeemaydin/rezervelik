import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import prisma from '../../src/config/prisma';
import { generateToken } from '../../src/utils/jwt';
import { getFeatureProfile } from '../../src/config/businessProfiles';
import { assertTestDatabaseUrl } from '../setup/assertTestDatabaseUrl.mjs';

export const TEST_PASSWORD = 'Password123!';

/**
 * Wipe all data. Deleting tenants cascades their child rows; users covers SUPER_ADMINs.
 * Re-checks DATABASE_URL right before the deletes (belt-and-braces alongside the
 * same check in tests/setup/test-env.ts) since this is the actual destructive
 * operation — a caller that imports resetDb() outside the normal vitest
 * setupFiles path must not be able to skip the guard.
 */
export async function resetDb() {
  assertTestDatabaseUrl(process.env.DATABASE_URL!);
  await prisma.user.deleteMany();
  await prisma.restaurant.deleteMany();
}

type SeededUser = Awaited<ReturnType<typeof prisma.user.create>>;

export interface SeededTenant {
  suffix: string;
  restaurant: Awaited<ReturnType<typeof prisma.restaurant.create>>;
  users: Record<'admin' | 'manager' | 'staff' | 'staffAnalytics' | 'host', SeededUser>;
  tokens: Record<'admin' | 'manager' | 'staff' | 'staffAnalytics' | 'host', string>;
}

/**
 * Create one isolated tenant with a full role matrix and valid JWTs.
 * `businessType` (default RESTAURANT) seeds RestaurantSettings' feature flags
 * from the real per-vertical profile (src/config/businessProfiles.ts) — the
 * same defaults `systemController.createTenant` applies in production — so
 * requireFeature-gated routes (events/vendors need WEDDING, etc.) behave the
 * same in tests as they would for a real tenant of that vertical.
 */
export async function seedTenant(opts: { staffScheduleView?: string; businessType?: string } = {}): Promise<SeededTenant> {
  const suffix = randomUUID().slice(0, 8);
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 4); // low cost = fast tests
  const businessType = opts.businessType || 'RESTAURANT';
  const profile = getFeatureProfile(businessType);

  const restaurant = await prisma.restaurant.create({
    data: {
      slug: `t-${suffix}`,
      name: `Test Restaurant ${suffix}`,
      contactEmail: `owner-${suffix}@test.dev`,
      businessType,
      settings: { create: { staffScheduleView: opts.staffScheduleView || 'OWN_ONLY', ...profile } },
    },
  });

  const mk = (label: string, role: string, permissions: string | null) =>
    prisma.user.create({
      data: {
        restaurantId: restaurant.id,
        email: `${label}-${suffix}@test.dev`,
        passwordHash,
        firstName: label,
        lastName: 'User',
        role,
        permissions,
      },
    });

  const admin = await mk('admin', 'ADMIN', null);
  const manager = await mk('manager', 'MANAGER', 'manage_reservations,manage_staff');
  const staff = await mk('staff', 'STAFF', '');
  const staffAnalytics = await mk('staffanalytics', 'STAFF', 'view_analytics');
  const host = await mk('host', 'HOST', null);

  const tok = (u: SeededUser) => generateToken(u.id, u.restaurantId, u.role);

  return {
    suffix,
    restaurant,
    users: { admin, manager, staff, staffAnalytics, host },
    tokens: {
      admin: tok(admin),
      manager: tok(manager),
      staff: tok(staff),
      staffAnalytics: tok(staffAnalytics),
      host: tok(host),
    },
  };
}

export { prisma };
