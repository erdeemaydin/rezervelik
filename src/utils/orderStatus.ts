// Single source of truth for the online-order status machine.
//
// Lives here rather than inside orderController because two independent
// callers need it: the staff transition endpoint (orderController.
// updateOrderStatus) and the customer-side capacity check
// (customerOrderController.placeOrder, which counts "orders still in flight"
// = anything not terminal). Duplicating the terminal list in both would let
// them silently drift the next time a status is added.

// NEW -> ACCEPTED -> PREPARING -> READY -> OUT_FOR_DELIVERY (delivery only) /
// COMPLETED (pickup) -> COMPLETED. CANCELLED/REJECTED reachable from any
// non-terminal state (handled separately as the "cancel-like" path).
// NOT_PICKED_UP is a *forward* transition, not a cancel-like one: it only
// makes sense once the food actually exists and was offered to the customer,
// i.e. from READY (never collected) or OUT_FOR_DELIVERY (nobody home /
// refused). Reaching it increments Customer.noShowCount.
export const FORWARD_TRANSITIONS: Record<string, string[]> = {
  NEW: ['ACCEPTED'],
  ACCEPTED: ['PREPARING'],
  PREPARING: ['READY'],
  READY: ['OUT_FOR_DELIVERY', 'COMPLETED', 'NOT_PICKED_UP'],
  OUT_FOR_DELIVERY: ['COMPLETED', 'NOT_PICKED_UP'],
  COMPLETED: [],
  CANCELLED: [],
  REJECTED: [],
  NOT_PICKED_UP: [],
};

/** Statuses from which nothing further can happen. */
export const TERMINAL_ORDER_STATUSES = ['COMPLETED', 'CANCELLED', 'REJECTED', 'NOT_PICKED_UP'] as const;

/** Everything that still occupies kitchen/courier capacity. */
export const ACTIVE_ORDER_STATUSES = (Object.keys(FORWARD_TRANSITIONS) as string[]).filter(
  (s) => !(TERMINAL_ORDER_STATUSES as readonly string[]).includes(s)
);
