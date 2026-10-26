import prisma from '../config/prisma';
import { AppError } from '../utils/AppError';

// Single server-side pricing authority for online ordering. Both the
// preview endpoint (POST /api/public/order/quote) and the real
// order-placement endpoint (POST /api/public/order) call this — the latter
// re-runs it against the live DB inside its own transaction rather than
// trusting any client-supplied quote/total (spec §4: "recompute all totals,
// fees, minimums, and zone eligibility server-side; never trust client-sent
// prices/fees").

export interface CartLineInput {
  menuItemId: string;
  quantity: number;
  modifierOptionIds?: string[];
}

export interface PricedModifier {
  id: string;
  name: string;
  priceAdjust: number;
}

export interface PricedLine {
  menuItemId: string;
  name: string;
  unitPrice: number; // base price + selected modifier adjustments
  quantity: number;
  lineTotal: number;
  modifiers: PricedModifier[];
}

export interface QuoteParams {
  restaurantId: string;
  items: CartLineInput[];
  fulfillmentType: 'DELIVERY' | 'PICKUP';
  // For DELIVERY only. The zone is resolved once, at address-save time (see
  // CustomerAddress.zoneId) or by the customer explicitly picking a named
  // zone before logging in — this service never attempts geo/radius
  // matching itself (DeliveryZone/Restaurant carry no canonical lat/lng to
  // compute against; see report deviation note).
  zoneId?: string;
}

export interface OrderQuote {
  subtotal: number;
  deliveryFee: number;
  total: number;
  zoneId?: string;
  meetsMinimum: boolean;
  // Only set for DELIVERY — the resolved zone's minimum, so callers can
  // report "below minimum" without mislabeling subtotal as the minimum.
  minOrderAmount?: number;
  prepTimeMinutes: number;
  lines: PricedLine[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function computeOrderQuote(params: QuoteParams): Promise<OrderQuote> {
  const { restaurantId, fulfillmentType } = params;
  const items = params.items || [];

  if (!items.length) {
    throw new AppError('errors.order_cart_empty', 400);
  }
  for (const line of items) {
    if (!line.menuItemId || !Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new AppError('errors.validation_error', 400, { message: 'Each cart line needs a menuItemId and a positive integer quantity' });
    }
  }

  const [restaurant, orderSettings] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { hasOnlineOrdering: true } }),
    prisma.orderSettings.findUnique({ where: { restaurantId } }),
  ]);

  if (!restaurant || !restaurant.hasOnlineOrdering) {
    throw new AppError('errors.online_ordering_disabled', 403);
  }
  if (orderSettings && !orderSettings.onlineOrderingOpen) {
    throw new AppError('errors.online_ordering_closed', 403);
  }
  if (fulfillmentType === 'DELIVERY' && orderSettings && !orderSettings.deliveryEnabled) {
    throw new AppError('errors.order_fulfillment_disabled', 400);
  }
  if (fulfillmentType === 'PICKUP' && orderSettings && !orderSettings.pickupEnabled) {
    throw new AppError('errors.order_fulfillment_disabled', 400);
  }

  const defaultPrepTime = orderSettings?.prepTimeMinutes ?? 20;

  const menuItemIds = [...new Set(items.map((l) => l.menuItemId))];
  const menuItems = await prisma.menuItem.findMany({
    where: {
      id: { in: menuItemIds },
      // Tenant-scoped via the category -> menu -> restaurant chain — MenuItem
      // itself carries no restaurantId column.
      category: { menu: { restaurantId } },
    },
    include: { modifiers: { include: { options: true } } },
  });
  const menuItemById = new Map(menuItems.map((mi) => [mi.id, mi]));

  let subtotal = 0;
  let slowestPrepTime = 0;
  const lines: PricedLine[] = [];

  for (const line of items) {
    const menuItem = menuItemById.get(line.menuItemId);
    if (!menuItem) {
      throw new AppError('errors.order_item_not_found', 400, { menuItemId: line.menuItemId });
    }
    if (!menuItem.isOrderableOnline) {
      throw new AppError('errors.order_item_not_orderable', 400, { menuItemId: line.menuItemId });
    }
    if (!menuItem.isAvailable) {
      throw new AppError('errors.order_item_unavailable', 400, { menuItemId: line.menuItemId });
    }

    const requestedOptionIds = new Set(line.modifierOptionIds || []);
    const pricedModifiers: PricedModifier[] = [];
    let modifierTotal = 0;

    for (const modifier of menuItem.modifiers) {
      const selected = modifier.options.filter((o) => requestedOptionIds.has(o.id));
      const selectedIds = new Set(selected.map((o) => o.id));

      if (modifier.isRequired && selected.length < Math.max(1, modifier.minChoices)) {
        throw new AppError('errors.order_modifier_invalid', 400, { modifierId: modifier.id, reason: 'min_choices' });
      }
      if (selected.length < modifier.minChoices) {
        throw new AppError('errors.order_modifier_invalid', 400, { modifierId: modifier.id, reason: 'min_choices' });
      }
      if (modifier.maxChoices != null && selected.length > modifier.maxChoices) {
        throw new AppError('errors.order_modifier_invalid', 400, { modifierId: modifier.id, reason: 'max_choices' });
      }
      for (const opt of selected) {
        if (!opt.isAvailable) {
          throw new AppError('errors.order_modifier_invalid', 400, { modifierId: modifier.id, optionId: opt.id, reason: 'unavailable' });
        }
        modifierTotal += opt.priceAdjust;
        pricedModifiers.push({ id: opt.id, name: opt.name, priceAdjust: opt.priceAdjust });
      }
      // Track which requested ids were consumed by a known modifier so any
      // leftover, unrecognized option id is rejected below rather than
      // silently ignored (a client sending a stale/foreign option id should
      // fail loudly, not just fail to discount).
      for (const id of selectedIds) requestedOptionIds.delete(id);
    }

    if (requestedOptionIds.size > 0) {
      throw new AppError('errors.order_modifier_invalid', 400, { optionIds: [...requestedOptionIds], reason: 'unknown_option' });
    }

    const unitPrice = round2(menuItem.price + modifierTotal);
    const lineTotal = round2(unitPrice * line.quantity);
    subtotal = round2(subtotal + lineTotal);
    slowestPrepTime = Math.max(slowestPrepTime, menuItem.prepTimeMinutes ?? defaultPrepTime);

    lines.push({
      menuItemId: menuItem.id,
      name: menuItem.name,
      unitPrice,
      quantity: line.quantity,
      lineTotal,
      modifiers: pricedModifiers,
    });
  }

  let deliveryFee = 0;
  let meetsMinimum = true;
  let resolvedZoneId: string | undefined;
  let resolvedMinOrderAmount: number | undefined;

  if (fulfillmentType === 'DELIVERY') {
    if (!params.zoneId) {
      throw new AppError('errors.order_zone_required', 400);
    }
    const zone = await prisma.deliveryZone.findFirst({
      where: { id: params.zoneId, restaurantId },
    });
    if (!zone || !zone.isActive) {
      throw new AppError('errors.order_zone_not_found', 400);
    }
    resolvedZoneId = zone.id;
    deliveryFee = zone.deliveryFee;
    resolvedMinOrderAmount = zone.minOrderAmount;
    meetsMinimum = subtotal >= zone.minOrderAmount;
  }

  const total = round2(subtotal + deliveryFee);

  return {
    subtotal,
    deliveryFee,
    total,
    zoneId: resolvedZoneId,
    meetsMinimum,
    minOrderAmount: resolvedMinOrderAmount,
    prepTimeMinutes: slowestPrepTime || defaultPrepTime,
    lines,
  };
}
