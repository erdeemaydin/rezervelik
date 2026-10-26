import { Request, Response } from 'express';
import crypto from 'crypto';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { INVALID, parseAmount, parseCount } from '../utils/numeric';

// Wedding/organization vertical (Phase 4 + 5). Events (with a sales pipeline),
// their installment payment plans, guest lists (RSVP + seating), vendor
// coordination and the e-davetiye invitation microsite. Every query is scoped to
// req.restaurantId; sub-resources verify their parent belongs to the tenant
// before mutating. See MULTI_BUSINESS_ROADMAP.md §6.

export const EVENT_STAGES = ['LEAD', 'VISIT', 'QUOTE', 'CONTRACT', 'CONFIRMED', 'COMPLETED', 'CANCELED'];
export const EVENT_TYPES = ['WEDDING', 'ENGAGEMENT', 'HENNA', 'CORPORATE'];
const RSVP_VALUES = ['PENDING', 'YES', 'NO', 'MAYBE'];
const INSTALLMENT_STATUS = ['PENDING', 'PAID', 'OVERDUE'];
const VENDOR_LINK_STATUS = ['PENDING', 'CONFIRMED', 'CANCELED'];

// Verify a vendor belongs to this tenant; returns the id if valid, else null.
async function ownedVendorId(restaurantId: string, id?: string | null): Promise<string | null> {
  if (!id) return null;
  const row = await prisma.vendor.findFirst({ where: { id, restaurantId }, select: { id: true } });
  return row ? id : null;
}

// Verify a referenced row belongs to this tenant; returns the id if valid, else null.
async function ownedResourceId(restaurantId: string, id?: string | null): Promise<string | null> {
  if (!id || id === 'none') return null;
  const row = await prisma.bookableResource.findFirst({ where: { id, restaurantId }, select: { id: true } });
  return row ? id : null;
}
async function ownedCoordinatorId(restaurantId: string, id?: string | null): Promise<string | null> {
  if (!id || id === 'none') return null;
  const row = await prisma.user.findFirst({ where: { id, restaurantId }, select: { id: true } });
  return row ? id : null;
}
// A package is a MenuItem reachable through this tenant's menus. Returns its price.
async function ownedPackage(restaurantId: string, id?: string | null): Promise<{ id: string; price: number } | null> {
  if (!id || id === 'none') return null;
  const row = await prisma.menuItem.findFirst({
    where: { id, category: { menu: { restaurantId } } },
    select: { id: true, price: true },
  });
  return row ?? null;
}

// -------------------------------------------------------------------- Events

