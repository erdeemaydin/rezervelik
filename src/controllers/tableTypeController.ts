import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';

export const getTableTypes = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const tableTypes = await prisma.zone.findMany({
      where: { restaurantId },
      include: { tables: true, children: true }
    });
    return successResponse(res, tableTypes);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const createTableType = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { name, description, parentId } = req.body;

    if (!name) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Name is required' });
    }

    if (parentId) {
      const parentExists = await prisma.zone.findFirst({ where: { id: parentId, restaurantId } });
      if (!parentExists) return errorResponse(res, 'errors.validation_error', 400, { message: 'Invalid parent zone' });
    }

    const tableType = await prisma.zone.create({
      data: { name, description, parentId, restaurantId }
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
    const { name, description, parentId } = req.body;

    const existingType = await prisma.zone.findFirst({
      where: { id, restaurantId }
    });

    if (!existingType) return errorResponse(res, 'errors.validation_error', 404, { message: 'TableType not found' });

    if (parentId !== undefined && parentId !== null) {
      if (parentId === id) return errorResponse(res, 'errors.validation_error', 400, { message: 'Cannot be parent of itself' });
      const parentExists = await prisma.zone.findFirst({ where: { id: parentId, restaurantId } });
      if (!parentExists) return errorResponse(res, 'errors.validation_error', 400, { message: 'Invalid parent zone' });

      // Bug fix: only a direct self-parent (parentId === id) was rejected —
      // a longer cycle (A's parent is B, B's parent is set to A) passed
      // straight through. Walk the candidate parent's own ancestor chain.
      let cursor: string | null = parentExists.parentId;
      for (let depth = 0; cursor && depth < 20; depth++) {
        if (cursor === id) {
          return errorResponse(res, 'errors.validation_error', 400, { message: 'This would create a zone cycle' });
        }
        const ancestor: { parentId: string | null } | null = await prisma.zone.findUnique({ where: { id: cursor }, select: { parentId: true } });
        cursor = ancestor?.parentId ?? null;
      }
    }

    const dataToUpdate: any = {};
    if (name !== undefined) dataToUpdate.name = name;
    if (description !== undefined) dataToUpdate.description = description;
    if (parentId !== undefined) dataToUpdate.parentId = parentId;

    const tableType = await prisma.zone.update({
      where: { id },
      data: dataToUpdate
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

    const existingType = await prisma.zone.findFirst({
      where: { id, restaurantId }
    });

    if (!existingType) return errorResponse(res, 'errors.validation_error', 404, { message: 'TableType not found' });

    await prisma.zone.delete({ where: { id } });

    return successResponse(res, { message: 'Deleted successfully' });
  } catch (error: any) {
    // Bug fix: deleting a zone that still has tables (BookableResource) or
    // child zones assigned throws Prisma P2003 (FK constraint), which fell
    // through to a raw 500 instead of a clean, actionable 400.
    if (error?.code === 'P2003') {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'This zone still has tables or sub-zones assigned — remove them first' });
    }
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
