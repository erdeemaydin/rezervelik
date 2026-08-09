import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { sendShiftPlan } from '../services/notificationService';

const addDays = (dateStr: string, delta: number): string => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
};

// A shift's occupied window on a given date, promoted to the next calendar day if
// endTime <= startTime (an overnight shift, e.g. 22:00-06:00).
const shiftWindow = (date: string, startTime: string, endTime: string) => {
  const start = new Date(`${date}T${startTime}:00`);
  let end = new Date(`${date}T${endTime}:00`);
  if (end.getTime() <= start.getTime()) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
};

export type ScheduleViolationType = 'DOUBLE_SHIFT' | 'CONSECUTIVE_REST' | 'UNAVAILABLE';
export interface ScheduleViolation { type: ScheduleViolationType; message: string }

/**
 * Authoritative, server-side version of the three hard rules the assigner UI has
 * always computed only for display (ShiftAssigner.tsx's assignmentWarnings memo):
 * DOUBLE_SHIFT (two shifts same day), CONSECUTIVE_REST (<11h between shifts, per
 * PROJECT_LOGIC.md §10), and UNAVAILABLE (staff explicitly marked not available for
 * this shift/date). The UI never sent these as a block — any direct API call could
 * silently create an assignment that violates all three. This mirrors that same
 * algorithm so the two stay in agreement.
 */
async function findAssignShiftViolations({
  restaurantId, shiftId, userId, date, tx,
}: { restaurantId: string; shiftId: string; userId: string; date: string; tx: Prisma.TransactionClient }): Promise<ScheduleViolation[]> {
  const shift = await tx.shift.findFirst({ where: { id: shiftId, restaurantId } });
  if (!shift) return [];

  const violations: ScheduleViolation[] = [];

  const availability = await tx.employeeAvailability.findUnique({
    where: { userId_shiftId_date: { userId, shiftId, date } },
  });
  if (availability && !availability.isAvailable) {
    violations.push({ type: 'UNAVAILABLE', message: 'Staff marked this day/shift as Unavailable.' });
  }

  // Only the day before/after can affect the 11h rest window around this shift.
  const neighbors = await tx.shiftAssignment.findMany({
    where: { userId, shift: { restaurantId }, date: { in: [addDays(date, -1), date, addDays(date, 1)] } },
    include: { shift: true },
  });

  if (neighbors.some(a => a.date === date && a.shiftId !== shiftId)) {
    violations.push({ type: 'DOUBLE_SHIFT', message: 'Staff already has another shift assigned that day.' });
  }

  const candidate = shiftWindow(date, shift.startTime, shift.endTime);
  for (const a of neighbors) {
    if (a.date === date) continue; // same-day handled as DOUBLE_SHIFT above
    const w = shiftWindow(a.date, a.shift.startTime, a.shift.endTime);
    // When w.start < candidate.end, this branch's `candidate.start - w.end` is
    // only ever negative if w.end > candidate.start too — i.e. the two
    // windows genuinely overlap in wall-clock time (this happens across an
    // adjacent-day boundary when one of the shifts is overnight, e.g. a
    // 22:00-06:00 shift on day 1 promoted to end on day 2, colliding with a
    // 02:00-10:00 shift assigned ON day 2 — DOUBLE_SHIFT's plain date-string
    // comparison never catches this since the two assignments sit on
    // different `date` values). A negative gap is strictly worse than the
    // 11h minimum, so it must still trip CONSECUTIVE_REST — bug fix: the old
    // `gapHours >= 0` guard excluded exactly this case, silently letting
    // staff be double-booked into two literally-overlapping shifts as long
    // as they're recorded on different calendar dates.
    const gapMs = w.start.getTime() >= candidate.end.getTime()
      ? w.start.getTime() - candidate.end.getTime()
      : candidate.start.getTime() - w.end.getTime();
    const gapHours = gapMs / (1000 * 60 * 60);
    if (gapHours < 11) {
      violations.push({
        type: 'CONSECUTIVE_REST',
        message: gapHours < 0
          ? `Shifts overlap by ${Math.round(-gapHours * 10) / 10}h.`
          : `Only ${Math.round(gapHours * 10) / 10}h off between shifts (minimum 11h required).`,
      });
      break;
    }
  }

  return violations;
}

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
    
    const isAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'MANAGER' || req.user?.role === 'SUPER_ADMIN';

    const whereClause: any = {
      shift: { restaurantId }
    };

    // Date range is shared by the visibility sub-query below, so build it first.
    if (startDate && endDate) {
      whereClause.date = { gte: startDate as string, lte: endDate as string };
    } else if (startDate) {
      whereClause.date = startDate as string;
    }

    if (shiftId) whereClause.shiftId = shiftId as string;

    if (isAdmin) {
      // Admins/managers may filter by any user and see draft + published rosters.
      if (userId) whereClause.userId = userId as string;
    } else {
      // Non-admins never see drafts, and the roster's privacy mode is enforced
      // here (not on the client) so shifts can't be pulled just by knowing the URL.
      whereClause.isPublished = true;
      const selfId = req.user!.userId;
      const settings = await prisma.restaurantSettings.findUnique({
        where: { restaurantId },
        select: { staffScheduleView: true }
      });
      const scheduleView = settings?.staffScheduleView || 'OWN_ONLY';

      if (scheduleView === 'OWN_ONLY') {
        // Only your own shifts — any client-supplied userId is ignored.
        whereClause.userId = selfId;
      } else if (scheduleView === 'SHIFT_TEAM') {
        // Only shifts you are on that day: find your own (shift, date) pairs, then
        // return every assignment sharing one of those pairs (you + teammates).
        const own = await prisma.shiftAssignment.findMany({
          where: {
            shift: { restaurantId },
            isPublished: true,
            userId: selfId,
            ...(whereClause.date ? { date: whereClause.date } : {})
          },
          select: { shiftId: true, date: true }
        });
        if (own.length === 0) {
          return successResponse(res, []);
        }
        whereClause.OR = own.map(o => ({ shiftId: o.shiftId, date: o.date }));
      }
      // FULL_ROSTER: no ownership filter — all published assignments are visible.
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
    const { shiftId, userId, date, force } = req.body;

    if (!shiftId || !userId || !date) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Missing required fields' });
    }

    // Verify shift and user belong to the restaurant
    const shift = await prisma.shift.findFirst({ where: { id: shiftId, restaurantId } });
    if (!shift) return errorResponse(res, 'errors.not_found', 404, { message: 'Shift not found' });

    const user = await prisma.user.findFirst({ where: { id: userId, restaurantId } });
    if (!user) return errorResponse(res, 'errors.not_found', 404, { message: 'User not found' });

    // Check-then-write inside a transaction so two concurrent assignments for the
    // same person can't both pass the violation check and both land.
    let assignment;
    try {
      assignment = await prisma.$transaction(async (tx) => {
        const violations = await findAssignShiftViolations({ restaurantId, shiftId, userId, date, tx });
        if (violations.length > 0 && !force) {
          throw Object.assign(new Error('SCHEDULE_VIOLATION'), { code: 'SCHEDULE_VIOLATION', violations });
        }
        return tx.shiftAssignment.create({ data: { shiftId, userId, date } });
      });
    } catch (txErr: any) {
      if (txErr?.code === 'SCHEDULE_VIOLATION') {
        return errorResponse(res, 'errors.schedule_violation', 409, { code: 'SCHEDULE_VIOLATION', violations: txErr.violations });
      }
      throw txErr;
    }

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
