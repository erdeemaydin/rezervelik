import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { processMenuImage } from '../services/aiMenuService';

// GET MENUS
export const getMenus = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const menus = await prisma.menu.findMany({
      where: { restaurantId },
      include: {
        categories: {
          where: { parentId: null },
          orderBy: { order: 'asc' },
          include: {
            items: { orderBy: { order: 'asc' } },
            children: {
              orderBy: { order: 'asc' },
              include: {
                items: { orderBy: { order: 'asc' } },
                children: {
                  orderBy: { order: 'asc' },
                  include: { items: { orderBy: { order: 'asc' } } }
                }
              }
            }
          }
        }
      }
    });
    return successResponse(res, menus);
  } catch (error) {
    console.error(error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// MENU CRUD
export const createMenu = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { name, isActive, footnotes } = req.body;
    // Only one menu may be live at a time — creating an active menu takes the others offline.
    // The check-then-write below is a best-effort app-level guard; the DB-level partial unique
    // index Menu_restaurantId_active_unique is the actual source of truth under concurrent requests.
    const menu = await prisma.$transaction(async (tx) => {
      if (isActive) {
        await tx.menu.updateMany({ where: { restaurantId }, data: { isActive: false } });
      }
      return tx.menu.create({ data: { restaurantId, name, isActive, footnotes } });
    });
    return successResponse(res, menu, undefined, 201);
  } catch (error) {
    if (isUniqueActiveMenuViolation(error)) {
      return errorResponse(res, 'errors.menu_activation_conflict', 409);
    }
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const updateMenu = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { id } = req.params;
    const { name, isActive, footnotes } = req.body;
    // Enforce a single live menu: activating one deactivates the rest for this tenant.
    // Same caveat as createMenu — the DB constraint is what actually prevents two active
    // menus under a race; this transaction just makes the common case atomic and fast-failing.
    const menu = await prisma.$transaction(async (tx) => {
      if (isActive === true) {
        await tx.menu.updateMany({
          where: { restaurantId, id: { not: id } },
          data: { isActive: false }
        });
      }
      // Security-audit finding: `where: { id }` alone let any tenant admin rename/
      // activate/deactivate ANY other tenant's menu by guessing its id. Scoping by
      // restaurantId too means a foreign id matches zero rows -> Prisma throws
      // "Record not found" (P2025), caught below as a 404.
      return tx.menu.update({ where: { id, restaurantId }, data: { name, isActive, footnotes } });
    });
    return successResponse(res, menu);
  } catch (error) {
    if (isUniqueActiveMenuViolation(error)) {
      return errorResponse(res, 'errors.menu_activation_conflict', 409);
    }
    if (isRecordNotFound(error)) {
      return errorResponse(res, 'errors.not_found', 404);
    }
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// Prisma P2002 (unique constraint violation). The only unique constraint touched by
// createMenu/updateMenu besides the uuid PK is the partial index that backs "only one
// active menu per restaurant" — a PK collision on a fresh uuid is not realistically
// possible, so any P2002 here means two requests raced past the app-level check above.
const isUniqueActiveMenuViolation = (error: unknown): boolean =>
  !!error && typeof error === 'object' && (error as any).code === 'P2002';

// Prisma P2025 ("An operation failed because it depends on one or more records
// that were required but not found") — thrown by update/delete when the
// compound where (id + a tenant/ownership filter) matches zero rows. Used
// throughout this file to turn a cross-tenant id guess into a clean 404
// instead of a raw 500.
const isRecordNotFound = (error: unknown): boolean =>
  !!error && typeof error === 'object' && (error as any).code === 'P2025';

export const deleteMenu = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { id } = req.params;
    // Security-audit finding: this had no restaurantId scoping at all — any
    // tenant admin could delete any other tenant's menu by id.
    await prisma.menu.delete({ where: { id, restaurantId } });
    return successResponse(res, null, 'Menu deleted');
  } catch (error) {
    if (isRecordNotFound(error)) {
      return errorResponse(res, 'errors.not_found', 404);
    }
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// MenuCategory/MenuItem have no direct restaurantId column (only reachable via
// menu.restaurantId / category.menu.restaurantId), so ownership can't be
// folded into Prisma's compound whereUnique the way Menu can above — verify
// with an explicit findFirst before mutating, same pattern floorElementController
// already uses for its own nested-ownership checks.
async function findOwnedCategory(id: string, restaurantId: string) {
  return prisma.menuCategory.findFirst({ where: { id, menu: { restaurantId } } });
}

async function findOwnedMenuItem(id: string, restaurantId: string) {
  return prisma.menuItem.findFirst({ where: { id, category: { menu: { restaurantId } } } });
}

// CATEGORY CRUD
export const createCategory = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { menuId, name, description, imageUrl, order, parentId } = req.body;

    if (!menuId || !name) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'menuId and name are required' });
    }

    // Security-audit finding: menuId was trusted straight from the request body
    // with zero ownership check — any tenant could attach a category to
    // another tenant's menu.
    const menu = await prisma.menu.findFirst({ where: { id: menuId, restaurantId } });
    if (!menu) return errorResponse(res, 'errors.validation_error', 400, { message: 'Invalid menuId' });

    if (parentId) {
      // The parent must belong to the SAME menu — otherwise a category could be
      // nested under a completely unrelated (or foreign-tenant) menu's tree.
      const parent = await prisma.menuCategory.findFirst({ where: { id: parentId, menuId } });
      if (!parent) return errorResponse(res, 'errors.validation_error', 400, { message: 'Invalid parentId' });
    }

    const category = await prisma.menuCategory.create({
      data: { menuId, name, description, imageUrl, order: order || 0, parentId: parentId || null }
    });
    return successResponse(res, category, undefined, 201);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const updateCategory = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { id } = req.params;
    const { name, description, imageUrl, order, parentId } = req.body;

    const existing = await findOwnedCategory(id, restaurantId);
    if (!existing) return errorResponse(res, 'errors.not_found', 404);

    if (parentId !== undefined && parentId !== null) {
      if (parentId === id) {
        return errorResponse(res, 'errors.validation_error', 400, { message: 'A category cannot be its own parent' });
      }
      // Must stay within the same menu, and must not be one of this category's
      // own descendants (would create a cycle in the parentId self-relation).
      const candidateParent = await prisma.menuCategory.findFirst({ where: { id: parentId, menuId: existing.menuId } });
      if (!candidateParent) return errorResponse(res, 'errors.validation_error', 400, { message: 'Invalid parentId' });

      let cursor: string | null = candidateParent.parentId;
      for (let depth = 0; cursor && depth < 20; depth++) {
        if (cursor === id) {
          return errorResponse(res, 'errors.validation_error', 400, { message: 'This would create a category cycle' });
        }
        const ancestor: { parentId: string | null } | null = await prisma.menuCategory.findUnique({ where: { id: cursor }, select: { parentId: true } });
        cursor = ancestor?.parentId ?? null;
      }
    }

    const category = await prisma.menuCategory.update({
      where: { id },
      data: { name, description, imageUrl, order, parentId }
    });
    return successResponse(res, category);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const deleteCategory = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { id } = req.params;

    const existing = await findOwnedCategory(id, restaurantId);
    if (!existing) return errorResponse(res, 'errors.not_found', 404);

    // Children cascade via the schema's onDelete rules.
    await prisma.menuCategory.delete({ where: { id } });
    return successResponse(res, null, 'Category deleted');
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

