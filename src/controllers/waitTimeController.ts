import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { releaseWaitlistCapacity } from '../utils/waitlistCapacity';
import { INVALID, parseCount } from '../utils/numeric';

export const getWaitTimeConfig = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    let config = await prisma.waitTimeConfig.findUnique({
      where: { restaurantId }
    });

    if (!config) {
      config = await prisma.waitTimeConfig.create({
        data: { restaurantId }
      });
    }

    return successResponse(res, config);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const updateWaitTimeConfig = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { 
      isWaitlistOpen,
      isWaitTimeEnabled,
      isWaitTimeCalculated,
      manualWaitTimeLower,
      manualWaitTimeUpper,
      peopleWaiting,
      waitTimePerPersonLower,
      waitTimePerPersonUpper
    } = req.body;

    let parsedPeopleWaiting: number | undefined;
    if (peopleWaiting !== undefined) {
      const parsed = parseCount(peopleWaiting, 0, 0);
      if (parsed === INVALID) {
        return errorResponse(res, 'errors.validation_error', 400, { message: 'peopleWaiting must be a non-negative integer' });
      }
      parsedPeopleWaiting = parsed;
    }

    const config = await prisma.waitTimeConfig.upsert({
      where: { restaurantId },
      update: {
        isWaitlistOpen,
        isWaitTimeEnabled,
        isWaitTimeCalculated,
        manualWaitTimeLower,
        manualWaitTimeUpper,
        peopleWaiting: parsedPeopleWaiting,
        waitTimePerPersonLower,
        waitTimePerPersonUpper
      },
      create: {
        restaurantId,
        isWaitlistOpen,
        isWaitTimeEnabled,
        isWaitTimeCalculated,
        manualWaitTimeLower,
        manualWaitTimeUpper,
        peopleWaiting: parsedPeopleWaiting,
        waitTimePerPersonLower,
        waitTimePerPersonUpper
      }
    });

    return successResponse(res, config);
  } catch (error) {
    console.error('Update wait time config error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const getWaitlist = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { history } = req.query;

    const statuses = history === 'true' 
      ? ['SEATED', 'CANCELED', 'NO_SHOW', 'ACCEPTED'] 
      : ['WAITING', 'NOTIFIED', 'OFFERED'];

    const waitlist = await prisma.waitlistEntry.findMany({
      where: { 
        restaurantId,
        status: { in: statuses } 
      },
      orderBy: history === 'true' ? { joinedAt: 'desc' } : { joinedAt: 'asc' },
      take: history === 'true' ? 30 : undefined
    });
    return successResponse(res, waitlist);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const joinWaitlist = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { customerName, customerPhone, partySize, quotedWaitTime, notes } = req.body;

    const parsedPartySize = parseCount(partySize, 1, 1);
    if (parsedPartySize === INVALID) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'partySize must be a positive integer' });
    }
    let parsedQuotedWaitTime: number | null = null;
    if (quotedWaitTime) {
      const parsed = parseCount(quotedWaitTime, 0, 0);
      if (parsed === INVALID) {
        return errorResponse(res, 'errors.validation_error', 400, { message: 'quotedWaitTime must be a non-negative integer' });
      }
      parsedQuotedWaitTime = parsed;
    }

    const entry = await prisma.waitlistEntry.create({
      data: {
        restaurantId,
        customerName,
        customerPhone,
        partySize: parsedPartySize,
        quotedWaitTime: parsedQuotedWaitTime,
        notes
      }
    });

    // Bug fix: this staff-facing "add walk-in" endpoint never incremented
    // WaitTimeConfig.peopleWaiting the way the public-facing joinPublicWaitlist
    // (publicController.ts) does — but updateWaitlistStatus's
    // releaseWaitlistCapacity unconditionally DECREMENTS it once this same
    // entry later leaves the active queue (e.g. seated). Mixing staff and
    // public joins (the normal case) systematically drifted the live count
    // low, understating the wait-time quote shown to the next public guest.
    const config = await prisma.waitTimeConfig.findUnique({ where: { restaurantId } });
    if (config?.isWaitTimeCalculated) {
      await prisma.waitTimeConfig.update({
        where: { restaurantId },
        data: { peopleWaiting: { increment: parsedPartySize } },
      });
    }

    return successResponse(res, entry, undefined, 201);
  } catch (error) {
    console.error('Join waitlist error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const updateWaitlistStatus = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { entryId } = req.params;
    const { status } = req.body;

    const existingEntry = await prisma.waitlistEntry.findUnique({ where: { id: entryId } });
    if (!existingEntry || existingEntry.restaurantId !== restaurantId) {
      return errorResponse(res, 'errors.not_found', 404);
    }

    const dataToUpdate: any = { status };
    if (status === 'NOTIFIED') {
      dataToUpdate.notifiedAt = new Date();
      // Placeholder for SMS/WhatsApp Integration
      console.log(`[SMS/WhatsApp Integration] -> Sending message to ${existingEntry.customerPhone}: "Merhaba ${existingEntry.customerName}, in approximately 10 minutes your table is gonna be ready!"`);
    } else if (status === 'SEATED') {
      dataToUpdate.seatedAt = new Date();
    }

    const entry = await prisma.waitlistEntry.update({
      where: { id: entryId },
      data: dataToUpdate
    });

    // If this transition took the entry out of the active queue, the person no
    // longer counts toward the next customer's quoted wait time.
    await releaseWaitlistCapacity({
      restaurantId,
      fromStatus: existingEntry.status,
      toStatus: status,
      partySize: existingEntry.partySize,
      targetDate: existingEntry.targetDate,
    });

    return successResponse(res, entry);
  } catch (error) {
    console.error('Update waitlist status error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const sendOffer = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { entryId } = req.params;
    const { offeredTime, expiresInHours = 2 } = req.body;

    // Bug fix: a non-numeric or negative expiresInHours previously produced
    // an Invalid Date / an offer that was already expired the moment it was
    // created, silently — instead of being rejected outright.
    const parsedExpiresInHours = typeof expiresInHours === 'number' ? expiresInHours : Number(expiresInHours);
    if (!Number.isFinite(parsedExpiresInHours) || parsedExpiresInHours <= 0) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'expiresInHours must be a positive number' });
    }

    const existingEntry = await prisma.waitlistEntry.findUnique({ where: { id: entryId } });
    if (!existingEntry || existingEntry.restaurantId !== restaurantId) {
      return errorResponse(res, 'errors.not_found', 404);
    }

    const offerToken = require('crypto').randomBytes(24).toString('hex');
    const offerExpiresAt = new Date(Date.now() + parsedExpiresInHours * 60 * 60 * 1000);

    const entry = await prisma.waitlistEntry.update({
      where: { id: entryId },
      data: {
        status: 'OFFERED',
        offerToken,
        offerExpiresAt,
        offeredTime
      }
    });

    // NEXT_PUBLIC_APP_URL is a frontend-only env var and is never set on this
    // (backend) process, so it silently fell back to this process's own port —
    // the backend's :3000, not the Next.js frontend's :3001 that actually serves
    // /r/[slug]/offer/[token]. It also interpolated the restaurantId (a UUID)
    // where the route expects the tenant's slug. APP_PUBLIC_URL is the convention
    // used elsewhere for frontend links (see paymentService.ts, staffController.ts).
    const restaurant = await prisma.restaurant.findUnique({ where: { id: existingEntry.restaurantId }, select: { slug: true } });
    const offerUrl = `${process.env.APP_PUBLIC_URL || 'http://localhost:3001'}/r/${restaurant?.slug}/offer/${offerToken}`;
    console.log(`[SMS/Email Integration] -> Sending offer link to ${existingEntry.customerPhone}: "We have an opening at ${offeredTime}! Please accept or decline: ${offerUrl}"`);

    return successResponse(res, entry);
  } catch (error) {
    console.error('Send offer error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
