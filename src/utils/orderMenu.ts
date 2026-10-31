// Effective-value rules for the curated online-order catalog (OrderMenuItem
// layered over its source MenuItem). Kept in one place because three separate
// call sites depend on them agreeing exactly: the staff catalog editor
// (orderMenuController), the customer-facing menu (customerOrderController
// .getOrderableMenu) and the pricing authority (orderPricingService). Any drift
// between them shows up as a customer being quoted a price the menu didn't
// show, or an item that looks orderable and then gets rejected at checkout.
//
// See docs/packaging/online-ordering-v2-plan.md decision #1.

/** The OrderMenuItem columns these helpers read. Structural, not the Prisma
 *  type, so callers can pass a `select`ed subset. */
export interface OrderMenuOverrides {
  nameOverride: string | null;
  descriptionOverride: string | null;
  imageUrlOverride: string | null;
  priceOverride: number | null;
  prepTimeMinutes: number | null;
  pausedUntil: Date | null;
  pausedIndefinitely: boolean;
  isAvailable: boolean;
}

/** The source MenuItem columns these helpers read. */
export interface SourceMenuItem {
  name: string;
  description: string | null;
  imageUrl: string | null;
  price: number;
  prepTimeMinutes: number | null;
  isAvailable: boolean;
}

/**
 * Temporary "closed to order" state. `pausedIndefinitely` is the manual
 * open-ended pause; `pausedUntil` is the timed one — and a timestamp in the
 * past means the pause already lapsed, i.e. the item auto-resumed. Nothing
 * sweeps expired `pausedUntil` values out of the DB, so that comparison is the
 * only thing standing between an item and staying silently unorderable
 * forever.
 */
export const isOrderItemPaused = (row: Pick<OrderMenuOverrides, 'pausedUntil' | 'pausedIndefinitely'>, now: Date = new Date()): boolean =>
  row.pausedIndefinitely === true || (row.pausedUntil != null && row.pausedUntil.getTime() > now.getTime());

export const effectiveName = (row: Pick<OrderMenuOverrides, 'nameOverride'>, item: Pick<SourceMenuItem, 'name'>): string =>
  row.nameOverride ?? item.name;

export const effectiveDescription = (row: Pick<OrderMenuOverrides, 'descriptionOverride'>, item: Pick<SourceMenuItem, 'description'>): string | null =>
  row.descriptionOverride ?? item.description;

export const effectiveImageUrl = (row: Pick<OrderMenuOverrides, 'imageUrlOverride'>, item: Pick<SourceMenuItem, 'imageUrl'>): string | null =>
  row.imageUrlOverride ?? item.imageUrl;

export const effectivePrice = (row: Pick<OrderMenuOverrides, 'priceOverride'>, item: Pick<SourceMenuItem, 'price'>): number =>
  row.priceOverride ?? item.price;

/** OrderMenuItem override -> MenuItem's own prep time -> the tenant's
 *  OrderSettings default (callers pass 20 when there's no settings row). */
export const effectivePrepTime = (
  row: Pick<OrderMenuOverrides, 'prepTimeMinutes'>,
  item: Pick<SourceMenuItem, 'prepTimeMinutes'>,
  fallbackMinutes: number
): number => row.prepTimeMinutes ?? item.prepTimeMinutes ?? fallbackMinutes;

export type UnavailableReason = 'PAUSED' | 'OUT_OF_STOCK' | null;

/**
 * Why a *listed* item can't be ordered right now, or null when it can.
 * Paused wins over out-of-stock so the customer gets the more specific,
 * time-boxed message ("back at 20:00") rather than a flat "unavailable".
 */
export const unavailableReason = (
  row: Pick<OrderMenuOverrides, 'pausedUntil' | 'pausedIndefinitely' | 'isAvailable'>,
  item: Pick<SourceMenuItem, 'isAvailable'>,
  now: Date = new Date()
): UnavailableReason => {
  if (isOrderItemPaused(row, now)) return 'PAUSED';
  if (!row.isAvailable || !item.isAvailable) return 'OUT_OF_STOCK';
  return null;
};
