import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';

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

    const config = await prisma.waitTimeConfig.upsert({
      where: { restaurantId },
      update: {
        isWaitlistOpen,
        isWaitTimeEnabled,
        isWaitTimeCalculated,
        manualWaitTimeLower,
        manualWaitTimeUpper,
        peopleWaiting,
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
        peopleWaiting,
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
      ? ['SEATED', 'CANCELED', 'NO_SHOW'] 
      : ['WAITING', 'NOTIFIED'];

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

    const entry = await prisma.waitlistEntry.create({
      data: {
        restaurantId,
        customerName,
        customerPhone,
        partySize: parseInt(partySize),
        quotedWaitTime: quotedWaitTime ? parseInt(quotedWaitTime) : null,
        notes
      }
    });

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

    return successResponse(res, entry);
  } catch (error) {
    console.error('Update waitlist status error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
