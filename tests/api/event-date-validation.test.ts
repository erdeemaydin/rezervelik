import { beforeAll, describe, it, expect } from 'vitest';
import { api, auth } from '../helpers/app';
import { resetDb, seedTenant, prisma, SeededTenant } from '../helpers/seed';

// Regression: updateEvent built contractSignedAt/proposalSentAt with a bare
// `new Date(b.contractSignedAt)` and no validation that the client-supplied
// value actually parses. A malformed string produced an Invalid Date, which
// Prisma rejects on the DateTime column — this fell through to the generic
// 500 handler instead of a clean 400, same class of gap already guarded for
// guestCount/quotedTotal/amount elsewhere in this controller (see
// event-numeric-validation.test.ts).
describe('updateEvent rejects invalid contract/proposal dates with 400, not 500', () => {
  let a: SeededTenant;
  const hdr = () => auth(a.tokens.admin, a.restaurant.id);

  beforeAll(async () => {
    await resetDb();
    a = await seedTenant({ businessType: 'WEDDING' });
  });

  async function makeEvent() {
    const res = await api.post('/api/events').set(hdr()).send({
      clientName: 'Test Client', clientPhone: '+905550000099', eventDate: '2026-10-01',
    });
    return res.body.data.id as string;
  }

  it('rejects a non-parseable contractSignedAt', async () => {
    const eventId = await makeEvent();
    const res = await api.put(`/api/events/${eventId}`).set(hdr()).send({ contractSignedAt: 'not-a-date' });
    expect(res.status).toBe(400);

    const unchanged = await prisma.event.findUnique({ where: { id: eventId } });
    expect(unchanged!.contractSignedAt).toBeNull();
  });

  it('rejects a non-parseable proposalSentAt', async () => {
    const eventId = await makeEvent();
    const res = await api.put(`/api/events/${eventId}`).set(hdr()).send({ proposalSentAt: 'also-garbage' });
    expect(res.status).toBe(400);
  });

  it('still accepts a valid contractSignedAt and clearing it with null', async () => {
    const eventId = await makeEvent();
    const set = await api.put(`/api/events/${eventId}`).set(hdr()).send({ contractSignedAt: '2026-09-01T10:00:00.000Z' });
    expect(set.status).toBe(200);
    expect(new Date(set.body.data.contractSignedAt).toISOString()).toBe('2026-09-01T10:00:00.000Z');

    const cleared = await api.put(`/api/events/${eventId}`).set(hdr()).send({ contractSignedAt: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.data.contractSignedAt).toBeNull();
  });
});
