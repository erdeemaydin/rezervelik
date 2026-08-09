import { beforeAll, describe, it, expect } from 'vitest';
import { api } from '../helpers/app';
import { resetDb, seedTenant, prisma } from '../helpers/seed';

// Security-audit finding: GET /api/public/restaurant/:slug (unauthenticated)
// returned the raw RestaurantSettings row via `include: { settings: true }`,
// leaking internal/staff-only config to anyone — most notably
// twoFactorEnabled/twoFactorRoles (auth policy reconnaissance), plus other
// admin-only fields with no public-page use. Now allowlisted via a nested
// `select`; this pins both halves of that contract.
describe('GET /public/restaurant/:slug settings allowlist', () => {
  let slug: string;

  beforeAll(async () => {
    await resetDb();
    const tenant = await seedTenant();
    slug = tenant.restaurant.slug;
    await prisma.restaurantSettings.update({
      where: { restaurantId: tenant.restaurant.id },
      data: {
        twoFactorEnabled: true,
        twoFactorRoles: 'ADMIN,MANAGER',
        showAuditLogToTenant: true,
        staffScheduleView: 'FULL_ROSTER',
        schedulingSystem: 'WEEKLY',
        defaultBreakMinutes: 15,
        dashboardTheme: 'terracotta',
        defaultLanguage: 'en',
        googleMapsUrl: 'https://maps.google.com/?cid=12345',
        googlePlaceId: 'secret-place-id',
      },
    });
  });

  it('excludes internal/staff-only settings fields', async () => {
    const res = await api.get(`/api/public/restaurant/${slug}`);
    expect(res.status).toBe(200);
    const settings = res.body.data.settings;
    expect(settings).toBeTruthy();

    for (const field of [
      'twoFactorEnabled',
      'twoFactorRoles',
      'showAuditLogToTenant',
      'staffScheduleView',
      'schedulingSystem',
      'defaultBreakMinutes',
      'dashboardTheme',
      'defaultLanguage',
      'googleMapsUrl',
      'googlePlaceId',
    ]) {
      expect(settings).not.toHaveProperty(field);
    }
  });

  it('still includes every field the public booking pages consume', async () => {
    const res = await api.get(`/api/public/restaurant/${slug}`);
    const settings = res.body.data.settings;

    for (const field of [
      'isReservationEnabled',
      'logic',
      'defaultDurationMinutes',
      'isPaidReservationEnabled',
      'depositAmount',
      'currency',
      'maxPartySize',
      'operatingHours',
      'openingHour',
      'closingHour',
      'timezone',
      'hasWaitTimeFeature',
      'hasShiftFeature',
      'hasMenuFeature',
      'hasPaymentFeature',
      'hasEventPipeline',
      'hasInstallmentPlans',
      'hasGuestList',
      'hasVendors',
      'isVipEnabled',
      'isCategoriesEnabled',
    ]) {
      expect(settings).toHaveProperty(field);
    }
  });
});
