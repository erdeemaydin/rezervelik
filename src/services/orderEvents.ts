import { Client } from 'pg';
import { EventEmitter } from 'events';
import prisma from '../config/prisma';

// Realtime primitive for the staff order-station SSE endpoint
// (GET /api/orders/stream). Built on Postgres LISTEN/NOTIFY, not an
// in-process EventEmitter alone, per the plan's decision (2026-08-28): the
// backend is expected to run multi-instance eventually, and an in-process
// emitter would silently miss orders placed against a different instance
// than the one a given SSE connection landed on. Every backend instance
// opens ONE dedicated `pg` connection (Prisma's pooled client isn't meant for
// a long-lived LISTEN session) and fans incoming NOTIFYs out in-process to
// whichever SSE clients happen to be connected to *this* instance via
// `orderEventBus` below.

export interface OrderEventPayload {
  restaurantId: string;
  orderId: string;
  orderNumber?: number;
  type: 'created' | 'status_changed';
}

const CHANNEL = 'order_events';

class OrderEventBus extends EventEmitter {}
export const orderEventBus = new OrderEventBus();
// Many SSE connections (one per order-station client) can subscribe at once —
// raise the default cap of 10 rather than have Node warn/leak-detect on a
// perfectly normal fan-out.
orderEventBus.setMaxListeners(0);

let listenClient: Client | null = null;
let connecting: Promise<void> | null = null;

async function connectAndListen(): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  client.on('error', (err) => {
    console.error('[orderEvents] LISTEN connection error, will reconnect:', err.message);
    listenClient = null;
    scheduleReconnect();
  });
  client.on('end', () => {
    if (listenClient === client) {
      listenClient = null;
      scheduleReconnect();
    }
  });
  client.on('notification', (msg) => {
    if (msg.channel !== CHANNEL || !msg.payload) return;
    try {
      const payload = JSON.parse(msg.payload) as OrderEventPayload;
      orderEventBus.emit('order_event', payload);
    } catch (err) {
      console.error('[orderEvents] failed to parse NOTIFY payload:', (err as Error)?.message);
    }
  });

  await client.connect();
  await client.query(`LISTEN ${CHANNEL}`);
  listenClient = client;
  console.log('[orderEvents] listening on Postgres channel', CHANNEL);
}

let reconnectTimer: NodeJS.Timeout | null = null;
function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectAndListen().catch((err) => {
      console.error('[orderEvents] reconnect failed:', (err as Error)?.message);
      scheduleReconnect();
    });
  }, 3000);
  reconnectTimer.unref?.();
}

/** Call once at process startup (see src/server.ts). Idempotent-ish: calling
 *  it again while a connection attempt is already in flight/established is a
 *  no-op. Failures are logged and retried — a transient DB hiccup at boot
 *  must not crash the whole server. */
export function startOrderEventListener(): void {
  if (listenClient || connecting) return;
  connecting = connectAndListen()
    .catch((err) => {
      console.error('[orderEvents] initial LISTEN connect failed, retrying:', (err as Error)?.message);
      scheduleReconnect();
    })
    .finally(() => {
      connecting = null;
    });
}

/**
 * Fires NOTIFY via `pg_notify()` (parameterized — never string-built SQL) so
 * this can run *inside* the order-creation transaction: Postgres queues
 * NOTIFYs and only delivers them after the transaction commits, which is
 * exactly the "don't tell the order station about an order that then rolls
 * back" behavior this needs. Pass the transaction client (`tx`) from inside
 * `prisma.$transaction(...)`; falls back to the top-level `prisma` client
 * for any future non-transactional caller.
 */
export async function publishOrderEvent(
  payload: OrderEventPayload,
  tx: { $executeRaw: typeof prisma.$executeRaw } = prisma
): Promise<void> {
  const json = JSON.stringify(payload);
  await tx.$executeRaw`SELECT pg_notify(${CHANNEL}, ${json})`;
}

/** Subscribes to order events for one restaurant. Returns an unsubscribe
 *  function — SSE handlers must call it when the client disconnects. */
export function subscribeToRestaurant(
  restaurantId: string,
  handler: (payload: OrderEventPayload) => void
): () => void {
  const listener = (payload: OrderEventPayload) => {
    if (payload.restaurantId === restaurantId) handler(payload);
  };
  orderEventBus.on('order_event', listener);
  return () => orderEventBus.off('order_event', listener);
}
