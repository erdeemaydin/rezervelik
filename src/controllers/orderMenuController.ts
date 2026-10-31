import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { AppError } from '../utils/AppError';
import { logAudit } from '../services/auditService';
import { parseOptionalFiniteNumber } from './orderController';
import {
  effectiveName,
  effectiveDescription,
  effectiveImageUrl,
  effectivePrice,
  effectivePrepTime,
  isOrderItemPaused,
} from '../utils/orderMenu';

// Staff-facing management of the curated online-order catalog —
// /api/orders/order-menu/*. Mounted behind the same stack as the rest of
// orderRoutes.ts (tenantMiddleware + authMiddleware + online-ordering add-on +
// requirePermission('manage_orders')), so req.restaurantId is trustworthy and
// every query below still filters by it explicitly.
//
// The model (plan decision #1): the order menu is *curated from* the main menu,
// never forked. An OrderMenuItem row points at a source MenuItem and carries
// only the online-specific deltas — price/name/description/photo overrides, an
// order-only category + sort position, permanent availability, and a temporary
// pause. Deleting a row removes the item from the online catalog; it never
// touches the restaurant's actual menu.

// ---------------------------------------------------------------------------
// Body parsing helpers
// ---------------------------------------------------------------------------

// The override fields are tri-state on the wire, and the difference matters:
//   field absent  -> leave the column exactly as it is
//   field null/"" -> clear the override (fall back to the source MenuItem)
//   field value   -> set the override
// A plain `?? undefined` read would collapse the first two together and make
// "clear this price override" impossible to express.
const has = (body: any, field: string): boolean =>
  !!body && Object.prototype.hasOwnProperty.call(body, field);