export const getEvents = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { stage } = req.query;
    const events = await prisma.event.findMany({
      where: { restaurantId, ...(typeof stage === 'string' && stage ? { stage } : {}) },
      include: {
        resource: { select: { id: true, identifier: true } },
        package: { select: { id: true, name: true, price: true } },
        coordinator: { select: { id: true, firstName: true, lastName: true } },
        paymentPlan: { include: { installments: true } },
        _count: { select: { guests: true } },
      },
      orderBy: { eventDate: 'asc' },
    });
    return successResponse(res, events);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const getEvent = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { id } = req.params;
    const event = await prisma.event.findFirst({
      where: { id, restaurantId },
      include: {
        resource: { select: { id: true, identifier: true } },
        package: { select: { id: true, name: true, price: true } },
        coordinator: { select: { id: true, firstName: true, lastName: true } },
        paymentPlan: { include: { installments: { orderBy: { dueDate: 'asc' } } } },
        guests: { include: { resource: { select: { id: true, identifier: true } } }, orderBy: { name: 'asc' } },
        vendors: {
          include: { vendor: { select: { id: true, name: true, category: true, phone: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!event) return errorResponse(res, 'errors.not_found', 404);
    return successResponse(res, event);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// Derive quotedTotal (minor units) from a per-person package × guest count when the
// caller didn't set an explicit total. Package price is stored in major units.
// `explicit` is expected pre-validated (via parseAmount) by the caller.
function derivedTotal(explicit: number | null | undefined, pkgPrice: number | undefined, guestCount: number): number | null {
  if (explicit !== undefined && explicit !== null) return explicit;
  if (pkgPrice && guestCount > 0) return Math.round(pkgPrice * 100) * guestCount;
  return null;
}

export const createEvent = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const {
      eventType, clientName, clientPhone, clientEmail, eventDate, slot,
      guestCount, stage, quotedTotal, notes, resourceId, packageId, coordinatorId,
    } = req.body;

    if (!clientName || !clientPhone || !eventDate) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'clientName, clientPhone and eventDate are required' });
    }
    if (stage && !EVENT_STAGES.includes(stage)) {
      return errorResponse(res, 'errors.validation_error', 400, { message: `Invalid stage. One of: ${EVENT_STAGES.join(', ')}` });
    }
    if (eventType && !EVENT_TYPES.includes(eventType)) {
      return errorResponse(res, 'errors.validation_error', 400, { message: `Invalid eventType. One of: ${EVENT_TYPES.join(', ')}` });
    }

    const pkg = await ownedPackage(restaurantId, packageId);
    const count = parseCount(guestCount, 0);
    if (count === INVALID) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'guestCount must be a non-negative integer' });
    }
    const parsedQuotedTotal = parseAmount(quotedTotal);
    if (parsedQuotedTotal === INVALID) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'quotedTotal must be a number' });
    }

    const event = await prisma.event.create({
      data: {
        restaurantId,
        eventType: eventType || 'WEDDING',
        clientName,
        clientPhone,
        clientEmail: clientEmail || null,
        eventDate,
        slot: slot || null,
        guestCount: count,
        stage: stage || 'LEAD',
        quotedTotal: derivedTotal(parsedQuotedTotal, pkg?.price, count),
        notes: notes || null,
        resourceId: await ownedResourceId(restaurantId, resourceId),
        packageId: pkg?.id ?? null,
        coordinatorId: await ownedCoordinatorId(restaurantId, coordinatorId),
      },
    });
    return successResponse(res, event, 'Event created', 201);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const updateEvent = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { id } = req.params;
    const existing = await prisma.event.findFirst({ where: { id, restaurantId } });
    if (!existing) return errorResponse(res, 'errors.not_found', 404);

    const b = req.body;
    if (b.stage !== undefined && !EVENT_STAGES.includes(b.stage)) {
      return errorResponse(res, 'errors.validation_error', 400, { message: `Invalid stage. One of: ${EVENT_STAGES.join(', ')}` });
    }
    if (b.eventType !== undefined && !EVENT_TYPES.includes(b.eventType)) {
      return errorResponse(res, 'errors.validation_error', 400, { message: `Invalid eventType.` });
    }

    const count = b.guestCount !== undefined ? parseCount(b.guestCount, existing.guestCount) : existing.guestCount;
    if (count === INVALID) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'guestCount must be a non-negative integer' });
    }
    // Only recompute the derived total when a package or guest count actually changes
    // and no explicit quotedTotal is supplied.
    let quotedTotal: number | null | undefined = undefined;
    if (b.quotedTotal !== undefined) {
      const parsed = parseAmount(b.quotedTotal);
      if (parsed === INVALID) {
        return errorResponse(res, 'errors.validation_error', 400, { message: 'quotedTotal must be a number' });
      }
      quotedTotal = parsed;
    } else if (b.packageId !== undefined || b.guestCount !== undefined) {
      const pkgId = b.packageId !== undefined ? b.packageId : existing.packageId;
      const pkg = await ownedPackage(restaurantId, pkgId);
      quotedTotal = derivedTotal(undefined, pkg?.price, count);
    }

    // contractSignedAt/proposalSentAt reached `new Date(...)` with no validation
    // that the client-supplied value actually parses — an Invalid Date silently
    // built from a malformed string crashes on Prisma's DateTime column and falls
    // through to the generic 500 handler instead of a clean 400, same class of gap
    // already guarded for guestCount/quotedTotal/amount above via parseCount/parseAmount.
    let contractSignedAt: Date | null | undefined;
    if (b.contractSignedAt !== undefined) {
      if (!b.contractSignedAt) {
        contractSignedAt = null;
      } else {
        const parsed = new Date(b.contractSignedAt);
        if (isNaN(parsed.getTime())) {
          return errorResponse(res, 'errors.validation_error', 400, { message: 'contractSignedAt must be a valid date' });
        }
        contractSignedAt = parsed;
      }
    }
    let proposalSentAt: Date | null | undefined;
    if (b.proposalSentAt !== undefined) {
      if (!b.proposalSentAt) {
        proposalSentAt = null;
      } else {
        const parsed = new Date(b.proposalSentAt);
        if (isNaN(parsed.getTime())) {
          return errorResponse(res, 'errors.validation_error', 400, { message: 'proposalSentAt must be a valid date' });
        }
        proposalSentAt = parsed;
      }
    }

    const event = await prisma.event.update({
      where: { id },
      data: {
        eventType: b.eventType,
        clientName: b.clientName,
        clientPhone: b.clientPhone,
        clientEmail: b.clientEmail,
        eventDate: b.eventDate,
        slot: b.slot,
        guestCount: b.guestCount !== undefined ? count : undefined,
        stage: b.stage,
        notes: b.notes,
        // Contract / proposal + invitation display fields (Phase 5).
        contractUrl: b.contractUrl,
        venueName: b.venueName,
        venueAddress: b.venueAddress,
        invitationMessage: b.invitationMessage,
        ...(contractSignedAt !== undefined ? { contractSignedAt } : {}),
        ...(proposalSentAt !== undefined ? { proposalSentAt } : {}),
        ...(quotedTotal !== undefined ? { quotedTotal } : {}),
        ...(b.resourceId !== undefined ? { resourceId: await ownedResourceId(restaurantId, b.resourceId) } : {}),
        ...(b.packageId !== undefined ? { packageId: (await ownedPackage(restaurantId, b.packageId))?.id ?? null } : {}),
        ...(b.coordinatorId !== undefined ? { coordinatorId: await ownedCoordinatorId(restaurantId, b.coordinatorId) } : {}),
      },
    });
    return successResponse(res, event);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const deleteEvent = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { id } = req.params;
    const existing = await prisma.event.findFirst({ where: { id, restaurantId }, select: { id: true } });
    if (!existing) return errorResponse(res, 'errors.not_found', 404);
    await prisma.event.delete({ where: { id } });
    return successResponse(res, null, 'Event deleted');
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// ------------------------------------------------------------- Payment plans

