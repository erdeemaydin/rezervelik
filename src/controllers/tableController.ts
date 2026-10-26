import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { INVALID, parseCount } from '../utils/numeric';

export const getTables = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const tables = await prisma.bookableResource.findMany({
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
    const { tableTypeId, identifier, capacity, isAvailable, positionX, positionY, shape, width, height, color } = req.body;

    if (!tableTypeId || !identifier || !capacity) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Required fields missing' });
    }
    // Bug fix: `!capacity` only rejected 0/falsy — capacity: -5 is truthy and
    // passed straight through into party-size-fit matching (findAvailableTable).
    const parsedCapacity = parseCount(capacity, 0, 1);
    if (parsedCapacity === INVALID) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'capacity must be a positive integer' });
    }

    const typeExists = await prisma.zone.findFirst({
      where: { id: tableTypeId, restaurantId }
    });

    if (!typeExists) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Invalid TableType' });
    }

    const table = await prisma.bookableResource.create({
      data: {
        identifier,
        capacity: parsedCapacity,
        isAvailable: isAvailable ?? true,
        restaurantId,
        tableTypeId,
        positionX: positionX ?? 0,
        positionY: positionY ?? 0,
        shape: shape ?? 'rectangle',
        width: width ?? 80,
        height: height ?? 80,
        color: color ?? '#ffffff'
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
    const { tableTypeId, identifier, capacity, isAvailable, positionX, positionY, shape, width, height, color } = req.body;

    const existingTable = await prisma.bookableResource.findFirst({
      where: { id, restaurantId }
    });

    if (!existingTable) return errorResponse(res, 'errors.validation_error', 404, { message: 'Table not found' });

    if (tableTypeId) {
      const typeExists = await prisma.zone.findFirst({
        where: { id: tableTypeId, restaurantId }
      });
      if (!typeExists) return errorResponse(res, 'errors.validation_error', 400, { message: 'Invalid TableType' });
    }

    const dataToUpdate: any = {};
    if (tableTypeId !== undefined) dataToUpdate.tableTypeId = tableTypeId;
    if (identifier !== undefined) dataToUpdate.identifier = identifier;
    if (capacity !== undefined) {
      const parsedCapacity = parseCount(capacity, 0, 1);
      if (parsedCapacity === INVALID) {
        return errorResponse(res, 'errors.validation_error', 400, { message: 'capacity must be a positive integer' });
      }
      dataToUpdate.capacity = parsedCapacity;
    }
    if (isAvailable !== undefined) dataToUpdate.isAvailable = isAvailable;
    if (positionX !== undefined) dataToUpdate.positionX = positionX;
    if (positionY !== undefined) dataToUpdate.positionY = positionY;
    if (shape !== undefined) dataToUpdate.shape = shape;
    if (width !== undefined) dataToUpdate.width = width;
    if (height !== undefined) dataToUpdate.height = height;
    if (color !== undefined) dataToUpdate.color = color;

    const table = await prisma.bookableResource.update({
      where: { id },
      data: dataToUpdate
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

    const existingTable = await prisma.bookableResource.findFirst({
      where: { id, restaurantId }
    });

    if (!existingTable) return errorResponse(res, 'errors.validation_error', 404, { message: 'Table not found' });

    await prisma.bookableResource.delete({ where: { id } });

    return successResponse(res, { message: 'Deleted successfully' });
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
