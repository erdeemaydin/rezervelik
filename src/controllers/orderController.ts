import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { logAudit } from '../services/auditService';
import { subscribeToRestaurant, publishOrderEvent } from '../services/orderEvents';

// Staff-facing endpoints for online ordering — /api/orders/*. Mounted behind
// tenantMiddleware + authMiddleware + requirePermission('manage_orders') in
// src/routes/orderRoutes.ts. Every query below is scoped by restaurantId —
// this is the single most important thing to get right per CLAUDE.md.

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

    const orders = await prisma.order.findMany({
      where: { restaurantId, ...(statuses ? { status: { in: statuses as any } } : {}) },
      orderBy: { createdAt: 'desc' },
      include: {
        items: true,
        customer: { select: { id: true, name: true, phone: true } },
      },
      take: 200,
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

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { status },
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
    let settings = await prisma.orderSettings.findUnique({ where: { restaurantId } });
    if (!settings) {
      settings = await prisma.orderSettings.create({ data: { restaurantId } });
    }
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
      maxConcurrentOrders: maxConcurrentOrders === null ? null : (maxConcurrentOrders !== undefined ? Number(maxConcurrentOrders) : undefined),
      prepTimeMinutes: prepTimeMinutes !== undefined ? Number(prepTimeMinutes) : undefined,
      orderHours,
    };

    const settings = await prisma.orderSettings.upsert({
      where: { restaurantId },
      update: data,
      create: { restaurantId, ...data },
    });

    return successResponse(res, settings);
  } catch (error) {
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

export const createDeliveryZone = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { name, matchType, radiusMeters, polygon, deliveryFee, minOrderAmount, isActive, openHours } = req.body || {};

    if (!name || deliveryFee === undefined || deliveryFee === null) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'name and deliveryFee are required' });
    }

    const zone = await prisma.deliveryZone.create({
      data: {
        restaurantId,
        name,
        matchType: matchType || 'RADIUS',
        radiusMeters: radiusMeters !== undefined ? Number(radiusMeters) : undefined,
        polygon,
        deliveryFee: Number(deliveryFee),
        minOrderAmount: minOrderAmount !== undefined ? Number(minOrderAmount) : undefined,
        isActive: isActive !== undefined ? Boolean(isActive) : undefined,
        openHours,
      },
    });
    return successResponse(res, zone, undefined, 201);
  } catch (error) {
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
        radiusMeters: radiusMeters !== undefined ? Number(radiusMeters) : undefined,
        polygon,
        deliveryFee: deliveryFee !== undefined ? Number(deliveryFee) : undefined,
        minOrderAmount: minOrderAmount !== undefined ? Number(minOrderAmount) : undefined,
        isActive,
        openHours,
      },
    });
    return successResponse(res, zone);
  } catch (error) {
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