const parsePrice = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : parseFloat(value as string);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

// MENU ITEM CRUD
export const createMenuItem = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    // categoryId comes from the body, not req.params — this route is the flat
    // POST /items (no :categoryId in its path); reading it from req.params
    // meant it was always undefined here, so every create silently 400'd as
    // "Invalid categoryId" regardless of what was actually sent.
    const { categoryId, name, description, price, imageUrl, isAvailable, order, dietaryTags, allergens, spiceLevel, ingredients, calories, containsAlcohol, containsPork, durationMinutes } = req.body;

    // Security-audit finding: categoryId (from the request) was never checked
    // to belong to the caller's tenant — any tenant could attach an item to
    // another tenant's category.
    const category = await findOwnedCategory(categoryId, restaurantId);
    if (!category) return errorResponse(res, 'errors.validation_error', 400, { message: 'Invalid categoryId' });

    const parsedPrice = parsePrice(price);
    if (parsedPrice === null) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'price must be a non-negative number' });
    }

    const item = await prisma.menuItem.create({
      data: {
        categoryId, name, description, price: parsedPrice,
        imageUrl, isAvailable, order: order || 0,
        dietaryTags, allergens, spiceLevel: spiceLevel ? parseInt(spiceLevel) : 0,
        ingredients, calories: calories ? parseInt(calories) : null,
        durationMinutes: durationMinutes ? parseInt(durationMinutes) : null,
        containsAlcohol: containsAlcohol === true || containsAlcohol === 'true',
        containsPork: containsPork === true || containsPork === 'true'
      }
    });
    return successResponse(res, item, undefined, 201);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const updateMenuItem = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { id } = req.params;
    const { categoryId, name, description, price, imageUrl, isAvailable, order, dietaryTags, allergens, spiceLevel, ingredients, calories, containsAlcohol, containsPork, durationMinutes } = req.body;

    const existing = await findOwnedMenuItem(id, restaurantId);
    if (!existing) return errorResponse(res, 'errors.not_found', 404);

    let parsedPrice: number | undefined;
    if (price !== undefined) {
      const p = parsePrice(price);
      if (p === null) return errorResponse(res, 'errors.validation_error', 400, { message: 'price must be a non-negative number' });
      parsedPrice = p;
    }

    if (categoryId !== undefined) {
      // Reassigning an item into a category outside the caller's tenant would
      // move it into another tenant's menu.
      const targetCategory = await findOwnedCategory(categoryId, restaurantId);
      if (!targetCategory) return errorResponse(res, 'errors.validation_error', 400, { message: 'Invalid categoryId' });
    }

    const item = await prisma.menuItem.update({
      where: { id },
      data: {
        categoryId, name, description, price: parsedPrice,
        imageUrl, isAvailable, order,
        dietaryTags, allergens, spiceLevel: spiceLevel !== undefined ? parseInt(spiceLevel) : undefined,
        ingredients, calories: calories !== undefined ? (calories ? parseInt(calories) : null) : undefined,
        durationMinutes: durationMinutes !== undefined ? (durationMinutes ? parseInt(durationMinutes) : null) : undefined,
        containsAlcohol: containsAlcohol !== undefined ? (containsAlcohol === true || containsAlcohol === 'true') : undefined,
        containsPork: containsPork !== undefined ? (containsPork === true || containsPork === 'true') : undefined
      }
    });
    return successResponse(res, item);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const deleteMenuItem = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { id } = req.params;

    const existing = await findOwnedMenuItem(id, restaurantId);
    if (!existing) return errorResponse(res, 'errors.not_found', 404);

    await prisma.menuItem.delete({ where: { id } });
    return successResponse(res, null, 'Item deleted');
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// IMPORT
export const importMenuFromImage = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { imageUrl, menuName } = req.body;

    if (!imageUrl) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Image URL is required' });
    }

    const aiParsedMenu = await processMenuImage(imageUrl, restaurantId);

    const menu = await prisma.menu.create({
      data: {
        name: menuName || 'Imported Menu',
        restaurantId,
        // Imported menus start as drafts — staff must explicitly activate one via
        // updateMenu, which is the only path that correctly deactivates the rest.
        isActive: false,
        categories: {
          create: aiParsedMenu.categories.map(category => ({
            name: category.name,
            items: {
              create: category.items.map(item => ({
                name: item.name,
                description: item.description,
                price: item.price
              }))
            }
          }))
        }
      },
      include: {
        categories: {
          include: { items: true }
        }
      }
    });

    return successResponse(res, menu, undefined, 201);
  } catch (error) {
    console.error('Import menu error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};