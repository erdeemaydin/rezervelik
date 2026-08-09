import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';

// Security-audit finding: `value` was parseFloat'd with no isNaN guard and
// `updateType` was never checked against its two valid values. A non-numeric
// `value` (or a typo'd updateType, which the worker's if/else chain silently
// ignores, applying neither PERCENTAGE nor FIXED_AMOUNT math and leaving
// every price untouched) reached the worker as-is; for a bad `value`
// specifically, the worker's `item.price ± NaN` computes NaN for every menu
// item in the tenant, and Postgres' float type happily stores NaN — a
// scheduled job that "succeeds" (status: APPLIED) while silently corrupting
// every price in the tenant.
const VALID_UPDATE_TYPES = ['PERCENTAGE', 'FIXED_AMOUNT'];

export const bulkUpdatePrices = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { updateType, value, isIncrease, scheduledFor } = req.body;

    if (!updateType || value === undefined || isIncrease === undefined) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Missing parameters' });
    }
    if (!VALID_UPDATE_TYPES.includes(updateType)) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'updateType must be PERCENTAGE or FIXED_AMOUNT' });
    }
    const parsedValue = typeof value === 'number' ? value : parseFloat(value);
    if (!Number.isFinite(parsedValue) || parsedValue < 0) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'value must be a non-negative number' });
    }
    if (typeof isIncrease !== 'boolean') {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'isIncrease must be a boolean' });
    }

    // If scheduledFor is not provided, apply immediately by setting it to now
    let targetDate = new Date();
    if (scheduledFor) {
      targetDate = new Date(scheduledFor);
      if (isNaN(targetDate.getTime())) {
        return errorResponse(res, 'errors.validation_error', 400, { message: 'Invalid schedule date' });
      }
    }

    const update = await prisma.scheduledPriceUpdate.create({
      data: {
        restaurantId,
        updateType,
        value: parsedValue,
        isIncrease,
        scheduledFor: targetDate
      }
    });

    // If it's immediate, the background worker will pick it up within 60 seconds
    return successResponse(res, update, undefined, 201);
  } catch (error) {
    console.error('Bulk update prices error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// Applies an explicit new price to individual menu items (from the bulk-price
// editor, where the admin reviews/tweaks each computed value before saving).
// Only items whose price actually changed are sent by the client; anything
// omitted keeps its old price. Every id is verified to belong to this tenant.
export const setItemPrices = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { items, scheduledFor } = req.body as { items?: { id: string; price: number }[]; scheduledFor?: string };

    if (!Array.isArray(items) || items.length === 0) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'No items provided' });
    }

    // Normalize + validate the payload up front.
    const clean: { id: string; price: number }[] = [];
    for (const it of items) {
      const price = typeof it.price === 'number' ? it.price : parseFloat(it.price as any);
      if (!it.id || isNaN(price) || price < 0) {
        return errorResponse(res, 'errors.validation_error', 400, { message: 'Invalid item price' });
      }
      clean.push({ id: it.id, price });
    }

    // Restrict to items that actually belong to this restaurant (via category → menu).
    const owned = await prisma.menuItem.findMany({
      where: { id: { in: clean.map(c => c.id) }, category: { menu: { restaurantId } } },
      select: { id: true }
    });
    const ownedIds = new Set(owned.map(o => o.id));
    const toUpdate = clean.filter(c => ownedIds.has(c.id));

    if (toUpdate.length === 0) {
      return errorResponse(res, 'errors.not_found', 404, { message: 'No matching menu items' });
    }

    // Scheduled for a future time: store the target prices for the worker to apply
    // later instead of changing them now.
    if (scheduledFor) {
      const when = new Date(scheduledFor);
      if (isNaN(when.getTime())) {
        return errorResponse(res, 'errors.validation_error', 400, { message: 'Invalid schedule date' });
      }
      if (when.getTime() > Date.now() + 60 * 1000) {
        const scheduled = await prisma.scheduledPriceUpdate.create({
          data: {
            restaurantId,
            updateType: 'EXPLICIT_SET',
            value: 0,
            payload: JSON.stringify(toUpdate),
            scheduledFor: when
          }
        });
        return successResponse(res, { scheduled: true, scheduledFor: when, count: toUpdate.length, id: scheduled.id }, undefined, 201);
      }
    }

    await prisma.$transaction(
      toUpdate.map(c => prisma.menuItem.update({ where: { id: c.id }, data: { price: c.price } }))
    );

    return successResponse(res, { updated: toUpdate.length });
  } catch (error) {
    console.error('Set item prices error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
