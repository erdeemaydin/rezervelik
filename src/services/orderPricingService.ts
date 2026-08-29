import prisma from '../config/prisma';
import { AppError } from '../utils/AppError';
import { resolveDeliveryZone } from './geoService';

// Single server-side pricing authority for online ordering. Both the
// preview endpoint (POST /api/public/order/quote) and the real
// order-placement endpoint (POST /api/public/order) call this — the latter
// re-runs it against the live DB inside its own transaction rather than
// trusting any client-supplied quote/total (spec §4: "recompute all totals,
// fees, minimums, and zone eligibility server-side; never trust client-sent
// prices/fees").
//
// Delivery zone resolution has two paths: the customer's map pin (preferred —
// geoService.resolveDeliveryZone measures haversine distance from the
// restaurant's own coordinates and matches a RADIUS/AREA zone), falling back
// to an explicitly chosen zoneId when the tenant has no coordinates set.

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
  // For DELIVERY only, and preferred over `zoneId`: the customer's map pin.
  // When the restaurant has its own coordinates set, the zone is resolved
  // server-side from this pin (haversine distance -> smallest matching RADIUS
  // zone, else a containing AREA polygon) and any client-sent `zoneId` is
  // ignored. See geoService.resolveDeliveryZone.
  lat?: number;
  lng?: number;
  // For DELIVERY only. Fallback path, still fully supported: tenants that
  // haven't set a restaurant location yet (every tenant predating the
  // dashboard location picker) have no origin to measure from, so the zone
  // comes from an explicit customer choice or a saved address's
  // CustomerAddress.zoneId.
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
  // Only set for DELIVERY when the zone was auto-resolved from a pin — the
  // straight-line distance from the restaurant to that pin, in meters.
  distanceMeters?: number;
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
  let resolvedDistanceMeters: number | undefined;

  if (fulfillmentType === 'DELIVERY') {
    const hasPin = Number.isFinite(params.lat) && Number.isFinite(params.lng);
    let resolvedFromPin = false;

    if (hasPin) {
      const result = await resolveDeliveryZone({
        restaurantId,
        lat: params.lat as number,
        lng: params.lng as number,
      });

      if (result.zone) {
        // Auto-resolution wins outright: the client's zoneId (if any) is
        // advisory at best and must never override a server-computed fee.
        resolvedZoneId = result.zone.id;
        deliveryFee = result.zone.deliveryFee;
        resolvedMinOrderAmount = result.zone.minOrderAmount;
        meetsMinimum = subtotal >= result.zone.minOrderAmount;
        resolvedDistanceMeters = result.distanceMeters;
        resolvedFromPin = true;
      } else if (result.reason === 'OUT_OF_RANGE') {
        throw new AppError('errors.order_out_of_delivery_range', 400, {
          distanceMeters: result.distanceMeters,
          maxDeliveryMeters: result.maxDeliveryMeters ?? null,
        });
      }
      // reason === 'NO_RESTAURANT_LOCATION' -> the tenant never set its own
      // coordinates, so there is nothing to measure from. Fall through to the
      // manual zoneId path below instead of blocking the order.
    }

    if (!resolvedFromPin) {
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
  }

  const total = round2(subtotal + deliveryFee);

  return {
    subtotal,
    deliveryFee,
    total,
    zoneId: resolvedZoneId,
    meetsMinimum,
    minOrderAmount: resolvedMinOrderAmount,
    distanceMeters: resolvedDistanceMeters,
    prepTimeMinutes: slowestPrepTime || defaultPrepTime,
    lines,
  };
}
