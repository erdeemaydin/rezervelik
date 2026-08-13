import { beforeAll, describe, it, expect } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, SeededTenant } from '../helpers/seed';

// Regression: assignShift's DOUBLE_SHIFT/CONSECUTIVE_REST/UNAVAILABLE check
// (findAssignShiftViolations) ran inside a $transaction, but under Postgres'
// default READ COMMITTED isolation a plain read takes no row lock — so two
// concurrent "Assign shift" requests for the *same staff member* on the *same
// day* but *different* shifts could both read "no conflicting assignment yet",
// both pass the violation check, and both commit. The
// @@unique([shiftId, userId, date]) constraint doesn't catch this because the
// two racing requests use different shiftIds. This is exactly the
// DOUBLE_SHIFT rule PROJECT_LOGIC.md §10 requires the assigner to enforce.
// Confirmed by hand before the fix: with several parallel requests, more than
// one landed 201 in roughly 1 out of every 4-5 runs on a fast local Postgres —
// this test fires enough concurrent requests to reliably reproduce that window.
describe('assignShift concurrent-assignment race (DOUBLE_SHIFT)', () => {
  let a: SeededTenant;
  let shifts: { id: string }[];

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant();
    shifts = await Promise.all(
      [
        ['Morning', '08:00', '12:00'],
        ['Midday', '12:00', '16:00'],
        ['Afternoon', '16:00', '20:00'],
        ['Evening', '20:00', '23:59'],
        ['Extra', '06:00', '08:00'],
      ].map(([name, startTime, endTime]) =>
        prisma.shift.create({ data: { restaurantId: a.restaurant.id, name, startTime, endTime } })
      )
    );
  });

  it('only one of several concurrent assignments for the same staffer/day lands', async () => {
    const date = '2026-11-02';

    const responses = await Promise.all(
      shifts.map((s) =>
        api.post('/api/scheduling/assignments').set(auth(a.tokens.admin, a.restaurant.id))
          .send({ shiftId: s.id, userId: a.users.staff.id, date })
      )
    );

    const successCount = responses.filter((r) => r.status === 201).length;
    const conflictCount = responses.filter((r) => r.status === 409).length;
    // Exactly one of the racing requests must land; every other one must be
    // rejected as a DOUBLE_SHIFT violation — never more than one succeeding.
    expect(successCount).toBe(1);
    expect(conflictCount).toBe(shifts.length - 1);

    const assignments = await prisma.shiftAssignment.findMany({ where: { userId: a.users.staff.id, date } });
    expect(assignments).toHaveLength(1);
  });
});
