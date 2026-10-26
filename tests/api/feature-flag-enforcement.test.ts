import { beforeAll, describe, it, expect } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, SeededTenant } from '../helpers/seed';

// Bug-audit finding: hasEventPipeline/hasVendors/hasPaymentFeature/etc. were
// only ever consumed by the frontend to hide nav links — nothing server-side
// rejected a direct API call to a module a tenant's businessType/plan doesn't
// include. Verifies the new requireFeature middleware actually gates each
// module, and that flipping the flag back on (the SysAdmin entitlement UI)
// immediately un-gates it.
describe('Server-side feature-flag enforcement', () => {
  let restaurant: SeededTenant; // RESTAURANT profile: hasEventPipeline/hasVendors off, hasPaymentFeature on
  let clinic: SeededTenant; // CLINIC profile: hasPaymentFeature off

  beforeAll(async () => {
    await resetDb();
    restaurant = await seedTenant({ businessType: 'RESTAURANT' });
    clinic = await seedTenant({ businessType: 'CLINIC' });
  });

  it('a RESTAURANT tenant (hasEventPipeline off by default) is rejected from /api/events', async () => {
    const res = await api.get('/api/events').set(auth(restaurant.tokens.admin, restaurant.restaurant.id));
    expect(res.status).toBe(403);
  });

  it('a RESTAURANT tenant (hasVendors off by default) is rejected from /api/vendors', async () => {
    const res = await api.get('/api/vendors').set(auth(restaurant.tokens.admin, restaurant.restaurant.id));
    expect(res.status).toBe(403);
  });

  it('a CLINIC tenant (hasPaymentFeature off by default) is rejected from /api/payments', async () => {
    const res = await api.get('/api/payments').set(auth(clinic.tokens.admin, clinic.restaurant.id));
    expect(res.status).toBe(403);
  });

  it('a CLINIC tenant cannot collect a deposit via the reservation flow even if isPaidReservationEnabled is turned on', async () => {
    await prisma.restaurantSettings.update({
      where: { restaurantId: clinic.restaurant.id },
      data: { isPaidReservationEnabled: true, depositAmount: 100 },
    });
    const zone = await prisma.zone.create({ data: { restaurantId: clinic.restaurant.id, name: 'Main' } });
    await prisma.bookableResource.create({ data: { restaurantId: clinic.restaurant.id, tableTypeId: zone.id, identifier: 'R1', capacity: 4 } });
    await prisma.daySetting.create({ data: { restaurantId: clinic.restaurant.id, date: '2026-10-20', autoConfirm: true } });

    const res = await api
      .post('/api/reservations')
      .set('X-Restaurant-ID', clinic.restaurant.id)
      .send({ customerName: 'Guest', customerPhone: '+905550000080', guestCount: 2, startTime: '2026-10-20T10:00:00.000Z', consentAccepted: true });

    expect(res.status).toBe(201);
    // Auto-confirms outright instead of falling into AWAITING_PAYMENT, because
    // hasPaymentFeature (the entitlement) overrides the tenant's own toggle.
    expect(res.body.data.status).toBe('CONFIRMED');
  });

  it('turning hasEventPipeline back on immediately un-gates /api/events', async () => {
    await prisma.restaurantSettings.update({
      where: { restaurantId: restaurant.restaurant.id },
      data: { hasEventPipeline: true },
    });
    const res = await api.get('/api/events').set(auth(restaurant.tokens.admin, restaurant.restaurant.id));
    expect(res.status).toBe(200);
  });

  it('a RESTAURANT tenant (hasMenuFeature/hasShiftFeature on by default) still reaches menu + scheduling', async () => {
    const menu = await api.get('/api/menus').set('X-Restaurant-ID', restaurant.restaurant.id);
    expect(menu.status).toBe(200);
    const shifts = await api.get('/api/scheduling/shifts').set(auth(restaurant.tokens.admin, restaurant.restaurant.id));
    expect(shifts.status).toBe(200);
  });
});
