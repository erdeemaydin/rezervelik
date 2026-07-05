import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';

export const getFloorElements = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const elements = await prisma.floorElement.findMany({
      where: { restaurantId }
    });
    return successResponse(res, elements);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const createFloorElement = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { tableTypeId, type, label, positionX, positionY, width, height, color } = req.body;

    if (!tableTypeId) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'tableTypeId is required' });
    }

    const typeExists = await prisma.zone.findFirst({
      where: { id: tableTypeId, restaurantId }
    });

    if (!typeExists) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Invalid TableType zone' });
    }

    const element = await prisma.floorElement.create({
      data: {
        restaurantId,
        tableTypeId,
        type: type || 'box',
        label,
        positionX: positionX ?? 0,
        positionY: positionY ?? 0,
        width: width ?? 200,
        height: height ?? 200,
        color: color ?? '#f8fafc'
      }
    });

    return successResponse(res, element, undefined, 201);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const updateFloorElement = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { id } = req.params;
    const { tableTypeId, type, label, positionX, positionY, width, height, color } = req.body;

    const existingElement = await prisma.floorElement.findFirst({
      where: { id, restaurantId }
    });

    if (!existingElement) return errorResponse(res, 'errors.validation_error', 404, { message: 'Element not found' });

    if (tableTypeId) {
      const typeExists = await prisma.zone.findFirst({
        where: { id: tableTypeId, restaurantId }
      });
      if (!typeExists) return errorResponse(res, 'errors.validation_error', 400, { message: 'Invalid TableType zone' });
    }

    const dataToUpdate: any = {};
    if (tableTypeId !== undefined) dataToUpdate.tableTypeId = tableTypeId;
    if (type !== undefined) dataToUpdate.type = type;
    if (label !== undefined) dataToUpdate.label = label;
    if (positionX !== undefined) dataToUpdate.positionX = positionX;
    if (positionY !== undefined) dataToUpdate.positionY = positionY;
    if (width !== undefined) dataToUpdate.width = width;
    if (height !== undefined) dataToUpdate.height = height;
    if (color !== undefined) dataToUpdate.color = color;

    const element = await prisma.floorElement.update({
      where: { id },
      data: dataToUpdate
    });

    return successResponse(res, element);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const deleteFloorElement = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { id } = req.params;

    const existingElement = await prisma.floorElement.findFirst({
      where: { id, restaurantId }
    });

    if (!existingElement) return errorResponse(res, 'errors.validation_error', 404, { message: 'Element not found' });

    await prisma.floorElement.delete({ where: { id } });

    return successResponse(res, { message: 'Deleted successfully' });
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
