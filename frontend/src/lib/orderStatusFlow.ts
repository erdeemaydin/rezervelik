// Customer-facing view of the order status machine (the authority is the
// backend's src/utils/orderStatus.ts — this is only how the flow is *narrated*
// to the person who placed the order).
//
// Two things the customer tracking screen needs that a flat status string
// can't express: which statuses are still "in flight" (so polling keeps
// running), and what the remaining journey looks like from here, which differs
// between delivery and pickup.

import type { FulfillmentType } from './orderApi';

/** Nothing will change on its own once the order reaches one of these — stop
 *  polling, and show a terminal message instead of a timeline. */
export const TERMINAL_ORDER_STATUSES = ['COMPLETED', 'CANCELLED', 'REJECTED', 'NOT_PICKED_UP'] as const;

/** Terminal states that did NOT end well; they get their own explanation panel
 *  rather than a completed timeline. */
export const UNHAPPY_ORDER_STATUSES = ['CANCELLED', 'REJECTED', 'NOT_PICKED_UP'] as const;

export function isTerminalOrderStatus(status: string): boolean {
  return (TERMINAL_ORDER_STATUSES as readonly string[]).includes(status);
}

export function isUnhappyOrderStatus(status: string): boolean {
  return (UNHAPPY_ORDER_STATUSES as readonly string[]).includes(status);
}

/** The happy-path timeline shown once the restaurant has accepted the order.
 *  `NEW` is deliberately absent: "waiting for the restaurant to confirm" is a
 *  state of its own in the UI, not one more dot on a track that hasn't
 *  started. */
export function orderTimelineSteps(fulfillmentType: FulfillmentType): string[] {
  return fulfillmentType === 'DELIVERY'
    ? ['ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED']
    : ['ACCEPTED', 'PREPARING', 'READY', 'COMPLETED'];
}

/** Index of the order's current status within its timeline, or -1 when the
 *  status isn't on the happy path at all (NEW, or a terminal failure). */
export function orderTimelineIndex(status: string, fulfillmentType: FulfillmentType): number {
  return orderTimelineSteps(fulfillmentType).indexOf(status);
}
