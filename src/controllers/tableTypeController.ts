import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';

export const getTableTypes = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const tableTypes = await prisma.tableType.findMany({
      where: { restaurantId },
      include: { tables: true }
    });
    return successResponse(res, tableTypes);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const createTableType = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { name, description } = req.body;

    if (!name) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Name is required' });
    }

    const tableType = await prisma.tableType.create({
      data: { name, description, restaurantId }
    });

    return successResponse(res, tableType, undefined, 201);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const updateTableType = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { id } = req.params;
    const { name, description } = req.body;

    const existingType = await prisma.tableType.findFirst({
      where: { id, restaurantId }
    });

    if (!existingType) return errorResponse(res, 'errors.validation_error', 404, { message: 'TableType not found' });

    const tableType = await prisma.tableType.update({
      where: { id },
      data: { name, description }
    });

    return successResponse(res, tableType);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const deleteTableType = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { id } = req.params;

    const existingType = await prisma.tableType.findFirst({
      where: { id, restaurantId }
    });

    if (!existingType) return errorResponse(res, 'errors.validation_error', 404, { message: 'TableType not found' });

    await prisma.tableType.delete({ where: { id } });

    return successResponse(res, { message: 'Deleted successfully' });
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
