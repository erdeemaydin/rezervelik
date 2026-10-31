import prisma from '../config/prisma';

// CustomerBan is deliberately phone-scoped rather than Customer-scoped (plan
// decision #4): a banned customer who deletes their record and re-registers
// with the same number must stay banned, and a ban can be placed on a number
// that has never completed an OTP flow at all. Every helper here therefore
// takes a phone string, already normalized the same way the customer path
// stores it (a plain .trim() — see customerOrderController.verifyOtp).

/** True when this tenant has an active (never lifted) ban on `phone`. */
export async function isPhoneBanned(restaurantId: string, phone: string): Promise<boolean> {
  const trimmed = (phone || '').trim();
  if (!trimmed) return false;
  const ban = await prisma.customerBan.findFirst({
    where: { restaurantId, phone: trimmed, liftedAt: null },
    select: { id: true },
  });
  return ban !== null;
}

/**
 * Batch form of the above, for list endpoints. One query for the whole page
 * of orders/customers instead of a ban lookup per row — the list surfaces
 * routinely return hundreds of rows, and a per-row query there is the classic
 * N+1 that makes the order board crawl.
 */
export async function activeBannedPhones(restaurantId: string, phones: string[]): Promise<Set<string>> {
  const unique = [...new Set(phones.map((p) => (p || '').trim()).filter(Boolean))];
  if (unique.length === 0) return new Set();
  const bans = await prisma.customerBan.findMany({
    where: { restaurantId, phone: { in: unique }, liftedAt: null },
    select: { phone: true },
  });
  return new Set(bans.map((b) => b.phone));
}
