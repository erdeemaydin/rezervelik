import { Request, Response } from 'express';
import { OrderStatus } from '@prisma/client';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { AppError } from '../utils/AppError';
import { logAudit } from '../services/auditService';
import { subscribeToRestaurant, publishOrderEvent } from '../services/orderEvents';
import { activeBannedPhones } from '../services/customerBanService';
import { FORWARD_TRANSITIONS, TERMINAL_ORDER_STATUSES } from '../utils/orderStatus';
import { isValidPhone } from '../utils/phone';

// Staff-facing endpoints for online ordering — /api/orders/*. Mounted behind
// tenantMiddleware + authMiddleware + requirePermission('manage_orders') in
// src/routes/orderRoutes.ts. Every query below is scoped by restaurantId —
// this is the single most important thing to get right per CLAUDE.md.

// Derived from the generated Prisma enum, not hand-duplicated — a future
// migration adding/renaming a status stays in sync automatically instead of
// this Set silently drifting from prisma/schema.prisma's source of truth.
const VALID_ORDER_STATUSES = new Set<string>(Object.values(OrderStatus));

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

export const listOrders = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const statusParam = req.query.status;
    const statuses = typeof statusParam === 'string' && statusParam.length
      ? statusParam.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;
    // An unrecognized status would otherwise reach Prisma's `status: { in }`
    // filter, which throws on a value outside the OrderStatus enum — an
    // unvalidated client param 500ing instead of cleanly 400ing.
    if (statuses && statuses.some((s) => !VALID_ORDER_STATUSES.has(s))) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Unknown status value' });
    }

    // Deviation (dashboard/orders history, not in the original Phase 1c
    // contract): optional createdAt range so the tenant-admin history view can
    // filter by day/week/etc. server-side instead of only within whatever the
    // take-limited batch happens to contain — same reasoning as every other
    // date-range filter in this codebase. Both bounds are optional and
    // additive; the order-station board (which never sends them) is
    // unaffected. `take` also bumped 200 -> 500 and made overridable via
    // `limit` (capped at 1000) to match reservationController.listReservations'
    // "fetch a large bounded batch, let the client filter/sort" convention
    // rather than true pagination, since no other list endpoint in this
    // codebase paginates either.
    const fromParam = req.query.from;
    const toParam = req.query.to;
    const createdAt: { gte?: Date; lte?: Date } = {};
    if (typeof fromParam === 'string' && fromParam) createdAt.gte = new Date(fromParam);
    if (typeof toParam === 'string' && toParam) createdAt.lte = new Date(toParam);

    const limitParam = req.query.limit;
    const take = typeof limitParam === 'string' && limitParam.length
      ? Math.min(1000, Math.max(1, parseInt(limitParam, 10) || 500))
      : 500;

    const orders = await prisma.order.findMany({
      where: {
        restaurantId,
        ...(statuses ? { status: { in: statuses as any } } : {}),
        ...(createdAt.gte || createdAt.lte ? { createdAt } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        items: true,
        customer: { select: { id: true, name: true, phone: true, noShowCount: true } },
      },
      take,
    });

    // One ban query for the whole batch, not one per order — the board
    // routinely renders hundreds of rows and needs the badge on each.
    const banned = await activeBannedPhones(restaurantId, orders.map((o) => o.customer?.phone ?? ''));

    return successResponse(
      res,
      orders.map((order) => ({
        ...order,
        customerBanned: order.customer ? banned.has(order.customer.phone.trim()) : false,
      }))
    );
  } catch (error) {
    console.error('[Order] listOrders error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// ---------------------------------------------------------------------------
// Realtime (SSE, fed by the shared Postgres LISTEN connection — see
// src/services/orderEvents.ts)
// ---------------------------------------------------------------------------

export const streamOrders = (req: Request, res: Response) => {
  const restaurantId = req.restaurantId!;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Reverse proxies (nginx/Caddy) buffer by default, which defeats SSE.
    'X-Accel-Buffering': 'no',
  });
  res.write(': connected\n\n');

  const send = async (payload: { orderId: string; type: string }) => {
    try {
      const order = await prisma.order.findFirst({
        where: { id: payload.orderId, restaurantId },
        include: { items: true, customer: { select: { id: true, name: true, phone: true, noShowCount: true } } },
      });
      if (!order) return;
      // Same shape as listOrders so the client can merge a streamed order into
      // its list state without special-casing the fields.
      const banned = order.customer
        ? await activeBannedPhones(restaurantId, [order.customer.phone])
        : new Set<string>();
      const payloadOrder = {
        ...order,
        customerBanned: order.customer ? banned.has(order.customer.phone.trim()) : false,
      };
      res.write(`event: ${payload.type}\ndata: ${JSON.stringify(payloadOrder)}\n\n`);
    } catch (err) {
      console.error('[Order] stream: failed to load order for event', err);
    }
  };

  const unsubscribe = subscribeToRestaurant(restaurantId, (payload) => {
    send({ orderId: payload.orderId, type: payload.type });
  });

  // Keep intermediary proxies/browsers from timing out an idle connection.
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 25_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
};

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------

