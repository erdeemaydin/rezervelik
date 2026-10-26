import { Prisma } from '@prisma/client';
import prisma from '../config/prisma';

// Entries in these statuses are still occupying a spot in the real-time queue and
// are what WaitTimeConfig.peopleWaiting is meant to count.
const ACTIVE_WAITLIST_STATUSES = ['WAITING', 'NOTIFIED', 'OFFERED'];

/**
 * joinPublicWaitlist increments WaitTimeConfig.peopleWaiting for real-time
 * (non-date-based) entries under calculated mode, so the next quote reflects a
 * longer queue — but nothing ever decremented it when an entry left the queue
 * (seated, canceled, no-show). Quoted wait times climbed all service and only a
 * manual config edit could reset it. Call this whenever an entry transitions out
 * of the active set into a terminal one.
 */
export async function releaseWaitlistCapacity({
  restaurantId, fromStatus, toStatus, partySize, targetDate, tx,
}: {
  restaurantId: string;
  fromStatus: string;
  toStatus: string;
  partySize: number;
  targetDate: string | null;
  tx?: Prisma.TransactionClient;
}) {
  if (targetDate) return; // date-based entries never contributed to peopleWaiting
  if (!ACTIVE_WAITLIST_STATUSES.includes(fromStatus)) return; // wasn't counted
  if (ACTIVE_WAITLIST_STATUSES.includes(toStatus)) return; // still active (e.g. WAITING -> NOTIFIED)

  const client = tx ?? prisma;
  const config = await client.waitTimeConfig.findUnique({ where: { restaurantId } });
  if (!config) return;

  await client.waitTimeConfig.update({
    where: { restaurantId },
    data: { peopleWaiting: Math.max(0, config.peopleWaiting - partySize) },
  });
}
