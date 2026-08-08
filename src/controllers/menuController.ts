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
      return tx.menu.update({ where: { id }, data: { name, isActive, footnotes } });
    });
    return successResponse(res, menu);
  } catch (error) {
    if (isUniqueActiveMenuViolation(error)) {
      return errorResponse(res, 'errors.menu_activation_conflict', 409);
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

export const deleteMenu = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.menu.delete({ where: { id } });
    return successResponse(res, null, 'Menu deleted');
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// CATEGORY CRUD
export const createCategory = async (req: Request, res: Response) => {
  try {
    const { menuId, name, description, imageUrl, order, parentId } = req.body;
    const category = await prisma.menuCategory.create({
      data: { menuId, name, description, imageUrl, order: order || 0, parentId }
    });
    return successResponse(res, category, undefined, 201);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const updateCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, imageUrl, order, parentId } = req.body;
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
    const { id } = req.params;
    // Children cascade via the schema's onDelete rules.
    await prisma.menuCategory.delete({ where: { id } });
    return successResponse(res, null, 'Category deleted');
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// MENU ITEM CRUD
export const createMenuItem = async (req: Request, res: Response) => {
  try {
    const { categoryId } = req.params;
    const { name, description, price, imageUrl, isAvailable, order, dietaryTags, allergens, spiceLevel, ingredients, calories, containsAlcohol, containsPork, durationMinutes } = req.body;
    const item = await prisma.menuItem.create({
      data: {
        categoryId, name, description, price: parseFloat(price),
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
    const { id } = req.params;
    const { categoryId, name, description, price, imageUrl, isAvailable, order, dietaryTags, allergens, spiceLevel, ingredients, calories, containsAlcohol, containsPork, durationMinutes } = req.body;
    const item = await prisma.menuItem.update({
      where: { id },
      data: {
        categoryId, name, description, price: price !== undefined ? parseFloat(price) : undefined,
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
    const { id } = req.params;
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