// The transition map and terminal set moved to src/utils/orderStatus.ts —
// customerOrderController's capacity check needs the same "still in flight"
// definition, and two copies would drift. See that file for the diagram.
const TERMINAL_STATUSES: readonly string[] = TERMINAL_ORDER_STATUSES;

export const updateOrderStatus = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { id } = req.params;
    const { status, reason } = req.body || {};

    const order = await prisma.order.findFirst({ where: { id, restaurantId } });
    if (!order) {
      return errorResponse(res, 'errors.order_not_found', 404);
    }

    const isCancelLike = status === 'CANCELLED' || status === 'REJECTED';
    const allowedForward = FORWARD_TRANSITIONS[order.status] || [];

    if (isCancelLike) {
      if (TERMINAL_STATUSES.includes(order.status)) {
        return errorResponse(res, 'errors.order_invalid_transition', 400, { from: order.status, to: status });
      }
    } else if (!allowedForward.includes(status)) {
      return errorResponse(res, 'errors.order_invalid_transition', 400, { from: order.status, to: status });
    } else if (status === 'OUT_FOR_DELIVERY' && order.fulfillmentType !== 'DELIVERY') {
      return errorResponse(res, 'errors.order_invalid_transition', 400, { message: 'OUT_FOR_DELIVERY only applies to delivery orders' });
    } else if (status === 'COMPLETED' && order.status === 'READY' && order.fulfillmentType !== 'PICKUP') {
      return errorResponse(res, 'errors.order_invalid_transition', 400, { message: 'A delivery order must pass through OUT_FOR_DELIVERY before COMPLETED' });
    }

    // Conditional write, not a plain update: the transition was validated
    // against `order.status` as read above, but nothing stopped a second
    // concurrent request (two staff tapping the same order, or a duplicate
    // client retry) from reading the same stale status and both passing
    // validation — an unconditional update() would let whichever commits
    // last silently win (lost update), e.g. a CANCELLED overwriting an
    // ACCEPTED with no error. Scoping the WHERE to the status we validated
    // against makes the write itself atomic: only the request that's still
    // acting on the current state can succeed.
    //
    // Wrapped in a transaction because marking NOT_PICKED_UP has a second
    // effect — the customer's no-show counter — that must land if and only if
    // the status write actually won the race. Incrementing outside the
    // conditional write would over-count a duplicate tap; incrementing
    // unconditionally after a `count === 0` loss would punish the customer
    // for a transition that never happened.
    const outcome = await prisma.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({
        where: { id: order.id, status: order.status },
        data: { status },
      });
      if (count === 0) return { won: false as const };

      const noShowCustomer = status === 'NOT_PICKED_UP'
        ? await tx.customer.update({
            where: { id: order.customerId },
            data: { noShowCount: { increment: 1 } },
            select: { id: true, name: true, phone: true, noShowCount: true },
          })
        : null;

      return { won: true as const, noShowCustomer };
    });

    if (!outcome.won) {
      return errorResponse(res, 'errors.order_status_conflict', 409, {
        message: 'Order status changed since it was last read — refresh and retry',
      });
    }
    const updated = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true },
    });

    // No dedicated cancel/reject-reason column on Order (schema is frozen for
    // this phase) — the reason is captured in the audit trail instead, same
    // as every other administrative action in this codebase.
    logAudit({
      req,
      restaurantId,
      category: 'ORDER',
      // A no-show is a distinct, disputable business event (it permanently
      // raises a customer's counter and can lead to a ban), so it gets its own
      // audit action rather than hiding inside a generic status change.
      action: outcome.noShowCustomer ? 'ORDER_MARKED_NOT_PICKED_UP' : 'ORDER_STATUS_CHANGED',
      targetType: 'Order',
      targetId: order.id,
      targetLabel: `#${order.orderNumber}`,
      metadata: {
        from: order.status,
        to: status,
        reason: isCancelLike ? (reason || null) : undefined,
        ...(outcome.noShowCustomer
          ? {
              customerId: outcome.noShowCustomer.id,
              customerName: outcome.noShowCustomer.name,
              customerPhone: outcome.noShowCustomer.phone,
              noShowCount: outcome.noShowCustomer.noShowCount,
            }
          : {}),
      },
    });

    await publishOrderEvent({ restaurantId, orderId: order.id, orderNumber: order.orderNumber, type: 'status_changed' });

    return successResponse(res, updated);
  } catch (error) {
    console.error('[Order] updateOrderStatus error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// ---------------------------------------------------------------------------
// Customer directory
// ---------------------------------------------------------------------------

export const listCustomers = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const customers = await prisma.customer.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { orders: true } } },
      take: 500,
    });

    const banned = await activeBannedPhones(restaurantId, customers.map((c) => c.phone));

    return successResponse(
      res,
      customers.map((customer) => ({ ...customer, banned: banned.has(customer.phone.trim()) }))
    );
  } catch (error) {
    console.error('[Order] listCustomers error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const getCustomerDetail = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { id } = req.params;

    const customer = await prisma.customer.findFirst({
      where: { id, restaurantId },
      include: {
        addresses: true,
        orders: { orderBy: { createdAt: 'desc' }, include: { items: true }, take: 50 },
      },
    });
    if (!customer) {
      return errorResponse(res, 'errors.not_found', 404);
    }

    // Bans are keyed by phone, not customerId, so this is the ban history of
    // the *number* — which is the point: it survives the customer deleting
    // and re-creating their account.
    const bans = await withActorNames(
      await prisma.customerBan.findMany({
        where: { restaurantId, phone: customer.phone },
        orderBy: { createdAt: 'desc' },
      })
    );

    return successResponse(res, {
      ...customer,
      bans,
      banned: bans.some((b) => b.liftedAt === null),
    });
  } catch (error) {
    console.error('[Order] getCustomerDetail error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// ---------------------------------------------------------------------------
// Customer bans (plan decision #4: manual only — nothing here bans
// automatically; noShowCount just surfaces a badge for staff to act on).
// Bans are phone-scoped so they survive a customer deleting and re-creating
// their account with the same number.
// ---------------------------------------------------------------------------

type BanRow = {
  bannedByUserId: string | null;
  liftedByUserId: string | null;
  liftedAt: Date | null;
  [key: string]: unknown;
};

/**
 * Resolve `bannedByUserId` / `liftedByUserId` to display names.
 *
 * CustomerBan stores those as plain nullable columns with no FK to User (the
 * staff member may be deleted long after the ban), so there is no `include`
 * to lean on. One batched lookup for every id in the set — never a query per
 * row — and per PROJECT_LOGIC.md §7 the UUID must never be what the dashboard
 * ends up showing, so a name is always paired with it.
 */
async function withActorNames<T extends BanRow>(bans: T[]): Promise<(T & { bannedByName: string | null; liftedByName: string | null; active: boolean })[]> {
  const ids = [...new Set(bans.flatMap((b) => [b.bannedByUserId, b.liftedByUserId]).filter((id): id is string => !!id))];
  const users = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } })
    : [];
  const nameById = new Map(
    users.map((u) => [u.id, `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || null] as const)
  );
  // A deleted staff member resolves to null rather than leaking the raw id.
  const nameOf = (id: string | null) => (id ? nameById.get(id) ?? null : null);

  return bans.map((ban) => ({
    ...ban,
    bannedByName: nameOf(ban.bannedByUserId),
    liftedByName: nameOf(ban.liftedByUserId),
    active: ban.liftedAt === null,
  }));
}

export const listBans = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    // Active and historical together, newest first — a lifted ban is part of
    // the record staff need when deciding whether to ban the number again.
    const bans = await prisma.customerBan.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return successResponse(res, await withActorNames(bans));
  } catch (error) {
    console.error('[Order] listBans error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const createBan = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    // Trimmed exactly the way customerOrderController.verifyOtp stores the
    // number, or the ban would sit next to the customer's phone without ever
    // matching it.
    const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : null;

    if (!phone || !isValidPhone(phone)) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'a valid phone is required' });
    }

    const existing = await prisma.customerBan.findFirst({
      where: { restaurantId, phone, liftedAt: null },
      select: { id: true },
    });
    if (existing) {
      return errorResponse(res, 'errors.validation_error', 409, {
        message: 'This phone number is already banned',
        banId: existing.id,
      });
    }

    const ban = await prisma.customerBan.create({
      data: { restaurantId, phone, reason: reason || null, bannedByUserId: req.user?.userId ?? null },
    });

    logAudit({
      req,
      restaurantId,
      category: 'ORDER',
      action: 'CUSTOMER_BANNED',
      targetType: 'CustomerBan',
      targetId: ban.id,
      targetLabel: phone,
      metadata: { phone, reason: reason || null },
    });

    const [decorated] = await withActorNames([ban]);
    return successResponse(res, decorated, undefined, 201);
  } catch (error) {
    console.error('[Order] createBan error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const liftBan = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { id } = req.params;

    const existing = await prisma.customerBan.findFirst({ where: { id, restaurantId } });
    if (!existing) return errorResponse(res, 'errors.not_found', 404);
    if (existing.liftedAt) {
      // Already lifted — return it rather than 400ing, so a double-tap in the
      // dashboard is a no-op instead of an error toast.
      const [decorated] = await withActorNames([existing]);
      return successResponse(res, decorated);
    }

    const ban = await prisma.customerBan.update({
      where: { id: existing.id },
      data: { liftedAt: new Date(), liftedByUserId: req.user?.userId ?? null },
    });

    logAudit({
      req,
      restaurantId,
      category: 'ORDER',
      action: 'CUSTOMER_UNBANNED',
      targetType: 'CustomerBan',
      targetId: ban.id,
      targetLabel: ban.phone,
      metadata: { phone: ban.phone, reason: ban.reason },
    });

    const [decorated] = await withActorNames([ban]);
    return successResponse(res, decorated);
  } catch (error) {
    console.error('[Order] liftBan error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// ---------------------------------------------------------------------------
// Restaurant location (the pin the delivery-range maths measures from — see
// geoService/orderPricingService). Lives on this router rather than
// restaurantRoutes because it's an online-ordering concern gated by
// `manage_orders`, and there is no existing tenant endpoint that writes
// Restaurant scalar fields to extend.
// ---------------------------------------------------------------------------

export const updateRestaurantLocation = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { latitude, longitude, addressText } = req.body || {};

    // All three are explicitly clearable (null) — a tenant that sets a pin by
    // mistake must be able to get back to "no coordinates", which is the
    // state resolveDeliveryZone treats as "fall back to the manual zone
    // dropdown" rather than "everything is out of range".
    const parsedLat = latitude === null ? null : parseOptionalFiniteNumber(latitude, 'latitude');
    const parsedLng = longitude === null ? null : parseOptionalFiniteNumber(longitude, 'longitude');

    if (parsedLat != null && (parsedLat < -90 || parsedLat > 90)) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'latitude must be between -90 and 90' });
    }
    if (parsedLng != null && (parsedLng < -180 || parsedLng > 180)) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'longitude must be between -180 and 180' });
    }
    // A half-set pin is worse than none: haversine against a missing
    // coordinate is meaningless, so refuse rather than persist it.
    if ((parsedLat == null) !== (parsedLng == null)) {
      return errorResponse(res, 'errors.validation_error', 400, {
        message: 'latitude and longitude must be set or cleared together',
      });
    }

    const restaurant = await prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        ...(latitude !== undefined ? { latitude: parsedLat } : {}),
        ...(longitude !== undefined ? { longitude: parsedLng } : {}),
        ...(addressText !== undefined
          ? { addressText: typeof addressText === 'string' ? addressText.trim().slice(0, 500) || null : null }
          : {}),
      },
      select: { latitude: true, longitude: true, addressText: true },
    });

    logAudit({
      req,
      restaurantId,
      category: 'SETTINGS',
      action: 'RESTAURANT_LOCATION_UPDATED',
      targetType: 'Restaurant',
      targetId: restaurantId,
      metadata: restaurant as unknown as Record<string, unknown>,
    });

    return successResponse(res, restaurant);
  } catch (error) {
    if (error instanceof AppError) return errorResponse(res, error.code, error.status, error.details);
    console.error('[Order] updateRestaurantLocation error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// ---------------------------------------------------------------------------
// Order settings
// ---------------------------------------------------------------------------

export const getOrderSettings = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    // upsert, not find-then-create: two concurrent first-ever GETs for the
    // same tenant would otherwise both find null and both try to create,
    // and the loser hits OrderSettings' restaurantId unique-constraint
    // violation and 500s instead of just getting the row the winner made.
    const [settings, restaurant] = await Promise.all([
      prisma.orderSettings.upsert({
        where: { restaurantId },
        update: {},
        create: { restaurantId },
      }),
      // Folded into this response on purpose: the settings screen edits the
      // delivery pin alongside maxDeliveryMeters, and they belong to the same
      // save. Nesting it keeps the OrderSettings columns unshadowed.
      prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { latitude: true, longitude: true, addressText: true },
      }),
    ]);

    return successResponse(res, {
      ...settings,
      restaurantLocation: restaurant ?? { latitude: null, longitude: null, addressText: null },
    });
  } catch (error) {
    console.error('[Order] getOrderSettings error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const updateOrderSettings = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const {
      onlineOrderingOpen,
      deliveryEnabled,
      pickupEnabled,
      cashOnDeliveryEnabled,
      onlineCardEnabled,
      maxConcurrentOrders,
      prepTimeMinutes,
      orderHours,
      autoConfirmOrders,
      maxDeliveryMeters,
      noShowWarnThreshold,
    } = req.body || {};

    // Int columns: Prisma rejects a fractional value outright, and a UI that
    // sends "1500.0" or a stray decimal shouldn't 500.
    const parseOptionalInt = (value: unknown, field: string) => {
      const n = parseOptionalFiniteNumber(value, field);
      return n === undefined ? undefined : Math.round(n);
    };

    const data = {
      onlineOrderingOpen,
      deliveryEnabled,
      pickupEnabled,
      cashOnDeliveryEnabled,
      onlineCardEnabled,
      maxConcurrentOrders: maxConcurrentOrders === null ? null : parseOptionalFiniteNumber(maxConcurrentOrders, 'maxConcurrentOrders'),
      prepTimeMinutes: parseOptionalFiniteNumber(prepTimeMinutes, 'prepTimeMinutes'),
      orderHours,
      // Boolean(undefined) is false, which would silently turn auto-confirm
      // off on any partial save — so a field that wasn't sent stays undefined
      // (= leave the column alone) rather than being coerced.
      autoConfirmOrders: autoConfirmOrders === undefined ? undefined : Boolean(autoConfirmOrders),
      // null = no hard distance cap; rely on the zones alone.
      maxDeliveryMeters: maxDeliveryMeters === null ? null : parseOptionalInt(maxDeliveryMeters, 'maxDeliveryMeters'),
      noShowWarnThreshold: parseOptionalInt(noShowWarnThreshold, 'noShowWarnThreshold'),
    };

    const settings = await prisma.orderSettings.upsert({
      where: { restaurantId },
      update: data,
      create: { restaurantId, ...data },
    });

    return successResponse(res, settings);
  } catch (error) {
    if (error instanceof AppError) return errorResponse(res, error.code, error.status, error.details);
    console.error('[Order] updateOrderSettings error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// ---------------------------------------------------------------------------
// Delivery zones
// ---------------------------------------------------------------------------

export const listDeliveryZones = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const zones = await prisma.deliveryZone.findMany({ where: { restaurantId }, orderBy: { name: 'asc' } });
    return successResponse(res, zones);
  } catch (error) {
    console.error('[Order] listDeliveryZones error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// Number(x) on a malformed value (e.g. "" or "abc") silently produces NaN,
// which Prisma happily persists into a Float column — orderPricingService
// then computes total = subtotal + NaN and meetsMinimum = subtotal >= NaN
// (always false), permanently and silently breaking every order against
// that zone. Returns undefined for "field not sent" (leave column
// untouched on update / let the schema default apply on create) and throws
// for "field sent but not a finite number".
export function parseOptionalFiniteNumber(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new AppError('errors.validation_error', 400, { message: `${field} must be a number` });
  }
  return n;
}

export const createDeliveryZone = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { name, matchType, radiusMeters, polygon, deliveryFee, minOrderAmount, isActive, openHours } = req.body || {};

    if (!name || deliveryFee === undefined || deliveryFee === null) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'name and deliveryFee are required' });
    }

    const parsedDeliveryFee = parseOptionalFiniteNumber(deliveryFee, 'deliveryFee');
    const parsedRadiusMeters = parseOptionalFiniteNumber(radiusMeters, 'radiusMeters');
    const parsedMinOrderAmount = parseOptionalFiniteNumber(minOrderAmount, 'minOrderAmount');

    const zone = await prisma.deliveryZone.create({
      data: {
        restaurantId,
        name,
        matchType: matchType || 'RADIUS',
        radiusMeters: parsedRadiusMeters,
        polygon,
        deliveryFee: parsedDeliveryFee!,
        minOrderAmount: parsedMinOrderAmount,
        isActive: isActive !== undefined ? Boolean(isActive) : undefined,
        openHours,
      },
    });
    return successResponse(res, zone, undefined, 201);
  } catch (error) {
    if (error instanceof AppError) return errorResponse(res, error.code, error.status, error.details);
    console.error('[Order] createDeliveryZone error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const updateDeliveryZone = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { id } = req.params;
    const existing = await prisma.deliveryZone.findFirst({ where: { id, restaurantId } });
    if (!existing) return errorResponse(res, 'errors.not_found', 404);

    const { name, matchType, radiusMeters, polygon, deliveryFee, minOrderAmount, isActive, openHours } = req.body || {};

    const zone = await prisma.deliveryZone.update({
      where: { id },
      data: {
        name,
        matchType,
        radiusMeters: parseOptionalFiniteNumber(radiusMeters, 'radiusMeters'),
        polygon,
        deliveryFee: parseOptionalFiniteNumber(deliveryFee, 'deliveryFee'),
        minOrderAmount: parseOptionalFiniteNumber(minOrderAmount, 'minOrderAmount'),
        isActive,
        openHours,
      },
    });
    return successResponse(res, zone);
  } catch (error) {
    if (error instanceof AppError) return errorResponse(res, error.code, error.status, error.details);
    console.error('[Order] updateDeliveryZone error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const deleteDeliveryZone = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { id } = req.params;
    const existing = await prisma.deliveryZone.findFirst({ where: { id, restaurantId } });
    if (!existing) return errorResponse(res, 'errors.not_found', 404);

    await prisma.deliveryZone.delete({ where: { id } });
    return successResponse(res, { id });
  } catch (error) {
    console.error('[Order] deleteDeliveryZone error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// ---------------------------------------------------------------------------
// Menu online-orderable toggle (legacy — the per-item switch on
// dashboard/menus). The curated catalog in orderMenuController is the real
// source of truth now; this endpoint stays so that UI keeps working until A7
// replaces it, and it mirrors every change into OrderMenuItem so the two
// surfaces can never disagree about what's sellable online.
// ---------------------------------------------------------------------------

export const setMenuItemOrderable = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { id } = req.params;
    const { isOrderableOnline, prepTimeMinutes } = req.body || {};

    // MenuItem carries no restaurantId column directly — scope via the
    // category -> menu -> restaurant chain (same pattern as
    // orderPricingService and reservationController's verifyCategoryOwnership).
    const item = await prisma.menuItem.findFirst({
      where: { id, category: { menu: { restaurantId } } },
    });
    if (!item) return errorResponse(res, 'errors.not_found', 404);

    const parsedPrepTime = prepTimeMinutes === undefined
      ? undefined
      : prepTimeMinutes === null || prepTimeMinutes === ''
        ? null
        : Math.round(parseOptionalFiniteNumber(prepTimeMinutes, 'prepTimeMinutes')!);

    // Still written: the legacy columns are what dashboard/menus reads back to
    // render its toggle. The cleanup agent drops them once that UI is gone.
    const updated = await prisma.menuItem.update({
      where: { id },
      data: {
        ...(isOrderableOnline !== undefined ? { isOrderableOnline: Boolean(isOrderableOnline) } : {}),
        ...(parsedPrepTime !== undefined ? { prepTimeMinutes: parsedPrepTime } : {}),
      },
    });

    // Mirror into the curated catalog. Turning the toggle off sets
    // isListed = false rather than deleting the row — the tenant's price/name/
    // photo overrides survive so re-listing the item restores them instead of
    // silently resetting to the source menu's values.
    if (isOrderableOnline !== undefined) {
      if (isOrderableOnline) {
        await prisma.orderMenuItem.upsert({
          where: { restaurantId_menuItemId: { restaurantId, menuItemId: id } },
          update: { isListed: true, ...(parsedPrepTime !== undefined ? { prepTimeMinutes: parsedPrepTime } : {}) },
          create: { restaurantId, menuItemId: id, isListed: true, prepTimeMinutes: parsedPrepTime ?? null },
        });
      } else {
        await prisma.orderMenuItem.updateMany({
          where: { restaurantId, menuItemId: id },
          data: { isListed: false },
        });
      }
    } else if (parsedPrepTime !== undefined) {
      // Prep-time-only edit: keep the catalog override in step, but don't
      // conjure a catalog row for an item that was never listed.
      await prisma.orderMenuItem.updateMany({
        where: { restaurantId, menuItemId: id },
        data: { prepTimeMinutes: parsedPrepTime },
      });
    }

    return successResponse(res, updated);
  } catch (error) {
    if (error instanceof AppError) return errorResponse(res, error.code, error.status, error.details);
    console.error('[Order] setMenuItemOrderable error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