function nullableString(body: any, field: string): string | null | undefined {
  if (!has(body, field)) return undefined;
  const value = body[field];
  if (value === null) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

// Reuses orderController's parseOptionalFiniteNumber for the NaN guard (a
// malformed value must 400, never land in a Float column and poison every
// later total) and layers the explicit-null "clear it" case on top.
function nullableNumber(body: any, field: string): number | null | undefined {
  if (!has(body, field)) return undefined;
  const value = body[field];
  if (value === null || value === '') return null;
  return parseOptionalFiniteNumber(value, field) ?? null;
}

function nullableInt(body: any, field: string): number | null | undefined {
  const parsed = nullableNumber(body, field);
  return parsed == null ? parsed : Math.round(parsed);
}

function optionalBool(body: any, field: string): boolean | undefined {
  if (!has(body, field)) return undefined;
  return Boolean(body[field]);
}

function optionalSortOrder(body: any, field = 'sortOrder'): number | undefined {
  if (!has(body, field)) return undefined;
  const parsed = parseOptionalFiniteNumber(body[field], field);
  return parsed === undefined ? undefined : Math.round(parsed);
}

// An order-only category chosen for an item has to belong to this tenant —
// otherwise a caller could file their items under another restaurant's
// category id and read its name straight back out of the customer menu.
async function assertOwnedOrderCategory(restaurantId: string, orderCategoryId: string): Promise<void> {
  const category = await prisma.orderMenuCategory.findFirst({
    where: { id: orderCategoryId, restaurantId },
    select: { id: true },
  });
  if (!category) {
    throw new AppError('errors.not_found', 404, { orderCategoryId });
  }
}

// ---------------------------------------------------------------------------
// Read: everything the dashboard "Order Menu" window needs in one round trip
// ---------------------------------------------------------------------------

export const getOrderMenu = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const now = new Date();

    const [orderCategories, rows, settings, sourceMenuItems] = await Promise.all([
      prisma.orderMenuCategory.findMany({
        where: { restaurantId },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      prisma.orderMenuItem.findMany({
        where: { restaurantId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: {
          menuItem: {
            select: {
              id: true,
              name: true,
              price: true,
              description: true,
              imageUrl: true,
              isAvailable: true,
              prepTimeMinutes: true,
              order: true,
              category: { select: { id: true, name: true } },
            },
          },
        },
      }),
      prisma.orderSettings.findUnique({ where: { restaurantId }, select: { prepTimeMinutes: true } }),
      // MenuItem has no restaurantId column — scope through category -> menu.
      prisma.menuItem.findMany({
        where: { category: { menu: { restaurantId, isActive: true } } },
        orderBy: [{ category: { order: 'asc' } }, { order: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          price: true,
          category: { select: { id: true, name: true } },
        },
      }),
    ]);

    const defaultPrepTime = settings?.prepTimeMinutes ?? 20;

    const catalog = rows.map((row) => {
      const { menuItem } = row;
      return {
        ...row,
        paused: isOrderItemPaused(row, now),
        effective: {
          name: effectiveName(row, menuItem),
          description: effectiveDescription(row, menuItem),
          imageUrl: effectiveImageUrl(row, menuItem),
          price: effectivePrice(row, menuItem),
          prepTimeMinutes: effectivePrepTime(row, menuItem, defaultPrepTime),
        },
      };
    });

    // Only *listed* rows count as "already in the catalog" — an item that was
    // removed from the online menu but still has a row (isListed = false,
    // overrides preserved) has to stay pickable, otherwise there'd be no way to
    // ever put it back.
    const listedMenuItemIds = new Set(rows.filter((r) => r.isListed).map((r) => r.menuItemId));

    // Human name travels with every id (CLAUDE.md / PROJECT_LOGIC.md §7: an
    // admin dropdown never renders a raw UUID).
    const sourceItems = sourceMenuItems.map((item) => ({
      id: item.id,
      name: item.name,
      price: item.price,
      categoryId: item.category.id,
      categoryName: item.category.name,
      inCatalog: listedMenuItemIds.has(item.id),
    }));

    return successResponse(res, { orderCategories, catalog, sourceItems });
  } catch (error) {
    console.error('[OrderMenu] getOrderMenu error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// ---------------------------------------------------------------------------
// Catalog items
// ---------------------------------------------------------------------------

export const addCatalogItem = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const menuItemId = typeof req.body?.menuItemId === 'string' ? req.body.menuItemId : '';
    if (!menuItemId) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'menuItemId is required' });
    }

    const menuItem = await prisma.menuItem.findFirst({
      where: { id: menuItemId, category: { menu: { restaurantId } } },
      select: { id: true, name: true },
    });
    if (!menuItem) return errorResponse(res, 'errors.not_found', 404);

    // upsert, not create: the item may have been de-listed earlier, and that
    // row still holds the tenant's overrides. Reviving it beats both a unique-
    // constraint 500 and a fresh row that silently drops those overrides.
    const row = await prisma.orderMenuItem.upsert({
      where: { restaurantId_menuItemId: { restaurantId, menuItemId } },
      update: { isListed: true },
      create: { restaurantId, menuItemId, isListed: true },
      include: { menuItem: { select: { id: true, name: true, price: true, category: { select: { id: true, name: true } } } } },
    });

    logAudit({
      req,
      restaurantId,
      category: 'ORDER',
      action: 'ORDER_MENU_ITEM_ADDED',
      targetType: 'OrderMenuItem',
      targetId: row.id,
      targetLabel: menuItem.name,
      metadata: { menuItemId },
    });

    return successResponse(res, row, undefined, 201);
  } catch (error) {
    console.error('[OrderMenu] addCatalogItem error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const updateCatalogItem = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { id } = req.params;
    const body = req.body || {};

    const existing = await prisma.orderMenuItem.findFirst({
      where: { id, restaurantId },
      include: { menuItem: { select: { name: true } } },
    });
    if (!existing) return errorResponse(res, 'errors.not_found', 404);

    const orderCategoryId = has(body, 'orderCategoryId')
      ? (typeof body.orderCategoryId === 'string' && body.orderCategoryId ? body.orderCategoryId : null)
      : undefined;
    if (orderCategoryId) {
      await assertOwnedOrderCategory(restaurantId, orderCategoryId);
    }

    const priceOverride = nullableNumber(body, 'priceOverride');
    const prepTimeMinutes = nullableInt(body, 'prepTimeMinutes');
    const nameOverride = nullableString(body, 'nameOverride');
    const descriptionOverride = nullableString(body, 'descriptionOverride');
    const imageUrlOverride = nullableString(body, 'imageUrlOverride');
    const sortOrder = optionalSortOrder(body);
    const isListed = optionalBool(body, 'isListed');
    const isAvailable = optionalBool(body, 'isAvailable');

    if (priceOverride != null && priceOverride < 0) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'priceOverride cannot be negative' });
    }
    if (prepTimeMinutes != null && prepTimeMinutes < 0) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'prepTimeMinutes cannot be negative' });
    }

    const row = await prisma.orderMenuItem.update({
      where: { id: existing.id },
      data: {
        ...(orderCategoryId !== undefined ? { orderCategoryId } : {}),
        ...(priceOverride !== undefined ? { priceOverride } : {}),
        ...(prepTimeMinutes !== undefined ? { prepTimeMinutes } : {}),
        ...(nameOverride !== undefined ? { nameOverride } : {}),
        ...(descriptionOverride !== undefined ? { descriptionOverride } : {}),
        ...(imageUrlOverride !== undefined ? { imageUrlOverride } : {}),
        ...(sortOrder !== undefined ? { sortOrder } : {}),
        ...(isListed !== undefined ? { isListed } : {}),
        ...(isAvailable !== undefined ? { isAvailable } : {}),
      },
      include: { menuItem: { select: { id: true, name: true, price: true, category: { select: { id: true, name: true } } } } },
    });

    logAudit({
      req,
      restaurantId,
      category: 'ORDER',
      action: 'ORDER_MENU_ITEM_UPDATED',
      targetType: 'OrderMenuItem',
      targetId: row.id,
      targetLabel: existing.menuItem.name,
      metadata: { orderCategoryId, priceOverride, nameOverride, prepTimeMinutes, isListed, isAvailable, sortOrder },
    });

    return successResponse(res, row);
  } catch (error) {
    if (error instanceof AppError) return errorResponse(res, error.code, error.status, error.details);
    console.error('[OrderMenu] updateCatalogItem error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const pauseCatalogItem = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { id } = req.params;
    const body = req.body || {};

    const existing = await prisma.orderMenuItem.findFirst({
      where: { id, restaurantId },
      include: { menuItem: { select: { name: true } } },
    });
    if (!existing) return errorResponse(res, 'errors.not_found', 404);

    if (!has(body, 'pausedUntil') && !has(body, 'pausedIndefinitely')) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'pausedUntil or pausedIndefinitely is required' });
    }

    // The two pause modes are mutually exclusive, so each write sets both
    // columns. Leaving the other one alone is how you end up with an item that
    // reads as "back at 20:00" in the UI while pausedIndefinitely quietly keeps
    // it closed forever.
    let data: { pausedUntil: Date | null; pausedIndefinitely: boolean };
    if (body.pausedIndefinitely === true) {
      data = { pausedUntil: null, pausedIndefinitely: true };
    } else if (has(body, 'pausedUntil') && body.pausedUntil != null && body.pausedUntil !== '') {
      const until = new Date(body.pausedUntil);
      if (Number.isNaN(until.getTime())) {
        return errorResponse(res, 'errors.validation_error', 400, { message: 'pausedUntil must be a valid date' });
      }
      data = { pausedUntil: until, pausedIndefinitely: false };
    } else {
      // { pausedUntil: null, pausedIndefinitely: false } — resume.
      data = { pausedUntil: null, pausedIndefinitely: false };
    }

    const row = await prisma.orderMenuItem.update({ where: { id: existing.id }, data });

    logAudit({
      req,
      restaurantId,
      category: 'ORDER',
      action: data.pausedIndefinitely || data.pausedUntil ? 'ORDER_MENU_ITEM_PAUSED' : 'ORDER_MENU_ITEM_RESUMED',
      targetType: 'OrderMenuItem',
      targetId: row.id,
      targetLabel: existing.menuItem.name,
      metadata: { pausedUntil: data.pausedUntil, pausedIndefinitely: data.pausedIndefinitely },
    });

    return successResponse(res, row);
  } catch (error) {
    console.error('[OrderMenu] pauseCatalogItem error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const removeCatalogItem = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { id } = req.params;

    const existing = await prisma.orderMenuItem.findFirst({
      where: { id, restaurantId },
      include: { menuItem: { select: { name: true } } },
    });
    if (!existing) return errorResponse(res, 'errors.not_found', 404);

    // Hard delete: this drops the item from the online catalog (and its
    // overrides with it). The source MenuItem is untouched — the restaurant's
    // actual menu never changes from this screen.
    await prisma.orderMenuItem.delete({ where: { id: existing.id } });

    logAudit({
      req,
      restaurantId,
      category: 'ORDER',
      action: 'ORDER_MENU_ITEM_REMOVED',
      targetType: 'OrderMenuItem',
      targetId: existing.id,
      targetLabel: existing.menuItem.name,
      metadata: { menuItemId: existing.menuItemId },
    });

    return successResponse(res, { id: existing.id });
  } catch (error) {
    console.error('[OrderMenu] removeCatalogItem error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// ---------------------------------------------------------------------------
// Order-only categories
// ---------------------------------------------------------------------------

export const createOrderCategory = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'name is required' });
    }

    const category = await prisma.orderMenuCategory.create({
      data: { restaurantId, name, sortOrder: optionalSortOrder(req.body) ?? 0 },
    });

    logAudit({
      req,
      restaurantId,
      category: 'ORDER',
      action: 'ORDER_MENU_CATEGORY_CREATED',
      targetType: 'OrderMenuCategory',
      targetId: category.id,
      targetLabel: category.name,
    });

    return successResponse(res, category, undefined, 201);
  } catch (error) {
    if (error instanceof AppError) return errorResponse(res, error.code, error.status, error.details);
    console.error('[OrderMenu] createOrderCategory error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const updateOrderCategory = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { id } = req.params;

    const existing = await prisma.orderMenuCategory.findFirst({ where: { id, restaurantId } });
    if (!existing) return errorResponse(res, 'errors.not_found', 404);

    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : undefined;
    if (name !== undefined && !name) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'name cannot be empty' });
    }

    const category = await prisma.orderMenuCategory.update({
      where: { id: existing.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(has(req.body, 'sortOrder') ? { sortOrder: optionalSortOrder(req.body) ?? 0 } : {}),
      },
    });

    logAudit({
      req,
      restaurantId,
      category: 'ORDER',
      action: 'ORDER_MENU_CATEGORY_UPDATED',
      targetType: 'OrderMenuCategory',
      targetId: category.id,
      targetLabel: category.name,
    });

    return successResponse(res, category);
  } catch (error) {
    if (error instanceof AppError) return errorResponse(res, error.code, error.status, error.details);
    console.error('[OrderMenu] updateOrderCategory error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const deleteOrderCategory = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { id } = req.params;

    const existing = await prisma.orderMenuCategory.findFirst({ where: { id, restaurantId } });
    if (!existing) return errorResponse(res, 'errors.not_found', 404);

    // OrderMenuItem.orderCategoryId is onDelete: SetNull, so items filed here
    // aren't deleted — they fall back to grouping under their source
    // MenuCategory on the customer menu.
    await prisma.orderMenuCategory.delete({ where: { id: existing.id } });

    logAudit({
      req,
      restaurantId,
      category: 'ORDER',
      action: 'ORDER_MENU_CATEGORY_DELETED',
      targetType: 'OrderMenuCategory',
      targetId: existing.id,
      targetLabel: existing.name,
    });

    return successResponse(res, { id: existing.id });
  } catch (error) {
    console.error('[OrderMenu] deleteOrderCategory error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// ---------------------------------------------------------------------------
// Bulk reorder (drag-and-drop save)
// ---------------------------------------------------------------------------

export const reorder = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const categories = Array.isArray(req.body?.categories) ? req.body.categories : [];

    if (!items.length && !categories.length) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'items or categories is required' });
    }

    // Validate every id and category reference up front so a half-valid drag
    // payload can't leave the board partially reordered.
    const itemUpdates: { id: string; sortOrder: number; orderCategoryId?: string | null }[] = [];
    for (const entry of items) {
      if (!entry || typeof entry.id !== 'string') {
        return errorResponse(res, 'errors.validation_error', 400, { message: 'each item needs an id' });
      }
      const sortOrder = optionalSortOrder(entry);
      if (sortOrder === undefined) {
        return errorResponse(res, 'errors.validation_error', 400, { message: 'each item needs a sortOrder' });
      }
      const orderCategoryId = has(entry, 'orderCategoryId')
        ? (typeof entry.orderCategoryId === 'string' && entry.orderCategoryId ? entry.orderCategoryId : null)
        : undefined;
      itemUpdates.push({ id: entry.id, sortOrder, orderCategoryId });
    }

    const categoryUpdates: { id: string; sortOrder: number }[] = [];
    for (const entry of categories) {
      if (!entry || typeof entry.id !== 'string') {
        return errorResponse(res, 'errors.validation_error', 400, { message: 'each category needs an id' });
      }
      const sortOrder = optionalSortOrder(entry);
      if (sortOrder === undefined) {
        return errorResponse(res, 'errors.validation_error', 400, { message: 'each category needs a sortOrder' });
      }
      categoryUpdates.push({ id: entry.id, sortOrder });
    }

    const referencedCategoryIds = [
      ...new Set(itemUpdates.map((u) => u.orderCategoryId).filter((v): v is string => !!v)),
    ];
    if (referencedCategoryIds.length) {
      const owned = await prisma.orderMenuCategory.count({
        where: { id: { in: referencedCategoryIds }, restaurantId },
      });
      if (owned !== referencedCategoryIds.length) {
        return errorResponse(res, 'errors.not_found', 404, { message: 'unknown order category' });
      }
    }

    // updateMany with the restaurantId in the WHERE (rather than update by id)
    // is what keeps a foreign row from being reordered: a non-matching id
    // updates 0 rows instead of touching another tenant's catalog.
    await prisma.$transaction([
      ...itemUpdates.map((u) =>
        prisma.orderMenuItem.updateMany({
          where: { id: u.id, restaurantId },
          data: {
            sortOrder: u.sortOrder,
            ...(u.orderCategoryId !== undefined ? { orderCategoryId: u.orderCategoryId } : {}),
          },
        })
      ),
      ...categoryUpdates.map((u) =>
        prisma.orderMenuCategory.updateMany({
          where: { id: u.id, restaurantId },
          data: { sortOrder: u.sortOrder },
        })
      ),
    ]);

    logAudit({
      req,
      restaurantId,
      category: 'ORDER',
      action: 'ORDER_MENU_REORDERED',
      targetType: 'OrderMenuItem',
      metadata: { items: itemUpdates.length, categories: categoryUpdates.length },
    });

    return successResponse(res, { items: itemUpdates.length, categories: categoryUpdates.length });
  } catch (error) {
    if (error instanceof AppError) return errorResponse(res, error.code, error.status, error.details);
    console.error('[OrderMenu] reorder error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