// Ensure an event exists for this tenant and return its id, else null.
async function ownedEventId(restaurantId: string, eventId: string): Promise<string | null> {
  const row = await prisma.event.findFirst({ where: { id: eventId, restaurantId }, select: { id: true } });
  return row ? eventId : null;
}

// Upsert the single payment plan for an event (kapora + taksit schedule).
export const upsertPaymentPlan = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { eventId } = req.params;
    if (!(await ownedEventId(restaurantId, eventId))) return errorResponse(res, 'errors.not_found', 404);

    const { totalAmount, currency } = req.body;
    let parsedTotal = 0;
    if (totalAmount !== undefined) {
      const parsed = parseAmount(totalAmount);
      if (parsed === INVALID) {
        return errorResponse(res, 'errors.validation_error', 400, { message: 'totalAmount must be a number' });
      }
      parsedTotal = parsed ?? 0;
    }
    const data = {
      totalAmount: parsedTotal,
      currency: currency || 'TRY',
    };
    const plan = await prisma.paymentPlan.upsert({
      where: { eventId },
      update: { totalAmount: data.totalAmount, currency: data.currency },
      create: { restaurantId, eventId, ...data },
      include: { installments: { orderBy: { dueDate: 'asc' } } },
    });
    return successResponse(res, plan);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const addInstallment = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { eventId } = req.params;
    if (!(await ownedEventId(restaurantId, eventId))) return errorResponse(res, 'errors.not_found', 404);

    const { label, dueDate, amount, status } = req.body;
    if (!dueDate || amount === undefined) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'dueDate and amount are required' });
    }
    if (status && !INSTALLMENT_STATUS.includes(status)) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Invalid status' });
    }
    const parsedAmount = parseAmount(amount);
    if (parsedAmount === INVALID || parsedAmount === null || parsedAmount === undefined) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'amount must be a number' });
    }
    // Create the plan lazily if it doesn't exist yet.
    const plan = await prisma.paymentPlan.upsert({
      where: { eventId },
      update: {},
      create: { restaurantId, eventId },
    });
    const installment = await prisma.paymentInstallment.create({
      data: {
        planId: plan.id,
        label: label || null,
        dueDate,
        amount: parsedAmount,
        status: status || 'PENDING',
        paidAt: status === 'PAID' ? new Date() : null,
      },
    });
    return successResponse(res, installment, 'Installment added', 201);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const updateInstallment = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { installmentId } = req.params;
    // Scope: the installment's plan must belong to this tenant.
    const existing = await prisma.paymentInstallment.findFirst({
      where: { id: installmentId, plan: { restaurantId } },
    });
    if (!existing) return errorResponse(res, 'errors.not_found', 404);

    const { label, dueDate, amount, status } = req.body;
    if (status !== undefined && !INSTALLMENT_STATUS.includes(status)) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Invalid status' });
    }
    let parsedAmount: number | undefined;
    if (amount !== undefined) {
      const parsed = parseAmount(amount);
      if (parsed === INVALID || parsed === null) {
        return errorResponse(res, 'errors.validation_error', 400, { message: 'amount must be a number' });
      }
      parsedAmount = parsed;
    }
    const installment = await prisma.paymentInstallment.update({
      where: { id: installmentId },
      data: {
        label,
        dueDate,
        amount: parsedAmount,
        status,
        // Stamp/clear paidAt as the status flips to/from PAID.
        ...(status === 'PAID' ? { paidAt: existing.paidAt ?? new Date() } : {}),
        ...(status !== undefined && status !== 'PAID' ? { paidAt: null } : {}),
      },
    });
    return successResponse(res, installment);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const deleteInstallment = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { installmentId } = req.params;
    const existing = await prisma.paymentInstallment.findFirst({
      where: { id: installmentId, plan: { restaurantId } },
      select: { id: true },
    });
    if (!existing) return errorResponse(res, 'errors.not_found', 404);
    await prisma.paymentInstallment.delete({ where: { id: installmentId } });
    return successResponse(res, null, 'Installment deleted');
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// -------------------------------------------------------------------- Guests

