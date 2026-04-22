import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';

export const getCategories = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const categories = await prisma.reservationCategory.findMany({
      where: { restaurantId, isActive: true }
    });
    return successResponse(res, categories);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const createCategory = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { name, color } = req.body;

    if (!name) return errorResponse(res, 'errors.validation_error', 400, { message: 'Name is required' });

    const category = await prisma.reservationCategory.create({
      data: { restaurantId, name, color }
    });
    return successResponse(res, category, 'Category created', 201);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const updateCategory = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { id } = req.params;
    const { name, color, isActive } = req.body;

    const category = await prisma.reservationCategory.update({
      where: { id, restaurantId },
      data: { name, color, isActive }
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

    await prisma.reservationCategory.delete({
      where: { id, restaurantId }
    });
    return successResponse(res, null, 'Category deleted');
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
