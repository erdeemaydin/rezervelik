import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { findAvailableTable, restaurantDateStr, getBookedCoversForDate, generateConfirmationCode } from '../utils/reservationConflict';
import { releaseWaitlistCapacity } from '../utils/waitlistCapacity';
import { INVALID, parseCount } from '../utils/numeric';

export const getRestaurantBySlug = async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug },
      include: {
        // Security-audit finding: this was `settings: true` (full row), which
        // leaked internal/staff-only config to an unauthenticated public
        // endpoint — most notably twoFactorEnabled/twoFactorRoles (auth
        // policy reconnaissance) plus other admin-only settings with no
        // public-page use. Allowlist only what the public booking/menu pages
        // (ClassicLayout/PremiumLayout/OldenLayout/GardenLayout, and this
        // controller's own party-size/reservation-enabled checks below)
        // actually consume.
        settings: {
          select: {
            isReservationEnabled: true,
            logic: true,
            defaultDurationMinutes: true,
            isPaidReservationEnabled: true,
            depositAmount: true,
            currency: true,
            maxPartySize: true,
            operatingHours: true,
            openingHour: true,
            closingHour: true,
            timezone: true,
            hasWaitTimeFeature: true,
            hasShiftFeature: true,
            hasMenuFeature: true,
            hasPaymentFeature: true,
            hasEventPipeline: true,
            hasInstallmentPlans: true,
            hasGuestList: true,
            hasVendors: true,
            isVipEnabled: true,
            isCategoriesEnabled: true,
          },
        },
        waitTimeConfig: true,
        customization: true,
        menus: {
          where: { isActive: true },
          include: {
            categories: {
              where: { parentId: null },
              orderBy: { order: 'asc' },
              include: {
                items: {
                  where: { isAvailable: true },
                  orderBy: { order: 'asc' }
                },
                children: {
                  orderBy: { order: 'asc' },
                  include: {
                    items: {
                      where: { isAvailable: true },
                      orderBy: { order: 'asc' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!restaurant) return errorResponse(res, 'errors.restaurant_not_found', 404);
    return successResponse(res, restaurant);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const getDayStatus = async (req: Request, res: Response) => {
  try {
    const { slug, date } = req.query; // YYYY-MM-DD
    if (!slug || !date) return errorResponse(res, 'Missing parameters', 400);

    const restaurant = await prisma.restaurant.findUnique({
      where: { slug: slug as string },
      include: { settings: true }
    });

    if (!restaurant) return errorResponse(res, 'Restaurant not found', 404);

    const daySetting = await prisma.daySetting.findUnique({
      where: {
        restaurantId_date: {
          restaurantId: restaurant.id,
          date: date as string
        }
      }
    });

    // Check if any table is available at all on that day (coarse check)
    const tablesCount = await prisma.bookableResource.count({ where: { restaurantId: restaurant.id } });

    // When the admin has set a total-covers cap for this date, let the public
    // page show the same "may be full" hint it already shows for
    // isFullyBooked, instead of guests only discovering the cap when their
    // booking attempt is rejected.
    let remainingCapacity: number | undefined;
    let isCapacityFull: boolean | undefined;
    if (daySetting?.maxCapacityOverride != null) {
      const booked = await getBookedCoversForDate({
        restaurantId: restaurant.id,
        dateStr: date as string,
        timezone: restaurant.settings?.timezone,
      });
      remainingCapacity = Math.max(0, daySetting.maxCapacityOverride - booked);
      isCapacityFull = remainingCapacity <= 0;
    }

    return successResponse(res, {
      daySetting: daySetting ? {
          isReservationEnabled: daySetting.isReservationEnabled,
          isFullyBooked: daySetting.isFullyBooked,
          autoConfirm: daySetting.autoConfirm,
          maxCapacityOverride: daySetting.maxCapacityOverride,
          remainingCapacity,
          isCapacityFull,
      } : {
          isReservationEnabled: restaurant.settings?.isReservationEnabled ?? true,
          isFullyBooked: false,
          autoConfirm: false,
      },
      hasTables: tablesCount > 0
    });
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const joinPublicWaitlist = async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const { customerName, customerPhone, partySize, targetDate, notes } = req.body;

    const parsedPartySize = parseInt(partySize);
    if (!customerName || !customerPhone || !partySize || !Number.isInteger(parsedPartySize) || parsedPartySize < 1) {
      return errorResponse(res, 'Missing parameters', 400);
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { slug },
      include: { waitTimeConfig: true, settings: true }
    });

    if (!restaurant) return errorResponse(res, 'Restaurant not found', 404);

    // Server-side cap on party size — previously enforced only client-side
    // (a bounded dropdown/bubble buttons), so a direct API call could join
    // the waitlist with an arbitrarily large partySize, inflating
    // `peopleWaiting` and breaking the wait-time quote for every real guest.
    if (restaurant.settings?.maxPartySize && parsedPartySize > restaurant.settings.maxPartySize) {
      return errorResponse(res, 'errors.validation_error', 400, { message: `Party size exceeds the maximum of ${restaurant.settings.maxPartySize}` });
    }

    const config = restaurant.waitTimeConfig;
    const isDateWaitlist = Boolean(targetDate);

    // The date-based "notify me if a table opens up" waitlist (for fully-booked days)
    // is a separate feature from the real-time walk-in queue, and isn't gated by it.
    if (!isDateWaitlist && (!config || !config.isWaitlistOpen)) {
      return errorResponse(res, 'Waitlist is not currently open', 403);
    }

    let quotedWaitTime = null;
    if (!isDateWaitlist && config?.isWaitTimeCalculated) {
      quotedWaitTime = config.peopleWaiting * config.waitTimePerPersonUpper; // Conservative estimate

      // Auto increment the people waiting so the next person gets a higher quote
      await prisma.waitTimeConfig.update({
        where: { id: config.id },
        data: { peopleWaiting: { increment: parsedPartySize } }
      });
    } else if (!isDateWaitlist && config?.manualWaitTimeUpper) {
      quotedWaitTime = config.manualWaitTimeUpper;
    }

    const entry = await prisma.waitlistEntry.create({
      data: {
        restaurantId: restaurant.id,
        customerName,
        customerPhone,
        partySize: parsedPartySize,
        quotedWaitTime,
        status: 'WAITING',
        targetDate: targetDate || null,
        notes: notes || null
      }
    });

    return successResponse(res, entry, undefined, 201);
  } catch (error) {
    console.error('Public join waitlist error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const getOffer = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    // Display-safe payload only — the previous version returned the raw row,
    // including customerPhone and notes (a free-text field that mixes the
    // guest's own text with staff-appended notes like "- Offer declined by
    // customer"), to anyone holding the link. Select only what the public
    // offer page actually renders.
    const entry = await prisma.waitlistEntry.findUnique({
      where: { offerToken: token },
      select: {
        customerName: true,
        partySize: true,
        targetDate: true,
        offeredTime: true,
        offerExpiresAt: true,
        status: true,
        restaurant: { select: { slug: true, name: true } },
      },
    });

    if (!entry) return errorResponse(res, 'Offer not found or invalid', 404);

    // Check if expired
    if (entry.offerExpiresAt && new Date() > entry.offerExpiresAt) {
      return errorResponse(res, 'This offer has expired', 400);
    }

    if (entry.status !== 'OFFERED') {
      return errorResponse(res, 'This offer is no longer available', 400);
    }

    return successResponse(res, entry);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const acceptOffer = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    
    const entry = await prisma.waitlistEntry.findUnique({
      where: { offerToken: token }
    });

    if (!entry) return errorResponse(res, 'Offer not found', 404);
    if (entry.status !== 'OFFERED') return errorResponse(res, 'Offer no longer available', 400);
    if (entry.offerExpiresAt && new Date() > entry.offerExpiresAt) return errorResponse(res, 'Offer expired', 400);

    const settings = await prisma.restaurantSettings.findUnique({ where: { restaurantId: entry.restaurantId } });

    // entry.targetDate is only set for the date-based "notify me if a table opens
    // up" waitlist. A real-time walk-in entry (joinPublicWaitlist with no
    // targetDate) has it as null — sendOffer never required one before marking an
    // entry OFFERED, so this built the literal string "nullT19:00:00+03:00" (an
    // invalid date) and threw here, 500ing on every walk-in offer acceptance.
    const effectiveDate = entry.targetDate || restaurantDateStr(new Date(), settings?.timezone);

    // Create a real reservation
    const startTimeStr = entry.offeredTime ? `${effectiveDate}T${entry.offeredTime}:00+03:00` : `${effectiveDate}T19:00:00+03:00`;
    const start = new Date(startTimeStr);
    const end = new Date(start.getTime() + (settings?.defaultDurationMinutes || 90) * 60000);

    // Same total-covers cap createReservation enforces for the public booking
    // path — a waitlist offer must not be able to push a capacity-capped day
    // (e.g. a private event) over its limit just because it came in through a
    // different code path.
    const daySetting = await prisma.daySetting.findUnique({
      where: { restaurantId_date: { restaurantId: entry.restaurantId, date: effectiveDate } },
    });

    let reservation;
    try {
      // Retried (fresh claim/capacity/table checks each attempt) on a
      // confirmationCode collision, same pattern as createReservation.
      const MAX_CODE_ATTEMPTS = 5;
      for (let attempt = 1; ; attempt++) {
        const confirmationCode = generateConfirmationCode();
        try {
          reservation = await prisma.$transaction(async (tx) => {
            // Atomically claim the offer before doing anything else. The pre-checks
            // above (status !== 'OFFERED', expiry) are a fail-fast convenience, not
            // the real guard — a double-tap or two tabs hitting Accept at once could
            // both pass them and each create a reservation + double-decrement
            // waitlist capacity. Only the request that actually flips
            // OFFERED -> ACCEPTED here proceeds to seat it.
            const claimed = await tx.waitlistEntry.updateMany({
              where: { id: entry.id, status: 'OFFERED' },
              data: { status: 'ACCEPTED' },
            });
            if (claimed.count === 0) {
              throw Object.assign(new Error('OFFER_ALREADY_HANDLED'), { code: 'OFFER_ALREADY_HANDLED' });
            }

            if (daySetting?.maxCapacityOverride != null) {
              const booked = await getBookedCoversForDate({
                restaurantId: entry.restaurantId, dateStr: effectiveDate, timezone: settings?.timezone, tx,
              });
              if (booked + entry.partySize > daySetting.maxCapacityOverride) {
                throw Object.assign(new Error('DAY_CAPACITY_EXCEEDED'), { code: 'DAY_CAPACITY_EXCEEDED' });
              }
            }

            // Try to seat the offer on a free table; leave unassigned for staff if none.
            const table = await findAvailableTable({
              restaurantId: entry.restaurantId, partySize: entry.partySize, start, end, tx,
              isManualAvailability: settings?.logic === 'MANUAL_AVAILABILITY',
            });
            const created = await tx.reservation.create({
              data: {
                restaurantId: entry.restaurantId,
                tableId: table?.id ?? null,
                customerName: entry.customerName,
                customerPhone: entry.customerPhone,
                guestCount: entry.partySize,
                startTime: start,
                endTime: end,
                // Only actually confirm when a table was really assigned — same
                // rule createReservation uses. If nothing's free (something
                // changed between the offer being sent and accepted), this stays
                // PENDING/unassigned for staff to resolve manually instead of
                // overpromising a seat that isn't there.
                status: table ? 'CONFIRMED' : 'PENDING',
                confirmationCode,
                notes: 'Converted from Waitlist Offer'
              }
            });
            await releaseWaitlistCapacity({
              restaurantId: entry.restaurantId,
              fromStatus: entry.status,
              toStatus: 'ACCEPTED',
              partySize: entry.partySize,
              targetDate: entry.targetDate,
              tx,
            });
            return created;
          });
          break;
        } catch (innerErr: any) {
          const isCodeCollision = innerErr?.code === 'P2002' && innerErr?.meta?.target?.includes?.('confirmationCode');
          if (isCodeCollision && attempt < MAX_CODE_ATTEMPTS) continue;
          throw innerErr;
        }
      }
    } catch (txErr: any) {
      if (txErr?.code === 'OFFER_ALREADY_HANDLED') {
        return errorResponse(res, 'Offer no longer available', 400);
      }
      if (txErr?.code === 'DAY_CAPACITY_EXCEEDED') {
        return errorResponse(res, 'errors.day_capacity_exceeded', 409, { code: 'DAY_CAPACITY_EXCEEDED' });
      }
      throw txErr;
    }

    return successResponse(res, { message: 'Offer accepted', confirmationCode: reservation.confirmationCode });
  } catch (error) {
    console.error('Accept offer error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const declineOffer = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    
    const entry = await prisma.waitlistEntry.findUnique({
      where: { offerToken: token }
    });

    if (!entry) return errorResponse(res, 'Offer not found', 404);
    if (entry.status !== 'OFFERED') return errorResponse(res, 'Offer no longer available', 400);

    await prisma.waitlistEntry.update({
      where: { id: entry.id },
      data: { status: 'CANCELED', notes: (entry.notes || '') + ' - Offer declined by customer' }
    });

    return successResponse(res, { message: 'Offer declined' });
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// ----------------------------------------------- e-davetiye (invitation microsite)

const RSVP_VALUES = ['PENDING', 'YES', 'NO', 'MAYBE'];

// Public read for the invitation page. Keyed by the event's shareable token; only
// display-safe fields are returned (never financials, notes, or the guest list).
export const getInvitation = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const event = await prisma.event.findUnique({
      where: { publicToken: token },
      include: {
        restaurant: { select: { name: true, slug: true, customization: true } },
        resource: { select: { identifier: true } },
      },
    });
    if (!event) return errorResponse(res, 'errors.not_found', 404);

    return successResponse(res, {
      eventType: event.eventType,
      clientName: event.clientName,
      eventDate: event.eventDate,
      slot: event.slot,
      venueName: event.venueName || event.resource?.identifier || null,
      venueAddress: event.venueAddress,
      invitationMessage: event.invitationMessage,
      restaurant: { name: event.restaurant.name, slug: event.restaurant.slug },
      customization: event.restaurant.customization,
    });
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// Public RSVP submission. Adds the responder to the event's guest list (or updates
// a prior response with the same name), stamping respondedAt so staff can tell
// self-serve replies from ones they entered.
export const submitInvitationRsvp = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const { name, partySize, rsvp, dietary, note } = req.body;
    if (!name) return errorResponse(res, 'errors.validation_error', 400, { message: 'name is required' });
    if (rsvp && !RSVP_VALUES.includes(rsvp)) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Invalid rsvp' });
    }
    // Bug fix: Math.max(1, parseInt(partySize)) returns NaN (not 1) when
    // partySize is a non-numeric truthy string, since Math.max with a NaN
    // operand is always NaN — that NaN then hit Guest.partySize (an Int
    // column) and threw an unhandled Prisma error (500) instead of a clean
    // 400.
    const size = parseCount(partySize, 1, 1);
    if (size === INVALID) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'partySize must be a positive integer' });
    }

    const event = await prisma.event.findUnique({
      where: { publicToken: token },
      select: { id: true, restaurantId: true },
    });
    if (!event) return errorResponse(res, 'errors.not_found', 404);
    const normalizedName = name.trim();

    // Deduplicate on the responder's name so a repeat RSVP updates, not stacks
    // — a double-tap submit or two people on the same shared family device
    // must not create two Guest rows for one person. This is deliberately NOT
    // a DB-level unique constraint on (eventId, name): staff manage their own
    // guest list separately (createGuest) and can legitimately add multiple
    // real guests who share a name. Instead, take a Postgres advisory lock
    // scoped to this (event, normalized name) pair for the transaction's
    // duration, so a concurrent submission blocks until the first commits and
    // then sees the just-created row instead of racing past the same check.
    await prisma.$transaction(async (tx) => {
      const lockKey = `${event.id}:${normalizedName.toLowerCase()}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

      const existing = await tx.guest.findFirst({
        where: { eventId: event.id, name: { equals: normalizedName, mode: 'insensitive' } },
        select: { id: true },
      });

      if (existing) {
        await tx.guest.update({
          where: { id: existing.id },
          data: {
            partySize: size,
            rsvp: rsvp || 'YES',
            dietary: dietary || null,
            note: note || null,
            respondedAt: new Date(),
          },
        });
      } else {
        await tx.guest.create({
          data: {
            restaurantId: event.restaurantId,
            eventId: event.id,
            name: normalizedName,
            partySize: size,
            rsvp: rsvp || 'YES',
            dietary: dietary || null,
            note: note || null,
            respondedAt: new Date(),
          },
        });
      }
    });
    return successResponse(res, { message: 'RSVP received' });
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