export const getGuests = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { eventId } = req.params;
    if (!(await ownedEventId(restaurantId, eventId))) return errorResponse(res, 'errors.not_found', 404);
    const guests = await prisma.guest.findMany({
      where: { restaurantId, eventId },
      include: { resource: { select: { id: true, identifier: true } } },
      orderBy: { name: 'asc' },
    });
    return successResponse(res, guests);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const createGuest = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { eventId } = req.params;
    if (!(await ownedEventId(restaurantId, eventId))) return errorResponse(res, 'errors.not_found', 404);

    const { name, partySize, rsvp, dietary, note, resourceId } = req.body;
    if (!name) return errorResponse(res, 'errors.validation_error', 400, { message: 'name is required' });
    if (rsvp && !RSVP_VALUES.includes(rsvp)) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Invalid rsvp' });
    }
    const parsedPartySize = parseCount(partySize, 1, 1);
    if (parsedPartySize === INVALID) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'partySize must be a positive integer' });
    }
    const guest = await prisma.guest.create({
      data: {
        restaurantId,
        eventId,
        name,
        partySize: parsedPartySize,
        rsvp: rsvp || 'PENDING',
        dietary: dietary || null,
        note: note || null,
        resourceId: await ownedResourceId(restaurantId, resourceId),
      },
    });
    return successResponse(res, guest, 'Guest added', 201);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const updateGuest = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { guestId } = req.params;
    const existing = await prisma.guest.findFirst({ where: { id: guestId, restaurantId }, select: { id: true } });
    if (!existing) return errorResponse(res, 'errors.not_found', 404);

    const b = req.body;
    if (b.rsvp !== undefined && !RSVP_VALUES.includes(b.rsvp)) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Invalid rsvp' });
    }
    let parsedPartySize: number | undefined;
    if (b.partySize !== undefined) {
      const parsed = parseCount(b.partySize, 1, 1);
      if (parsed === INVALID) {
        return errorResponse(res, 'errors.validation_error', 400, { message: 'partySize must be a positive integer' });
      }
      parsedPartySize = parsed;
    }
    const guest = await prisma.guest.update({
      where: { id: guestId },
      data: {
        name: b.name,
        partySize: parsedPartySize,
        rsvp: b.rsvp,
        dietary: b.dietary,
        note: b.note,
        ...(b.resourceId !== undefined ? { resourceId: await ownedResourceId(restaurantId, b.resourceId) } : {}),
      },
    });
    return successResponse(res, guest);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const deleteGuest = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { guestId } = req.params;
    const existing = await prisma.guest.findFirst({ where: { id: guestId, restaurantId }, select: { id: true } });
    if (!existing) return errorResponse(res, 'errors.not_found', 404);
    await prisma.guest.delete({ where: { id: guestId } });
    return successResponse(res, null, 'Guest deleted');
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// ------------------------------------------------------------ e-davetiye link

