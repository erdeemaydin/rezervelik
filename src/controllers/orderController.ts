import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { AppError } from '../utils/AppError';
import { logAudit } from '../services/auditService';
import { subscribeToRestaurant, publishOrderEvent } from '../services/orderEvents';

// Staff-facing endpoints for online ordering — /api/orders/*. Mounted behind
// tenantMiddleware + authMiddleware + requirePermission('manage_orders') in
// src/routes/orderRoutes.ts. Every query below is scoped by restaurantId —
// this is the single most important thing to get right per CLAUDE.md.

const VALID_ORDER_STATUSES = new Set([
  'NEW', 'ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED', 'REJECTED',
]);

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
        customer: { select: { id: true, name: true, phone: true } },
      },
      take,
    });

    return successResponse(res, orders);
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
        include: { items: true, customer: { select: { id: true, name: true, phone: true } } },
      });
      if (!order) return;
      res.write(`event: ${payload.type}\ndata: ${JSON.stringify(order)}\n\n`);
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

// NEW -> ACCEPTED -> PREPARING -> READY -> OUT_FOR_DELIVERY (delivery only) /
// COMPLETED (pickup) -> COMPLETED. CANCELLED/REJECTED reachable from any
// non-terminal state. See docs/packaging/online-ordering-plan.md §1c.
const FORWARD_TRANSITIONS: Record<string, string[]> = {
  NEW: ['ACCEPTED'],
  ACCEPTED: ['PREPARING'],
  PREPARING: ['READY'],
  READY: ['OUT_FOR_DELIVERY', 'COMPLETED'],
  OUT_FOR_DELIVERY: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  REJECTED: [],
};
const TERMINAL_STATUSES = ['COMPLETED', 'CANCELLED', 'REJECTED'];

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
    const { count } = await prisma.order.updateMany({
      where: { id: order.id, status: order.status },
      data: { status },
    });
    if (count === 0) {
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
      action: 'ORDER_STATUS_CHANGED',
      targetType: 'Order',
      targetId: order.id,
      targetLabel: `#${order.orderNumber}`,
      metadata: { from: order.status, to: status, reason: isCancelLike ? (reason || null) : undefined },
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
    return successResponse(res, customers);
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
    return successResponse(res, customer);
  } catch (error) {
    console.error('[Order] getCustomerDetail error:', error);
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
    const settings = await prisma.orderSettings.upsert({
      where: { restaurantId },
      update: {},
      create: { restaurantId },
    });
    return successResponse(res, settings);
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
    } = req.body || {};

    const data = {
      onlineOrderingOpen,
      deliveryEnabled,
      pickupEnabled,
      cashOnDeliveryEnabled,
      onlineCardEnabled,
      maxConcurrentOrders: maxConcurrentOrders === null ? null : parseOptionalFiniteNumber(maxConcurrentOrders, 'maxConcurrentOrders'),
      prepTimeMinutes: parseOptionalFiniteNumber(prepTimeMinutes, 'prepTimeMinutes'),
      orderHours,
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
function parseOptionalFiniteNumber(value: unknown, field: string): number | undefined {
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
// Menu online-orderable toggle
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

    const updated = await prisma.menuItem.update({
      where: { id },
      data: {
        ...(isOrderableOnline !== undefined ? { isOrderableOnline: Boolean(isOrderableOnline) } : {}),
        ...(prepTimeMinutes !== undefined ? { prepTimeMinutes: prepTimeMinutes === null ? null : Number(prepTimeMinutes) } : {}),
      },
    });
    return successResponse(res, updated);
  } catch (error) {
    console.error('[Order] setMenuItemOrderable error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
