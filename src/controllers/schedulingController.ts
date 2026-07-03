import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { sendShiftPlan } from '../services/notificationService';

// Grace window before the published plan is actually sent to staff over WhatsApp
// (#7.4) — lets the admin catch mistakes. In-process timer: fine for a single
// instance; a durable job queue should replace this in production.
const SHIFT_PUBLISH_DELAY_MS = parseInt(process.env.SHIFT_PUBLISH_DELAY_MS || '') || 5 * 60 * 1000;

const fmtDateRange = (from: string, to: string) => (from === to ? from : `${from} – ${to}`);

/**
 * After the grace delay, WhatsApp each staff member their own shifts for the
 * published range. Staff with no shifts in range are naturally skipped (we only
 * iterate assignment owners); staff without a phone are skipped with a log (#7.5/#7.6).
 */
function scheduleShiftPlanBroadcast(restaurantId: string, startDate: string, endDate: string) {
  setTimeout(async () => {
    try {
      const [restaurant, assignments] = await Promise.all([
        prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true } }),
        prisma.shiftAssignment.findMany({
          where: { shift: { restaurantId }, date: { gte: startDate, lte: endDate }, isPublished: true },
          include: { shift: true, user: true },
          orderBy: { date: 'asc' },
        }),
      ]);

      // Group each staff member's own shifts.
      const byUser = new Map<string, { user: any; lines: string[] }>();
      for (const a of assignments) {
        if (!a.user) continue;
        if (!byUser.has(a.userId)) byUser.set(a.userId, { user: a.user, lines: [] });
        byUser.get(a.userId)!.lines.push(`${a.date} — ${a.shift.name} (${a.shift.startTime}-${a.shift.endTime})`);
      }

      for (const { user, lines } of byUser.values()) {
        if (!user.phone) {
          console.warn(`[ShiftPlan] skipping ${user.firstName} ${user.lastName} — no phone on file`);
          continue;
        }
        await sendShiftPlan({
          staffPhone: user.phone,
          staffName: `${user.firstName} ${user.lastName}`,
          restaurantName: restaurant?.name || 'Restaurant',
          periodLabel: fmtDateRange(startDate, endDate),
          shiftLines: lines,
        });
      }
    } catch (e) {
      console.error('[ShiftPlan] broadcast failed', e);
    }
  }, SHIFT_PUBLISH_DELAY_MS);
}

// --- SHIFTS MANAGEMENT (Tenant Admin / Manager) ---

export const getShifts = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const shifts = await prisma.shift.findMany({
      where: { restaurantId },
      include: { dayRequirements: true },
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
    const { name, startTime, endTime, dayRequirements } = req.body;

    if (!name || !startTime || !endTime) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Missing required fields' });
    }

    const defaultDayRequirements = Array.from({ length: 7 }, (_, i) => ({
      dayOfWeek: i,
      requiredStaff: 1
    }));

    const shiftRequirements = dayRequirements || defaultDayRequirements;

    const shift = await prisma.shift.create({
      data: {
        restaurantId,
        name,
        startTime,
        endTime,
        dayRequirements: {
          create: shiftRequirements.map((req: any) => ({
            dayOfWeek: req.dayOfWeek,
            requiredStaff: req.requiredStaff || 1
          }))
        }
      },
      include: { dayRequirements: true }
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
    const { name, startTime, endTime, dayRequirements } = req.body;

    const shift = await prisma.shift.findFirst({ where: { id, restaurantId } });
    if (!shift) {
      return errorResponse(res, 'errors.not_found', 404, { message: 'Shift not found' });
    }

    const updatedShift = await prisma.$transaction(async (tx) => {
      // If dayRequirements are provided, update them. Otherwise leave them as is.
      if (dayRequirements) {
        await tx.shiftDayRequirement.deleteMany({
          where: { shiftId: id }
        });
        
        await tx.shiftDayRequirement.createMany({
          data: dayRequirements.map((req: any) => ({
            shiftId: id,
            dayOfWeek: req.dayOfWeek,
            requiredStaff: req.requiredStaff || 1
          }))
        });
      }

      return await tx.shift.update({
        where: { id },
        data: {
          name,
          startTime,
          endTime
        },
        include: { dayRequirements: true }
      });
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

    // Schedule the delayed WhatsApp broadcast to working staff (#7.2-#7.5).
    scheduleShiftPlanBroadcast(restaurantId, startDate, endDate);

    return successResponse(res, {
      count: updated.count,
      whatsappDelayMinutes: Math.round(SHIFT_PUBLISH_DELAY_MS / 60000),
    }, 'Assignments published successfully');
  } catch (error) {
    console.error('Publish assignments error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const unpublishAssignments = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Missing required fields: startDate and endDate' });
    }

    const updated = await prisma.shiftAssignment.updateMany({
      where: {
        shift: { restaurantId },
        date: {
          gte: startDate,
          lte: endDate
        }
      },
      data: {
        isPublished: false
      }
    });

    return successResponse(res, { count: updated.count }, 'Assignments unpublished successfully');
  } catch (error) {
    console.error('Unpublish assignments error:', error);
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
