import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';

// Resolves each update's payload (either pre-apply EXPLICIT_SET targets
// {id, price}[], or the post-apply snapshot {id, oldPrice, newPrice}[] the
// worker/setItemPrices write once a change lands) into a display-friendly
// `items` array with the current menu item name, best-effort (an item may
// since have been deleted).
async function enrichWithItemNames(updates: { payload: string | null; [k: string]: unknown }[]) {
  const allIds = new Set<string>();
  for (const u of updates) {
    if (!u.payload) continue;
    try {
      for (const it of JSON.parse(u.payload)) if (it?.id) allIds.add(it.id);
    } catch { /* malformed payload, skip */ }
  }
  const items = allIds.size
    ? await prisma.menuItem.findMany({ where: { id: { in: [...allIds] } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(items.map(i => [i.id, i.name]));
  return updates.map(({ payload, ...rest }) => {
    let entries: any[] = [];
    if (payload) {
      try {
        entries = JSON.parse(payload).map((it: any) => ({ ...it, name: nameById.get(it.id) ?? null }));
      } catch { /* malformed payload, skip */ }
    }
    return { ...rest, items: entries };
  });
}

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

    // Restrict to items that actually belong to this restaurant (via category → menu),
    // and keep each item's current price so an immediate apply can be undone later.
    const owned = await prisma.menuItem.findMany({
      where: { id: { in: clean.map(c => c.id) }, category: { menu: { restaurantId } } },
      select: { id: true, price: true }
    });
    const oldPriceById = new Map(owned.map(o => [o.id, o.price]));
    const toUpdate = clean.filter(c => oldPriceById.has(c.id));

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

    // Record the change as an already-applied entry so it shows up in history
    // and can be undone, the same as scheduled changes the worker applies.
    const snapshot = toUpdate.map(c => ({ id: c.id, oldPrice: oldPriceById.get(c.id)!, newPrice: c.price }));
    await prisma.scheduledPriceUpdate.create({
      data: {
        restaurantId,
        updateType: 'EXPLICIT_SET',
        value: 0,
        payload: JSON.stringify(snapshot),
        status: 'APPLIED',
        scheduledFor: new Date(),
        appliedAt: new Date()
      }
    });

    return successResponse(res, { updated: toUpdate.length });
  } catch (error) {
    console.error('Set item prices error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// Pending changes not yet applied by the worker — lets the bulk-price editor
// show and cancel a scheduled change instead of it being a black box.
export const listScheduledPriceUpdates = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const updates = await prisma.scheduledPriceUpdate.findMany({
      where: { restaurantId, status: 'PENDING' },
      orderBy: { scheduledFor: 'asc' }
    });
    return successResponse(res, await enrichWithItemNames(updates));
  } catch (error) {
    console.error('List scheduled price updates error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const cancelScheduledPriceUpdate = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { id } = req.params;
    const update = await prisma.scheduledPriceUpdate.findFirst({ where: { id, restaurantId } });
    if (!update) return errorResponse(res, 'errors.not_found', 404);
    if (update.status !== 'PENDING') {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Only pending changes can be cancelled' });
    }
    const cancelled = await prisma.scheduledPriceUpdate.update({ where: { id }, data: { status: 'CANCELLED' } });
    return successResponse(res, cancelled);
  } catch (error) {
    console.error('Cancel scheduled price update error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// Recently applied (or undone) changes, most recent first — gives the editor
// a change-history view and something to target with undo.
export const getPriceUpdateHistory = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const updates = await prisma.scheduledPriceUpdate.findMany({
      where: { restaurantId, status: { in: ['APPLIED', 'UNDONE'] } },
      orderBy: { appliedAt: 'desc' },
      take: 30
    });
    return successResponse(res, await enrichWithItemNames(updates));
  } catch (error) {
    console.error('Get price update history error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// Reverts an applied change's items back to their pre-change prices, using the
// {id, oldPrice, newPrice}[] snapshot written when the change was applied
// (by the worker or immediately in setItemPrices above).
export const undoPriceUpdate = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { id } = req.params;
    const update = await prisma.scheduledPriceUpdate.findFirst({ where: { id, restaurantId } });
    if (!update) return errorResponse(res, 'errors.not_found', 404);
    if (update.status !== 'APPLIED') {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Only applied changes can be undone' });
    }
    const snapshot: { id: string; oldPrice: number; newPrice: number }[] = update.payload ? JSON.parse(update.payload) : [];
    if (snapshot.length === 0) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Nothing to undo for this change' });
    }
    const owned = await prisma.menuItem.findMany({
      where: { id: { in: snapshot.map(s => s.id) }, category: { menu: { restaurantId } } },
      select: { id: true }
    });
    const ownedIds = new Set(owned.map(o => o.id));
    const toRevert = snapshot.filter(s => ownedIds.has(s.id));

    await prisma.$transaction([
      ...toRevert.map(s => prisma.menuItem.update({ where: { id: s.id }, data: { price: s.oldPrice } })),
      prisma.scheduledPriceUpdate.update({ where: { id }, data: { status: 'UNDONE' } })
    ]);

    return successResponse(res, { undone: toRevert.length });
  } catch (error) {
    console.error('Undo price update error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
