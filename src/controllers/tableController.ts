import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';

export const getTables = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const tables = await prisma.table.findMany({
      where: { restaurantId },
      include: { tableType: true }
    });
    return successResponse(res, tables);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const createTable = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { tableTypeId, identifier, capacity, isAvailable } = req.body;

    if (!tableTypeId || !identifier || !capacity) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Required fields missing' });
    }

    const typeExists = await prisma.tableType.findFirst({
      where: { id: tableTypeId, restaurantId }
    });

    if (!typeExists) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Invalid TableType' });
    }

    const table = await prisma.table.create({
      data: {
        identifier,
        capacity,
        isAvailable: isAvailable ?? true,
        restaurantId,
        tableTypeId
      }
    });

    return successResponse(res, table, undefined, 201);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const updateTable = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { id } = req.params;
    const { tableTypeId, identifier, capacity, isAvailable } = req.body;

    const existingTable = await prisma.table.findFirst({
      where: { id, restaurantId }
    });

    if (!existingTable) return errorResponse(res, 'errors.validation_error', 404, { message: 'Table not found' });

    if (tableTypeId) {
      const typeExists = await prisma.tableType.findFirst({
        where: { id: tableTypeId, restaurantId }
      });
      if (!typeExists) return errorResponse(res, 'errors.validation_error', 400, { message: 'Invalid TableType' });
    }

    const table = await prisma.table.update({
      where: { id },
      data: { tableTypeId, identifier, capacity, isAvailable }
    });

    return successResponse(res, table);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const deleteTable = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { id } = req.params;

    const existingTable = await prisma.table.findFirst({
      where: { id, restaurantId }
    });

    if (!existingTable) return errorResponse(res, 'errors.validation_error', 404, { message: 'Table not found' });

    await prisma.table.delete({ where: { id } });

    return successResponse(res, { message: 'Deleted successfully' });
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
