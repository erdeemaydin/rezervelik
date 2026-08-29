// Shared types for every staff-facing live order surface — the /order-station
// board, the dashboard "Active Orders" table, and the printing templates.
// Mirrors the shape returned by GET /api/orders, GET /api/orders/stream, and
// PATCH /api/orders/:id/status (src/controllers/orderController.ts) — every
// query there includes `items: true` and `customer: { select: { id, name,
// phone, noShowCount } }`, so those are always present (never a separate
// fetch), plus the computed `customerBanned` flag.
//
// Lives under lib/orders/ rather than app/order-station/ because two routes
// now consume it; a type that two pages share is not one page's private file.

export type OrderStatus =
  | 'NEW'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'OUT_FOR_DELIVERY'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REJECTED'
  | 'NOT_PICKED_UP';

export type FulfillmentType = 'DELIVERY' | 'PICKUP';
export type PaymentMethod = 'CASH_ON_DELIVERY' | 'ONLINE_CARD';
export type PaymentStatus = 'UNPAID' | 'PAID' | 'REFUNDED';

export interface StaffOrderItemModifier {
  id: string;
  name: string;
  priceAdjust: number;
}

export interface StaffOrderItem {
  id: string;
  menuItemId: string | null;
  nameSnapshot: string;
  unitPrice: number;
  quantity: number;
  modifiersSnapshot: StaffOrderItemModifier[] | null;
}

// Shape written by customerOrderController.placeOrder — see the two
// addressSnapshot object literals there (addressId branch + inline-address
// branch). `addressId` is only present when the customer saved the address.
export interface StaffOrderAddressSnapshot {
  label?: string | null;
  neighborhood?: string | null;
  fullAddress: string;
  lat?: number | null;
  lng?: number | null;
  note?: string | null;
  addressId?: string;
}

export interface StaffOrder {
  id: string;
  restaurantId: string;
  customerId: string;
  orderNumber: number;
  fulfillmentType: FulfillmentType;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  addressSnapshot: StaffOrderAddressSnapshot | null;
  zoneId: string | null;
  deliveryFee: number;
  subtotal: number;
  total: number;
  prepTimeMinutes: number | null;
  readyBy: string | null;
  customerNote: string | null;
  createdAt: string;
  updatedAt: string;
  items: StaffOrderItem[];
  /** `noShowCount` is the customer's lifetime NOT_PICKED_UP tally (incremented
   *  by updateOrderStatus); staff surfaces badge it at/above
   *  OrderSettings.noShowWarnThreshold. */
  customer: { id: string; name: string; phone: string; noShowCount: number } | null;
  /** Computed per-response by orderController from the phone-scoped
   *  CustomerBan table — not a Customer column, so it can't be read off
   *  `customer` itself. */
  customerBanned: boolean;
}

// The five active-board statuses the station board and the dashboard Active
// Orders table fetch/track — matches the FORWARD_TRANSITIONS reachable set in
// orderController.ts minus the terminal statuses, which fall off once reached.
export const BOARD_STATUSES: OrderStatus[] = ['NEW', 'ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'];
export const TERMINAL_STATUSES: OrderStatus[] = ['COMPLETED', 'CANCELLED', 'REJECTED', 'NOT_PICKED_UP'];