// Lazily mint (or, with { regenerate: true }, rotate) the public invitation token
// for an event. The token is the key for the public RSVP microsite; rotating it
// invalidates any previously shared link.
export const generateInvitation = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { id } = req.params;
    const event = await prisma.event.findFirst({ where: { id, restaurantId }, select: { id: true, publicToken: true } });
    if (!event) return errorResponse(res, 'errors.not_found', 404);

    let token = event.publicToken;
    if (!token || req.body?.regenerate === true) {
      token = crypto.randomBytes(24).toString('hex');
      await prisma.event.update({ where: { id }, data: { publicToken: token } });
    }
    return successResponse(res, { publicToken: token });
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// -------------------------------------------------------------- Event vendors

export const getEventVendors = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { eventId } = req.params;
    if (!(await ownedEventId(restaurantId, eventId))) return errorResponse(res, 'errors.not_found', 404);
    const links = await prisma.eventVendor.findMany({
      where: { restaurantId, eventId },
      include: { vendor: { select: { id: true, name: true, category: true, phone: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return successResponse(res, links);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const addEventVendor = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { eventId } = req.params;
    if (!(await ownedEventId(restaurantId, eventId))) return errorResponse(res, 'errors.not_found', 404);

    const { vendorId, role, cost, status, notes } = req.body;
    const ownedVendor = await ownedVendorId(restaurantId, vendorId);
    if (!ownedVendor) return errorResponse(res, 'errors.validation_error', 400, { message: 'Unknown vendor' });
    if (status && !VENDOR_LINK_STATUS.includes(status)) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Invalid status' });
    }
    const parsedCost = parseAmount(cost);
    if (parsedCost === INVALID) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'cost must be a number' });
    }
    // A vendor can only be linked to an event once (schema unique constraint).
    const existing = await prisma.eventVendor.findFirst({ where: { eventId, vendorId: ownedVendor }, select: { id: true } });
    if (existing) return errorResponse(res, 'errors.validation_error', 400, { message: 'Vendor already added to this event' });

    const link = await prisma.eventVendor.create({
      data: {
        restaurantId,
        eventId,
        vendorId: ownedVendor,
        role: role || null,
        cost: parsedCost ?? null,
        status: status || 'PENDING',
        notes: notes || null,
      },
      include: { vendor: { select: { id: true, name: true, category: true, phone: true } } },
    });
    return successResponse(res, link, 'Vendor added', 201);
  } catch (error: any) {
    // The findFirst check above is a fail-fast convenience, not the real guard —
    // EventVendor has @@unique([eventId, vendorId]), so two near-simultaneous
    // "Add vendor" clicks for the same pair can both pass that check and race to
    // this create() call. Without this, the loser got an opaque 500 instead of
    // the same "Vendor already added" message the sequential path returns.
    if (error?.code === 'P2002') {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Vendor already added to this event' });
    }
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const updateEventVendor = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { linkId } = req.params;
    const existing = await prisma.eventVendor.findFirst({ where: { id: linkId, restaurantId }, select: { id: true } });
    if (!existing) return errorResponse(res, 'errors.not_found', 404);

    const b = req.body;
    if (b.status !== undefined && !VENDOR_LINK_STATUS.includes(b.status)) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Invalid status' });
    }
    const parsedCost = parseAmount(b.cost);
    if (parsedCost === INVALID) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'cost must be a number' });
    }
    const link = await prisma.eventVendor.update({
      where: { id: linkId },
      data: {
        role: b.role,
        status: b.status,
        notes: b.notes,
        cost: parsedCost,
      },
      include: { vendor: { select: { id: true, name: true, category: true, phone: true } } },
    });
    return successResponse(res, link);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const removeEventVendor = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { linkId } = req.params;
    const existing = await prisma.eventVendor.findFirst({ where: { id: linkId, restaurantId }, select: { id: true } });
    if (!existing) return errorResponse(res, 'errors.not_found', 404);
    await prisma.eventVendor.delete({ where: { id: linkId } });
    return successResponse(res, null, 'Vendor removed');
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
