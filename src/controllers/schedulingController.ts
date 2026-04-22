import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';

// --- SHIFTS MANAGEMENT (Tenant Admin / Manager) ---

export const getShifts = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const shifts = await prisma.shift.findMany({
      where: { restaurantId },
      orderBy: { startTime: 'asc' }
    });
    return successResponse(res, shifts);
  } catch (error) {
    console.error('Get shifts error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const createShift = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { name, startTime, endTime, requiredStaff } = req.body;

    if (!name || !startTime || !endTime) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Missing required fields' });
    }

    const shift = await prisma.shift.create({
      data: {
        restaurantId,
        name,
        startTime,
        endTime,
        requiredStaff: requiredStaff || 1
      }
    });

    return successResponse(res, shift, 'Shift created successfully', 201);
  } catch (error) {
    console.error('Create shift error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const updateShift = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { id } = req.params;
    const { name, startTime, endTime, requiredStaff } = req.body;

    const shift = await prisma.shift.findFirst({ where: { id, restaurantId } });
    if (!shift) {
      return errorResponse(res, 'errors.not_found', 404, { message: 'Shift not found' });
    }

    const updatedShift = await prisma.shift.update({
      where: { id },
      data: {
        name,
        startTime,
        endTime,
        requiredStaff
      }
    });

    return successResponse(res, updatedShift, 'Shift updated successfully');
  } catch (error) {
    console.error('Update shift error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const deleteShift = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { id } = req.params;

    const shift = await prisma.shift.findFirst({ where: { id, restaurantId } });
    if (!shift) {
      return errorResponse(res, 'errors.not_found', 404, { message: 'Shift not found' });
    }

    await prisma.shift.delete({ where: { id } });
    return successResponse(res, null, 'Shift deleted successfully');
  } catch (error) {
    console.error('Delete shift error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// --- AVAILABILITY MANAGEMENT (Employees) ---

export const getAvailabilities = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { startDate, endDate } = req.query; // YYYY-MM-DD
    
    // If Admin/Manager, can see everyone's availability
    // If Staff, can only see their own
    const isAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'MANAGER';
    const filterUserId = isAdmin ? req.query.userId as string : req.user?.userId;

    const whereClause: any = {
      shift: { restaurantId }
    };

    if (filterUserId) {
      whereClause.userId = filterUserId;
    }

    if (startDate && endDate) {
      whereClause.date = {
        gte: startDate as string,
        lte: endDate as string
      };
    } else if (startDate) {
      whereClause.date = startDate as string;
    }

    const availabilities = await prisma.employeeAvailability.findMany({
      where: whereClause,
      include: {
        shift: true,
        user: { select: { id: true, firstName: true, lastName: true } }
      }
    });

    return successResponse(res, availabilities);
  } catch (error) {
    console.error('Get availabilities error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const setAvailability = async (req: Request, res: Response) => {
  try {
    // Only the logged in user can set their own availability
    const userId = req.user?.userId!;
    const { shiftId, date, isAvailable, notes } = req.body;

    if (!shiftId || !date || isAvailable === undefined) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Missing required fields' });
    }

    // Verify shift belongs to the restaurant
    const shift = await prisma.shift.findFirst({
      where: { id: shiftId, restaurantId: req.restaurantId! }
    });

    if (!shift) {
      return errorResponse(res, 'errors.not_found', 404, { message: 'Shift not found' });
    }

    const availability = await prisma.employeeAvailability.upsert({
      where: {
        userId_shiftId_date: {
          userId,
          shiftId,
          date
        }
      },
      update: {
        isAvailable,
        notes
      },
      create: {
        userId,
        shiftId,
        date,
        isAvailable,
        notes
      }
    });

    return successResponse(res, availability, 'Availability saved successfully');
  } catch (error) {
    console.error('Set availability error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// --- SHIFT ASSIGNMENTS (Tenant Admin / Manager) ---

export const getAssignments = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { startDate, endDate, userId, shiftId } = req.query;
    
    const isAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'MANAGER';

    const whereClause: any = {
      shift: { restaurantId }
    };

    if (!isAdmin) {
      whereClause.isPublished = true;
    }

    if (userId) whereClause.userId = userId as string;
    if (shiftId) whereClause.shiftId = shiftId as string;
    
    if (startDate && endDate) {
      whereClause.date = {
        gte: startDate as string,
        lte: endDate as string
      };
    } else if (startDate) {
      whereClause.date = startDate as string;
    }

    const assignments = await prisma.shiftAssignment.findMany({
      where: whereClause,
      include: {
        shift: true,
        user: { select: { id: true, firstName: true, lastName: true } }
      }
    });

    return successResponse(res, assignments);
  } catch (error) {
    console.error('Get assignments error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const publishAssignments = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Missing required fields: startDate and endDate' });
    }

    // Publish all assignments within this date range for this restaurant
    const updated = await prisma.shiftAssignment.updateMany({
      where: {
        shift: { restaurantId },
        date: {
          gte: startDate,
          lte: endDate
        }
      },
      data: {
        isPublished: true
      }
    });

    return successResponse(res, { count: updated.count }, 'Assignments published successfully');
  } catch (error) {
    console.error('Publish assignments error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const assignShift = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { shiftId, userId, date } = req.body;

    if (!shiftId || !userId || !date) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Missing required fields' });
    }

    // Verify shift and user belong to the restaurant
    const shift = await prisma.shift.findFirst({ where: { id: shiftId, restaurantId } });
    if (!shift) return errorResponse(res, 'errors.not_found', 404, { message: 'Shift not found' });

    const user = await prisma.user.findFirst({ where: { id: userId, restaurantId } });
    if (!user) return errorResponse(res, 'errors.not_found', 404, { message: 'User not found' });

    const assignment = await prisma.shiftAssignment.create({
      data: {
        shiftId,
        userId,
        date
      }
    });

    return successResponse(res, assignment, 'Shift assigned successfully', 201);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Assignment already exists for this shift, user, and date' });
    }
    console.error('Assign shift error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const removeAssignment = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { id } = req.params;

    const assignment = await prisma.shiftAssignment.findFirst({
      where: { id, shift: { restaurantId } }
    });

    if (!assignment) {
      return errorResponse(res, 'errors.not_found', 404, { message: 'Assignment not found' });
    }

    await prisma.shiftAssignment.delete({ where: { id } });
    return successResponse(res, null, 'Assignment removed successfully');
  } catch (error) {
    console.error('Remove assignment error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
