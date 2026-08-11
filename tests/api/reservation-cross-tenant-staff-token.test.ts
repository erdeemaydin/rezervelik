import { beforeAll, describe, it, expect } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, SeededTenant } from '../helpers/seed';

// Security-audit finding: createReservation's isStaffRequest() only checked
// that the Authorization header held *some* valid JWT — unlike authMiddleware,
// it never compared the token's restaurantId against req.restaurantId. Since
// POST /api/reservations is public (no authMiddleware in front of it), any
// staff member's own valid token let them act as "staff" against a
// *different* tenant just by setting X-Restaurant-ID to the victim's id,
// bypassing every staff-only carve-out: maxPartySize, DaySetting
// capacity/conflict overrides, and (separately) the isVIP/internalNote fields.
describe('Cross-tenant staff-token privilege escalation', () => {
  let victim: SeededTenant;
  let attacker: SeededTenant;

  beforeAll(async () => {
    await resetDb();
    victim = await seedTenant();
    attacker = await seedTenant();
    await prisma.restaurantSettings.update({ where: { restaurantId: victim.restaurant.id }, data: { maxPartySize: 8 } });
    const zone = await prisma.zone.create({ data: { restaurantId: victim.restaurant.id, name: 'Main' } });
    await prisma.bookableResource.create({
      data: { restaurantId: victim.restaurant.id, tableTypeId: zone.id, identifier: 'V1', capacity: 40 },
    });
  });

  it('does not let another tenant\'s valid staff token bypass the victim tenant\'s maxPartySize cap', async () => {
    const res = await api
      .post('/api/reservations')
      .set(auth(attacker.tokens.admin, victim.restaurant.id))
      .send({ customerName: 'Cross Tenant', customerPhone: '+905550002001', guestCount: 500, startTime: '2026-10-20T10:00:00.000Z' });
    expect(res.status).toBe(400);
  });

  it('does not let another tenant\'s valid staff token set isVIP/internalNote on the victim tenant', async () => {
    const res = await api
      .post('/api/reservations')
      .set(auth(attacker.tokens.admin, victim.restaurant.id))
      .send({
        customerName: 'Cross Tenant VIP',
        customerPhone: '+905550002002',
        guestCount: 2,
        startTime: '2026-10-21T10:00:00.000Z',
        isVIP: true,
        internalNote: 'planted note',
      });
    // Not staff-recognized for this tenant -> falls back to the guest path,
    // which still succeeds (within cap) but must not honor isVIP/internalNote.
    expect(res.status).toBe(201);
    expect(res.body.data.isVIP).toBe(false);
    expect(res.body.data.internalNote).toBeNull();
  });

  it('still lets the tenant\'s own staff token exceed maxPartySize', async () => {
    const res = await api
      .post('/api/reservations')
      .set(auth(victim.tokens.admin, victim.restaurant.id))
      .send({ customerName: 'Real Staff', customerPhone: '+905550002003', guestCount: 40, startTime: '2026-10-22T10:00:00.000Z' });
    expect(res.status).toBe(201);
  });
});
