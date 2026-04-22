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
    const { name, isActive } = req.body;
    const menu = await prisma.menu.create({
      data: { restaurantId, name, isActive }
    });
    return successResponse(res, menu, undefined, 201);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const updateMenu = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, isActive } = req.body;
    const menu = await prisma.menu.update({
      where: { id },
      data: { name, isActive }
    });
    return successResponse(res, menu);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

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
    // Prisma cascading might need to handle children, or we manual delete
    // For sqlite, let's just use Prisma's delete
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
    const { name, description, price, imageUrl, isAvailable, order, dietaryTags, allergens, spiceLevel } = req.body;
    const item = await prisma.menuItem.create({
      data: { 
        categoryId, name, description, price: parseFloat(price), 
        imageUrl, isAvailable, order: order || 0,
        dietaryTags, allergens, spiceLevel: spiceLevel ? parseInt(spiceLevel) : 0
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
    const { categoryId, name, description, price, imageUrl, isAvailable, order, dietaryTags, allergens, spiceLevel } = req.body;
    const item = await prisma.menuItem.update({
      where: { id },
      data: { 
        categoryId, name, description, price: price !== undefined ? parseFloat(price) : undefined, 
        imageUrl, isAvailable, order,
        dietaryTags, allergens, spiceLevel: spiceLevel !== undefined ? parseInt(spiceLevel) : undefined
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