import { OrderStatus, StaffOrder } from './types';

// Mirrors orderController.ts's FORWARD_TRANSITIONS exactly (see the comment
// there referencing docs/packaging/online-ordering-plan.md §1c) so the board
// only ever offers a button for a transition the backend will actually
// accept — this is a UI convenience only, the backend re-validates every
// transition itself and is the actual source of truth.
export const FORWARD_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  NEW: ['ACCEPTED'],
  ACCEPTED: ['PREPARING'],
  PREPARING: ['READY'],
  READY: ['OUT_FOR_DELIVERY', 'COMPLETED'],
  OUT_FOR_DELIVERY: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  REJECTED: [],
};

export const TERMINAL_STATUSES: OrderStatus[] = ['COMPLETED', 'CANCELLED', 'REJECTED'];

/** The single one-tap "advance" target for an order, or null if it's already
 *  terminal. READY branches on fulfillment type — a delivery order must pass
 *  through OUT_FOR_DELIVERY, a pickup order goes straight to COMPLETED — same
 *  branch orderController.updateOrderStatus enforces server-side. */
export function nextStatusFor(order: StaffOrder): OrderStatus | null {
  const options = FORWARD_TRANSITIONS[order.status] || [];
  if (options.length === 0) return null;
  if (order.status === 'READY') {
    return order.fulfillmentType === 'DELIVERY' ? 'OUT_FOR_DELIVERY' : 'COMPLETED';
  }
  return options[0];
}

/** Whether this order can still be rejected/cancelled at all (any
 *  non-terminal status, per orderController.ts's isCancelLike branch). */
export function canCancel(order: StaffOrder): boolean {
  return !TERMINAL_STATUSES.includes(order.status);
}

/** REJECTED reads better than CANCELLED for an order the kitchen never
 *  started on; both are accepted identically by the backend from any
 *  non-terminal status, this just picks the more accurate label. */
export function cancelStatusFor(order: StaffOrder): 'REJECTED' | 'CANCELLED' {
  return order.status === 'NEW' ? 'REJECTED' : 'CANCELLED';
}
