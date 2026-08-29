import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { AppError } from '../utils/AppError';
import * as otpService from '../services/otpService';
import { computeOrderQuote, CartLineInput } from '../services/orderPricingService';
import { resolveDeliveryZone } from '../services/geoService';
import { generateCustomerToken } from '../utils/jwt';
import { setCustomerSessionCookie, issueTrustedDevice } from '../middlewares/customerAuth';
import { publishOrderEvent } from '../services/orderEvents';
import { isValidPhone } from '../utils/phone';

// Public, customer-facing endpoints for online ordering — /api/public/order/*.
// Mounted behind tenantMiddleware (like the guest reservation-create path in
// reservationRoutes.ts), so req.restaurantId is already resolved from the
// X-Restaurant-ID header the frontend picked up from GET
// /api/public/restaurant/:slug. Never trust client-sent prices; every quote
// here is recomputed server-side (see orderPricingService).

const clientIp = (req: Request): string =>
  ((req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || 'unknown').trim();

// Read an optional { lat, lng } map pin off a request body (or a nested
// address object). Both must be present, finite, and in range for the pin to
// count — a half-supplied or out-of-range pin is treated as no pin at all, so
// the caller falls back to the manual zone path rather than measuring a
// distance from garbage.
const readPin = (source: any): { lat?: number; lng?: number } => {
  if (!source || typeof source !== 'object') return {};
  // Guard null/'' explicitly before Number() — Number(null) and Number('')
  // are both 0, which would silently place the pin at (0, 0).
  if (source.lat == null || source.lat === '' || source.lng == null || source.lng === '') return {};
  const lat = Number(source.lat);
  const lng = Number(source.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return {};
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return {};
  return { lat, lng };
};

// ---------------------------------------------------------------------------
// OTP
// ---------------------------------------------------------------------------

export const requestOtp = async (req: Request, res: Response) => {
  const restaurantId = req.restaurantId!;
  const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
  if (!phone || !isValidPhone(phone)) {
    return errorResponse(res, 'errors.validation_error', 400, { message: 'a valid phone is required' });
  }

  try {
    const { expiresAt } = await otpService.requestOtp({ restaurantId, phone, ip: clientIp(req) });
    return successResponse(res, { expiresAt });
  } catch (error) {
    if (error instanceof AppError) return errorResponse(res, error.code, error.status, error.details);
    console.error('[CustomerOrder] OTP request failed:', (error as Error)?.message);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const verifyOtp = async (req: Request, res: Response) => {
  const restaurantId = req.restaurantId!;
  const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : undefined;
  const trustDevice = req.body?.trustDevice === true;

  if (!phone || !isValidPhone(phone) || !code) {
    return errorResponse(res, 'errors.validation_error', 400, { message: 'a valid phone and code are required' });
  }

  try {
    // Validate the code before looking at any phone-specific state (whether
    // a Customer already exists) — checking existence first and branching
    // the error message on it would let anyone probe which phone numbers
    // have ordered here before, without ever proving they hold a valid code.
    // checkOtp() doesn't consume the challenge, so if we end up needing a
    // name below, the customer can resubmit this same code rather than
    // burning it and waiting out the resend cooldown.
    const { challengeId } = await otpService.checkOtp({ restaurantId, phone, code });

    let customer = await prisma.customer.findUnique({
      where: { restaurantId_phone: { restaurantId, phone } },
    });

    if (!customer && !name) {
      return errorResponse(res, 'errors.order_name_required', 400);
    }

    await otpService.consumeOtp(challengeId);

    if (!customer) {
      customer = await prisma.customer.create({
        data: { restaurantId, phone, name, phoneVerifiedAt: new Date() },
      });
    } else {
      customer = await prisma.customer.update({
        where: { id: customer.id },
        data: {
          phoneVerifiedAt: customer.phoneVerifiedAt ?? new Date(),
          ...(name ? { name } : {}),
        },
      });
    }

    const token = generateCustomerToken(customer.id, restaurantId, customer.phone);
    setCustomerSessionCookie(res, token);
    if (trustDevice) {
      await issueTrustedDevice(res, customer.id, req.headers['user-agent'] as string | undefined);
    }

    return successResponse(res, {
      token,
      customer: { id: customer.id, name: customer.name, phone: customer.phone },
    });
  } catch (error) {
    if (error instanceof AppError) return errorResponse(res, error.code, error.status, error.details);
    console.error('[CustomerOrder] OTP verify failed:', (error as Error)?.message);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

export const getOrderableMenu = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;

    const categories = await prisma.menuCategory.findMany({
      where: { menu: { restaurantId, isActive: true } },
      orderBy: { order: 'asc' },
      include: {
        items: {
          where: { isOrderableOnline: true, isAvailable: true },
          orderBy: { order: 'asc' },
          include: { modifiers: { include: { options: true } } },
        },
      },
    });

    // Drop empty categories so the customer never sees a section with
    // nothing orderable in it.
    const nonEmpty = categories.filter((c) => c.items.length > 0);

    return successResponse(res, { categories: nonEmpty });
  } catch (error) {
    console.error('[CustomerOrder] getOrderableMenu error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// ---------------------------------------------------------------------------
// Order settings (anonymous, read-only) — deviation from the original brief:
// there was no public read of OrderSettings' payment-method/fulfillment flags,
// but the customer UI needs to know which fulfillment types and payment
// methods are actually enabled *before* showing them as choices (never offer
// a method the backend will reject with order_payment_method_disabled /
// order_fulfillment_disabled). Kept read-only and minimal, mirroring the
// listPublicDeliveryZones pattern below. Deliberately NOT gated by
// requireOnlineOrderingOpen (unlike /menu and /zones) — the customer flow
// needs to render an "we're closed right now" state from `onlineOrderingOpen`
// itself, so this must stay reachable while that flag is false.
// ---------------------------------------------------------------------------

export const getPublicOrderSettings = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const settings = await prisma.orderSettings.findUnique({
      where: { restaurantId },
      select: {
        onlineOrderingOpen: true,
        deliveryEnabled: true,
        pickupEnabled: true,
        cashOnDeliveryEnabled: true,
        onlineCardEnabled: true,
        prepTimeMinutes: true,
      },
    });

    // No row yet = tenant never configured it; mirror the schema defaults
    // (see requireOnlineOrderingOpen's comment for the same fallback logic)
    // rather than telling the customer UI everything is disabled.
    return successResponse(res, settings ?? {
      onlineOrderingOpen: true,
      deliveryEnabled: true,
      pickupEnabled: true,
      cashOnDeliveryEnabled: true,
      onlineCardEnabled: false,
      prepTimeMinutes: 20,
    });
  } catch (error) {
    console.error('[CustomerOrder] getPublicOrderSettings error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// ---------------------------------------------------------------------------
// Delivery zones (anonymous, read-only). The primary flow now auto-resolves
// the zone from the customer's map pin (see /check-address), but this stays:
// it backs the manual picker for tenants that haven't set their own
// coordinates yet, and lets the customer see the fee tiers up front.
// Only active zones, only the fields a customer needs to choose one.
// ---------------------------------------------------------------------------

export const listPublicDeliveryZones = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const zones = await prisma.deliveryZone.findMany({
      where: { restaurantId, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, deliveryFee: true, minOrderAmount: true },
    });
    return successResponse(res, zones);
  } catch (error) {
    console.error('[CustomerOrder] listPublicDeliveryZones error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// ---------------------------------------------------------------------------
// Quote (anonymous — happens before phone identification in the flow, per
// spec §5: browse -> cart -> fulfillment/address -> identify by phone)
// ---------------------------------------------------------------------------

export const quoteOrder = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const items: CartLineInput[] = Array.isArray(req.body?.items) ? req.body.items : [];
    const fulfillmentType = req.body?.fulfillmentType;
    const zoneId = typeof req.body?.zoneId === 'string' ? req.body.zoneId : undefined;
    // Map pin (optional). When present and the tenant has its own coordinates
    // set, computeOrderQuote resolves the zone/fee from it and ignores zoneId.
    const { lat, lng } = readPin(req.body);

    if (fulfillmentType !== 'DELIVERY' && fulfillmentType !== 'PICKUP') {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'fulfillmentType must be DELIVERY or PICKUP' });
    }

    const quote = await computeOrderQuote({ restaurantId, items, fulfillmentType, zoneId, lat, lng });
    return successResponse(res, quote);
  } catch (error) {
    if (error instanceof AppError) return errorResponse(res, error.code, error.status, error.details);
    console.error('[CustomerOrder] quoteOrder error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// ---------------------------------------------------------------------------
// Check a map pin against the tenant's delivery range (anonymous). Lets the
// address step show "we deliver here, fee X" / "outside our delivery area"
// before there's a cart to quote. Deliberately does NOT throw on out-of-range
// — it's a verdict endpoint, not a checkout gate; /quote and order placement
// are what actually block. `needsManualZone` tells the client to fall back to
// the old zone dropdown because this tenant hasn't set its own coordinates
// yet (nothing to measure distance from).
// ---------------------------------------------------------------------------

export const checkAddress = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { lat, lng } = readPin(req.body);

    if (lat === undefined || lng === undefined) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'lat and lng are required' });
    }

    const result = await resolveDeliveryZone({ restaurantId, lat, lng });

    if (result.zone) {
      return successResponse(res, {
        inRange: true,
        distanceMeters: result.distanceMeters,
        needsManualZone: false,
        zone: {
          id: result.zone.id,
          name: result.zone.name,
          deliveryFee: result.zone.deliveryFee,
          minOrderAmount: result.zone.minOrderAmount,
        },
      });
    }

    const needsManualZone = result.reason === 'NO_RESTAURANT_LOCATION';
    return successResponse(res, {
      // A tenant with no location can't be judged out of range — the customer
      // just has to pick a zone by hand, so don't show them a rejection.
      inRange: needsManualZone,
      distanceMeters: result.distanceMeters,
      needsManualZone,
      zone: null,
      maxDeliveryMeters: result.maxDeliveryMeters ?? null,
    });
  } catch (error) {
    if (error instanceof AppError) return errorResponse(res, error.code, error.status, error.details);
    console.error('[CustomerOrder] checkAddress error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// ---------------------------------------------------------------------------
// Place order (customer-auth required)
// ---------------------------------------------------------------------------

const ORDER_CREATE_WINDOW_MS = 60_000;
const ORDER_CREATE_MAX_PER_WINDOW = 3;

export const placeOrder = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const customer = req.customer!;

    // Per-customer throttle, on top of the route-level per-IP rateLimitOrNoop
    // — spec §4: "rate-limit order creation per customer/phone/IP".
    const recentOrders = await prisma.order.count({
      where: { restaurantId, customerId: customer.id, createdAt: { gte: new Date(Date.now() - ORDER_CREATE_WINDOW_MS) } },
    });
    if (recentOrders >= ORDER_CREATE_MAX_PER_WINDOW) {
      return errorResponse(res, 'errors.order_rate_limited', 429);
    }

    const items: CartLineInput[] = Array.isArray(req.body?.items) ? req.body.items : [];
    const fulfillmentType = req.body?.fulfillmentType;
    const paymentMethod = req.body?.paymentMethod;
    const customerNote = typeof req.body?.customerNote === 'string' ? req.body.customerNote.slice(0, 500) : null;
    const addressId = typeof req.body?.addressId === 'string' ? req.body.addressId : undefined;
    const inlineAddress = req.body?.address; // { fullAddress, neighborhood?, lat?, lng?, zoneId?, label?, note?, save? }

    if (fulfillmentType !== 'DELIVERY' && fulfillmentType !== 'PICKUP') {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'fulfillmentType must be DELIVERY or PICKUP' });
    }
    if (paymentMethod !== 'CASH_ON_DELIVERY' && paymentMethod !== 'ONLINE_CARD') {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'paymentMethod must be CASH_ON_DELIVERY or ONLINE_CARD' });
    }

    const orderSettings = await prisma.orderSettings.findUnique({ where: { restaurantId } });
    if (paymentMethod === 'CASH_ON_DELIVERY' && orderSettings && !orderSettings.cashOnDeliveryEnabled) {
      return errorResponse(res, 'errors.order_payment_method_disabled', 400);
    }
    // Phase 2 (marketplace sub-merchant) — not implemented yet.
    if (paymentMethod === 'ONLINE_CARD' && !(orderSettings?.onlineCardEnabled)) {
      return errorResponse(res, 'errors.order_payment_method_disabled', 400);
    }

    let addressSnapshot: Record<string, unknown> | null = null;
    let zoneId: string | undefined;
    // The pin may arrive at the top level of the body or on the inline address
    // object; either is accepted, top level wins. For a saved address the
    // stored coordinates are the pin.
    let pin = readPin(req.body);
    let savedAddressId: string | undefined;

    if (fulfillmentType === 'DELIVERY') {
      if (addressId) {
        const address = await prisma.customerAddress.findFirst({
          where: { id: addressId, restaurantId, customerId: customer.id },
        });
        if (!address) {
          return errorResponse(res, 'errors.order_address_not_found', 400);
        }
        zoneId = address.zoneId || undefined;
        if (pin.lat === undefined) pin = readPin({ lat: address.lat, lng: address.lng });
        savedAddressId = address.id;
        addressSnapshot = {
          label: address.label,
          neighborhood: address.neighborhood,
          fullAddress: address.fullAddress,
          lat: address.lat,
          lng: address.lng,
          note: address.note,
        };
      } else if (inlineAddress?.fullAddress) {
        zoneId = typeof inlineAddress.zoneId === 'string' ? inlineAddress.zoneId : undefined;
        if (pin.lat === undefined) pin = readPin(inlineAddress);
        addressSnapshot = {
          label: inlineAddress.label ?? null,
          neighborhood: inlineAddress.neighborhood ?? null,
          fullAddress: inlineAddress.fullAddress,
          lat: pin.lat ?? null,
          lng: pin.lng ?? null,
          note: inlineAddress.note ?? null,
        };
      } else {
        return errorResponse(res, 'errors.order_address_required', 400);
      }
    }

    // Recompute everything server-side — the whole point of this call. When a
    // pin is present and the tenant has coordinates, this also re-resolves the
    // zone/fee from that pin and can reject the address as out of range.
    const quote = await computeOrderQuote({
      restaurantId,
      items,
      fulfillmentType,
      zoneId,
      lat: pin.lat,
      lng: pin.lng,
    });
    if (fulfillmentType === 'DELIVERY' && !quote.meetsMinimum) {
      return errorResponse(res, 'errors.order_below_minimum', 400, { minOrderAmount: quote.minOrderAmount, subtotal: quote.subtotal });
    }

    // Persist a new address only after the quote succeeded — an out-of-range
    // or below-minimum attempt shouldn't leave a saved address behind — and
    // stamp it with the server-resolved zone rather than whatever the client
    // guessed, so the saved-address fast path stays correct next time.
    if (fulfillmentType === 'DELIVERY' && !addressId && inlineAddress?.save && addressSnapshot) {
      const saved = await prisma.customerAddress.create({
        data: {
          customerId: customer.id,
          restaurantId,
          label: inlineAddress.label ?? null,
          neighborhood: inlineAddress.neighborhood ?? null,
          fullAddress: inlineAddress.fullAddress,
          lat: pin.lat ?? null,
          lng: pin.lng ?? null,
          zoneId: quote.zoneId ?? null,
          note: inlineAddress.note ?? null,
        },
      });
      savedAddressId = saved.id;
      addressSnapshot.addressId = saved.id;
    }

    // Keep an existing saved address's zone in sync with what the pin actually
    // resolves to now (zones/fees change; the stored zoneId can go stale).
    if (fulfillmentType === 'DELIVERY' && addressId && savedAddressId && quote.zoneId && quote.zoneId !== zoneId) {
      await prisma.customerAddress.update({
        where: { id: savedAddressId },
        data: { zoneId: quote.zoneId },
      });
    }

    const readyBy = new Date(Date.now() + quote.prepTimeMinutes * 60_000);

    const order = await prisma.$transaction(async (tx) => {
      // Race-safe per-tenant order number — see the OrderCounter comment in
      // schema.prisma: an atomic UPDATE ... RETURNING, never COUNT(*).
      await tx.$executeRaw`INSERT INTO "OrderCounter" ("restaurantId", "lastNumber") VALUES (${restaurantId}, 0) ON CONFLICT ("restaurantId") DO NOTHING`;
      const rows = await tx.$queryRaw<{ lastNumber: number }[]>`UPDATE "OrderCounter" SET "lastNumber" = "lastNumber" + 1 WHERE "restaurantId" = ${restaurantId} RETURNING "lastNumber"`;
      const orderNumber = rows[0].lastNumber;

      const created = await tx.order.create({
        data: {
          restaurantId,
          customerId: customer.id,
          orderNumber,
          fulfillmentType,
          paymentMethod,
          addressSnapshot: (addressSnapshot ?? undefined) as any,
          zoneId: quote.zoneId ?? null,
          deliveryFee: quote.deliveryFee,
          subtotal: quote.subtotal,
          total: quote.total,
          prepTimeMinutes: quote.prepTimeMinutes,
          readyBy,
          customerNote,
          items: {
            create: quote.lines.map((line) => ({
              menuItemId: line.menuItemId,
              nameSnapshot: line.name,
              unitPrice: line.unitPrice,
              quantity: line.quantity,
              modifiersSnapshot: line.modifiers as any,
            })),
          },
        },
        include: { items: true },
      });

      await publishOrderEvent({ restaurantId, orderId: created.id, orderNumber: created.orderNumber, type: 'created' }, tx);

      return created;
    });

    return successResponse(res, order, undefined, 201);
  } catch (error) {
    if (error instanceof AppError) return errorResponse(res, error.code, error.status, error.details);
    console.error('[CustomerOrder] placeOrder error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// ---------------------------------------------------------------------------
// Order history (customer-auth required)
// ---------------------------------------------------------------------------

export const myOrders = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const customer = req.customer!;

    const orders = await prisma.order.findMany({
      where: { restaurantId, customerId: customer.id },
      orderBy: { createdAt: 'desc' },
      include: { items: true },
      take: 50,
    });

    return successResponse(res, orders);
  } catch (error) {
    console.error('[CustomerOrder] myOrders error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
