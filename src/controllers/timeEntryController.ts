import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';

// Parse "HH:MM" to minutes-from-midnight, or null.
const toMinutes = (hhmm?: string | null): number | null => {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
};

// Worked minutes for one entry: (checkOut - checkIn) - break. Handles a shift that
// crosses midnight (checkOut < checkIn) by adding a day. Returns null if incomplete.
const entryWorkedMinutes = (checkIn?: string | null, checkOut?: string | null, breakMinutes = 0): number | null => {
  const inM = toMinutes(checkIn);
  const outM = toMinutes(checkOut);
  if (inM == null || outM == null) return null;
  let diff = outM - inM;
  if (diff < 0) diff += 24 * 60;
  return Math.max(0, diff - (breakMinutes || 0));
};

// Only ADMIN/MANAGER may act for other staff; everyone else is scoped to self.
const resolveUserId = (req: Request, requested?: string): string => {
  const role = req.user?.role;
  const isManager = role === 'ADMIN' || role === 'MANAGER' || role === 'SUPER_ADMIN';
  if (isManager && requested) return requested;
  return req.user!.userId;
};

export const getTimeEntries = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { from, to, userId, all } = req.query as Record<string, string>;
    const role = req.user?.role;
    const isManager = role === 'ADMIN' || role === 'MANAGER' || role === 'SUPER_ADMIN';
    // Managers can request every staff member's entries at once (all=1) to drive
    // the shared schedule view; otherwise entries are scoped to a single user.
    const wantsAll = isManager && (all === '1' || all === 'true');
    const targetUserId = wantsAll ? undefined : resolveUserId(req, userId);

    const entries = await prisma.timeEntry.findMany({
      where: {
        restaurantId,
        ...(targetUserId ? { userId: targetUserId } : {}),
        ...(from && to ? { date: { gte: from, lte: to } } : {}),
      },
      orderBy: { date: 'desc' },
    });

    return successResponse(res, entries);
  } catch (error) {
    console.error('Get time entries error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// Create or update the entry for a user on a given date (+optional shift).
export const upsertTimeEntry = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { date, shiftId, checkIn, checkOut, breakMinutes, note, userId } = req.body;
    if (!date) return errorResponse(res, 'errors.validation_error', 400, { message: 'date is required' });

    const targetUserId = resolveUserId(req, userId);

    const entry = await prisma.timeEntry.upsert({
      where: { userId_date_shiftId: { userId: targetUserId, date, shiftId: shiftId || null } },
      create: {
        restaurantId, userId: targetUserId, date, shiftId: shiftId || null,
        checkIn: checkIn || null, checkOut: checkOut || null,
        breakMinutes: breakMinutes ? parseInt(breakMinutes) : 0,
        source: 'MANUAL', note: note || null,
      },
      update: {
        checkIn: checkIn || null, checkOut: checkOut || null,
        breakMinutes: breakMinutes ? parseInt(breakMinutes) : 0,
        note: note || null,
      },
    });

    return successResponse(res, entry);
  } catch (error) {
    console.error('Upsert time entry error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const deleteTimeEntry = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { id } = req.params;
    const existing = await prisma.timeEntry.findFirst({ where: { id, restaurantId } });
    if (!existing) return errorResponse(res, 'errors.validation_error', 404, { message: 'Not found' });
    // Staff may only delete their own entries.
    if (existing.userId !== resolveUserId(req, existing.userId)) {
      return errorResponse(res, 'errors.unauthorized', 403);
    }
    await prisma.timeEntry.delete({ where: { id } });
    return successResponse(res, null, 'Deleted');
  } catch (error) {
    console.error('Delete time entry error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// Worked-hours summary over a range. For each shift assignment in the window we
// use the actual TimeEntry when present, otherwise fall back to the scheduled
// shift's defined duration (#7.10). Managers get all staff; others only self.
export const getWorkedHoursSummary = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { from, to, userId } = req.query as Record<string, string>;
    if (!from || !to) return errorResponse(res, 'errors.validation_error', 400, { message: 'from and to are required' });

    const role = req.user?.role;
    const isManager = role === 'ADMIN' || role === 'MANAGER' || role === 'SUPER_ADMIN';
    const scopeUserId = isManager ? (userId || undefined) : req.user!.userId;

    const [assignments, entries, users, settings] = await Promise.all([
      prisma.shiftAssignment.findMany({
        where: {
          date: { gte: from, lte: to },
          shift: { restaurantId },
          ...(scopeUserId ? { userId: scopeUserId } : {}),
        },
        include: { shift: true },
      }),
      prisma.timeEntry.findMany({
        where: { restaurantId, date: { gte: from, lte: to }, ...(scopeUserId ? { userId: scopeUserId } : {}) },
      }),
      prisma.user.findMany({
        where: { restaurantId, role: { not: 'SUPER_ADMIN' }, ...(scopeUserId ? { id: scopeUserId } : {}) },
        select: { id: true, firstName: true, lastName: true },
      }),
      prisma.restaurantSettings.findUnique({ where: { restaurantId }, select: { defaultBreakMinutes: true } }),
    ]);

    // Default break deducted from a scheduled shift with no explicit entry (#break).
    const defaultBreak = settings?.defaultBreakMinutes || 0;

    // Index actual entries by user|date|shift for quick lookup.
    const entryKey = (uId: string, date: string, sId: string | null) => `${uId}|${date}|${sId || ''}`;
    const entryMap = new Map<string, typeof entries[number]>();
    for (const e of entries) entryMap.set(entryKey(e.userId, e.date, e.shiftId), e);

    const totals = new Map<string, { actualMinutes: number; scheduledMinutes: number; estimatedCount: number }>();
    const bump = (uId: string) => {
      if (!totals.has(uId)) totals.set(uId, { actualMinutes: 0, scheduledMinutes: 0, estimatedCount: 0 });
      return totals.get(uId)!;
    };

    for (const a of assignments) {
      // Expected worked time for the shift = its length minus the default break.
      const scheduled = entryWorkedMinutes(a.shift.startTime, a.shift.endTime, defaultBreak) ?? 0;
      const t = bump(a.userId);
      t.scheduledMinutes += scheduled;
      const entry = entryMap.get(entryKey(a.userId, a.date, a.shiftId));
      const actual = entry ? entryWorkedMinutes(entry.checkIn, entry.checkOut, entry.breakMinutes) : null;
      if (actual != null) {
        t.actualMinutes += actual;
      } else {
        // No (complete) entry → assume the scheduled shift duration (#7.10).
        t.actualMinutes += scheduled;
        t.estimatedCount += 1;
      }
    }

    const nameById = new Map(users.map(u => [u.id, `${u.firstName} ${u.lastName}`]));
    const summary = Array.from(totals.entries()).map(([uId, v]) => ({
      userId: uId,
      name: nameById.get(uId) || uId,
      workedMinutes: v.actualMinutes,
      workedHours: Math.round((v.actualMinutes / 60) * 10) / 10,
      scheduledMinutes: v.scheduledMinutes,
      scheduledHours: Math.round((v.scheduledMinutes / 60) * 10) / 10,
      estimatedShifts: v.estimatedCount,
    }));

    return successResponse(res, { from, to, summary });
  } catch (error) {
    console.error('Worked hours summary error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
