import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';

export const getDaySettings = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const settings = await prisma.daySetting.findMany({
      where: { restaurantId },
      orderBy: { date: 'asc' }
    });
    return successResponse(res, settings);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

const isPositiveInt = (n: unknown): n is number => Number.isInteger(n) && (n as number) > 0;

/**
 * Validates + resolves the overbooking-override trio shared by the single and
 * bulk day-setting endpoints (see PROJECT_LOGIC.md / getEffectiveOverbookingConfig).
 * Enabling the override for a day requires both of its own caps — the toggle
 * doesn't partially inherit from the restaurant default. Disabling it (or
 * leaving it unset, i.e. inherit) needs no caps.
 */
function resolveOverbookingOverride(body: any): { error: string } | { coversOverrideValue: number | null | undefined; reservationsOverrideValue: number | null | undefined } {
  const { allowOverbookingOverride, overbookingMaxExtraCoversOverride, overbookingMaxExtraReservationsOverride } = body;

  if (allowOverbookingOverride === true) {
    const covers = parseInt(overbookingMaxExtraCoversOverride);
    const reservations = parseInt(overbookingMaxExtraReservationsOverride);
    if (!isPositiveInt(covers) || !isPositiveInt(reservations)) {
      return { error: 'Enabling the overbooking override requires both overbookingMaxExtraCoversOverride and overbookingMaxExtraReservationsOverride as positive integers.' };
    }
    return { coversOverrideValue: covers, reservationsOverrideValue: reservations };
  }
  if (allowOverbookingOverride === false) {
    // Explicitly disabled — clear any stale override caps.
    return { coversOverrideValue: null, reservationsOverrideValue: null };
  }
  // null/undefined: inherit the restaurant default, leave any stored override
  // caps untouched (Prisma skips undefined fields on update).
  return { coversOverrideValue: undefined, reservationsOverrideValue: undefined };
}

export const upsertDaySetting = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const {
      date, eventTitle, isReservationEnabled, isFullyBooked, autoConfirm, maxCapacityOverride,
      allowOverbookingOverride
    } = req.body;

    if (!date) return errorResponse(res, 'errors.validation_error', 400, { message: 'Date is required' });

    const resolved = resolveOverbookingOverride(req.body);
    if ('error' in resolved) {
      return errorResponse(res, 'errors.validation_error', 400, { message: resolved.error });
    }
    const { coversOverrideValue, reservationsOverrideValue } = resolved;

    const setting = await prisma.daySetting.upsert({
      where: {
        restaurantId_date: { restaurantId, date }
      },
      update: {
        eventTitle,
        isReservationEnabled,
        isFullyBooked: isFullyBooked ?? false,
        autoConfirm,
        maxCapacityOverride,
        allowOverbookingOverride,
        overbookingMaxExtraCoversOverride: coversOverrideValue,
        overbookingMaxExtraReservationsOverride: reservationsOverrideValue
      },
      create: {
        restaurantId,
        date,
        eventTitle,
        isReservationEnabled,
        isFullyBooked: isFullyBooked ?? false,
        autoConfirm,
        maxCapacityOverride,
        allowOverbookingOverride,
        overbookingMaxExtraCoversOverride: coversOverrideValue,
        overbookingMaxExtraReservationsOverride: reservationsOverrideValue
      }
    });

    return successResponse(res, setting);
  } catch (error) {
    console.error('Upsert day setting error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const bulkUpsertDaySettings = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { dates, eventTitle, isReservationEnabled, isFullyBooked, autoConfirm, allowOverbookingOverride } = req.body;

    if (!dates || !Array.isArray(dates)) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Dates array is required' });
    }

    const resolved = resolveOverbookingOverride(req.body);
    if ('error' in resolved) {
      return errorResponse(res, 'errors.validation_error', 400, { message: resolved.error });
    }
    const { coversOverrideValue, reservationsOverrideValue } = resolved;

    const operations = dates.map(date =>
      prisma.daySetting.upsert({
        where: { restaurantId_date: { restaurantId, date } },
        update: {
          eventTitle, isReservationEnabled, isFullyBooked: isFullyBooked ?? false, autoConfirm,
          allowOverbookingOverride,
          overbookingMaxExtraCoversOverride: coversOverrideValue,
          overbookingMaxExtraReservationsOverride: reservationsOverrideValue
        },
        create: {
          restaurantId, date, eventTitle, isReservationEnabled, isFullyBooked: isFullyBooked ?? false, autoConfirm,
          allowOverbookingOverride,
          overbookingMaxExtraCoversOverride: coversOverrideValue,
          overbookingMaxExtraReservationsOverride: reservationsOverrideValue
        }
      })
    );

    await Promise.all(operations);
    return successResponse(res, null, 'Bulk settings applied');
  } catch (error) {
    console.error('Bulk upsert error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const deleteDaySetting = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { date } = req.params;

    await prisma.daySetting.delete({
      where: {
        restaurantId_date: { restaurantId, date }
      }
    });

    return successResponse(res, null, 'Day setting deleted');
  } catch (error: any) {
    // Bug fix: deleting a date with no existing DaySetting row threw Prisma
    // P2025 (record not found), which fell through to a raw 500.
    if (error?.code === 'P2025') {
      return errorResponse(res, 'errors.not_found', 404);
    }
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
